from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, any_, or_
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime, timezone, timedelta, time
from typing import List, Optional, Dict, Any
from sqlalchemy import select, update, delete, func, or_, and_, text, case
from sqlalchemy.ext.asyncio import AsyncSession
import logging

logger = logging.getLogger(__name__)

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole, StudentTopicRequest, TeacherStudent
from app.models.student import StudentProfile, LearningStyleAssessment
from app.models.subject import Subject, Topic
from sqlalchemy.orm.attributes import flag_modified
from app.models.junction_tables import StudentTopicProgress
from app.services.storage_service import storage_service
from app.services.curriculum_service import curriculum_service

router = APIRouter()

def map_grade_level(grade: str) -> str:
    if not grade: return grade
    g = grade.lower()
    if g.startswith("primary_"): return f"P{g.split('_')[1]}"
    if g.startswith("jss_"): return f"JSS{g.split('_')[1]}"
    if g.startswith("ss_"): return f"SS{g.split('_')[1]}"
    if g == "kindergarten": return "KG"
    if g == "nursery_1": return "N1"
    if g == "nursery_2": return "N2"
    if g == "creche": return "CRECHE"
    return grade.upper()


class StudentProfileUpdate(BaseModel):
    learning_style: Optional[str] = None
    preferred_pace: Optional[str] = None
    attention_span_minutes: Optional[int] = None
    best_study_time: Optional[str] = None
    grade_level: Optional[str] = None
    current_grade_level: Optional[str] = None  # alias
    education_level: Optional[str] = None
    school_name: Optional[str] = None
    curriculum_type: Optional[str] = None
    career_interests: Optional[List[str]] = None
    target_universities: Optional[List[str]] = None
    enrolled_subjects: Optional[List[str]] = None
    avatar_url: Optional[str] = None
    course_name: Optional[str] = None
    department: Optional[str] = None
    exam_targets: Optional[List[str]] = None
    jamb_subjects: Optional[List[uuid.UUID]] = None


def generate_student_id() -> str:
    """Generate unique student ID like EDU-2026-ABC123"""
    import random
    import string

    year = datetime.now(timezone.utc).year
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"EDU-{year}-{suffix}"


class SubjectEnrollmentUpdate(BaseModel):
    subject_id: str
    action: str  # "enroll" or "unenroll"


class CustomCourseEnrollment(BaseModel):
    course_name: str


class LearningStyleAnswer(BaseModel):
    question_id: int
    answer_index: int


class LearningStyleAssessmentSubmit(BaseModel):
    answers: List[int]


class TopicRequestCreate(BaseModel):
    topic_name: str
    subject: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high
    preferred_teacher_id: Optional[str] = None


class TopicRequestUpdate(BaseModel):
    topic_name: Optional[str] = None
    subject: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None


class TopicRequestResponse(BaseModel):
    id: str
    topic_name: str
    subject: str
    description: Optional[str]
    priority: str
    status: str
    student_id: str
    student_name: str
    assigned_teacher_id: Optional[str]
    assigned_teacher_name: Optional[str]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


def require_student(current_user: User = Depends(get_current_user)):
    """Dependency to ensure only students can access these endpoints"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this resource",
        )
    return current_user


@router.get("/profile")
async def get_student_profile(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get current student's profile"""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students have profiles")

    result = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()

    if not profile:
        # Create default profile with student ID
        profile = StudentProfile(
            id=uuid.uuid4(),
            user_id=current_user.id,
            student_id=generate_student_id(),
            created_at=datetime.now(timezone.utc),
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    elif not profile.student_id:
        # Generate student_id for existing profiles that don't have one
        profile.student_id = generate_student_id()
        await db.commit()
        await db.refresh(profile)

    return {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "student_id": profile.student_id,
        "learning_style": profile.learning_style,
        "preferred_pace": profile.preferred_pace,
        "attention_span_minutes": profile.attention_span_minutes,
        "best_study_time": profile.best_study_time,
        "education_level": profile.education_level,
        "grade_level": profile.grade_level or profile.current_grade_level,
        "current_grade_level": profile.current_grade_level,
        "brain_power": profile.brain_power,
        "school_name": profile.school_name,
        "curriculum_type": profile.curriculum_type,
        "subject_proficiency": profile.subject_proficiency,
        "enrolled_subjects": [str(s) for s in (profile.enrolled_subjects or [])],
        "career_interests": profile.career_interests,
        "target_universities": profile.target_universities,
        "strength_areas": profile.strength_areas,
        "weakness_areas": profile.weakness_areas,
        "learning_recommendations": profile.learning_recommendations,
        "xp": profile.xp or 0,
        "level": profile.level or 1,
        "current_streak": profile.current_streak or 0,
        "longest_streak": profile.longest_streak or 0,
        "badges": profile.badges or [],
        "avatar_url": storage_service.resolve_url(getattr(profile, "avatar_url", None)),
        "course_name": getattr(profile, "course_name", None),
        "professional_curriculum": getattr(profile, "professional_curriculum", None),
        "department": profile.department,
        "exam_targets": profile.exam_targets or [],
        "jamb_subjects": [str(s) for s in (profile.jamb_subjects or [])],
    }


@router.get("/me/brain-power")
async def get_my_brain_power(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_student),
):
    """Get current student's remaining brain power"""
    result = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()

    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Calculate next recharge (midnight UTC)
    now = datetime.now(timezone.utc)
    tomorrow = now.date() + timedelta(days=1)
    recharge_at = datetime.combine(tomorrow, time.min).replace(tzinfo=timezone.utc)
    seconds_until_recharge = int((recharge_at - now).total_seconds())

    return {
        "brain_power": profile.brain_power,
        "max_brain_power": 100,
        "recharge_at": recharge_at.isoformat(),
        "seconds_until_recharge": seconds_until_recharge,
    }


