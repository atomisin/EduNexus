import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from sqlalchemy import select

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import AsyncSessionLocal, Base
from app.core.security import pwd_context

# CRITICAL: Import ALL models in correct order to resolve relationships
from app.models import (
    user, student, session, subject, assessment,
    rag_models, student_progress, notification,
    message, report, token_usage,
    junction_tables, mock_exam, subject_outline
)
from app.models.user import User, UserRole, UserStatus, TeacherProfile

async def seed_core_accounts():
    async with AsyncSessionLocal() as db:
        # 1. Create Admin
        admin_email = "admin@edunexus.com"
        res = await db.execute(select(User).filter(User.email == admin_email))
        if not res.scalars().first():
            admin = User(
                id=uuid.uuid4(),
                email=admin_email,
                username="admin",
                hashed_password=pwd_context.hash("Admin@TempPassword123"),
                full_name="EduNexus Admin",
                first_name="EduNexus",
                last_name="Admin",
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
                is_active=True,
                email_verified_at=datetime.now(timezone.utc),
                created_at=datetime.now(timezone.utc),
                force_password_change=False
            )
            db.add(admin)
            print(f"Admin created: {admin_email}")
        
        # 2. Create Teacher
        teacher_email = "testteacher@example.com"
        res = await db.execute(select(User).filter(User.email == teacher_email))
        if not res.scalars().first():
            t_id = uuid.uuid4()
            teacher = User(
                id=t_id,
                email=teacher_email,
                username="testteacher",
                hashed_password=pwd_context.hash("AdminPassword001"),
                full_name="Test Teacher",
                first_name="Test",
                last_name="Teacher",
                role=UserRole.TEACHER,
                status=UserStatus.ACTIVE,
                is_active=True,
                email_verified_at=datetime.now(timezone.utc),
                created_at=datetime.now(timezone.utc),
                force_password_change=False
            )
            db.add(teacher)
            
            profile = TeacherProfile(
                id=uuid.uuid4(),
                user_id=t_id,
                qualifications=["B.Ed", "M.Sc"],
                specialization="Education Technology",
                years_of_experience=10,
                subjects_taught=["Mathematics", "English"],
                education_levels=["senior_secondary"],
                is_verified_teacher=True
            )
            db.add(profile)
            print(f"Teacher created: {teacher_email}")
            
        await db.commit()

if __name__ == "__main__":
    print("Starting Master Seed...")
    asyncio.run(seed_core_accounts())
    print("Master Seed complete!")
