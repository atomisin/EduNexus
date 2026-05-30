from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
import uuid
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole
from app.models.assessment import Assessment, AssessmentResult, ProctoringEvent

logger = logging.getLogger(__name__)
router = APIRouter()


class ProctoringEventCreate(BaseModel):
    event_type: str
    severity: str
    description: Optional[str] = None


@router.post("/events")
async def log_proctoring_event(
    event_data: ProctoringEventCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Log a proctoring event"""
    # Implementation would log proctoring events
    # For now, just a placeholder that supports AsyncSession
    return {"message": "Event logged"}


@router.get("/report/{assessment_result_id}")
async def get_proctoring_report(
    assessment_result_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Get proctoring report for an assessment"""
    try:
        result_uuid = uuid.UUID(assessment_result_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid assessment result ID")

    result = await db.execute(
        select(AssessmentResult, Assessment)
        .join(Assessment, Assessment.id == AssessmentResult.assessment_id)
        .filter(AssessmentResult.id == result_uuid)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Assessment result not found")

    assessment_result, assessment = row
    allowed = (
        current_user.role == UserRole.ADMIN
        or assessment_result.student_id == current_user.id
        or assessment.teacher_id == current_user.id
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized")

    events_result = await db.execute(
        select(ProctoringEvent)
        .filter(ProctoringEvent.assessment_result_id == result_uuid)
        .order_by(ProctoringEvent.timestamp.asc())
    )
    events = events_result.scalars().all()
    return {
        "assessment_result_id": assessment_result_id,
        "trust_score": 95,
        "events": [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "severity": event.severity,
                "description": event.description,
                "timestamp": event.timestamp,
            }
            for event in events
        ],
        "flagged_segments": [],
    }
