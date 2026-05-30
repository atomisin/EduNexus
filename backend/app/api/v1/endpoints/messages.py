from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, update, func, case
from sqlalchemy.orm import noload
from typing import List
import uuid
from datetime import datetime, timezone
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole, TeacherStudent
from app.models.message import Message
from pydantic import BaseModel
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)
router = APIRouter()

class SendMessageRequest(BaseModel):
    recipient_id: str
    content: str


async def can_message_user(db: AsyncSession, sender: User, recipient: User) -> bool:
    """Allow messages only across explicit platform support/teaching relationships."""
    if sender.id == recipient.id:
        return False
    if sender.role == UserRole.ADMIN or recipient.role == UserRole.ADMIN:
        return True
    if sender.role == UserRole.TEACHER and recipient.role == UserRole.STUDENT:
        teacher_id, student_id = sender.id, recipient.id
    elif sender.role == UserRole.STUDENT and recipient.role == UserRole.TEACHER:
        teacher_id, student_id = recipient.id, sender.id
    else:
        return False

    res_link = await db.execute(
        select(TeacherStudent).filter(
            TeacherStudent.teacher_id == teacher_id,
            TeacherStudent.student_id == student_id,
            TeacherStudent.status == "active",
        )
    )
    return res_link.scalars().first() is not None


async def get_allowed_contact_ids(db: AsyncSession, current_user: User) -> set:
    if current_user.role == UserRole.ADMIN:
        res_users = await db.execute(select(User.id).filter(User.id != current_user.id))
        return set(res_users.scalars().all())

    allowed_ids = set()
    res_admins = await db.execute(select(User.id).filter(User.role == UserRole.ADMIN))
    allowed_ids.update(res_admins.scalars().all())

    if current_user.role == UserRole.STUDENT:
        res_links = await db.execute(
            select(TeacherStudent.teacher_id).filter(
                TeacherStudent.student_id == current_user.id,
                TeacherStudent.status == "active",
            )
        )
        allowed_ids.update(res_links.scalars().all())
    elif current_user.role == UserRole.TEACHER:
        res_links = await db.execute(
            select(TeacherStudent.student_id).filter(
                TeacherStudent.teacher_id == current_user.id,
                TeacherStudent.status == "active",
            )
        )
        allowed_ids.update(res_links.scalars().all())

    return allowed_ids

