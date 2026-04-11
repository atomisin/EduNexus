from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, date
import uuid

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.student_progress import (
    StudentSubjectProgress,
    MonthlyReport,
    StudentActivityLog,
)
from app.models.student import StudentProfile
from sqlalchemy.orm.attributes import flag_modified
from app.models.junction_tables import StudentTopicProgress
from app.models.subject import Topic, Subject

router = APIRouter()


async def complete_topic_progression(
    db: AsyncSession, student_id: uuid.UUID, topic_id: uuid.UUID
):
    """Internal helper to mark topic as completed and unlock next one."""
    now = datetime.now(timezone.utc)

    # 1. Get topic to find subject and order
    res_topic = await db.execute(select(Topic).filter(Topic.id == topic_id))
    topic = res_topic.scalars().first()

    if not topic:
        return None

    # 2. Update current topic progress
    res_curr = await db.execute(
        select(StudentTopicProgress).filter(
            StudentTopicProgress.student_id == student_id,
            StudentTopicProgress.topic_id == topic_id,
        )
    )
    curr_prog = res_curr.scalars().first()

    if not curr_prog:
        curr_prog = StudentTopicProgress(
            student_id=student_id,
            topic_id=topic_id,
            subject_id=topic.subject_id,
            status="completed",
            progress_pct=100,
            completed_at=now,
            unlocked_at=now,
        )
        db.add(curr_prog)
    else:
        curr_prog.status = "completed"
        curr_prog.progress_pct = 100
        curr_prog.completed_at = now

    # 3. Unlock the NEXT topic
    # Find next topic by sort_order/display_order
    current_order = getattr(topic, "sort_order", topic.display_order)

    res_next = await db.execute(
        select(Topic)
        .filter(
            Topic.subject_id == topic.subject_id,
            getattr(Topic, "sort_order", Topic.display_order) > current_order,
        )
        .order_by(Topic.sort_order.asc())
        .limit(1)
    )
    next_topic = res_next.scalars().first()

    next_topic_id = None
    if next_topic:
        next_topic_id = next_topic.id
        res_next_prog = await db.execute(
            select(StudentTopicProgress).filter(
                StudentTopicProgress.student_id == student_id,
                StudentTopicProgress.topic_id == next_topic.id,
            )
        )
        next_prog = res_next_prog.scalars().first()

        if not next_prog:
            next_prog = StudentTopicProgress(
                student_id=student_id,
                topic_id=next_topic.id,
                subject_id=topic.subject_id,
                status="unlocked",
                unlocked_at=now,
            )
            db.add(next_prog)
        elif next_prog.status == "locked":
            next_prog.status = "unlocked"
            next_prog.unlocked_at = now

    return next_topic_id


class QuizScoreUpdate(BaseModel):
    subject_id: str
    topic: Optional[str] = None
    score: float
    total_possible: float = 100.0


class AttendanceUpdate(BaseModel):
    subject_id: str
    session_id: str
    attended: bool
    time_spent_minutes: int = 0


@router.get("/progress")
async def get_student_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get overall student progress across all subjects"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can view their progress"
        )

    res_prog = await db.execute(
        select(StudentSubjectProgress).filter(
            StudentSubjectProgress.student_id == current_user.id
        )
    )
    progress = res_prog.scalars().all()

    return {
        "progress": [
            {
                "subject_id": str(p.subject_id),
                "average_quiz_score": p.average_quiz_score,
                "total_quizzes": p.total_quizzes_taken,
                "attendance_percentage": p.attendance_percentage,
                "proficiency_level": p.proficiency_level,
                "mastery_percentage": p.mastery_percentage,
                "strength_areas": p.strength_areas,
                "weakness_areas": p.weakness_areas,
            }
            for p in progress
        ]
    }


