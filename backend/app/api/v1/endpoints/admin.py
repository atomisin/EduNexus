"""
Admin endpoints for system-wide user management
Admins can manage all users (teachers and students) and set limits
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request

from pydantic import BaseModel, Field
from typing import Optional, List
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole, UserStatus, TeacherStudent, TeacherProfile
from app.services.storage_service import storage_service
from app.models.student import StudentProfile
from app.models.token_usage import TokenUsageLog
from app.models.user import Material
from app.services.parsing_service import parsing_service
from app.constants import EDUCATION_LEVELS
from fastapi import UploadFile, File, Form, BackgroundTasks
import os
import tempfile
import io

router = APIRouter()


class UserListResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    full_name: Optional[str] = None
    role: str
    status: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    phone_number: Optional[str] = None
    avatar_url: Optional[str] = None
    email_verified_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None


class TeacherLimitUpdate(BaseModel):
    max_students: int = Field(..., ge=0, le=1000)
    plan_type: Optional[str] = "basic"  # basic, premium, enterprise


def require_admin(current_user: User = Depends(get_current_user)):
    """Dependency to ensure only admins can access these endpoints"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access this resource"
        )
    return current_user


@router.get("/users", response_model=List[UserListResponse])
async def list_all_users(
    role: Optional[str] = Query(None, description="Filter by role: student, teacher, admin"),
    user_status: Optional[str] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    List all users in the system with filtering options
    Admins can view and filter teachers, students, and other admins
    """
    stmt = select(User)
    
    # Apply filters
    if role:
        stmt = stmt.filter(User.role == role)
    
    if user_status:
        stmt = stmt.filter(User.status == user_status)
    
    if is_active is not None:
        stmt = stmt.filter(User.is_active == is_active)
    
    if search:
        search_filter = f"%{search}%"
        stmt = stmt.filter(
            or_(
                User.full_name.ilike(search_filter),
                User.email.ilike(search_filter),
                User.username.ilike(search_filter)
            )
        )
    
    # Order by creation date
    stmt = stmt.order_by(User.created_at.desc()).options(
        selectinload(User.student_profile),
        selectinload(User.teacher_profile),
        selectinload(User.teacher_students)
    )
    
    # Pagination
    result = await db.execute(stmt.offset(skip).limit(limit))
    users = result.scalars().all()
    
    # Resolve avatar URLs for each user
    for user in users:
        user.avatar_url = storage_service.resolve_url(user.avatar_url)
    
    return users


@router.get("/users/{user_id}", response_model=dict)
async def get_user_details(
    user_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Get detailed information about any user (teacher or student)
    Includes role-specific profile information
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Base user data
    user_data = {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "status": user.status,
        "is_active": user.is_active,
        "phone_number": user.phone_number,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "avatar_url": storage_service.resolve_url(user.avatar_url),
        "email_verified_at": user.email_verified_at.isoformat() if user.email_verified_at else None,
    }
    
    # Add role-specific data
    if user.role == UserRole.TEACHER:
        prof_result = await db.execute(select(TeacherProfile).filter(
            TeacherProfile.user_id == user.id
        ))
        teacher_profile = prof_result.scalars().first()
        
        if teacher_profile:
            # Count current students
            count_result = await db.execute(select(func.count(TeacherStudent.id)).filter(
                TeacherStudent.teacher_id == user.id
            ))
            student_count = count_result.scalar() or 0
            
            user_data["teacher_profile"] = {
                "specialization": teacher_profile.specialization,
                "years_of_experience": teacher_profile.years_of_experience,
                "subjects_taught": teacher_profile.subjects_taught,
                "education_levels": teacher_profile.education_levels,
                "is_verified_teacher": teacher_profile.is_verified_teacher,
                "max_students": teacher_profile.max_students if hasattr(teacher_profile, 'max_students') else None,
                "plan_type": teacher_profile.plan_type if hasattr(teacher_profile, 'plan_type') else "basic",
                "current_student_count": student_count,
                "slots_remaining": (teacher_profile.max_students if hasattr(teacher_profile, 'max_students') else 0) - student_count
            }
    
    elif user.role == UserRole.STUDENT:
        stud_prof_result = await db.execute(select(StudentProfile).filter(
            StudentProfile.user_id == user.id
        ))
        student_profile = stud_prof_result.scalars().first()
        
        if student_profile:
            user_data["student_profile"] = {
                "education_level": student_profile.education_level,
                "grade_level": student_profile.grade_level,
                "school_name": student_profile.school_name,
                "curriculum_type": student_profile.curriculum_type,
                "learning_style": student_profile.learning_style,
                "subject_proficiency": student_profile.subject_proficiency,
                "desired_topics": student_profile.desired_topics,
            }
            
            # Get assigned teachers
            teacher_query = select(User, TeacherStudent).join(
                TeacherStudent, User.id == TeacherStudent.teacher_id
            ).filter(TeacherStudent.student_id == user.id)
            teachers_result = await db.execute(teacher_query)
            teachers = teachers_result.all()
            
            user_data["assigned_teachers"] = [
                {
                    "id": str(t.User.id),
                    "full_name": t.User.full_name,
                    "email": t.User.email,
                    "added_at": t.TeacherStudent.added_at.isoformat()
                }
                for t in teachers
            ]
    
    return user_data


@router.put("/users/{user_id}", response_model=dict)
async def update_user(
    user_id: str,
    update_data: UserUpdateRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Update any user's information
    Admins can modify user details, activate/deactivate accounts
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admins from modifying themselves through this endpoint
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use profile settings to update your own account"
        )
    
    # Update fields
    if update_data.full_name is not None:
        user.full_name = update_data.full_name
    
    if update_data.email is not None:
        # Check if email is already taken
        exist_result = await db.execute(select(User).filter(
            User.email == update_data.email,
            User.id != user.id
        ))
        existing = exist_result.scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered by another user"
            )
        user.email = update_data.email
    
    if update_data.phone_number is not None:
        user.phone_number = update_data.phone_number
    
    if update_data.status is not None:
        new_status = update_data.status.lower()
        if new_status == "approved":
            user.status = UserStatus.ACTIVE
        else:
            try:
                user.status = UserStatus(new_status)
            except ValueError:
                # Fallback or error if invalid status
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid user status: {update_data.status}"
                )
    
    if update_data.is_active is not None:
        user.is_active = update_data.is_active
    
    # If activating/approving, set is_active to True automatically if not explicitly provided
    if update_data.status == "approved" or update_data.status == "active":
        if update_data.is_active is None:
            user.is_active = True
        
        # Track who approved and when
        user.authorized_by = current_user.id
        user.authorized_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    
    return {
        "success": True,
        "detail": "User updated successfully",
        "user_id": str(user.id),
        "updated_fields": update_data.dict(exclude_unset=True)
    }


@router.delete("/users/{user_id}", response_model=dict)
async def delete_user(
    user_id: str,
    reason: Optional[str] = Query(None, description="Reason for deletion (for audit log)"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Delete any user from the system (teacher or student)
    This permanently removes the user and all associated data
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admins from deleting themselves
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own admin account"
        )
    
    # Store user info for response
    user_info = {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role
    }
    
    # Delete user - cascading will handle related records
    await db.delete(user)
    await db.commit()
    
    # In production, you might want to log this action
    # audit_log.info(f"Admin {current_user.id} deleted user {user_id}. Reason: {reason}")
    
    return {
        "success": True,
        "detail": f"User {user_info['full_name']} has been permanently deleted",
        "deleted_user": user_info,
        "reason": reason
    }


@router.post("/users/{user_id}/deactivate", response_model=dict)
async def deactivate_user(
    user_id: str,
    reason: Optional[str] = Query(None, description="Reason for deactivation"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Deactivate a user account (soft delete)
    User data is preserved but they cannot log in
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account"
        )
    
    user.is_active = False
    user.status = UserStatus.SUSPENDED
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    
    return {
        "message": f"Account for {user.full_name} has been suspended",
        "user_id": str(user.id),
        "status": user.status,
        "reason": reason
    }


@router.post("/users/{user_id}/approve", response_model=dict)
async def approve_user(
    user_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Approve a pending user registration (Gate 2)
    Only users with verified emails (PENDING) can be approved.
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.status == UserStatus.ACTIVE:
        return {"success": True, "detail": "User is already active", "user_id": str(user.id)}
        
    if user.status == UserStatus.UNVERIFIED:
        raise HTTPException(
            status_code=400, 
            detail="User has not verified their email yet. Approval is only possible after email verification."
        )
    
    # Transition to ACTIVE
    user.status = UserStatus.ACTIVE
    user.is_active = True
    user.authorized_by = current_user.id
    user.authorized_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return {
        "message": f"User {user.full_name} has been approved and is now active",
        "user_id": str(user.id),
        "status": user.status
    }


@router.post("/users/{user_id}/reject", response_model=dict)
async def reject_user(
    user_id: str,
    reason: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
) -> dict:
    """
    Reject a pending user registration
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.status = UserStatus.REJECTED
    user.is_active = False
    user.rejection_reason = reason
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return {
        "message": f"User {user.full_name} registration has been rejected",
        "user_id": str(user.id),
        "status": user.status
    }


@router.post("/users/{user_id}/activate", response_model=dict)
async def activate_user(
    user_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Reactivate a deactivated user account
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.is_active = True
    user.status = UserStatus.ACTIVE
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    
    return {
        "message": f"User {user.full_name} has been activated",
        "user_id": str(user.id)
    }


# Teacher-specific admin endpoints
@router.get("/teachers", response_model=List[dict])
async def list_teachers_with_limits(
    plan_type: Optional[str] = Query(None, description="Filter by plan type"),
    is_verified: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    List all teachers with their student limits and current usage
    """
    stmt = select(User, TeacherProfile).join(
        TeacherProfile, User.id == TeacherProfile.user_id
    ).filter(User.role == UserRole.TEACHER)
    
    if plan_type:
        stmt = stmt.filter(TeacherProfile.plan_type == plan_type)
    
    if is_verified is not None:
        stmt = stmt.filter(TeacherProfile.is_verified_teacher == is_verified)
    
    # Eager load teacher_students to prevent N+1 queries
    stmt = stmt.options(selectinload(User.teacher_students))
    
    exec_result = await db.execute(stmt)
    results = exec_result.all()
    
    teachers = []
    for user, profile in results:
        # Count current students from eager loaded relationship
        student_count = len(user.teacher_students) if user.teacher_students else 0
        
        max_students = getattr(profile, 'max_students', 10)  # Default limit
        plan = getattr(profile, 'plan_type', 'basic')
        
        teachers.append({
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat(),
            "teacher_profile": {
                "specialization": profile.specialization,
                "years_of_experience": profile.years_of_experience,
                "is_verified_teacher": profile.is_verified_teacher,
                "plan_type": plan,
                "max_students": max_students,
                "current_student_count": student_count,
                "slots_available": max(0, (max_students or 0) - student_count),
                "utilization_percentage": round((student_count / (max_students or 1)) * 100, 1) if (max_students or 0) > 0 else 0
            }
        })
    
    return teachers


@router.put("/teachers/{teacher_id}/limits", response_model=dict)
async def update_teacher_limits(
    teacher_id: str,
    limit_data: TeacherLimitUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Update a teacher's student limit and plan type
    Use this for managing pricing tiers and licensing
    """
    try:
        teacher_uuid = uuid.UUID(teacher_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid teacher ID format"
        )
    
    # Verify user is a teacher
    result = await db.execute(select(User).filter(
        User.id == teacher_uuid,
        User.role == UserRole.TEACHER
    ))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher not found"
        )
    
    # Get or create teacher profile
    prof_result = await db.execute(select(TeacherProfile).filter(
        TeacherProfile.user_id == user.id
    ))
    profile = prof_result.scalars().first()
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher profile not found"
        )
    
    # Check if new limit is below current student count
    count_result = await db.execute(select(func.count(TeacherStudent.id)).filter(
        TeacherStudent.teacher_id == user.id
    ))
    current_count = count_result.scalar() or 0
    
    if limit_data.max_students < current_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot set limit below current student count ({current_count}). Remove students first."
        )
    
    # Update limits
    profile.max_students = limit_data.max_students
    profile.plan_type = limit_data.plan_type
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    
    return {
        "message": f"Teacher limits updated successfully",
        "teacher_id": str(user.id),
        "teacher_name": user.full_name,
        "max_students": limit_data.max_students,
        "plan_type": limit_data.plan_type,
        "current_students": current_count,
        "slots_remaining": limit_data.max_students - current_count
    }


