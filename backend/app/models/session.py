import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Integer,
    Float,
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.core.config import settings
import enum


class SessionStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    PAUSED = "paused"
    ENDED = "ended"
    CANCELLED = "cancelled"
    REVIEW = "review"


class SessionType(str, enum.Enum):
    LIVE_TEACHING = "live_teaching"
    PRACTICE = "practice"
    REVISION = "revision"
    ASSESSMENT = "assessment"


class TeachingSession(Base):
    """Complete teaching session with AI orchestration support"""

    __tablename__ = "teaching_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)

    # Session Info
    session_type = Column(String(50), default="live_teaching")
    status = Column(String(50), default="scheduled")

    # AI Configuration (stored as JSONB for flexibility)
    ai_config = Column(JSONB, default=dict)

    # Timing
    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, default=60)

    # Context (comprehensive session context)
    context = Column(JSONB, default=dict)

    # Real-time Content
    transcript = Column(JSONB, default=list)  # Array of {timestamp, speaker, text}
    key_moments = Column(JSONB, default=list)  # AI-identified important moments
    explanations_generated = Column(JSONB, default=list)
    videos_suggested = Column(JSONB, default=list)

    # Engagement
    student_presence = Column(JSONB, default=dict)  # student_id -> presence data
    engagement_timeline = Column(JSONB, default=list)

    # Generated Content
    session_summary = Column(Text, nullable=True)
    session_outline = Column(JSONB, nullable=True)  # Teacher-facing session outline
    class_notes = Column(JSONB, nullable=True)  # Comprehensive class notes
    notes_shared_with_students = Column(Boolean, default=False)
    revision_material = Column(JSONB, nullable=True)
    assignments_generated = Column(JSONB, default=list)

    # New Personalization Fields
    pre_session_quiz = Column(JSONB, nullable=True)
    post_session_quiz = Column(JSONB, nullable=True)
    quiz_results = Column(
        JSONB, default=dict
    )  # student_id -> {pre: score, post: score}
    take_home_assignment = Column(JSONB, nullable=True)

    # Continuity
    previous_session_id = Column(
        UUID(as_uuid=True), ForeignKey("teaching_sessions.id"), nullable=True
    )
    next_session_id = Column(
        UUID(as_uuid=True), ForeignKey("teaching_sessions.id"), nullable=True
    )
    continuity_notes = Column(Text, nullable=True)

    # LiveKit Integration
    livekit_room_name = Column(String(255), nullable=True)
    livekit_room_token = Column(Text, nullable=True)

    # Student access code for non-portal students (teacher-linked students)
    student_access_code = Column(String(20), nullable=True)
    student_access_enabled = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    teacher = relationship("User", foreign_keys=[teacher_id], lazy="joined")
    subject = relationship("Subject", lazy="joined")
    topic = relationship("Topic", lazy="joined")
    previous_session = relationship(
        "TeachingSession", remote_side=[id], foreign_keys=[previous_session_id], lazy="joined"
    )
    next_session = relationship(
        "TeachingSession", remote_side=[id], foreign_keys=[next_session_id], lazy="joined"
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert session to dictionary"""
        return {
            "id": str(self.id),
            "teacher_id": str(self.teacher_id),
            "subject_id": str(self.subject_id) if self.subject_id else None,
            "topic_id": str(self.topic_id) if self.topic_id else None,
            "session_type": self.session_type,
            "status": self.status,
            "ai_config": self.ai_config,
            "scheduled_start": self.scheduled_start.isoformat()
            if self.scheduled_start
            else None,
            "actual_start": self.actual_start.isoformat()
            if self.actual_start
            else None,
            "actual_end": self.actual_end.isoformat() if self.actual_end else None,
            "duration_minutes": self.duration_minutes,
            "context": self.context,
            "transcript": self.transcript,
            "key_moments": self.key_moments,
            "explanations_generated": self.explanations_generated,
            "videos_suggested": self.videos_suggested,
            "student_presence": self.student_presence,
            "engagement_timeline": self.engagement_timeline,
            "session_summary": self.session_summary,
            "session_outline": self.session_outline,
            "class_notes": self.class_notes,
            "notes_shared_with_students": self.notes_shared_with_students,
            "revision_material": self.revision_material,
            "assignments_generated": self.assignments_generated,
            "previous_session_id": str(self.previous_session_id)
            if self.previous_session_id
            else None,
            "next_session_id": str(self.next_session_id)
            if self.next_session_id
            else None,
            "continuity_notes": self.continuity_notes,
            "livekit_room_name": self.livekit_room_name,
            "student_access_code": self.student_access_code,
            "student_access_enabled": self.student_access_enabled,
            "pre_session_quiz": self.pre_session_quiz,
            "post_session_quiz": self.post_session_quiz,
            "quiz_results": self.quiz_results,
            "take_home_assignment": self.take_home_assignment,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SessionStudent(Base):
    """Many-to-many relationship between sessions and students"""

    __tablename__ = "session_students"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True), ForeignKey("teaching_sessions.id"), nullable=False
    )
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Enrollment status
    status = Column(String(50), default="invited")  # invited, joined, left, completed
    joined_at = Column(DateTime(timezone=True), nullable=True)
    left_at = Column(DateTime(timezone=True), nullable=True)

    # Engagement metrics
    attendance_percentage = Column(Float, default=0.0)
    participation_score = Column(Float, default=0.0)
    questions_asked = Column(Integer, default=0)
    answers_given = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    session = relationship("TeachingSession", lazy="joined")
    student = relationship("User", lazy="joined")


# Pydantic models for API
from pydantic import BaseModel, Field


class AIConfigModel(BaseModel):
    """Pydantic model for AI configuration"""

    llm_enabled: bool = True
    tts_enabled: bool = False
    stt_enabled: bool = False
    llm_model: str = settings.GROQ_MODEL or "llama-3.3-70b-versatile"
    tts_voice: str = "default"
    stt_model: str = "base"
    auto_explain: bool = True
    suggest_videos: bool = True
    generate_assignments: bool = True
    track_engagement: bool = True
    enable_proctoring: bool = False
    explanation_threshold: float = 0.7
    video_suggestion_threshold: float = 0.6
    engagement_check_interval: int = 30


class CreateSessionRequest(BaseModel):
    """Request model for creating a session"""

    subject_id: str
    topic_id: Optional[str] = None
    student_ids: List[str] = []
    previous_session_id: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    duration_minutes: int = 60
    ai_config: Optional[AIConfigModel] = None


class UpdateSessionRequest(BaseModel):
    """Request model for updating a session"""

    status: Optional[str] = None
    duration_minutes: Optional[int] = None
    ai_config: Optional[AIConfigModel] = None


class SessionResponse(BaseModel):
    """Response model for session operations"""

    success: bool
    detail: str = ""
    session: Optional[Dict[str, Any]] = None
    livekit_token: Optional[str] = None
    livekit_room_name: Optional[str] = None