@router.get("/progress/summary")
async def get_progress_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get per-topic progress for the current student, grouped by subject."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can view progress")

    from app.models.junction_tables import StudentTopicProgress
    from app.models.subject import Topic

    res = await db.execute(
        select(StudentTopicProgress, Topic)
        .join(Topic, StudentTopicProgress.topic_id == Topic.id)
        .filter(StudentTopicProgress.student_id == current_user.id)
    )
    rows = res.all()

    by_subject: dict = {}
    for progress, topic in rows:
        sid = str(topic.subject_id)
        if sid not in by_subject:
            by_subject[sid] = []
        by_subject[sid].append(
            {
                "topic_id": str(topic.id),
                "topic_name": topic.name,
                "progress_pct": progress.progress_pct,
                "completed_at": progress.completed_at.isoformat()
                if progress.completed_at
                else None,
                "last_accessed": progress.last_accessed.isoformat()
                if progress.last_accessed
                else None,
            }
        )

    return {"subjects": by_subject}


@router.get("/progress/{subject_id}")
async def get_subject_progress(
    subject_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get detailed progress for a specific subject"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can view their progress"
        )

    res_prog = await db.execute(
        select(StudentSubjectProgress).filter(
            StudentSubjectProgress.student_id == current_user.id,
            StudentSubjectProgress.subject_id == uuid.UUID(subject_id),
        )
    )
    progress = res_prog.scalars().first()

    if not progress:
        return {"success": True, "detail": "No progress data for this subject yet"}

    return {
        "subject_id": str(progress.subject_id),
        "average_quiz_score": progress.average_quiz_score,
        "total_quizzes": progress.total_quizzes_taken,
        "highest_score": progress.highest_quiz_score,
        "lowest_score": progress.lowest_quiz_score,
        "quiz_scores": progress.quiz_scores,
        "attendance": {
            "total": progress.total_sessions,
            "attended": progress.attended_sessions,
            "percentage": progress.attendance_percentage,
        },
        "proficiency_level": progress.proficiency_level,
        "mastery_percentage": progress.mastery_percentage,
        "strength_areas": progress.strength_areas,
        "weakness_areas": progress.weakness_areas,
        "topics_completed": progress.topics_completed,
        "total_time_spent": progress.total_time_spent_minutes,
    }


@router.post("/quiz-score")
async def record_quiz_score(
    data: QuizScoreUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Record a quiz score and update progress"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can record quiz scores"
        )

    res_prog = await db.execute(
        select(StudentSubjectProgress).filter(
            StudentSubjectProgress.student_id == current_user.id,
            StudentSubjectProgress.subject_id == uuid.UUID(data.subject_id),
        )
    )
    progress = res_prog.scalars().first()

    if not progress:
        progress = StudentSubjectProgress(
            student_id=current_user.id, subject_id=uuid.UUID(data.subject_id)
        )
        db.add(progress)

    score_percentage = (data.score / data.total_possible) * 100

    progress.quiz_scores = progress.quiz_scores + [
        {
            "score": data.score,
            "total": data.total_possible,
            "percentage": score_percentage,
            "topic": data.topic,
            "date": datetime.now(timezone.utc).isoformat(),
        }
    ]
    progress.total_quizzes_taken += 1

    if score_percentage > progress.highest_quiz_score:
        progress.highest_quiz_score = score_percentage
    if progress.lowest_quiz_score == 0 or score_percentage < progress.lowest_quiz_score:
        progress.lowest_quiz_score = score_percentage

    avg = sum(q["percentage"] for q in progress.quiz_scores) / len(progress.quiz_scores)
    progress.average_quiz_score = avg

    if avg >= 80:
        progress.proficiency_level = "Advanced"
    elif avg >= 60:
        progress.proficiency_level = "Proficient"
    elif avg >= 40:
        progress.proficiency_level = "Developing"
    else:
        progress.proficiency_level = "Beginner"

    progress.mastery_percentage = min(avg, 100)
    progress.updated_at = datetime.now(timezone.utc)

    # Sync to StudentProfile for teacher analytics
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = res_prof.scalars().first()
    if profile:
        res_subj = await db.execute(
            select(Subject).filter(Subject.id == uuid.UUID(data.subject_id))
        )
        subject = res_subj.scalars().first()
        if subject:
            if not profile.subject_proficiency:
                profile.subject_proficiency = {}
            # Update the proficiency - store as 0.0-1.0 scale as expected by analytics
            profile.subject_proficiency[subject.name] = avg / 100.0
            # Mark as modified to ensure SQLAlchemy detects the change in JSONB
            from sqlalchemy.orm.attributes import flag_modified

            flag_modified(profile, "subject_proficiency")

    await db.commit()

    return {"success": True, "detail": "Quiz score recorded", "new_average": avg}


