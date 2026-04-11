import uuid
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Integer,
    Float,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from app.db.database import Base

class MockExamSeries(Base):
    __tablename__ = "mock_exam_series"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False) # e.g. "JAMB Biology 2023"
    exam_type = Column(String(50), nullable=False) # WAEC, JAMB, NECO
    subject_id = Column(UUID(as_uuid=True), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    
    time_limit_minutes = Column(Integer, default=60)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    subject = relationship("Subject", lazy="joined")
    questions = relationship("MockQuestion", back_populates="series", cascade="all, delete-orphan")

class MockQuestion(Base):
    __tablename__ = "mock_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_id = Column(UUID(as_uuid=True), sa.ForeignKey("mock_exam_series.id", ondelete="CASCADE"), nullable=False)
    
    question_text = Column(Text, nullable=False)
    option_a = Column(Text, nullable=False)
    option_b = Column(Text, nullable=False)
    option_c = Column(Text, nullable=False)
    option_d = Column(Text, nullable=False)
    
    correct_option = Column(String(1), nullable=False) # A, B, C, D
    explanation = Column(Text, nullable=True)
    
    # Metadata for AI focus
    topic_tag = Column(String(100), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    series = relationship("MockExamSeries", back_populates="questions")

class MockAttempt(Base):
    __tablename__ = "mock_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), sa.ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False)
    series_id = Column(UUID(as_uuid=True), sa.ForeignKey("mock_exam_series.id", ondelete="CASCADE"), nullable=False)
    
    score = Column(Float, default=0.0)
    total_questions = Column(Integer, default=0)
    time_taken_seconds = Column(Integer, default=0)
    
    # JSON map of question_id -> student_answer
    answers = Column(JSONB, default=dict)
    
    is_completed = Column(Boolean, default=False)
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    student = relationship("StudentProfile", lazy="joined")
    series = relationship("MockExamSeries", lazy="joined")
