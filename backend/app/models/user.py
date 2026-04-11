import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Integer,
    Float,
    JSON,
    ARRAY,
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import enum
from app.db.database import Base
from app.models.junction_tables import student_subject, teacher_subject


class UserStatus(str, enum.Enum):
    UNVERIFIED = "unverified"
    PENDING = "pending"
    PENDING_APPROVAL = "pending_approval"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    REJECTED = "rejected"


class UserRole(str, enum.Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"
    PARENT = "parent"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    full_name = Column(String(255), nullable=True)
    phone_number = Column(String(20), nullable=True)

    role = Column(
        SQLEnum(
            UserRole, values_callable=lambda x: [e.value for e in x], name="userrole"
        ),
        nullable=False,
    )
    status = Column(
        SQLEnum(
            UserStatus,
            values_callable=lambda x: [e.value for e in x],
            name="userstatus",
        ),
        nullable=False,
        default=UserStatus.UNVERIFIED,
    )

    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)

    state = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    date_of_birth = Column(DateTime(timezone=True), nullable=True)

    verification_code = Column(String(10), nullable=True)
    verification_code_expires = Column(DateTime(timezone=True), nullable=True)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)

    authorized_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    authorized_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)

    is_active = Column(Boolean, default=False)
    force_password_change = Column(Boolean, default=False)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    last_login = Column(DateTime(timezone=True), nullable=True)

    # Persistence for general AI Tutor conversations
    ai_chat_history = Column(JSONB, default=list)

    student_profile = relationship(
        "StudentProfile", back_populates="user", uselist=False, lazy="joined"
    )
    teacher_profile = relationship(
        "TeacherProfile", back_populates="user", uselist=False, lazy="joined"
    )
    parent_profile = relationship(
        "ParentProfile", back_populates="user", uselist=False, lazy="joined"
    )
    materials = relationship("Material", back_populates="uploader", lazy="selectin")
    teacher_students = relationship(
        "TeacherStudent",
        back_populates="teacher",
        foreign_keys="TeacherStudent.teacher_id",
        lazy="selectin",
    )
    topic_requests = relationship(
        "StudentTopicRequest",
        back_populates="student",
        foreign_keys="StudentTopicRequest.student_id",
        lazy="selectin",
    )
    sessions = relationship(
        "TeachingSession", foreign_keys="TeachingSession.teacher_id", lazy="selectin"
    )

    authorized_by_user = relationship(
        "User", remote_side=[id], foreign_keys=[authorized_by], lazy="joined"
    )
    enrolled_subjects_rel = relationship(
        "Subject",
        secondary=student_subject,
        back_populates="enrolled_students",
        lazy="selectin",
    )
    subjects_taught_rel = relationship(
        "Subject",
        secondary=teacher_subject,
        back_populates="assigned_teachers",
        lazy="selectin",
    )


class TeacherStudent(Base):
    __tablename__ = "teacher_students"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Added status for alignment with TeacherStudentLink
    status = Column(String(20), default="active")  # active, inactive, pending
    
    # Audit trail
    added_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    added_by = Column(String(50), default="teacher")  # teacher, admin, self
    
    # Notes about the student (private to teacher)
    notes = Column(Text, nullable=True) # Existing
    private_notes = Column(Text, nullable=True) # Merged from TeacherStudentLink

    teacher = relationship(
        "User",
        back_populates="teacher_students",
        foreign_keys=[teacher_id],
        lazy="joined",
    )
    student = relationship("User", foreign_keys=[student_id], lazy="joined")


class ParentProfile(Base):
    __tablename__ = "parent_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)

    occupation = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="parent_profile", lazy="joined")


class ParentStudent(Base):
    __tablename__ = "parent_students"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    relationship_type = Column(String(50), nullable=True)

    added_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    parent = relationship("User", foreign_keys=[parent_id], lazy="joined")
    student = relationship("User", foreign_keys=[student_id], lazy="joined")


class TeacherProfile(Base):
    __tablename__ = "teacher_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)

    qualifications = Column(ARRAY(String), default=list)
    specialization = Column(String(255), nullable=True)
    years_of_experience = Column(Integer, nullable=True)
    subjects_taught = Column(ARRAY(String), default=list)
    education_levels = Column(ARRAY(String), default=list)
    is_verified_teacher = Column(Boolean, default=False)
    verification_documents = Column(ARRAY(String), default=list)

    # Student limit management for pricing/licensing
    max_students = Column(Integer, default=10)  # Default limit for basic plan
    plan_type = Column(String(50), default="basic")  # basic, premium, enterprise
    plan_expires_at = Column(
        DateTime(timezone=True), nullable=True
    )  # For subscription management

    # Gamification
    impact_score = Column(Integer, default=0)
    badges = Column(JSONB, default=list)

    # AI Configuration Settings
    ai_settings = Column(JSONB, default=dict)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="teacher_profile", lazy="joined")


class Material(Base):
    __tablename__ = "materials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    file_url = Column(String(500), nullable=True)
    video_url = Column(String(500), nullable=True)
    file_type = Column(String(50), nullable=True)
    file_size = Column(Integer, nullable=True)

    subject = Column(String(100), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    topic = Column(String(255), nullable=True)
    education_level = Column(String(50), nullable=True)
    grade_level = Column(String(50), nullable=True)

    uploader_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_public = Column(Boolean, default=False)
    allowed_students = Column(ARRAY(UUID(as_uuid=True)), default=list)

    tags = Column(ARRAY(String), default=list)
    download_count = Column(Integer, default=0)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    uploader = relationship("User", back_populates="materials", lazy="joined")


class StudentTopicRequest(Base):
    __tablename__ = "student_topic_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    topic_name = Column(String(255), nullable=False)
    subject = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String(20), default="medium")

    status = Column(String(50), default="pending")
    assigned_teacher_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship(
        "User",
        back_populates="topic_requests",
        foreign_keys=[student_id],
        lazy="joined",
    )
    assigned_teacher = relationship(
        "User", foreign_keys=[assigned_teacher_id], lazy="joined"
    )
