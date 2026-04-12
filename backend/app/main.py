from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import datetime
from datetime import timezone, timedelta
from sqlalchemy import text
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


async def reset_brain_power():
    """Daily cron job to reset student brain power to 100%"""
    logger.info("⚡ Resetting all students' Brain Power for the new day...")
    async with AsyncSessionLocal() as db:
        try:
            await db.execute(text("UPDATE student_profiles SET brain_power = 100"))
            await db.commit()
            logger.info("✅ Brain Power reset complete.")
        except Exception as e:
            logger.error(f"❌ Failed to reset Brain Power: {e}")
            await db.rollback()

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
        if origin in allowed or "*" in allowed:
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
    allowed = settings.allowed_origins_list
    # Allow explicit origins or anything matching our Vercel pattern
    is_vercel_preview = ".vercel.app" in origin and "edu-nexus" in origin
    if origin in allowed or "*" in allowed or is_vercel_preview:
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
    allow_origins=settings.allowed_origins_list,
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
