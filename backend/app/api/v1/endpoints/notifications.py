from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List
import uuid
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.notification import Notification

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/")
async def get_notifications(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
    limit: int = 20
):
    """Get notifications for the current user"""
    stmt = (
        select(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    notifications = res.scalars().all()
    
    return [n.to_dict() for n in notifications]

@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a notification as read"""
    try:
        notification_uuid = uuid.UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification ID format")

    res = await db.execute(
        select(Notification).filter(
            Notification.id == notification_uuid,
            Notification.user_id == current_user.id
        )
    )
    notification = res.scalars().first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notification.is_read = True
    await db.commit()
    
    return {"success": True}

@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications for the current user as read"""
    await db.execute(
        update(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
        .values(is_read=True)
    )
    
    await db.commit()
    
    return {"success": True}