@router.get("/analytics/performance")
async def get_performance_analytics(
    subject_id: Optional[str] = None,
    time_range: Optional[str] = "30d",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get performance analytics with charts data"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can view their analytics"
        )

    stmt = select(StudentActivityLog).filter(
        StudentActivityLog.student_id == current_user.id
    )

    if subject_id:
        stmt = stmt.filter(StudentActivityLog.subject_id == uuid.UUID(subject_id))

    res_act = await db.execute(
        stmt.order_by(StudentActivityLog.timestamp.desc()).limit(100)
    )
    activities = res_act.scalars().all()

    quiz_scores = [a for a in activities if a.activity_type == "quiz"]
    session_activities = [a for a in activities if a.activity_type == "session"]

    if quiz_scores:
        avg_score = sum(a.score or 0 for a in quiz_scores) / len(quiz_scores)
    else:
        avg_score = 0

    if session_activities:
        attended = sum(1 for a in session_activities if a.metadata.get("attended"))
        attendance_pct = (attended / len(session_activities)) * 100
    else:
        attendance_pct = 0

    return {
        "summary": {
            "average_score": round(avg_score, 1),
            "total_quizzes": len(quiz_scores),
            "attendance_percentage": round(attendance_pct, 1),
            "total_time_spent": sum(a.time_spent_minutes for a in activities),
        },
        "chart_data": [
            {
                "date": a.timestamp.strftime("%Y-%m-%d"),
                "score": a.score or 0,
                "type": a.activity_type,
                "name": a.activity_name
            } for a in reversed(activities[-10:])
        ],
        "recent_activities": [
            {
                "type": a.activity_type,
                "name": a.activity_name,
                "score": a.score,
                "date": a.timestamp.isoformat(),
            }
            for a in activities[:10]
        ],
    }


@router.get("/reports/monthly")
async def get_monthly_reports(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get monthly reports for the student/parent"""
    if current_user.role not in ["student", "parent"]:
        raise HTTPException(status_code=403, detail="Access denied")

    res_reports = await db.execute(
        select(MonthlyReport)
        .filter(MonthlyReport.student_id == current_user.id)
        .order_by(MonthlyReport.year.desc(), MonthlyReport.month.desc())
    )
    reports = res_reports.scalars().all()

    return {
        "reports": [
            {
                "id": str(r.id),
                "month": r.month,
                "year": r.year,
                "average_score": r.average_score,
                "average_attendance": r.average_attendance,
                "status": r.status,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            }
            for r in reports
        ]
    }


@router.get("/reports/monthly/{report_id}")
async def get_monthly_report_detail(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get detailed monthly report"""
    res_report = await db.execute(
        select(MonthlyReport).filter(
            MonthlyReport.id == uuid.UUID(report_id),
            MonthlyReport.student_id == current_user.id,
        )
    )
    report = res_report.scalars().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "id": str(report.id),
        "month": report.month,
        "year": report.year,
        "average_score": report.average_score,
        "average_attendance": report.average_attendance,
        "subject_performance": report.subject_performance,
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "recommendations": report.recommendations,
        "focus_areas": report.focus_areas,
        "status": report.status,
        "generated_at": report.generated_at.isoformat()
        if report.generated_at
        else None,
        "sent_at": report.sent_at.isoformat() if report.sent_at else None,
    }


