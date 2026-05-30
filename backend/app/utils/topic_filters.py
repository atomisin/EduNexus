from __future__ import annotations

import re
from typing import Iterable, List, TypeVar


T = TypeVar("T")

PLACEHOLDER_TOPIC_NAMES = {"CLASS", "SUBJECT", "TERM", "TOPIC", "TOPICS"}
ACADEMIC_SECTION_MARKER = re.compile(
    r"\b(?:A|B|C|D)\s*[\).:]\s*(?:GRAMMAR|ORAL|STRUCTURE|SUMMARY|WRITING|COMPREHENSION|VOCABULARY|WORDS?)\b",
    re.IGNORECASE,
)


def _topic_name(topic: object) -> str:
    return str(getattr(topic, "name", "") or "").strip()


def normalize_topic_key(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", value.upper()).strip()


def is_placeholder_or_header_topic_name(name: str) -> bool:
    key = normalize_topic_key(name)
    if not key:
        return True
    if key in PLACEHOLDER_TOPIC_NAMES:
        return True
    if "LAGOS STATE GOVERNMENT MINISTRY OF EDUCATION" in key:
        return True
    if "UNIFIED SCHEMES OF WORK FOR PRIMARY SCHOOLS" in key:
        return True
    if key.startswith("SUBJECTS "):
        return True
    return False


def is_warmup_revision_topic_name(name: str) -> bool:
    key = normalize_topic_key(name)
    if not key:
        return False
    if key.startswith("WELCOME TEST") and "REVISION" in key and not ACADEMIC_SECTION_MARKER.search(name):
        return True
    warmup_words = (
        "REVISION",
        "READINESS TEST",
        "REDINESS TEST",
        "RESUMPTION TEST",
        "RESUMOTION TEST",
        "READING TEST",
    )
    if key in {"REVISION", "GENERAL REVISION", "READINESS TEST", "REDINESS TEST"}:
        return True
    if re.match(
        r"^(?:WELCOME\s+TEST(?:AND)?|READINESS\s+TEST(?:AND)?|REDINESS\s+TEST(?:AND)?|RESUMPTION\s+TEST(?:AND)?)?\s*(?:AND\s+)?REVIEW\s+OF\s+(?:PRIMARY|BASIC|JSS|SSS?|CLASS|GRADE)\s+\d+\s+WORK\b",
        key,
    ):
        return True
    if re.match(r"^(?:AND\s+)?REVIEW\s+OF\s+(?:PRIMARY|BASIC|JSS|SSS?|CLASS|GRADE)\s+\d+\s+WORK\b", key):
        return True
    if key.startswith(warmup_words):
        return True
    return bool(re.match(r"^(REVISION|READINESS|REDINESS|RESUMPTION|RESUMOTION)\b.*\b(TEST|WORK|TERM|LESSON)\b", key))


def clean_topic_display_name(name: str) -> str:
    """Remove non-academic warm-up prefixes while preserving the real lesson title."""
    text = str(name or "").strip()
    if not text:
        return ""
    return re.sub(
        r"^\s*[-–—]?\s*(?:WELCOME\s+TEST|TEST)\s*(?:[-–—:/]?\s*REVISION)?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip(" -–—:/")


def is_real_learning_topic(topic: object) -> bool:
    return not is_placeholder_or_header_topic_name(_topic_name(topic))


def filter_learning_topics(topics: Iterable[T]) -> List[T]:
    """Return student-facing topics, skipping CSV headers and first warm-up revision rows."""
    visible = [topic for topic in topics if is_real_learning_topic(topic)]
    while visible and is_warmup_revision_topic_name(_topic_name(visible[0])):
        visible.pop(0)
    return visible
