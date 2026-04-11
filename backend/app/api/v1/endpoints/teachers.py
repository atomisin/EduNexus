"""
Teacher endpoints for managing students
Teachers can add, remove, and manage their students
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime, timezone
import secrets
import string

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole, TeacherStudent, TeacherProfile, UserStatus
from app.models.student import StudentProfile
from app.core.security import pwd_context
from app.services.storage_service import storage_service

router = APIRouter()


class AddStudentRequest(BaseModel):
    student_email: Optional[str] = None
    student_id: Optional[str] = None
    notes: Optional[str] = None


class RegisterStudentRequest(BaseModel):
    full_name: str
    username: str
    email: str
    password: str
    phone_number: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_email: Optional[str] = None
    education_level: Optional[str] = None
    grade_level: Optional[str] = None
    school_name: Optional[str] = None
    curriculum_type: Optional[str] = None
    notes: Optional[str] = None


class UpdateStudentNotes(BaseModel):
    notes: str


class StudentResponse(BaseModel):
    id: str
    email: str
    full_name: str
    username: str
    phone_number: Optional[str]
    added_at: datetime
    notes: Optional[str]
    # Student profile data
    learning_style: Optional[str]
    education_level: Optional[str]
    grade_level: Optional[str]
    school_name: Optional[str]
    subject_proficiency: Optional[dict]
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


def require_teacher(current_user: User = Depends(get_current_user)):
    """Dependency to ensure only teachers can access these endpoints"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this resource",
        )
    return current_user


@router.post(
    "/register-student", response_model=dict, status_code=status.HTTP_201_CREATED
)
async def register_student(
    request: RegisterStudentRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Register a new student and add them to the teacher's roster.
    Allows specifying guardian details.
    """
    # Check teacher's student limit
    res_teacher_profile = await db.execute(
        select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id)
    )
    teacher_profile = res_teacher_profile.scalars().first()

    if teacher_profile:
        res_current_count = await db.execute(
            select(func.count(TeacherStudent.id)).filter(
                TeacherStudent.teacher_id == current_user.id
            )
        )
        current_count = res_current_count.scalar_one()

        max_allowed = teacher_profile.max_students or 10

        if current_count >= max_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You have reached your student limit ({max_allowed}). Please upgrade your plan to register more students.",
            )

    # Check for existing user
    res_user = await db.execute(
        select(User).filter(
            (User.email == request.email) | (User.username == request.username)
        )
    )
    existing_user = res_user.scalars().first()

    if existing_user:
        error_detail = (
            "Email already registered"
            if existing_user.email == request.email
            else "Username already taken"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=error_detail
        )

    # Generate random temp password if not provided
    temp_password = request.password
    if not temp_password or temp_password.strip() == "":
        alphabet = string.ascii_letters + string.digits
        temp_password = "".join(secrets.choice(alphabet) for _ in range(12))

    # Create User
    new_user = User(
        id=uuid.uuid4(),
        email=request.email,
        username=request.username,
        hashed_password=pwd_context.hash(temp_password),
        full_name=request.full_name,
        phone_number=request.phone_number,
        role=UserRole.STUDENT,
        status=UserStatus.ACTIVE,  # Automatically activate since teacher registered them
        email_verified_at=datetime.now(
            timezone.utc
        ),  # Assume verified since teacher registered
        force_password_change=True,
    )

    db.add(new_user)
    await db.flush()  # Flush to get the ID for relationships

    # Create Student Profile
    new_profile = StudentProfile(
        id=uuid.uuid4(),
        user_id=new_user.id,
        education_level=request.education_level,
        grade_level=request.grade_level,
        school_name=request.school_name,
        curriculum_type=request.curriculum_type,
        guardian_name=request.guardian_name,
        guardian_email=request.guardian_email,
    )

    db.add(new_profile)

    # Create Teacher-Student link
    teacher_student = TeacherStudent(
        id=uuid.uuid4(),
        teacher_id=current_user.id,
        student_id=new_user.id,
        added_at=datetime.now(timezone.utc),
        notes=request.notes,
    )

    db.add(teacher_student)

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register student: {str(e)}",
        )

    return {
        "success": True,
        "detail": f"Student {new_user.full_name} registered and added to your roster successfully",
        "student_id": str(new_user.id),
        "username": new_user.username,
        "email": new_user.email,
        "temporary_password": temp_password if not request.password else "****",
    }


@router.post("/students/add", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_student(
    request: AddStudentRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Add a student to the teacher's roster
    Teacher can add by student email or student ID
    """
    # Check teacher's student limit
    res_prof = await db.execute(
        select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id)
    )
    teacher_profile = res_prof.scalars().first()

    if teacher_profile:
        res_count = await db.execute(
            select(func.count(TeacherStudent.id)).filter(
                TeacherStudent.teacher_id == current_user.id
            )
        )
        current_count = res_count.scalar_one()

        max_allowed = teacher_profile.max_students or 10

        if current_count >= max_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You have reached your student limit ({max_allowed}). Please upgrade your plan to add more students.",
            )

    # Find student
    student = None
    if request.student_email:
        res_user = await db.execute(
            select(User).filter(
                User.email == request.student_email, User.role == UserRole.STUDENT
            )
        )
        student = res_user.scalars().first()
    elif request.student_id:
        try:
            student_uuid = uuid.UUID(request.student_id)
            res_user = await db.execute(
                select(User).filter(
                    User.id == student_uuid, User.role == UserRole.STUDENT
                )
            )
            student = res_user.scalars().first()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid student ID format",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide either student_email or student_id",
        )

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found. Make sure the student has registered and you're using the correct email or ID.",
        )

    # Check if already added
    res_existing = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == student.id,
        )
    )
    existing = res_existing.scalars().first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student is already in your roster",
        )

    # Create teacher-student relationship
    teacher_student = TeacherStudent(
        id=uuid.uuid4(),
        teacher_id=current_user.id,
        student_id=student.id,
        added_at=datetime.now(timezone.utc),
        notes=request.notes,
    )

    db.add(teacher_student)
    await db.commit()

    # Get updated count
    res_count = await db.execute(
        select(func.count(TeacherStudent.id)).filter(
            TeacherStudent.teacher_id == current_user.id
        )
    )
    new_count = res_count.scalar_one()

    return {
        "success": True,
        "detail": f"Student {student.full_name} added to your roster successfully",
        "student_id": str(student.id),
        "student_name": student.full_name,
        "student_email": student.email,
        "added_at": teacher_student.added_at.isoformat(),
        "current_student_count": new_count,
        "max_students": max_allowed if teacher_profile else 10,
        "slots_remaining": (max_allowed if teacher_profile else 10) - new_count,
    }


