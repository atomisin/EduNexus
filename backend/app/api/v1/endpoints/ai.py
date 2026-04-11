from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
import uuid
import traceback

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.student import StudentProfile
from app.models.student_progress import StudentSubjectProgress
from app.services.llm_service import llm_service
from app.services.ai_service import tts_service, stt_service
from app.utils.validators import sanitize_user_input
from fastapi import Request, BackgroundTasks
from slowapi.util import get_remote_address
from jose import jwt, JWTError
from app.core.config import settings
from app.services.ai_coordinator import ai_coordinator
import logging

logger = logging.getLogger(__name__)
from app.services.age_content_service import (
    get_student_context,
    get_content_complexity,
    get_age_group,
)
from app.core.limiter import limiter
from app.api.v1.endpoints.student_progress import complete_topic_progression


def handle_api_error(
    endpoint: str, error: Exception, db: AsyncSession = None
) -> HTTPException:
    """Secure error handling - logs full traceback internally, returns generic message to client."""
    error_id = uuid.uuid4().hex[:8]
    logger.error(f"[{endpoint}] Error {error_id}: {error}\n{traceback.format_exc()}")
    if db:
        import asyncio

        try:
            asyncio.create_task(db.rollback())
        except:
            pass
    return HTTPException(
        status_code=500,
        detail=f"An error occurred while {endpoint}. Please try again. (Ref: {error_id})",
    )


router = APIRouter()


def user_key(request: Request):
    """Rate limit key: use user ID from JWT if available, else IP"""
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt.decode(
                token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
            )
            user_id = payload.get("sub")
            if user_id:
                return str(user_id)
        except JWTError:
            pass
    return get_remote_address(request)


async def deduct_brain_power(user_id: uuid.UUID, cost: int, db: AsyncSession) -> bool:
    """Batch 3 prep: Deduct brain power safely using atomic SQL"""
    result = await db.execute(
        text("""
            UPDATE student_profiles 
            SET brain_power = GREATEST(0, COALESCE(brain_power, 100) - :cost)
            WHERE user_id = :uid 
            AND COALESCE(brain_power, 100) >= :cost
        """),
        {"cost": cost, "uid": user_id},
    )
    await db.commit()
    return result.rowcount > 0


async def refund_brain_power(user_id: uuid.UUID, cost: int, db: AsyncSession) -> None:
    await db.execute(
        text("""
            UPDATE student_profiles
            SET brain_power = LEAST(100, COALESCE(brain_power, 0) + :cost)
            WHERE user_id = :uid
        """),
        {"cost": cost, "uid": user_id},
    )
    await db.commit()


def raise_brain_power_depleted():
    from datetime import time as dt_time, timedelta, datetime

    try:
        from zoneinfo import ZoneInfo
        local_tz = ZoneInfo("Africa/Lagos")
    except ImportError:
        import pytz
        local_tz = pytz.timezone("Africa/Lagos")

    now_local = datetime.now(local_tz)
    tomorrow_local = now_local.date() + timedelta(days=1)
    next_midnight = (
        datetime.combine(tomorrow_local, dt_time.min).replace(tzinfo=local_tz).isoformat()
    )
    raise HTTPException(
        status_code=429,
        detail={
            "code": "BRAIN_POWER_DEPLETED",
            "message": "Your Brain Power is fully drained for today \u2014 which means you've been working hard! \u2728 Take a well-earned break, review what you've learned, and come back tomorrow for a full recharge. Your AI tutor will be here waiting.",
            "recharge_at": next_midnight,
        },
    )


class GenerateRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    # C-06: system_prompt removed — server-defined only, not user-controllable


class ChatRequest(BaseModel):
    messages: List[dict]
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    context: Optional[dict] = None
    mode: Optional[str] = "teaching"  # teaching (default) or generalist
    subject_name: Optional[str] = None
    topic_name: Optional[str] = None


