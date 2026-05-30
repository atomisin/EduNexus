import json
import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subject import Subject, Topic
from app.models.subject_outline import SubjectOutline
from app.services.academic_agent_service import (
    CURRICULUM_VALIDATOR_AGENT,
    MATERIAL_COMPOSER_AGENT,
    review_structured_academic_output,
)
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

LESSON_MATERIAL_CACHE_PREFIX = "session_material::"


def _text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        cleaned = re.sub(r"\s+", " ", value).strip()
        return cleaned or fallback
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "; ".join(_text(item) for item in value if _text(item)) or fallback
    if isinstance(value, dict):
        for key in ("text", "point", "title", "objective", "content", "description", "explanation", "task"):
            if value.get(key):
                return _text(value.get(key), fallback)
        return "; ".join(
            f"{str(key).replace('_', ' ').title()}: {_text(item)}"
            for key, item in value.items()
            if _text(item)
        ) or fallback
    return str(value).strip() or fallback


def _markdown_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        cleaned = value.replace("\r\n", "\n").strip()
        return cleaned or fallback
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(_markdown_text(item) for item in value if _markdown_text(item)) or fallback
    if isinstance(value, dict):
        for key in ("content", "text", "description", "explanation", "task"):
            if value.get(key):
                return _markdown_text(value.get(key), fallback)
        sections = []
        for key, item in value.items():
            text = _markdown_text(item)
            if text:
                sections.append(f"## {str(key).replace('_', ' ').title()}\n{text}")
        return "\n\n".join(sections) or fallback
    return str(value).strip() or fallback


def _list(value: Any, fallback: Optional[List[str]] = None, limit: int = 8) -> List[str]:
    fallback = fallback or []
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        items = [value]
    else:
        items = fallback
    cleaned = [_text(item) for item in items if _text(item)]
    return cleaned[:limit] or fallback[:limit]


def _assignment_fallback_tasks(subject_name: str, topic_name: str) -> List[str]:
    technical_subjects = (
        "mathematics",
        "physics",
        "chemistry",
        "accounting",
        "economics",
        "computer",
        "data processing",
        "financial",
        "further mathematics",
    )
    is_technical = any(key in subject_name.lower() for key in technical_subjects)
    if is_technical:
        return [
            f"Foundation: define the key idea in {topic_name} in your own words and state one rule or property used in class.",
            f"Practice from today's class: solve two questions on the part of {topic_name} covered today, showing every important step.",
            "Method check: write one line explaining why your method works for one of the questions you solved.",
            "Application: create one original example from daily life or school work and solve it completely.",
            "Continuity: write the exact point where the lesson stopped for you and one question you want clarified in the next class.",
            "Stretch, if this part has been taught: attempt one harder question that combines two ideas from the lesson.",
        ]
    return [
        f"Foundation: explain the meaning of {topic_name} in your own words using correct subject vocabulary.",
        f"Class recap: write four important points from the part of {topic_name} covered today.",
        "Application: give one example or case study that connects today's class to real life.",
        "Understanding check: answer one question that shows you can use the idea, not only define it.",
        "Continuity: write the exact point where the lesson stopped for you and one question you want clarified in the next class.",
        "Stretch, if this part has been taught: connect today's idea to the next part of the lesson in two or three sentences.",
    ]


def _normalize_assignment_tasks(value: Any, fallback: List[str], limit: int = 6) -> List[str]:
    tasks = _list(value, fallback, limit)
    too_thin = len(tasks) < 3 or all(len(task.split()) < 8 for task in tasks)
    if too_thin:
        merged = tasks + [task for task in fallback if task not in tasks]
        tasks = merged[:limit]
    return tasks


