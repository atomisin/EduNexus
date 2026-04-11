import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float
from sqlalchemy.dialects.postgresql import UUID
from app.db.database import Base

class TokenUsageLog(Base):
    __tablename__ = "token_usage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    model = Column(String(100), nullable=False)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    cost_microdollars = Column(
        Integer, 
        nullable=True,
        comment="Cost in USD microdollars. Divide by 1,000,000 for USD."
    )
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
