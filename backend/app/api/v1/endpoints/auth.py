from fastapi import APIRouter, Request, Depends, HTTPException, status, Response, Cookie, BackgroundTasks, Header
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Literal
import uuid
from datetime import datetime, timedelta, timezone
import random
import string

from app.db.database import get_db, get_async_db
from app.models.user import User, UserRole, UserStatus, TeacherProfile
from app.models.student import StudentProfile
from app.core.config import settings
from app.core.security import verify_password
from app.utils.validators import validate_email_registration, validate_password
from app.services.email_service import email_service
from app.services.storage_service import storage_service
from app.services.curriculum_service import curriculum_service
from app.models.subject import Subject
from app.models.junction_tables import student_subject
from app.db.database import AsyncSessionLocal
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


def generate_student_id() -> str:
    """Generate unique student ID like EDU-2026-ABC123"""
    year = datetime.now(timezone.utc).year
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"EDU-{year}-{suffix}"


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    first_name: str
    last_name: str
    role: Literal["student", "teacher"] = "student"
    phone_number: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        allowed = {UserRole.STUDENT.value, UserRole.TEACHER.value}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {allowed}")
        return v


class TeacherRegistration(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    first_name: str = Field(..., min_length=2, max_length=100)
    last_name: str = Field(..., min_length=2, max_length=100)
    phone_number: Optional[str] = None
    qualifications: Optional[List[str]] = []
    specialization: Optional[str] = None
    years_of_experience: Optional[int] = Field(None, ge=0, le=50)
    subjects_taught: Optional[List[str]] = []
    education_levels: Optional[List[str]] = []


class StudentRegistration(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    first_name: str = Field(..., min_length=2, max_length=100)
    last_name: str = Field(..., min_length=2, max_length=100)
    phone_number: Optional[str] = None
    education_level: Optional[str] = None
    school_name: Optional[str] = None
    curriculum_type: Optional[str] = None
    course_name: Optional[str] = None
    grade_level: Optional[str] = None
    department: Optional[str] = None
    learning_style: Optional[str] = None
    desired_topics: List[str] = Field(default_factory=list)
    career_interests: List[str] = Field(default_factory=list)
    gender: Optional[str] = None  # male, female
    age: Optional[int] = None
    guardian_name: Optional[str] = None
    guardian_email: Optional[EmailStr] = None
    guardian_phone: Optional[str] = None
    enrolled_subjects: List[str] = Field(default_factory=list)
    education_category: Optional[str] = None

    class Config:
        extra = "allow"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    first_name: str
    last_name: str
    role: str
    created_at: datetime
    force_password_change: bool = False

    class Config:
        from_attributes = True


@router.post("/register", response_model=dict)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_async_db)):
    """Register a new user (generic endpoint)"""
    # Validate email
    is_valid, error_msg = validate_email_registration(user_data.email, user_data.role)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # Validate password
    is_pwd_valid, pwd_error = validate_password(user_data.password)
    if not is_pwd_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pwd_error)

    # Check if email exists
    result = await db.execute(select(User).filter(User.email == user_data.email))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Check if username exists
    result = await db.execute(select(User).filter(User.username == user_data.username))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken"
        )

    # Map validated role — never trust raw string (C-04-F)
    if user_data.role == "teacher":
        assigned_role = UserRole.TEACHER
    else:
        assigned_role = UserRole.STUDENT

    # Create user
    from app.core.security import pwd_context

    # Generate verification code if verification is enabled
    verification_code = None
    if settings.VERIFICATION_ENABLED and not settings.VERIFICATION_BYPASS:
        verification_code = email_service.generate_verification_code()

    # DESIGN DECISION: Both students and teachers self-register
    # via this endpoint. Role is limited to STUDENT or TEACHER.
    # ADMIN accounts are never created via this endpoint.
    # Admin creation is done via the seed CLI only:
    # python manage.py create_admin --email=x --password=y
    db_user = User(
        id=uuid.uuid4(),
        email=user_data.email,
        username=user_data.username,
        hashed_password=pwd_context.hash(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        full_name=f"{user_data.first_name} {user_data.last_name}",
        role=assigned_role,
        status=UserStatus.PENDING_APPROVAL,
        is_active=False,
        email_verified_at=None,
        force_password_change=False,
        phone_number=user_data.phone_number,
        verification_code=verification_code,
        verification_code_expires=datetime.now(timezone.utc)
        + timedelta(hours=settings.VERIFICATION_TOKEN_EXPIRE_HOURS)
        if verification_code
        else None,
        created_at=datetime.now(timezone.utc),
    )

    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    # Send verification email if enabled
    email_sent = False
    if (
        settings.VERIFICATION_ENABLED
        and not settings.VERIFICATION_BYPASS
        and verification_code
    ):
        email_sent = email_service.send_verification_email(db_user, verification_code)

    return {
        "success": True,
        "detail": "User registered successfully"
        + (". Please check your email to verify your account." if email_sent else ""),
        "user_id": str(db_user.id),
        "email": db_user.email,
        "role": user_data.role,
        "verification_sent": email_sent,
    }


@router.post(
    "/register/teacher", response_model=dict, status_code=status.HTTP_201_CREATED
)
async def register_teacher(
    teacher_data: TeacherRegistration, db: AsyncSession = Depends(get_async_db)
):
    """Register a new teacher account"""
    # Validate email
    is_valid, error_msg = validate_email_registration(teacher_data.email, "teacher")
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # Validate password
    is_pwd_valid, pwd_error = validate_password(teacher_data.password)
    if not is_pwd_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pwd_error)

    # Check if email exists
    result = await db.execute(select(User).filter(User.email == teacher_data.email))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Check if username exists
    result = await db.execute(
        select(User).filter(User.username == teacher_data.username)
    )
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken"
        )

    # Create password hash
    from app.core.security import pwd_context

    # Generate verification code if verification is enabled
    verification_code = None
    if settings.VERIFICATION_ENABLED and not settings.VERIFICATION_BYPASS:
        verification_code = email_service.generate_verification_code()

    # Create user
    db_user = User(
        id=uuid.uuid4(),
        email=teacher_data.email,
        username=teacher_data.username,
        hashed_password=pwd_context.hash(teacher_data.password),
        first_name=teacher_data.first_name,
        last_name=teacher_data.last_name,
        full_name=f"{teacher_data.first_name} {teacher_data.last_name}",
        role=UserRole.TEACHER,
        status=UserStatus.PENDING_APPROVAL,
        is_active=False,
        email_verified_at=None,
        force_password_change=False,
        phone_number=teacher_data.phone_number,
        verification_code=verification_code,
        verification_code_expires=datetime.now(timezone.utc)
        + timedelta(hours=settings.VERIFICATION_TOKEN_EXPIRE_HOURS)
        if verification_code
        else None,
        created_at=datetime.now(timezone.utc),
    )

    db.add(db_user)
    await db.flush()

    # Create teacher profile
    teacher_profile = TeacherProfile(
        id=uuid.uuid4(),
        user_id=db_user.id,
        qualifications=teacher_data.qualifications or [],
        specialization=teacher_data.specialization,
        years_of_experience=teacher_data.years_of_experience,
        subjects_taught=teacher_data.subjects_taught or [],
        education_levels=teacher_data.education_levels or [],
        is_verified_teacher=False,
        created_at=datetime.now(timezone.utc),
    )

    db.add(teacher_profile)
    await db.commit()
    await db.refresh(db_user)

    # Send verification email if enabled
    email_sent = False
    if (
        settings.VERIFICATION_ENABLED
        and not settings.VERIFICATION_BYPASS
        and verification_code
    ):
        email_sent = email_service.send_verification_email(db_user, verification_code)

    return {
        "success": True,
        "detail": "Teacher account created successfully. Your account is pending verification"
        + (". Please check your email to verify your account." if email_sent else "."),
        "user_id": str(db_user.id),
        "email": db_user.email,
        "role": "teacher",
        "verification_status": "pending",
        "email_verification_sent": email_sent,
    }