@router.put("/profile")
async def update_student_profile(
    profile_data: StudentProfileUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Update student profile"""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students have profiles")

    result = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()

    if not profile:
        profile = StudentProfile(id=uuid.uuid4(), user_id=current_user.id)
        db.add(profile)

    # Update fields
    update_data = profile_data.dict(exclude_unset=True)

    # Sync grade_level / current_grade_level
    grade = update_data.pop("grade_level", None) or update_data.get(
        "current_grade_level"
    )
    if grade:
        profile.grade_level = grade
        profile.current_grade_level = grade
        # Task 1D: Auto-enroll in Nigerian Curriculum subjects
        await curriculum_service.enroll_student_in_grade_curriculum(
            db, current_user.id, grade
        )

    # Force mapping for nested/special fields if necessary
    for field, value in update_data.items():
        if hasattr(profile, field) and field != "current_grade_level":
            setattr(profile, field, value)

            # Sync avatar_url to parent user object if it's being updated
            if field == "avatar_url":
                current_user.avatar_url = value

    profile.updated_at = datetime.now(timezone.utc)

    # Trigger AI Curriculum Generation for Professional track
    if (
        profile.education_level == "professional"
        and profile.course_name
        and not profile.professional_curriculum
    ):
        try:
            from app.services.llm_service import llm_service
            from app.models.subject import Subject, Topic

            response_data = await llm_service.generate_subtopics(
                topic=profile.course_name,
                subject="Professional Career Track",
                education_level="professional",
                user_id=current_user.id
            )

            subtopics = response_data.get("subtopics", [])
            corrected_course_name = response_data.get(
                "corrected_topic", profile.course_name
            )

            # Save the corrected name back to the profile
            profile.course_name = corrected_course_name

            if subtopics:
                profile.professional_curriculum = {"subtopics": subtopics}

                # Create a specific Subject for this student if it doesn't exist
                # Filter by name, level AND creator to ensure isolation
                res_subj = await db.execute(
                    select(Subject).filter(
                        Subject.name == corrected_course_name,
                        Subject.education_level == "professional",
                        Subject.created_by == current_user.id,
                    )
                )
                existing_subject = res_subj.scalars().first()

                if not existing_subject:
                    new_subject = Subject(
                        id=uuid.uuid4(),
                        name=corrected_course_name,
                        code=f"PROF-{corrected_course_name[:3].upper()}-{str(uuid.uuid4())[:4]}",
                        description=f"Comprehensive 'Zero to Hero' curriculum for {corrected_course_name}",
                        education_level="professional",
                        created_by=current_user.id,
                        is_private=True,
                    )
                    db.add(new_subject)
                    await db.flush()

                    # Add topics based on subtopics
                    for i, st_name in enumerate(subtopics):
                        topic = Topic(
                            id=uuid.uuid4(),
                            subject_id=new_subject.id,
                            name=st_name,
                            description=f"Core module for {corrected_course_name}: {st_name}",
                            display_order=i,
                        )
                        db.add(topic)

                await db.commit()
        except Exception as e:
            logger.error(f"Failed to generate professional curriculum: {e}")
            logger.exception("Professional curriculum generation failed")

    await db.commit()
    await db.refresh(profile)

    return {
        "message": "Profile updated successfully",
        "profile": {
            "education_level": profile.education_level,
            "grade_level": profile.grade_level,
            "school_name": profile.school_name,
            "curriculum_type": profile.curriculum_type,
            "avatar_url": storage_service.resolve_url(profile.avatar_url),
            "department": profile.department,
            "exam_targets": profile.exam_targets,
            "jamb_subjects": [str(s) for s in (profile.jamb_subjects or [])],
        },
    }


@router.post("/avatar")
async def upload_student_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and save a student profile avatar"""
    import os, shutil

    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can use this endpoint"
        )

    if not file:
        raise HTTPException(status_code=400, detail="No file provided")

    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    # 1. Upload to SeaweedFS
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    object_name = f"avatars/student_{current_user.id}.{ext}"

    file.file.seek(0)
    avatar_url = storage_service.upload_file(
        file.file, object_name, content_type=file.content_type
    )

    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = res_prof.scalars().first()
    if not profile:
        profile = StudentProfile(id=uuid.uuid4(), user_id=current_user.id)
        db.add(profile)

    profile.avatar_url = avatar_url
    # Update base user avatar_url too for consistency
    current_user.avatar_url = avatar_url

    await db.commit()

    return {
        "avatar_url": storage_service.resolve_url(avatar_url) if avatar_url else None,
        "message": "Avatar uploaded successfully",
    }


