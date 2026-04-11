import asyncio
from sqlalchemy import text
from app.db.database import engine

async def check():
    async with engine.connect() as conn:
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY column_name"
        ))
        cols = [r[0] for r in result]
        print(f'Total columns: {len(cols)}')
        print('force_password_change present:', 'force_password_change' in cols)

asyncio.run(check())
