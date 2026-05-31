from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import datetime
import uuid
from datetime import timezone, timedelta
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from apscheduler.schedulers.asyncio import (
    AsyncIOScheduler
)
from app.core.config import settings
from app.db.database import init_db
from app.api.v1.router import api_router
from app.core.limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.db.database import AsyncSessionLocal
from app.services.brain_power import current_brain_power_date
from app.core.security import pwd_context
from app.models.user import User, UserRole, UserStatus

# CRITICAL: Import all models to ensure SQLAlchemy registry is populated (C-03)
from app.models import (
    user, student, session, subject, assessment,
    rag_models, student_progress, notification,
    message, report, token_usage, placement,
    junction_tables, mock_exam, subject_outline
)

# Configure logging
class JSONLogFormatter(logging.Formatter):
    def format(self, record):
        import json
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "name": record.name,
        }
        if hasattr(record, "request_id"):
            log_record["request_id"] = record.request_id
        if hasattr(record, "method"):
            log_record["method"] = record.method
        if hasattr(record, "path"):
            log_record["path"] = record.path
        if hasattr(record, "status_code"):
            log_record["status_code"] = record.status_code
        if hasattr(record, "duration"):
            log_record["duration"] = record.duration
        if hasattr(record, "error"):
            log_record["error"] = record.error
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record)

def setup_logging():
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(JSONLogFormatter())
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)

setup_logging()
logger = logging.getLogger(__name__)


async def _create_index_if_columns_exist(db, index_name: str, table_name: str, index_columns: str, required_columns: list[str]):
    """Create a production index only when the legacy database has the target table/columns."""
    table_exists = await db.scalar(
        text("SELECT to_regclass(:table_name) IS NOT NULL"),
        {"table_name": f"public.{table_name}"},
    )
    if not table_exists:
        return

    for column_name in required_columns:
        column_exists = await db.scalar(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = :table_name
                      AND column_name = :column_name
                )
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        )
        if not column_exists:
            return

    await db.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({index_columns})"))


async def reset_brain_power():
    """Daily cron job to reset student brain power to 100%"""
    logger.info("⚡ Resetting all students' Brain Power for the new day...")
    async with AsyncSessionLocal() as db:
        try:
            await db.execute(
                text("UPDATE student_profiles SET brain_power = 100, brain_power_reset_date = :today"),
                {"today": current_brain_power_date()},
            )
            await db.commit()
            logger.info("✅ Brain Power reset complete.")
        except Exception as e:
            logger.error(f"❌ Failed to reset Brain Power: {e}")
            await db.rollback()