def _format_markdown_note(value: Any, fallback: str = "") -> str:
    """Keep generated student notes readable even when the model returns dense text."""
    text = _markdown_text(value, fallback)
    if not text:
        return fallback

    code_blocks: List[str] = []

    def stash_code(match: re.Match[str]) -> str:
        code_blocks.append(match.group(0))
        return f"\n\n__EDUNEXUS_CODE_BLOCK_{len(code_blocks) - 1}__\n\n"

    text = re.sub(r"```[\s\S]*?```", stash_code, text)
    text = re.sub(
        r"^(Introduction to [A-Z][A-Za-z0-9 ,&()/-]{3,80}?)\s+(?=(?:A|An|The|This|In)\s)",
        r"# \1\n\n",
        text,
    )
    text = re.sub(r"([^\n])\s+(#{1,6}\s+)", r"\1\n\n\2", text)
    text = re.sub(r"(^|\n)(#{1,6}\s+[^\n]+?)\s+(?=[A-Z][A-Za-z ]{2,}:)", r"\1\2\n\n", text)

    # Turn sentence-start bold labels into section headings while preserving
    # inline emphasis such as "called the **ENIAC**".
    def heading_repl(match: re.Match[str]) -> str:
        prefix = match.group(1) or ""
        heading = match.group(2).strip()
        return f"{prefix}\n\n## {heading}\n"

    text = re.sub(r"(^|[.!?]\s+)\*\*([^*\n]{3,80})\*\*\s*", heading_repl, text)
    text = re.sub(r"\s+\*\s+", "\n- ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    for index, block in enumerate(code_blocks):
        text = text.replace(f"__EDUNEXUS_CODE_BLOCK_{index}__", block.strip())

    return text.strip()


def _questions(value: Any) -> List[Dict[str, Any]]:
    raw = value.get("questions") if isinstance(value, dict) else value
    if not isinstance(raw, list):
        return []
    questions: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw[:5], start=1):
        if not isinstance(item, dict):
            continue
        options = _list(item.get("options"), limit=4)
        if len(options) < 2:
            continue
        try:
            correct_index = int(item.get("correct_index", item.get("answer_index", 0)))
        except (TypeError, ValueError):
            correct_index = 0
        correct_index = max(0, min(correct_index, len(options) - 1))
        question = _text(item.get("text") or item.get("question"))
        if not question:
            continue
        questions.append(
            {
                "id": item.get("id") or idx,
                "text": question,
                "options": options,
                "correct_index": correct_index,
                "explanation": _text(item.get("explanation")),
            }
        )
    return questions


def _fallback_material(subject: Subject, topic: Topic, education_level: str) -> Dict[str, Any]:
    subject_name = _text(subject.name, "Subject")
    topic_name = _text(topic.name, "Lesson")
    description = _text(topic.description)
    outcomes = _list(getattr(topic, "learning_outcomes", None), limit=5)
    assignment_tasks = _assignment_fallback_tasks(subject_name, topic_name)
    is_professional = _text(education_level).lower() == "professional"
    goal = outcomes[0] if outcomes else f"Teach {topic_name} clearly for {education_level} learners."
    outline = [
        f"Open with the lesson goal: {goal}",
        f"Review the key vocabulary and meaning of {topic_name}.",
        "Model one representative example before asking learners to try.",
        "Check understanding with one short question.",
        "Close with a summary and take-home task.",
    ]
    note_body = description or f"{topic_name} is studied in {subject_name}. The class should focus on the main idea, correct vocabulary, one worked example, guided practice, and a short recap."
    material = {
        "outline": outline,
        "class_note": {
            "title": f"{subject_name}: {topic_name}",
            "content": (
                f"## Lesson goal\n{goal}\n\n"
                f"## Key idea\n{note_body}\n\n"
                "## Worked example\nUse a class-level example that directly matches this topic.\n\n"
                "## Summary\nRestate the main idea and ask learners to explain it in their own words."
            ),
        },
        "teacher_tips": [
            "Start with a quick diagnostic question.",
            "Keep examples inside the selected topic.",
            "Ask learners to show their thinking, not only final answers.",
        ],
        "pop_quiz": [],
        "assignment": {
            "title": f"Take-home assignment: {topic_name}",
            "instructions": (
                "Complete the tasks progressively in your notebook. Start with the parts covered in today's class, "
                "then attempt the application and stretch tasks only as far as the teacher has introduced them."
            ),
            "tasks": assignment_tasks,
        },
        "video_search_terms": [f"{subject_name} {topic_name} {education_level}"],
        "version": 1,
    }
    if is_professional:
        material["teacher_tips"].extend(
            [
                "Frame the lesson with a realistic workplace scenario from the course context.",
                "Ask learners to produce one small professional artifact and one quality check.",
            ]
        )
        material["assignment"]["tasks"] = (
            assignment_tasks[:3]
            + [
                f"Work-ready task: create a brief, checklist, plan, review note, calculation, or decision record that applies {topic_name} to a realistic workplace scenario.",
                "Quality check: state one constraint, risk, standard, stakeholder need, or trade-off that affects your work.",
                "Reflection: write one sentence explaining how you would improve the deliverable before using it professionally.",
            ]
        )[:6]
    return material


