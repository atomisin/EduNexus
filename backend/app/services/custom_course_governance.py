import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CourseSafetyResult:
    allowed: bool
    status: str
    safety_status: str
    reason: str
    safety_flags: list[str]
    safe_alternatives: list[str]


_DEFENSIVE_INTENT = re.compile(
    r"\b("
    r"prevent|prevention|awareness|safety|safe|security|defen[cs]e|defensive|"
    r"forensic|forensics|law|legal|policy|ethics|compliance|risk|emergency|"
    r"response|first aid|victim|rehabilitation|counter|detection|reporting|"
    r"protection|public health|public safety|investigation"
    r")\b",
    re.IGNORECASE,
)

_HARMFUL_INTENT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "weapons_or_explosives",
        re.compile(
            r"\b("
            r"make|create|build|construct|manufacture|assemble|design|deploy|"
            r"detonate|weaponi[sz]e|hide|smuggle"
            r")\b.{0,80}\b("
            r"bomb|explosive|ied|grenade|landmine|firearm|gun|rifle|pistol|"
            r"ammunition|bullet|silencer|weapon"
            r")\b",
            re.IGNORECASE,
        ),
    ),
    (
        "kidnapping_or_human_harm",
        re.compile(
            r"\b("
            r"kidnap|abduct|hostage|human trafficking|traffick people|ransom|"
            r"extort|blackmail|torture|assassinat|murder|poison"
            r")\b",
            re.IGNORECASE,
        ),
    ),
    (
        "criminal_evasion_or_theft",
        re.compile(
            r"\b("
            r"steal|rob|burglary|break into|pick locks?|bypass alarm|evade police|"
            r"launder money|counterfeit|carding|phishing|credential theft|identity theft"
            r")\b",
            re.IGNORECASE,
        ),
    ),
    (
        "illegal_drugs",
        re.compile(
            r"\b("
            r"cook|manufacture|synthesi[sz]e|traffic|smuggle|sell"
            r")\b.{0,80}\b("
            r"meth|cocaine|heroin|fentanyl|illegal drugs?|narcotics?"
            r")\b",
            re.IGNORECASE,
        ),
    ),
]

_ALTERNATIVES: dict[str, list[str]] = {
    "weapons_or_explosives": [
        "Public safety and emergency response",
        "Hazard awareness and accident prevention",
        "Forensic science and lawful evidence handling",
    ],
    "kidnapping_or_human_harm": [
        "Personal security and anti-kidnapping awareness",
        "Conflict resolution and community safety",
        "Criminal justice, ethics, and victim protection",
    ],
    "criminal_evasion_or_theft": [
        "Cybersecurity defense and fraud prevention",
        "Business ethics and compliance",
        "Lawful security operations",
    ],
    "illegal_drugs": [
        "Public health and substance-abuse prevention",
        "Pharmaceutical ethics and regulation",
        "Community health education",
    ],
}


def screen_custom_course_request(
    title: str,
    description: str | None = None,
    intended_outcome: str | None = None,
    motivation: str | None = None,
) -> CourseSafetyResult:
    """First-line safety governance for student-created custom courses.

    The screen is intentionally category and intent based. It blocks requests that
    ask to perform harmful or criminal actions, while allowing defensive,
    educational, legal, or prevention-oriented study of sensitive topics.
    """
    text = " ".join(
        part.strip()
        for part in [title or "", description or "", intended_outcome or "", motivation or ""]
        if part and part.strip()
    )
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return CourseSafetyResult(
            allowed=False,
            status="auto_rejected",
            safety_status="blocked",
            reason="Course title is required.",
            safety_flags=["empty_request"],
            safe_alternatives=[],
        )

    defensive_context = bool(_DEFENSIVE_INTENT.search(normalized))
    flags = [label for label, pattern in _HARMFUL_INTENT_PATTERNS if pattern.search(normalized)]

    if flags and not defensive_context:
        alternatives: list[str] = []
        for flag in flags:
            alternatives.extend(_ALTERNATIVES.get(flag, []))
        unique_alternatives = list(dict.fromkeys(alternatives))
        return CourseSafetyResult(
            allowed=False,
            status="auto_rejected",
            safety_status="blocked",
            reason=(
                "This course request cannot be approved because it appears to seek instruction "
                "for harmful or criminal activity. Choose a lawful safety, prevention, ethics, "
                "or defensive learning goal instead."
            ),
            safety_flags=flags,
            safe_alternatives=unique_alternatives,
        )

    if flags and defensive_context:
        return CourseSafetyResult(
            allowed=True,
            status="suspicious_review",
            safety_status="needs_review",
            reason=(
                "This sensitive course request needs admin review to confirm the learning goal "
                "is lawful, defensive, and education-focused."
            ),
            safety_flags=flags,
            safe_alternatives=[],
        )

    return CourseSafetyResult(
        allowed=True,
        status="pending_admin_review",
        safety_status="clear",
        reason="Custom course request submitted for admin approval.",
        safety_flags=[],
        safe_alternatives=[],
    )


def course_safety_to_dict(result: CourseSafetyResult) -> dict[str, Any]:
    return {
        "allowed": result.allowed,
        "status": result.status,
        "safety_status": result.safety_status,
        "reason": result.reason,
        "safety_flags": result.safety_flags,
        "safe_alternatives": result.safe_alternatives,
    }
