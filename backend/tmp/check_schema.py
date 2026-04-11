
import asyncio
from app.db.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as db:
        print("Checking student_subject_progress...")
        res = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'student_subject_progress'"))
        columns = [r[0] for r in res.fetchall()]
        print(f"Columns: {columns}")
        
        print("\nChecking subject_outlines...")
        res = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'subject_outlines'"))
        columns = [r[0] for r in res.fetchall()]
        print(f"Columns: {columns}")

if __name__ == "__main__":
    asyncio.run(check())
