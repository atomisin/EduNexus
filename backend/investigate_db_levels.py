import asyncio
from app.db.database import AsyncSessionLocal
from app.models.subject import Subject
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Subject.education_level).distinct())
        print('Education Levels in DB:', res.fetchall())

if __name__ == "__main__":
    asyncio.run(run())