class ExplainRequest(BaseModel):
    concept: str
    context: Optional[str] = None
    question: Optional[str] = None


class EvaluateUnderstandingRequest(BaseModel):
    concept: str
    explanation: str


class LessonContentRequest(BaseModel):
    topic: str
    subject: str
    education_level: str
    learning_style: Optional[str] = None


class TTSRequest(BaseModel):
    text: str
    language: Optional[str] = "en"


class MasteryTestRequest(BaseModel):
    topic: str
    subject: str
    chat_history: Optional[List[Dict[str, str]]] = None


class MasteryTestEvaluationRequest(BaseModel):
    topic: str
    subject_id: Optional[uuid.UUID] = None
    topic_id: Optional[uuid.UUID] = None
    results: List[Dict[str, Any]]
    subtopic: Optional[str] = None


class TopicBreakdownRequest(BaseModel):
    topic: str
    subject_id: uuid.UUID


class SaveChatHistoryRequest(BaseModel):
    subject_id: uuid.UUID
    topic_id: Optional[uuid.UUID] = None
    topic_name: str
    subtopic_name: Optional[str] = 'intro'
    messages: List[Dict[str, str]]

class GetChatHistoryRequest(BaseModel):
    subject_id: uuid.UUID
    topic_id: Optional[uuid.UUID] = None
    topic_name: str
    subtopic_name: Optional[str] = 'intro'


@router.post("/generate")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 10/minute.
# Premium: 20/minute.
@limiter.limit("10/minute", key_func=user_key)
async def generate_text(
    request: Request,
    generate_req: GenerateRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate text using LLM (C-06: Sanitized & Rate Limited)"""
    sanitized_prompt = sanitize_user_input(generate_req.prompt)

    if not await deduct_brain_power(current_user.id, 1, db):
        raise_brain_power_depleted()

    try:
        response = await llm_service.generate(
            prompt=sanitized_prompt,
            model=generate_req.model,
            temperature=generate_req.temperature,
        )
        return {"response": response}
    except Exception:
        await refund_brain_power(current_user.id, 1, db)
        raise


@router.post("/chat")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 15/minute.
# Premium: 30/minute.
@limiter.limit("15/minute", key_func=user_key)
async def chat(
    request: Request,
    chat_req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Chat completion using LLM (C-06: Sanitized, Rate Limited, Strict Server Prompts)"""
    # Sanitize all user messages
    for msg in chat_req.messages:
        if msg.get("role") == "user":
            msg["content"] = sanitize_user_input(msg.get("content", ""))
        elif msg.get("role") == "system":
            # C-06: Absolute removal of user-supplied system messages
            msg["role"] = "user"
            msg["content"] = (
                f"[User tried to inject system role]: {sanitize_user_input(msg.get('content', ''))}"
            )

    # Get student context
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)
    age_group = student_context.get("age_group", "teen")
    complexity = get_content_complexity(age_group)

    # Token limit based on age (kept for logic, but persona handled)
    # max_tokens = 80 if age_group == "child" else 150 if age_group == "teen" else 250

    if not await deduct_brain_power(current_user.id, 1, db):
        raise_brain_power_depleted()

    try:
        # Refactored for Batch 10: Use AI Coordinator for persona-based response
        result = await ai_coordinator.get_chat_response(
            messages=chat_req.messages,
            student_profile=student_profile,
            mode=chat_req.mode,
            model=chat_req.model,
            temperature=0.6,
            student_name=current_user.first_name,
            subject_name=chat_req.subject_name,
            topic_name=chat_req.topic_name,
        )
        # Add student_context for frontend compatibility
        result["student_context"] = student_context
        return result
    except Exception:
        await refund_brain_power(current_user.id, 1, db)
        raise


