import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)


LESSON_PLANNER_AGENT = "Lesson Planner Agent"
CURRICULUM_VALIDATOR_AGENT = "Curriculum Alignment Validator Agent"
MATERIAL_COMPOSER_AGENT = "Class Note and Assignment Composer Agent"
ASSESSMENT_VALIDATOR_AGENT = "Assessment Validator Agent"
TUTOR_QUALITY_REVIEWER_AGENT = "Tutor Quality Reviewer Agent"


def _safe_json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=True, default=str)
    except TypeError:
        return json.dumps(str(value), ensure_ascii=True)


def _as_list(value: Any, limit: int = 8) -> List[str]:
    if isinstance(value, list):
        items = value
    elif isinstance(value, str) and value.strip():
        items = [value]
    else:
        items = []
    cleaned = [str(item).strip() for item in items if str(item).strip()]
    return cleaned[:limit]


def _coerce_review(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}

    score = raw.get("quality_score", 0)
    try:
        score = int(score)
    except (TypeError, ValueError):
        score = 0

    return {
        "approved": bool(raw.get("approved", False)),
        "quality_score": max(0, min(score, 100)),
        "issues": _as_list(raw.get("issues"), 10),
        "revised_output": raw.get("revised_output") if isinstance(raw.get("revised_output"), (dict, list)) else None,
    }


