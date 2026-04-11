from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.student import StudentProfile
from app.models.user import User, TeacherProfile

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