@router.post("/subjects/enroll")
async def enroll_in_subject(
    enrollment_data: SubjectEnrollmentUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Enroll or unenroll from a subject"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can enroll in subjects"
        )

    result = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()

    if not profile:
        profile = StudentProfile(
            id=uuid.uuid4(), user_id=current_user.id, enrolled_subjects=[]
        )
        db.add(profile)

    current_enrolled = list(profile.enrolled_subjects or [])

    if enrollment_data.action == "enroll":
        if enrollment_data.subject_id not in current_enrolled:
            current_enrolled.append(enrollment_data.subject_id)
            message = "Successfully enrolled in subject"
        else:
            message = "Already enrolled in this subject"
    elif enrollment_data.action == "unenroll":
        if enrollment_data.subject_id in current_enrolled:
            current_enrolled.remove(enrollment_data.subject_id)
            message = "Successfully unenrolled from subject"
        else:
            message = "Not enrolled in this subject"
    else:
        raise HTTPException(
            status_code=400, detail="Invalid action. Use 'enroll' or 'unenroll'"
        )

    profile.enrolled_subjects = current_enrolled

    # Task 1C: Auto-unlock first topic
    if enrollment_data.action == "enroll":
        try:
            # Find topic with lowest sort_order for this subject
            # Fallback to display_order if sort_order is not yet populated correctly
            res_topic = await db.execute(
                select(Topic)
                .filter(Topic.subject_id == enrollment_data.subject_id)
                .order_by(getattr(Topic, "sort_order", Topic.display_order).asc())
                .limit(1)
            )
            first_topic = res_topic.scalars().first()

            if first_topic:
                # Check if progress already exists
                res_check = await db.execute(
                    select(StudentTopicProgress).filter(
                        StudentTopicProgress.student_id == current_user.id,
                        StudentTopicProgress.topic_id == first_topic.id,
                    )
                )
                existing = res_check.scalars().first()

                if not existing:
                    progress = StudentTopicProgress(
                        student_id=current_user.id,
                        topic_id=first_topic.id,
                        subject_id=first_topic.subject_id,
                        status="in_progress",
                        unlocked_at=datetime.now(timezone.utc),
                    )
                    db.add(progress)
                    logger.info(
                        f"Auto-created first topic progress {first_topic.id} for student {current_user.id}"
                    )
        except Exception as e:
            logger.error(f"Failed to auto-unlock first topic: {e}")

    await db.commit()
    return {"message": message, "enrolled_subjects": current_enrolled}


