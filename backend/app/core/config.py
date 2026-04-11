from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from functools import lru_cache
from typing import Optional, List, Any


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "EduNexus 2.0"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Security
    SECRET_KEY: Optional[str] = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/edunexus"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Keycloak removed

    # AI Services
    OLLAMA_URL: str = "http://localhost:11434"
    DEFAULT_LLM_MODEL: str = "tinyllama"
    EMBEDDING_MODEL: str = "nomic-embed-text"

    # LiteLLM Configuration
    LLM_PRIMARY_MODEL: str = "groq/llama-3.1-70b-versatile"
    LLM_FAST_MODEL: str = "groq/llama-3.1-8b-instant"
    OPENAI_API_KEY: str = ""
    LLM_FALLBACK_MODEL: str = "gpt-4o-mini"
    LLM_MAX_RETRIES: int = 2
    LLM_TIMEOUT_SECONDS: int = 30
    
    # Legacy Groq Configuration (Kept for compatibility)
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.1-8b-instant"

    # Weaviate removed

    # Storage (SeaweedFS / S3)
    STORAGE_ENDPOINT: str = "localhost:8333"
    STORAGE_PUBLIC_URL: Optional[str] = None # For browser access (e.g., http://localhost:8333)
    STORAGE_ACCESS_KEY: str = "admin"
    STORAGE_SECRET_KEY: str = "admin"
    STORAGE_BUCKET: str = "edunexus"
    STORAGE_USE_SSL: bool = False



    # LiveKit
    LIVEKIT_URL: Optional[str] = None
    LIVEKIT_API_KEY: Optional[str] = None
    LIVEKIT_API_SECRET: Optional[str] = None

    # AI Features
    AI_FEATURES_ENABLED: bool = True
    TTS_ENABLED: bool = True
    STT_ENABLED: bool = True

    # Nigerian Languages Support
    SUPPORTED_LANGUAGES: list = ["en", "ha", "yo", "ig", "pcm"]
    DEFAULT_LANGUAGE: str = "en"

    # YouTube API
    YOUTUBE_API_KEY: Optional[str] = None

    # Email / SMTP Configuration
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_FROM_EMAIL: str = "noreply@edunexus.ai"
    SMTP_FROM_NAME: str = "EduNexus"

    # Email Verification
    VERIFICATION_ENABLED: bool = True
    VERIFICATION_BYPASS: bool = False
    VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24
    APP_BASE_URL: str = "http://localhost:5174"

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:5174"
    
    ALLOWED_ORIGINS: Any = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            # Try JSON array first
            if v.startswith("["):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            # Fall back to comma-separated
            return [
                i.strip()
                for i in v.split(",")
                if i.strip()
            ]
        return v
    
    @property
    def allowed_origins_list(self) -> list[str]:
        return self.ALLOWED_ORIGINS

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
