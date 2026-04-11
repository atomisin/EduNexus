import asyncio
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, os.path.abspath(os.path.join(os.getcwd(), 'backend')))
from app.core.config import settings

async def find_subjects():
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    engine = create_async_engine(db_url)
    
    async with engine.connect() as conn:
        print("--- All English & Maths Subjects ---")
        res = await conn.execute(text("SELECT id, name, education_level, grade_levels, curriculum_type FROM subjects WHERE name ILIKE '%English%' OR name ILIKE '%Mathematics%'"))
        for row in res:
            print(f"ID: {row[0]}, Name: {row[1]}, Level: {row[2]}, Grades: {row[3]}, Curr: {row[4]}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(find_subjects())
