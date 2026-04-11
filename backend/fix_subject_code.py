import asyncio
import os
import sys
from sqlalchemy import text

# Add the parent directory to the path so we can import the app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import SessionLocal

async def fix_subject_codes_raw():
    async with SessionLocal() as session:
        migrations = [
            ("SEC-MAT-001", "ss2-mathematics"),
            ("SEC-ENG-001", "ss2-english-language"),
            ("SEC-BIO-001", "ss2-biology"),
            ("SEC-ECO-001", "ss2-economics"),
        ]
        
        for old_code, new_code in migrations:
            print(f"Migrating code from '{old_code}' to '{new_code}'")
            await session.execute(
                text("UPDATE subjects SET code = :new_code WHERE code = :old_code"),
                {"new_code": new_code, "old_code": old_code}
            )
        
        await session.commit()
        print("Successfully updated subject codes via raw SQL.")

if __name__ == "__main__":
    asyncio.run(fix_subject_codes_raw())
