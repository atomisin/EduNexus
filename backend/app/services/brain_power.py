from __future__ import annotations

import math
from datetime import datetime
from typing import Iterable, Mapping, Any

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9 fallback
    ZoneInfo = None  # type: ignore


MAX_BRAIN_POWER = 100
DAILY_TOKEN_BUDGET = 80_000
TOKENS_PER_BRAIN_POWER = DAILY_TOKEN_BUDGET // MAX_BRAIN_POWER
BRAIN_POWER_TIMEZONE = ZoneInfo("Africa/Lagos") if ZoneInfo else None


def current_brain_power_date():
    if BRAIN_POWER_TIMEZONE:
        return datetime.now(BRAIN_POWER_TIMEZONE).date()
    return datetime.utcnow().date()


def ensure_daily_brain_power(profile: Any) -> bool:
    """Recharge a profile once per local day.

    The scheduler still resets everyone at midnight, but this makes Brain Power
    resilient to free-tier sleep, redeploys, missed jobs, and legacy rows that
    predate the reset-date column.
    """
    if not profile:
        return False
    today = current_brain_power_date()
    if getattr(profile, "brain_power_reset_date", None) != today:
        profile.brain_power = MAX_BRAIN_POWER
        profile.brain_power_reset_date = today
        return True
    if getattr(profile, "brain_power", None) is None:
        profile.brain_power = MAX_BRAIN_POWER
        return True
    return False


def daily_token_budget_for_level(education_level: str | None = None) -> int:
    level = (education_level or "").strip().lower()
    if level == "professional":
        return 200_000
    if level in {"ss_1", "ss_2", "ss_3", "waec", "neco", "jamb"} or level.startswith("ss"):
        return 150_000
    if level in {"jss_1", "jss_2", "jss_3"} or level.startswith("jss"):
        return 120_000
    return DAILY_TOKEN_BUDGET


def tokens_per_brain_power(education_level: str | None = None) -> int:
    return daily_token_budget_for_level(education_level) // MAX_BRAIN_POWER


def estimate_text_tokens(text: str | None) -> int:
    """Small dependency-free token estimate for pre-flight budget checks."""
    if not text:
        return 0
    return max(1, math.ceil(len(text) / 4))


def estimate_message_tokens(messages: Iterable[Mapping[str, Any]] | None) -> int:
    if not messages:
        return 0
    return sum(estimate_text_tokens(str(message.get("content", ""))) + 4 for message in messages)


def brain_power_cost_for_tokens(
    estimated_input_tokens: int,
    max_output_tokens: int = 0,
    education_level: str | None = None,
) -> int:
    estimated_total = max(1, estimated_input_tokens + max(0, max_output_tokens))
    return min(
        MAX_BRAIN_POWER,
        max(1, math.ceil(estimated_total / tokens_per_brain_power(education_level))),
    )


def brain_power_budget_summary(current_brain_power: int | None, education_level: str | None = None) -> dict:
    current = MAX_BRAIN_POWER if current_brain_power is None else max(0, min(MAX_BRAIN_POWER, int(current_brain_power)))
    daily_budget = daily_token_budget_for_level(education_level)
    per_brain_power = tokens_per_brain_power(education_level)
    return {
        "brain_power": current,
        "max_brain_power": MAX_BRAIN_POWER,
        "daily_token_budget": daily_budget,
        "tokens_per_brain_power": per_brain_power,
        "approx_tokens_remaining": current * per_brain_power,
    }
