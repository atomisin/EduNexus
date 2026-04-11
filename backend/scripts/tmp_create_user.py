import asyncio, uuid, sys, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import settings
from app.core.security import get_password_hash

engine = create_async_engine(settings.DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://'))

async def create_user():
    async with engine.begin() as conn:
        pwd = get_password_hash('Password123!')
        uid = str(uuid.uuid4())
        await conn.execute(text(f"""
            INSERT INTO users (id, email, hashed_password, role, is_active, created_at, updated_at)
            VALUES ('{uid}', 'teststudent@edunexus.com', '{pwd}', 'student', true, NOW(), NOW())
            ON CONFLICT (email) DO NOTHING
        """))
        
        # Get ID (might be existing)
        res = await conn.execute(text("SELECT id FROM users WHERE email='teststudent@edunexus.com'"))
        uid = res.fetchone()[0]
        
        # Also need a student profile
        pid = str(uuid.uuid4())
        await conn.execute(text(f"""
            INSERT INTO student_profiles (id, user_id, current_grade_level, target_exam)
            VALUES ('{pid}', '{uid}', 'SS3', 'JAMB')
            ON CONFLICT (user_id) DO NOTHING
        """))
        print('Created teststudent@edunexus.com / Password123!')

asyncio.run(create_user())
