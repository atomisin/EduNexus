from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import noload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import random
import string

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, TeacherStudent
from app.models.student import StudentProfile
from app.models.message import Message

router = APIRouter()


def generate_student_id() -> str:
    """Generate unique student ID like EDU-2026-ABC123"""
    year = datetime.now().year
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"EDU-{year}-{suffix}"


class StudentRegistrationUpdate(BaseModel):
    education_level: str
    grade_level: str
    enrolled_subjects: Optional[List[str]] = []
    guardian_name: Optional[str] = None
    guardian_email: Optional[str] = None


class AddStudentById(BaseModel):
    student_id: str


class GuardianReportContactUpdate(BaseModel):
    guardian_name: Optional[str] = None
    guardian_email: Optional[str] = None


@router.post("/complete-registration")
async def complete_student_registration(
    data: StudentRegistrationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Complete student registration with education details"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can complete this registration"
        )

    # Check if profile already exists
    res_prof = await db.execute(
        select(StudentProfile)
        .filter(StudentProfile.user_id == current_user.id)
    )
    profile = res_prof.scalars().first()

    if not profile:
        # Create new profile
        profile = StudentProfile(
            user_id=current_user.id, student_id=generate_student_id()
        )
        db.add(profile)

    # Update profile
    profile.education_level = data.education_level
    profile.current_grade_level = data.grade_level
    profile.grade_level = data.grade_level
    profile.enrolled_subjects = [uuid.UUID(s) for s in data.enrolled_subjects if s]
    profile.guardian_name = data.guardian_name
    profile.guardian_email = data.guardian_email

    await db.commit()
    await db.refresh(profile)

    return {
        "success": True,
        "detail": "Registration completed successfully",
        "student_id": profile.student_id,
        "education_level": profile.education_level,
        "grade_level": profile.grade_level,
    }


@router.get("/my-student-id")
async def get_my_student_id(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    """Get student's unique ID to share with teachers"""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students have a student ID")

    res_prof = await db.execute(
        select(StudentProfile)
        .filter(StudentProfile.user_id == current_user.id)
    )
    profile = res_prof.scalars().first()

    if not profile:
        # Create profile if doesn't exist
        profile = StudentProfile(
            user_id=current_user.id, student_id=generate_student_id()
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    return {
        "student_id": profile.student_id,
        "name": current_user.full_name,
        "education_level": profile.education_level,
        "grade_level": profile.grade_level,
    }


# Teacher endpoints
@router.post("/add-by-id")
async def add_student_by_id(
    data: AddStudentById,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Teacher adds a student by their unique ID"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can add students")

    # Find student by student_id
    res_prof = await db.execute(
        select(StudentProfile)
        .filter(StudentProfile.student_id == data.student_id)
    )
    student_profile = res_prof.scalars().first()

    if not student_profile:
        raise HTTPException(
            status_code=404,
            detail="Student ID not found. Please check the ID and try again.",
        )

    # Check if already linked
    res_link = await db.execute(
        select(TeacherStudent)
        .filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == student_profile.user_id,
        )
    )
    existing_link = res_link.scalars().first()

    if existing_link:
        raise HTTPException(status_code=400, detail="Student is already in your class")

    # Create link
    link = TeacherStudent(
        teacher_id=current_user.id, student_id=student_profile.user_id, status="active"
    )
    db.add(link)
    await db.commit()

    # Automatically send a welcome message from teacher to student to initialize contact
    welcome_message = Message(
        id=uuid.uuid4(),
        sender_id=current_user.id,
        recipient_id=student_profile.user_id,
        content=f"Welcome to my class! I've added you to our learning hub. Feel free to message me here if you have any questions.",
        created_at=datetime.now(timezone.utc)
    )
    db.add(welcome_message)
    await db.commit()

    # Get student user details
    res_user = await db.execute(select(User).filter(User.id == student_profile.user_id))
    student_user = res_user.scalars().first()

    return {
        "success": True,
        "detail": "Student added successfully",
        "student": {
            "id": str(student_profile.user_id),
            "student_id": student_profile.student_id,
            "name": student_user.full_name if student_user else "Unknown",
            "email": student_user.email if student_user else None,
            "education_level": student_profile.education_level,
            "grade_level": student_profile.grade_level,
        },
    }


@router.get("/my-students")
async def get_my_students(
    summary: bool = Query(False),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    """Get list of students linked to this teacher"""
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=403, detail="Only teachers can view their students"
        )

    if summary:
        res_count = await db.execute(
            select(func.count(TeacherStudent.id)).filter(
                TeacherStudent.teacher_id == current_user.id,
                TeacherStudent.status == "active",
            )
        )
        return {"students": [], "count": res_count.scalar_one()}

    res_links = await db.execute(
        select(TeacherStudent, User, StudentProfile)
        .options(noload("*"))
        .join(User, User.id == TeacherStudent.student_id)
        .outerjoin(StudentProfile, StudentProfile.user_id == TeacherStudent.student_id)
        .filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.status == "active",
        )
        .order_by(User.full_name.asc())
    )
    rows = res_links.all()

    students = []
    for link, student_user, student_profile in rows:
        students.append(
            {
                "id": str(link.student_id),
                "student_id": student_profile.student_id
                if student_profile
                else None,
                "name": student_user.full_name,
                "email": student_user.email,
                "education_level": student_profile.education_level
                if student_profile
                else None,
                "grade_level": student_profile.grade_level
                if student_profile
                else None,
                "guardian_name": student_profile.guardian_name
                if student_profile
                else None,
                "guardian_email": student_profile.guardian_email
                if student_profile
                else None,
                "enrolled_subjects": [
                    str(s) for s in (student_profile.enrolled_subjects or []) if s
                ] if student_profile else [],
            }
        )

    return {"students": students}


