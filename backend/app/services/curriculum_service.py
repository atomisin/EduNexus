from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
import logging
from app.models.subject import Subject, Topic
from app.models.student import StudentProfile
from app.models.junction_tables import StudentTopicProgress
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class CurriculumService:
    @staticmethod
    async def enroll_student_in_grade_curriculum(
        db: AsyncSession, 
        student_id: uuid.UUID, 
        grade_level: str
    ):
        """
        Automatically enroll a student in all subjects mapped to their grade level,
        respecting department and exam targets.
        """
        try:
            # 1. Get student profile
            prof_result = await db.execute(
                select(StudentProfile).filter(StudentProfile.user_id == student_id)
            )
            profile = prof_result.scalars().first()
            if not profile:
                logger.error(f"Student profile not found for user: {student_id}")
                return

            # 2. Base query for subjects
            query = select(Subject).filter(
                Subject.is_active == True,
                Subject.is_private == False,
                Subject.grade_levels.any(grade_level)
            )

            # 3. Apply Departmental Filtering for SS level
            if grade_level.upper() in ["SS1", "SS2", "SS3"] and profile.department:
                # Nigerian subjects often have ["Science", "Art", "Commercial"] tags
                # We filter for subjects that are either for all or for the student's department
                query = query.filter(
                    (Subject.departments == []) | 
                    (Subject.departments.any(profile.department))
                )
            
            # 4. Handle Exam Targets (e.g. JAMB subjects)
            # If student has specific JAMB subjects selected, we add them
            if profile.jamb_subjects:
                jamb_query = select(Subject).filter(
                    Subject.id.in_(profile.jamb_subjects)
                )
                jamb_res = await db.execute(jamb_query)
                jamb_subjects = list(jamb_res.scalars().all())
            else:
                jamb_subjects = []

            # 5. Enforce Mandatory Subjects by track (Self-healing fallback)
            mandatory_names = []
            if grade_level.upper() == "JAMB":
                mandatory_names = ["Use of English"]
            elif grade_level.upper() in ["WAEC", "NECO", "SS1", "SS2", "SS3"]:
                mandatory_names = ["Mathematics", "English Language"]
            
            mandatory_subjects = []
            if mandatory_names:
                mand_res = await db.execute(
                    select(Subject).filter(
                        Subject.name.in_(mandatory_names),
                        Subject.is_active == True
                    )
                )
                mandatory_subjects = list(mand_res.scalars().all())

            result = await db.execute(query)
            subjects = list(result.scalars().all())
            
            # Combine grade subjects, specific exam subjects, and mandatory fallbacks
            # Use sets to prevent duplicates by ID
            merged_dict = {s.id: s for s in subjects + jamb_subjects + mandatory_subjects}
            all_target_subjects = list(merged_dict.values())
            
            if not all_target_subjects:
                logger.info(f"No subjects found for student {student_id} with grade {grade_level}")
                return
            
            current_enrolled = list(profile.enrolled_subjects or [])
            newly_enrolled = []
            
            for subject in all_target_subjects:
                subj_id_str = str(subject.id)
                if subj_id_str not in current_enrolled:
                    current_enrolled.append(subj_id_str)
                    newly_enrolled.append(subject)
            
            if newly_enrolled:
                profile.enrolled_subjects = current_enrolled
                await db.flush()
                
                # 5. Auto-unlock first topic for each newly enrolled subject
                for subject in newly_enrolled:
                    topic_res = await db.execute(
                        select(Topic)
                        .filter(Topic.subject_id == subject.id)
                        .order_by(Topic.sort_order.asc(), Topic.id.asc())
                        .limit(1)
                    )
                    first_topic = topic_res.scalars().first()
                    if first_topic:
                        # Check if progress exists
                        prog_res = await db.execute(
                            select(StudentTopicProgress).filter(
                                StudentTopicProgress.student_id == student_id,
                                StudentTopicProgress.topic_id == first_topic.id
                            )
                        )
                        if not prog_res.scalars().first():
                            progress = StudentTopicProgress(
                                student_id=student_id,
                                topic_id=first_topic.id,
                                subject_id=subject.id,
                                status="in_progress",
                                unlocked_at=datetime.now(timezone.utc)
                            )
                            db.add(progress)
                
                await db.commit()
                logger.info(f"Auto-enrolled student {student_id} in {len(newly_enrolled)} subjects (Dept: {profile.department})")
                
        except Exception as e:
            logger.error(f"Error in auto-enrollment: {e}")
            await db.rollback()

curriculum_service = CurriculumService()
