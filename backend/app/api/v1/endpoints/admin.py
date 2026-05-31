"""
Admin endpoints for system-wide user management
Admins can manage all users (teachers and students) and set limits
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any, Dict
import uuid
from datetime import datetime, timezone
import json
from types import SimpleNamespace

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text
from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole, UserStatus, TeacherStudent, TeacherProfile
from app.models.notification import Notification
from app.services.account_deletion import delete_user_account
from app.services.storage_service import storage_service
from app.models.student import StudentProfile
from app.models.token_usage import TokenUsageLog
from app.models.user import Material
from app.services.parsing_service import parsing_service
from app.services.custom_course_service import generate_and_enroll_custom_course
from app.services.email_service import email_service
from app.constants import EDUCATION_LEVELS
from app.core.security import pwd_context
from fastapi import UploadFile, File, Form, BackgroundTasks
import os
import tempfile
import io

router = APIRouter()


def _is_approval_status(value: Optional[str]) -> bool:
    return bool(value) and value.lower() in {"active", "approved"}


def _ensure_email_verified_before_approval(user: User) -> None:
    if user.role != UserRole.ADMIN and not user.email_verified_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has not verified their email yet. Approval is only possible after email verification."
        )


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
    education_level: Optional[str] = None
    grade_level: Optional[str] = None
    class_level: Optional[str] = None
    department: Optional[str] = None
    curriculum_type: Optional[str] = None
    admin_scope: Optional[str] = None
    admin_permissions: List[str] = Field(default_factory=list)
    
    class Config:
        from_attributes = True


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None


class AdminCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=255)
    permissions: List[str] = Field(default_factory=list)


class TeacherLimitUpdate(BaseModel):
    max_students: int = Field(..., ge=0, le=1000)
    plan_type: Optional[str] = "basic"  # basic, premium, enterprise


class CustomCourseReviewRequest(BaseModel):
    action: str
    admin_reason: Optional[str] = None
    selected_suggestion: Optional[str] = None
    clarification_message: Optional[str] = None
    email_message: Optional[str] = None
    send_email: Optional[bool] = False


class CustomCourseRejectionDraftRequest(BaseModel):
    admin_reason: str


class VideoCreatorProfilePayload(BaseModel):
    creator_name: str
    channel_aliases: List[str] = Field(default_factory=list)
    domains: List[str] = Field(default_factory=list)
    topic_keywords: List[str] = Field(default_factory=list)
    recommended_query_terms: List[str] = Field(default_factory=list)
    community_evidence_count: int = 0
    community_evidence_summary: Optional[str] = None
    source_notes: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


def require_admin(current_user: User = Depends(get_current_user)):
    """Dependency to ensure only admins can access these endpoints"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access this resource"
        )
    return current_user


ADMIN_PERMISSION_LABELS = {
    "user_approvals": "User approvals",
    "custom_courses": "Custom course governance",
    "video_evidence": "Video evidence governance",
    "teacher_licenses": "Teacher licenses",
    "report_quality": "Report quality",
    "messages": "Admin messages",
}
DELEGATED_ADMIN_PERMISSIONS = set(ADMIN_PERMISSION_LABELS.keys())


def _configured_super_admin_email() -> str:
    return ((settings.SUPER_ADMIN_EMAIL or settings.BOOTSTRAP_ADMIN_EMAIL or "").strip().lower())


def _admin_permissions(user: User) -> list[str]:
    raw_permissions = getattr(user, "admin_permissions", None) or []
    if isinstance(raw_permissions, list):
        return [str(item) for item in raw_permissions if item]
    return []


def _is_super_admin(user: User) -> bool:
    if user.role != UserRole.ADMIN:
        return False
    configured_email = _configured_super_admin_email()
    if configured_email and (user.email or "").strip().lower() == configured_email:
        return True
    return getattr(user, "admin_scope", None) == "super" or "*" in _admin_permissions(user)


def _require_super_admin(current_user: User) -> None:
    if not _is_super_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the primary super admin can perform this action",
        )


def _require_admin_permission(current_user: User, permission: str) -> None:
    if _is_super_admin(current_user):
        return
    if permission not in _admin_permissions(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your admin account does not have permission for this area",
        )


