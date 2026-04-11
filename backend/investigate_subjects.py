import asyncio
import os
import sys
from sqlalchemy import text

# Add the parent directory to the path so we can import the app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import SessionLocal

async def investigate_subjects():
    async with SessionLocal() as session:
        query = text("""
            SELECT id, name, code, education_level, grade_levels 
            FROM subjects 
            WHERE name ILIKE '%Economics%' 
               OR name ILIKE '%Mathematics%' 
               OR name ILIKE '%English%' 
               OR name ILIKE '%Biology%'
               OR code ILIKE 'ss2-%'
               OR code ILIKE 'SEC-%'
        """)
        result = await session.execute(query)
        subjects = result.fetchall()
        
        print(f"{'ID':<40} | {'Name':<20} | {'Code':<25} | {'Level':<15} | {'Grades'}")
        print("-" * 120)
        for s in subjects:
            print(f"{str(s[0]):<40} | {s[1]:<20} | {str(s[2]):<25} | {s[3]:<15} | {s[4]}")

if __name__ == "__main__":
    asyncio.run(investigate_subjects())
