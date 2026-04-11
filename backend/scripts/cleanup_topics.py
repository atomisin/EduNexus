import asyncio
import uuid
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, os.path.abspath(os.path.join(os.getcwd(), 'backend')))
from app.core.config import settings

async def cleanup():
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    engine = create_async_engine(db_url)
    
    async with engine.begin() as conn:
        # 1. Delete Trash Topics
        trash_names = ['TOPICS', 'CLASS', 'SUBJECT', 'PART', 'WEEK', 'TERM']
        print(f"Deleting trash topics: {trash_names}...")
        res = await conn.execute(
            text("DELETE FROM topics WHERE name = ANY(:names)"),
            {"names": trash_names}
        )
        print(f"Deleted {res.rowcount} trash topics.")

        # 2. Rename 'English' to 'English Language' for consistency with common usage and educationLevels.ts
        print("Normalizing English subject names...")
        res = await conn.execute(
            text("UPDATE subjects SET name = 'English Language' WHERE name = 'English'")
        )
        print(f"Updated {res.rowcount} subjects to 'English Language'.")
        
        # 3. Ensure "Use of English" exists for JAMB
        # Check if "Use of English" exists
        res = await conn.execute(text("SELECT id FROM subjects WHERE name = 'Use of English'"))
        row = res.fetchone()
        if not row:
            print("Creating 'Use of English' subject for JAMB...")
            new_id = str(uuid.uuid4())
            await conn.execute(
                text("INSERT INTO subjects (id, name, code, education_level, curriculum_type, is_active, is_private, grade_levels) VALUES (:id, :name, :code, :level, :curr, :active, :private, :grades)"),
                {
                    "id": new_id,
                    "name": "Use of English",
                    "code": "jamb-english",
                    "level": "exam",
                    "curr": "JAMB",
                    "active": True,
                    "private": False,
                    "grades": ["jamb"]
                }
            )
        else:
            print("'Use of English' already exists. Updating its grade levels...")
            await conn.execute(
                text("UPDATE subjects SET grade_levels = array_append(grade_levels, 'jamb') WHERE name = 'Use of English' AND NOT 'jamb' = ANY(grade_levels)")
            )

        # 4. Map 'waec' and 'neco' to 'Mathematics' and 'English Language'
        print("Updating Mathematics and English Language for WAEC/NECO/JAMB tracks...")
        # For English Language
        await conn.execute(
            text("UPDATE subjects SET grade_levels = array_cat(grade_levels, ARRAY['waec', 'neco', 'ss_1', 'ss_2', 'ss_3']) WHERE name = 'English Language'")
        )
        # For Mathematics
        await conn.execute(
            text("UPDATE subjects SET grade_levels = array_cat(grade_levels, ARRAY['waec', 'neco', 'ss_1', 'ss_2', 'ss_3', 'jamb']) WHERE name = 'Mathematics'")
        )
        
        # Cleanup: Ensure unique grade levels
        await conn.execute(
            text("""
                UPDATE subjects SET grade_levels = (
                    SELECT array_agg(DISTINCT x) FROM unnest(grade_levels) AS x
                ) WHERE grade_levels IS NOT NULL
            """)
        )

    await engine.dispose()
    print("Cleanup complete.")

if __name__ == "__main__":
    asyncio.run(cleanup())