@router.get("/conversations")
async def get_conversations(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Get a list of users the current user has chatted with"""
    # 1. Find all user IDs involved in messages with current_user
    stmt_sent = select(Message.recipient_id).filter(Message.sender_id == current_user.id).distinct()
    stmt_received = select(Message.sender_id).filter(Message.recipient_id == current_user.id).distinct()
    
    res_sent = await db.execute(stmt_sent)
    res_received = await db.execute(stmt_received)
    
    user_ids = set([r[0] for r in res_sent.all()] + [r[0] for r in res_received.all()])

    # 2. Add default contacts: Admins
    allowed_contact_ids = await get_allowed_contact_ids(db, current_user)
    user_ids.update(allowed_contact_ids)

    user_ids = {uid for uid in user_ids if uid in allowed_contact_ids}
    contacts = []
    if user_ids:
        res_users = await db.execute(
            select(User.id, User.full_name, User.role, User.avatar_url)
            .filter(User.id.in_(user_ids))
        )
        users_by_id = {row.id: row for row in res_users.all()}

        partner_id = case(
            (Message.sender_id == current_user.id, Message.recipient_id),
            else_=Message.sender_id,
        ).label("partner_id")
        ranked_messages = (
            select(
                partner_id,
                Message.content,
                Message.created_at,
                func.row_number()
                .over(partition_by=partner_id, order_by=Message.created_at.desc())
                .label("row_number"),
            )
            .filter(
                or_(
                    and_(
                        Message.sender_id == current_user.id,
                        Message.recipient_id.in_(user_ids),
                    ),
                    and_(
                        Message.sender_id.in_(user_ids),
                        Message.recipient_id == current_user.id,
                    ),
                )
            )
            .subquery()
        )
        res_last_messages = await db.execute(
            select(
                ranked_messages.c.partner_id,
                ranked_messages.c.content,
                ranked_messages.c.created_at,
            ).filter(ranked_messages.c.row_number == 1)
        )
        last_messages = {
            row.partner_id: row
            for row in res_last_messages.all()
        }

        res_unread_counts = await db.execute(
            select(Message.sender_id, func.count(Message.id).label("unread_count"))
            .filter(
                Message.sender_id.in_(user_ids),
                Message.recipient_id == current_user.id,
                Message.is_read == False,
            )
            .group_by(Message.sender_id)
        )
        unread_counts = {
            row.sender_id: row.unread_count
            for row in res_unread_counts.all()
        }

        for uid, user in users_by_id.items():
            last_msg = last_messages.get(uid)
            role_value = user.role.value if hasattr(user.role, "value") else user.role
            
            contacts.append({
                "user_id": str(user.id),
                "name": user.full_name,
                "role": role_value,
                "last_message": last_msg.content if last_msg else "",
                "last_message_time": last_msg.created_at.isoformat() if last_msg else None,
                "unread_count": unread_counts.get(uid, 0),
                "avatar_url": storage_service.resolve_url(user.avatar_url)
            })
            
    return sorted(contacts, key=lambda x: x['last_message_time'] or "", reverse=True)

@router.get("/{other_user_id}")
async def get_messages(
    other_user_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
    limit: int = 50
):
    """Get messages between current user and another user"""
    try:
        other_uuid = uuid.UUID(other_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    res_other = await db.execute(
        select(User)
        .options(noload("*"))
        .filter(User.id == other_uuid)
    )
    other_user = res_other.scalars().first()
    if not other_user or not await can_message_user(db, current_user, other_user):
        raise HTTPException(status_code=403, detail="You cannot message this user")

    stmt = (
        select(Message)
        .options(noload("*"))
        .filter(
            or_(
                and_(Message.sender_id == current_user.id, Message.recipient_id == other_uuid),
                and_(Message.sender_id == other_uuid, Message.recipient_id == current_user.id)
            )
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    
    res = await db.execute(stmt)
    messages = res.scalars().all()
    
    # Mark as read
    await db.execute(
        update(Message)
        .filter(
            Message.sender_id == other_uuid,
            Message.recipient_id == current_user.id,
            Message.is_read == False
        )
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    
    return [m.to_dict() for m in reversed(messages)]

@router.post("/")
async def send_message(
    request: SendMessageRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Send a direct message"""
    try:
        recipient_uuid = uuid.UUID(request.recipient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid recipient ID format")

    res_recipient = await db.execute(
        select(User)
        .options(noload("*"))
        .filter(User.id == recipient_uuid)
    )
    recipient = res_recipient.scalars().first()
    if not recipient or not await can_message_user(db, current_user, recipient):
        raise HTTPException(status_code=403, detail="You cannot message this user")

    message = Message(
        id=uuid.uuid4(),
        sender_id=current_user.id,
        recipient_id=recipient_uuid,
        content=request.content,
        created_at=datetime.now(timezone.utc),
        is_read=False
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    
    return message.to_dict()

@router.get("/contacts/search")
async def search_contacts(
    query: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Search for users to start a conversation with"""
    allowed_contact_ids = await get_allowed_contact_ids(db, current_user)
    if not allowed_contact_ids:
        return []

    stmt = select(User.id, User.full_name, User.role, User.avatar_url).filter(
        User.id.in_(allowed_contact_ids),
        User.id != current_user.id,
        or_(
            User.full_name.ilike(f"%{query}%"),
            User.email.ilike(f"%{query}%")
        )
    ).limit(10)
    
    res = await db.execute(stmt)
    users = res.all()
    
    return [
        {
            "id": str(u.id), 
            "name": u.full_name, 
            "role": u.role.value if hasattr(u.role, "value") else u.role, 
            "avatar_url": storage_service.resolve_url(u.avatar_url)
        } for u in users
    ]
