from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, any_, text
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime, timezone

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.subject import Subject, Topic, Lesson
import logging

logger = logging.getLogger(__name__)

from app.services.llm_service import llm_service
from fastapi import BackgroundTasks
import asyncio
import json

router = APIRouter()

def map_grade_level(grade: str) -> str:
    if not grade: return grade
    g = grade.lower().replace(" ", "_")
    
    # Handle Primary X
    if "primary" in g:
        num = "".join(filter(str.isdigit, g))
        if num: return f"P{num}"
        return "PRIMARY"
        
    # Handle JSS X
    if "jss" in g:
        num = "".join(filter(str.isdigit, g))
        if num: return f"JSS{num}"
        return "JSS"
        
    # Handle SS X
    if "ss" in g:
        num = "".join(filter(str.isdigit, g))
        if num: return f"SS{num}"
        return "SS"
        
    if g == "kindergarten": return "KG"
    if g == "nursery_1": return "N1"
    if g == "nursery_2": return "N2"
    if g == "creche": return "CRECHE"
    
    return grade.upper().replace(" ", "")


@router.post("/correct-name")
async def correct_course_name(
    data: dict,
    current_user: User = Depends(get_current_user)
):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    corrected = await llm_service.generate(
        prompt=f"""Fix any spelling mistakes in this course name
and return it in Title Case. Return ONLY the corrected name, 
nothing else. Course name: "{name}" """,
        max_tokens=30,
        temperature=0.0
    )
    # Strip quotes and whitespace from response
    corrected = corrected.strip().strip('"').strip("'")
    return {"corrected": corrected, "original": name}


EDUCATION_LEVEL_MAP = {
    "pre_nursery": ["pre_primary", "nursery", "creche"],
    "nursery_1": ["pre_primary", "nursery", "creche"],
    "nursery_2": ["pre_primary", "nursery", "creche"],
    "primary_1": ["primary"],
    "primary_2": ["primary"],
    "primary_3": ["primary"],
    "primary_4": ["primary", "primary_4"],
    "primary_5": ["primary"],
    "primary_6": ["primary"],
    "jss_1": ["junior_secondary", "secondary"],
    "jss_2": ["junior_secondary", "secondary"],
    "jss_3": ["junior_secondary", "secondary"],
    "ss_1": ["senior_secondary", "secondary"],
    "ss_2": ["senior_secondary", "secondary"],
    "ss_3": ["senior_secondary", "secondary", "ss_3"],
    "waec": ["senior_secondary", "secondary", "ss_3"],
    "neco": ["senior_secondary", "secondary", "ss_3"],
    "jamb": ["senior_secondary", "secondary", "ss_3"],
    "professional": ["professional"],
    "junior_secondary": ["secondary"],
    "senior_secondary": ["secondary"],
}


async def generate_curriculum_for_subject(
    subject_id: str,
    subject_name: str,
    education_level: str,
    db_factory
):
    try:
        from app.models.subject import Topic
        import json
        import re

        prompt = f"""Generate a comprehensive Zero-to-Advanced curriculum
for "{subject_name}" suitable for {education_level} level.

Return ONLY a JSON array of topic objects, nothing else:
[
  {{"name": "Topic Name", "description": "Brief description",
    "sort_order": 1}},
  ...
]

Requirements:
- 8 to 12 topics minimum
- Progress from absolute beginner to advanced
- Each topic builds on the previous one
- Topic names should be specific and descriptive
- Cover both theory and practical application"""

        response = await llm_service.generate(
            prompt=prompt,
            max_tokens=1000,
            temperature=0.3
        )

        # Parse JSON from response
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        if not json_match:
            logger.error(f"[curriculum] No JSON block found in response for {subject_name}")
            return

        topics_data = json.loads(json_match.group())

        async with db_factory() as db:
            try:
                for i, topic_data in enumerate(topics_data):
                    topic = Topic(
                        id=uuid.uuid4(),
                        subject_id=uuid.UUID(subject_id),
                        name=topic_data['name'],
                        description=topic_data.get('description', ''),
                        sort_order=topic_data.get('sort_order', i + 1),
                        is_active=True
                    )
                    db.add(topic)
                await db.commit()
                logger.info(
                    f"[curriculum] Generated {len(topics_data)} topics "
                    f"for {subject_name}"
                )
            except Exception as db_err:
                logger.error(
                    f"[curriculum] DB error saving topics for "
                    f"{subject_name}: {db_err}"
                )
                await db.rollback()

    except Exception as e:
        logger.error(f"[curriculum] Failed to generate: {e}")



