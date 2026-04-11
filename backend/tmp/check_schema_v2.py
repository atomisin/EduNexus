
import asyncio
from app.db.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as db:
        print("--- Checking student_subject_progress table ---")
        try:
            res = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'student_subject_progress'"))
            columns = [r[0] for r in res.fetchall()]
            expected = [
                "total_time_spent_minutes", "last_active", "strength_areas", "weakness_areas",
                "proficiency_level", "mastery_percentage", "subtopic_progress", "chat_history"
            ]
            missing = [c for c in expected if c not in columns]
            print(f"Existing columns count: {len(columns)}")
            print(f"Missing columns: {missing}")
        except Exception as e:
            print(f"Error checking student_subject_progress: {e}")

        print("\n--- Checking subject_outlines table ---")
        try:
            res = await db.execute(text("SELECT 1 FROM information_schema.tables WHERE table_name = 'subject_outlines'"))
            exists = res.scalar() == 1
            print(f"Table exists: {exists}")
        except Exception as e:
            print(f"Error checking subject_outlines: {e}")

if __name__ == "__main__":
    asyncio.run(check())
