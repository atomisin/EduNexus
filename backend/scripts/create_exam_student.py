import asyncio
from uuid import uuid4
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import AsyncSessionLocal
from app.models.user import User, UserRole, UserStatus
from app.models.student import StudentProfile
# Import other models to satisfy SQLAlchemy relationships
from app.models.subject import Subject
from app.models.mock_exam import MockExamSeries, MockQuestion, MockAttempt

# We need to find where TeachingSession is defined. Let's assume session.py
try:
    from app.models.session import TeachingSession
except ImportError:
    pass

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_exam_student():
    async with AsyncSessionLocal() as db:
        email = "examstudent@edunexus.com"
        password = "TestPassword123!"
        hashed_password = pwd_ctx.hash(password)
        
        # Check if user exists
        from sqlalchemy import select
        res = await db.execute(select(User).where(User.email == email))
        user = res.scalar_one_or_none()
        
        if not user:
            user = User(
                id=uuid4(),
                email=email,
                username="examstudent",
                hashed_password=hashed_password,
                first_name="Exam",
                last_name="Student",
                role=UserRole.STUDENT,
                status=UserStatus.ACTIVE,
                is_active=True,
                force_password_change=False
            )
            db.add(user)
            await db.flush()
            print(f"Created user: {email}")
        else:
            print(f"User already exists: {email}")
            user.hashed_password = hashed_password 
            user.status = UserStatus.ACTIVE
            user.is_active = True
            
        # Check profile
        res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))
        profile = res.scalar_one_or_none()
        
        if not profile:
            profile = StudentProfile(
                id=uuid4(),
                user_id=user.id,
                education_level="secondary",
                current_grade_level="SS3",
                curriculum_type="WAEC",
                enrolled_subjects=[],
                brain_power=100
            )
            db.add(profile)
            print(f"Created student profile for: {email}")
        else:
            profile.education_level = "secondary"
            profile.current_grade_level = "SS3"
            profile.curriculum_type = "WAEC"
            print(f"Updated student profile for: {email}")
            
        await db.commit()
        print("Done.")

if __name__ == "__main__":
    asyncio.run(create_exam_student())
