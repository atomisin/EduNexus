from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import uuid
import logging
from typing import List, Optional, Dict
from app.models.mock_exam import MockExamSeries, MockQuestion, MockAttempt
from app.schemas.mock_exam import MockExamSeriesCreate, MockQuestionCreate, MockAttemptCreate
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class MockExamService:
    @staticmethod
    async def get_series_by_subject(db: AsyncSession, subject_id: uuid.UUID) -> List[MockExamSeries]:
        query = select(MockExamSeries).filter(
            MockExamSeries.subject_id == subject_id,
            MockExamSeries.is_active == True
        )
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def create_series(db: AsyncSession, series_in: MockExamSeriesCreate) -> MockExamSeries:
        series = MockExamSeries(**series_in.dict())
        db.add(series)
        await db.commit()
        await db.refresh(series)
        return series

    @staticmethod
    async def get_questions_for_series(db: AsyncSession, series_id: uuid.UUID) -> List[MockQuestion]:
        # Get series to find subject_id and limit
        query = select(MockExamSeries).filter(MockExamSeries.id == series_id)
        series = (await db.execute(query)).scalars().first()
        if not series:
            return []
        
        # Randomly select total_questions for that subject
        query = select(MockQuestion).filter(
            MockQuestion.subject_id == series.subject_id
        ).order_by(func.random()).limit(series.total_questions)
        
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def start_attempt(db: AsyncSession, student_id: uuid.UUID, series_id: uuid.UUID) -> MockAttempt:
        # Get total questions
        series_query = select(MockExamSeries).filter(MockExamSeries.id == series_id)
        series = (await db.execute(series_query)).scalars().first()
        
        attempt = MockAttempt(
            student_id=student_id,
            series_id=series_id,
            total_questions=series.total_questions if series else 0,
            status="started"
        )
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)
        return attempt

    @staticmethod
    async def submit_attempt(
        db: AsyncSession, 
        attempt_id: uuid.UUID, 
        answers: Dict[str, str],
        time_taken_seconds: int
    ) -> MockAttempt:
        query = select(MockAttempt).filter(MockAttempt.id == attempt_id)
        attempt = (await db.execute(query)).scalars().first()
        if not attempt:
            raise ValueError("Attempt not found")
        
        # Calculate score
        correct_count = 0
        # Get questions involved
        question_ids = [uuid.UUID(qid) for qid in answers.keys()]
        q_query = select(MockQuestion).filter(MockQuestion.id.in_(question_ids))
        questions = (await db.execute(q_query)).scalars().all()
        q_dict = {str(q.id): q.correct_option for q in questions}
        
        for q_id, selected in answers.items():
            if q_dict.get(q_id) == selected:
                correct_count += 1
        
        attempt.answers = answers
        attempt.correct_answers = correct_count
        attempt.score = (correct_count / attempt.total_questions * 100) if attempt.total_questions > 0 else 0
        attempt.time_taken_seconds = time_taken_seconds
        attempt.status = "completed"
        attempt.completed_at = datetime.now(timezone.utc)
        
        await db.commit()
        await db.refresh(attempt)
        return attempt

mock_exam_service = MockExamService()