@router.delete("/students/{student_id}", response_model=dict)
async def remove_student(
    student_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Remove a student from the teacher's roster
    This doesn't delete the student account, just removes the relationship
    """
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid student ID format"
        )

    # Find the relationship
    res_relationship = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == student_uuid,
        )
    )
    relationship = res_relationship.scalars().first()

    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found in your roster",
        )

    # Get student info before deletion
    res_user = await db.execute(select(User).filter(User.id == student_uuid))
    student = res_user.scalars().first()
    student_name = student.full_name if student else "Unknown"

    # Delete the relationship
    await db.delete(relationship)
    await db.commit()

    return {
        "success": True,
        "detail": f"Student {student_name} removed from your roster",
        "student_id": student_id,
    }


@router.get("/students", response_model=List[StudentResponse])
async def get_my_students(
    search: Optional[str] = Query(None, description="Search by name or email"),
    education_level: Optional[str] = Query(
        None, description="Filter by education level"
    ),
    learning_style: Optional[str] = Query(None, description="Filter by learning style"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Get all students assigned to the current teacher
    Supports filtering and searching
    Combines students from both teacher_students and teacher_student_links tables
    """
    students_dict = {}

    # Query students through the TeacherStudent relationship (registered students)
    stmt1 = (
        select(User, TeacherStudent, StudentProfile)
        .join(TeacherStudent, User.id == TeacherStudent.student_id)
        .outerjoin(StudentProfile, User.id == StudentProfile.user_id)
        .filter(TeacherStudent.teacher_id == current_user.id)
    )

    # Apply filters to query1
    if search:
        search_filter = f"%{search}%"
        stmt1 = stmt1.filter(
            (User.full_name.ilike(search_filter)) | (User.email.ilike(search_filter))
        )

    if education_level:
        stmt1 = stmt1.filter(StudentProfile.education_level == education_level)

    if learning_style:
        stmt1 = stmt1.filter(StudentProfile.learning_style == learning_style)

    res1 = await db.execute(stmt1)
    results1 = res1.all()

    # Add students from TeacherStudent
    for user, relationship, profile in results1:
        student_data = StudentResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            username=user.username,
            phone_number=user.phone_number,
            added_at=relationship.added_at,
            notes=relationship.notes,
            learning_style=profile.learning_style if profile else None,
            education_level=profile.education_level if profile else None,
            grade_level=profile.grade_level if profile else None,
            school_name=profile.school_name if profile else None,
            subject_proficiency=profile.subject_proficiency if profile else None,
            avatar_url=storage_service.resolve_url(user.avatar_url),
        )
        students_dict[str(user.id)] = student_data

    # Query students through the TeacherStudent relationship (students added by ID)
    stmt2 = (
        select(User, TeacherStudent, StudentProfile)
        .join(TeacherStudent, User.id == TeacherStudent.student_id)
        .outerjoin(StudentProfile, User.id == StudentProfile.user_id)
        .filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.status == "active",
        )
    )

    # Apply filters to query2
    if search:
        search_filter = f"%{search}%"
        stmt2 = stmt2.filter(
            (User.full_name.ilike(search_filter)) | (User.email.ilike(search_filter))
        )

    if education_level:
        stmt2 = stmt2.filter(StudentProfile.education_level == education_level)

    if learning_style:
        stmt2 = stmt2.filter(StudentProfile.learning_style == learning_style)

    res2 = await db.execute(stmt2)
    results2 = res2.all()

    # Add students from TeacherStudent (don't overwrite existing)
    for user, link, profile in results2:
        if str(user.id) not in students_dict:
            student_data = StudentResponse(
                id=str(user.id),
                email=user.email,
                full_name=user.full_name,
                username=user.username,
                phone_number=user.phone_number,
                added_at=link.added_at,
                notes=link.private_notes,
                learning_style=profile.learning_style if profile else None,
                education_level=profile.education_level if profile else None,
                grade_level=profile.grade_level if profile else None,
                school_name=profile.school_name if profile else None,
                subject_proficiency=profile.subject_proficiency if profile else None,
                avatar_url=storage_service.resolve_url(user.avatar_url),
            )
            students_dict[str(user.id)] = student_data

    return list(students_dict.values())