def normalize_lesson_material(raw: Any, subject: Subject, topic: Topic, education_level: str) -> Dict[str, Any]:
    fallback = _fallback_material(subject, topic, education_level)
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    class_note = raw.get("class_note") if isinstance(raw.get("class_note"), dict) else {}
    assignment = raw.get("assignment") if isinstance(raw.get("assignment"), dict) else {}
    fallback_assignment_tasks = fallback["assignment"]["tasks"]
    return {
        "outline": _list(raw.get("outline"), fallback["outline"], 8),
        "class_note": {
            "title": _text(class_note.get("title"), fallback["class_note"]["title"]),
            "content": _format_markdown_note(class_note.get("content"), fallback["class_note"]["content"]),
        },
        "teacher_tips": _list(raw.get("teacher_tips"), fallback["teacher_tips"], 8),
        "pop_quiz": _questions(raw.get("pop_quiz")),
        "assignment": {
            "title": _text(assignment.get("title"), fallback["assignment"]["title"]),
            "instructions": _text(assignment.get("instructions"), fallback["assignment"]["instructions"]),
            "tasks": _normalize_assignment_tasks(assignment.get("tasks") or assignment.get("questions"), fallback_assignment_tasks, 6),
        },
        "video_search_terms": _list(raw.get("video_search_terms"), fallback["video_search_terms"], 3),
        "version": int(raw.get("version") or 1),
    }


