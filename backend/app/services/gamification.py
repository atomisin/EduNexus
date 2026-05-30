from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.models.student import StudentProfile
from app.models.user import User, TeacherProfile

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9 fallback
    ZoneInfo = None  # type: ignore


STREAK_TIMEZONE = ZoneInfo("Africa/Lagos") if ZoneInfo else timezone.utc
LEARNING_STREAK_ACTIVITY_TYPES = {
    "ai_chat",
    "chat",
    "tutor",
    "lesson",
    "topic",
    "mastery_test",
    "quiz",
    "mock_exam",
    "session",
    "assignment",
}


def _streak_date(value: datetime | None = None):
    now = value or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.astimezone(STREAK_TIMEZONE).date()


def _calculate_consecutive_streak(activity_dates: set) -> int:
    if not activity_dates:
        return 0

    today = _streak_date()
    latest = max(activity_dates)
    if latest < today - timedelta(days=1):
        return 0

    streak = 0
    cursor = latest
    while cursor in activity_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak

def update_student_streak(db: AsyncSession, student_profile: StudentProfile):
    """
    Updates the student's daily streak based on their last active date.
    Returns True if the streak was modified, allowing the caller to commit.
    """
    if not student_profile:
        return False
        
    now = datetime.now(timezone.utc)
    today = now.date()
    
    # First time login
    if not student_profile.last_active_date:
        student_profile.last_active_date = now
        student_profile.current_streak = 1
        student_profile.longest_streak = 1
        return True
        
    last_active = student_profile.last_active_date.date()
    
    # Already logged in today
    if last_active == today:
        # Just update the timestamp but don't increment streak
        student_profile.last_active_date = now
        return True
        
    # Logged in yesterday (Streak continues)
    if last_active == today - timedelta(days=1):
        student_profile.current_streak += 1
        if student_profile.current_streak > student_profile.longest_streak:
            student_profile.longest_streak = student_profile.current_streak
    # Missed a day (Streak broken)
    elif last_active < today - timedelta(days=1):
        student_profile.current_streak = 1
        
    student_profile.last_active_date = now
    return True


def mark_student_learning_activity(student_profile: StudentProfile, occurred_at: datetime | None = None) -> bool:
    """Advance streak only when the learner performs a real learning action."""
    if not student_profile:
        return False

    now = occurred_at or datetime.now(timezone.utc)
    activity_day = _streak_date(now)
    last_day = _streak_date(student_profile.last_active_date) if student_profile.last_active_date else None
    changed = False

    if last_day == activity_day:
        student_profile.last_active_date = now
        return True

    if last_day == activity_day - timedelta(days=1):
        student_profile.current_streak = (student_profile.current_streak or 0) + 1
    else:
        student_profile.current_streak = 1

    if (student_profile.current_streak or 0) > (student_profile.longest_streak or 0):
        student_profile.longest_streak = student_profile.current_streak

    student_profile.last_active_date = now
    changed = True
    return changed


async def sync_student_streak_from_activity_logs(db: AsyncSession, student_profile: StudentProfile) -> bool:
    """Reconcile the persisted streak from actual learning activity logs."""
    if not student_profile:
        return False

    from app.models.student_progress import StudentActivityLog

    res = await db.execute(
        select(StudentActivityLog.timestamp)
        .filter(
            StudentActivityLog.student_id == student_profile.user_id,
            StudentActivityLog.activity_type.in_(tuple(LEARNING_STREAK_ACTIVITY_TYPES)),
        )
        .order_by(StudentActivityLog.timestamp.desc())
        .limit(500)
    )
    timestamps = [value for value in res.scalars().all() if value]
    activity_dates = {_streak_date(timestamp) for timestamp in timestamps}
    current_streak = _calculate_consecutive_streak(activity_dates)
    longest_streak = max(student_profile.longest_streak or 0, current_streak)
    latest_activity = timestamps[0] if timestamps else None

    changed = False
    if (student_profile.current_streak or 0) != current_streak:
        student_profile.current_streak = current_streak
        changed = True
    if (student_profile.longest_streak or 0) != longest_streak:
        student_profile.longest_streak = longest_streak
        changed = True
    if latest_activity and student_profile.last_active_date != latest_activity:
        student_profile.last_active_date = latest_activity
        changed = True

    return changed

async def award_xp(db: AsyncSession, student_profile: StudentProfile, xp_amount: int, reason: str = ""):
    """
    Awards XP to a student and handles leveling up safely (preventing race conditions).
    Returns the updated profile. Note: Caller must await db.commit().
    """
    if not student_profile:
        return student_profile
        
    await db.execute(
        text("UPDATE student_profiles SET xp = COALESCE(xp, 0) + :amt WHERE user_id = :uid"),
        {"amt": xp_amount, "uid": student_profile.user_id}
    )
    await db.refresh(student_profile)
    
    # Simple leveling formula: Level = (XP // 100) + 1
    # For example: 0-99 XP = Lvl 1, 100-199 XP = Lvl 2
    new_level = ((student_profile.xp or 0) // 100) + 1
    
    if new_level > (student_profile.level or 1):
        student_profile.level = new_level
        
    return student_profile

async def award_teacher_impact(db: AsyncSession, teacher_profile: TeacherProfile, impact_amount: int):
    """
    Increases a teacher's impact score safely (preventing race conditions).
    Returns the updated profile. Caller must await db.commit().
    """
    if not teacher_profile:
        return teacher_profile
        
    await db.execute(
        text("UPDATE teacher_profiles SET impact_score = COALESCE(impact_score, 0) + :amt WHERE user_id = :uid"),
        {"amt": impact_amount, "uid": teacher_profile.user_id}
    )
    await db.refresh(teacher_profile)
    return teacher_profile