@router.post("/professional/enroll")
async def enroll_custom_professional(
    course_data: CustomCourseEnrollment,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and enroll in a custom professional course"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can enroll in courses"
        )

    result = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()

    if not profile or profile.education_level != "professional":
        raise HTTPException(
            status_code=400, detail="Student must be on the professional track"
        )

    course_name = course_data.course_name.strip()
    if not course_name:
        raise HTTPException(status_code=400, detail="Course name is required")

    try:
        from app.services.llm_service import llm_service
        from app.models.subject import Subject, Topic

        # First, generate the subtopics and get the AI-corrected topic name
        response_data = await llm_service.generate_subtopics(
            topic=course_name,
            subject="Professional Career Track",
            education_level="professional",
            user_id=current_user.id
        )
        subtopics = response_data.get("subtopics", [])
        corrected_course_name = response_data.get("corrected_topic", course_name)

        if not subtopics:
            raise HTTPException(
                status_code=500, detail="Failed to generate curriculum using AI"
            )

        # Filter by name, level AND creator to ensure isolation
        res_subj = await db.execute(
            select(Subject).filter(
                Subject.name == corrected_course_name,
                Subject.education_level == "professional",
                Subject.created_by == current_user.id,
            )
        )
        existing_subject = res_subj.scalars().first()

        new_subject_id = None
        if existing_subject:
            new_subject_id = existing_subject.id
        else:
            new_subject = Subject(
                id=uuid.uuid4(),
                name=corrected_course_name,
                code=f"PROF-{corrected_course_name[:3].upper()}-{str(uuid.uuid4())[:4]}",
                description=f"Comprehensive 'Zero to Hero' curriculum for {corrected_course_name}",
                education_level="professional",
                created_by=current_user.id,
                is_private=True,
            )
            db.add(new_subject)
            await db.flush()
            new_subject_id = new_subject.id

            # Add topics based on subtopics
            for i, st_name in enumerate(subtopics):
                topic = Topic(
                    id=uuid.uuid4(),
                    subject_id=new_subject.id,
                    name=st_name,
                    description=f"Core module for {corrected_course_name}: {st_name}",
                    display_order=i,
                )
                db.add(topic)

        # Enroll student in the subject
        current_enrolled = list(profile.enrolled_subjects or [])
        if str(new_subject_id) not in current_enrolled:
            current_enrolled.append(str(new_subject_id))
            profile.enrolled_subjects = current_enrolled

            # Task 1C: Auto-unlock first topic for professional course
            try:
                res_topic = await db.execute(
                    select(Topic)
                    .filter(Topic.subject_id == new_subject_id)
                    .order_by(Topic.display_order.asc())
                    .limit(1)
                )
                first_topic = res_topic.scalars().first()
                if first_topic:
                    progress = StudentTopicProgress(
                        student_id=current_user.id,
                        topic_id=first_topic.id,
                        subject_id=new_subject_id,
                        status="unlocked",
                        unlocked_at=datetime.now(timezone.utc),
                    )
                    db.add(progress)
            except Exception as e:
                logger.error(f"Failed to auto-unlock first topic for professional: {e}")

        await db.commit()
        return {
            "success": True,
            "detail": f"Successfully enrolled in {corrected_course_name}",
            "enrolled_subjects": current_enrolled,
        }

    except Exception as e:
        await db.rollback()
        logger.exception("Error enrolling custom professional course")
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


@router.get("/subjects/enrolled")
async def get_enrolled_subjects(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of enrolled subjects"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students have enrolled subjects"
        )

    result = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()

    if not profile:
        return {"enrolled_subjects": []}

    enrolled = profile.enrolled_subjects or []
    fixed_enrolled = []
    needs_update = False

    for subj_ident in enrolled:
        try:
            # Check if it is a valid UUID string
            uuid.UUID(str(subj_ident))
            fixed_enrolled.append(subj_ident)
        except ValueError:
            # It's a string name, we need to map it to a DB UUID
            needs_update = True
            
            # Tier 1: Name + Grade + Department (Strict)
            # For exam tracks, we look for "JAMB Mathematics" as well as "Mathematics"
            check_names = [subj_ident]
            if profile.curriculum_type:
                check_names.append(f"{profile.curriculum_type.upper()} {subj_ident}")
                check_names.append(f"{subj_ident} ({profile.curriculum_type.upper()})") # Fallback pattern
            
            query = select(Subject).filter(
                Subject.name.in_(check_names),
                Subject.is_active == True
            )
            if profile.curriculum_type:
                track = profile.curriculum_type.upper()
                query = query.order_by(
                    case(
                        (Subject.curriculum_type == track, 1),
                        else_=0
                    ).desc(),
                    Subject.created_at.desc()
                )

            if profile.grade_level:
                mapped_grade = map_grade_level(profile.grade_level)
                query = query.filter(or_(
                    Subject.grade_levels.contains([mapped_grade]),
                    Subject.grade_levels == []
                ))
            if profile.department:
                query = query.filter(or_(
                    Subject.departments.contains([profile.department]),
                    Subject.departments == []
                ))
                
            res = await db.execute(query)
            mapped_subj = res.scalars().first()
            
            if not mapped_subj and profile.grade_level:
                # Tier 2: Name + Grade (Ignore Department - helpful for core subjects)
                mapped_grade = map_grade_level(profile.grade_level)
                # Healing logic: Find the best match for the subject name
                # Priority: Match name AND curriculum_type, then match name only
                query_t2 = select(Subject).filter(
                    Subject.name.ilike(subj_ident),
                    Subject.is_private == False,
                    or_(
                        Subject.grade_levels.contains([mapped_grade]),
                        Subject.grade_levels == []
                    )
                )
                if profile.curriculum_type:
                    track = profile.curriculum_type.upper()
                    query_t2 = query_t2.order_by(
                        case(
                            (Subject.curriculum_type == track, 1),
                            else_=0
                        ).desc(),
                        Subject.created_at.desc()
                    )
                else:
                    query_t2 = query_t2.order_by(Subject.created_at.desc())
                
                res_t2 = await db.execute(query_t2)
                mapped_subj = res_t2.scalars().first()

            if not mapped_subj and profile.education_level:
                # Tier 3: Name + Education Level (Fallback if grade match fails)
                query_t3 = select(Subject).filter(
                    Subject.name == subj_ident, 
                    Subject.is_active == True,
                    Subject.education_level == profile.education_level
                )
                if profile.curriculum_type:
                    track = profile.curriculum_type.upper()
                    query_t3 = query_t3.order_by(
                        case(
                            (Subject.curriculum_type == track, 1),
                            else_=0
                        ).desc(),
                        Subject.created_at.desc()
                    )
                query_t3 = query_t3.limit(1)
                res_t3 = await db.execute(query_t3)
                mapped_subj = res_t3.scalars().first()

            if mapped_subj:
                fixed_enrolled.append(str(mapped_subj.id))
            else:
                # Tier 4: Fallback to just name - last resort
                res_fallback = await db.execute(select(Subject).filter(Subject.name == subj_ident, Subject.is_active == True).limit(1))
                mapped_fallback = res_fallback.scalars().first()
                if mapped_fallback:
                    fixed_enrolled.append(str(mapped_fallback.id))
                else:
                    # Keep as string if not found
                    fixed_enrolled.append(subj_ident)

    if needs_update:
        # Deduplicate and save the resolved UUIDs
        profile.enrolled_subjects = list(set(fixed_enrolled))
        flag_modified(profile, "enrolled_subjects")
        await db.commit()
        await db.refresh(profile)
        return {"enrolled_subjects": profile.enrolled_subjects}

    return {"enrolled_subjects": enrolled}


