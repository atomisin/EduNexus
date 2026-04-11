import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(DATABASE_URL, echo=False)

async def list_subjs():
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT name FROM subjects"))
        names = [r[0] for r in res.all()]
        print(f"Subjects: {names}")

if __name__ == "__main__":
    asyncio.run(list_subjs())
