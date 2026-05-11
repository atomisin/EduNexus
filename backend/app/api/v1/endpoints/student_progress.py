from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, date
from types import SimpleNamespace
import uuid
import base64
import hashlib
import hmac
import json
import logging
import re
import time

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.core.config import settings
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
from app.models.placement import PlacementQuestionCache
from app.services.llm_service import llm_service
from app.services.revision_context import (
    get_revision_context,
    is_revision_topic,
)

router = APIRouter()
logger = logging.getLogger(__name__)

PLACEHOLDER_TOPIC_NAMES = {"CLASS", "SUBJECT", "TERM", "TOPIC", "TOPICS"}
PLACEMENT_QUESTIONS_PER_LESSON = 5


def is_real_learning_topic(topic: Topic) -> bool:
    return (topic.name or "").strip().upper() not in PLACEHOLDER_TOPIC_NAMES


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
            Topic.name.notin_(PLACEHOLDER_TOPIC_NAMES),
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


# Completion Tracking


class TopicProgressUpdate(BaseModel):
    topic_id: str
    progress_pct: int  # 0-100
    completed: bool = False


class PlacementStartRequest(BaseModel):
    subject_id: str
    target_topic_id: str


class PlacementSubmitRequest(BaseModel):
    subject_id: str
    target_topic_id: str
    answers: List[Dict[str, Any]]


class PlacementAcceptRequest(BaseModel):
    subject_id: str
    target_topic_id: str
    placement_token: str


def get_placement_signing_key() -> bytes:
    if settings.ENVIRONMENT == "production" and not settings.SECRET_KEY:
        raise HTTPException(status_code=500, detail="Placement signing is not configured")
    return (settings.SECRET_KEY or "edunexus-dev-placement-secret").encode("utf-8")


