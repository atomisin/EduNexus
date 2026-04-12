import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import Base
from app.core.config import settings

# Import all models to ensure they are registered with Base.metadata
from app.models import (
    user, student, session, subject, assessment,
    rag_models, student_progress, notification,
    message, report, token_usage,
    junction_tables, mock_exam, subject_outline
)

async def force_sync():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found in environment!")
        return

    # Ensure we use an async driver
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    
    print(f"Connecting to database to create tables...")
    
    # Use the same hardening as database.py
    engine = create_async_engine(
        db_url, 
        connect_args={"statement_cache_size": 0}
    )
    
    async with engine.begin() as conn:
        # 1. Enable extensions
        print("Enabling extensions...")
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))
        
        # 2. Create tables
        print("Creating all tables from metadata...")
        # run_sync allows running synchronous metadata.create_all in an async context
        await conn.run_sync(Base.metadata.create_all)
        
    await engine.dispose()
    print("Database sync complete!")

if __name__ == "__main__":
    asyncio.run(force_sync())
