from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import extract, func, select
import uuid

from app.models.report import StudentReport, ReportStatus
from app.models.session import TeachingSession, SessionStudent
from app.models.user import User, UserRole, TeacherStudent
from app.models.student_progress import StudentActivityLog


class ReportService:
    @staticmethod
    async def generate_monthly_reports(
        db: AsyncSession, teacher_id: uuid.UUID, month: int, year: int
    ) -> int:
        """
        Generates reports for all students of a teacher for a specific month.
        Returns the number of reports generated.
        """
        # Get all students linked to this teacher
        res_links = await db.execute(
            select(TeacherStudent).filter(
                TeacherStudent.teacher_id == teacher_id,
                TeacherStudent.status == "active",
            )
        )
        links = res_links.scalars().all()

        count = 0
        for link in links:
            if await ReportService.generate_student_report(
                db, link.student_id, teacher_id, month, year
            ):
                count += 1

        return count

    @staticmethod
    async def generate_student_report(
        db: AsyncSession, student_id: uuid.UUID, teacher_id: Optional[uuid.UUID], month: int, year: int
    ) -> Optional[StudentReport]:
        """
        Generates a comprehensive monthly report for a single student.
        """
        # Check if report already exists
        res_existing = await db.execute(
            select(StudentReport).filter(
                StudentReport.student_id == student_id,
                StudentReport.teacher_id == teacher_id,
                StudentReport.month == month,
                StudentReport.year == year,
            )
        )
        existing = res_existing.scalars().first()

        if existing:
            return existing

        # Get student profile info
        res_student = await db.execute(select(User).filter(User.id == student_id))
        student = res_student.scalars().first()
        if not student:
            return None

        # Get all sessions for this student in this month for this teacher
        if teacher_id:
            stmt_sessions = (
                select(SessionStudent)
                .join(TeachingSession, SessionStudent.session_id == TeachingSession.id)
                .filter(
                    SessionStudent.student_id == student_id,
                    TeachingSession.teacher_id == teacher_id,
                    extract("month", TeachingSession.scheduled_start) == month,
                    extract("year", TeachingSession.scheduled_start) == year,
                    TeachingSession.status.in_(["live", "ended"]),
                )
            )
            res_sessions = await db.execute(stmt_sessions)
            session_students = res_sessions.scalars().all()
        else:
            session_students = []

        # We check for portal activities later, so we don't return None here
        # unless both sessions AND portal activities are missing (handled below)

        # Aggregation
        total_sessions = len(session_students)
        total_attendance = sum(s.attendance_percentage or 0 for s in session_students)
        avg_attendance = total_attendance / total_sessions if total_sessions > 0 else 0

        total_participation = sum(s.participation_score or 0 for s in session_students)
        avg_participation = (
            total_participation / total_sessions if total_sessions > 0 else 0
        )

        total_questions = sum(s.questions_asked or 0 for s in session_students)
        total_answers = sum(s.answers_given or 0 for s in session_students)

        # Calculate total duration
        total_duration = 0
        for ss in session_students:
            # We need to ensure sessions are loaded or fetched
            # For simplicity in migration, assume they are accessible or refetch if needed
            # In AsyncSession, lazy loading is disabled, so we should join them in stmt_sessions
            pass

        # Refined query with joined session
        stmt_sessions_joined = (
            select(SessionStudent)
            .join(TeachingSession, SessionStudent.session_id == TeachingSession.id)
            .filter(
                SessionStudent.student_id == student_id,
                TeachingSession.teacher_id == teacher_id,
                extract("month", TeachingSession.scheduled_start) == month,
                extract("year", TeachingSession.scheduled_start) == year,
                TeachingSession.status.in_(["live", "ended"]),
            )
        )
        # Using selectinload for session and its related models to avoid lazy loading errors
        from sqlalchemy.orm import selectinload
        stmt_sessions_joined = stmt_sessions_joined.options(
            selectinload(SessionStudent.session).selectinload(TeachingSession.subject),
            selectinload(SessionStudent.session).selectinload(TeachingSession.topic)
        )
        
        res_sessions_joined = await db.execute(stmt_sessions_joined)
        session_students = res_sessions_joined.scalars().all()
        
        total_duration = sum(
            ss.session.duration_minutes if ss.session else 0 for ss in session_students
        )

        # Build session details for the report
        session_details = []
        attendance_timeline = []
        participation_timeline = []

        for idx, ss in enumerate(session_students):
            session = ss.session
            if session:
                session_details.append(
                    {
                        "date": session.scheduled_start.strftime("%Y-%m-%d")
                        if session.scheduled_start
                        else None,
                        "subject": session.subject.name
                        if session.subject
                        else "General",
                        "topic": session.topic.name if session.topic else None,
                        "duration": session.duration_minutes,
                        "attendance": ss.attendance_percentage or 0,
                        "participation": ss.participation_score or 0,
                        "status": ss.status,
                    }
                )
                # Build timeline data (for charts)
                attendance_timeline.append(
                    {
                        "date": session.scheduled_start.strftime("%b %d")
                        if session.scheduled_start
                        else f"Session {idx + 1}",
                        "value": ss.attendance_percentage or 0,
                    }
                )
                participation_timeline.append(
                    {
                        "date": session.scheduled_start.strftime("%b %d")
                        if session.scheduled_start
                        else f"Session {idx + 1}",
                        "value": ss.participation_score or 0,
                    }
                )

        # AI Insights
        assimilation_level = "Beginning"
        performance_trend = "Stable"
        if avg_participation >= 80:
            assimilation_level = "Advanced"
        elif avg_participation >= 60:
            assimilation_level = "Proficient"
        elif avg_participation >= 40:
            assimilation_level = "Developing"

        # Determine performance trend
        if len(participation_timeline) >= 2:
            first_half = sum(
                p["value"]
                for p in participation_timeline[: len(participation_timeline) // 2]
            ) / (len(participation_timeline) // 2)
            second_half = sum(
                p["value"]
                for p in participation_timeline[len(participation_timeline) // 2 :]
            ) / (len(participation_timeline) - len(participation_timeline) // 2)
            if second_half > first_half + 10:
                performance_trend = "Improving"
            elif second_half < first_half - 10:
                performance_trend = "Declining"

        # Subject-specific quiz and assignment tables
        quiz_by_subject = {}
        assignments_by_subject = {}

        for ss in session_students:
            session = ss.session
            if session:
                subject_name = session.subject.name if session.subject else "General"

                # Quiz data by subject
                if session.quiz_results:
                    student_quiz = session.quiz_results.get(str(ss.student_id), {})
                    if student_quiz:
                        if subject_name not in quiz_by_subject:
                            quiz_by_subject[subject_name] = {
                                "pre_scores": [],
                                "post_scores": [],
                                "sessions": [],
                            }
                        pre_score = student_quiz.get("pre", 0)
                        post_score = student_quiz.get("post", 0)
                        if pre_score > 0:
                            quiz_by_subject[subject_name]["pre_scores"].append(
                                pre_score
                            )
                        if post_score > 0:
                            quiz_by_subject[subject_name]["post_scores"].append(
                                post_score
                            )
                        
                        # New: Live Pop Quizzes
                        live_quiz = session.quiz_results.get("live_quizzes", {}).get(str(ss.student_id), {})
                        live_score = live_quiz.get("score", 0)
                        if live_score > 0:
                            if "live_scores" not in quiz_by_subject[subject_name]:
                                quiz_by_subject[subject_name]["live_scores"] = []
                            quiz_by_subject[subject_name]["live_scores"].append(live_score)

                        quiz_by_subject[subject_name]["sessions"].append(
                            {
                                "date": session.scheduled_start.strftime("%Y-%m-%d")
                                if session.scheduled_start
                                else None,
                                "topic": session.topic.name if session.topic else None,
                                "pre_score": pre_score,
                                "post_score": post_score,
                                "live_pop_score": live_score if live_score > 0 else None,
                                "improvement": post_score - pre_score
                                if pre_score > 0 and post_score > 0
                                else 0,
                            }
                        )

                # Assignment data by subject
                if session.assignments_generated:
                    if subject_name not in assignments_by_subject:
                        assignments_by_subject[subject_name] = {
                            "total": 0,
                            "sessions": [],
                        }
                    assignments_by_subject[subject_name]["total"] += len(
                        session.assignments_generated
                    )
                    assignments_by_subject[subject_name]["sessions"].append(
                        {
                            "date": session.scheduled_start.strftime("%Y-%m-%d")
                            if session.scheduled_start
                            else None,
                            "topic": session.topic.name if session.topic else None,
                            "count": len(session.assignments_generated),
                        }
                    )

        # Format quiz by subject for report
        quiz_table_by_subject = []
        for subject, data in quiz_by_subject.items():
            pre_avg = (
                sum(data["pre_scores"]) / len(data["pre_scores"])
                if data["pre_scores"]
                else 0
            )
            post_avg = (
                sum(data["post_scores"]) / len(data["post_scores"])
                if data["post_scores"]
                else 0
            )
            live_avg = (
                sum(data.get("live_scores", [])) / len(data.get("live_scores", []))
                if data.get("live_scores")
                else 0
            )
            quiz_table_by_subject.append(
                {
                    "subject": subject,
                    "sessions_count": len(data["sessions"]),
                    "pre_score_avg": round(pre_avg, 1),
                    "post_score_avg": round(post_avg, 1),
                    "live_pop_avg": round(live_avg, 1),
                    "improvement": round(post_avg - pre_avg, 1),
                    "sessions": data["sessions"],
                }
            )

        # Format assignments by subject for report
        assignments_table_by_subject = []
        for subject, data in assignments_by_subject.items():
            assignments_table_by_subject.append(
                {
                    "subject": subject,
                    "total_assigned": data["total"],
                    "sessions": data["sessions"],
                }
            )

        # Get quiz and assignment data from sessions
        quiz_results = []
        assignments_completed = 0
        assignments_total = 0
        pre_quiz_scores = []
        post_quiz_scores = []

        for ss in session_students:
            session = ss.session
            if session:
                # Get quiz results for this student
                if session.quiz_results:
                    student_quiz = session.quiz_results.get(str(ss.student_id), {})
                    if student_quiz:
                        pre_score = student_quiz.get("pre", 0)
                        post_score = student_quiz.get("post", 0)
                        if pre_score > 0:
                            pre_quiz_scores.append(pre_score)
                        if post_score > 0:
                            post_quiz_scores.append(post_score)
                        
                        live_quiz = session.quiz_results.get("live_quizzes", {}).get(str(ss.student_id), {})
                        live_score = live_quiz.get("score", 0)

                        quiz_results.append(
                            {
                                "date": session.scheduled_start.strftime("%Y-%m-%d")
                                if session.scheduled_start
                                else None,
                                "subject": session.subject.name
                                if session.subject
                                else "General",
                                "pre_score": pre_score,
                                "post_score": post_score,
                                "live_pop_score": live_score if live_score > 0 else None,
                                "improvement": post_score - pre_score
                                if pre_score > 0 and post_score > 0
                                else 0,
                            }
                        )

                # Count assignments
                if session.assignments_generated:
                    assignments_total += len(session.assignments_generated)

        # Calculate quiz metrics
        avg_pre_quiz = (
            sum(pre_quiz_scores) / len(pre_quiz_scores) if pre_quiz_scores else 0
        )
        avg_post_quiz = (
            sum(post_quiz_scores) / len(post_quiz_scores) if post_quiz_scores else 0
        )
        avg_quiz_improvement = (
            avg_post_quiz - avg_pre_quiz if pre_quiz_scores and post_quiz_scores else 0
        )

        # Generate insights
        strengths = []
        areas_for_improvement = []

        if avg_attendance >= 90:
            strengths.append("Excellent attendance record")
        elif avg_attendance >= 75:
            areas_for_improvement.append("Improve attendance consistency")

        if avg_participation >= 80:
            strengths.append("Highly active participation in class discussions")
        elif avg_participation >= 60:
            strengths.append("Good level of class participation")
        elif avg_participation < 40:
            areas_for_improvement.append("Increase engagement in class activities")

        if avg_quiz_improvement >= 20:
            strengths.append(
                f"Strong learning progress (avg. {avg_quiz_improvement:.0f}% quiz score improvement)"
            )
        elif avg_quiz_improvement < 0:
            areas_for_improvement.append(
                "Review core concepts - quiz scores showing decline"
            )

        if total_questions >= 10:
            strengths.append("Curious learner - asks many questions")
        elif total_questions < 3:
            areas_for_improvement.append("Encourage more questions during sessions")

        if avg_post_quiz >= 80:
            strengths.append("Strong understanding of topics covered")
        elif avg_post_quiz < 60 and avg_post_quiz > 0:
            areas_for_improvement.append("Focus on improving test scores")

        # Subject-specific analysis
        subject_scores = {}
        for ss in session_students:
            session = ss.session
            if session and session.subject:
                subject_name = session.subject.name
                if session.quiz_results:
                    student_quiz = session.quiz_results.get(str(ss.student_id), {})
                    if student_quiz and student_quiz.get("post", 0) > 0:
                        if subject_name not in subject_scores:
                            subject_scores[subject_name] = []
                        subject_scores[subject_name].append(student_quiz.get("post", 0))

        if subject_scores:
            avg_by_subject = {
                s: sum(scores) / len(scores) for s, scores in subject_scores.items()
            }
            if avg_by_subject:
                strongest_subject = max(avg_by_subject, key=avg_by_subject.get)
                if avg_by_subject[strongest_subject] >= 70:
                    strengths.append(f"Strong performance in {strongest_subject}")

                weakest_subject = min(avg_by_subject, key=avg_by_subject.get)
                if avg_by_subject[weakest_subject] < 60:
                    areas_for_improvement.append(
                        f"Need more focus on {weakest_subject}"
                    )

        # Overall quality score
        quality_score = min(
            100,
            int(
                (avg_attendance * 0.3)
                + (avg_participation * 0.3)
                + (avg_post_quiz * 0.3 if post_quiz_scores else avg_participation * 0.3)
                + (10 if avg_attendance > 80 else 0)
            ),
        )

        # Student portal activities
        res_portal = await db.execute(
            select(StudentActivityLog).filter(
                StudentActivityLog.student_id == student_id,
                extract("month", StudentActivityLog.timestamp) == month,
                extract("year", StudentActivityLog.timestamp) == year,
            )
        )
        portal_activities = res_portal.scalars().all()

        portal_time_spent = sum(a.time_spent_minutes or 0 for a in portal_activities)
        portal_total_activities = len(portal_activities)

        activity_by_type = {}
        for activity in portal_activities:
            atype = activity.activity_type or "other"
            if atype not in activity_by_type:
                activity_by_type[atype] = {"count": 0, "time_spent": 0, "scores": []}
            activity_by_type[atype]["count"] += 1
            activity_by_type[atype]["time_spent"] += activity.time_spent_minutes or 0
            if activity.score:
                activity_by_type[atype]["scores"].append(activity.score)

        ai_chat_count = activity_by_type.get("ai_chat", {}).get("count", 0)
        ai_chat_time = activity_by_type.get("ai_chat", {}).get("time_spent", 0)
        material_count = activity_by_type.get("material", {}).get("count", 0)
        material_time = activity_by_type.get("material", {}).get("time_spent", 0)
        quiz_portal_count = activity_by_type.get("quiz", {}).get("count", 0)
        quiz_portal_scores = activity_by_type.get("quiz", {}).get("scores", [])
        avg_quiz_portal_score = (
            sum(quiz_portal_scores) / len(quiz_portal_scores)
            if quiz_portal_scores
            else 0
        )
        video_count = activity_by_type.get("video", {}).get("count", 0)
        video_time = activity_by_type.get("video", {}).get("time_spent", 0)
        topic_request_count = activity_by_type.get("topic_request", {}).get("count", 0)

        portal_strengths = []
        portal_improvements = []

        if ai_chat_count >= 10:
            portal_strengths.append(f"Active learner - {ai_chat_count} AI tutoring sessions")
        elif ai_chat_count == 0 and portal_total_activities > 0:
            portal_improvements.append("Start using AI chat for instant help with questions")

        if material_count >= 5:
            portal_strengths.append(f"Used {material_count} study materials for self-study")

        if video_count >= 5:
            portal_strengths.append(f"Engaged with {video_count} video lessons")

        if quiz_portal_count >= 5 and avg_quiz_portal_score >= 80:
            portal_strengths.append(f"Strong self-assessment - {quiz_portal_count} quizzes with {avg_quiz_portal_score:.0f}% avg")

        strengths.extend(portal_strengths[:2])
        areas_for_improvement.extend(portal_improvements[:2])

        activity_breakdown = []
        for atype, data in activity_by_type.items():
            avg_score = (
                sum(data["scores"]) / len(data["scores"]) if data["scores"] else 0
            )
            activity_breakdown.append(
                {
                    "type": atype,
                    "count": data["count"],
                    "time_minutes": data["time_spent"],
                    "avg_score": round(avg_score, 1) if avg_score > 0 else None,
                }
            )

        activity_breakdown.sort(key=lambda x: x["time_minutes"], reverse=True)

        report_data = {
            "total_sessions": total_sessions,
            "total_duration_minutes": total_duration,
            "avg_attendance": round(avg_attendance, 1),
            "avg_participation": round(avg_participation, 1),
            "total_questions": total_questions,
            "total_answers": total_answers,
            "quality_score": quality_score,
            "quiz_performance": {
                "total_quizzes": len(quiz_results),
                "avg_pre_score": round(avg_pre_quiz, 1),
                "avg_post_score": round(avg_post_quiz, 1),
                "avg_improvement": round(avg_quiz_improvement, 1),
                "quiz_results": quiz_results[-10:] if quiz_results else [],
                "by_subject": quiz_table_by_subject,
            },
            "assignments": {
                "total_assigned": assignments_total,
                "completed": assignments_completed,
                "completion_rate": round(
                    (assignments_completed / assignments_total * 100)
                    if assignments_total > 0
                    else 0,
                    1,
                ),
                "by_subject": assignments_table_by_subject,
            },
            "portal_engagement": {
                "total_activities": portal_total_activities,
                "total_time_minutes": portal_time_spent,
                "ai_chat_sessions": ai_chat_count,
                "ai_chat_time_minutes": ai_chat_time,
                "materials_accessed": material_count,
                "materials_time_minutes": material_time,
                "portal_quizzes": quiz_portal_count,
                "portal_quiz_avg_score": round(avg_quiz_portal_score, 1),
                "videos_watched": video_count,
                "videos_time_minutes": video_time,
                "topic_requests": topic_request_count,
                "activity_breakdown": activity_breakdown,
            },
            "strengths": strengths[:5],
            "areas_for_improvement": areas_for_improvement[:5],
            "assimilation_level": assimilation_level,
            "performance_trend": performance_trend,
            "charts": {
                "attendance_timeline": attendance_timeline,
                "participation_timeline": participation_timeline,
                "quiz_timeline": [
                    {"date": q["date"], "pre": q["pre_score"], "post": q["post_score"]}
                    for q in quiz_results[-10:]
                ] if quiz_results else [],
                "session_breakdown": [
                    {"label": "Attendance", "value": round(avg_attendance, 1)},
                    {"label": "Participation", "value": round(avg_participation, 1)},
                    {"label": "Quiz Performance", "value": round(avg_post_quiz, 1) if post_quiz_scores else 0},
                    {"label": "Quality", "value": quality_score},
                ],
            },
            "sessions": session_details,
            "student": {
                "name": student.full_name,
                "email": student.email,
            },
        }

        # FINAL CHECK: If no sessions AND no portal activity, skip report
        if total_sessions == 0 and portal_total_activities == 0:
            return None

        report = StudentReport(
            id=uuid.uuid4(),
            student_id=student_id,
            teacher_id=teacher_id,
            month=month,
            year=year,
            report_data=report_data,
            status=ReportStatus.GENERATED,
        )

        db.add(report)
        await db.commit()
        await db.refresh(report)

        return report

    @staticmethod
    async def approve_report(
        db: AsyncSession, report_id: uuid.UUID, teacher_notes: Optional[str] = None
    ) -> StudentReport:
        """
        Approves a report by a teacher.
        """
        res_report = await db.execute(select(StudentReport).filter(StudentReport.id == report_id))
        report = res_report.scalars().first()
        if not report:
            raise Exception("Report not found")

        report.status = ReportStatus.APPROVED
        report.teacher_notes = teacher_notes
        report.approved_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(report)
        return report