@router.post(
    "/register/student", response_model=dict, status_code=status.HTTP_201_CREATED
)
async def register_student(
    student_data: StudentRegistration,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db)
):
    """Register a new student account"""
    # Validate email
    is_valid, error_msg = validate_email_registration(student_data.email, "student")
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # Validate password
    is_pwd_valid, pwd_error = validate_password(student_data.password)
    if not is_pwd_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pwd_error)

    # Check if email exists
    result = await db.execute(select(User).filter(User.email == student_data.email))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Check if username exists
    result = await db.execute(
        select(User).filter(User.username == student_data.username)
    )
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken"
        )

    # Create password hash
    from app.core.security import pwd_context

    # Generate verification code if verification is enabled
    verification_code = None
    if settings.VERIFICATION_ENABLED and not settings.VERIFICATION_BYPASS:
        verification_code = email_service.generate_verification_code()

    # Create user
    db_user = User(
        id=uuid.uuid4(),
        email=student_data.email,
        username=student_data.username,
        hashed_password=pwd_context.hash(student_data.password),
        first_name=student_data.first_name,
        last_name=student_data.last_name,
        full_name=f"{student_data.first_name} {student_data.last_name}",
        role=UserRole.STUDENT,
        status=UserStatus.PENDING_APPROVAL,
        is_active=False,
        email_verified_at=None,
        force_password_change=False,
        phone_number=student_data.phone_number,
        verification_code=verification_code,
        verification_code_expires=datetime.now(timezone.utc)
        + timedelta(hours=settings.VERIFICATION_TOKEN_EXPIRE_HOURS)
        if verification_code
        else None,
        created_at=datetime.now(timezone.utc),
    )

    db.add(db_user)
    await db.flush()

    # Create student profile
    student_profile = StudentProfile(
        id=uuid.uuid4(),
        user_id=db_user.id,
        student_id=generate_student_id(),
        learning_style=student_data.learning_style,
        education_level=student_data.education_level,
        education_category=student_data.education_category,
        course_name=student_data.course_name,
        school_name=student_data.school_name,
        curriculum_type=student_data.curriculum_type or student_data.education_level,
        grade_level=student_data.grade_level,
        department=student_data.department,
        enrolled_subjects=student_data.enrolled_subjects or [],
        desired_topics=student_data.desired_topics or [],
        career_interests=student_data.career_interests or [],
        gender=student_data.gender,
        age=student_data.age,
        guardian_name=student_data.guardian_name,
        guardian_email=student_data.guardian_email,
        guardian_phone=student_data.guardian_phone,
        subject_proficiency={},
        created_at=datetime.now(timezone.utc),
    )

    db.add(student_profile)
    await db.commit()
    await db.refresh(db_user)

    # Send verification email if enabled
    email_sent = False
    if (
        settings.VERIFICATION_ENABLED
        and not settings.VERIFICATION_BYPASS
        and verification_code
    ):
        email_sent = email_service.send_verification_email(db_user, verification_code)

    # Ensure curriculum is generated/loaded asynchronously
    from app.services.curriculum_initializer import initialize_standard_curriculum
    
    if student_data.education_level and student_data.education_level.lower() == "professional" and student_data.course_name:
        # FIX 3: Professional students get a real subject and curriculum generation
        from app.api.v1.endpoints.subjects import generate_curriculum_for_subject
        subject = Subject(
            id=uuid.uuid4(),
            name=student_data.course_name,
            education_level='professional',
            code=student_data.course_name.lower().replace(' ', '-') + '-' + str(db_user.id)[:8],
            created_by=db_user.id,
            is_private=True,
            is_active=True
        )
        db.add(subject)
        await db.flush() # Get the ID safely
        
        # Auto-enroll via junction table
        await db.execute(student_subject.insert().values(
            student_id=db_user.id,
            subject_id=subject.id
        ))
        
        # Enforce name in enrolled_subjects array too for backward compatibility
        student_profile.enrolled_subjects = [str(subject.id)]
        await db.commit()
        
        # Generate curriculum in background using the LLM logic
        background_tasks.add_task(
            generate_curriculum_for_subject,
            str(subject.id),
            student_data.course_name,
            'professional',
            AsyncSessionLocal
        )
    elif student_data.grade_level:
        background_tasks.add_task(
            curriculum_service.enroll_student_in_grade_curriculum,
            db,
            db_user.id,
            student_data.grade_level
        )
    elif student_data.education_level:
        background_tasks.add_task(
            initialize_standard_curriculum,
            str(db_user.id),
            student_data.education_level,
            student_data.curriculum_type or ""
        )

    return {
        "success": True,
        "detail": "Student account created successfully"
        + (". Please check your email to verify your account." if email_sent else "!"),
        "user_id": str(db_user.id),
        "email": db_user.email,
        "role": "student",
        "verification_sent": email_sent,
    }


