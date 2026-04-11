"""
Junction tables for many-to-many relationships.
These replace ARRAY columns that stored relationships as denormalized data.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Integer,
    Table,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy import func
from app.db.database import Base


# Pure junction table: Student ↔ Subject enrollment
student_subject = Table(
    "student_subject",
    Base.metadata,
    Column(
        "student_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "subject_id",
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "enrolled_at",
        DateTime(timezone=True),
        server_default=func.now(),
    ),
)


# Junction with extra columns: Student ↔ Topic progress
class StudentTopicProgress(Base):
    """Tracks per-topic progress for a student."""

    __tablename__ = "student_topic_progress"

    student_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    topic_id = Column(
        UUID(as_uuid=True),
        ForeignKey("topics.id", ondelete="CASCADE"),
        primary_key=True,
    )
    progress_pct = Column(Integer, default=0)
    status = Column(String(20), default="locked")  # locked, unlocked, completed
    last_accessed = Column(DateTime(timezone=True), nullable=True)
    unlocked_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    subject_id = Column(UUID(as_uuid=True), nullable=True)  # denormalized for lookups
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


# Pure junction table: Teacher ↔ Subject
teacher_subject = Table(
    "teacher_subject",
    Base.metadata,
    Column(
        "teacher_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "subject_id",
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "assigned_at",
        DateTime(timezone=True),
        server_default=func.now(),
    ),
)
