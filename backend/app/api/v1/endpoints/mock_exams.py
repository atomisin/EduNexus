from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Any
from uuid import UUID
from datetime import datetime, timezone

from app.db.database import get_db
from app.models.mock_exam import MockExamSeries, MockQuestion, MockAttempt
from app.models.subject import Subject
from app.models.student import StudentProfile
from app.models.user import User
from app.api.v1.endpoints.auth import get_current_user

router = APIRouter()


async def _get_student_profile(db: AsyncSession, user: User) -> StudentProfile:
    """Resolve student_profiles.id from users.id."""
    res = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == user.id)
    )
    profile = res.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=403, detail="Student profile not found")
    return profile


@router.get("/series")
async def get_series(
    subject_id: UUID = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get available mock exam series."""
    profile = await _get_student_profile(db, current_user)
    
    query = (
        select(MockExamSeries, Subject)
        .join(Subject, MockExamSeries.subject_id == Subject.id)
        .where(MockExamSeries.is_active == True)
    )
    if subject_id:
        query = query.where(MockExamSeries.subject_id == subject_id)
    else:
        # Restriction: Students should only see mocks for subjects they are actually enrolled in
        enrolled_ids = []
        if profile.enrolled_subjects:
            for sid in profile.enrolled_subjects:
                try:
                    enrolled_ids.append(UUID(str(sid)))
                except ValueError:
                    continue
        if enrolled_ids:
            query = query.where(MockExamSeries.subject_id.in_(enrolled_ids))
        else:
            # If no subjects enrolled, they see nothing? Or standard ones?
            # Better to show nothing to encourage enrollment
            query = query.where(MockExamSeries.subject_id == None)

    res = await db.execute(query)
    rows = res.unique().all()
    
    result = []
    # Department filter: If a subject is strictly "Science"/"Art"/"Commercial",
    # and the student is in a department, we only show it to them if it matches.
    # Typical general subjects (Math, English) do not have a strict department (or they are "General").
    student_dept = getattr(profile, 'department', None)
    if student_dept:
        student_dept = student_dept.lower()

    for series, subject in rows:
        subj_dept = getattr(subject, 'department', None)
        if subj_dept and subj_dept.lower() in ['science', 'art', 'commercial', 'arts']:
            if student_dept and student_dept != subj_dept.lower().replace('arts', 'art'):
                continue # Skip if the department strictly mismatches

        q_count_res = await db.execute(
            select(func.count()).select_from(MockQuestion).where(
                MockQuestion.series_id == series.id
            )
        )
        total = q_count_res.scalar() or 0
        result.append({
            "id": series.id,
            "name": series.title,
            "subject_name": subject.name if subject else "Unknown",
            "exam_type": series.exam_type,
            "total_questions": total,
            "time_limit_minutes": series.time_limit_minutes,
        })
    return result


@router.post("/series/{series_id}/attempt")
async def start_attempt(
    series_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Start or resume a mock exam attempt."""
    profile = await _get_student_profile(db, current_user)

    series = await db.get(MockExamSeries, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Mock exam series not found")

    # Check for active existing attempt
    active_res = await db.execute(
        select(MockAttempt).where(
            MockAttempt.student_id == profile.id,
            MockAttempt.series_id == series_id,
            MockAttempt.is_completed == False,
        )
    )
    active_attempt = active_res.scalar_one_or_none()

    if active_attempt:
        return {"attempt_id": active_attempt.id}

    # Count questions
    q_count_res = await db.execute(
        select(func.count()).select_from(MockQuestion).where(
            MockQuestion.series_id == series_id
        )
    )
    total = q_count_res.scalar() or 0

    new_attempt = MockAttempt(
        student_id=profile.id,
        series_id=series_id,
        total_questions=total,
        answers={},
        is_completed=False,
    )
    db.add(new_attempt)
    await db.commit()
    await db.refresh(new_attempt)
    return {"attempt_id": new_attempt.id}


@router.get("/attempts/{attempt_id}")
async def get_attempt_details(
    attempt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get attempt context including questions."""
    profile = await _get_student_profile(db, current_user)

    attempt = await db.get(MockAttempt, attempt_id)
    if not attempt or attempt.student_id != profile.id:
        raise HTTPException(status_code=404, detail="Attempt not found")

    questions_res = await db.execute(
        select(MockQuestion).where(MockQuestion.series_id == attempt.series_id)
    )
    questions = questions_res.scalars().all()
    q_list = []

    for q in questions:
        q_data = {
            "id": q.id,
            "question_text": q.question_text,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "topic_tag": q.topic_tag,
        }
        if attempt.is_completed:
            q_data["correct_option"] = q.correct_option
            q_data["explanation"] = q.explanation
        q_list.append(q_data)

    return {
        "id": attempt.id,
        "series_id": attempt.series_id,
        "series_name": attempt.series.title if attempt.series else "Unknown",
        "time_limit_minutes": (
            attempt.series.time_limit_minutes if attempt.series else 60
        ),
        "is_completed": attempt.is_completed,
        "answers": attempt.answers,
        "questions": q_list,
        "score": attempt.score,
        "total_questions": attempt.total_questions,
        "time_taken_seconds": attempt.time_taken_seconds,
    }


from pydantic import BaseModel
from typing import List

class ComboAttemptRequest(BaseModel):
    series_ids: List[UUID]

@router.post("/combo-attempt")
async def start_combo_attempt(
    req: ComboAttemptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Start a multi-subject combination exam attempt (e.g. JAMB)."""
    profile = await _get_student_profile(db, current_user)

    if not req.series_ids:
        raise HTTPException(status_code=400, detail="No series provided")

    if len(req.series_ids) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 subjects allowed")

    attempt_ids = []
    
    for s_id in req.series_ids:
        series = await db.get(MockExamSeries, s_id)
        if not series:
            continue
            
        active_res = await db.execute(
            select(MockAttempt).where(
                MockAttempt.student_id == profile.id,
                MockAttempt.series_id == s_id,
                MockAttempt.is_completed == False,
            )
        )
        active_attempt = active_res.scalar_one_or_none()

        if active_attempt:
            attempt_ids.append(active_attempt.id)
            continue

        q_count_res = await db.execute(
            select(func.count()).select_from(MockQuestion).where(
                MockQuestion.series_id == s_id
            )
        )
        total = q_count_res.scalar() or 0

        new_attempt = MockAttempt(
            student_id=profile.id,
            series_id=s_id,
            total_questions=total,
            answers={},
            is_completed=False,
        )
        db.add(new_attempt)
        await db.commit()
        await db.refresh(new_attempt)
        attempt_ids.append(new_attempt.id)

    return {
        "attempt_ids": attempt_ids,
        "time_limit_minutes": 120 # Standard JAMB combo time
    }

class ComboSubmitRequest(BaseModel):
    attempts: List[dict] # list of {"attempt_id": UUID, "answers": {...}, "time_spent_seconds": int}

@router.post("/combo-submit")
async def submit_combo_attempt(
    req: ComboSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Submit multiple attempts at once for a combo exam."""
    profile = await _get_student_profile(db, current_user)
    
    results = []
    total_score = 0
    total_questions_all = 0
    
    for attempt_data in req.attempts:
        a_id = attempt_data.get("attempt_id")
        answers = attempt_data.get("answers", {})
        time_spent = attempt_data.get("time_spent_seconds", 0)
        
        if not a_id:
            continue
            
        attempt = await db.get(MockAttempt, str(a_id)) # Cast to str for UUID 
        if not attempt or attempt.student_id != profile.id:
            continue
            
        if attempt.is_completed:
            results.append({"series_id": attempt.series_id, "status": "already_completed"})
            continue
            
        attempt.answers = answers
        
        questions_res = await db.execute(
            select(MockQuestion).where(MockQuestion.series_id == attempt.series_id)
        )
        questions = questions_res.scalars().all()
        score = 0
        for q in questions:
            ans = answers.get(str(q.id))
            if ans and ans.upper() == q.correct_option.upper():
                score += 1
                
        attempt.score = score
        attempt.total_questions = len(questions)
        attempt.is_completed = True
        attempt.completed_at = datetime.now(timezone.utc)
        attempt.time_taken_seconds = time_spent
        
        total_score += score
        total_questions_all += attempt.total_questions
        
        await db.commit()
        await db.refresh(attempt)
        
        results.append({
            "attempt_id": attempt.id,
            "series_id": attempt.series_id,
            "score": score,
            "total_questions": attempt.total_questions
        })
        
    return {
        "combo_results": results,
        "total_score": total_score,
        "total_questions": total_questions_all,
        "is_completed": True
    }

@router.post("/attempts/{attempt_id}/submit")
async def submit_attempt(
    attempt_id: UUID,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Submit attempt and calculate score."""
    profile = await _get_student_profile(db, current_user)

    attempt = await db.get(MockAttempt, attempt_id)
    if not attempt or attempt.student_id != profile.id:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.is_completed:
        raise HTTPException(status_code=400, detail="Attempt already completed")

    answers = data.get("answers", {})
    attempt.answers = answers

    # Calculate score
    questions_res = await db.execute(
        select(MockQuestion).where(MockQuestion.series_id == attempt.series_id)
    )
    questions = questions_res.scalars().all()
    score = 0
    for q in questions:
        ans = answers.get(str(q.id))
        if ans and ans.upper() == q.correct_option.upper():
            score += 1

    attempt.score = score
    attempt.total_questions = len(questions)
    attempt.is_completed = True
    attempt.completed_at = datetime.now(timezone.utc)

    if attempt.started_at:
        started = attempt.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        attempt.time_taken_seconds = int(
            (attempt.completed_at - started).total_seconds()
        )

    await db.commit()
    await db.refresh(attempt)

    return {
        "score": attempt.score,
        "total_questions": attempt.total_questions,
        "time_spent_seconds": attempt.time_taken_seconds,
        "is_completed": True,
    }


@router.get("/history")
async def get_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get user's mock exam history."""
    profile = await _get_student_profile(db, current_user)

    attempts_res = await db.execute(
        select(MockAttempt)
        .where(
            MockAttempt.student_id == profile.id,
            MockAttempt.is_completed == True,
        )
        .order_by(MockAttempt.completed_at.desc())
    )
    attempts = attempts_res.scalars().unique().all()

    result = []
    for a in attempts:
        result.append({
            "id": a.id,
            "series_name": a.series.title if a.series else "Unknown",
            "score": a.score,
            "total_questions": a.total_questions,
            "completed_at": a.completed_at,
        })
    return result