def _queue_account_approval_email(background_tasks: BackgroundTasks, user: User) -> None:
    user_snapshot = SimpleNamespace(
        id=user.id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.full_name,
    )

    def _send_approval_email() -> None:
        sent = email_service.send_account_approved_email(user_snapshot)
        if not sent:
            import logging

            logging.getLogger(__name__).warning(
                "Account approval email could not be sent to %s", user_snapshot.email
            )

    background_tasks.add_task(_send_approval_email)


def _json_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if item]
        except json.JSONDecodeError:
            return [value] if value else []
    return []


def _report_number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _report_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


@router.get("/me/permissions", response_model=dict)
async def get_admin_permissions(current_user: User = Depends(require_admin)):
    permissions = ["*"] if _is_super_admin(current_user) else _admin_permissions(current_user)
    return {
        "is_super_admin": _is_super_admin(current_user),
        "admin_scope": "super" if _is_super_admin(current_user) else (current_user.admin_scope or "delegated"),
        "permissions": permissions,
        "permission_labels": ADMIN_PERMISSION_LABELS,
    }


@router.post("/admins", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_delegated_admin(
    payload: AdminCreateRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    _require_super_admin(current_user)

    requested_permissions = list(dict.fromkeys(payload.permissions or []))
    invalid_permissions = [
        permission
        for permission in requested_permissions
        if permission not in DELEGATED_ADMIN_PERMISSIONS
    ]
    if invalid_permissions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported admin permissions: {', '.join(invalid_permissions)}",
        )

    email = payload.email.strip().lower()
    existing_result = await db.execute(select(User).filter(User.email == email))
    existing = existing_result.scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    username = email.split("@", 1)[0]
    username_result = await db.execute(select(User).filter(User.username == username))
    if username_result.scalars().first():
        username = f"{username}-{uuid.uuid4().hex[:6]}"

    admin = User(
        id=uuid.uuid4(),
        email=email,
        username=username,
        hashed_password=pwd_context.hash(payload.password),
        full_name=payload.full_name.strip(),
        first_name=payload.full_name.strip().split()[0],
        last_name=payload.full_name.strip().split()[-1] if " " in payload.full_name.strip() else "",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
        admin_scope="delegated",
        admin_permissions=requested_permissions,
        force_password_change=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(admin)
    await db.commit()
    return {
        "success": True,
        "admin_id": str(admin.id),
        "email": admin.email,
        "admin_scope": admin.admin_scope,
        "permissions": requested_permissions,
    }


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
    _require_admin_permission(current_user, "user_approvals")
    stmt = (
        select(
            User.id,
            User.email,
            User.username,
            User.full_name,
            User.role,
            User.status,
            User.is_active,
            User.created_at,
            User.last_login,
            User.phone_number,
            User.avatar_url,
            User.email_verified_at,
            StudentProfile.education_level,
            StudentProfile.current_grade_level,
            StudentProfile.grade_level,
            StudentProfile.education_category,
            StudentProfile.department,
            StudentProfile.curriculum_type,
            User.admin_scope,
            User.admin_permissions,
        )
        .outerjoin(StudentProfile, StudentProfile.user_id == User.id)
    )
    
    # Apply filters
    if role:
        stmt = stmt.filter(User.role == role)
    
    if user_status:
        stmt = stmt.filter(User.status == user_status)
    else:
        stmt = stmt.filter(User.status != UserStatus.UNVERIFIED)
    
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
    stmt = stmt.order_by(User.created_at.desc())
    
    # Pagination
    result = await db.execute(stmt.offset(skip).limit(limit))
    users = []
    for row in result.all():
        role_value = row.role.value if hasattr(row.role, "value") else row.role
        status_value = row.status.value if hasattr(row.status, "value") else row.status
        class_level = (
            row.current_grade_level
            or row.grade_level
            or row.education_level
            or row.education_category
        )
        users.append({
            "id": row.id,
            "email": row.email,
            "username": row.username,
            "full_name": row.full_name,
            "role": role_value,
            "status": status_value,
            "is_active": row.is_active,
            "created_at": row.created_at,
            "last_login": row.last_login,
            "phone_number": row.phone_number,
            "avatar_url": storage_service.resolve_url(row.avatar_url),
            "email_verified_at": row.email_verified_at,
            "education_level": row.education_level,
            "grade_level": row.current_grade_level or row.grade_level,
            "class_level": class_level,
            "department": row.department,
            "curriculum_type": row.curriculum_type,
            "admin_scope": row.admin_scope,
            "admin_permissions": _json_list(row.admin_permissions),
        })

    return users


@router.get("/custom-course-requests", response_model=List[dict])
async def list_custom_course_requests(
    include_completed: bool = Query(False),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    _require_admin_permission(current_user, "custom_courses")
    statuses_to_hide = {
        "approved",
        "rejected",
        "suggested_existing_course",
        "clarification_requested",
        "completed",
    }
    stmt = text(
        """
        SELECT
            c.id,
            c.student_id,
            c.requested_title,
            c.normalized_title,
            c.requested_description,
            c.intended_outcome,
            c.motivation,
            c.status,
            c.safety_status,
            c.safety_flags,
            c.suggested_courses,
            c.safe_alternatives,
            c.refined_admin_message,
            c.admin_selected_suggestion,
            c.approved_course_name,
            c.created_at,
            u.full_name AS student_name,
            u.email AS student_email
        FROM custom_course_requests c
        LEFT JOIN users u ON u.id = c.student_id
        ORDER BY c.created_at DESC
        LIMIT 100
        """
    )
    result = await db.execute(stmt)
    requests = []
    for row in result.mappings().all():
        status_value = row["status"] or ""
        if not include_completed and status_value in statuses_to_hide:
            continue
        requests.append(
            {
                "id": str(row["id"]),
                "student_id": str(row["student_id"]),
                "student_name": row["student_name"],
                "student_email": row["student_email"],
                "requested_title": row["requested_title"],
                "normalized_title": row["normalized_title"],
                "requested_description": row["requested_description"],
                "intended_outcome": row["intended_outcome"],
                "motivation": row["motivation"],
                "status": status_value,
                "safety_status": row["safety_status"] or "clear",
                "safety_flags": _json_list(row["safety_flags"]),
                "suggested_courses": _json_list(row["suggested_courses"]),
                "safe_alternatives": _json_list(row["safe_alternatives"]),
                "refined_admin_message": row["refined_admin_message"],
                "admin_selected_suggestion": row["admin_selected_suggestion"],
                "approved_course_name": row["approved_course_name"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
        )

    return requests


@router.post("/custom-course-requests/{request_id}/rejection-draft", response_model=dict)
async def preview_custom_course_rejection_draft(
    request_id: str,
    payload: CustomCourseRejectionDraftRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    _require_admin_permission(current_user, "custom_courses")
    try:
        request_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid request ID format")

    result = await db.execute(
        text(
            """
            SELECT requested_title
            FROM custom_course_requests
            WHERE id = :request_id
            """
        ),
        {"request_id": request_uuid},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Custom course request not found")

    title = row["requested_title"]
    draft = (
        f"Thank you for requesting {title}. We cannot approve it in its current form because "
        f"{payload.admin_reason.strip()} Please refine the learning goal or choose a safer, "
        "more clearly educational course direction."
    )
    return {"draft": draft}


@router.post("/custom-course-requests/{request_id}/review", response_model=dict)
async def review_custom_course_request(
    request_id: str,
    payload: CustomCourseReviewRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    _require_admin_permission(current_user, "custom_courses")
    try:
        request_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid request ID format")

    action = payload.action.strip().lower()
    status_by_action = {
        "approve": "approved",
        "reject": "rejected",
        "suggest_existing_course": "suggested_existing_course",
        "request_clarification": "clarification_requested",
    }
    if action not in status_by_action:
        raise HTTPException(status_code=400, detail="Unsupported review action")

    request_result = await db.execute(
        text(
            """
            SELECT
                id,
                student_id,
                requested_title,
                normalized_title,
                status,
                safety_status,
                safety_flags
            FROM custom_course_requests
            WHERE id = :request_id
            """
        ),
        {"request_id": request_uuid},
    )
    request_row = request_result.mappings().first()
    if not request_row:
        raise HTTPException(status_code=404, detail="Custom course request not found")

    selected_course = (
        (payload.selected_suggestion or "").strip()
        or (request_row["normalized_title"] or "").strip()
        or (request_row["requested_title"] or "").strip()
    )
    admin_message = payload.email_message or payload.clarification_message

    if action == "approve":
        if (request_row["safety_status"] or "").lower() == "blocked" or (
            request_row["status"] or ""
        ) == "auto_rejected":
            raise HTTPException(
                status_code=400,
                detail="Blocked safety-governance requests cannot be approved.",
            )
        if not selected_course:
            raise HTTPException(status_code=400, detail="Approved course name is required")

        try:
            course_result = await generate_and_enroll_custom_course(
                db,
                student_id=request_row["student_id"],
                course_name=selected_course,
                user_id_for_llm=current_user.id,
            )
            selected_course = course_result["course_name"]
        except Exception as exc:
            await db.rollback()
            raise HTTPException(
                status_code=503,
                detail=f"Could not generate approved course curriculum: {exc}",
            ) from exc
        db.add(
            Notification(
                user_id=request_row["student_id"],
                type="custom_course_approved",
                title="Your custom course is ready",
                message=(
                    f"Your professional course '{selected_course}' has been approved "
                    "and added to your learning dashboard."
                ),
                link="/student/learn",
            )
        )

    result = await db.execute(
        text(
            """
            UPDATE custom_course_requests
            SET
                status = :status,
                admin_decision = :action,
                admin_reason = :admin_reason,
                refined_admin_message = :admin_message,
                admin_selected_suggestion = :selected_course,
                approved_course_name = CASE WHEN :action = 'approve' THEN :selected_course ELSE approved_course_name END,
                reviewed_by = :reviewed_by,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :request_id
            RETURNING id
            """
        ),
        {
            "request_id": request_uuid,
            "status": status_by_action[action],
            "action": action,
            "admin_reason": payload.admin_reason,
            "admin_message": admin_message,
            "selected_course": selected_course,
            "reviewed_by": current_user.id,
        },
    )
    if not result.mappings().first():
        raise HTTPException(status_code=404, detail="Custom course request not found")

    await db.commit()
    return {"success": True, "status": status_by_action[action]}


@router.get("/video-creator-profiles", response_model=List[dict])
async def list_video_creator_profiles(
    include_inactive: bool = Query(True),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    _require_admin_permission(current_user, "video_evidence")
    where_clause = "" if include_inactive else "WHERE is_active = TRUE"
    result = await db.execute(
        text(
            f"""
            SELECT
                id,
                creator_name,
                channel_aliases,
                domains,
                topic_keywords,
                recommended_query_terms,
                community_evidence_count,
                community_evidence_summary,
                source_notes,
                is_active,
                sort_order
            FROM video_creator_profiles
            {where_clause}
            ORDER BY sort_order ASC, creator_name ASC
            """
        )
    )
    return [
        {
            "id": str(row["id"]),
            "creator_name": row["creator_name"],
            "channel_aliases": _json_list(row["channel_aliases"]),
            "domains": _json_list(row["domains"]),
            "topic_keywords": _json_list(row["topic_keywords"]),
            "recommended_query_terms": _json_list(row["recommended_query_terms"]),
            "community_evidence_count": row["community_evidence_count"] or 0,
            "community_evidence_summary": row["community_evidence_summary"],
            "source_notes": row["source_notes"],
            "is_active": bool(row["is_active"]),
            "sort_order": row["sort_order"] or 0,
        }
        for row in result.mappings().all()
    ]


@router.post("/video-creator-profiles", response_model=dict)
async def create_video_creator_profile(
    payload: VideoCreatorProfilePayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    _require_admin_permission(current_user, "video_evidence")
    profile_id = uuid.uuid4()
    await db.execute(
        text(
            """
            INSERT INTO video_creator_profiles (
                id,
                creator_name,
                channel_aliases,
                domains,
                topic_keywords,
                recommended_query_terms,
                community_evidence_count,
                community_evidence_summary,
                source_notes,
                is_active,
                sort_order,
                created_at,
                updated_at
            )
            VALUES (
                :id,
                :creator_name,
                CAST(:channel_aliases AS jsonb),
                CAST(:domains AS jsonb),
                CAST(:topic_keywords AS jsonb),
                CAST(:recommended_query_terms AS jsonb),
                :community_evidence_count,
                :community_evidence_summary,
                :source_notes,
                :is_active,
                :sort_order,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            """
        ),
        {
            "id": profile_id,
            "creator_name": payload.creator_name.strip(),
            "channel_aliases": json.dumps(payload.channel_aliases),
            "domains": json.dumps(payload.domains),
            "topic_keywords": json.dumps(payload.topic_keywords),
            "recommended_query_terms": json.dumps(payload.recommended_query_terms),
            "community_evidence_count": payload.community_evidence_count,
            "community_evidence_summary": payload.community_evidence_summary,
            "source_notes": payload.source_notes,
            "is_active": payload.is_active,
            "sort_order": payload.sort_order,
        },
    )
    await db.commit()
    return {"success": True, "id": str(profile_id)}


@router.put("/video-creator-profiles/{profile_id}", response_model=dict)
async def update_video_creator_profile(
    profile_id: str,
    payload: VideoCreatorProfilePayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    _require_admin_permission(current_user, "video_evidence")
    try:
        profile_uuid = uuid.UUID(profile_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid profile ID format")

    result = await db.execute(
        text(
            """
            UPDATE video_creator_profiles
            SET
                creator_name = :creator_name,
                channel_aliases = CAST(:channel_aliases AS jsonb),
                domains = CAST(:domains AS jsonb),
                topic_keywords = CAST(:topic_keywords AS jsonb),
                recommended_query_terms = CAST(:recommended_query_terms AS jsonb),
                community_evidence_count = :community_evidence_count,
                community_evidence_summary = :community_evidence_summary,
                source_notes = :source_notes,
                is_active = :is_active,
                sort_order = :sort_order,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
            RETURNING id
            """
        ),
        {
            "id": profile_uuid,
            "creator_name": payload.creator_name.strip(),
            "channel_aliases": json.dumps(payload.channel_aliases),
            "domains": json.dumps(payload.domains),
            "topic_keywords": json.dumps(payload.topic_keywords),
            "recommended_query_terms": json.dumps(payload.recommended_query_terms),
            "community_evidence_count": payload.community_evidence_count,
            "community_evidence_summary": payload.community_evidence_summary,
            "source_notes": payload.source_notes,
            "is_active": payload.is_active,
            "sort_order": payload.sort_order,
        },
    )
    if not result.mappings().first():
        raise HTTPException(status_code=404, detail="Video creator profile not found")

    await db.commit()
    return {"success": True, "id": profile_id}


@router.post("/video-creator-profiles/seed", response_model=dict)
async def seed_video_creator_profiles(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    _require_admin_permission(current_user, "video_evidence")
    result = await db.execute(text("SELECT COUNT(*) FROM video_creator_profiles"))
    return {
        "success": True,
        "created": 0,
        "existing": int(result.scalar() or 0),
        "message": "Video creator evidence profiles are already managed from the database.",
    }


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
    _require_admin_permission(current_user, "user_approvals")
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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Update any user's information
    Admins can modify user details, activate/deactivate accounts
    """
    _require_admin_permission(current_user, "user_approvals")
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
    if user.role == UserRole.ADMIN and not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Only the primary super admin can modify admin accounts")
    was_active = user.status == UserStatus.ACTIVE and user.is_active
    
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
        if _is_approval_status(new_status):
            _ensure_email_verified_before_approval(user)
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
    if _is_approval_status(update_data.status):
        if update_data.is_active is None:
            user.is_active = True
        
        # Track who approved and when
        user.authorized_by = current_user.id
        user.authorized_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    if _is_approval_status(update_data.status) and not was_active:
        _queue_account_approval_email(background_tasks, user)
    
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
    _require_super_admin(current_user)
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
    
    # Delete user and dependent rows in a deterministic FK-safe order.
    await delete_user_account(db, user)
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
    _require_admin_permission(current_user, "user_approvals")
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
    if user.role == UserRole.ADMIN and not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Only the primary super admin can deactivate admin accounts")
    
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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Approve a pending user registration (Gate 2)
    Only users with verified emails (PENDING) can be approved.
    """
    _require_admin_permission(current_user, "user_approvals")
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.ADMIN and not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Only the primary super admin can approve admin accounts")
        
    if user.status == UserStatus.ACTIVE:
        return {"success": True, "detail": "User is already active", "user_id": str(user.id)}

    _ensure_email_verified_before_approval(user)
    
    # Transition to ACTIVE
    user.status = UserStatus.ACTIVE
    user.is_active = True
    user.authorized_by = current_user.id
    user.authorized_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    _queue_account_approval_email(background_tasks, user)
    
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
    _require_admin_permission(current_user, "user_approvals")
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    result = await db.execute(select(User).filter(User.id == user_uuid))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.ADMIN and not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Only the primary super admin can reject admin accounts")
        
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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    Reactivate a deactivated user account
    """
    _require_admin_permission(current_user, "user_approvals")
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
    if user.role == UserRole.ADMIN and not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Only the primary super admin can activate admin accounts")
    was_active = user.status == UserStatus.ACTIVE and user.is_active
    
    user.is_active = True
    user.status = UserStatus.ACTIVE
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    if not was_active:
        _queue_account_approval_email(background_tasks, user)
    
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
    _require_admin_permission(current_user, "teacher_licenses")
    active_student_count = func.count(TeacherStudent.id)
    stmt = (
        select(
            User.id.label("user_id"),
            User.email,
            User.full_name,
            User.is_active,
            User.created_at,
            TeacherProfile.specialization,
            TeacherProfile.years_of_experience,
            TeacherProfile.is_verified_teacher,
            TeacherProfile.plan_type,
            TeacherProfile.max_students,
            active_student_count.label("student_count"),
        )
        .join(TeacherProfile, User.id == TeacherProfile.user_id)
        .outerjoin(
            TeacherStudent,
            (TeacherStudent.teacher_id == User.id) & (TeacherStudent.status == "active"),
        )
        .filter(User.role == UserRole.TEACHER)
    )
    
    if plan_type:
        stmt = stmt.filter(TeacherProfile.plan_type == plan_type)
    
    if is_verified is not None:
        stmt = stmt.filter(TeacherProfile.is_verified_teacher == is_verified)
    
    stmt = stmt.group_by(
        User.id,
        User.email,
        User.full_name,
        User.is_active,
        User.created_at,
        TeacherProfile.id,
        TeacherProfile.specialization,
        TeacherProfile.years_of_experience,
        TeacherProfile.is_verified_teacher,
        TeacherProfile.plan_type,
        TeacherProfile.max_students,
    ).order_by(User.created_at.desc())
    
    exec_result = await db.execute(stmt)
    results = exec_result.all()
    
    teachers = []
    for row in results:
        max_students = row.max_students or 10
        plan = row.plan_type or "basic"
        student_count = row.student_count or 0
        
        teachers.append({
            "id": str(row.user_id),
            "email": row.email,
            "full_name": row.full_name,
            "is_active": row.is_active,
            "created_at": row.created_at.isoformat(),
            "teacher_profile": {
                "specialization": row.specialization,
                "years_of_experience": row.years_of_experience,
                "is_verified_teacher": row.is_verified_teacher,
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
    _require_admin_permission(current_user, "teacher_licenses")
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


@router.get("/report-quality", response_model=dict)
async def get_report_quality_overview(
    limit_months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
):
    """
    Summarize stored report evidence without loading full report/user ORM graphs.
    """
    _require_admin_permission(current_user, "report_quality")
    result = await db.execute(
        text(
            """
            SELECT
                r.id,
                r.month,
                r.year,
                r.report_data,
                u.full_name AS teacher_name
            FROM student_reports r
            LEFT JOIN users u ON u.id = r.teacher_id
            WHERE make_date(r.year, r.month, 1) >= (
                date_trunc('month', CURRENT_DATE) - ((:limit_months - 1) * INTERVAL '1 month')
            )
            ORDER BY r.year DESC, r.month DESC
            """
        ),
        {"limit_months": limit_months},
    )

    monthly: Dict[str, Dict[str, Any]] = {}
    subjects: Dict[str, Dict[str, Any]] = {}
    teachers: Dict[str, Dict[str, Any]] = {}
    reports_analyzed = 0
    total_validated = 0
    total_fallback = 0

    for row in result.mappings().all():
        reports_analyzed += 1
        data = _report_dict(row["report_data"])
        quiz_perf = _report_dict(data.get("quiz_performance"))
        quality_meta = _report_dict(data.get("assessment_quality"))

        quiz_results = quiz_perf.get("quiz_results") if isinstance(quiz_perf.get("quiz_results"), list) else []
        by_subject = quiz_perf.get("by_subject") if isinstance(quiz_perf.get("by_subject"), list) else []
        validated = int(
            _report_number(quality_meta.get("validated_assessments"))
            or _report_number(data.get("validated_assessments"))
            or _report_number(quiz_perf.get("total_quizzes"))
            or len(quiz_results)
        )
        fallback = int(
            _report_number(quality_meta.get("fallback_assessments"))
            or _report_number(data.get("fallback_assessments"))
        )

        total_validated += validated
        total_fallback += fallback

        month_key = f"{int(row['year'])}-{int(row['month']):02d}"
        month_bucket = monthly.setdefault(
            month_key,
            {
                "month": month_key,
                "reports": 0,
                "validated_assessments": 0,
                "fallback_assessments": 0,
            },
        )
        month_bucket["reports"] += 1
        month_bucket["validated_assessments"] += validated
        month_bucket["fallback_assessments"] += fallback

        teacher_name = row["teacher_name"] or "Unknown teacher"
        teacher_bucket = teachers.setdefault(
            teacher_name,
            {
                "teacher_name": teacher_name,
                "reports": 0,
                "validated_assessments": 0,
                "fallback_assessments": 0,
            },
        )
        teacher_bucket["reports"] += 1
        teacher_bucket["validated_assessments"] += validated
        teacher_bucket["fallback_assessments"] += fallback

        for subject_item in by_subject:
            subject_data = _report_dict(subject_item)
            subject_name = subject_data.get("subject") or "General"
            sessions = int(
                _report_number(subject_data.get("sessions_count"))
                or len(subject_data.get("sessions") if isinstance(subject_data.get("sessions"), list) else [])
            )
            subject_validated = sessions or (1 if _report_number(subject_data.get("post_score_avg")) > 0 else 0)
            subject_fallback = int(_report_number(subject_data.get("fallback_assessments")))
            subject_bucket = subjects.setdefault(
                subject_name,
                {
                    "subject": subject_name,
                    "sessions": 0,
                    "validated_assessments": 0,
                    "fallback_assessments": 0,
                    "post_scores": [],
                },
            )
            subject_bucket["sessions"] += sessions
            subject_bucket["validated_assessments"] += subject_validated
            subject_bucket["fallback_assessments"] += subject_fallback
            post_score = _report_number(subject_data.get("post_score_avg"))
            if post_score > 0:
                subject_bucket["post_scores"].append(post_score)

    denominator = total_validated + total_fallback
    subject_rows = []
    for item in subjects.values():
        scores = item.pop("post_scores", [])
        item["avg_post_score"] = round(sum(scores) / len(scores), 1) if scores else 0
        subject_rows.append(item)

    return {
        "summary": {
            "reports_analyzed": reports_analyzed,
            "validated_assessments": total_validated,
            "fallback_assessments": total_fallback,
            "fallback_share_pct": round((total_fallback / denominator) * 100, 1) if denominator else 0,
        },
        "monthly_trend": sorted(monthly.values(), key=lambda item: item["month"]),
        "subjects": sorted(
            subject_rows,
            key=lambda item: (item["fallback_assessments"], item["validated_assessments"]),
            reverse=True,
        )[:10],
        "teachers": sorted(
            teachers.values(),
            key=lambda item: (item["fallback_assessments"], item["reports"]),
            reverse=True,
        )[:10],
    }


@router.get("/usage", response_model=dict)
async def get_token_usage(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin),
    days: int = Query(30, description="Number of days to look back"),
    model_name: Optional[str] = Query(None, description="Filter by model name")
):
    """
    Get token usage statistics across the platform with daily trends and top consumers
    """
    _require_super_admin(current_user)
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func, desc
    
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    
    # 1. Usage by Model
    stmt = select(
        TokenUsageLog.model,
        func.sum(TokenUsageLog.prompt_tokens).label("total_prompt_tokens"),
        func.sum(TokenUsageLog.completion_tokens).label("total_completion_tokens"),
        func.sum(TokenUsageLog.total_tokens).label("total_tokens"),
        func.sum(TokenUsageLog.cost_microdollars).label("total_cost_micros"),
        func.count(TokenUsageLog.id).label("total_requests")
    ).filter(TokenUsageLog.created_at >= cutoff)
    
    if model_name:
        stmt = stmt.filter(TokenUsageLog.model == model_name)
        
    stmt = stmt.group_by(TokenUsageLog.model)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    stats = []
    total_cost_micros = 0
    total_tokens = 0
    total_requests = 0
    for row in rows:
        stats.append({
            "model": row.model,
            "prompt_tokens": row.total_prompt_tokens or 0,
            "completion_tokens": row.total_completion_tokens or 0,
            "total_tokens": row.total_tokens or 0,
            "estimated_cost": round((row.total_cost_micros or 0) / 1000000.0, 4),
            "requests": row.total_requests or 0
        })
        total_cost_micros += (row.total_cost_micros or 0)
        total_tokens += int(row.total_tokens or 0)
        total_requests += int(row.total_requests or 0)

    # 2. Daily Trends
    trend_stmt = select(
        func.date(TokenUsageLog.created_at).label("date"),
        func.sum(TokenUsageLog.total_tokens).label("tokens"),
        func.sum(TokenUsageLog.cost_microdollars).label("cost_micros")
    ).filter(TokenUsageLog.created_at >= cutoff)
    
    if model_name:
        trend_stmt = trend_stmt.filter(TokenUsageLog.model == model_name)
    
    trend_stmt = trend_stmt.group_by(func.date(TokenUsageLog.created_at)).order_by(func.date(TokenUsageLog.created_at))
    
    trend_result = await db.execute(trend_stmt)
    trend_rows = trend_result.all()
    
    daily_trends = [
        {
            "date": str(row.date),
            "tokens": int(row.tokens or 0),
            "cost": round((row.cost_micros or 0) / 1000000.0, 4)
        } for row in trend_rows
    ]

    # 3. Top Users
    top_users_stmt = select(
        User.id,
        User.email,
        User.username,
        func.sum(TokenUsageLog.total_tokens).label("tokens"),
        func.sum(TokenUsageLog.cost_microdollars).label("cost_micros"),
        func.count(TokenUsageLog.id).label("requests")
    ).join(TokenUsageLog, User.id == TokenUsageLog.user_id)\
     .filter(TokenUsageLog.created_at >= cutoff)\
     .group_by(User.id, User.email, User.username)\
     .order_by(desc("cost_micros"))\
     .limit(5)

    top_users_result = await db.execute(top_users_stmt)
    top_users_rows = top_users_result.all()
    
    top_consumers = [
        {
            "id": str(row.id),
            "email": row.email,
            "username": row.username,
            "tokens": int(row.tokens or 0),
            "cost": round((row.cost_micros or 0) / 1000000.0, 4),
            "requests": int(row.requests or 0)
        } for row in top_users_rows
    ]
        
    return {
        "period_days": days,
        "summary": {
            "total_tokens": total_tokens,
            "total_requests": total_requests,
            "total_cost": round(total_cost_micros / 1000000.0, 6),
        },
        "total_estimated_cost": round(total_cost_micros / 1000000.0, 4),
        "cost_basis": "Logged provider token usage priced with LiteLLM model rates when available, with configured per-model fallback rates.",
        "usage_by_model": stats,
        "daily_trends": daily_trends,
        "top_consumers": top_consumers
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
    max_size = 100 * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum allowed size of 100MB",
        )

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
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_admin)
):
    """
    List materials with filtering
    """
    stmt = select(
        Material.id,
        Material.title,
        Material.subject,
        Material.education_level,
        Material.topic,
        Material.created_at,
    )
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
    
    result = await db.execute(stmt.order_by(Material.created_at.desc()).limit(limit))
    materials = result.all()
    
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