@router.post("/assessment/learning-style")
async def submit_learning_style_assessment(
    assessment_data: LearningStyleAssessmentSubmit,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Submit learning style assessment (VARK model)"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can take assessments"
        )

    # VARK assessment questions
    questions = [
        {
            "question": "When learning something new, I prefer to:",
            "options": [
                {"text": "See diagrams and charts", "type": "visual"},
                {"text": "Listen to explanations", "type": "auditory"},
                {"text": "Read written instructions", "type": "reading"},
                {"text": "Try it hands-on", "type": "kinesthetic"},
            ],
        },
        {
            "question": "I remember information best when I:",
            "options": [
                {"text": "Visualize it in my mind", "type": "visual"},
                {"text": "Discuss it with others", "type": "auditory"},
                {"text": "Write notes about it", "type": "reading"},
                {"text": "Practice doing it", "type": "kinesthetic"},
            ],
        },
        {
            "question": "In a classroom, I prefer:",
            "options": [
                {"text": "Looking at presentations and videos", "type": "visual"},
                {"text": "Listening to lectures", "type": "auditory"},
                {"text": "Reading textbooks", "type": "reading"},
                {"text": "Doing experiments and activities", "type": "kinesthetic"},
            ],
        },
        {
            "question": "When solving problems, I:",
            "options": [
                {"text": "Draw diagrams or flowcharts", "type": "visual"},
                {"text": "Talk through the steps", "type": "auditory"},
                {"text": "Write down the solution", "type": "reading"},
                {
                    "text": "Use physical objects or manipulatives",
                    "type": "kinesthetic",
                },
            ],
        },
    ]

    # Calculate scores
    scores = {"visual": 0, "auditory": 0, "reading": 0, "kinesthetic": 0}

    for i, answer in enumerate(assessment_data.answers):
        if i < len(questions):
            question = questions[i]
            selected_type = question["options"][answer]["type"]
            scores[selected_type] += 1

    # Normalize to 0-100
    max_score = len(questions)
    for key in scores:
        scores[key] = int((scores[key] / max_score) * 100)

    # Determine dominant style
    dominant = max(scores, key=scores.get)

    # Save assessment
    assessment = LearningStyleAssessment(
        id=uuid.uuid4(),
        student_id=current_user.id,
        visual_score=scores["visual"],
        auditory_score=scores["auditory"],
        reading_score=scores["reading"],
        kinesthetic_score=scores["kinesthetic"],
        dominant_style=dominant,
        detailed_results=scores,
    )

    db.add(assessment)

    # Update student profile
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = res_prof.scalars().first()

    if not profile:
        profile = StudentProfile(id=uuid.uuid4(), user_id=current_user.id)
        db.add(profile)

    profile.learning_style = dominant
    await db.commit()

    return {
        "success": True,
        "detail": "Assessment completed",
        "dominant_style": dominant,
        "scores": scores,
        "recommendations": get_learning_recommendations(dominant),
    }


