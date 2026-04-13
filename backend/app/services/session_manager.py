import uuid
import logging
import json
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_, delete

from app.models.session import (
    TeachingSession,
    SessionStudent,
    SessionStatus,
    SessionType,
    AIConfigModel,
    CreateSessionRequest,
)
from app.models.user import User, TeacherProfile
from app.models.subject import Subject, Topic
from app.models.student import StudentProfile
from app.models.notification import Notification
from app.services.livekit_service import livekit_service
from app.services.llm_service import llm_service
from app.services.engagement_tracker import engagement_tracker
from app.services.ai_coordinator import ai_coordinator
from app.models.student_progress import StudentSubjectProgress

logger = logging.getLogger(__name__)


class SessionManager:
    """
    Manages the lifecycle of a teaching session
    Handles: create, start, pause, resume, end, continuity
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.livekit_service = livekit_service

    async def is_student_enrolled(
        self, session_id: str, student_id: str
    ) -> tuple[bool, str]:
        """
        Check if student is enrolled in session using relational table as source of truth.

        Returns:
            tuple: (is_enrolled, source) where source is 'db', 'legacy_context', or 'none'
        """
        try:
            # PRIMARY: Check relational session_students table
            stmt = select(SessionStudent).filter(
                SessionStudent.session_id == uuid.UUID(session_id),
                SessionStudent.student_id == uuid.UUID(student_id),
                SessionStudent.status.in_(["invited", "enrolled", "active"]),
            )
            result = await self.db.execute(stmt)
            enrollment = result.scalars().first()

            if enrollment:
                logger.info(
                    f"[auth] Student {student_id} enrolled in session {session_id} via DB"
                )
                return True, "db"

            # SECONDARY: Fallback to legacy context for old sessions
            session = await self._get_session(session_id)
            if session:
                legacy_enrolled = session.context.get("enrolled_students", [])
                if str(student_id) in legacy_enrolled:
                    logger.warning(
                        f"[auth] Student {student_id} enrolled in session {session_id} via LEGACY context fallback"
                    )
                    return True, "legacy_context"

            logger.info(
                f"[auth] Student {student_id} NOT enrolled in session {session_id}"
            )
            return False, "none"

        except Exception as e:
            logger.error(f"[auth] Error checking enrollment: {e}")
            return False, "none"

    async def create_session(
        self, teacher_id: str, request: CreateSessionRequest, background_tasks: Optional[BackgroundTasks] = None
    ) -> TeachingSession:
        """
        Create a new teaching session with all context
        """
        logger.info(f"Creating session for teacher {teacher_id}")

        # Build session context
        context = await self._build_context(
            teacher_id=teacher_id,
            subject_id=request.subject_id,
            topic_id=request.topic_id,
            student_ids=request.student_ids,
            previous_session_id=request.previous_session_id,
        )

        # Set AI config with defaults
        ai_config = request.ai_config
        if not ai_config:
            ai_config = AIConfigModel()

        # Set scheduled time
        scheduled_start = request.scheduled_start
        if not scheduled_start:
            scheduled_start = datetime.now(timezone.utc) + timedelta(hours=1)

        # Create session
        session = TeachingSession(
            id=uuid.uuid4(),
            teacher_id=uuid.UUID(teacher_id),
            title=request.title,
            subject_id=uuid.UUID(request.subject_id) if request.subject_id else None,
            topic_id=uuid.UUID(request.topic_id) if request.topic_id else None,
            session_type=SessionType.LIVE_TEACHING.value,
            status=SessionStatus.SCHEDULED.value,
            ai_config=ai_config.dict(),
            scheduled_start=scheduled_start,
            duration_minutes=request.duration_minutes,
            context=context,
            transcript=[],
            key_moments=[],
            explanations_generated=[],
            videos_suggested=[],
            student_presence={},
            engagement_timeline=[],
            assignments_generated=[],
        )

        # Generate pre-session quiz
        pre_quiz = await self._generate_pre_session_quiz(session)
        session.pre_session_quiz = pre_quiz

        # Ensure we have students to enroll
        students_to_enroll = request.student_ids if request.student_ids else []

        # If no specific students provided, auto-enroll teacher's linked students
        if not students_to_enroll:
            logger.info(
                f"No students specified for session, auto-enrolling teacher's linked students"
            )

            from app.models.user import TeacherStudent

            stmt = select(TeacherStudent.student_id).filter(
                TeacherStudent.teacher_id == uuid.UUID(teacher_id),
                TeacherStudent.status == "active",
            )
            result = await self.db.execute(stmt)
            students_to_enroll = [str(row[0]) for row in result.fetchall()]
            logger.info(f"Auto-enrolled {len(students_to_enroll)} students for session")

        # Generate student access code if students are assigned
        if students_to_enroll and len(students_to_enroll) > 0:
            import random
            import string

            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
            session.student_access_code = code
            session.student_access_enabled = True

        # Save to database
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        # Enroll students (using relational table, NOT context)
        for student_id in students_to_enroll:
            enrollment = SessionStudent(
                id=uuid.uuid4(),
                session_id=session.id,
                student_id=uuid.UUID(student_id),
                status="invited",
            )
            self.db.add(enrollment)

            # Create notification for student
            notification = Notification(
                id=uuid.uuid4(),
                user_id=uuid.UUID(student_id),
                type="session_scheduled",
                title=f"New Session: {session.context.get('subject', 'Live Class')}",
                message=f"A new session on '{session.context.get('topic', 'General Session')}' has been scheduled for {scheduled_start.strftime('%Y-%m-%d %H:%M')}.",
                link=f"/sessions/{session.id}",
                created_at=datetime.now(timezone.utc),
            )
            self.db.add(notification)


        await self.db.commit()

        # Try scheduling eager generation of smart materials
        if background_tasks and session.subject_id and students_to_enroll:
            student_id = students_to_enroll[0]
            background_tasks.add_task(
                self._eagerly_prepare_smart_lesson_bg,
                str(session.id),
                student_id
            )

        logger.info(f"Session {session.id} created successfully")
        return session

    async def _eagerly_prepare_smart_lesson_bg(self, session_id: str, student_id: str):
        """Background task to fully generate lesson outline and pop quiz, ready before live session starts."""
        from app.db.database import AsyncSessionLocal
        
        async with AsyncSessionLocal() as bg_db:
            try:
                # Get the latest context
                manager = SessionManager(bg_db)
                session = await manager._get_session(session_id)
                if not session or not session.subject_id:
                    return

                # Get student progress
                stmt = select(StudentSubjectProgress).filter(
                    StudentSubjectProgress.student_id == uuid.UUID(student_id),
                    StudentSubjectProgress.subject_id == session.subject_id
                )
                result = await bg_db.execute(stmt)
                progress = result.scalars().first()
                
                # Get student info
                user_stmt = select(User).filter(User.id == uuid.UUID(student_id))
                user_res = await bg_db.execute(user_stmt)
                student = user_res.scalars().first()
                
                if student:
                    ai_settings = session.ai_config or {}
                    prep_data = await ai_coordinator.generate_smart_prep(
                        student_name=student.full_name or "Student",
                        education_level=student.education_level or "Secondary",
                        subject=session.context.get("subject", "General Topic"),
                        topic=session.context.get("topic", "Overview"),
                        proficiency=progress.overall_mastery if progress else 0.5,
                        generate_assignments=ai_settings.get("generate_assignments", True),
                        suggest_videos=ai_settings.get("suggest_videos", True)
                    )
                    
                    # Merge data into context dictionary
                    updated_context = dict(session.context)
                    updated_context["active_pop_quiz"] = prep_data.get("pop_quiz")
                    updated_context["active_notes"] = prep_data.get("lesson_outline")
                    updated_context["active_assignments"] = prep_data.get("assignments")
                    
                    session.context = updated_context
                    bg_db.add(session)
                    await bg_db.commit()
                    logger.info(f"Successfully eager-generated smart lesson context for {session_id}")
            except Exception as e:
                logger.error(f"Background eager preparation failed: {e}")

    async def start_session(self, session_id: str) -> TeachingSession:
        """
        Start a live teaching session
        - Initialize video room (LiveKit)
        - Start AI services (STT if enabled)
        - Begin engagement tracking
        - Deliver revision from previous session
        """
        logger.info(f"Starting session {session_id}")

        try:
            session = await self._get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            if session.status != SessionStatus.SCHEDULED.value:
                raise ValueError(f"Cannot start session with status: {session.status}")

            # Update status
            session.status = SessionStatus.LIVE.value
            session.actual_start = datetime.now(timezone.utc)

            # Create LiveKit room
            room_name = f"edunexus-session-{session_id}"
            session.livekit_room_name = room_name

            # Initialize LiveKit room
            try:
                # Get participant count from relational table
                stmt = select(SessionStudent).filter(
                    SessionStudent.session_id == session.id
                )
                result = await self.db.execute(stmt)
                enrolled_students = result.scalars().all()
                room_config = await self.livekit_service.create_room(
                    room_name=room_name,
                    max_participants=len(enrolled_students) + 1,  # +1 for teacher
                    empty_timeout=600,  # 10 minutes - prevents premature room deletion
                    departure_timeout=30,  # 30 seconds for participant departure
                )
                logger.info(f"LiveKit room created: {room_name}")
            except Exception as e:
                logger.error(f"Failed to create LiveKit room: {e}")
                # Continue without video - session can still work
                room_config = {"mock": True, "room_name": room_name}

            # Generate revision material if there's previous session
            if session.context.get("revision_points"):
                revision_content = await self._generate_revision_content(session)
                session.revision_material = revision_content

            # Update student statuses to "invited"
            res_exec = await self.db.execute(
                select(SessionStudent).filter(SessionStudent.session_id == session.id)
            )
            enrollments = res_exec.scalars().all()
            for enrollment in enrollments:
                enrollment.status = "invited"
                session.student_presence[str(enrollment.student_id)] = {
                    "student_id": str(enrollment.student_id),
                    "joined_at": None,
                    "last_active": datetime.now(timezone.utc).isoformat(),
                    "attention_score": 100.0,
                    "participation_count": 0,
                    "questions_asked": 0,
                    "answers_given": 0,
                    "tab_switches": 0,
                    "is_camera_on": False,
                    "is_mic_on": False,
                }

            session.updated_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(session)

            logger.info(f"Session {session_id} started successfully")

            # Start engagement tracking
            await engagement_tracker.start_tracking(str(session.id))
            return session
        except Exception as e:
            logger.error(
                f"Session start failed for {session_id}: {type(e).__name__}: {str(e)}"
            )
            raise

    async def end_session(self, session_id: str) -> TeachingSession:
        """
        End a session and generate post-session content
        - Generate session summary
        - Create assignments
        - Prepare revision points for next session
        - Generate comprehensive class notes
        - Save session history
        """
        logger.info(f"Ending session {session_id}")

        session = await self._get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if session.status not in [SessionStatus.LIVE.value, SessionStatus.PAUSED.value]:
            raise ValueError(f"Cannot end session with status: {session.status}")

        session.status = SessionStatus.ENDED.value
        session.actual_end = datetime.now(timezone.utc)

        # Calculate actual duration
        if session.actual_start:
            duration = session.actual_end - session.actual_start
            session.duration_minutes = int(duration.total_seconds() / 60)

        # Update student enrollments
        res_enroll = await self.db.execute(
            select(SessionStudent).filter(SessionStudent.session_id == session.id)
        )
        enrollments = res_enroll.scalars().all()
        for enrollment in enrollments:
            enrollment.status = "completed"
            if enrollment.joined_at:
                enrollment.left_at = datetime.now(timezone.utc)
                # Calculate attendance percentage
                if session.actual_start and session.actual_end:
                    session_duration = (
                        session.actual_end - session.actual_start
                    ).total_seconds()
                    attended_duration = (
                        enrollment.left_at - enrollment.joined_at
                    ).total_seconds()
                    enrollment.attendance_percentage = min(
                        100.0, (attended_duration / session_duration) * 100
                    )

        # Generate session summary
        try:
            session.session_summary = await self._generate_session_summary(session)
        except Exception as e:
            logger.error(f"Failed to generate session summary: {e}")
            session.session_summary = "Session summary generation failed."

        # Generate post-session content (quiz and assignment)
        try:
            end_content = await self._generate_end_session_content(session)
            session.post_session_quiz = end_content.get("post_quiz")
            session.take_home_assignment = end_content.get("assignment")
        except Exception as e:
            logger.error(f"Failed to generate end session content: {e}")

        # Extract continuity points for next session
        try:
            session.continuity_notes = await self._extract_continuity_points(session)
        except Exception as e:
            logger.error(f"Failed to extract continuity: {e}")

        # Generate Class Notes for review
        try:
            session.class_notes = await self._generate_class_notes(session)
        except Exception as e:
            logger.error(f"Failed to generate class notes: {e}")

        session.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(session)

        # Stop tracking and get report
        try:
            report = await engagement_tracker.stop_tracking(str(session.id))
            session.engagement_report = report
            await self.db.commit()
        except Exception as e:
            logger.error(f"Failed to finalize engagement report: {e}")

        logger.info(f"Session {session_id} ended successfully")
        return session

    async def get_last_session_for_context(
        self, teacher_id: str, subject_id: str, student_ids: List[str]
    ) -> Optional[TeachingSession]:
        """Find the most recent session for this teacher, subject and student group"""
        # We look for sessions that have at least one overlapping student
        stmt = (
            select(TeachingSession)
            .join(SessionStudent)
            .filter(
                TeachingSession.teacher_id == uuid.UUID(teacher_id),
                TeachingSession.subject_id == uuid.UUID(subject_id),
                TeachingSession.status == SessionStatus.ENDED.value,
                SessionStudent.student_id.in_([uuid.UUID(sid) for sid in student_ids]),
            )
        )

        res_exec = await self.db.execute(
            stmt.order_by(desc(TeachingSession.actual_end))
        )
        return res_exec.scalars().first()

    async def pause_session(self, session_id: str) -> TeachingSession:
        """Pause a live session"""
        session = await self._get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if session.status != SessionStatus.LIVE.value:
            raise ValueError(f"Cannot pause session with status: {session.status}")

        session.status = SessionStatus.PAUSED.value
        session.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(session)

        logger.info(f"Session {session_id} paused")
        return session

    async def resume_session(self, session_id: str) -> TeachingSession:
        """Resume a paused session"""
        session = await self._get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if session.status != SessionStatus.PAUSED.value:
            raise ValueError(f"Cannot resume session with status: {session.status}")

        session.status = SessionStatus.LIVE.value
        session.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(session)

        logger.info(f"Session {session_id} resumed")
        return session

    async def prepare_smart_lesson(
        self, teacher_id: str, student_id: str, subject_id: str
    ) -> Dict[str, Any]:
        """
        Prepare lesson materials based on student's current progress.
        """
        logger.info(f"Preparing smart lesson for student {student_id} in subject {subject_id}")

        # 1. Get student progress
        stmt = select(StudentSubjectProgress).filter(
            StudentSubjectProgress.student_id == uuid.UUID(student_id),
            StudentSubjectProgress.subject_id == uuid.UUID(subject_id)
        )
        result = await self.db.execute(stmt)
        progress = result.scalars().first()

        # 2. Get Student and Subject details for context
        user_stmt = select(User).filter(User.id == uuid.UUID(student_id))
        user_res = await self.db.execute(user_stmt)
        student = user_res.scalars().first()

        subj_stmt = select(Subject).filter(Subject.id == uuid.UUID(subject_id))
        subj_res = await self.db.execute(subj_stmt)
        subject = subj_res.scalars().first()

        if not student or not subject:
            raise ValueError("Student or Subject not found")

        # 3. Determine current topic
        current_topic_name = "Introduction"
        if progress and progress.current_topic_id:
            topic_stmt = select(Topic).filter(Topic.id == progress.current_topic_id)
            topic_res = await self.db.execute(topic_stmt)
            topic = topic_res.scalars().first()
            if topic:
                current_topic_name = topic.name

        # 4. Call AI Coordinator to generate materials
        prep_data = await ai_coordinator.generate_smart_prep(
            student_name=student.full_name or "Student",
            education_level=student.education_level or "Secondary",
            subject=subject.name,
            topic=current_topic_name,
            proficiency=progress.overall_mastery if progress else 0.5
        )

        return {
            "success": True,
            "student_id": student_id,
            "subject_id": subject_id,
            "topic": current_topic_name,
            "materials": prep_data
        }

    async def submit_live_quiz(
        self, session_id: str, student_id: str, answers: Dict[int, int]
    ) -> Dict[str, Any]:
        """
        Submit and auto-grade a live pop quiz pushed by the teacher.
        """
        session = await self._get_session(session_id)
        if not session:
            raise ValueError("Session not found")

        # Get the quiz from session context (where we'll store pushed quizzes)
        quiz = session.context.get("active_pop_quiz")
        if not quiz:
            raise ValueError("No active pop quiz found for this session")

        questions = quiz.get("questions", [])
        total = len(questions)
        correct = 0
        details = []

        for i, q in enumerate(questions):
            student_ans = answers.get(i) or answers.get(str(i))
            is_correct = student_ans == q.get("correct_index")
            if is_correct:
                correct += 1
            details.append({
                "question": q.get("text"),
                "student_answer": student_ans,
                "correct_answer": q.get("correct_index"),
                "is_correct": is_correct,
                "explanation": q.get("explanation")
            })

        score = (correct / total * 100) if total > 0 else 0

        # Update session quiz results
        if "live_quizzes" not in session.quiz_results:
            session.quiz_results["live_quizzes"] = {}
        
        session.quiz_results["live_quizzes"][str(student_id)] = {
            "score": score,
            "correct": correct,
            "total": total,
            "submitted_at": datetime.now(timezone.utc).isoformat()
        }

        # Force update
        session.quiz_results = dict(session.quiz_results)
        await self.db.commit()

        return {
            "score": score,
            "correct": correct,
            "total": total,
            "details": details
        }

    async def student_join(self, session_id: str, student_id: str) -> TeachingSession:
        """Record student joining the session"""
        session = await self._get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Update enrollment
        stmt = select(SessionStudent).filter(
            SessionStudent.session_id == session.id,
            SessionStudent.student_id == uuid.UUID(student_id),
        )
        res_enroll = await self.db.execute(stmt)
        enrollment = res_enroll.scalars().first()

        if enrollment:
            enrollment.status = "joined"
            enrollment.joined_at = datetime.now(timezone.utc)

        # Update presence
        if str(student_id) not in session.student_presence:
            session.student_presence[str(student_id)] = {}

        session.student_presence[str(student_id)].update(
            {
                "student_id": student_id,
                "joined_at": datetime.now(timezone.utc).isoformat(),
                "last_active": datetime.now(timezone.utc).isoformat(),
                "attention_score": 100.0,
            }
        )

        session.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(session)

        logger.info(f"Student {student_id} joined session {session_id}")
        return session

    async def student_leave(self, session_id: str, student_id: str) -> TeachingSession:
        """Record student leaving the session"""
        session = await self._get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Update enrollment
        stmt = select(SessionStudent).filter(
            SessionStudent.session_id == session.id,
            SessionStudent.student_id == uuid.UUID(student_id),
        )
        res_enroll = await self.db.execute(stmt)
        enrollment = res_enroll.scalars().first()

        if enrollment:
            enrollment.status = "left"
            enrollment.left_at = datetime.now(timezone.utc)

        # Update presence
        if str(student_id) in session.student_presence:
            session.student_presence[str(student_id)]["left_at"] = datetime.now(
                timezone.utc
            ).isoformat()

        session.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(session)

        logger.info(f"Student {student_id} left session {session_id}")
        return session

    async def record_participation(
        self, session_id: str, student_id: str, event_type: str
    ) -> TeachingSession:
        """Record a participation event for a student and award XP"""
        from app.services.gamification import award_xp, award_teacher_impact

        session = await self._get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if str(student_id) not in session.student_presence:
            session.student_presence[str(student_id)] = {
                "student_id": student_id,
                "joined_at": datetime.now(timezone.utc).isoformat(),
            }

        presence = session.student_presence[str(student_id)]
        presence["last_active"] = datetime.now(timezone.utc).isoformat()

        # Update participation counts
        participation = presence.get(
            "participation", {"questions": 0, "answers": 0, "chat": 0, "hand_raises": 0}
        )
        xp_to_award = 0

        if event_type == "question":
            participation["questions"] += 1
            xp_to_award = 10
        elif event_type == "answer":
            participation["answers"] += 1
            xp_to_award = 15
        elif event_type == "chat":
            participation["chat"] += 1
            xp_to_award = 2
        elif event_type == "hand_raise":
            participation["hand_raises"] += 1
            xp_to_award = 5
        elif event_type == "reaction":
            participation["reactions"] = participation.get("reactions", 0) + 1
            xp_to_award = 3

        presence["participation"] = participation

        # Increase attention score for participation
        current_score = presence.get("attention_score", 100.0)
        presence["attention_score"] = min(100.0, current_score + 5.0)

        # Award XP to Student
        prof_res = await self.db.execute(
            select(StudentProfile).filter(
                StudentProfile.user_id == uuid.UUID(student_id)
            )
        )
        student_profile = prof_res.scalars().first()
        if student_profile:
            await award_xp(
                self.db, student_profile, xp_to_award, f"Participation: {event_type}"
            )

        # Award Impact Score to Teacher
        teach_prof_res = await self.db.execute(
            select(TeacherProfile).filter(TeacherProfile.user_id == session.teacher_id)
        )
        teacher_profile = teach_prof_res.scalars().first()
        if teacher_profile:
            await award_teacher_impact(
                self.db, teacher_profile, 1
            )  # 1 impact point per student participation

        # Force SQLAlchemy to detect change in JSON field
        session.student_presence = dict(session.student_presence)
        session.updated_at = datetime.now(timezone.utc)
        await self.db.commit()

        # Link to engagement tracker
        try:
            await engagement_tracker.record_participation(
                session_id=session_id, student_id=student_id, event_type=event_type
            )
        except Exception as e:
            logger.error(f"Failed to record participation in engagement tracker: {e}")

        await self.update_engagement_timeline(session_id)
        return session

    async def record_tab_switch(
        self, session_id: str, student_id: str
    ) -> TeachingSession:
        """Record a tab switch event (disengagement)"""
        session = await self._get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if str(student_id) in session.student_presence:
            presence = session.student_presence[str(student_id)]
            presence["last_active"] = datetime.now(timezone.utc).isoformat()

            # Decrease attention score for tab switch
            current_score = presence.get("attention_score", 100.0)
            presence["attention_score"] = max(0.0, current_score - 15.0)

            presence["tab_switches"] = presence.get("tab_switches", 0) + 1

            session.student_presence = dict(session.student_presence)
            session.updated_at = datetime.now(timezone.utc)
            await self.db.commit()

            await self.update_engagement_timeline(session_id)

        # Link to engagement tracker
        try:
            await engagement_tracker.record_tab_switch(session_id, student_id)
        except Exception as e:
            logger.error(f"Failed to record tab switch in engagement tracker: {e}")

        return session

    async def process_video_frame(
        self, session_id: str, student_id: str, frame_data: str
    ):
        """Process a video frame via the engagement tracker"""
        # Convert base64 data to bytes if needed (EngagementTracker takes bytes)
        # For mock, we just pass the data
        try:
            import base64

            image_bytes = (
                base64.b64decode(frame_data.split(",")[1])
                if "," in frame_data
                else base64.b64decode(frame_data)
            )
            return await engagement_tracker.process_video_frame(
                session_id, student_id, image_bytes
            )
        except Exception as e:
            logger.error(f"Error in SessionManager.process_video_frame: {e}")
            return None

    async def get_engagement_report(self, session_id: str):
        """Get the current engagement report from the tracker"""
        return await engagement_tracker.generate_engagement_report(session_id)

    async def update_engagement_timeline(self, session_id: str):
        """Append current average attention to the timeline"""
        session = await self._get_session(session_id)
        if not session or not session.student_presence:
            return

        scores = [
            p.get("attention_score", 0)
            for p in session.student_presence.values()
            if not p.get("left_at")
        ]

        if not scores:
            return

        avg_score = sum(scores) / len(scores)

        # Add to timeline (max 100 points)
        new_point = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "average_attention": round(avg_score, 1),
            "student_count": len(scores),
        }

        timeline = session.engagement_timeline or []
        timeline.append(new_point)
        if len(timeline) > 100:
            timeline.pop(0)

        session.engagement_timeline = list(timeline)
        await self.db.commit()

    async def get_teacher_sessions(
        self,
        teacher_id: str,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[TeachingSession]:
        """Get all sessions for a teacher"""
        stmt = select(TeachingSession).filter(
            TeachingSession.teacher_id == uuid.UUID(teacher_id)
        )

        if status:
            if "," in status:
                statuses = status.split(",")
                stmt = stmt.filter(TeachingSession.status.in_(statuses))
            else:
                stmt = stmt.filter(TeachingSession.status == status)

        res_exec = await self.db.execute(
            stmt.order_by(desc(TeachingSession.created_at)).offset(offset).limit(limit)
        )
        return res_exec.scalars().all()

    async def get_student_sessions(
        self,
        student_id: str,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[TeachingSession]:
        """Get all sessions a student is enrolled in or for subjects they are taking"""
        # 1. Get explicit session enrollments
        res_enroll = await self.db.execute(
            select(SessionStudent.session_id).filter(
                SessionStudent.student_id == uuid.UUID(student_id)
            )
        )
        session_ids = list(res_enroll.scalars().all())

        if not session_ids:
            return []
        stmt = select(TeachingSession).filter(
            TeachingSession.id.in_(session_ids)
        )

        if status:
            if "," in status:
                statuses = status.split(",")
                stmt = stmt.filter(TeachingSession.status.in_(statuses))
            else:
                stmt = stmt.filter(TeachingSession.status == status)

        res_exec = await self.db.execute(
            stmt.order_by(desc(TeachingSession.created_at)).offset(offset).limit(limit)
        )
        return res_exec.scalars().all()

    async def _generate_class_notes(self, session: TeachingSession) -> Dict[str, Any]:
        """Generate comprehensive class notes for student review"""
        subject = session.context.get("subject", "General")
        level = session.context.get("level", "SS 1")
        topic = session.context.get("topic", "General")  # Define topic here
        summary = session.session_summary or ""  # Define summary here
        prompt = f"Subject: {subject}\nTopic: {topic}\nLevel: {level}\nSummary: {summary}\nAction: Generate comprehensive, student-friendly class notes in Markdown format. Include 'Brief Summary', 'Key Concepts', and 'Detailed Explanation'. Ensure content is strictly about {topic} for {level} students. Return ONLY valid JSON."

        response = await llm_service.generate(
            prompt,
            temperature=0.3,
            format="json",
            max_tokens=2048,
            system_prompt=f'You are a {subject} teacher. Return JSON: {{"title": "Notes: {topic}", "content": "markdown_text", "total_pages_estimate": 1}}',
        )
        return self._extract_json(response) or {
            "title": f"Notes: {topic}",
            "content": "Failed to generate notes.",
        }

    async def _generate_session_outline(
        self, session: TeachingSession
    ) -> Dict[str, Any]:
        """Generate teacher-facing session outline"""
        subject = session.context.get("subject", "General")
        level = session.context.get("level", "SS 1")
        topic = session.context.get("topic", "General")  # Define topic here
        revision_points = session.context.get(
            "revision_points", []
        )  # Define revision_points here
        prompt = f"Subject: {subject}\nTopic: {topic}\nLevel: {level}\nPrevious Stop: {re.sub(r'[^a-zA-Z0-9 ]', '', str(revision_points))}\nAction: Generate a detailed teacher lesson outline for a 1-hour session. Return ONLY valid JSON."

        response = await llm_service.generate(
            prompt,
            temperature=0.2,
            format="json",
            system_prompt=f'You are a lead educator in {subject}. Return JSON: {{"sections": [{{"title": "Introduction to {topic}", "duration": "5m", "activity": "Lecture"}}]}}',
        )
        return self._extract_json(response)

    async def _generate_pre_session_quiz(
        self, session: TeachingSession
    ) -> Dict[str, Any]:
        """Generate 5 pre-session objective questions based on previous session continuity"""
        topic = session.context.get("topic", "General")
        revision_points = session.context.get("revision_points", [])

        # Focus on revision points if they exist, otherwise use general topic
        context_str = (
            f"Revision Points: {', '.join(revision_points[:5])}"
            if revision_points
            else f"Topic: {topic}"
        )

        prompt = f"Context: {context_str}\nAction: Generate a revision pop quiz with 3 questions to check understanding of previous session concepts. Return ONLY valid JSON."

        response = await llm_service.generate(
            prompt,
            temperature=0.1,
            format="json",
            max_tokens=1024,
            system_prompt='You are a JSON generator. Schema: {"title": "text", "questions": [{"id": 1, "question": "text", "options": ["A", "B", "C", "D"], "correct_answer": "A", "explanation": "text"}]}',
        )
        extracted = self._extract_json(response)
        if extracted:
            return extracted

        logger.error(f"Failed to parse pre-session quiz JSON from: {response[:100]}...")
        return {"title": "Pre-Session Revision", "questions": []}

    async def _generate_end_session_content(
        self, session: TeachingSession
    ) -> Dict[str, Any]:
        """Generate post-session quiz and take-home assignment"""
        topic = session.context.get("topic", "General")
        subject = session.context.get("subject", "General")
        summary = session.session_summary or ""

        # Optimized prompt for tinyllama
        prompt = f"Topic: {topic}\nSummary: {summary[:500]}\nAction: Generate a JSON post-quiz and take-home assignment. Return ONLY valid JSON."

        response = await llm_service.generate(
            prompt,
            temperature=0.1,
            format="json",
            max_tokens=2048,
            system_prompt='You are a JSON generator. Return keys \'post_quiz\' and \'assignment\'. Schema: {"post_quiz": {"questions": [...]}, "assignment": {"title": "text", "tasks": ["task1"], "instructions": "text"}}',
        )
        extracted = self._extract_json(response)

        if extracted:
            return extracted

        logger.error(f"Failed to parse end-session JSON from: {response[:100]}...")
        return {"post_quiz": {"questions": []}, "assignment": {"tasks": []}}

    async def get_teacher_token(self, session_id: str, teacher_id: str) -> str:
        """Generate LiveKit token for teacher"""
        session = await self._get_session(session_id)
        if not session:
            raise ValueError("Session not found")

        if str(session.teacher_id) != str(teacher_id):
            raise ValueError("Not the teacher of this session")

        res_exec = await self.db.execute(
            select(User).filter(User.id == uuid.UUID(teacher_id))
        )
        teacher = res_exec.scalars().first()
        teacher_name = teacher.full_name if teacher else "Teacher"
        room_name = session.livekit_room_name or f"edunexus-session-{session_id}"

        return await self.livekit_service.generate_teacher_token(
            room_name=room_name,
            teacher_id=str(teacher_id),
            teacher_name=teacher_name,
        )

    async def get_student_token(self, session_id: str, student_id: str) -> str:
        """Generate LiveKit token for student using relational enrollment check"""
        session = await self._get_session(session_id)
        if not session:
            raise ValueError("Session not found")

        # Check enrollment using relational table (with legacy fallback)
        is_enrolled, _ = await self.is_student_enrolled(session_id, student_id)
        if not is_enrolled:
            raise ValueError("Student not enrolled in this session")

        res_exec = await self.db.execute(
            select(User).filter(User.id == uuid.UUID(student_id))
        )
        student = res_exec.scalars().first()
        student_name = student.full_name if student else "Student"
        room_name = session.livekit_room_name or f"edunexus-session-{session_id}"

        return await self.livekit_service.generate_student_token(
            room_name=room_name,
            student_id=str(student_id),
            student_name=student_name,
        )

    async def submit_quiz_answers(
        self, session_id: str, student_id: str, quiz_type: str, answers: Dict[int, str]
    ) -> Dict[str, Any]:
        """Submit and score quiz answers"""
        session = await self._get_session(session_id)
        if not session:
            raise ValueError("Session not found")

        quiz = (
            session.pre_session_quiz
            if quiz_type == "pre"
            else session.post_session_quiz
        )
        if not quiz:
            raise ValueError(f"{quiz_type} quiz not found for this session")

        questions = quiz.get("questions", [])
        score = 0
        total = len(questions)
        results = []

        for q in questions:
            q_id = q.get("id")
            correct = q.get("correct_answer")
            student_ans = answers.get(q_id) or answers.get(str(q_id))

            is_correct = student_ans == correct
            if is_correct:
                score += 1

            results.append(
                {
                    "question_id": q_id,
                    "student_answer": student_ans,
                    "correct_answer": correct,
                    "is_correct": is_correct,
                    "explanation": q.get("explanation"),
                }
            )

        percentage = (score / total * 100) if total > 0 else 0

        # Update quiz_results in session
        if str(student_id) not in session.quiz_results:
            session.quiz_results[str(student_id)] = {}

        session.quiz_results[str(student_id)][quiz_type] = {
            "score": score,
            "total": total,
            "percentage": percentage,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }

        # Generate AI feedback
        feedback_prompt = f"""
        Student scored {score}/{total} ({percentage}%) on a {quiz_type}-session quiz about {session.context.get("topic")}.
        Results: {json.dumps(results)}
        
        Provide a short, encouraging feedback message for the student.
        """
        feedback = await llm_service.generate(feedback_prompt, temperature=0.7)

        session.quiz_results[str(student_id)][quiz_type]["feedback"] = feedback

        self.db.commit()

        return {
            "score": score,
            "total": total,
            "percentage": percentage,
            "results": results,
            "feedback": feedback,
        }

    def _parse_revision_points(self, continuity_notes: str) -> List[str]:
        """Parse continuity notes into revision points"""
        lines = continuity_notes.split("\n")
        points = [
            line.strip("- ").strip() for line in lines if line.strip().startswith("-")
        ]
        return points[:5]  # Return top 5 points

    async def _get_session(self, session_id: str) -> Optional[TeachingSession]:
        """Helper to get session by ID"""
        res_exec = await self.db.execute(
            select(TeachingSession).filter(TeachingSession.id == uuid.UUID(session_id))
        )
        return res_exec.scalars().first()

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        """Extract JSON from LLM response"""
        try:
            # Look for JSON block
            json_match = re.search(r"(\{.*\})", text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            return json.loads(text)
        except Exception:
            return None

    async def _build_context(
        self,
        teacher_id: str,
        subject_id: str,
        topic_id: str,
        student_ids: List[str],
        previous_session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Build initial session context and continuity"""
        context = {
            "enrolled_students": student_ids,
            "revision_points": [],
            "previous_session_id": previous_session_id,
        }

        # Get subject details
        if subject_id:
            res_exec = await self.db.execute(
                select(Subject).filter(Subject.id == uuid.UUID(subject_id))
            )
            subject = res_exec.scalars().first()
            if subject:
                context["subject"] = subject.name

        # Get topic details (or self-heal using StudentSubjectProgress)
        if not topic_id and subject_id and student_ids:
            stmt = select(StudentSubjectProgress).filter(
                StudentSubjectProgress.subject_id == uuid.UUID(subject_id),
                StudentSubjectProgress.student_id == uuid.UUID(student_ids[0])
            )
            res_exec = await self.db.execute(stmt)
            progress = res_exec.scalars().first()
            if progress and progress.current_topic_id:
                topic_id = str(progress.current_topic_id)
                logger.info(f"Auto-resolved topic_id to {topic_id} based on student progress")

        if topic_id:
            res_exec = await self.db.execute(
                select(Topic).filter(Topic.id == uuid.UUID(topic_id))
            )
            topic = res_exec.scalars().first()
            if topic:
                context["topic"] = topic.name
                context["topic_id"] = topic_id

        # If no explicit previous session, find the last one for this context
        if not previous_session_id and subject_id:
            last_session = await self.get_last_session_for_context(
                teacher_id, subject_id, student_ids
            )
            if last_session:
                context["previous_session_id"] = str(last_session.id)
                if last_session.continuity_notes:
                    context["revision_points"] = self._parse_revision_points(
                        last_session.continuity_notes
                    )

        return context

    async def _generate_session_summary(self, session: TeachingSession) -> str:
        """Generate high-level summary of the session using transcript"""
        topic = session.context.get("topic", "General")
        transcript_text = "\n".join(
            [f"{t.get('sender')}: {t.get('text')}" for t in session.transcript[:20]]
        )

        prompt = f"Topic: {topic}\nTranscript Fragment: {transcript_text}\nAction: Summarize this teaching session in 2-3 concise sentences."

        summary = await llm_service.generate(prompt, temperature=0.3)
        return summary.strip()

    async def _extract_continuity_points(self, session: TeachingSession) -> str:
        """Extract key points to continue from in next session"""
        topic = session.context.get("topic")
        summary = session.session_summary or ""

        prompt = f"Topic: {topic}\nSummary: {summary}\nAction: Identify 3-5 core concepts covered that should be reviewed in the next session. Format as a bulleted list starting with '-'."

        points = await llm_service.generate(prompt, temperature=0.3)
        return points.strip()

    async def _generate_revision_content(self, session: TeachingSession) -> str:
        """Generate expansion on revision points for teacher review"""
        points = session.context.get("revision_points", [])
        if not points:
            return "No specific revision points identified."

        prompt = f"Concepts: {', '.join(points)}\nAction: Provide a brief one-sentence refresher for each concept above."

        return await llm_service.generate(prompt, temperature=0.3)

    async def delete_session(self, session_id: str) -> bool:
        """Delete a teaching session and its related data"""
        logger.info(f"Deleting session {session_id}")

        session = await self._get_session(session_id)
        if not session:
            return False

        # Delete related enrollments
        await self.db.execute(
            delete(SessionStudent).filter(SessionStudent.session_id == session.id)
        )

        # Delete the session itself
        await self.db.delete(session)
        await self.db.commit()
        logger.info(f"Session {session_id} deleted successfully")
        return True
