import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class PlacementQuestionCache(Base):
    __tablename__ = "placement_question_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    education_level = Column(String(80), nullable=False)
    curriculum_hash = Column(String(64), nullable=False)
    question_spec = Column(JSONB, nullable=False)
    source = Column(String(30), default="llm")
    status = Column(String(20), default="active")
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    subject = relationship("Subject", lazy="joined")
    topic = relationship("Topic", lazy="joined")

    __table_args__ = (
        UniqueConstraint(
            "subject_id",
            "topic_id",
            "education_level",
            "curriculum_hash",
            name="uq_placement_question_cache_scope",
        ),
    )
