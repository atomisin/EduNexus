import re
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subject import Subject, Topic


GRADE_ORDER = [
    "P1", "P2", "P3", "P4", "P5", "P6",
    "JSS1", "JSS2", "JSS3",
    "SS1", "SS2", "SS3",
]

STOP_WORDS = {
    "revision", "review", "work", "class", "term", "last", "previous",
    "comparison", "characters", "character", "numbers", "number", "greater",
    "less", "than", "solution", "simple", "including", "first", "second",
    "third", "scheme", "mathematics", "mathematic", "week",
}


def normalize_grade_label(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip().upper().replace("_", "").replace("-", "").replace(" ", "")
    aliases = {
        "PRIMARY1": "P1",
        "PRIMARY2": "P2",
        "PRIMARY3": "P3",
        "PRIMARY4": "P4",
        "PRIMARY5": "P5",
        "PRIMARY6": "P6",
        "PRY1": "P1",
        "PRY2": "P2",
        "PRY3": "P3",
        "PRY4": "P4",
        "PRY5": "P5",
        "PRY6": "P6",
    }
    if text in aliases:
        return aliases[text]
    match = re.fullmatch(r"(P|JSS|SS)([1-6])", text)
    if match:
        prefix, level = match.groups()
        if prefix != "P" and level not in {"1", "2", "3"}:
            return None
        return f"{prefix}{level}"
    return None


def is_revision_topic(topic: Topic) -> bool:
    text = f"{topic.name or ''} {topic.description or ''}".lower()
    return "revision" in text or "review of" in text


def is_assessment_noise(topic: Topic) -> bool:
    text = (topic.name or "").lower()
    return any(marker in text for marker in ("test", "exam", "open day", "break"))


def extract_referenced_grade(text: str) -> Optional[str]:
    patterns = [
        r"\b(SS)\s*[-_]?\s*([123])\b",
        r"\b(JSS)\s*[-_]?\s*([123])\b",
        r"\bPRIMARY\s*([1-6])\b",
        r"\bPRY\s*([1-6])\b",
        r"\bP\s*([1-6])\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text or "", flags=re.IGNORECASE)
        if not match:
            continue
        groups = match.groups()
        if groups[0].upper() in {"SS", "JSS"}:
            return normalize_grade_label(f"{groups[0]}{groups[1]}")
        return normalize_grade_label(f"P{groups[-1]}")
    return None


def subject_grade(subject: Subject) -> Optional[str]:
    for grade in subject.grade_levels or []:
        normalized = normalize_grade_label(str(grade))
        if normalized:
            return normalized
    if subject.code:
        return extract_referenced_grade(subject.code)
    return extract_referenced_grade(subject.education_level or "")


def previous_grade(current_grade: Optional[str]) -> Optional[str]:
    if current_grade not in GRADE_ORDER:
        return None
    index = GRADE_ORDER.index(current_grade)
    return GRADE_ORDER[index - 1] if index > 0 else None


def revision_focus_phrases(topic: Topic) -> List[str]:
    raw = topic.name or ""
    parts = re.split(r"[–—\-;:,]+", raw)
    phrases = []
    for part in parts[1:] if len(parts) > 1 else parts:
        cleaned = " ".join(part.split())
        if cleaned and "revision" not in cleaned.lower():
            phrases.append(cleaned)
    return phrases[:5]


def revision_keywords(topic: Topic) -> List[str]:
    text = (topic.name or "").lower()
    words = re.findall(r"[a-z0-9]+", text)
    keywords = []
    for word in words:
        if len(word) < 4 or word in STOP_WORDS:
            continue
        stem = word[:-1] if word.endswith("s") else word
        if stem not in keywords:
            keywords.append(stem)
    return keywords[:12]


def topic_matches_keywords(topic: Topic, keywords: List[str]) -> bool:
    haystack = f"{topic.name or ''} {topic.description or ''}".lower()
    for keyword in keywords:
        if len(keyword) <= 4:
            if re.search(rf"\b{re.escape(keyword)}\b", haystack):
                return True
        elif keyword in haystack:
            return True
    return False


def choose_representative_revision_topics(
    source_topics: List[Topic],
    revision_topic: Topic,
    max_questions: int = 10,
) -> List[Topic]:
    usable_topics = [topic for topic in source_topics if not is_assessment_noise(topic)]
    if not usable_topics:
        usable_topics = source_topics

    keywords = revision_keywords(revision_topic)
    focused = [topic for topic in usable_topics if topic_matches_keywords(topic, keywords)]
    if focused:
        return focused[:max_questions]

    if len(usable_topics) <= max_questions:
        return usable_topics

    step = (len(usable_topics) - 1) / max(max_questions - 1, 1)
    selected: List[Topic] = []
    seen = set()
    for idx in range(max_questions):
        topic = usable_topics[round(idx * step)]
        if topic.id not in seen:
            selected.append(topic)
            seen.add(topic.id)
    return selected


def serialize_topic(topic: Topic) -> Dict[str, Any]:
    return {
        "id": str(topic.id),
        "name": topic.name,
        "description": topic.description,
        "term": topic.term,
        "sort_order": topic.sort_order,
    }


async def get_revision_context(
    db: AsyncSession,
    subject: Subject,
    topic: Topic,
    max_source_topics: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    if not is_revision_topic(topic):
        return None

    combined_text = f"{topic.name or ''} {topic.description or ''}"
    source_grade = extract_referenced_grade(combined_text) or previous_grade(subject_grade(subject))
    if not source_grade:
        return None

    res_subjects = await db.execute(
        select(Subject).filter(
            Subject.is_active == True,
            Subject.name == subject.name,
        )
    )
    candidates = res_subjects.scalars().all()
    same_curriculum = [
        item for item in candidates
        if (item.curriculum_type or "") == (subject.curriculum_type or "")
    ] or candidates

    source_prefix = source_grade.lower()
    source_subject = next(
        (
            item for item in same_curriculum
            if item.id != subject.id and (item.code or "").lower().startswith(source_prefix)
        ),
        None,
    )
    if not source_subject:
        source_subject = next(
            (
                item for item in same_curriculum
                if item.id != subject.id
                and source_grade in {normalize_grade_label(str(g)) for g in (item.grade_levels or [])}
            ),
            None,
        )
    if not source_subject:
        return None

    res_topics = await db.execute(
        select(Topic)
        .filter(Topic.subject_id == source_subject.id, Topic.is_active == True)
        .order_by(Topic.sort_order.asc(), Topic.name.asc())
    )
    source_topics = res_topics.scalars().all()
    if max_source_topics:
        source_topics = source_topics[:max_source_topics]

    assessment_topics = choose_representative_revision_topics(source_topics, topic)

    return {
        "is_revision": True,
        "source_grade": source_grade,
        "source_subject": {
            "id": str(source_subject.id),
            "name": source_subject.name,
            "code": source_subject.code,
        },
        "revision_focus": revision_focus_phrases(topic),
        "source_topic_count": len(source_topics),
        "source_topics": [serialize_topic(item) for item in source_topics],
        "assessment_topics": [serialize_topic(item) for item in assessment_topics],
    }


async def get_subject_and_topic(
    db: AsyncSession,
    subject_id: Any,
    topic_id: Any,
) -> tuple[Optional[Subject], Optional[Topic]]:
    try:
        subject_uuid = uuid.UUID(str(subject_id))
        topic_uuid = uuid.UUID(str(topic_id))
    except (TypeError, ValueError):
        return None, None

    res_subject = await db.execute(select(Subject).filter(Subject.id == subject_uuid))
    subject = res_subject.scalars().first()
    res_topic = await db.execute(select(Topic).filter(Topic.id == topic_uuid))
    topic = res_topic.scalars().first()
    return subject, topic