def get_learning_recommendations(learning_style: str) -> List[str]:
    """Get recommendations based on learning style"""
    recommendations = {
        "visual": [
            "Use diagrams, charts, and mind maps",
            "Watch educational videos",
            "Use color-coding for notes",
            "Create visual summaries",
        ],
        "auditory": [
            "Record and listen to lectures",
            "Participate in group discussions",
            "Read aloud when studying",
            "Use mnemonic devices and songs",
        ],
        "reading": [
            "Take detailed written notes",
            "Read textbooks and articles",
            "Write summaries of what you learn",
            "Use active recall techniques",
        ],
        "kinesthetic": [
            "Take frequent breaks to move",
            "Use hands-on activities",
            "Practice by doing",
            "Create physical models or diagrams",
        ],
    }

    return recommendations.get(learning_style, [])


@router.get("/assessment/learning-style/questions")
async def get_learning_style_questions(current_user: User = Depends(get_current_user)):
    """Get learning style assessment questions"""
    questions = [
        {
            "id": 1,
            "question": "When learning something new, I prefer to:",
            "options": [
                "See diagrams and charts",
                "Listen to explanations",
                "Read written instructions",
                "Try it hands-on",
            ],
        },
        {
            "id": 2,
            "question": "I remember information best when I:",
            "options": [
                "Visualize it in my mind",
                "Discuss it with others",
                "Write notes about it",
                "Practice doing it",
            ],
        },
        {
            "id": 3,
            "question": "In a classroom, I prefer:",
            "options": [
                "Looking at presentations and videos",
                "Listening to lectures",
                "Reading textbooks",
                "Doing experiments and activities",
            ],
        },
        {
            "id": 4,
            "question": "When solving problems, I:",
            "options": [
                "Draw diagrams or flowcharts",
                "Talk through the steps",
                "Write down the solution",
                "Use physical objects or manipulatives",
            ],
        },
    ]

    return {"questions": questions}