@router.post("/explain")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 10/minute.
# Premium: 20/minute.
@limiter.limit("10/minute", key_func=user_key)
async def explain_concept(
    request: Request,
    explain_req: ExplainRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Explain a concept (C-06: Sanitized & Rate Limited)"""
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)

    if not await deduct_brain_power(current_user.id, 1, db):
        raise_brain_power_depleted()

    try:
        explanation = await llm_service.explain_concept(
            concept=sanitize_user_input(explain_req.concept, max_length=500),
            context=sanitize_user_input(explain_req.context or ""),
            question=sanitize_user_input(explain_req.question or ""),
            student_context=student_context,
        )
        return {"explanation": explanation, "student_context": student_context}
    except Exception:
        await refund_brain_power(current_user.id, 1, db)
        raise


@router.post("/evaluate-understanding")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 5/minute.
# Premium: 10/minute.
@limiter.limit("5/minute", key_func=user_key)
async def evaluate_understanding(
    request: Request,
    eval_req: EvaluateUnderstandingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Evaluate student's self-explanation (C-06: Sanitized & Rate Limited)"""
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)

    if not await deduct_brain_power(current_user.id, 1, db):
        raise_brain_power_depleted()

    try:
        evaluation = await llm_service.evaluate_understanding(
            concept=sanitize_user_input(eval_req.concept, max_length=200),
            student_explanation=sanitize_user_input(
                eval_req.explanation, max_length=1000
            ),
            student_context=student_context,
        )
    except Exception:
        await refund_brain_power(current_user.id, 1, db)
        raise

    # Persist XP if student profile exists and is_correct is True
    if evaluation.get("is_correct") and student_profile:
        xp_earned = evaluation.get("xp_earned", 10)
        # C-07: Atomic XP update to prevent TOCTOU race condition
        await db.execute(
            text(
                "UPDATE student_profiles SET xp = COALESCE(xp, 0) + :amt WHERE user_id = :uid"
            ),
            {"amt": xp_earned, "uid": current_user.id},
        )
        await db.refresh(student_profile)

        # Check for level up (simple logic: 1000 XP per level)
        new_level = (student_profile.xp // 1000) + 1
        if new_level > (student_profile.level or 1):
            student_profile.level = new_level
            evaluation["level_up"] = True

        await db.commit()

    return evaluation


@router.post("/lesson-content")
@limiter.limit("3/minute", key_func=user_key)
async def generate_lesson_content(
    request: Request,
    lesson_req: LessonContentRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate lesson content (C-06: Sanitized & Rate Limited)"""
    content = await llm_service.generate_lesson_content(
        topic=sanitize_user_input(lesson_req.topic),
        subject=sanitize_user_input(lesson_req.subject),
        education_level=sanitize_user_input(lesson_req.education_level),
        learning_style=sanitize_user_input(lesson_req.learning_style or ""),
    )
    return content


@router.post("/tts")
@limiter.limit("10/minute", key_func=user_key)
async def text_to_speech(
    request: Request,
    tts_req: TTSRequest,
    current_user: User = Depends(get_current_user),
):
    """Convert text to speech (C-06: Sanitized & Rate Limited)"""
    audio_url = await tts_service.generate_speech(
        text=sanitize_user_input(tts_req.text),
        language=sanitize_user_input(tts_req.language or "en"),
    )

    if audio_url:
        return {"audio_url": audio_url, "status": "success"}
    else:
        raise HTTPException(
            status_code=503, detail="TTS service is currently unavailable"
        )


@router.post("/stt")
async def speech_to_text(
    audio: UploadFile = File(...),
    language: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Convert speech to text"""
    # Save uploaded file temporarily
    import tempfile
    import os

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        text = await stt_service.transcribe(tmp_path, language)

        if text:
            return {"text": text, "status": "success"}
        else:
            raise HTTPException(
                status_code=503, detail="STT service is currently unavailable"
            )
    finally:
        os.unlink(tmp_path)


@router.post("/mastery-test")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 5/minute.
# Premium: 10/minute.
@limiter.limit("5/minute", key_func=user_key)
async def generate_mastery_test(
    request: Request,
    test_req: MasteryTestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Generate a 10-question adaptive mastery test (C-06: Sanitized & Rate Limited)"""
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)

    if not await deduct_brain_power(current_user.id, 1, db):
        raise_brain_power_depleted()

    try:
        questions = await llm_service.generate_mastery_test(
            topic=sanitize_user_input(test_req.topic),
            subject=sanitize_user_input(test_req.subject),
            education_level=student_profile.education_level
            if student_profile
            else "secondary",
            student_context=student_context,
            chat_history=test_req.chat_history,  # Logic inside llm_service handles history sanitization usually, but let's be safe
        )
        return {"questions": questions}
    except Exception:
        await refund_brain_power(current_user.id, 1, db)
        raise


@router.post("/breakdown")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 8/minute.
# Premium: 16/minute.
@limiter.limit("8/minute", key_func=user_key)
async def get_topic_breakdown(
    request: Request,
    body: TopicBreakdownRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get or generate subtopic breakdown for a topic (C-06: Sanitized & Rate Limited)

    Uses a shared SubjectOutline cache so all teachers get the same outline
    for the same subject + topic + education_level combination.
    """
    import traceback as tb
    from app.models.subject_outline import SubjectOutline

    try:
        res_prof = await db.execute(
            select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
        )
        student_profile = res_prof.scalars().first()

        education_level = "secondary"
        grade_level = ""
        if student_profile:
            education_level = student_profile.education_level or "secondary"
            grade_level = student_profile.grade_level or ""

        topic_name_str = str(body.topic)

        # Check SHARED outline cache first (across all teachers)
        # Use subject_id FK for proper relational integrity
        shared_outline = None
        try:
            res_outline = await db.execute(
                select(SubjectOutline).filter(
                    SubjectOutline.subject_id == body.subject_id,
                    SubjectOutline.topic_name == topic_name_str,
                    SubjectOutline.education_level == education_level,
                )
            )
            shared_outline = res_outline.scalars().first()
        except Exception as e:
            logger.warning(f"[breakdown] Resilience check: SubjectOutline table may be missing topic_name or subject_id: {e}")
            # Continue to generation if query fails (resilience)

        if shared_outline:
            logger.info(f"[breakdown] Using shared outline for {topic_name_str}")
            # Return shared outline but save to student's progress too
            breakdown = shared_outline.outline

            # Also cache in student progress for per-student tracking
            res_prog = await db.execute(
                select(StudentSubjectProgress).filter(
                    StudentSubjectProgress.student_id == current_user.id,
                    StudentSubjectProgress.subject_id == body.subject_id,
                )
            )
            progress = res_prog.scalars().first()

            if not progress:
                progress = StudentSubjectProgress(
                    student_id=current_user.id,
                    subject_id=body.subject_id,
                    subtopic_progress={},
                )
                db.add(progress)
                await db.flush()

            # Check if student already has progress for this topic
            student_progress = dict(progress.subtopic_progress or {})
            if topic_name_str not in student_progress:
                # New topic for this student - use shared outline
                student_progress[topic_name_str] = breakdown
                progress.subtopic_progress = student_progress
                await db.commit()

            return breakdown

        # Get overall subject progress to find/store subtopics
        res_prog = await db.execute(
            select(StudentSubjectProgress).filter(
                StudentSubjectProgress.student_id == current_user.id,
                StudentSubjectProgress.subject_id == body.subject_id,
            )
        )
        progress = res_prog.scalars().first()

        if not progress:
            progress = StudentSubjectProgress(
                student_id=current_user.id,
                subject_id=body.subject_id,
                subtopic_progress={},
            )
            db.add(progress)
            await db.flush()

        topic_id_str = str(body.topic)

        # Check student's own cache
        if progress.subtopic_progress and topic_id_str in progress.subtopic_progress:
            cached_breakdown = progress.subtopic_progress[topic_id_str]
            if (
                isinstance(cached_breakdown, dict)
                and cached_breakdown.get("subtopics")
                and len(cached_breakdown["subtopics"]) > 0
            ):
                first_sub_name = cached_breakdown["subtopics"][0].get("name", "")
                if first_sub_name != "corrected_topic":
                    return cached_breakdown

        if not await deduct_brain_power(current_user.id, 1, db):
            raise_brain_power_depleted()

        try:
            # Generate new breakdown
            result = await llm_service.generate_subtopics(
                topic=sanitize_user_input(body.topic),
                subject="Subject",
                education_level=education_level,
                grade_level=grade_level,
            )
        except Exception:
            await refund_brain_power(current_user.id, 1, db)
            raise

        subtopics_list = []
        if isinstance(result, dict):
            subtopics_list = result.get("subtopics", [])
        elif isinstance(result, list):
            subtopics_list = result

        if not subtopics_list:
            # Fallback: use topic name as single subtopic
            subtopics_list = [body.topic]

        breakdown = {
            "subtopics": [
                {
                    "name": str(st),
                    "status": "locked" if i > 0 else "active",
                    "score": None,
                }
                for i, st in enumerate(subtopics_list)
            ],
            "current_index": 0,
            "completed": False,
        }

        # Save to SHARED outline cache (first teacher to generate wins)
        try:
            shared_outline = SubjectOutline(
                subject_id=body.subject_id,
                topic_name=topic_name_str,
                education_level=education_level,
                outline=breakdown,
                teacher_id=current_user.id,
            )
            db.add(shared_outline)
            logger.info(f"[breakdown] Saved shared outline for {topic_name_str}")
        except Exception as shared_err:
            logger.warning(f"[breakdown] Could not save shared outline: {shared_err}")

        # Update student's progress
        try:
            new_progress = dict(progress.subtopic_progress or {})
            new_progress[topic_id_str] = breakdown
            progress.subtopic_progress = new_progress
            await db.commit()
        except Exception as save_err:
            logger.error(f"[breakdown] Failed to save progress: {save_err}")
            await db.rollback()

        return breakdown

    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_error("generating topic breakdown", e, db)


@router.post("/evaluate-mastery")
async def evaluate_mastery_test(
    request: MasteryTestEvaluationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Evaluate a complete mastery test and update roadmap progress"""
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)

    # Programmatic, Rule-Based Validation (Bypassing the LLM)
    total = len(request.results)
    score = sum(1 for r in request.results if r.get("is_correct", False))
    percentage = (score / total * 100) if total > 0 else 0
    passed = percentage >= 70

    if percentage >= 90:
        mastery_level = "Expert"
        feedback = f"Outstanding work! You've demonstrated a deep understanding of the material."
    elif percentage >= 70:
        mastery_level = "Proficient"
        feedback = f"Great job! You have a solid grasp of the core concepts."
    elif percentage >= 50:
        mastery_level = "Developing"
        feedback = f"You're making progress, but let's review a few key areas to strengthen your understanding before moving forward."
    else:
        mastery_level = "Beginner"
        feedback = f"It looks like this topic is still a bit tricky. Let's go back and review the fundamentals together."

    evaluation = {
        "score": score,
        "total": total,
        "percentage": percentage,
        "passed": passed,
        "mastery_level": mastery_level,
        "feedback": feedback,
        "detailed_results": request.results,
    }

    # Persist results and XP if passed
    if student_profile:
        # Calculate XP based on score
        xp_earned = int(evaluation.get("percentage", 0) / 2)
        # C-07: Atomic XP update to prevent TOCTOU race condition
        from sqlalchemy import text

        await db.execute(
            text(
                "UPDATE student_profiles SET xp = COALESCE(xp, 0) + :amt WHERE user_id = :uid"
            ),
            {"amt": xp_earned, "uid": current_user.id},
        )
        await db.refresh(student_profile)

        # Check for level up
        new_level = (student_profile.xp // 1000) + 1
        if new_level > (student_profile.level or 1):
            student_profile.level = new_level
            evaluation["level_up"] = True

        # Update Roadmap Progress if this was a subtopic test
        if request.subtopic:
            # For now, we update across all subject progresses that have this topic
            res_prog = await db.execute(
                select(StudentSubjectProgress).filter(
                    StudentSubjectProgress.student_id == current_user.id
                )
            )
            all_progress = res_prog.scalars().all()

            for progress in all_progress:
                    # FIX 3A: Isolated Chat History by Subject & Topic IDs
                    topic_key = f"{progress.subject_id}::{request.topic_id or request.topic}::{request.topic}"
                    if topic_key in progress.subtopic_progress:
                        road_map = dict(progress.subtopic_progress[topic_key])
                        current_idx = road_map.get("current_index", 0)
                        subtopics = list(road_map.get("subtopics", []))

                        if (
                            current_idx < len(subtopics)
                            and subtopics[current_idx]["name"] == request.subtopic
                        ):
                            if evaluation.get("passed"):
                                subtopics[current_idx]["status"] = "completed"
                                subtopics[current_idx]["score"] = evaluation.get(
                                    "percentage"
                                )

                                # Move to next subtopic
                                next_idx = current_idx + 1
                                if next_idx < len(subtopics):
                                    subtopics[next_idx]["status"] = "active"
                                    road_map["current_index"] = next_idx
                                else:
                                    road_map["completed"] = True

                                road_map["subtopics"] = subtopics
                                new_sub_prog = dict(progress.subtopic_progress)
                                new_sub_prog[topic_key] = road_map
                                progress.subtopic_progress = new_sub_prog

                            # If topic is fully completed via subtopics, mark it in the main curriculum too
                            if road_map["completed"] and request.topic_id:
                                await complete_topic_progression(db, current_user.id, request.topic_id)
        
        elif request.topic_id and evaluation.get("passed"):
            # This was a main topic mastery test (no subtopic selected)
            next_topic_id = await complete_topic_progression(db, current_user.id, request.topic_id)
            evaluation["next_topic_unlocked"] = str(next_topic_id) if next_topic_id else None

        # Log activity
        from app.models.student_progress import StudentActivityLog

        activity = StudentActivityLog(
            student_id=current_user.id,
            activity_type="mastery_test",
            activity_name=f"Mastery Test: {request.subtopic or request.topic}",
            score=evaluation.get("percentage"),
            extra_data={
                "topic": request.topic,
                "subtopic": request.subtopic,
                "correct_answers": evaluation.get("score"),
                "total_questions": evaluation.get("total"),
                "mastery_level": evaluation.get("mastery_level"),
                "passed": evaluation.get("passed"),
            },
        )
        db.add(activity)
        await db.commit()

    return evaluation


@router.post("/save-chat")
async def save_chat_history(
    request: SaveChatHistoryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Save chat history for a specific topic/subtopic or general AI"""

    try:
        logger.info(
            f"[save-chat] Saving chat for user {current_user.email}. Subject: {request.subject_id}, Topic: {request.topic_name}"
        )

        # Ensure user is in current session
        merged_user = await db.merge(current_user)

        if not request.subject_id:
            # Save general AI chat history to user model
            merged_user.ai_chat_history = [dict(m) for m in request.messages]
            await db.commit()
            await db.refresh(merged_user)
            logger.info(
                f"[save-chat] Saved {len(request.messages)} messages to user general history"
            )
            return {"status": "success"}

        # Save topic-specific chat history
        res_prog = await db.execute(
            select(StudentSubjectProgress).filter(
                StudentSubjectProgress.student_id == current_user.id,
                StudentSubjectProgress.subject_id == request.subject_id,
            )
        )
        progress = res_prog.scalars().first()

        if not progress:
            logger.info(
                f"[save-chat] Creating new progress for subject {request.subject_id}"
            )
            progress = StudentSubjectProgress(
                student_id=current_user.id,
                subject_id=request.subject_id,
                subtopic_progress={},
                chat_history={},
            )
            db.add(progress)
            await db.flush()

        # Update chat history
        current_history = progress.chat_history or {}
        if isinstance(current_history, list):
            current_history = {"general": current_history}

        # FIX 3A: Isolated Chat History by Subject & Topic IDs
        chat_key = f"{request.subject_id}::{request.topic_id or request.topic_name}::{request.topic_name}::{request.subtopic_name or 'intro'}"
        topic_history = [dict(m) for m in request.messages][-100:]
        current_history[chat_key] = topic_history
        progress.chat_history = current_history

        # Explicitly flag as modified for JSONB
        from sqlalchemy.orm.attributes import flag_modified

        flag_modified(progress, "chat_history")

        await db.commit()
        logger.info(
            f"[save-chat] Saved {len(request.messages)} messages to topic-specific history (key: {chat_key})"
        )
        return {"status": "success"}
    except Exception as e:
        raise handle_api_error("saving chat history", e, db)


@router.post("/get-chat")
async def get_chat_history(
    request: GetChatHistoryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get saved chat history for a specific topic/subtopic or general AI"""
    if not request.subject_id:
        # Get general AI chat history from user model
        return {"messages": current_user.ai_chat_history or []}

    # Get topic-specific chat history
    res_prog = await db.execute(
        select(StudentSubjectProgress).filter(
            StudentSubjectProgress.student_id == current_user.id,
            StudentSubjectProgress.subject_id == request.subject_id,
        )
    )
    progress = res_prog.scalars().first()

    if not progress or not progress.chat_history:
        return {"messages": []}

    history = progress.chat_history
    if isinstance(history, list):
        if not request.topic_name:
            return {"messages": history[-50:]}
        return {"messages": []}

    # FIX 3A: Isolated Chat History by Subject & Topic IDs
    chat_key = f"{request.subject_id}::{request.topic_id or request.topic_name}::{request.topic_name}::{request.subtopic_name or 'intro'}"
    messages = history.get(chat_key, [])
    return {"messages": messages[-50:]}


@router.get("/models")
async def get_available_models(current_user: User = Depends(get_current_user)):
    """Get available LLM models"""
    return {
        "models": [
            {
                "id": "llama3.2:3b",
                "name": "Llama 3.2 3B",
                "size": "3B",
                "description": "Fast and efficient",
            },
            {
                "id": "nomic-embed-text",
                "name": "Nomic Embed",
                "size": "-",
                "description": "Text embeddings",
            },
        ],
        "recommended": "llama3.2:3b",
    }


@router.get("/status")
async def get_ai_status(current_user: User = Depends(get_current_user)):
    """Get AI services status"""
    from app.services.ai_service import tts_service, stt_service

    return {
        "status": "online",
        "llm": {"enabled": True, "model": "llama3.2:3b"},
        "tts": {"enabled": tts_service.enabled},
        "stt": {"enabled": stt_service.enabled},
        "embedding": {"enabled": True, "model": "nomic-embed-text"},
    }


@router.get("/suggest-videos")
async def suggest_videos_for_topic(
    topic: str,
    subject: Optional[str] = None,
    education_level: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """
    Get YouTube video suggestions for a topic.
    Used during AI tutoring when engagement is low or student requests a video explanation.
    """
    try:
        from app.services.video_service import search_educational_videos

        # Build query focused on Nigeria as per instructions
        videos = await search_educational_videos(
            query=topic, subject=subject, level=education_level, limit=3
        )

        return {"videos": videos, "topic": topic}
    except Exception as e:
        logger.error(f"Video suggestion failed: {e}")
        return {"videos": [], "topic": topic}
