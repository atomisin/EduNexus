from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

class MockQuestionBase(BaseModel):
    question_text: str
    options: Dict[str, str]  # {"A": "Choice 1", "B": "Choice 2", ...}
    correct_option: str
    explanation: Optional[str] = None
    difficulty: Optional[str] = "medium"
    topic_id: Optional[UUID] = None
    tags: List[str] = []

class MockQuestionCreate(MockQuestionBase):
    subject_id: UUID

class MockQuestion(MockQuestionBase):
    id: UUID
    subject_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class MockExamSeriesBase(BaseModel):
    title: str
    exam_type: str  # WAEC, JAMB, NECO
    subject_id: UUID
    duration_minutes: int = 60
    total_questions: int = 40
    is_active: bool = True

class MockExamSeriesCreate(MockExamSeriesBase):
    pass

class MockExamSeries(MockExamSeriesBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class MockAttemptBase(BaseModel):
    series_id: UUID
    answers: Dict[str, str] = {}  # {question_id: selected_option}

class MockAttemptCreate(MockAttemptBase):
    pass

class MockAttemptSchema(MockAttemptBase):
    id: UUID
    student_id: UUID
    score: Optional[float] = None
    total_questions: int
    correct_answers: int = 0
    time_taken_seconds: Optional[int] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