@router.delete("/remove-student/{student_id}")
async def remove_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Remove a student from teacher's list"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can remove students")

    res_link = await db.execute(
        select(TeacherStudent)
        .filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == uuid.UUID(student_id),
        )
    )
    link = res_link.scalars().first()

    if not link:
        raise HTTPException(status_code=404, detail="Student not found in your class")

    link.status = "inactive"
    await db.commit()

    return {"success": True, "detail": "Student removed from your class"}


@router.put("/students/{student_id}/guardian-contact")
async def update_student_guardian_contact(
    student_id: str,
    data: GuardianReportContactUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Allow a linked teacher to correct the parent/guardian report contact."""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can update report contacts")

    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID")

    res_link = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == student_uuid,
            TeacherStudent.status == "active",
        )
    )
    if not res_link.scalars().first():
        raise HTTPException(status_code=403, detail="You do not have access to this student")

    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == student_uuid)
    )
    profile = res_prof.scalars().first()
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")

    if data.guardian_name is not None:
        profile.guardian_name = data.guardian_name
    if data.guardian_email is not None:
        profile.guardian_email = data.guardian_email
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "success": True,
        "guardian_name": profile.guardian_name,
        "guardian_email": profile.guardian_email,
    }


@router.get("/students/{student_id}")
async def get_student_details(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get detailed info about a specific student (only if linked)"""
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=403, detail="Only teachers can view student details"
        )

    # Check if teacher is linked to this student
    res_link = await db.execute(
        select(TeacherStudent)
        .filter(
            TeacherStudent.teacher_id == current_user.id,
            TeacherStudent.student_id == uuid.UUID(student_id),
            TeacherStudent.status == "active",
        )
    )
    link = res_link.scalars().first()

    if not link:
        raise HTTPException(
            status_code=403, detail="You don't have access to this student"
        )

    res_user = await db.execute(select(User).filter(User.id == uuid.UUID(student_id)))
    student_user = res_user.scalars().first()
    res_prof = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == uuid.UUID(student_id)))
    student_profile = res_prof.scalars().first()

    return {
        "id": student_id,
        "student_id": student_profile.student_id if student_profile else None,
        "name": student_user.full_name if student_user else None,
        "email": student_user.email if student_user else None,
        "education_level": student_profile.education_level if student_profile else None,
        "grade_level": student_profile.grade_level if student_profile else None,
        "enrolled_subjects": [
            str(s) for s in (student_profile.enrolled_subjects or []) if s
        ],
        "guardian_name": student_profile.guardian_name if student_profile else None,
        "guardian_email": student_profile.guardian_email if student_profile else None,
        "learning_style": student_profile.learning_style if student_profile else None,
        "xp": student_profile.xp if student_profile else 0,
        "level": student_profile.level if student_profile else 1,
        "current_streak": student_profile.current_streak if student_profile else 0,
    }