@router.get("/students/{student_id}", response_model=StudentResponse)
async def get_student_details(
    student_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Get detailed information about a specific student
    Includes learning patterns and progress data
    """
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid student ID format"
        )

    res_rel = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == student_uuid,
            TeacherStudent.status == "active",
        )
    )
    relationship = res_rel.scalars().first()

    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found in your roster",
        )

    added_at = relationship.added_at
    # We prefer private_notes if set, otherwise fallback to the general notes
    notes = relationship.private_notes or relationship.notes

    # Get student with profile
    res_stmt = await db.execute(
        select(User, StudentProfile)
        .outerjoin(StudentProfile, User.id == StudentProfile.user_id)
        .filter(User.id == student_uuid)
    )
    result = res_stmt.first()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )

    user, profile = result

    return StudentResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        username=user.username,
        phone_number=user.phone_number,
        added_at=added_at,
        notes=notes,
        learning_style=profile.learning_style if profile else None,
        education_level=profile.education_level if profile else None,
        grade_level=profile.grade_level if profile else None,
        school_name=profile.school_name if profile else None,
        subject_proficiency=profile.subject_proficiency if profile else None,
        avatar_url=storage_service.resolve_url(user.avatar_url),
    )


@router.put("/students/{student_id}/notes", response_model=dict)
async def update_student_notes(
    student_id: str,
    notes_data: UpdateStudentNotes,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Update notes for a specific student
    Useful for tracking progress, behavior, or private observations
    """
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid student ID format"
        )

    # Find the relationship
    res_rel = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == student_uuid,
        )
    )
    relationship = res_rel.scalars().first()

    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found in your roster",
        )

    # Update notes
    relationship.notes = notes_data.notes
    await db.commit()

    return {
        "success": True,
        "detail": "Notes updated successfully",
        "student_id": student_id,
        "notes": relationship.notes,
    }