@router.get("/stats/overview", response_model=dict)
async def get_system_stats(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Get overall system statistics
    """
    from sqlalchemy import func
    
    # User counts
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    total_teachers = (await db.execute(select(func.count(User.id)).filter(User.role == UserRole.TEACHER))).scalar() or 0
    total_students = (await db.execute(select(func.count(User.id)).filter(User.role == UserRole.STUDENT))).scalar() or 0
    total_admins = (await db.execute(select(func.count(User.id)).filter(User.role == UserRole.ADMIN))).scalar() or 0
    
    active_users = (await db.execute(select(func.count(User.id)).filter(User.is_active == True))).scalar() or 0
    inactive_users = (await db.execute(select(func.count(User.id)).filter(User.is_active == False))).scalar() or 0
    
    # Teacher-student relationships
    total_teacher_student_links = (await db.execute(select(func.count(TeacherStudent.id)))).scalar() or 0
    
    # Average students per teacher
    avg_students_per_teacher = total_teacher_student_links / total_teachers if total_teachers > 0 else 0
    
    # Plan distribution
    plan_result = await db.execute(
        select(
            TeacherProfile.plan_type,
            func.count(TeacherProfile.id).label('count')
        ).group_by(TeacherProfile.plan_type)
    )
    plan_distribution = plan_result.all()
    
    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": inactive_users,
            "by_role": {
                "teachers": total_teachers,
                "students": total_students,
                "admins": total_admins
            }
        },
        "teacher_student_relationships": {
            "total_links": total_teacher_student_links,
            "average_students_per_teacher": round(avg_students_per_teacher, 2)
        },
        "plan_distribution": [
            {"plan": p.plan_type, "count": p.count} for p in plan_distribution
        ]
    }

@router.get("/usage", response_model=dict)
async def get_token_usage(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
    days: int = Query(30, description="Number of days to look back"),
    model_name: Optional[str] = Query(None, description="Filter by model name")
):
    """
    Get token usage statistics across the platform
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func
    
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    
    stmt = select(
        TokenUsageLog.model,
        func.sum(TokenUsageLog.prompt_tokens).label("total_prompt_tokens"),
        func.sum(TokenUsageLog.completion_tokens).label("total_completion_tokens"),
        func.sum(TokenUsageLog.total_tokens).label("total_tokens"),
        func.sum(TokenUsageLog.cost).label("total_cost"),
        func.count(TokenUsageLog.id).label("total_requests")
    ).filter(TokenUsageLog.created_at >= cutoff)
    
    if model_name:
        stmt = stmt.filter(TokenUsageLog.model == model_name)
        
    stmt = stmt.group_by(TokenUsageLog.model)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    stats = []
    total_cost = 0.0
    for row in rows:
        stats.append({
            "model": row.model,
            "prompt_tokens": row.total_prompt_tokens or 0,
            "completion_tokens": row.total_completion_tokens or 0,
            "total_tokens": row.total_tokens or 0,
            "estimated_cost": round(row.total_cost or 0.0, 4),
            "requests": row.total_requests or 0
        })
        total_cost += (row.total_cost or 0.0)
        
    return {
        "period_days": days,
        "total_estimated_cost": round(total_cost, 4),
        "usage_by_model": stats
    }


# Material Management Endpoints
@router.post("/materials/upload", response_model=dict, status_code=status.HTTP_201_CREATED)
async def admin_upload_material(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    subject: str = Form(...),
    education_level: str = Form(...),
    topic: Optional[str] = Form(None),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    """
    Admin-only bulk material upload
    """
    # 1. Validate education level
    if education_level not in EDUCATION_LEVELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid education level. Must be one of: {', '.join(EDUCATION_LEVELS)}"
        )

    # 2. Validate file type (PDF only for bulk upload as requested)
    file_extension = "." + file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if file_extension != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bulk upload only supports PDF files"
        )

    # 3. Read file content
    content = await file.read()
    file_size = len(content)

    # 4. Upload to storage
    object_name = f"materials/admin/{uuid.uuid4()}{file_extension}"
    file_stream = io.BytesIO(content)
    file_url = storage_service.upload_file(
        file_stream,
        object_name,
        content_type=file.content_type
    )

    # 5. Create material record
    material = Material(
        id=uuid.uuid4(),
        title=title,
        description=description,
        file_url=file_url,
        file_type=file_extension,
        file_size=file_size,
        subject=subject,
        topic=topic,
        education_level=education_level,
        uploader_id=current_user.id,
        is_public=True,  # Admin materials are public by default
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

    db.add(material)
    await db.commit()
    await db.refresh(material)

    # 6. Trigger background processing
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"admin_process_{material.id}{file_extension}")
    
    with open(temp_file_path, "wb") as f:
        f.write(content)

    async def process_and_cleanup():
        try:
            await parsing_service.process_material(
                material.id, 
                temp_file_path, 
                subject=subject, 
                education_level=education_level
            )
        except Exception as e:
            # In production, log error to audit system
            pass
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    if background_tasks:
        background_tasks.add_task(process_and_cleanup)

    return {
        "success": True,
        "material_id": str(material.id),
        "title": title,
        "detail": "Material uploaded and processing started"
    }


