import asyncio
import os
import sys
from sqlalchemy import text

# Add the parent directory to the path so we can import the app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import SessionLocal

async def investigate_sec():
    async with SessionLocal() as session:
        query = text("SELECT id, name, code, education_level, grade_levels FROM subjects WHERE code LIKE 'SEC-%'")
        result = await session.execute(query)
        subjects = result.fetchall()
        
        for s in subjects:
            print(f"ID: {s[0]} | Name: {s[1]} | Code: {s[2]} | Level: {s[3]} | Grades: {s[4]}")

if __name__ == "__main__":
    asyncio.run(investigate_sec())