class SubjectCreate(BaseModel):
    id: Optional[str] = None
    name: str
    code: Optional[str] = None
    education_level: str
    curriculum_type: Optional[str] = None
    grade_levels: Optional[List[str]] = None
    description: Optional[str] = None
    learning_objectives: Optional[List[str]] = None
    auto_generate_topics: bool = False
    is_private: Optional[bool] = None


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TopicCreate(BaseModel):
    name: str
    description: Optional[str] = None
    difficulty_level: Optional[int] = 1
    estimated_hours: Optional[int] = None
    learning_outcomes: Optional[List[str]] = None


class LessonCreate(BaseModel):
    title: str
    content: Optional[str] = None
    estimated_minutes: Optional[int] = None


@router.get("/")
async def get_subjects(
    education_level: Optional[str] = None,
    grade_level: Optional[str] = None, 
    department: Optional[str] = None,
    curriculum_type: Optional[str] = None,
    search: Optional[str] = None,
    mine: bool = False,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get all subjects with optional filters"""
    from app.models.user import TeacherProfile
    
    # Normalize empty strings to None to avoid incorrect filtering
    if education_level == "": education_level = None
    if grade_level == "": grade_level = None
    if department == "": department = None
    if curriculum_type == "": curriculum_type = None
    
    # Base query for all active subjects
    query = select(Subject).filter(Subject.is_active == True).options(selectinload(Subject.topics))
    
    # Fetch student profile for automatic filtering if logged in as student
    student_profile = None
    if current_user.role == "student":
        from app.models.student import StudentProfile
        res_prof = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == current_user.id))
        student_profile = res_prof.scalars().first()

    # CASE 1: Fetching "My" subjects (linked to profile)
    if mine:
        if current_user.role == "teacher":
            from app.models.user import TeacherProfile
            res_exec = await db.execute(select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id))
            teacher_profile = res_exec.scalars().first()
            linked_subject_ids = []
            if teacher_profile and teacher_profile.subjects_taught:
                try:
                    linked_subject_ids = [uuid.UUID(sid) for sid in teacher_profile.subjects_taught]
                except ValueError:
                    pass
            query = query.filter(
                or_(
                    Subject.created_by == current_user.id,
                    Subject.id.in_(linked_subject_ids)
                )
            )
        elif current_user.role == "student":
            enrolled_ids = []
            if student_profile and student_profile.enrolled_subjects:
                for sid in student_profile.enrolled_subjects:
                    try:
                        enrolled_ids.append(uuid.UUID(str(sid)))
                    except ValueError:
                        continue  # Skip names, they will be healed later
            query = query.filter(Subject.id.in_(enrolled_ids))
    
    # CASE 2: Fetching the general catalog (Global subjects)
    else:
        # Strictly public subjects ONLY (Handle NULL as False)
        query = query.filter(or_(Subject.is_private == False, Subject.is_private == None))

    # AUTO-ENFORCE FILTERS FOR STUDENTS (Grade, Education Level, and Department)
    if student_profile:
        # 1. Normalize and Detect Education Level
        if not education_level and student_profile.education_level:
            education_level = student_profile.education_level.strip() if student_profile.education_level else None
            
        # 2. Normalize and Detect Grade Level
        if not grade_level and student_profile.grade_level:
            raw_grade = str(student_profile.grade_level).strip()
            # Handle list strings or empty strings
            if raw_grade and raw_grade not in ("[]", "{}"):
                grade_level = student_profile.grade_level
        
        # 2b. Derive grade from education_level if still NULL
        if not grade_level and education_level:
            GRADE_FROM_EDUCATION = {
                "ss_1": "SS1", "ss_2": "SS2", "ss_3": "SS3",
                "waec": "SS3", "neco": "SS3", "jamb": "SS3",
                "jss_1": "JSS1", "jss_2": "JSS2", "jss_3": "JSS3",
                "primary_1": "P1", "primary_2": "P2", "primary_3": "P3",
                "primary_4": "P4", "primary_5": "P5", "primary_6": "P6",
            }
            grade_level = GRADE_FROM_EDUCATION.get(education_level)
                
        # 3. Normalize and Detect Department
        if not department and student_profile.department:
            department = student_profile.department.strip() if student_profile.department else None

    # Apply Education Level Filter (Inclusive of sub-mappings)
    if education_level:
        mapped_levels = EDUCATION_LEVEL_MAP.get(education_level, [])
        levels = list(set([education_level] + mapped_levels))
        # Ensure hierarchy coverage
        if any(l in levels for l in ['senior_secondary', 'ss_1', 'ss_2', 'ss_3']):
            if 'senior_secondary' not in levels: levels.append('senior_secondary')
            if 'secondary' not in levels: levels.append('secondary')
        elif any(l in levels for l in ['junior_secondary', 'jss_1', 'jss_2', 'jss_3']):
            if 'junior_secondary' not in levels: levels.append('junior_secondary')
            if 'secondary' not in levels: levels.append('secondary')
            
        query = query.filter(Subject.education_level.in_(levels))

    # Apply Grade Level Filter
    if grade_level:
        mapped_grade = map_grade_level(grade_level)
        # Match specific grade OR general subjects (empty grade list)
        query = query.filter(or_(
            Subject.grade_levels.contains([mapped_grade]),
            Subject.grade_levels == [],
            Subject.grade_levels == None
        ))
    else:
        # If no grade requested/detected, we don't filter BY grade (show all for that ed_level)
        pass

    # Apply Department Filter
    if department:
        # Match specific department OR general subjects (empty department list)
        query = query.filter(or_(
            Subject.departments.contains([department]),
            Subject.departments == [],
            Subject.departments == None
        ))
    else:
        # If no department requested/detected, we don't filter BY department (show all)
        pass

    if curriculum_type:
        query = query.filter(Subject.curriculum_type == curriculum_type)

    if search:
        query = query.filter(Subject.name.ilike(f"%{search}%"))

    # Execute
    res_exec = await db.execute(query)
    subjects = res_exec.scalars().all()
 
    return {
        "subjects": [
            {
                "id": str(s.id),
                "name": s.name,
                "code": s.code,
                "education_level": s.education_level,
                "curriculum_type": s.curriculum_type,
                "description": s.description,
                "grade_levels": s.grade_levels,
                "topic_count": len(s.topics),
            }
            for s in subjects
        ]
    }


@router.post("/")
async def create_subject(
    subject_data: SubjectCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new subject (teacher only, or professional for students)"""
    # FIX 4: Tighten authorization for subject creation
    if current_user.role in ["teacher", "admin"]:
        pass  # allowed
    elif current_user.role == "student":
        # Students can only create subjects for themselves and only if they are professional level
        from app.models.student import StudentProfile
        res_prof = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == current_user.id))
        student_profile = res_prof.scalars().first()
        
        if not student_profile or student_profile.education_level != "professional":
            raise HTTPException(
                status_code=403,
                detail="Only professional students can create custom courses"
            )
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

    from app.models.user import TeacherProfile
    from app.db.database import AsyncSessionLocal
    
    existing_q = select(Subject).filter(
        func.lower(Subject.name) == func.lower(subject_data.name),
        Subject.created_by == current_user.id
    )
    res_existing = await db.execute(existing_q)
    existing = res_existing.scalars().first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f'A subject named "{existing.name}" already exists'
        )
    
    # If the request comes with an existing subject ID (linking scenario instead of creating)
    if hasattr(subject_data, 'id') and subject_data.id:
        res_exec = await db.execute(select(Subject).filter(Subject.id == uuid.UUID(subject_data.id)))
        existing_subject = res_exec.scalars().first()
        if existing_subject:
            res_exec = await db.execute(select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id))
            teacher_profile = res_exec.scalars().first()
            if teacher_profile:
                current_subjects = list(teacher_profile.subjects_taught) if teacher_profile.subjects_taught else []
                if str(existing_subject.id) not in current_subjects:
                    current_subjects.append(str(existing_subject.id))
                    teacher_profile.subjects_taught = current_subjects
                    await db.commit()
            return {
                "success": True,
                "detail": "Subject linked successfully",
                "subject_id": str(existing_subject.id),
                "name": existing_subject.name,
            }

    # Generate code if not provided
    base_code = subject_data.code or subject_data.name.lower().replace(" ", "-")
    
    if subject_data.education_level and subject_data.education_level.lower() == "professional":
        # Custom professional subjects get a unique suffix to prevent global collisions
        code = f"{base_code}-{str(current_user.id)[:8]}"
    else:
        code = base_code

    # Check if code exists
    res_exec = await db.execute(select(Subject).filter(Subject.code == code))
    existing_subject = res_exec.scalars().first()
    if existing_subject:
        if not subject_data.education_level or subject_data.education_level.lower() != "professional":
            # For non-professional, if it exists, auto-link it instead of crashing
            res_exec = await db.execute(select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id))
            teacher_profile = res_exec.scalars().first()
            if teacher_profile:
                current_subjects = list(teacher_profile.subjects_taught) if teacher_profile.subjects_taught else []
                if str(existing_subject.id) not in current_subjects:
                    current_subjects.append(str(existing_subject.id))
                    teacher_profile.subjects_taught = current_subjects
                    await db.commit()
            return {
                "success": True,
                "detail": "Subject linked successfully",
                "subject_id": str(existing_subject.id),
                "name": existing_subject.name,
            }
        else:
            code = f"{base_code}-{uuid.uuid4().hex[:8]}"

    is_prof = False
    if subject_data.education_level and subject_data.education_level.lower() == "professional":
        is_prof = True

    # Enforcement: ALL professional subjects must be private
    # Enforcement: Teachers cannot explicitly make a professional subject public
    is_private_val = subject_data.is_private
    if is_prof:
        if is_private_val is False:
             raise HTTPException(
                status_code=400, 
                detail="Professional subjects cannot be made public"
            )
        is_private_val = True
    elif is_private_val is None:
        # Default for non-professional: Public
        is_private_val = False

    subject = Subject(
        id=uuid.uuid4(),
        name=subject_data.name,
        code=code,
        education_level=subject_data.education_level,
        curriculum_type=subject_data.curriculum_type,
        grade_levels=subject_data.grade_levels or [],
        description=subject_data.description,
        learning_objectives=subject_data.learning_objectives or [],
        created_by=current_user.id,
        is_private=is_private_val,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )

    db.add(subject)
    await db.commit()
    await db.refresh(subject)
 
    # Add to teacher's subjects_taught
    res_exec = await db.execute(select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id))
    teacher_profile = res_exec.scalars().first()
    if teacher_profile:
        current_subjects = list(teacher_profile.subjects_taught) if teacher_profile.subjects_taught else []
        if str(subject.id) not in current_subjects:
            current_subjects.append(str(subject.id))
            teacher_profile.subjects_taught = current_subjects
            await db.commit()
 
    # Trigger background curriculum generation for professional courses
    if getattr(subject_data, 'auto_generate_topics', True):
        background_tasks.add_task(
            generate_curriculum_for_subject,
            str(subject.id),
            subject.name,
            subject.education_level or 'professional',
            AsyncSessionLocal
        )

    return {
        "success": True,
        "detail": "Subject created successfully",
        "subject_id": str(subject.id),
        "name": subject.name,
    }


