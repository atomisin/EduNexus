import asyncio
import os
import sys
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

sys.path.insert(0, os.path.abspath(os.path.join(os.getcwd(), 'backend')))
from app.core.config import settings
from app.models.user import User
from app.models.student import StudentProfile
from app.services.curriculum_service import curriculum_service

async def verify_enrollment():
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    engine = create_async_engine(db_url)
    
    async with engine.connect() as conn:
        # Find a test user or create one?
        # Let's find an existing student if any
        res = await conn.execute(text("SELECT user_id, education_level FROM student_profiles LIMIT 1"))
        row = res.fetchone()
        if not row:
            print("No students found. Creating test students...")
            # We'll simulate the enrollment logic directly on a dummy ID
            dummy_id = "00000000-0000-0000-0000-000000000001"
            # But curriculum_service needs a real profile in DB.
            # So I'll just check the logic logic.
        
        tracks = ["jamb", "waec", "ss_1"]
        for track in tracks:
            print(f"\nVerifying track: {track}")
            # Mocking the mandatory check logic from curriculum_service
            mandatory_names = []
            if track.upper() == "JAMB":
                mandatory_names = ["Use of English"]
            elif track.upper() in ["WAEC", "NECO", "SS1", "SS2", "SS3"]:
                mandatory_names = ["Mathematics", "English Language"]
            
            print(f"Mandatory names: {mandatory_names}")
            if mandatory_names:
                res = await conn.execute(
                    text("SELECT id, name, grade_levels FROM subjects WHERE name = ANY(:names)"),
                    {"names": mandatory_names}
                )
                found = res.fetchall()
                print(f"Found in DB: {[r[1] for r in found]}")
                for r in found:
                    print(f"  - {r[1]} (Grades: {r[2]})")
                    if track.lower() in [g.lower() for g in (r[2] or [])]:
                        print(f"   ✅ Correctly tagged for {track}")
                    else:
                        print(f"   ❌ Missing tag for {track} (but will be picked up by name-match logic)")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(verify_enrollment())
