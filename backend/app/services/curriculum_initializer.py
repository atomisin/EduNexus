import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from app.db.database import AsyncSessionLocal
from app.models.student import StudentProfile
from app.models.subject import Subject, Topic
from app.models.junction_tables import StudentTopicProgress
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

async def initialize_professional_curriculum(user_id: str, course_name: str):
    """Generate subtopics via AI, create a custom subject, and enroll the student."""
    async with AsyncSessionLocal() as db:
        try:
            res_prof = await db.execute(
                select(StudentProfile).filter(StudentProfile.user_id == uuid.UUID(user_id))
            )
            profile = res_prof.scalars().first()
            if not profile:
                return

            response_data = await llm_service.generate_subtopics(
                topic=course_name,
                subject="Professional Career Track",
                education_level="professional",
            )
            subtopics = response_data.get("subtopics", [])
            corrected_course_name = response_data.get("corrected_topic", course_name)

            profile.course_name = corrected_course_name

            if subtopics:
                profile.professional_curriculum = {"subtopics": subtopics}

                res_subj = await db.execute(
                    select(Subject).filter(
                        Subject.name == corrected_course_name,
                        Subject.education_level == "professional",
                        Subject.created_by == uuid.UUID(user_id),
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
                        created_by=uuid.UUID(user_id),
                        is_private=True,
                        is_active=True,
                        created_at=datetime.now(timezone.utc),
                    )
                    db.add(new_subject)
                    await db.flush()
                    new_subject_id = new_subject.id

                    for i, st_name in enumerate(subtopics):
                        topic = Topic(
                            id=uuid.uuid4(),
                            subject_id=new_subject.id,
                            name=st_name,
                            description=f"Core module for {corrected_course_name}: {st_name}",
                            sort_order=i,
                            is_active=True,
                        )
                        db.add(topic)
                
                current_enrolled = list(profile.enrolled_subjects or [])
                if str(new_subject_id) not in current_enrolled:
                    current_enrolled.append(str(new_subject_id))
                    profile.enrolled_subjects = current_enrolled

                    res_topic = await db.execute(
                        select(Topic)
                        .filter(Topic.subject_id == new_subject_id)
                        .order_by(Topic.sort_order.asc())
                        .limit(1)
                    )
                    first_topic = res_topic.scalars().first()
                    if first_topic:
                        progress = StudentTopicProgress(
                            student_id=uuid.UUID(user_id),
                            topic_id=first_topic.id,
                            subject_id=new_subject_id,
                            status="unlocked",
                            unlocked_at=datetime.now(timezone.utc),
                        )
                        db.add(progress)

            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to generate professional curriculum during registration: {e}")


async def initialize_standard_curriculum(user_id: str, education_level: str, curriculum_type: str):
    """Seed templates and enroll."""
    async with AsyncSessionLocal() as db:
        try:
            res_prof = await db.execute(
                select(StudentProfile).filter(StudentProfile.user_id == uuid.UUID(user_id))
            )
            profile = res_prof.scalars().first()
            if not profile:
                return

            templates = {
                "secondary": {
                    "WAEC": {
                        "mathematics": [
                            "Number & Numeration", "Algebraic Processes", "Mensuration",
                            "Plane Geometry", "Trigonometry", "Statistics & Probability", "Calculus",
                        ],
                        "english": [
                            "Lexis & Structure", "Essay Writing", "Comprehension",
                            "Summary Writing", "Oral English", "Literature",
                        ],
                        "physics": [
                            "Measurements & Units", "Scalars & Vectors", "Mechanics",
                            "Heat Energy", "Waves", "Optics", "Electricity", "Atomic & Nuclear Physics",
                        ],
                    },
                },
                "primary": {
                    "general": {
                        "mathematics": [
                            "Numbers", "Addition", "Subtraction", "Multiplication", "Division", "Fractions",
                        ],
                        "english": [
                            "Reading", "Writing", "Speaking", "Grammar", "Comprehension",
                        ],
                        "basic_science": [
                            "Living Things", "Non-Living Things", "Environment", "Health",
                        ],
                    }
                },
            }

            ed_lvl_key = education_level.lower() if education_level else "primary"
            is_exam_level = any(k in ed_lvl_key for k in ['jamb', 'waec', 'neco'])
            
            if is_exam_level:
                ed_lvl_key = 'secondary'
            elif any(k in ed_lvl_key for k in ['secondary', 'ss', 'jss', 'high']):
                ed_lvl_key = 'secondary'
            elif any(k in ed_lvl_key for k in ['primary', 'kg', 'nursery', 'basic']):
                ed_lvl_key = 'primary'
            else:
                # If we don't know the level, don't guess if it's potentially an exam
                if education_level:
                    return 
                ed_lvl_key = 'primary'
                
            curr_type_key = curriculum_type.upper() if curriculum_type else 'GENERAL'
            if ed_lvl_key == 'primary':
                curr_type_key = 'general'
            
            # If it's an exam level, we strictly use the curriculum type
            level_templates = templates.get(ed_lvl_key, {})
            subjects_dict = level_templates.get(curr_type_key, {})
            
            # For JAMB/WAEC/NECO, if they already have subjects from registration, 
            # we should SKIP the template auto-logic to prevent "Basic Science" leakage
            current_enrolled = list(profile.enrolled_subjects or [])
            if is_exam_level and current_enrolled:
                logger.info(f"Student {user_id} already has subjects enrolled. Skipping template initialization.")
                return

            # fallback to generic secondary if specific exam template is missing (e.g. NECO uses WAEC base)
            if not subjects_dict and ed_lvl_key == 'secondary':
                 subjects_dict = level_templates.get('WAEC', {})
                
            if not subjects_dict:
                return

            enrolled_ids = list(profile.enrolled_subjects or [])

            for subj_name, topics in subjects_dict.items():
                title_case_name = subj_name.replace('_', ' ').title()
                
                res_subj = await db.execute(
                    select(Subject).filter(
                        Subject.name == title_case_name,
                        Subject.education_level == education_level,
                        Subject.is_private == False
                    )
                )
                subject = res_subj.scalars().first()

                if not subject:
                    subject = Subject(
                        id=uuid.uuid4(),
                        name=title_case_name,
                        code=f"{title_case_name[:3].upper()}-{education_level[:3].upper()}",
                        education_level=education_level,
                        curriculum_type=curriculum_type,
                        description=f"Standard curriculum for {title_case_name}",
                        is_private=False,
                        is_active=True,
                        created_at=datetime.now(timezone.utc),
                        # Default teacher assignment conceptually implies empty
                        created_by=None
                    )
                    db.add(subject)
                    await db.flush()

                    for i, t_name in enumerate(topics):
                        topic = Topic(
                            id=uuid.uuid4(),
                            subject_id=subject.id,
                            name=t_name,
                            description=f"{t_name} module",
                            sort_order=i,
                            is_active=True,
                        )
                        db.add(topic)
                
                subj_id_str = str(subject.id)
                if subj_id_str not in enrolled_ids:
                    enrolled_ids.append(subj_id_str)
                    
                    res_topic = await db.execute(
                        select(Topic)
                        .filter(Topic.subject_id == subject.id)
                        .order_by(Topic.sort_order.asc())
                        .limit(1)
                    )
                    first_topic = res_topic.scalars().first()
                    if first_topic:
                        res_prog = await db.execute(
                            select(StudentTopicProgress).filter(
                                StudentTopicProgress.student_id == uuid.UUID(user_id),
                                StudentTopicProgress.topic_id == first_topic.id
                            )
                        )
                        if not res_prog.scalars().first():
                            progress = StudentTopicProgress(
                                student_id=uuid.UUID(user_id),
                                topic_id=first_topic.id,
                                subject_id=subject.id,
                                status="unlocked",
                                unlocked_at=datetime.now(timezone.utc),
                            )
                            db.add(progress)

            profile.enrolled_subjects = enrolled_ids
            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to auto-load standard subjects during registration: {e}")