@router.get("/{subject_id}")
async def get_subject(
    subject_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get subject details with topics"""
    res_exec = await db.execute(
        select(Subject)
        .filter(Subject.id == uuid.UUID(subject_id), Subject.is_active == True)
        .options(selectinload(Subject.topics))
    )
    subject = res_exec.scalars().first()

    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    res_exec = await db.execute(
        select(Topic)
        .filter(Topic.subject_id == subject.id, Topic.is_active == True)
        .options(selectinload(Topic.lessons))
        .order_by(Topic.sort_order)
    )
    topics = res_exec.scalars().all()

    return {
        "id": str(subject.id),
        "name": subject.name,
        "code": subject.code,
        "education_level": subject.education_level,
        "curriculum_type": subject.curriculum_type,
        "description": subject.description,
        "grade_levels": subject.grade_levels,
        "learning_objectives": subject.learning_objectives,
        "topics": [
            {
                "id": str(t.id),
                "name": t.name,
                "description": t.description,
                "difficulty": t.difficulty_level,
                "estimated_hours": t.estimated_hours,
                "lesson_count": len(t.lessons),
                "term": getattr(t, "term", None),
            }
            for t in topics
        ],
    }


@router.get("/{subject_id}/topics")
async def get_topics(
    subject_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get all topics for a subject"""
    res_exec = await db.execute(select(Subject).filter(Subject.id == uuid.UUID(subject_id)))
    subject = res_exec.scalars().first()

    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    res_exec = await db.execute(
        select(Topic)
        .filter(Topic.subject_id == subject.id)
        .order_by(Topic.sort_order)
    )
    topics = res_exec.scalars().all()

    return {
        "topics": [
            {
                "id": str(t.id),
                "name": t.name,
                "description": t.description,
                "display_order": t.sort_order,
                "is_active": t.is_active,
                "term": getattr(t, "term", None),
            }
            for t in topics
        ]
    }


@router.post("/{subject_id}/topics")
async def create_topic(
    subject_id: str,
    topic_data: TopicCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new topic in a subject"""
    res_exec = await db.execute(select(Subject).filter(Subject.id == uuid.UUID(subject_id)))
    subject = res_exec.scalars().first()

    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    if subject.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=403, detail="Only the subject creator can add topics"
        )

    # Get next sort order
    from sqlalchemy import func
    res_count = await db.execute(select(func.count(Topic.id)).filter(Topic.subject_id == subject.id))
    max_order = res_count.scalar() or 0

    topic = Topic(
        id=uuid.uuid4(),
        subject_id=subject.id,
        name=topic_data.name,
        description=topic_data.description,
        difficulty_level=topic_data.difficulty_level,
        sort_order=max_order,
        estimated_hours=topic_data.estimated_hours,
        learning_outcomes=topic_data.learning_outcomes or [],
        is_active=True,
    )

    db.add(topic)
    await db.commit()
    await db.refresh(topic)

    return {"success": True, "detail": "Topic created successfully", "topic_id": str(topic.id)}


@router.get("/curriculum/templates")
async def get_curriculum_templates(
    education_level: Optional[str] = None,
    curriculum_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Get pre-defined curriculum templates"""

    templates = {
        "secondary": {
            "WAEC": {
                "mathematics": [
                    "Number & Numeration",
                    "Algebraic Processes",
                    "Mensuration",
                    "Plane Geometry",
                    "Trigonometry",
                    "Statistics & Probability",
                    "Calculus",
                ],
                "english": [
                    "Lexis & Structure",
                    "Essay Writing",
                    "Comprehension",
                    "Summary Writing",
                    "Oral English",
                    "Literature",
                ],
                "physics": [
                    "Measurements & Units",
                    "Scalars & Vectors",
                    "Mechanics",
                    "Heat Energy",
                    "Waves",
                    "Optics",
                    "Electricity",
                    "Atomic & Nuclear Physics",
                ],
            },
            "NECO": {
                # Similar structure for NECO
            },
        },
        "primary": {
            "general": {
                "mathematics": [
                    "Numbers",
                    "Addition",
                    "Subtraction",
                    "Multiplication",
                    "Division",
                    "Fractions",
                ],
                "english": [
                    "Reading",
                    "Writing",
                    "Speaking",
                    "Grammar",
                    "Comprehension",
                ],
                "basic_science": [
                    "Living Things",
                    "Non-Living Things",
                    "Environment",
                    "Health",
                ],
            }
        },
    }

    if education_level and curriculum_type:
        return templates.get(education_level, {}).get(curriculum_type, {})

    return templates

@router.post("/cleanup-garbage")
async def cleanup_garbage(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # 1. Topics
    garbage_topics = ["CLASS", "SUBJECT", "TERM", "TOPICS"]
    await db.execute(text("DELETE FROM lessons WHERE topic_id IN (SELECT id FROM topics WHERE name = ANY(:topics))"), {"topics": garbage_topics})
    await db.execute(text("DELETE FROM topics WHERE name = ANY(:topics)"), {"topics": garbage_topics})
    
    # 2. Subjects
    placeholder_codes = ['MAT-SS_', 'ENG-SS_', 'PHY-SS_']
    res = await db.execute(text("SELECT id FROM subjects WHERE code = ANY(:codes)"), {"codes": placeholder_codes})
    subj_ids = [str(r[0]) for r in res.fetchall()]
    
    if subj_ids:
        await db.execute(text("DELETE FROM student_subject WHERE subject_id = ANY(:ids)"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM teacher_subject WHERE subject_id = ANY(:ids)"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM lessons WHERE topic_id IN (SELECT id FROM topics WHERE subject_id = ANY(:ids))"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM topics WHERE subject_id = ANY(:ids)"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM mock_exam_series WHERE subject_id = ANY(:ids)"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM subjects WHERE id = ANY(:ids)"), {"ids": subj_ids})
        
    await db.commit()
    return {"status": "Cleaned up", "deleted_subject_ids": subj_ids}
