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
from app.models.session import TeachingSession
from app.models.user import TeacherProfile
from app.core.security import pwd_context

async def create_admin(email: str, password: str, full_name: str):
    async with AsyncSessionLocal() as db:
        # Check if email exists
        result = await db.execute(select(User).filter(User.email == email))
        if result.scalars().first():
            print(f"Error: Email {email} already exists.")
            return

        admin = User(
            id=uuid.uuid4(),
            email=email,
            username=email.split('@')[0],
            hashed_password=pwd_context.hash(password),
            full_name=full_name,
            first_name=full_name.split()[0] if " " in full_name else full_name,
            last_name=full_name.split()[-1] if " " in full_name else "",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            is_active=True,
            email_verified_at=datetime.now(timezone.utc),
            created_at=datetime.utcnow(),
            force_password_change=False
        )
        db.add(admin)
        await db.commit()
        print(f"Admin created: {email}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python create_admin.py <email> <password> 'Full Name'")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    full_name = sys.argv[3]
    asyncio.run(create_admin(email, password, full_name))