@router.get("/students/{student_id}/learning-analytics", response_model=dict)
async def get_student_learning_analytics(
    student_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Get detailed learning analytics for a student
    Includes learning patterns, assimilation level, and personalized insights
    """
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid student ID format"
        )

    # Verify the student belongs to this teacher
    res_rel = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == student_uuid,
            TeacherStudent.status == "active",
        )
    )
    relationship = res_rel.scalars().first()

    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found in your roster",
        )

    # Get the student user for name
    res_user = await db.execute(select(User).filter(User.id == student_uuid))
    student_user = res_user.scalars().first()
    student_name = student_user.full_name if student_user else "Unknown"

    # Get student profile with learning data
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == student_uuid)
    )
    profile = res_prof.scalars().first()

    if not profile:
        # Return default analytics instead of 404
        return {
            "student_id": student_id,
            "student_name": student_name,
            "learning_profile": {
                "learning_style": None,
                "preferred_pace": None,
                "attention_span_minutes": None,
                "best_study_time": None,
            },
            "academic_info": {
                "education_level": None,
                "grade_level": None,
                "school_name": None,
                "curriculum_type": None,
            },
            "assimilation_metrics": {
                "level": "New Student",
                "score": 0,
                "color": "slate",
                "subject_breakdown": {},
            },
            "strengths": [],
            "focus_areas": [],
            "career_interests": [],
            "learning_recommendations": [],
            "suggested_focus_areas": [],
            "engagement_patterns": {},
        }

    # Calculate assimilation level based on subject proficiency
    proficiency = profile.subject_proficiency or {}
    avg_proficiency = sum(proficiency.values()) / len(proficiency) if proficiency else 0

    # Determine assimilation level with more rigorous thresholds
    if avg_proficiency >= 0.95:
        assimilation_level = "Elite Mastery"
        assimilation_color = "emerald"
    elif avg_proficiency >= 0.85:
        assimilation_level = "Advanced Deep"
        assimilation_color = "green"
    elif avg_proficiency >= 0.75:
        assimilation_level = "Proficient Logic"
        assimilation_color = "blue"
    elif avg_proficiency >= 0.55:
        assimilation_level = "Developing Criticality"
        assimilation_color = "yellow"
    else:
        assimilation_level = "Foundational/Rigorous Revision Required"
        assimilation_color = "orange"

    return {
        "student_id": student_id,
        "student_name": student_name,
        "learning_profile": {
            "learning_style": profile.learning_style,
            "preferred_pace": profile.preferred_pace,
            "attention_span_minutes": profile.attention_span,
            "best_study_time": profile.best_study_time,
        },
        "academic_info": {
            "education_level": profile.education_level,
            "grade_level": profile.grade_level,
            "school_name": profile.school_name,
            "curriculum_type": profile.curriculum_type,
        },
        "assimilation_metrics": {
            "level": assimilation_level,
            "score": round(avg_proficiency * 100, 1),
            "color": assimilation_color,
            "subject_breakdown": proficiency,
        },
        "strengths": profile.strength_areas or [],
        "focus_areas": profile.weakness_areas or [],
        "career_interests": profile.career_interests or [],
        "learning_recommendations": profile.learning_recommendations or [],
        "suggested_focus_areas": profile.suggested_focus_areas or [],
        "engagement_patterns": profile.engagement_patterns or {},
    }


@router.get("/students/{student_id}/progress-summary", response_model=dict)
async def get_student_progress_summary(
    student_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Get a quick progress summary for a student
    Useful for dashboard views
    """
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid student ID format"
        )

    # Verify the student belongs to this teacher
    res_rel = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == student_uuid,
            TeacherStudent.status == "active",
        )
    )
    relationship = res_rel.scalars().first()

    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found in your roster",
        )

    # Get student user for name
    res_user = await db.execute(select(User).filter(User.id == student_uuid))
    student_user = res_user.scalars().first()
    student_name = student_user.full_name if student_user else "Unknown"

    # Get student profile
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == student_uuid)
    )
    profile = res_prof.scalars().first()

    if not profile:
        return {
            "student_id": student_id,
            "student_name": student_name,
            "has_profile": False,
            "success": True,
            "detail": "Student profile not yet created",
        }

    # Calculate overall progress
    proficiency = profile.subject_proficiency or {}
    avg_score = sum(proficiency.values()) / len(proficiency) * 100 if proficiency else 0

    return {
        "student_id": student_id,
        "student_name": student_name,
        "has_profile": True,
        "overall_progress": round(avg_score, 1),
        "learning_style": profile.learning_style,
        "strongest_subjects": profile.strength_areas[:3]
        if profile.strength_areas
        else [],
        "needs_improvement": profile.weakness_areas[:3]
        if profile.weakness_areas
        else [],
        "subjects_count": len(proficiency),
        "last_updated": profile.updated_at.isoformat() if profile.updated_at else None,
    }