@router.post("/login", response_model=dict)
async def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_async_db),
):
    """Login user and sets HttpOnly cookies (C-03, C-05)"""
    result = await db.execute(select(User).filter(User.email == form_data.username))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # CRITICAL: Verify password hash (C-03)
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # Single Source of Truth: Check status, NOT is_active (C-04-B)
    # The frontend expects specific error codes to show unique messages
    if user.status == UserStatus.UNVERIFIED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Please verify your email address.",
            },
        )

    if user.status == UserStatus.PENDING or user.status == UserStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "APPROVAL_PENDING",
                "message": "Your account is pending administrator approval.",
            },
        )

    if user.status in [UserStatus.SUSPENDED, UserStatus.REJECTED]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCOUNT_SUSPENDED",
                "message": "Your account has been suspended. Contact support.",
            },
        )

    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account status: {user.status}. Access denied.",
        )

    # JWT Generation
    from jose import jwt

    is_prod = settings.ENVIRONMENT == "production"

    # Access Token
    access_expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    access_token = jwt.encode(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "exp": access_expire,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    # Refresh Token
    refresh_expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    refresh_token = jwt.encode(
        {"sub": str(user.id), "type": "refresh", "exp": refresh_expire},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    # Set Cookies
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_prod,
        samesite="strict" if is_prod else "lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path=f"{settings.API_V1_STR}/auth/refresh",
    )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return {
        "status": "success",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user_id": str(user.id),
        "role": user.role,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "force_password_change": getattr(user, "force_password_change", False),
    }


@router.post("/refresh")
async def refresh_token_endpoint(
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_async_db),
):
    """Rotate tokens using refresh token (C-03, C-05)"""
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    from jose import jwt, JWTError

    try:
        payload = jwt.decode(
            refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != "refresh":
            raise JWTError("Invalid token type")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).filter(User.id == uuid.UUID(user_id)))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=401, detail="User not found or account not active"
        )

    is_prod = settings.ENVIRONMENT == "production"
    access_expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    new_access_token = jwt.encode(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "exp": access_expire,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=is_prod,
        samesite="strict" if is_prod else "lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    return {"status": "refreshed"}


@router.post("/logout")
async def logout(response: Response):
    """Clear all auth cookies (C-05)"""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(
        key="refresh_token", path=f"{settings.API_V1_STR}/auth/refresh"
    )
    return {"success": True, "detail": "Successfully logged out"}


async def get_current_user(
    request: Request,
    access_token: Optional[str] = Cookie(None), 
    db: AsyncSession = Depends(get_async_db)
) -> User:
    """Validate access token from cookie OR authorization header (C-05 fallback)"""
    token = access_token
    if not token and request:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    from jose import jwt, JWTError

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = await db.execute(select(User).filter(User.id == uuid.UUID(user_id)))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not active"
        )

    # GAP 4: Enforcement
    if getattr(user, "force_password_change", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "PASSWORD_CHANGE_REQUIRED",
                "message": "Password change required",
            },
        )

    return user