def sign_placement_payload(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    body = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    signature = hmac.new(get_placement_signing_key(), body.encode("utf-8"), hashlib.sha256).digest()
    sig = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"{body}.{sig}"


def verify_placement_token(token: str) -> Dict[str, Any]:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid placement token")

    expected = hmac.new(get_placement_signing_key(), body.encode("utf-8"), hashlib.sha256).digest()
    try:
        actual = base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid placement token")
    if not hmac.compare_digest(expected, actual):
        raise HTTPException(status_code=400, detail="Invalid placement token")

    try:
        raw = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid placement token")

    if int(payload.get("exp") or 0) < int(time.time()):
        raise HTTPException(status_code=400, detail="Placement token has expired")

    return payload


def make_placement_token(
    student_id: uuid.UUID,
    subject_id: uuid.UUID,
    target_topic: Topic,
    recommended_topic_id: str,
    prerequisite_topics: List[Topic],
    score: float,
) -> str:
    return sign_placement_payload({
        "student_id": str(student_id),
        "subject_id": str(subject_id),
        "target_topic_id": str(target_topic.id),
        "recommended_topic_id": recommended_topic_id,
        "prerequisite_topic_ids": [str(topic.id) for topic in prerequisite_topics],
        "score": score,
        "exp": int(time.time()) + 15 * 60,
    })


def make_placement_token_from_ids(
    student_id: uuid.UUID,
    subject_id: uuid.UUID,
    target_topic_id: str,
    recommended_topic_id: str,
    prerequisite_topic_ids: List[str],
    score: float,
) -> str:
    return sign_placement_payload({
        "student_id": str(student_id),
        "subject_id": str(subject_id),
        "target_topic_id": target_topic_id,
        "recommended_topic_id": recommended_topic_id,
        "prerequisite_topic_ids": prerequisite_topic_ids,
        "score": score,
        "exp": int(time.time()) + 15 * 60,
    })


def placement_correct_option(topic: Topic, question_index: int = 0) -> str:
    return placement_correct_option_for_id(str(topic.id), question_index)


def placement_correct_option_for_id(topic_id: str, question_index: int = 0) -> str:
    options = ["A", "B", "C", "D"]
    digest = hashlib.sha256(f"{topic_id}:{question_index}".encode("utf-8")).digest()[0]
    return options[digest % len(options)]


def normalize_placement_text(*parts: Optional[str]) -> str:
    return " ".join(part or "" for part in parts).lower()


def placement_education_scope(subject: Optional[Subject]) -> str:
    if not subject:
        return "general"
    grade_levels = [str(level).strip() for level in (subject.grade_levels or []) if level]
    parts = [
        subject.education_level or "",
        subject.curriculum_type or "",
        ",".join(grade_levels),
    ]
    return "|".join(part for part in parts if part) or "general"


def placement_curriculum_hash(topic: Topic, subject: Optional[Subject]) -> str:
    payload = {
        "subject": subject.name if subject else "",
        "education_level": placement_education_scope(subject),
        "topic": topic.name or "",
        "description": topic.description or "",
        "term": topic.term or "",
        "outcomes": topic.learning_outcomes or [],
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse_json_object(raw: str) -> Dict[str, Any]:
    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r"\{.*\}", raw or "", flags=re.DOTALL)
        if not match:
            raise ValueError("No JSON object found")
        return json.loads(match.group(0))


def normalize_question_spec(spec: Dict[str, Any]) -> Dict[str, Any]:
    distractors = spec.get("distractors") or []
    if isinstance(distractors, dict):
        distractors = list(distractors.values())
    return {
        "text": str(spec.get("text") or spec.get("question") or "").strip(),
        "correct": str(spec.get("correct") or spec.get("answer") or "").strip(),
        "distractors": [str(item).strip() for item in distractors if str(item).strip()][:3],
        "explanation": str(spec.get("explanation") or "").strip(),
        "skill": str(spec.get("skill") or spec.get("focus") or "").strip(),
        "difficulty": str(spec.get("difficulty") or "").strip().lower(),
    }


def extract_question_specs(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        raw_items = payload
    elif isinstance(payload, dict):
        raw_items = payload.get("items") or payload.get("questions") or [payload]
    else:
        raw_items = []
    return [
        normalize_question_spec(item)
        for item in raw_items
        if isinstance(item, dict)
    ]


def validate_placement_question_spec(spec: Dict[str, Any], topic: Topic, subject: Optional[Subject]) -> None:
    text = normalize_placement_text(spec.get("text"), spec.get("correct"), spec.get("explanation"))
    topic_text = normalize_placement_text(topic.name, topic.description, " ".join(topic.learning_outcomes or []))
    subject_text = normalize_placement_text(subject.name if subject else "", subject.education_level if subject else "")

    if len(spec.get("text", "")) < 20 or len(spec.get("correct", "")) < 1:
        raise ValueError("Placement question is too thin")
    if len(spec.get("distractors") or []) != 3:
        raise ValueError("Placement question must have exactly three distractors")
    if len({spec["correct"], *spec["distractors"]}) != 4:
        raise ValueError("Placement options must be distinct")

    banned_phrases = [
        "best matches the lesson",
        "lesson title",
        "metadata",
        "repeating the lesson",
        "real understanding of",
        "which response shows",
        "number of tens in",
    ]
    if any(phrase in text for phrase in banned_phrases):
        raise ValueError("Placement question is metadata-recognition, not competence-based")

    algebra_markers = ["2x", "x +", "x+", "x =", "solve for x", "linear equation", "quadratic"]
    algebra_topic_markers = ["equation", "algebra", "linear", "quadratic", "factor", "simultaneous"]
    if any(marker in text for marker in algebra_markers) and not any(marker in topic_text for marker in algebra_topic_markers):
        raise ValueError("Algebra question generated for a non-algebra prerequisite")

    if "math" in subject_text:
        math_signals = [
            r"\d",
            r"\\\(",
            r"\+",
            r"-",
            r"x",
            r"\\times",
            r"=",
            r"count",
            r"calculate",
            r"solve",
            r"what comes",
            r"arrange",
            r"compare",
        ]
        if not any(re.search(signal, text) for signal in math_signals):
            raise ValueError("Mathematics placement question must involve calculation or numeric reasoning")

    applied_subjects = {
        "biology": ["cell", "plant", "animal", "organism", "body", "function", "process", "classify", "identify", "effect"],
        "chem": ["substance", "element", "compound", "reaction", "atom", "molecule", "acid", "base", "formula", "property"],
        "physics": ["force", "motion", "energy", "current", "voltage", "mass", "speed", "calculate", "effect"],
        "account": ["transaction", "ledger", "asset", "liability", "capital", "debit", "credit", "profit", "balance"],
    }
    for subject_key, signals in applied_subjects.items():
        if subject_key in subject_text and not any(signal in text for signal in signals):
            raise ValueError(f"{subject_key} placement question is not sufficiently subject-applied")


def validate_placement_question_set(specs: List[Dict[str, Any]], topic: Topic, subject: Optional[Subject]) -> List[Dict[str, Any]]:
    if len(specs) < PLACEMENT_QUESTIONS_PER_LESSON:
        raise ValueError(f"Placement requires at least {PLACEMENT_QUESTIONS_PER_LESSON} questions per lesson")
    selected = specs[:PLACEMENT_QUESTIONS_PER_LESSON]
    seen_texts = set()
    skill_tags = set()
    for spec in selected:
        validate_placement_question_spec(spec, topic, subject)
        normalized_text = re.sub(r"\s+", " ", spec["text"].strip().lower())
        if normalized_text in seen_texts:
            raise ValueError("Placement question set contains duplicate questions")
        seen_texts.add(normalized_text)
        if spec.get("skill"):
            skill_tags.add(spec["skill"].strip().lower())
    if len(skill_tags) < 3:
        raise ValueError("Placement question set does not cover enough distinct lesson skills")
    return selected


def is_math_subject(subject: Optional[Subject]) -> bool:
    subject_text = normalize_placement_text(
        subject.name if subject else "",
        subject.education_level if subject else "",
        subject.curriculum_type if subject else "",
    )
    return "math" in subject_text


def extract_lesson_numbers(text: str) -> List[int]:
    return [
        int(match)
        for match in re.findall(r"\b\d{1,5}\b", text or "")
        if 0 <= int(match) <= 100000
    ]


def lesson_number_bounds(topic: Topic) -> tuple[int, int]:
    lesson_text = f"{topic.name or ''} {topic.description or ''}"
    range_match = re.search(r"\b(\d{1,5})\s*(?:-|–|—|to)\s*(\d{1,5})\b", lesson_text, flags=re.IGNORECASE)
    if range_match:
        first, second = int(range_match.group(1)), int(range_match.group(2))
        return min(first, second), max(first, second)

    numbers = extract_lesson_numbers(lesson_text)
    if not numbers:
        return 1, 100
    lower = min(numbers)
    upper = max(numbers)
    if lower == upper:
        lower = max(1, lower - 20)
        upper = lower + 40
    return lower, upper


def option_spec(
    skill: str,
    difficulty: str,
    text: str,
    correct: Any,
    distractors: List[Any],
    explanation: str,
) -> Dict[str, Any]:
    correct_text = str(correct)
    clean_distractors: List[str] = []
    for item in distractors:
        value = str(item)
        if value != correct_text and value not in clean_distractors:
            clean_distractors.append(value)
    offset = 1
    while len(clean_distractors) < 3:
        candidate = str(int(correct_text) + offset) if correct_text.lstrip("-").isdigit() else f"{correct_text} ({offset})"
        if candidate != correct_text and candidate not in clean_distractors:
            clean_distractors.append(candidate)
        offset += 1
    return {
        "skill": skill,
        "difficulty": difficulty,
        "text": text,
        "correct": correct_text,
        "distractors": clean_distractors[:3],
        "explanation": explanation,
    }


def build_local_math_placement_specs(topic: Topic, subject: Optional[Subject]) -> Optional[List[Dict[str, Any]]]:
    """Computed fallback for clear primary/JSS arithmetic topics when AI generation is unavailable."""
    if not is_math_subject(subject):
        return None

    topic_text = normalize_placement_text(topic.name, topic.description, " ".join(topic.learning_outcomes or []))
    lower, upper = lesson_number_bounds(topic)
    span = max(1, upper - lower)
    base_offset = max(1, min(max(1, span // 4), max(1, span - 5)))
    base = min(lower + base_offset, max(lower, upper - 5))

    if any(word in topic_text for word in ["addition", "add ", "sum", "plus"]):
        a = max(lower, min(base, max(lower, upper - 3)))
        available_after_a = max(1, upper - a)
        b = max(1, min(15, available_after_a))
        c = max(1, min(25, available_after_a))
        word_addend = max(1, min(8, available_after_a))
        compare_a = max(lower, min(a + 5, max(lower, upper - 2)))
        compare_b = max(1, min(10, upper - compare_a))
        total_a = lower
        total_b = max(1, min(10, max(1, upper - total_a - 1)))
        total_c = max(1, min(10, max(1, upper - total_a - total_b)))
        return [
            option_spec("add two whole numbers", "basic", f"Calculate \\({a} + {b}\\).", a + b, [a + b - 1, a + b + 1, a + b + 10], "Add the two numbers carefully."),
            option_spec("find a missing addend", "direct", f"What number makes \\({a} + \\square = {a + c}\\)?", c, [c - 1, c + 1, a], "Subtract the known addend from the total."),
            option_spec("apply addition in a word problem", "varied", f"A learner counted {a} books and then added {word_addend} more books. How many books are there altogether?", a + word_addend, [a + word_addend - 1, a + word_addend + 1, max(0, a - word_addend)], "Altogether means add the two amounts."),
            option_spec("spot an addition error", "reasoning", f"Which statement is correct for adding {compare_a} and {compare_b}?", f"\\({compare_a} + {compare_b} = {compare_a + compare_b}\\)", [f"\\({compare_a} + {compare_b} = {compare_a + compare_b - 1}\\)", f"\\({compare_a} + {compare_b} = {compare_a + compare_b + 1}\\)", f"\\({compare_a} - {compare_b} = {compare_a + compare_b}\\)"], "The correct statement uses addition and the accurate total."),
            option_spec("combine several addends", "transfer", f"Find the total: \\({total_a} + {total_b} + {total_c}\\).", total_a + total_b + total_c, [total_a + total_b + total_c - 1, total_a + total_b, total_a + total_b + total_c + 1], "Add each addend once to get the total."),
        ]

    if any(word in topic_text for word in ["place value", "place-value"]):
        number = max(101, min(upper, max(base + 37, 137)))
        digits = [int(ch) for ch in str(number)]
        tens_digit = digits[-2] if len(digits) >= 2 else 0
        hundreds_digit = digits[-3] if len(digits) >= 3 else 0
        number_text = str(number)
        expanded = " + ".join(
            str(int(ch) * (10 ** (len(number_text) - idx - 1)))
            for idx, ch in enumerate(number_text)
            if ch != "0"
        )
        return [
            option_spec("identify a digit", "basic", f"In the number {number}, what is the tens digit?", tens_digit, [tens_digit + 1, max(0, tens_digit - 1), digits[-1]], "The tens digit is the second digit from the right."),
            option_spec("state place value", "direct", f"What is the value of the hundreds digit in {number}?", hundreds_digit * 100, [hundreds_digit, hundreds_digit * 10, hundreds_digit * 1000], "A hundreds digit is worth that digit multiplied by 100."),
            option_spec("write expanded form", "varied", f"Which is the expanded form of {number}?", expanded, [str(number), f"{hundreds_digit} + {tens_digit * 10} + {digits[-1]}", f"{hundreds_digit * 10} + {tens_digit * 100} + {digits[-1]}"], "Expanded form shows the value of each digit."),
            option_spec("compare place values", "reasoning", f"Which digit in {number} has the greatest place value?", str(digits[0]), [str(digits[-1]), str(tens_digit), "0"], "The leftmost non-zero digit has the greatest place value in this number."),
            option_spec("transfer place value", "transfer", f"If {number} is increased by 10, which digit changes?", "the tens digit", ["the hundreds digit only", "the ones digit only", "no digit changes"], "Adding 10 changes the tens place unless regrouping affects another place."),
        ]

    if any(word in topic_text for word in ["ordering", "greater than", "less than", "<", "compare"]):
        a = max(lower, base)
        values = [a + 3, a + 1, a + 5, a + 2]
        ordered = ", ".join(str(value) for value in sorted(values))
        return [
            option_spec("compare two numbers", "basic", f"Which symbol makes this true: \\({a + 4} \\square {a + 9}\\)?", "<", [">", "=", "+"], "The first number is smaller than the second number."),
            option_spec("find the greatest number", "direct", f"Which number is greatest: {a + 3}, {a + 8}, {a + 1}, {a + 6}?", a + 8, [a + 3, a + 1, a + 6], "The greatest number has the highest value."),
            option_spec("order numbers ascending", "varied", f"Arrange these numbers from smallest to largest: {', '.join(str(value) for value in values)}.", ordered, [", ".join(str(value) for value in values), ", ".join(str(value) for value in sorted(values, reverse=True)), f"{a + 1}, {a + 3}, {a + 2}, {a + 5}"], "Ascending order moves from the smallest to the largest."),
            option_spec("spot comparison error", "reasoning", f"Which comparison is correct?", f"\\({a + 10} > {a + 2}\\)", [f"\\({a + 10} < {a + 2}\\)", f"\\({a + 10} = {a + 2}\\)", f"\\({a + 2} > {a + 10}\\)"], "The larger number should face the open side of the greater-than sign."),
            option_spec("transfer ordering", "transfer", f"A teacher writes {a + 7}, {a + 12}, and {a + 9}. Which number comes between the other two?", a + 9, [a + 7, a + 12, a + 19], "The middle value is greater than the smallest and less than the largest."),
        ]

    if "fraction" in topic_text:
        return [
            option_spec("recognize a simple fraction", "basic", "A shape is divided into 4 equal parts and 1 part is shaded. What fraction is shaded?", "\\(\\frac{1}{4}\\)", ["\\(\\frac{4}{1}\\)", "\\(\\frac{1}{3}\\)", "\\(\\frac{3}{4}\\)"], "The shaded part is one out of four equal parts."),
            option_spec("find a fraction of a set", "direct", "What is \\(\\frac{1}{2}\\) of 12 oranges?", 6, [4, 8, 10], "Half of 12 is 6."),
            option_spec("compare fractions", "varied", "Which fraction is greater?", "\\(\\frac{3}{4}\\)", ["\\(\\frac{1}{4}\\)", "\\(\\frac{1}{2}\\)", "\\(\\frac{1}{8}\\)"], "Three quarters is greater than one half, one quarter, and one eighth."),
            option_spec("spot a fraction error", "reasoning", "Which statement is correct?", "\\(\\frac{2}{4}\\) is equal to \\(\\frac{1}{2}\\)", ["\\(\\frac{2}{4}\\) is equal to \\(\\frac{1}{4}\\)", "\\(\\frac{1}{2}\\) is less than \\(\\frac{1}{4}\\)", "\\(\\frac{3}{4}\\) is equal to \\(\\frac{1}{4}\\)"], "Two out of four equal parts is the same as one out of two equal parts."),
            option_spec("apply fractions", "transfer", "A learner ate \\(\\frac{1}{4}\\) of 20 groundnuts. How many groundnuts were eaten?", 5, [4, 10, 15], "One quarter of 20 is 20 divided by 4."),
        ]

    if any(word in topic_text for word in ["count", "whole number", "numbers"]):
        step = 10 if upper - lower >= 50 else 2
        start = max(lower, min(base, upper - (step * 4)))
        sequence = [start + step * i for i in range(5)]
        return [
            option_spec("count forward", "basic", f"What number comes after {start}?", start + 1, [start - 1, start + 2, start + 10], "Counting forward by ones gives the next number."),
            option_spec("complete a counting pattern", "direct", f"Complete the pattern: {sequence[0]}, {sequence[1]}, \\(\\square\\), {sequence[3]}, {sequence[4]}.", sequence[2], [sequence[2] - step, sequence[2] + step, sequence[2] + 1], f"The pattern increases by {step} each time."),
            option_spec("count backward", "varied", f"What number comes just before {start + 12}?", start + 11, [start + 10, start + 12, start + 13], "Counting backward by one gives the previous number."),
            option_spec("reason with a number line", "reasoning", f"On a number line, which number is between {start + 3} and {start + 7}?", start + 5, [start + 2, start + 8, start + 10], "A number between two values is greater than the first and less than the second."),
            option_spec("transfer counting skill", "transfer", f"If you count by {step}s from {start}, what is the fifth number you say?", sequence[4], [sequence[3], sequence[4] + step, sequence[2]], "The fifth number is found after four equal jumps from the starting number."),
        ]

    return None


def build_placement_generation_prompt(topic: Topic, subject: Optional[Subject]) -> str:
    grade_levels = ", ".join(subject.grade_levels or []) if subject else ""
    outcomes = "; ".join(topic.learning_outcomes or [])
    return f"""
Create {PLACEMENT_QUESTIONS_PER_LESSON} multiple-choice placement questions for EduNexus.

Purpose:
- Test whether a learner has usable prerequisite understanding of the exact curriculum lesson below.
- The questions will decide if the learner may unlock a later lesson, so they must be fair, answerable, and directly tied to this prerequisite.

Curriculum context:
- Subject: {subject.name if subject else "Unknown"}
- Education level: {subject.education_level if subject else "Unknown"}
- Grade/class scope: {grade_levels or "Not specified"}
- Curriculum/track: {subject.curriculum_type if subject else "Not specified"}
- Term: {topic.term or "Not specified"}
- Prerequisite lesson: {topic.name}
- Lesson description: {topic.description or "Not provided"}
- Learning outcomes: {outcomes or "Not provided"}

Rules:
- Do not ask a generic algebra, science, or English question unless this exact lesson requires it.
- Do not ask the learner to identify the lesson title or choose a statement that merely describes the lesson.
- For Mathematics, the learner must calculate, count, compare, arrange, solve, or complete a numeric pattern from the lesson skill.
- For place-value or counting lessons, avoid ambiguous wording such as "number of tens in 456"; ask for "tens digit", "place value of the tens digit", "complete groups of ten", or a concrete counting sequence instead.
- For Biology, test application of a living system, structure, process, classification, function, or cause-effect idea from the lesson.
- For Chemistry, test substances, formulae, reactions, properties, particles, or laboratory reasoning from the lesson.
- For Physics, use a measurable scenario, relationship, diagram-style reasoning, or calculation from the lesson.
- For Accounting, Commerce, Economics, and professional subjects, use a realistic transaction, case, data point, or professional decision from the lesson.
- For language/humanities subjects, use a short passage, example, interpretation, or applied classification task.
- Match the depth to the class/level. Primary tasks should be simple and concrete; JSS/SS tasks should require curriculum-level reasoning; professional tasks should use workplace-level judgement.
- Order the questions by increasing complexity:
  1. Basic prerequisite recall or recognition.
  2. Direct application.
  3. Slightly varied application.
  4. Error-spotting, comparison, or reasoning.
  5. Transfer question that combines the lesson's important points.
- Cover the lesson's important points across the set. Do not produce five versions of the same skill.
- If math or technical notation is needed, use LaTeX delimiters like \\( ... \\).
- Ensure every wrong option is plausible but clearly wrong for the exact lesson.
- The {PLACEMENT_QUESTIONS_PER_LESSON} questions must cover different angles of the same prerequisite lesson, not repeat one idea with new numbers only.
- Return JSON only with this shape:
  {{"items":[{{"skill":"specific lesson skill being tested","difficulty":"basic|direct|varied|reasoning|transfer","text":"question text","correct":"correct option text","distractors":["wrong option","wrong option","wrong option"],"explanation":"one-sentence explanation"}}]}}
""".strip()


async def generate_cached_placement_specs(
    db: AsyncSession,
    topic: Topic,
    subject: Optional[Subject],
    user_id: Optional[uuid.UUID],
) -> List[Dict[str, Any]]:
    if not subject:
        raise HTTPException(status_code=400, detail="Subject context is required for placement questions")

    subject_ctx = SimpleNamespace(
        id=subject.id,
        name=subject.name,
        education_level=subject.education_level,
        curriculum_type=subject.curriculum_type,
        grade_levels=list(subject.grade_levels or []),
    )
    topic_ctx = SimpleNamespace(
        id=topic.id,
        name=topic.name,
        description=topic.description,
        term=topic.term,
        learning_outcomes=list(topic.learning_outcomes or []),
    )
    subject_id = subject_ctx.id
    topic_id = topic_ctx.id

    education_level = placement_education_scope(subject_ctx)
    curriculum_hash = placement_curriculum_hash(topic_ctx, subject_ctx)
    cached_res = await db.execute(
        select(PlacementQuestionCache).filter(
            PlacementQuestionCache.subject_id == subject_id,
            PlacementQuestionCache.topic_id == topic_id,
            PlacementQuestionCache.education_level == education_level,
            PlacementQuestionCache.curriculum_hash == curriculum_hash,
            PlacementQuestionCache.status == "active",
        )
    )
    cached = cached_res.scalars().first()
    if cached:
        specs = extract_question_specs(cached.question_spec)
        try:
            return validate_placement_question_set(specs, topic_ctx, subject_ctx)
        except ValueError as exc:
            cached.status = "invalid"
            cached.review_notes = str(exc)
            await db.commit()

    prompt = build_placement_generation_prompt(topic_ctx, subject_ctx)
    last_error: Optional[Exception] = None
    specs: Optional[List[Dict[str, Any]]] = None
    for attempt in range(3):
        try:
            retry_instruction = (
                f"\n\nPrevious attempt failed validation: {last_error}. Regenerate a stronger, applied, class-appropriate question."
                if last_error
                else ""
            )
            raw = await llm_service.generate(
                prompt=f"{prompt}{retry_instruction}",
                temperature=0.2,
                max_tokens=1800,
                format="json_object",
                user_id=user_id,
            )
            candidate = extract_question_specs(parse_json_object(raw))
            specs = validate_placement_question_set(candidate, topic_ctx, subject_ctx)
            break
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Placement question generation attempt %s failed for topic %s: %s",
                attempt + 1,
                topic_id,
                exc,
            )

    source = "llm"
    if specs is None:
        local_specs = build_local_math_placement_specs(topic_ctx, subject_ctx)
        if local_specs:
            try:
                specs = validate_placement_question_set(local_specs, topic_ctx, subject_ctx)
                source = "local_math_fallback"
            except ValueError as exc:
                last_error = exc

    if specs is None:
        raise HTTPException(
            status_code=503,
            detail="EduNexus could not prepare a reliable placement question for this lesson yet. Please try again shortly.",
        )

    cache = PlacementQuestionCache(
        subject_id=subject_id,
        topic_id=topic_id,
        education_level=education_level,
        curriculum_hash=curriculum_hash,
        question_spec={"items": specs},
        source=source,
        review_notes=str(last_error) if source != "llm" and last_error else None,
    )
    db.add(cache)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        cached_res = await db.execute(
            select(PlacementQuestionCache).filter(
                PlacementQuestionCache.subject_id == subject_id,
                PlacementQuestionCache.topic_id == topic_id,
                PlacementQuestionCache.education_level == education_level,
                PlacementQuestionCache.curriculum_hash == curriculum_hash,
                PlacementQuestionCache.status == "active",
            )
        )
        cached = cached_res.scalars().first()
        if cached:
            return validate_placement_question_set(extract_question_specs(cached.question_spec), topic_ctx, subject_ctx)
    except Exception:
        await db.rollback()
        logger.exception("Failed to cache placement question for topic %s", topic_id)
    return specs


async def build_placement_questions(
    db: AsyncSession,
    topic: Topic,
    idx: int,
    subject: Optional[Subject] = None,
    include_answer: bool = False,
    unlock_topic: Optional[Topic] = None,
    user_id: Optional[uuid.UUID] = None,
) -> List[Dict[str, Any]]:
    """Build deterministic placement questions tied to one prerequisite topic."""
    topic_id = topic.id
    topic_id_str = str(topic_id)
    topic_name = topic.name
    unlock_topic_id = unlock_topic.id if unlock_topic else topic_id
    unlock_topic_id_str = str(unlock_topic_id)
    unlock_topic_name = unlock_topic.name if unlock_topic else topic_name
    question_source = "revision" if unlock_topic and unlock_topic_id != topic_id else "prerequisite"

    specs = await generate_cached_placement_specs(db, topic, subject, user_id)
    option_keys = ["A", "B", "C", "D"]
    questions = []
    for question_index, spec in enumerate(specs, start=1):
        correct_option = placement_correct_option_for_id(topic_id_str, question_index)
        options: Dict[str, str] = {}
        distractor_index = 0
        for key in option_keys:
            if key == correct_option:
                options[key] = spec["correct"]
            else:
                options[key] = spec["distractors"][distractor_index]
                distractor_index += 1

        question = {
            "id": f"{topic_id_str}:{idx}:{question_index}",
            "topic_id": topic_id_str,
            "topic_name": topic_name,
            "question_index": question_index,
            "unlock_topic_id": unlock_topic_id_str,
            "unlock_topic_name": unlock_topic_name,
            "source": question_source,
            "text": spec["text"],
            "options": options,
            "explanation": spec["explanation"],
        }
        if include_answer:
            question["correct_option"] = correct_option
        questions.append(question)
    return questions


def topic_snapshot(topic: Topic) -> Dict[str, Any]:
    return {
        "id": topic.id,
        "name": topic.name,
        "sort_order": topic.sort_order,
    }


def summarize_placement(
    recommendation_topics: List[Dict[str, Any]],
    answers: List[Dict[str, Any]],
    target_topic: Dict[str, Any],
) -> Dict[str, Any]:
    total = len(answers)
    correct = sum(1 for answer in answers if answer.get("is_correct"))
    score = round((correct / total) * 100, 1) if total else 0

    missed_by_topic: Dict[str, Dict[str, Any]] = {}
    for answer in answers:
        if answer.get("is_correct"):
            continue
        topic_id = str(answer.get("unlock_topic_id") or answer.get("topic_id") or "")
        if not topic_id:
            continue
        if topic_id not in missed_by_topic:
            missed_by_topic[topic_id] = {
                "topic_id": topic_id,
                "topic_name": answer.get("unlock_topic_name") or answer.get("topic_name") or "Earlier lesson",
                "missed": 0,
                "missed_sources": [],
            }
        missed_by_topic[topic_id]["missed"] += 1
        missed_by_topic[topic_id]["missed_sources"].append(answer.get("topic_name") or "Earlier concept")

    weak_topics = sorted(
        missed_by_topic.values(),
        key=lambda item: item["missed"],
        reverse=True,
    )

    if not recommendation_topics:
        recommended_topic = target_topic
        reason = "There are no earlier locked lessons to check, so this lesson can be opened."
    elif score <= 20:
        recommended_topic = recommendation_topics[0]
        reason = "The placement score is very low, so the safest path is to restart from the beginning."
    elif score >= 80:
        if weak_topics:
            weak_topic_id = uuid.UUID(weak_topics[0]["topic_id"])
            recommended_topic = next((topic for topic in recommendation_topics if topic["id"] == weak_topic_id), target_topic)
            reason = f"You scored well overall, but the missed questions point mostly to '{recommended_topic['name']}'. Start there briefly, then continue forward."
        else:
            recommended_topic = target_topic
            reason = "You showed strong understanding of the earlier lessons, so the requested lesson can be unlocked."
    else:
        if weak_topics:
            ordered_weak = [
                topic for topic in recommendation_topics
                if str(topic["id"]) in {item["topic_id"] for item in weak_topics}
            ]
            recommended_topic = ordered_weak[0] if ordered_weak else recommendation_topics[0]
        else:
            recommended_topic = recommendation_topics[0]
        reason = "The score shows partial understanding, so the system is placing you at the earliest lesson that needs strengthening."

    return {
        "score": score,
        "correct": correct,
        "total": total,
        "passed_for_target": score >= 80 and not weak_topics,
        "weak_topics": weak_topics,
        "recommended_topic": {
            "id": str(recommended_topic["id"]),
            "name": recommended_topic["name"],
            "sort_order": recommended_topic["sort_order"],
        },
        "target_topic": {
            "id": str(target_topic["id"]),
            "name": target_topic["name"],
            "sort_order": target_topic["sort_order"],
        },
        "reason": reason,
    }


async def get_ordered_subject_topics(
    db: AsyncSession,
    subject_id: str,
    target_topic_id: str,
) -> tuple[uuid.UUID, uuid.UUID, List[Topic], Topic, List[Topic]]:
    try:
        subject_uuid = uuid.UUID(subject_id)
        target_uuid = uuid.UUID(target_topic_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subject or topic ID")

    res_topics = await db.execute(
        select(Topic)
        .filter(Topic.subject_id == subject_uuid)
        .order_by(Topic.sort_order.asc(), Topic.name.asc())
    )
    topics = [topic for topic in res_topics.scalars().all() if is_real_learning_topic(topic)]
    target_topic = next((topic for topic in topics if topic.id == target_uuid), None)

    if not target_topic:
        raise HTTPException(status_code=404, detail="Target lesson was not found")

    target_index = topics.index(target_topic)
    prerequisite_topics = topics[:target_index]
    return subject_uuid, target_uuid, topics, target_topic, prerequisite_topics


async def build_placement_scope(
    db: AsyncSession,
    subject_id: uuid.UUID,
    target_topic: Topic,
    prerequisite_topics: List[Topic],
) -> Dict[str, Any]:
    """Expand revision lessons into the previous-class topics they are meant to revise."""
    res_subject = await db.execute(select(Subject).filter(Subject.id == subject_id))
    subject = res_subject.scalars().first()
    assessment_entries: List[Dict[str, Topic]] = []
    revision_contexts: Dict[str, Dict[str, Any]] = {}

    for prerequisite_topic in prerequisite_topics:
        revision_context = (
            await get_revision_context(db, subject, prerequisite_topic)
            if subject and is_revision_topic(prerequisite_topic)
            else None
        )
        if revision_context:
            revision_contexts[str(prerequisite_topic.id)] = revision_context
            source_topic_ids = {item["id"] for item in revision_context.get("assessment_topics", [])}
            source_topics = []
            if source_topic_ids:
                res_source = await db.execute(
                    select(Topic)
                    .filter(Topic.id.in_([uuid.UUID(item) for item in source_topic_ids]))
                    .order_by(Topic.sort_order.asc(), Topic.name.asc())
                )
                source_topics = res_source.scalars().all()
            for source_topic in source_topics:
                assessment_entries.append({"assessment_topic": source_topic, "unlock_topic": prerequisite_topic})
        else:
            assessment_entries.append({"assessment_topic": prerequisite_topic, "unlock_topic": prerequisite_topic})

    target_revision_context = (
        await get_revision_context(db, subject, target_topic)
        if subject and is_revision_topic(target_topic)
        else None
    )
    if target_revision_context and not assessment_entries:
        revision_contexts[str(target_topic.id)] = target_revision_context
        source_topic_ids = {item["id"] for item in target_revision_context.get("assessment_topics", [])}
        if source_topic_ids:
            res_source = await db.execute(
                select(Topic)
                .filter(Topic.id.in_([uuid.UUID(item) for item in source_topic_ids]))
                .order_by(Topic.sort_order.asc(), Topic.name.asc())
            )
            for source_topic in res_source.scalars().all():
                assessment_entries.append({"assessment_topic": source_topic, "unlock_topic": target_topic})

    recommendation_topics = prerequisite_topics or ([target_topic] if target_revision_context else [])
    return {
        "subject": subject,
        "assessment_entries": assessment_entries,
        "recommendation_topics": recommendation_topics,
        "revision_contexts": revision_contexts,
    }


async def ensure_student_subject_access(
    db: AsyncSession,
    student_id: uuid.UUID,
    subject_id: uuid.UUID,
):
    res_profile = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == student_id)
    )
    profile = res_profile.scalars().first()
    enrolled_subjects = profile.enrolled_subjects if profile else []

    if not enrolled_subjects:
        raise HTTPException(
            status_code=403,
            detail="You must be enrolled in this subject before unlocking lessons",
        )

    res_subject = await db.execute(select(Subject).filter(Subject.id == subject_id))
    subject = res_subject.scalars().first()
    enrolled_keys = {str(item).strip().lower() for item in enrolled_subjects if item}
    allowed_keys = {str(subject_id).lower()}
    if subject and subject.name:
        allowed_keys.add(subject.name.strip().lower())

    if enrolled_keys.isdisjoint(allowed_keys):
        raise HTTPException(
            status_code=403,
            detail="You can only unlock lessons for subjects you are enrolled in",
        )


@router.post("/progress/placement/start")
async def start_placement_check(
    data: PlacementStartRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Create a prerequisite placement check before unlocking a later lesson."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can request placement")

    subject_uuid, _, _, target_topic, prerequisite_topics = await get_ordered_subject_topics(
        db,
        data.subject_id,
        data.target_topic_id,
    )
    await ensure_student_subject_access(db, current_user.id, subject_uuid)

    placement_scope = await build_placement_scope(db, subject_uuid, target_topic, prerequisite_topics)
    assessment_entries = placement_scope["assessment_entries"]
    target_topic_payload = {
        "id": str(target_topic.id),
        "name": target_topic.name,
        "sort_order": target_topic.sort_order,
    }
    prerequisite_topic_payload = [
        {
            "id": str(topic.id),
            "name": topic.name,
            "sort_order": topic.sort_order,
        }
        for topic in prerequisite_topics
    ]
    prerequisite_topic_ids = [item["id"] for item in prerequisite_topic_payload]
    questions = []
    for idx, entry in enumerate(assessment_entries):
        questions.extend(await build_placement_questions(
            db,
            entry["assessment_topic"],
            idx + 1,
            subject=placement_scope.get("subject"),
            unlock_topic=entry["unlock_topic"],
            user_id=current_user.id,
        ))

    response = {
        "target_topic": target_topic_payload,
        "prerequisite_topics": prerequisite_topic_payload,
        "revision_contexts": placement_scope["revision_contexts"],
        "questions": questions,
        "questions_per_lesson": PLACEMENT_QUESTIONS_PER_LESSON,
        "message": "Answer this quick placement check so EduNexus can recommend the right lesson to start from.",
    }
    if not assessment_entries:
        response["placement_token"] = make_placement_token_from_ids(
            current_user.id,
            subject_uuid,
            target_topic_payload["id"],
            target_topic_payload["id"],
            prerequisite_topic_ids,
            100.0,
        )
    return response


@router.post("/progress/placement/submit")
async def submit_placement_check(
    data: PlacementSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Score a placement check and recommend the safest starting lesson."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can submit placement")

    subject_uuid, _, _, target_topic, prerequisite_topics = await get_ordered_subject_topics(
        db,
        data.subject_id,
        data.target_topic_id,
    )
    await ensure_student_subject_access(db, current_user.id, subject_uuid)

    placement_scope = await build_placement_scope(db, subject_uuid, target_topic, prerequisite_topics)
    assessment_entries = placement_scope["assessment_entries"]
    recommendation_topics = placement_scope["recommendation_topics"]
    target_topic_snapshot = topic_snapshot(target_topic)
    recommendation_topic_snapshots = [topic_snapshot(topic) for topic in recommendation_topics]
    prerequisite_topic_ids = [str(topic.id) for topic in prerequisite_topics]
    expected_questions = []
    for idx, entry in enumerate(assessment_entries):
        expected_questions.extend(await build_placement_questions(
            db,
            entry["assessment_topic"],
            idx + 1,
            subject=placement_scope.get("subject"),
            unlock_topic=entry["unlock_topic"],
            user_id=current_user.id,
        ))

    valid_question_ids = {str(question["id"]) for question in expected_questions}
    question_by_id = {str(question["id"]): question for question in expected_questions}
    answers_by_question: Dict[str, Dict[str, Any]] = {}
    for answer in data.answers:
        question_id = str(answer.get("question_id") or "")
        if question_id not in valid_question_ids:
            continue
        if question_id in answers_by_question:
            raise HTTPException(status_code=400, detail="Duplicate placement answer")

        selected_option = str(answer.get("selected_option") or "").upper()
        if selected_option not in {"A", "B", "C", "D"}:
            raise HTTPException(status_code=400, detail="Invalid placement answer")

        question = question_by_id.get(question_id)
        topic_id = str(question.get("topic_id") or "") if question else ""
        question_index = int(question.get("question_index") or 0) if question else 0
        correct_option = placement_correct_option_for_id(topic_id, question_index) if topic_id else ""
        answers_by_question[question_id] = {
            **answer,
            "question_id": question_id,
            "topic_id": topic_id,
            "topic_name": question.get("topic_name") if question else answer.get("topic_name"),
            "unlock_topic_id": question.get("unlock_topic_id") if question else topic_id,
            "unlock_topic_name": question.get("unlock_topic_name") if question else answer.get("topic_name"),
            "selected_option": selected_option,
            "is_correct": selected_option == correct_option,
        }

    missing_question_ids = valid_question_ids.difference(answers_by_question.keys())
    if missing_question_ids:
        raise HTTPException(status_code=400, detail="Answer every prerequisite question")

    answers = [answers_by_question[str(question["id"])] for question in expected_questions]
    summary = summarize_placement(recommendation_topic_snapshots, answers, target_topic_snapshot)
    summary["revision_contexts"] = placement_scope["revision_contexts"]
    summary["placement_token"] = make_placement_token_from_ids(
        current_user.id,
        subject_uuid,
        str(target_topic_snapshot["id"]),
        summary["recommended_topic"]["id"],
        prerequisite_topic_ids,
        summary["score"],
    )
    return summary


@router.post("/progress/placement/accept")
async def accept_placement_recommendation(
    data: PlacementAcceptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Unlock the recommended lesson after a learner accepts placement advice."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can accept placement")

    token_payload = verify_placement_token(data.placement_token)
    if token_payload.get("student_id") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Placement token does not belong to this student")
    if token_payload.get("subject_id") != data.subject_id or token_payload.get("target_topic_id") != data.target_topic_id:
        raise HTTPException(status_code=400, detail="Placement token does not match this lesson")

    subject_uuid, _, topics, target_topic, prerequisite_topics = await get_ordered_subject_topics(
        db,
        data.subject_id,
        data.target_topic_id,
    )
    await ensure_student_subject_access(db, current_user.id, subject_uuid)

    try:
        recommended_uuid = uuid.UUID(token_payload.get("recommended_topic_id") or "")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid recommended lesson ID")

    current_prerequisite_ids = [str(topic.id) for topic in prerequisite_topics]
    if token_payload.get("prerequisite_topic_ids") != current_prerequisite_ids:
        raise HTTPException(status_code=400, detail="Placement token is no longer valid for this lesson path")

    allowable_topics = prerequisite_topics + [target_topic]
    recommended_topic = next(
        (topic for topic in allowable_topics if topic.id == recommended_uuid),
        None,
    )
    if not recommended_topic:
        raise HTTPException(
            status_code=400,
            detail="Recommended lesson must be the requested lesson or one of its prerequisites",
        )

    recommended_index = topics.index(recommended_topic)
    topics_to_unlock = topics[: recommended_index + 1]
    topic_ids = [topic.id for topic in topics_to_unlock]

    res_prog = await db.execute(
        select(StudentTopicProgress).filter(
            StudentTopicProgress.student_id == current_user.id,
            StudentTopicProgress.topic_id.in_(topic_ids),
        )
    )
    progress_by_topic = {progress.topic_id: progress for progress in res_prog.scalars().all()}
    now = datetime.now(timezone.utc)

    for topic in topics_to_unlock:
        progress = progress_by_topic.get(topic.id)
        if not progress:
            db.add(
                StudentTopicProgress(
                    student_id=current_user.id,
                    topic_id=topic.id,
                    subject_id=subject_uuid,
                    status="unlocked",
                    progress_pct=0,
                    unlocked_at=now,
                    last_accessed=now if topic.id == recommended_topic.id else None,
                )
            )
        elif progress.status == "locked":
            progress.status = "unlocked"
            progress.unlocked_at = progress.unlocked_at or now
            if topic.id == recommended_topic.id:
                progress.last_accessed = now

    await db.commit()

    return {
        "status": "success",
        "recommended_topic": {
            "id": str(recommended_topic.id),
            "name": recommended_topic.name,
            "sort_order": recommended_topic.sort_order,
        },
        "target_topic": {
            "id": str(target_topic.id),
            "name": target_topic.name,
            "sort_order": target_topic.sort_order,
        },
        "unlocked_topic_ids": [str(topic.id) for topic in topics_to_unlock],
    }


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
    topics = [topic for topic in res_topics.scalars().all() if is_real_learning_topic(topic)]

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
