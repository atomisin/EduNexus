import asyncio
import uuid
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Add backend to path to use config
sys.path.insert(0, os.path.abspath(os.path.join(os.getcwd(), 'backend')))
from app.core.config import settings

async def check_data():
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    engine = create_async_engine(db_url)
    
    async with engine.connect() as conn:
        print("--- English Subjects ---")
        res = await conn.execute(text("SELECT id, name, code, education_level, grade_levels, curriculum_type FROM subjects WHERE name ILIKE '%English%'"))
        for row in res:
            print(f"ID: {row[0]}, Name: {row[1]}, Code: {row[2]}, Level: {row[3]}, Grades: {row[4]}, Curr: {row[5]}")
            
        print("\n--- Potential Trash Topics ---")
        res = await conn.execute(text("SELECT t.id, t.name, s.name as subject_name FROM topics t JOIN subjects s ON t.subject_id = s.id WHERE t.name IN ('TOPICS', 'CLASS', 'SUBJECT', 'PART', 'WEEK', 'TERM') OR t.name ILIKE 'TOPIC %' LIMIT 20"))
        for row in res:
            print(f"ID: {row[0]}, Name: {row[1]}, Subject: {row[2]}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_data())