async def _bootstrap_admin_from_env() -> None:
    """Create or reactivate an admin from explicit environment variables."""
    email = (settings.BOOTSTRAP_ADMIN_EMAIL or "").strip().lower()
    password = (settings.BOOTSTRAP_ADMIN_PASSWORD or "").strip()
    full_name = (settings.BOOTSTRAP_ADMIN_FULL_NAME or "EduNexus Admin").strip()
    if not email:
        return
    if not password:
        logger.warning("BOOTSTRAP_ADMIN_EMAIL is set, but BOOTSTRAP_ADMIN_PASSWORD is missing.")
        return

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(User).filter(User.email == email))
            existing = result.scalars().first()
            if existing:
                if existing.role != UserRole.ADMIN:
                    logger.warning("Bootstrap admin email already belongs to a non-admin user: %s", email)
                    return
                existing.status = UserStatus.ACTIVE
                existing.is_active = True
                existing.admin_scope = "super"
                existing.admin_permissions = ["*"]
                existing.email_verified_at = existing.email_verified_at or datetime.datetime.now(timezone.utc)
                existing.updated_at = datetime.datetime.now(timezone.utc)
                await db.commit()
                logger.info("Bootstrap admin verified/reactivated for %s", email)
                return

            username = email.split("@", 1)[0]
            username_result = await db.execute(select(User).filter(User.username == username))
            if username_result.scalars().first():
                username = f"{username}-{uuid.uuid4().hex[:6]}"

            admin = User(
                id=uuid.uuid4(),
                email=email,
                username=username,
                hashed_password=pwd_context.hash(password),
                full_name=full_name,
                first_name=full_name.split()[0] if full_name else "EduNexus",
                last_name=full_name.split()[-1] if " " in full_name else "",
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
                admin_scope="super",
                admin_permissions=["*"],
                is_active=True,
                email_verified_at=datetime.datetime.now(timezone.utc),
                force_password_change=False,
                created_at=datetime.datetime.now(timezone.utc),
                updated_at=datetime.datetime.now(timezone.utc),
            )
            db.add(admin)
            await db.commit()
            logger.info("Bootstrap admin created for %s", email)
        except Exception as exc:
            await db.rollback()
            logger.exception("Bootstrap admin failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("🚀 Starting EduNexus 2.0...")
    # C-03 Security Validation
    if not settings.SECRET_KEY:
        raise ValueError("SECRET_KEY must be set in environment")
    
    if len(settings.SECRET_KEY) < 32:
        if settings.ENVIRONMENT == "production":
            raise ValueError("SECRET_KEY must be at least 32 characters in production")

        else:
            logger.warning("⚠️ SECRET_KEY is weak (< 32 chars). For development only.")
    
    init_db()
    # HOT PATCH: Keep production tables aligned with ORM columns that were added after initial deploys.
    async with AsyncSessionLocal() as db:
        try:
            await db.execute(text("ALTER TABLE teaching_sessions ADD COLUMN IF NOT EXISTS title VARCHAR(255)"))
            await db.execute(text("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS brain_power_reset_date DATE"))
            await db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_scope VARCHAR(50)"))
            await db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions JSONB DEFAULT '[]'::jsonb"))
            super_admin_email = (
                settings.SUPER_ADMIN_EMAIL
                or settings.BOOTSTRAP_ADMIN_EMAIL
                or ""
            ).strip().lower()
            if super_admin_email:
                await db.execute(
                    text(
                        """
                        UPDATE users
                        SET admin_scope = 'super',
                            admin_permissions = '["*"]'::jsonb
                        WHERE role = 'admin'
                          AND lower(email) = :email
                        """
                    ),
                    {"email": super_admin_email},
                )
            await db.execute(text("ALTER TABLE student_topic_progress ADD COLUMN IF NOT EXISTS progress_pct INTEGER DEFAULT 0"))
            await db.execute(text("ALTER TABLE student_topic_progress ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'locked'"))
            await db.execute(text("ALTER TABLE student_topic_progress ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE"))
            await db.execute(text("ALTER TABLE student_topic_progress ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMP WITH TIME ZONE"))
            await db.execute(text("ALTER TABLE student_topic_progress ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE"))
            await db.execute(text("ALTER TABLE student_topic_progress ADD COLUMN IF NOT EXISTS subject_id UUID"))
            await db.execute(text("ALTER TABLE student_topic_progress ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"))
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS placement_question_cache (
                    id UUID PRIMARY KEY,
                    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
                    education_level VARCHAR(80) NOT NULL,
                    curriculum_hash VARCHAR(64) NOT NULL,
                    question_spec JSONB NOT NULL,
                    source VARCHAR(30) DEFAULT 'llm',
                    status VARCHAR(20) DEFAULT 'active',
                    review_notes TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_placement_question_cache_scope
                        UNIQUE (subject_id, topic_id, education_level, curriculum_hash)
                )
            """))
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS custom_course_requests (
                    id UUID PRIMARY KEY,
                    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    requested_title VARCHAR(255) NOT NULL,
                    normalized_title VARCHAR(255),
                    requested_description TEXT,
                    intended_outcome TEXT,
                    motivation TEXT,
                    status VARCHAR(50) DEFAULT 'pending_admin_review',
                    safety_status VARCHAR(50) DEFAULT 'clear',
                    safety_flags JSONB DEFAULT '[]'::jsonb,
                    suggested_courses JSONB DEFAULT '[]'::jsonb,
                    safe_alternatives JSONB DEFAULT '[]'::jsonb,
                    refined_admin_message TEXT,
                    admin_selected_suggestion VARCHAR(255),
                    approved_course_name VARCHAR(255),
                    admin_decision VARCHAR(50),
                    admin_reason TEXT,
                    reviewed_by UUID REFERENCES users(id),
                    reviewed_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS normalized_title VARCHAR(255)"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS requested_description TEXT"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS intended_outcome TEXT"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS motivation TEXT"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS safety_status VARCHAR(50) DEFAULT 'clear'"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS safety_flags JSONB DEFAULT '[]'::jsonb"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS suggested_courses JSONB DEFAULT '[]'::jsonb"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS safe_alternatives JSONB DEFAULT '[]'::jsonb"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS refined_admin_message TEXT"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS admin_selected_suggestion VARCHAR(255)"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS approved_course_name VARCHAR(255)"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS admin_decision VARCHAR(50)"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS admin_reason TEXT"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id)"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE"))
            await db.execute(text("ALTER TABLE custom_course_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"))
            await db.execute(text("""
                UPDATE student_topic_progress
                SET status = CASE
                    WHEN COALESCE(progress_pct, 0) >= 100 THEN 'completed'
                    WHEN COALESCE(progress_pct, 0) > 0 THEN 'unlocked'
                    ELSE 'locked'
                END
                WHERE status IS NULL
            """))
            await _create_index_if_columns_exist(
                db,
                "ix_notifications_user_created",
                "notifications",
                "user_id, created_at DESC",
                ["user_id", "created_at"],
            )
            await _create_index_if_columns_exist(
                db,
                "ix_student_profiles_user_id",
                "student_profiles",
                "user_id",
                ["user_id"],
            )
            await _create_index_if_columns_exist(
                db,
                "ix_teacher_students_teacher_status",
                "teacher_students",
                "teacher_id, status",
                ["teacher_id", "status"],
            )
            await _create_index_if_columns_exist(
                db,
                "ix_teacher_students_student_status",
                "teacher_students",
                "student_id, status",
                ["student_id", "status"],
            )
            await _create_index_if_columns_exist(
                db,
                "ix_student_topic_progress_student_subject",
                "student_topic_progress",
                "student_id, subject_id",
                ["student_id", "subject_id"],
            )
            await _create_index_if_columns_exist(
                db,
                "ix_student_subject_progress_student_subject",
                "student_subject_progress",
                "student_id, subject_id",
                ["student_id", "subject_id"],
            )
            await _create_index_if_columns_exist(
                db,
                "ix_topics_subject_sort",
                "topics",
                "subject_id, sort_order",
                ["subject_id", "sort_order"],
            )
            await _create_index_if_columns_exist(
                db,
                "ix_custom_course_requests_student_status",
                "custom_course_requests",
                "student_id, status",
                ["student_id", "status"],
            )
            await _create_index_if_columns_exist(
                db,
                "ix_custom_course_requests_status_created",
                "custom_course_requests",
                "status, created_at DESC",
                ["status", "created_at"],
            )
            await db.commit()
            logger.info("Database Hotpatch: production schema columns and indexes verified.")
        except Exception as e:
            logger.error(f"Database Hotpatch failed: {e}")
            await db.rollback()

    await _bootstrap_admin_from_env()
    
    # Initialize and start scheduler
    try:
        from zoneinfo import ZoneInfo
        local_tz = ZoneInfo("Africa/Lagos")
    except ImportError:
        import pytz
        local_tz = pytz.timezone("Africa/Lagos")
        
    scheduler = AsyncIOScheduler()
    scheduler.add_job(reset_brain_power, 'cron', hour=0, minute=0, timezone=local_tz)
    scheduler.start()
    app.state.scheduler = scheduler
    
    yield
    # Shutdown
    scheduler.shutdown()
    logger.info("👋 Shutting down EduNexus 2.0...")


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Private Tutoring Platform for Nigeria",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter


def _is_allowed_browser_origin(origin: str) -> bool:
    """Return True when a browser Origin is allowed to make credentialed calls."""
    allowed = settings.allowed_origins_list
    is_vercel_preview = origin.startswith("https://edu-nexus-") and origin.endswith(".vercel.app")
    wildcard_allowed = settings.ENVIRONMENT != "production" and "*" in allowed
    return origin in allowed or wildcard_allowed or is_vercel_preview


def _cors_allowed_origins() -> list[str]:
    """Do not allow wildcard credentialed CORS in production."""
    allowed = settings.allowed_origins_list
    if settings.ENVIRONMENT == "production":
        return [origin for origin in allowed if origin != "*"]
    return allowed


@app.middleware("http")
async def csrf_origin_guard(request: Request, call_next):
    """Reject cross-site state-changing browser requests before cookies authenticate them."""
    unsafe_method = request.method in {"POST", "PUT", "PATCH", "DELETE"}
    if unsafe_method and request.url.path.startswith(settings.API_V1_STR):
        origin = request.headers.get("origin")
        fetch_site = request.headers.get("sec-fetch-site")
        if origin and not _is_allowed_browser_origin(origin):
            return JSONResponse(
                status_code=403,
                content={"detail": "Cross-site request origin is not allowed."},
            )
        if not origin and fetch_site == "cross-site":
            return JSONResponse(
                status_code=403,
                content={"detail": "Cross-site request is not allowed."},
            )
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Set baseline browser security headers for all responses."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=()")
    if settings.ENVIRONMENT == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    if request.url.path.startswith("/api/v1/ai/"):
        try:
            from zoneinfo import ZoneInfo
            local_tz = ZoneInfo("Africa/Lagos")
        except ImportError:
            import pytz
            local_tz = pytz.timezone("Africa/Lagos")
            
        now_local = datetime.datetime.now(local_tz)
        tomorrow_local = now_local.date() + timedelta(days=1)
        next_midnight = datetime.datetime.combine(tomorrow_local, datetime.time.min).replace(tzinfo=local_tz).isoformat()
        resp = JSONResponse(
            status_code=429,
            content={
                "code": "BRAIN_POWER_DEPLETED",
                "detail": "Your Brain Power is fully drained "
                           "for today — which means you've been "
                           "working hard! 🧠✨ Take a well-earned "
                           "break, review what you've learned, "
                           "and come back tomorrow for a full "
                           "recharge. Your AI tutor will be "
                           "here waiting.",
                "recharge_at": next_midnight
            }
        )
        # NOTE: _add_cors_headers defined below — rate limiter is registered after
        origin = request.headers.get("origin", "")
        allowed = settings.allowed_origins_list
        if _is_allowed_browser_origin(origin):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Vary"] = "Origin"
        return resp
    return _rate_limit_exceeded_handler(request, exc)

import json
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


def _add_cors_headers(request: Request, response: JSONResponse) -> JSONResponse:
    """Inject CORS headers into exception responses.

    FastAPI custom exception handlers return JSONResponse objects that skip
    the CORSMiddleware layer entirely.  Without these headers the browser
    refuses to let the admin panel read the response body, which manifests
    as a misleading "missing Access-Control-Allow-Origin" console error.
    """
    origin = request.headers.get("origin")
    if not origin:
        return response
    if _is_allowed_browser_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Vary"] = "Origin"
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, 'request_id', 'unknown')
    resp = JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "request_id": request_id
        }
    )
    return _add_cors_headers(request, resp)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, 'request_id', 'unknown')
    # Sanitize surrogates in detail to prevent UnicodeEncodeError
    detail = exc.detail
    if isinstance(detail, (dict, list, str)):
        try:
            detail = json.loads(json.dumps(detail, ensure_ascii=True))
        except (TypeError, ValueError):
            detail = str(detail)
    resp = JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": detail,
            "request_id": request_id
        }
    )
    return _add_cors_headers(request, resp)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, 'request_id', 'unknown')
    logger.error(
        json.dumps({
            "request_id": request_id,
            "event": "unhandled_exception",
            "error": str(exc),
            "path": request.url.path
        })
    )
    resp = JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected error occurred.",
            "request_id": request_id
        }
    )
    return _add_cors_headers(request, resp)


app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)

# CORS middleware — R-01: origins from env variable
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allowed_origins(),
    allow_origin_regex=r"https://edu-nexus-.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

from app.middleware.logging_middleware import RequestLoggingMiddleware
app.add_middleware(RequestLoggingMiddleware)


@app.get("/")
async def root():
    return {
        "detail": "Welcome to EduNexus 2.0",
        "version": "2.0.0",
        "status": "operational",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "EduNexus API",
        "version": "2.0"
    }


# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Mount static files
from fastapi.staticfiles import StaticFiles
import os
os.makedirs("static/avatars", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
