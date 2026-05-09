import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.security import pwd_context
from app.db.database import AsyncSessionLocal
from app.models.student import StudentProfile
from app.models.user import User, UserRole, UserStatus


DEMO_EMAIL = os.getenv("DEMO_STUDENT_EMAIL", "ss2student@example.com")
DEMO_PASSWORD = os.getenv("DEMO_STUDENT_PASSWORD", "@Tommie03")


def generate_student_id() -> str:
    return f"EDU-{datetime.now(timezone.utc).year}-{uuid.uuid4().hex[:6].upper()}"


async def ensure_demo_student() -> None:
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).filter(User.email == DEMO_EMAIL))
        demo_user = result.scalars().first()

        if demo_user is None:
            demo_user = User(
                id=uuid.uuid4(),
                email=DEMO_EMAIL,
                username="ss2student",
                first_name="SS2",
                last_name="Student",
                full_name="SS2 Student",
                role=UserRole.STUDENT,
                created_at=now,
            )
            db.add(demo_user)
            await db.flush()

        demo_user.username = demo_user.username or "ss2student"
        demo_user.hashed_password = pwd_context.hash(DEMO_PASSWORD)
        demo_user.first_name = demo_user.first_name or "SS2"
        demo_user.last_name = demo_user.last_name or "Student"
        demo_user.full_name = demo_user.full_name or "SS2 Student"
        demo_user.role = UserRole.STUDENT
        demo_user.status = UserStatus.ACTIVE
        demo_user.is_active = True
        demo_user.email_verified_at = demo_user.email_verified_at or now
        demo_user.force_password_change = False
        demo_user.updated_at = now

        profile_result = await db.execute(
            select(StudentProfile).filter(StudentProfile.user_id == demo_user.id)
        )
        profile = profile_result.scalars().first()

        if profile is None:
            profile = StudentProfile(
                id=uuid.uuid4(),
                user_id=demo_user.id,
                student_id=generate_student_id(),
                created_at=now,
            )
            db.add(profile)

        profile.learning_style = profile.learning_style or "visual"
        profile.education_level = "senior_secondary"
        profile.education_category = "senior_secondary"
        profile.grade_level = "SS2"
        profile.current_grade_level = "SS2"
        profile.curriculum_type = profile.curriculum_type or "Nigerian"
        profile.enrolled_subjects = profile.enrolled_subjects or ["Mathematics"]
        profile.subject_proficiency = profile.subject_proficiency or {}
        profile.updated_at = now

        await db.commit()
        print(f"Demo student ready: {DEMO_EMAIL} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(ensure_demo_student())
