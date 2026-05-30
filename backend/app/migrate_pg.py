import os
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def migrate():
    # Use DATABASE_URL from environment
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found in environment!")
        return
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://").replace(
        "postgres://", "postgresql+asyncpg://"
    )

    print(f"Connecting to database...")
    try:
        engine = create_async_engine(db_url)
        async with engine.begin() as conn:
            # Check and add course_name
            try:
                await conn.execute(text("ALTER TABLE student_profiles ADD COLUMN course_name VARCHAR(255)"))
                print("Added course_name to student_profiles")
            except Exception as e:
                print(f"course_name migration info: {e}")
                
            # Check and add professional_curriculum
            try:
                await conn.execute(text("ALTER TABLE student_profiles ADD COLUMN professional_curriculum JSONB"))
                print("Added professional_curriculum to student_profiles")
            except Exception as e:
                print(f"professional_curriculum migration info: {e}")
            
            print("Migration complete!")
        await engine.dispose()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
