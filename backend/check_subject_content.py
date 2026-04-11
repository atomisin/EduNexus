import asyncio
import os
import sys
from sqlalchemy import text

# Add the parent directory to the path so we can import the app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import SessionLocal

async def check_subject_content():
    async with SessionLocal() as session:
        # SEC-ECO-001 (The one with the wrong code)
        # ss2-economics (The one with the right code but potentially empty)
        
        subject_ids = [
            "60e4fecd-b96c-4aa8-8a45-177e0edc564e", # SEC-ECO-001
            "542cd947-5c15-4690-a702-99645afe4363"  # ss2-economics
        ]
        
        for sid in subject_ids:
            print(f"\nChecking Subject ID: {sid}")
            
            # Get Basic info
            res = await session.execute(text("SELECT name, code FROM subjects WHERE id = :sid"), {"sid": sid})
            name, code = res.fetchone()
            print(f"Name: {name} | Code: {code}")
            
            # Count topics
            res = await session.execute(text("SELECT count(*) FROM topics WHERE subject_id = :sid"), {"sid": sid})
            print(f"Topics count: {res.scalar()}")
            
            # Count students
            res = await session.execute(text("SELECT count(*) FROM student_subject WHERE subject_id = :sid"), {"sid": sid})
            print(f"Students count: {res.scalar()}")

if __name__ == "__main__":
    asyncio.run(check_subject_content())