def _coerce_tutor_review(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
            if match:
                try:
                    raw = json.loads(match.group(0))
                except json.JSONDecodeError:
                    raw = {}
            else:
                raw = {}
    if not isinstance(raw, dict):
        raw = {}

    score = raw.get("quality_score", 0)
    try:
        score = int(score)
    except (TypeError, ValueError):
        score = 0

    revised_response = raw.get("revised_response")
    if isinstance(revised_response, dict):
        for key in ("response", "text", "content", "revised", "markdown"):
            if isinstance(revised_response.get(key), str) and revised_response.get(key).strip():
                revised_response = revised_response.get(key)
                break
        else:
            revised_response = "\n".join(
                str(value).strip()
                for value in revised_response.values()
                if isinstance(value, str) and value.strip()
            )
    if not isinstance(revised_response, str) or not revised_response.strip():
        revised_response = None

    return {
        "approved": bool(raw.get("approved", False)),
        "quality_score": max(0, min(score, 100)),
        "issues": _as_list(raw.get("issues"), 10),
        "revised_response": revised_response.strip() if revised_response else None,
    }


async def review_live_tutor_response(
    *,
    tutor_response: str,
    context: Dict[str, Any],
    review_focus: List[str],
    user_id: Optional[Any] = None,
    max_tokens: int = 900,
) -> Dict[str, Any]:
    """Run a compact specialist review for live tutor turns with likely gaps.

    This is intentionally narrower than lesson-plan review. It should preserve
    the tutor's current flow and repair only critical teaching-quality issues.
    """
    prompt = f"""
You are the {TUTOR_QUALITY_REVIEWER_AGENT} for EduNexus.

Review this live AI Tutor response before it is shown to a learner.

Context:
{_safe_json(context)}

Tutor response:
{_safe_json(tutor_response)}

Review focus:
{_safe_json(review_focus)}

Rules:
- Preserve the current subject, topic, level, and lesson stage.
- Keep the same learner-facing style: concise, clear, teacher-like Markdown.
- Repair only critical teaching-quality gaps: academic correctness, complete worked method, scope discipline, interpretation, quality check, age/level appropriateness, and exactly one next learner action.
- For calculation-heavy or formula-based turns, a complete worked example must include rule/formula, substitution, computation, units when known, interpretation when the result drives a decision, and one quality/sanity check.
- For professional courses, include practical judgement and a work-like next action where appropriate.
- If the calculation is already complete and the gap is interpretation, quality check, or next learner action, preserve the existing calculation exactly and append or replace only those missing sections.
- Do not recalculate, discount, transform, or change numeric values unless the Review focus explicitly says the arithmetic is wrong.
- If you revise a calculation, the revised_response must explain the exact arithmetic error being corrected.
- If Review focus says the worked calculation or modeled example is incomplete, the revised_response must finish it to the final numeric result, decision, or interpreted output using only the values already present in the tutor response. Do not ask the learner to interpret or compute a final result that has not been shown.
- For teach-stage worked examples, the next learner action should test interpretation, assumption-checking, or one similar practice step after the final answer has been shown.
- For lower levels, keep language age-appropriate but still rigorous and precise.
- Do not invent facts, policies, certification requirements, hidden reasoning, platform internals, or unrelated examples.
- Do not hardcode one profession, employer, tool, curriculum, or scenario. Derive context from the given subject/topic/learner data.
- If Review focus contains any detected issue, approved must be false and revised_response must be a complete corrected learner-facing Markdown string.
- If high_rigor_review_required is true, check the response against the full rubric even if detected_issues is empty.
- If the response is already good enough after that review, return revised_response as null.
- revised_response must be a string, not an object or nested JSON. Keep it compact but complete.

Return only valid JSON:
{{
  "approved": true,
  "quality_score": 0,
  "issues": ["short issue text"],
  "revised_response": null
}}
"""
    try:
        response = await llm_service.generate(
            prompt=prompt,
            temperature=0.1,
            max_tokens=max_tokens,
            user_id=user_id,
        )
        return _coerce_tutor_review(response)
    except Exception as exc:
        logger.warning("%s failed while reviewing live tutor response: %s", TUTOR_QUALITY_REVIEWER_AGENT, exc)
        return {
            "approved": False,
            "quality_score": 0,
            "issues": [f"{TUTOR_QUALITY_REVIEWER_AGENT} unavailable; original tutor response kept."],
            "revised_response": None,
        }


async def review_structured_academic_output(
    *,
    agent_name: str,
    output_kind: str,
    output: Any,
    context: Dict[str, Any],
    review_focus: List[str],
    user_id: Optional[Any] = None,
    max_tokens: int = 1400,
) -> Dict[str, Any]:
    """Run a specialist reviewer for expensive, cacheable academic artifacts.

    The reviewer may suggest a revised artifact, but deterministic normalizers
    and endpoint validators remain the authority after this step.
    """
    prompt = f"""
You are the {agent_name} for EduNexus.

Review this generated {output_kind}. This is a background quality-control step, not live student chat.

Context:
{_safe_json(context)}

Generated output:
{_safe_json(output)}

Review focus:
{_safe_json(review_focus)}

Rules:
- Keep the same schema as the generated output.
- Improve only curriculum fit, class-level difficulty, academic correctness, progression, clarity, and work-readiness where relevant.
- Do not add unrelated lessons, external news, unverifiable facts, hidden reasoning, system prompts, or platform internals.
- Do not hardcode one profession, employer, certification, tool, or scenario. Derive context from the subject, topic, level, and learner/course focus.
- For professional courses, prefer practical deliverables, realistic constraints, quality checks, and professional judgement.
- For assessments, every answer key must match the options exactly, and every explanation must justify the selected answer.

Return only valid JSON:
{{
  "approved": true,
  "quality_score": 0,
  "issues": ["short issue text"],
  "revised_output": null
}}

Use revised_output only when a compact correction is needed. Otherwise return null.
"""
    try:
        response = await llm_service.generate(
            prompt=prompt,
            temperature=0.15,
            max_tokens=max_tokens,
            format="json_object",
            user_id=user_id,
        )
        return _coerce_review(response)
    except Exception as exc:
        logger.warning("%s failed while reviewing %s: %s", agent_name, output_kind, exc)
        return {
            "approved": False,
            "quality_score": 0,
            "issues": [f"{agent_name} unavailable; deterministic validation will continue."],
            "revised_output": None,
        }