@router.get("/materials", response_model=List[dict])
async def list_admin_materials(
    subject: Optional[str] = Query(None),
    education_level: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    List materials with filtering
    """
    stmt = select(Material)
    if subject:
        stmt = stmt.filter(Material.subject == subject)
    if education_level:
        stmt = stmt.filter(Material.education_level == education_level)
    if search:
        search_filter = f"%{search}%"
        stmt = stmt.filter(
            or_(
                Material.title.ilike(search_filter),
                Material.topic.ilike(search_filter)
            )
        )
    
    result = await db.execute(stmt.order_by(Material.created_at.desc()))
    materials = result.scalars().all()
    
    return [
        {
            "id": str(m.id),
            "title": m.title,
            "subject": m.subject,
            "education_level": m.education_level,
            "topic": m.topic,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "chunk_count": 0  # Would need a subquery to count efficiently
        } for m in materials
    ]


@router.delete("/materials/{material_id}", response_model=dict)
async def delete_admin_material(
    material_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Delete a material and its associated content
    """
    try:
        material_uuid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid material ID format")
    
    material = await db.get(Material, material_uuid)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    # Delete from storage
    if material.file_url:
        try:
            bucket = storage_service.bucket
            if bucket in material.file_url:
                object_name = material.file_url.split(f"/{bucket}/")[-1]
                storage_service.delete_file(object_name)
        except Exception:
            pass
            
    # Delete chunks first (cascading SHOULD handle this, but let's be safe if not)
    from app.models.rag_models import MaterialChunk
    from sqlalchemy import delete
    await db.execute(delete(MaterialChunk).where(MaterialChunk.material_id == material_uuid))
    
    # Delete material
    await db.delete(material)
    await db.commit()
    
    return {"success": True, "detail": "Material and associated chunks deleted"}