@router.get("/{student_id}/recommendations")
async def get_student_recommendations(
    student_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get personalized learning recommendations for a student"""
    # Only teachers or the student themselves can view
    if (
        current_user.role not in ["teacher", "admin"]
        and str(current_user.id) != student_id
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == uuid.UUID(student_id))
    )
    profile = res_prof.scalars().first()

    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Generate AI-powered recommendations
    from app.services.llm_service import llm_service

    prompt = f"""Generate personalized learning recommendations for a student with these characteristics:
    
Learning Style: {profile.learning_style}
Grade Level: {profile.current_grade_level}
Strengths: {", ".join(profile.strength_areas) if profile.strength_areas else "Not assessed"}
Weaknesses: {", ".join(profile.weakness_areas) if profile.weakness_areas else "Not assessed"}
Subject Proficiency: {profile.subject_proficiency}

Provide 3-5 specific, actionable recommendations."""

    recommendations_text = await llm_service.generate(prompt, temperature=0.8)

    return {
        "student_id": student_id,
        "learning_style": profile.learning_style,
        "recommendations": recommendations_text.split("\n")[:5],
        "focus_areas": profile.weakness_areas or [],
        "strength_areas": profile.strength_areas or [],
    }


# Topic Request Endpoints
@router.post(
    "/topics/request", response_model=dict, status_code=status.HTTP_201_CREATED
)
async def create_topic_request(
    request_data: TopicRequestCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_student),
):
    """
    Create a new topic request
    Students can request specific topics they want to learn
    """
    # Validate priority
    valid_priorities = ["low", "medium", "high"]
    if request_data.priority not in valid_priorities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}",
        )

    # Validate preferred teacher if provided
    assigned_teacher_id = None
    if request_data.preferred_teacher_id:
        try:
            teacher_uuid = uuid.UUID(request_data.preferred_teacher_id)

            # Check if teacher exists and is actually a teacher
            res_teacher = await db.execute(
                select(User).filter(
                    User.id == teacher_uuid, User.role == UserRole.TEACHER
                )
            )
            teacher = res_teacher.scalars().first()

            if not teacher:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Preferred teacher not found or is not a teacher",
                )

            # Check if student is assigned to this teacher
            res_rel = await db.execute(
                select(TeacherStudent).filter(
                    TeacherStudent.teacher_id == teacher_uuid,
                    TeacherStudent.student_id == current_user.id,
                )
            )
            relationship = res_rel.scalars().first()

            if not relationship:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You are not assigned to the preferred teacher",
                )

            assigned_teacher_id = teacher_uuid

        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid teacher ID format",
            )

    # Create topic request
    topic_request = StudentTopicRequest(
        id=uuid.uuid4(),
        student_id=current_user.id,
        topic_name=request_data.topic_name,
        subject=request_data.subject,
        description=request_data.description,
        priority=request_data.priority,
        status="pending",
        assigned_teacher_id=assigned_teacher_id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    db.add(topic_request)
    await db.commit()
    await db.refresh(topic_request)

    # Update student's desired topics
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = res_prof.scalars().first()

    if profile:
        if not profile.desired_topics:
            profile.desired_topics = []
        if request_data.topic_name not in profile.desired_topics:
            profile.desired_topics.append(request_data.topic_name)
        profile.updated_at = datetime.now(timezone.utc)
        db.add(profile)
        await db.commit()

    return {
        "success": True,
        "detail": "Topic request created successfully",
        "request_id": str(topic_request.id),
        "topic_name": topic_request.topic_name,
        "subject": topic_request.subject,
        "status": topic_request.status,
        "priority": topic_request.priority,
        "assigned_teacher_id": str(topic_request.assigned_teacher_id)
        if topic_request.assigned_teacher_id
        else None,
    }


@router.get("/topics/my-requests", response_model=List[TopicRequestResponse])
async def get_my_topic_requests(
    request_status: Optional[str] = Query(
        None, description="Filter by status: pending, in_progress, completed"
    ),
    subject: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_student),
):
    """
    Get all topic requests made by the current student
    """
    stmt = select(StudentTopicRequest).filter(
        StudentTopicRequest.student_id == current_user.id
    )

    if request_status:
        stmt = stmt.filter(StudentTopicRequest.status == request_status)

    if subject:
        stmt = stmt.filter(StudentTopicRequest.subject == subject)

    res_reqs = await db.execute(stmt.order_by(StudentTopicRequest.created_at.desc()))
    requests = res_reqs.scalars().all()

    # Bulk fetch assigned teachers
    teacher_ids = [
        req.assigned_teacher_id for req in requests if req.assigned_teacher_id
    ]
    teachers_map = {}
    if teacher_ids:
        res_t = await db.execute(select(User).filter(User.id.in_(teacher_ids)))
        teachers_map = {str(t.id): t.full_name for t in res_t.scalars().all()}

    result = []
    for req in requests:
        # Get teacher name from map
        teacher_name = (
            teachers_map.get(str(req.assigned_teacher_id))
            if req.assigned_teacher_id
            else None
        )

        result.append(
            TopicRequestResponse(
                id=str(req.id),
                topic_name=req.topic_name,
                subject=req.subject,
                description=req.description,
                priority=req.priority,
                status=req.status,
                student_id=str(req.student_id),
                student_name=current_user.full_name,
                assigned_teacher_id=str(req.assigned_teacher_id)
                if req.assigned_teacher_id
                else None,
                assigned_teacher_name=teacher_name,
                created_at=req.created_at,
                updated_at=req.updated_at,
                completed_at=req.completed_at,
            )
        )

    return result


@router.get("/topics/{request_id}", response_model=TopicRequestResponse)
async def get_topic_request(
    request_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_student),
):
    """
    Get details of a specific topic request
    """
    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request ID format"
        )

    res_req = await db.execute(
        select(StudentTopicRequest).filter(
            StudentTopicRequest.id == req_uuid,
            StudentTopicRequest.student_id == current_user.id,
        )
    )
    req = res_req.scalars().first()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Topic request not found"
        )

    # Get teacher name if assigned
    teacher_name = None
    if req.assigned_teacher_id:
        res_t = await db.execute(
            select(User).filter(User.id == req.assigned_teacher_id)
        )
        teacher = res_t.scalars().first()
        teacher_name = teacher.full_name if teacher else None

    return TopicRequestResponse(
        id=str(req.id),
        topic_name=req.topic_name,
        subject=req.subject,
        description=req.description,
        priority=req.priority,
        status=req.status,
        student_id=str(req.student_id),
        student_name=current_user.full_name,
        assigned_teacher_id=str(req.assigned_teacher_id)
        if req.assigned_teacher_id
        else None,
        assigned_teacher_name=teacher_name,
        created_at=req.created_at,
        updated_at=req.updated_at,
        completed_at=req.completed_at,
    )


@router.put("/topics/{request_id}", response_model=dict)
async def update_topic_request(
    request_id: str,
    update_data: TopicRequestUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_student),
):
    """
    Update a topic request
    Only pending requests can be updated
    """
    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request ID format"
        )

    res_req = await db.execute(
        select(StudentTopicRequest).filter(
            StudentTopicRequest.id == req_uuid,
            StudentTopicRequest.student_id == current_user.id,
        )
    )
    req = res_req.scalars().first()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Topic request not found"
        )

    # Only allow updates to pending requests
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be updated",
        )

    # Validate priority if provided
    if update_data.priority:
        valid_priorities = ["low", "medium", "high"]
        if update_data.priority not in valid_priorities:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}",
            )

    # Update fields
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(req, field, value)

    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)

    return {
        "success": True,
        "detail": "Topic request updated successfully",
        "request_id": str(req.id),
    }


@router.delete("/topics/{request_id}", response_model=dict)
async def delete_topic_request(
    request_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_student),
):
    """
    Delete a topic request
    Only pending requests can be deleted
    """
    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request ID format"
        )

    res_req = await db.execute(
        select(StudentTopicRequest).filter(
            StudentTopicRequest.id == req_uuid,
            StudentTopicRequest.student_id == current_user.id,
        )
    )
    req = res_req.scalars().first()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Topic request not found"
        )

    # Only allow deletion of pending requests
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be deleted",
        )

    await db.delete(req)
    await db.commit()

    return {
        "success": True,
        "detail": "Topic request deleted successfully",
        "request_id": request_id,
    }


# Teacher endpoints for managing topic requests
@router.get("/topics/teacher/requests", response_model=List[TopicRequestResponse])
async def get_teacher_topic_requests(
    request_status: Optional[str] = Query(
        None, description="Filter by status: pending, in_progress, completed"
    ),
    subject: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get topic requests assigned to the current teacher or from their students
    """
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this resource",
        )

    # Get all students assigned to this teacher
    res_sids = await db.execute(
        select(TeacherStudent.student_id).filter(
            TeacherStudent.teacher_id == current_user.id
        )
    )
    student_ids = [s[0] for s in res_sids.all()]

    # Query requests from these students or assigned to this teacher
    stmt = select(StudentTopicRequest).filter(
        (StudentTopicRequest.student_id.in_(student_ids))
        | (StudentTopicRequest.assigned_teacher_id == current_user.id)
    )

    if request_status:
        stmt = stmt.filter(StudentTopicRequest.status == request_status)

    if subject:
        stmt = stmt.filter(StudentTopicRequest.subject == subject)

    res_reqs = await db.execute(stmt.order_by(StudentTopicRequest.created_at.desc()))
    requests = res_reqs.scalars().all()

    # Bulk fetch student names
    student_ids = [req.student_id for req in requests]
    students_map = {}
    if student_ids:
        res_stud = await db.execute(select(User).filter(User.id.in_(student_ids)))
        students_map = {str(s.id): s.full_name for s in res_stud.scalars().all()}

    result = []
    for req in requests:
        # Get student name from map
        student_name = students_map.get(str(req.student_id)) or "Unknown"

        result.append(
            TopicRequestResponse(
                id=str(req.id),
                topic_name=req.topic_name,
                subject=req.subject,
                description=req.description,
                priority=req.priority,
                status=req.status,
                student_id=str(req.student_id),
                student_name=student_name,
                assigned_teacher_id=str(req.assigned_teacher_id)
                if req.assigned_teacher_id
                else None,
                assigned_teacher_name=current_user.full_name
                if req.assigned_teacher_id == current_user.id
                else None,
                created_at=req.created_at,
                updated_at=req.updated_at,
                completed_at=req.completed_at,
            )
        )

    return result


