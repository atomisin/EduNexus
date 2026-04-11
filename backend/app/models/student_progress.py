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
    Float,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from app.db.database import Base


class StudentSubjectProgress(Base):
    """Tracks each student's progress in a specific subject"""

    __tablename__ = "student_subject_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)

    # Quiz Performance
    quiz_scores = Column(JSONB, default=list)  # List of {quiz_id, score, date, topic}
    average_quiz_score = Column(Float, default=0.0)
    total_quizzes_taken = Column(Integer, default=0)
    highest_quiz_score = Column(Float, default=0.0)
    lowest_quiz_score = Column(Float, default=0.0)

    # Attendance
    total_sessions = Column(Integer, default=0)
    attended_sessions = Column(Integer, default=0)
    missed_sessions = Column(Integer, default=0)
    attendance_percentage = Column(Float, default=0.0)

    # Assignment Performance
    assignment_scores = Column(
        JSONB, default=list
    )  # List of {assignment_id, score, date}
    average_assignment_score = Column(Float, default=0.0)

    # Progress Tracking
    current_topic_id = Column(
        UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True
    )
    topics_completed = Column(ARRAY(UUID), default=list)
    topics_in_progress = Column(ARRAY(UUID), default=list)

    # Time Spent
    total_time_spent_minutes = Column(Integer, default=0)
    last_active = Column(DateTime(timezone=True), nullable=True)

    # Strengths and Weaknesses
    strength_areas = Column(ARRAY(String), default=list)
    weakness_areas = Column(ARRAY(String), default=list)

    # Proficiency Level
    proficiency_level = Column(
        String(50), default="Beginner"
    )  # Beginner, Developing, Proficient, Advanced
    mastery_percentage = Column(Float, default=0.0)

    # Subtopic Roadmap tracking
    # Format: { topic_id: { subtopics: [{name, status, score}], current_index: 0 } }
    subtopic_progress = Column(JSONB, default=dict)

    # Chat history for lesson continuity across sessions
    # Format: { "topic_name::subtopic_name": [ {role, content, timestamp}, ... ] }
    chat_history = Column(JSONB, default=dict)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MonthlyReport(Base):
    """Monthly progress report for students sent to parents"""

    __tablename__ = "monthly_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    parent_email = Column(String(255), nullable=True)

    # Report Period
    month = Column(Integer, nullable=False)  # 1-12
    year = Column(Integer, nullable=False)

    # Summary
    total_subjects = Column(Integer, default=0)
    subjects_improved = Column(Integer, default=0)
    subjects_declined = Column(Integer, default=0)

    # Scores
    average_score = Column(Float, default=0.0)
    average_attendance = Column(Float, default=0.0)

    # Details
    subject_performance = Column(
        JSONB, default=list
    )  # [{subject, score, attendance, trend}]
    quiz_performance = Column(JSONB, default=list)  # [{quiz, score, date}]
    strengths = Column(ARRAY(String), default=list)
    weaknesses = Column(ARRAY(String), default=list)

    # Recommendations
    recommendations = Column(ARRAY(Text), default=list)
    focus_areas = Column(ARRAY(Text), default=list)

    # Status
    status = Column(String(50), default="pending")  # pending, generated, sent, failed
    sent_at = Column(DateTime(timezone=True), nullable=True)
    generated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Report Content (HTML/PDF ready)
    report_content = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class StudentActivityLog(Base):
    """Detailed activity log for analytics"""

    __tablename__ = "student_activity_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Activity Details
    activity_type = Column(
        String(50), nullable=False
    )  # quiz, session, assignment, video, material
    activity_name = Column(String(255), nullable=False)

    # Subject/Topic
    subject_id = Column(UUID(as_uuid=True), nullable=True)
    topic_id = Column(UUID(as_uuid=True), nullable=True)

    # Performance
    score = Column(Float, nullable=True)
    time_spent_minutes = Column(Integer, default=0)

    # Metadata
    extra_data = Column(JSONB, default=dict)

    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
