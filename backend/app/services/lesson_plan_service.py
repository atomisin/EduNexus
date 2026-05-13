import json
import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subject import Subject, Topic
from app.models.subject_outline import SubjectOutline
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

LESSON_PLAN_CACHE_PREFIX = "lesson_plan::"

TEACHING_SEQUENCE = [
    ("intro", "Set the lesson goal, activate relevant prior knowledge, and ask one entry check."),
    ("concept", "Teach the central concept inside the lesson boundary."),
    ("worked_example", "Model one representative example with clear steps."),
    ("guided_practice", "Let the learner try a supported task and give feedback."),
    ("independent_practice", "Give a slightly harder task without leading the answer."),
    ("mastery_check", "Confirm the learner can apply the lesson skill independently."),
]


def _clean_text(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text or fallback


def _normalize_lesson_goal(value: Any, fallback: str = "") -> str:
    text = _clean_text(value, fallback)
    if not text:
        return fallback

    text = re.sub(
        r"^As a [^,]+,\s*I want to\s+",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"^I want to\s+",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = text[:1].upper() + text[1:] if text else text
    if text and not text.endswith("."):
        text += "."
    return text


def _as_text_list(value: Any, fallback: Optional[List[str]] = None, limit: int = 8) -> List[str]:
    fallback = fallback or []
    if isinstance(value, str):
        items = [value]
    elif isinstance(value, list):
        items = value
    else:
        items = fallback
    cleaned = [_clean_text(item) for item in items if _clean_text(item)]
    return cleaned[:limit] or fallback[:limit]


def _fallback_lesson_plan(subject: Subject, topic: Topic, education_level: str) -> Dict[str, Any]:
    topic_name = _clean_text(topic.name, "this lesson")
    subject_name = _clean_text(subject.name, "the subject")
    description = _clean_text(topic.description)
    outcomes = _as_text_list(getattr(topic, "learning_outcomes", None), limit=5)
    objectives = _as_text_list(getattr(subject, "learning_objectives", None), limit=5)

    plan = {
        "lesson_goal": outcomes[0] if outcomes else f"Understand and apply {topic_name} in {subject_name}.",
        "scope_boundaries": [
            f"Stay within {topic_name}.",
            "Use the topic description and learning outcomes as the lesson boundary.",
            "Do not move into the next listed lesson unless the platform unlocks it.",
        ],
        "prerequisites": objectives[:3] or [
            f"Recall the basic ideas needed for {topic_name}.",
            "Use correct subject vocabulary before solving tasks.",
        ],
        "teaching_sequence": [
            {"stage": stage, "objective": objective}
            for stage, objective in TEACHING_SEQUENCE
        ],
        "misconceptions": [
            "Confusing a definition with the ability to apply it.",
            "Skipping intermediate reasoning steps.",
            "Carrying a method from another topic into this lesson without checking if it applies.",
        ],
        "allowed_examples": [
            f"Examples directly involving {topic_name}.",
            "Class-level examples that match the learner's education level.",
            "Everyday Nigerian contexts only when they clarify the current lesson skill.",
        ],
        "forbidden_drift": [
            "Do not teach the next lesson's number range, theorem, chapter, or topic.",
            "Do not broaden into unrelated news, events, entertainment, or general trivia.",
            "Do not let learner boredom become a reason to skip required mastery.",
        ],
        "mastery_criteria": [
            "The learner can explain the core idea in their own words.",
            "The learner can solve or answer a representative task without being led.",
            "The learner can correct a common mistake from this lesson.",
        ],
    }
    if description:
        plan["scope_boundaries"].insert(1, description[:350])
    return plan


def _normalize_teaching_sequence(value: Any) -> List[Dict[str, str]]:
    by_stage = {}
    if isinstance(value, list):
        for item in value:
            if not isinstance(item, dict):
                continue
            stage = _clean_text(item.get("stage")).lower()
            objective = _clean_text(item.get("objective"))
            if stage and objective:
                by_stage[stage] = objective

    normalized = []
    for stage, fallback_objective in TEACHING_SEQUENCE:
        normalized.append(
            {
                "stage": stage,
                "objective": by_stage.get(stage) or fallback_objective,
            }
        )
    return normalized


def normalize_lesson_plan(raw: Any, subject: Subject, topic: Topic, education_level: str) -> Dict[str, Any]:
    fallback = _fallback_lesson_plan(subject, topic, education_level)
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}

    return {
        "lesson_goal": _normalize_lesson_goal(raw.get("lesson_goal"), fallback["lesson_goal"]),
        "scope_boundaries": _as_text_list(raw.get("scope_boundaries"), fallback["scope_boundaries"], 8),
        "prerequisites": _as_text_list(raw.get("prerequisites"), fallback["prerequisites"], 8),
        "teaching_sequence": _normalize_teaching_sequence(raw.get("teaching_sequence")),
        "misconceptions": _as_text_list(raw.get("misconceptions"), fallback["misconceptions"], 8),
        "allowed_examples": _as_text_list(raw.get("allowed_examples"), fallback["allowed_examples"], 8),
        "forbidden_drift": _as_text_list(raw.get("forbidden_drift"), fallback["forbidden_drift"], 8),
        "mastery_criteria": _as_text_list(raw.get("mastery_criteria"), fallback["mastery_criteria"], 8),
    }


async def _generate_lesson_plan(
    subject: Subject,
    topic: Topic,
    education_level: str,
    user_id: Optional[Any] = None,
) -> Dict[str, Any]:
    topic_name = _clean_text(topic.name)
    topic_description = _clean_text(topic.description)
    outcomes = _as_text_list(getattr(topic, "learning_outcomes", None), limit=8)
    subject_objectives = _as_text_list(getattr(subject, "learning_objectives", None), limit=8)

    prompt = f"""
Create a structured Lesson Teaching Plan for EduNexus AI Tutor.

This plan is NOT shown directly to learners. It controls how the tutor teaches without drifting.

Subject: {subject.name}
Education level: {education_level}
Lesson topic: {topic_name}
Topic description: {topic_description or "Not provided"}
Topic learning outcomes: {json.dumps(outcomes)}
Subject learning objectives: {json.dumps(subject_objectives)}

Return only valid JSON with exactly these keys:
lesson_goal, scope_boundaries, prerequisites, teaching_sequence, misconceptions,
allowed_examples, forbidden_drift, mastery_criteria.

teaching_sequence must contain exactly these six stages in order:
intro, concept, worked_example, guided_practice, independent_practice, mastery_check.

Rules:
- The plan must be class-level appropriate and subject-specific.
- It must support rigorous subjects such as mathematics, physics, chemistry, biology, accounting, and professional courses.
- For technical subjects, include real tasks/calculations/analysis expectations where appropriate.
- Keep scope_boundaries and forbidden_drift strict enough to prevent moving to the next lesson.
- allowed_examples must be examples the tutor may use inside this exact lesson only.
- mastery_criteria must be observable evidence, not vague praise.
"""
    response = await llm_service.generate(
        prompt=prompt,
        temperature=0.25,
        max_tokens=1600,
        format="json_object",
        user_id=user_id,
    )
    return normalize_lesson_plan(response, subject, topic, education_level)


async def get_or_create_lesson_teaching_plan(
    db: AsyncSession,
    subject: Subject,
    topic: Topic,
    education_level: str,
    user_id: Optional[Any] = None,
) -> Dict[str, Any]:
    """Return a cached structured plan that constrains AI Tutor lesson flow.

    SubjectOutline is intentionally reused as the shared cache: one plan per
    subject/topic/education-level, separate from subtopic outlines via a
    prefixed topic_name.
    """
    education_level = _clean_text(education_level, "secondary").lower()
    cache_key = f"{LESSON_PLAN_CACHE_PREFIX}{topic.id}"

    try:
        result = await db.execute(
            select(SubjectOutline).filter(
                SubjectOutline.subject_id == subject.id,
                SubjectOutline.topic_name == cache_key,
                SubjectOutline.education_level == education_level,
            )
        )
        cached = result.scalars().first()
        if cached and isinstance(cached.outline, dict):
            cached_plan = cached.outline.get("plan") if cached.outline.get("type") == "lesson_teaching_plan" else cached.outline
            return normalize_lesson_plan(cached_plan, subject, topic, education_level)
    except Exception as exc:
        logger.warning("Lesson plan cache lookup failed for topic %s: %s", topic.id, exc)
        cached = None

    try:
        plan = await _generate_lesson_plan(subject, topic, education_level, user_id=user_id)
    except Exception as exc:
        logger.warning("Lesson plan generation failed for topic %s: %s", topic.id, exc)
        return _fallback_lesson_plan(subject, topic, education_level)

    try:
        payload = {
            "type": "lesson_teaching_plan",
            "topic_id": str(topic.id),
            "topic_name": topic.name,
            "subject_name": subject.name,
            "education_level": education_level,
            "plan": plan,
        }
        if cached:
            cached.outline = payload
        else:
            db.add(
                SubjectOutline(
                    subject_id=subject.id,
                    topic_name=cache_key,
                    education_level=education_level,
                    outline=payload,
                    teacher_id=user_id,
                )
            )
        await db.commit()
    except Exception as exc:
        logger.warning("Lesson plan cache save failed for topic %s: %s", topic.id, exc)
        await db.rollback()

    return plan