@router.put("/topics/{request_id}/assign", response_model=dict)
async def assign_topic_request(
    request_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Assign a topic request to the current teacher
    """
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can assign topic requests",
        )

    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request ID format"
        )

    res_req = await db.execute(
        select(StudentTopicRequest).filter(StudentTopicRequest.id == req_uuid)
    )
    req = res_req.scalars().first()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Topic request not found"
        )

    # Check if this teacher has the student
    res_rel = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == req.student_id,
        )
    )
    relationship = res_rel.scalars().first()

    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This student is not in your roster",
        )

    # Assign to teacher and update status
    req.assigned_teacher_id = current_user.id
    req.status = "in_progress"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "success": True,
        "detail": "Topic request assigned to you",
        "request_id": str(req.id),
        "status": req.status,
    }


@router.put("/topics/{request_id}/complete", response_model=dict)
async def complete_topic_request(
    request_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mark a topic request as completed
    """
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can complete topic requests",
        )

    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request ID format"
        )

    res_req = await db.execute(
        select(StudentTopicRequest).filter(
            StudentTopicRequest.id == req_uuid,
            StudentTopicRequest.assigned_teacher_id == current_user.id,
        )
    )
    req = res_req.scalars().first()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topic request not found or not assigned to you",
        )

    req.status = "completed"
    req.completed_at = datetime.now(timezone.utc)
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "success": True,
        "detail": "Topic request marked as completed",
        "request_id": str(req.id),
        "completed_at": req.completed_at.isoformat(),
    }
