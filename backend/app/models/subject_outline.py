import uuid
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy import Column, String, DateTime, UniqueConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.database import Base


class SubjectOutline(Base):
    __tablename__ = "subject_outlines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id = Column(UUID(as_uuid=True), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    topic_name = Column(String(500), nullable=False)
    education_level = Column(String(50), nullable=False)
    outline = Column(JSONB, nullable=False)
    teacher_id = Column(UUID(as_uuid=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    subject = relationship("Subject", lazy="joined")

    __table_args__ = (
        UniqueConstraint(
            "subject_id",
            "topic_name",
            "education_level",
            name="uq_subject_topic_level",
        ),
    )