async def get_current_user_allow_password_change(
    request: Request,
    access_token: Optional[str] = Cookie(None), 
    db: AsyncSession = Depends(get_async_db)
) -> User:
    """Token validation ONLY, bypasses force_password_change check (GAP 4)"""
    token = access_token
    if not token and request:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    from jose import jwt, JWTError

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).filter(User.id == uuid.UUID(user_id)))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Account not active")

    return user


def get_current_teacher(
    current_user: User = Depends(get_current_user),
) -> User:
    """Check if user is a teacher"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this",
        )
    return current_user


def get_current_student(
    current_user: User = Depends(get_current_user),
) -> User:
    """Check if user is a student"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this",
        )
    return current_user


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Check if user is an admin"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can access this"
        )
    return current_user


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=10)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user_allow_password_change)):
    """Get current user data (C-04, C-10: Allow me while password change required)"""
    return user


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    user: User = Depends(get_current_user_allow_password_change),
    db: AsyncSession = Depends(get_async_db),
):
    """Change password and unlock account (C-10)"""
    from app.core.security import pwd_context

    user.hashed_password = pwd_context.hash(request.new_password)
    user.force_password_change = False
    await db.commit()
    return {"success": True, "detail": "Password updated"}


@router.post("/verify-email", response_model=dict)
async def verify_email(
    request: VerifyEmailRequest, db: AsyncSession = Depends(get_async_db)
):
    """Verify user's email address with verification code (C-02: Async)"""
    result = await db.execute(select(User).filter(User.email == request.email))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user.email_verified_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified"
        )

    if not user.verification_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No verification code found. Please request a new one.",
        )

    if user.verification_code != request.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code"
        )

    if user.verification_code_expires and user.verification_code_expires < datetime.now(
        timezone.utc
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new one.",
        )

    # Mark email as verified and move to PENDING approval gate (C-04-B)
    user.email_verified_at = datetime.now(timezone.utc)
    user.status = UserStatus.PENDING
    user.verification_code = None
    user.verification_code_expires = None

    await db.commit()

    # Notify administrators (C-04-B)
    try:
        await email_service.notify_admins_of_pending_user(user, db)
    except Exception as e:
        # We don't want to fail the verification if notification fails
        import logging

        logging.getLogger(__name__).error(
            f"Failed to notify admins of pending user {user.email}: {e}"
        )

    return {
        "success": True,
        "detail": "Email verified successfully",
        "user_id": str(user.id),
        "email": user.email,
        "verified_at": user.email_verified_at.isoformat(),
    }


@router.post("/resend-verification", response_model=dict)
async def resend_verification(
    request: ResendVerificationRequest, db: AsyncSession = Depends(get_async_db)
):
    """Resend verification email (C-02: Async)"""
    result = await db.execute(select(User).filter(User.email == request.email))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user:
        return {
            "success": True,
            "detail": "If an account exists with this email, a verification code has been sent.",
        }

    if user.email_verified_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified"
        )

    verification_code = email_service.generate_verification_code()
    user.verification_code = verification_code
    user.verification_code_expires = datetime.now(timezone.utc) + timedelta(
        hours=settings.VERIFICATION_TOKEN_EXPIRE_HOURS
    )

    await db.commit()
    email_sent = email_service.send_verification_email(user, verification_code)

    return {
        "success": True,
        "detail": "If an account exists with this email, a verification code has been sent.",
        "email_sent": email_sent,
    }


async def verify_token(token: str, db: AsyncSession) -> Optional[User]:
    """Shared validation logic for WebSockets/etc."""
    from jose import jwt, JWTError

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        result = await db.execute(select(User).filter(User.id == uuid.UUID(user_id)))
        return result.scalars().first()
    except (JWTError, ValueError, Exception):
        return None