@router.get("/subscription/status", response_model=dict)
async def get_subscription_status(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_teacher),
):
    """
    Get the teacher's current subscription status and student limits
    """
    res_prof = await db.execute(
        select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id)
    )
    teacher_profile = res_prof.scalars().first()

    if not teacher_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Teacher profile not found"
        )

    # Get current student count
    res_count = await db.execute(
        select(func.count(TeacherStudent.id)).filter(
            TeacherStudent.teacher_id == current_user.id
        )
    )
    current_count = res_count.scalar_one()

    max_students = teacher_profile.max_students or 10
    plan_type = teacher_profile.plan_type or "basic"

    # Define plan features
    plan_features = {
        "basic": {
            "max_students": 10,
            "features": ["Student management", "Material upload", "Basic analytics"],
            "price": "Free",
        },
        "premium": {
            "max_students": 50,
            "features": [
                "Everything in Basic",
                "Advanced analytics",
                "Priority support",
                "Custom branding",
            ],
            "price": "$29/month",
        },
        "enterprise": {
            "max_students": 200,
            "features": [
                "Everything in Premium",
                "Unlimited storage",
                "API access",
                "Dedicated support",
            ],
            "price": "$99/month",
        },
    }

    current_plan = plan_features.get(plan_type, plan_features["basic"])

    return {
        "plan_type": plan_type,
        "plan_features": current_plan["features"],
        "plan_price": current_plan["price"],
        "max_students": max_students,
        "current_students": current_count,
        "slots_remaining": max(0, max_students - current_count),
        "utilization_percentage": round((current_count / max_students) * 100, 1)
        if max_students > 0
        else 0,
        "is_verified_teacher": teacher_profile.is_verified_teacher,
        "plan_expires_at": teacher_profile.plan_expires_at.isoformat()
        if teacher_profile.plan_expires_at
        else None,
        "can_add_more_students": current_count < max_students,
        "upgrade_options": [
            {"plan": k, "max_students": v["max_students"], "price": v["price"]}
            for k, v in plan_features.items()
            if v["max_students"] > max_students
        ],
    }


class TeacherAISettings(BaseModel):
    llm_enabled: Optional[bool] = True
    tts_enabled: Optional[bool] = False
    stt_enabled: Optional[bool] = False
    auto_explain: Optional[bool] = True
    suggest_videos: Optional[bool] = True
    generate_assignments: Optional[bool] = True
    llm_model: Optional[str] = "llama3.2:3b"


@router.patch("/settings/ai")
async def update_ai_settings(
    settings: TeacherAISettings,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update teacher's AI configuration settings.
    These settings are persisted to the teacher profile.
    """
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can update AI settings",
        )

    res_prof = await db.execute(
        select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id)
    )
    teacher_profile = res_prof.scalars().first()

    if not teacher_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Teacher profile not found"
        )

    ai_settings = teacher_profile.ai_settings or {}
    update_data = settings.model_dump(exclude_unset=True)
    ai_settings.update(update_data)
    teacher_profile.ai_settings = ai_settings

    await db.commit()
    await db.refresh(teacher_profile)

    return {"status": "success", "ai_settings": teacher_profile.ai_settings}


@router.get("/settings/ai")
async def get_ai_settings(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get teacher's AI configuration settings.
    """
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can view AI settings",
        )

    res_prof = await db.execute(
        select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id)
    )
    teacher_profile = res_prof.scalars().first()

    if not teacher_profile:
        return {
            "ai_settings": {
                "llm_enabled": True,
                "tts_enabled": False,
                "stt_enabled": False,
                "auto_explain": True,
                "suggest_videos": True,
                "generate_assignments": True,
                "llm_model": "llama3.2:3b",
            }
        }

    return {
        "ai_settings": teacher_profile.ai_settings
        or {
            "llm_enabled": True,
            "tts_enabled": False,
            "stt_enabled": False,
            "auto_explain": True,
            "suggest_videos": True,
            "generate_assignments": True,
            "llm_model": "llama3.2:3b",
        }
    }
