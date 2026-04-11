import asyncio
from sqlalchemy import text
from app.db.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text("SET session_replication_role = 'replica'"))
            await session.execute(text("DELETE FROM users WHERE role != 'admin'"))
            await session.execute(text("SET session_replication_role = 'origin'"))
            await session.commit()
            print("Cleanup successful.")
        except Exception as e:
            await session.rollback()
            print(f"Cleanup failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
