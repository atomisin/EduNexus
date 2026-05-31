import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.junction_tables import StudentTopicProgress, student_subject
from app.models.student import StudentProfile
from app.models.subject import Subject, Topic
from app.services.llm_service import llm_service
from app.utils.topic_filters import filter_learning_topics


def _course_code(course_name: str) -> str:
    prefix = "".join(ch for ch in course_name.upper() if ch.isalnum())[:12] or "COURSE"
    return f"PROF-{prefix}-{str(uuid.uuid4())[:8]}"


async def generate_and_enroll_custom_course(
    db: AsyncSession,
    *,
    student_id: uuid.UUID,
    course_name: str,
    user_id_for_llm: uuid.UUID | None = None,
) -> dict:
    """Create the approved private professional course and enroll the student."""
    clean_name = course_name.strip()
    if not clean_name:
        raise ValueError("Approved course name is required")

    profile_result = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == student_id)
    )
    profile = profile_result.scalars().first()
    if not profile or profile.education_level != "professional":
        raise ValueError("Student must be on the professional track")

    response_data = await llm_service.generate_subtopics(
        topic=clean_name,
        subject="Professional Career Track",
        education_level="professional",
        user_id=user_id_for_llm or student_id,
    )
    subtopics = [
        str(item).strip()
        for item in response_data.get("subtopics", [])
        if str(item).strip()
    ]
    corrected_course_name = str(response_data.get("corrected_topic") or clean_name).strip()
    if not subtopics:
        raise ValueError("Failed to generate curriculum using AI")

    subject_result = await db.execute(
        select(Subject).filter(
            Subject.name == corrected_course_name,
            Subject.education_level == "professional",
            Subject.created_by == student_id,
        )
    )
    subject = subject_result.scalars().first()

    if not subject:
        subject = Subject(
            id=uuid.uuid4(),
            name=corrected_course_name,
            code=_course_code(corrected_course_name),
            description=f"Comprehensive professional curriculum for {corrected_course_name}",
            education_level="professional",
            created_by=student_id,
            is_private=True,
            is_active=True,
        )
        db.add(subject)
        await db.flush()

        for index, topic_name in enumerate(subtopics):
            topic = Topic(
                id=uuid.uuid4(),
                subject_id=subject.id,
                name=topic_name[:250],
                description=f"Core module for {corrected_course_name}: {topic_name}",
                sort_order=index,
            )
            db.add(topic)

    await db.execute(
        pg_insert(student_subject)
        .values(student_id=student_id, subject_id=subject.id)
        .on_conflict_do_nothing(index_elements=["student_id", "subject_id"])
    )

    current_enrolled = list(profile.enrolled_subjects or [])
    if str(subject.id) not in current_enrolled:
        current_enrolled.append(str(subject.id))
        profile.enrolled_subjects = current_enrolled

    profile.course_name = corrected_course_name
    profile.professional_curriculum = {"subtopics": subtopics}
    profile.updated_at = datetime.now(timezone.utc)

    topic_result = await db.execute(
        select(Topic).filter(Topic.subject_id == subject.id).order_by(Topic.sort_order.asc())
    )
    first_topic = next(iter(filter_learning_topics(topic_result.scalars().all())), None)
    if first_topic:
        await db.execute(
            pg_insert(StudentTopicProgress.__table__)
            .values(
                student_id=student_id,
                topic_id=first_topic.id,
                subject_id=subject.id,
                status="unlocked",
                unlocked_at=datetime.now(timezone.utc),
                progress_pct=0,
            )
            .on_conflict_do_nothing(index_elements=["student_id", "topic_id"])
        )

    return {
        "subject_id": str(subject.id),
        "course_name": corrected_course_name,
        "subtopics_count": len(subtopics),
        "enrolled_subjects": current_enrolled,
    }
