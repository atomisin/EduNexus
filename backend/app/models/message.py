import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.database import Base

class Message(Base):
    """Direct message between users (Admin, Teacher, Student)"""
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    sender = relationship("User", foreign_keys=[sender_id], backref="messages_sent", lazy="joined")
    recipient = relationship("User", foreign_keys=[recipient_id], backref="messages_received", lazy="joined")

    def to_dict(self):
        return {
            "id": str(self.id),
            "sender_id": str(self.sender_id),
            "recipient_id": str(self.recipient_id),
            "content": self.content,
            "is_read": self.is_read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat()
        }