# ─── Completion Tracking ───────────────────────────────────────────


class TopicProgressUpdate(BaseModel):
    topic_id: str
    progress_pct: int  # 0-100
    completed: bool = False


@router.post("/progress/update")
async def update_topic_progress(
    data: TopicProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Upsert a student's per-topic progress."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can update progress")

    from app.models.junction_tables import StudentTopicProgress

    topic_uuid = uuid.UUID(data.topic_id)

    res = await db.execute(
        select(StudentTopicProgress).filter(
            StudentTopicProgress.student_id == current_user.id,
            StudentTopicProgress.topic_id == topic_uuid,
        )
    )
    record = res.scalars().first()

    now = datetime.now(timezone.utc)

    if record:
        # Update existing
        record.progress_pct = max(record.progress_pct, data.progress_pct)
        record.last_accessed = now
        if data.completed and not record.completed_at:
            record.completed_at = now
    else:
        # Insert new
        record = StudentTopicProgress(
            student_id=current_user.id,
            topic_id=topic_uuid,
            progress_pct=data.progress_pct,
            last_accessed=now,
            completed_at=now if data.completed else None,
        )
        db.add(record)

    await db.commit()


@router.get("/progress/topics/{subject_id}")
async def get_subject_topics_progress(
    subject_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get all topics for a subject with their unlock status and performance"""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can view progress")

    from app.models.junction_tables import StudentTopicProgress
    from app.models.subject import Topic

    try:
        subject_uuid = uuid.UUID(subject_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subject ID")

    # 1. Fetch all topics for subject
    # Use sort_order if it exists, else display_order
    res_topics = await db.execute(
        select(Topic)
        .filter(Topic.subject_id == subject_uuid)
        .order_by(Topic.sort_order.asc())
    )
    topics = res_topics.scalars().all()

    if not topics:
        return {"topics": []}

    # 2. Fetch progress for these topics
    topic_ids = [t.id for t in topics]
    res_prog = await db.execute(
        select(StudentTopicProgress).filter(
            StudentTopicProgress.student_id == current_user.id,
            StudentTopicProgress.topic_id.in_(topic_ids),
        )
    )
    progresses = res_prog.scalars().all()
    progress_records = {p.topic_id: p for p in progresses}

    # 3. Prepare response
    result = []
    min_sort_order = min(getattr(t, "sort_order", 999) for t in topics) if topics else 1
    for t in topics:
        prog = progress_records.get(t.id)
        sort_order = getattr(t, "sort_order", 0)

        if prog:
            status = prog.status
        elif sort_order == min_sort_order:
            status = "in_progress"
        else:
            status = "locked"

        result.append(
            {
                "id": str(t.id),
                "name": t.name,
                "description": t.description,
                "status": status,
                "progress_pct": prog.progress_pct if prog else 0,
                "unlocked_at": prog.unlocked_at.isoformat()
                if prog and prog.unlocked_at
                else None,
                "completed_at": prog.completed_at.isoformat()
                if prog and prog.completed_at
                else None,
                "sort_order": sort_order,
            }
        )

    return {"topics": result}


class CompleteTopicRequest(BaseModel):
    topic_id: str


@router.post("/progress/complete-topic")
async def complete_topic(
    data: CompleteTopicRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Mark a topic as completed and unlock the next one"""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        topic_uuid = uuid.UUID(data.topic_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid topic ID")

    # Use helper for core logic
    next_topic_id = await complete_topic_progression(db, current_user.id, topic_uuid)

    # Check if topic existed (helper returns None if topic not found)
    res_topic = await db.execute(select(Topic).filter(Topic.id == topic_uuid))
    if not res_topic.scalars().first():
        raise HTTPException(status_code=404, detail="Topic not found")

    await db.commit()
    return {
        "status": "success",
        "completed_topic": str(topic_uuid),
        "next_topic_unlocked": str(next_topic_id) if next_topic_id else None,
    }
