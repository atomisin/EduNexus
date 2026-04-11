import httpx
import uuid
import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, any_

import sys
import asyncio

async def test():
    # 1. Look up student profile in DB directly using psycopg2/asyncpg to bypass auth
    from app.models.student import StudentProfile
    from app.models.subject import Subject
    from app.db.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(StudentProfile).order_by(StudentProfile.created_at.desc()).limit(1))
        profile = res.scalars().first()
        
        grade_level = "SS1"
        department = "Science"
        
        # Test query
        query = select(Subject).filter(Subject.is_active == True, Subject.is_private == False)
        
        # Using any_
        query = query.filter(grade_level == any_(Subject.grade_levels))
        query = query.filter(department == any_(Subject.departments))
        
        try:
            res_subjs = await db.execute(query)
            subjects = res_subjs.scalars().all()
            print("SUCCESS! any_() worked.")
            print(f"Subjects found: {[s.name for s in subjects]}")
        except Exception as e:
            print(f"FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test())
