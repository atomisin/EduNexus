import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
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


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True
    )

    # Unique Student ID for teacher linking (e.g., "EDU-2026-ABC123")
    student_id = Column(String(20), nullable=True, unique=True)

    # Personal Information
    gender = Column(String(20), nullable=True)  # male, female
    age = Column(Integer, nullable=True)

    # Learning Preferences
    learning_style = Column(
        String(50), nullable=True
    )  # visual, auditory, kinesthetic, reading
    preferred_pace = Column(String(50), nullable=True)  # slow, moderate, fast
    attention_span = Column(Integer, nullable=True)  # For backward compatibility
    attention_span_minutes = Column(Integer, default=30)
    best_study_time = Column(String(50), nullable=True)  # morning, afternoon, evening

    # Academic Information
    education_level = Column(
        String(50), nullable=True
    )  # primary, secondary, professional
    education_category = Column(String(50), nullable=True) # basic_education, senior_secondary, professional, etc.
    current_grade_level = Column(String(50), nullable=True)
    grade_level = Column(String(50), nullable=True)  # For backward compatibility
    
    # Department for SS and Exams (Science, Art, Commercial)
    department = Column(String(50), nullable=True)
    
    school_name = Column(String(255), nullable=True)
    curriculum_type = Column(
        String(50), nullable=True
    )  # WAEC, NECO, Cambridge, JAMB, etc.
    
    # Specific Exam Targets (e.g. ["JAMB 2025", "WAEC 2025"])
    exam_targets = Column(ARRAY(String), default=list)
    # Selected JAMB subjects (Exactly 4)
    jamb_subjects = Column(ARRAY(String), default=list)
    
    course_name = Column(String(255), nullable=True)  # For professional courses
    professional_curriculum = Column(JSONB, nullable=True)  # AI-generated roadmap

    # Subjects student wants to learn (can be names or IDs)
    enrolled_subjects = Column(ARRAY(String), default=list)

    # Guardian Information
    guardian_name = Column(String(255), nullable=True)
    guardian_email = Column(String(255), nullable=True)
    guardian_phone = Column(String(50), nullable=True)

    # Topics and Interests
    desired_topics = Column(ARRAY(String), default=list)

    # Subject Proficiency (JSON for flexibility)
    # Example: {"mathematics": 0.75, "physics": 0.60, "chemistry": 0.80}
    subject_proficiency = Column(JSONB, default=dict)

    # Learning Difficulties
    has_learning_difficulties = Column(Boolean, default=False)
    learning_difficulties_notes = Column(Text, nullable=True)
    accommodations_needed = Column(ARRAY(String), default=list)

    # Goals and Aspirations
    career_interests = Column(ARRAY(String), default=list)
    target_universities = Column(ARRAY(String), default=list)
    target_grades = Column(JSONB, default=dict)

    # Behavioral Data
    engagement_patterns = Column(JSONB, default=dict)
    common_mistakes = Column(JSONB, default=dict)
    strength_areas = Column(ARRAY(String), default=list)
    weakness_areas = Column(ARRAY(String), default=list)

    # AI-Generated Insights
    learning_recommendations = Column(ARRAY(Text), default=list)
    suggested_focus_areas = Column(ARRAY(String), default=list)
    estimated_time_to_mastery = Column(JSONB, default=dict)

    # Gamification and Energy
    brain_power = Column(Integer, default=100, nullable=False)
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_active_date = Column(DateTime(timezone=True), nullable=True)
    badges = Column(JSONB, default=list)
    avatar_url = Column(String(500), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", back_populates="student_profile", lazy="joined")
    assessments = relationship(
        "LearningStyleAssessment", back_populates="student", lazy="selectin"
    )


class LearningStyleAssessment(Base):
    __tablename__ = "learning_style_assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False
    )
    assessment_date = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # VARK Model Scores (0-100)
    visual_score = Column(Integer, nullable=True)
    auditory_score = Column(Integer, nullable=True)
    reading_score = Column(Integer, nullable=True)
    kinesthetic_score = Column(Integer, nullable=True)

    dominant_style = Column(String(20), nullable=True)
    secondary_style = Column(String(20), nullable=True)

    detailed_results = Column(JSONB, default=dict)

    # Relationships
    student = relationship(
        "StudentProfile", back_populates="assessments", lazy="joined"
    )
