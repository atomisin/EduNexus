from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime, timezone
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.assessment import Assessment, AssessmentResult
from app.services.gamification import award_xp

logger = logging.getLogger(__name__)
router = APIRouter()


class AssessmentCreate(BaseModel):
    title: str
    subject_id: str
    description: Optional[str] = None
    time_limit_minutes: Optional[int] = None
    questions: List[dict]


class AssessmentSubmit(BaseModel):
    score: float
    feedback: Optional[str] = None
    time_taken_seconds: Optional[int] = None


@router.get("/")
async def get_assessments(
    subject_id: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Get assessments"""
    stmt = select(Assessment).filter(Assessment.is_active == True)
    
    if subject_id:
        try:
            subject_uuid = uuid.UUID(subject_id)
            stmt = stmt.filter(Assessment.subject_id == subject_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid subject ID format")
    
    res = await db.execute(stmt)
    assessments = res.scalars().all()
    
    return {
        "assessments": [
            {
                "id": str(a.id),
                "title": a.title,
                "description": a.description,
                "time_limit_minutes": a.time_limit_minutes,
                "question_count": len(a.questions) if a.questions else 0
            }
            for a in assessments
        ]
    }


@router.post("/")
async def create_assessment(
    assessment_data: AssessmentCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Create assessment (teacher only)"""
    if current_user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers can create assessments")
    
    assessment = Assessment(
        id=uuid.uuid4(),
        teacher_id=current_user.id,
        subject_id=uuid.UUID(assessment_data.subject_id),
        title=assessment_data.title,
        description=assessment_data.description,
        time_limit_minutes=assessment_data.time_limit_minutes,
        questions=assessment_data.questions,
        is_active=True,
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    
    return {
        "success": True,
        "detail": "Assessment created",
        "assessment_id": str(assessment.id)
    }


@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Get assessment details"""
    try:
        assessment_uuid = uuid.UUID(assessment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid assessment ID format")

    res = await db.execute(
        select(Assessment).filter(
            Assessment.id == assessment_uuid,
            Assessment.is_active == True
        )
    )
    assessment = res.scalars().first()
    
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    return {
        "id": str(assessment.id),
        "title": assessment.title,
        "description": assessment.description,
        "time_limit_minutes": assessment.time_limit_minutes,
        "questions": assessment.questions
    }


@router.post("/{assessment_id}/start")
async def start_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Start an assessment"""
    try:
        assessment_uuid = uuid.UUID(assessment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid assessment ID format")

    res = await db.execute(
        select(Assessment).filter(Assessment.id == assessment_uuid)
    )
    assessment = res.scalars().first()
    
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    # Check if a result already exists to avoid multiple starts
    res_existing = await db.execute(
        select(AssessmentResult).filter(
            AssessmentResult.assessment_id == assessment.id,
            AssessmentResult.student_id == current_user.id,
            AssessmentResult.status == "in_progress"
        )
    )
    existing = res_existing.scalars().first()
    if existing:
         return {
            "success": True,
            "detail": "Assessment already in progress",
            "result_id": str(existing.id)
        }

    result = AssessmentResult(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        student_id=current_user.id,
        status="in_progress",
        started_at=datetime.now(timezone.utc),
        attempt_number=1
    )
    
    db.add(result)
    await db.commit()
    await db.refresh(result)
    
    return {
        "success": True,
        "detail": "Assessment started",
        "result_id": str(result.id)
    }


@router.post("/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: str,
    submission: AssessmentSubmit,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Submit an assessment and calculate Gamification XP"""
    try:
        assessment_uuid = uuid.UUID(assessment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid assessment ID format")

    res = await db.execute(select(Assessment).filter(Assessment.id == assessment_uuid))
    assessment = res.scalars().first()
    
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
        
    # Verify student is making the submission
    # We need to ensure student_profile is loaded. In AsyncSession, it might need to be explicitly loaded if it's a relationship.
    # However, let's just refresh the user if needed or check if the relationship exists.
    # The current_user from get_current_user might not have student_profile loaded asynchronously.
    
    from sqlalchemy.orm import selectinload
    res_user = await db.execute(
        select(User).options(selectinload(User.student_profile)).filter(User.id == current_user.id)
    )
    user = res_user.scalars().first()

    if user.role != "student" or not user.student_profile:
        raise HTTPException(status_code=403, detail="Only students can submit assessments")

    # Find active result
    res_result = await db.execute(
        select(AssessmentResult).filter(
            AssessmentResult.assessment_id == assessment_uuid,
            AssessmentResult.student_id == user.id,
            AssessmentResult.status == "in_progress"
        )
    )
    result = res_result.scalars().first()
    
    if not result:
        # Create a new result if they skipped the start endpoint
        result = AssessmentResult(
            id=uuid.uuid4(),
            assessment_id=assessment.id,
            student_id=user.id,
            status="completed",
            score=submission.score,
            feedback=submission.feedback,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            attempt_number=1
        )
        db.add(result)
    else:
        # Update existing
        result.status = "completed"
        result.score = submission.score
        result.feedback = submission.feedback
        result.completed_at = datetime.now(timezone.utc)

    # Gamification: Award XP based on Score 
    xp_gained = int(submission.score)
    if xp_gained > 0:
        await award_xp(db, user.student_profile, xp_gained, f"Completed Assessment: {assessment.title}")

    await db.commit()
    await db.refresh(result)
    
    return {
        "success": True,
        "detail": "Assessment submitted successfully",
        "result_id": str(result.id),
        "xp_gained": xp_gained,
        "new_total_xp": user.student_profile.xp,
        "current_level": user.student_profile.level
    }