import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Integer,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.junction_tables import student_subject, teacher_subject


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)

    # Education Level
    education_level = Column(
        String(50), nullable=False
    )  # primary, secondary, professional

    # Hierarchy
    parent_subject_id = Column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True
    )

    # Curriculum Information
    curriculum_type = Column(
        String(50), nullable=True
    )  # WAEC, NECO, Cambridge, JAMB, etc.
    grade_levels = Column(ARRAY(String), default=list)  # ['JSS1', 'JSS2', 'SS1', etc.]
    departments = Column(ARRAY(String), default=list)  # ['Science', 'Art', 'Commercial']

    # Metadata
    description = Column(Text, nullable=True)
    learning_objectives = Column(ARRAY(Text), default=list)
    prerequisites = Column(ARRAY(UUID(as_uuid=True)), default=list)

    # Teacher Assignment
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    is_private = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    creator = relationship("User", lazy="joined")
    topics = relationship("Topic", back_populates="subject", lazy="selectin")
    parent = relationship("Subject", remote_side=[id], backref="children", lazy="joined")
    enrolled_students = relationship(
        "User",
        secondary=student_subject,
        back_populates="enrolled_subjects_rel",
        lazy="selectin",
    )
    assigned_teachers = relationship(
        "User",
        secondary=teacher_subject,
        back_populates="subjects_taught_rel",
        lazy="selectin",
    )


class Topic(Base):
    __tablename__ = "topics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Difficulty and Order
    difficulty_level = Column(Integer, default=1)  # 1-5
    sort_order = Column(Integer, default=0)

    # Nigerian Academic Term (First Term, Second Term, Third Term)
    term = Column(String(20), nullable=True)  # 'First Term', 'Second Term', 'Third Term'

    # Estimated Time
    estimated_hours = Column(Integer, nullable=True)

    # Prerequisites (within subject)
    prerequisite_topics = Column(ARRAY(UUID(as_uuid=True)), default=list)

    # Learning Outcomes
    learning_outcomes = Column(ARRAY(Text), default=list)

    # AI-Generated Content
    ai_summary = Column(Text, nullable=True)
    ai_key_points = Column(ARRAY(Text), default=list)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    subject = relationship("Subject", back_populates="topics", lazy="joined")
    lessons = relationship("Lesson", back_populates="topic", lazy="selectin")


class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=False)

    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)

    # Content Types
    has_video = Column(Boolean, default=False)
    has_audio = Column(Boolean, default=False)
    has_interactive = Column(Boolean, default=False)
    has_quiz = Column(Boolean, default=False)

    # Materials
    materials = Column(JSONB, default=list)  # Array of material references

    display_order = Column(Integer, default=0)
    estimated_minutes = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    topic = relationship("Topic", back_populates="lessons", lazy="joined")