async def _generate_material(
    subject: Subject,
    topic: Topic,
    education_level: str,
    user_id: Optional[Any] = None,
) -> Dict[str, Any]:
    prompt = f"""
Create shared EduNexus teacher preparation material.

Role: {MATERIAL_COMPOSER_AGENT}

This material is for a teacher before a live class starts. It must be rich, class-level appropriate, and reusable by every teacher teaching the same class/subject/topic.

Subject: {subject.name}
Education level: {education_level}
Topic: {topic.name}
Topic description: {_text(topic.description, "Not provided")}
Learning outcomes: {json.dumps(_list(getattr(topic, "learning_outcomes", None), limit=8))}

Return only valid JSON with this exact structure:
{{
  "outline": ["5-8 teacher-facing lesson steps"],
  "class_note": {{"title": "short title", "content": "rich markdown note for students with clear headings, short paragraphs, bullet lists, and worked examples where useful"}},
  "teacher_tips": ["practical teaching tips"],
  "pop_quiz": [{{"text": "question", "options": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "why"}}],
  "assignment": {{"title": "take-home title", "instructions": "clear instruction", "tasks": ["task 1", "task 2"]}},
  "video_search_terms": ["search term 1", "search term 2"],
  "version": 1
}}

Rules:
- The class_note must be deep enough for the education level, not a shallow introduction.
- The class_note must be well structured Markdown: use headings, short paragraphs, bullet lists, and numbered steps where helpful. Do not return one long paragraph.
- For Mathematics, Physics, Chemistry, Accounting, and other technical subjects, include worked-example style content and correct notation.
- For professional courses, build work-ready practice without hardcoding one job or tool: use a realistic scenario, practical deliverable, constraints/trade-offs, and a quality check that fit the active subject and topic.
- The assignment must be progressive because the whole lesson may span multiple live sessions: 4-6 tasks moving from today's covered part, to practice, application, continuity notes, and optional stretch/prep for the next class.
- For technical subjects, assignment tasks must require calculations, procedures, worked steps, diagrams, data interpretation, or problem solving as appropriate. Do not return a vague task such as "find the remainder of each number" without the actual questions.
- Include a continuity task asking the learner to note where the class stopped and what should be clarified next time.
- Phrase stretch tasks as optional or "if taught" so the assignment does not assume the entire lesson has been completed.
- Do not include answer keys in the assignment. The learner should have to work.
- Do not include unrelated topics, next lesson content, or platform implementation details.
- Keep pop quiz answer keys deterministic and aligned with the options.
"""
    response = await llm_service.generate(
        prompt=prompt,
        temperature=0.25,
        max_tokens=2400,
        format="json_object",
        user_id=user_id,
    )
    material = normalize_lesson_material(response, subject, topic, education_level)
    review = await review_structured_academic_output(
        agent_name=CURRICULUM_VALIDATOR_AGENT,
        output_kind="class note and assignment material",
        output=material,
        context={
            "subject": subject.name,
            "education_level": education_level,
            "topic": topic.name,
            "topic_description": _text(topic.description, ""),
            "learning_outcomes": _list(getattr(topic, "learning_outcomes", None), limit=8),
        },
        review_focus=[
            "class-level academic depth",
            "topic boundary alignment",
            "assignment progression continuity",
            "pop quiz answer-key consistency",
            "student-note clarity and formatting",
            "professional deliverable and quality check" if education_level.lower() == "professional" else "age-appropriate practice",
        ],
        user_id=user_id,
        max_tokens=1800,
    )
    revised = review.get("revised_output")
    if isinstance(revised, dict):
        return normalize_lesson_material(revised, subject, topic, education_level)
    return material


async def get_or_create_shared_lesson_material(
    db: AsyncSession,
    subject: Subject,
    topic: Topic,
    education_level: str,
    user_id: Optional[Any] = None,
) -> Dict[str, Any]:
    education_level = _text(education_level, "secondary").lower()
    cache_key = f"{LESSON_MATERIAL_CACHE_PREFIX}{topic.id}"
    cached = None
    try:
        res = await db.execute(
            select(SubjectOutline).filter(
                SubjectOutline.subject_id == subject.id,
                SubjectOutline.topic_name == cache_key,
                SubjectOutline.education_level == education_level,
            )
        )
        cached = res.scalars().first()
        if cached and isinstance(cached.outline, dict):
            material = cached.outline.get("material") if cached.outline.get("type") == "shared_lesson_material" else cached.outline
            return normalize_lesson_material(material, subject, topic, education_level)
    except Exception as exc:
        logger.warning("Shared lesson material cache lookup failed for topic %s: %s", topic.id, exc)

    try:
        material = await _generate_material(subject, topic, education_level, user_id=user_id)
    except Exception as exc:
        logger.warning("Shared lesson material generation failed for topic %s: %s", topic.id, exc)
        return _fallback_material(subject, topic, education_level)

    try:
        payload = {
            "type": "shared_lesson_material",
            "topic_id": str(topic.id),
            "topic_name": topic.name,
            "subject_name": subject.name,
            "education_level": education_level,
            "material": material,
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
        logger.warning("Shared lesson material cache save failed for topic %s: %s", topic.id, exc)
        await db.rollback()
    return material
