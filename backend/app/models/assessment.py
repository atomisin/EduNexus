import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.database import Base


class Assessment(Base):
    __tablename__ = "assessments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    assessment_type = Column(String(50), default="quiz")  # quiz, exam, practice
    
    # Configuration
    time_limit_minutes = Column(Integer, nullable=True)
    max_attempts = Column(Integer, default=1)
    passing_score = Column(Float, default=60.0)
    
    # Questions (stored as JSON)
    questions = Column(JSONB, default=list)
    
    # Proctoring
    enable_proctoring = Column(Boolean, default=False)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AssessmentResult(Base):
    __tablename__ = "assessment_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Results
    score = Column(Float, nullable=True)
    answers = Column(JSONB, default=list)
    feedback = Column(Text, nullable=True)
    
    # Timing
    started_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    time_spent_minutes = Column(Integer, nullable=True)
    
    # Status
    status = Column(String(50), default="in_progress")  # in_progress, submitted, graded
    attempt_number = Column(Integer, default=1)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessment_result_id = Column(UUID(as_uuid=True), ForeignKey("assessment_results.id"), nullable=False)
    
    event_type = Column(String(100), nullable=False)  # NO_FACE, MULTIPLE_FACES, LOOKING_AWAY, etc.
    severity = Column(String(20), default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    description = Column(Text, nullable=True)
    
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    screenshot_url = Column(String(500), nullable=True)
    event_metadata = Column(JSONB, default=dict)