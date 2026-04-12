from sqlalchemy.ext.asyncio import (
    create_async_engine, AsyncSession, 
    async_sessionmaker
)
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

class Base(DeclarativeBase):
    pass

ASYNC_DATABASE_URL = settings.DATABASE_URL\
    .replace("postgresql://", 
             "postgresql+asyncpg://")\
    .replace("postgres://", 
             "postgresql+asyncpg://")

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False,
    # CRITICAL: Disable prepared statements for PgBouncer compatibility
    connect_args={"statement_cache_size": 0}
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# CRITICAL: Warm up the registry by importing all models (C-03)
# This prevents "name 'X' is not defined" during mapping
def _warmup_registry():
    from app.models import (
        user, student, session, subject, assessment,
        rag_models, student_progress, notification,
        message, report, token_usage,
        junction_tables, mock_exam, subject_outline
    )
    # Force SQLAlchemy to resolve all string relationship names
    try:
        Base.registry.configure()
    except Exception:
        # Avoid crashing if registry is partially initialized in some scripts
        pass

_warmup_registry()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

# Backwards compatibility
get_async_db = get_db
SessionLocal = AsyncSessionLocal

def init_db():
    pass

# Sync engine for Alembic ONLY
# Do NOT use in application code
from sqlalchemy import create_engine as _sync_engine
sync_engine = _sync_engine(
    settings.DATABASE_URL.replace("+asyncpg", "")\
                         .replace("postgres://", "postgresql://")
)
