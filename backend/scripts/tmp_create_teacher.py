import asyncio
import sys
import uuid
import os
from datetime import datetime, timezone
from sqlalchemy import select

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import AsyncSessionLocal
from app.models.user import User, UserRole, UserStatus
from app.models.student import StudentProfile
from app.models.user import TeacherProfile
from app.core.security import pwd_context

async def create_teacher(email: str, password: str, full_name: str):
    async with AsyncSessionLocal() as db:
        # Check if email exists
        result = await db.execute(select(User).filter(User.email == email))
        if result.scalars().first():
            print(f"Error: Email {email} already exists.")
            return

        user_id = uuid.uuid4()
        teacher = User(
            id=user_id,
            email=email,
            username=email.split('@')[0],
            hashed_password=pwd_context.hash(password),
            full_name=full_name,
            first_name=full_name.split()[0] if " " in full_name else full_name,
            last_name=full_name.split()[-1] if " " in full_name else "",
            role=UserRole.TEACHER,
            status=UserStatus.ACTIVE,
            is_active=True,
            email_verified_at=datetime.now(timezone.utc),
            created_at=datetime.utcnow(),
            force_password_change=False
        )
        db.add(teacher)
        
        profile = TeacherProfile(
            id=uuid.uuid4(),
            user_id=user_id,
            qualifications=["B.Ed", "M.Sc"],
            specialization="Mathematics & Science",
            years_of_experience=5,
            subjects_taught=["Mathematics", "Physics"],
            education_levels=["senior_secondary"],
            is_verified_teacher=True
        )
        db.add(profile)
        
        await db.commit()
        print(f"Teacher created: {email}")

if __name__ == "__main__":
    email = "testteacher@example.com"
    password = "AdminPassword001"
    full_name = "Test Teacher"
    asyncio.run(create_teacher(email, password, full_name))
