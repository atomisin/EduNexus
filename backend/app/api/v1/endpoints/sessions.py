from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
    Query,
    Request,
    BackgroundTasks,
)
from app.core.limiter import limiter
from slowapi.util import get_remote_address
import asyncio
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
import json
import logging

from app.db.database import get_async_db
from app.core.config import settings
from app.api.v1.endpoints.auth import (
    get_current_user,
    get_current_teacher,
    verify_token,
)
from app.models.user import User, UserRole
from app.models.session import (
    TeachingSession,
    SessionStudent,
    SessionStatus,
    SessionType,
    AIConfigModel,
    CreateSessionRequest,
    UpdateSessionRequest,
    SessionResponse,
)
from app.services.session_manager import SessionManager

logger = logging.getLogger(__name__)
router = APIRouter()


# TODO: Move active_connections to Redis Pub/Sub for horizontal scalability
active_connections: Dict[str, Dict[str, WebSocket]] = {}


async def heartbeat_task(websocket: WebSocket, session_id: str):
    """
    Background heartbeat task to keep connection alive and detect stale drops.
    Sends ping every 30s. Closes connection if pong not received within 10s.
    """
    try:
        while True:
            await asyncio.sleep(30)

            websocket.state.ping_sent_at = datetime.now(timezone.utc)

            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break

            await asyncio.sleep(10)

            last_pong = getattr(websocket.state, "last_pong", None)
            ping_sent = getattr(websocket.state, "ping_sent_at", None)

            if not last_pong or last_pong < ping_sent:
                logger.warning(f"Heartbeat timeout for session {session_id}")
                try:
                    await websocket.close(code=1008)
                except Exception:
                    pass
                break
    except Exception as e:
        logger.error(f"Heartbeat task error: {str(e)}")


class SessionCreate(BaseModel):
    title: str
    subject_id: Optional[str] = None
    topic: Optional[str] = None
    session_type: str = "tutoring"


class SessionAIConfigUpdate(BaseModel):
    llm_enabled: Optional[bool] = None
    tts_enabled: Optional[bool] = None
    stt_enabled: Optional[bool] = None
    llm_model: Optional[str] = None


class QuizSubmission(BaseModel):
    quiz_type: str  # "pre", "post", or "live_pop"
    answers: Dict[int, int]


class VideoFrameSubmission(BaseModel):
    student_id: str
    frame_data: str  # Base64


class ContentPushRequest(BaseModel):
    content_type: str  # "pop_quiz" or "notes"
    content: Any
    target_student_id: Optional[str] = None


@router.get("/", response_model=List[dict])
async def get_sessions(
    session_status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's sessions (both teacher and student)"""
    try:
        manager = SessionManager(db)

        # Check if user is teacher or student
        if current_user.role in ["teacher", "admin"]:
            sessions = await manager.get_teacher_sessions(
                teacher_id=str(current_user.id),
                status=session_status,
                limit=limit,
                offset=offset,
            )
        else:
            sessions = await manager.get_student_sessions(
                student_id=str(current_user.id),
                status=session_status,
                limit=limit,
                offset=offset,
            )

        return [session.to_dict() for session in sessions]
    except Exception as e:
        logger.error(f"Error listing sessions: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list sessions: {str(e)}",
        )


@router.get("/my", response_model=List[dict])
async def get_my_sessions(
    session_status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's sessions (alias for /)"""
    try:
        manager = SessionManager(db)

        if current_user.role in ["teacher", "admin"]:
            sessions = await manager.get_teacher_sessions(
                teacher_id=str(current_user.id),
                status=session_status,
                limit=limit,
                offset=offset,
            )
        else:
            sessions = await manager.get_student_sessions(
                student_id=str(current_user.id),
                status=session_status,
                limit=limit,
                offset=offset,
            )

        return [session.to_dict() for session in sessions]
    except Exception as e:
        logger.error(f"Error getting my sessions: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sessions: {str(e)}",
        )


@router.post("/", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Create a new teaching session with AI orchestration support"""
    try:
        manager = SessionManager(db)

        if not request.ai_config:
            request.ai_config = AIConfigModel()

        session = await manager.create_session(
            teacher_id=str(current_user.id), request=request, background_tasks=background_tasks
        )

        return SessionResponse(
            success=True,
            message="Session created successfully",
            session=session.to_dict(),
        )
    except Exception as e:
        logger.error(f"Error creating session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create session: {str(e)}",
        )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Get session details with full context"""
    try:
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )

        # Check access using relational table
        is_teacher = str(session.teacher_id) == str(current_user.id)
        if not is_teacher:
            is_enrolled, _ = await manager.is_student_enrolled(
                session_id, str(current_user.id)
            )
            if not is_enrolled:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
                )

        return SessionResponse(success=True, session=session.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session: {str(e)}",
        )


@router.post("/{session_id}/start", response_model=SessionResponse)
async def start_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Start a teaching session - initializes LiveKit room and AI services"""
    try:
        manager = SessionManager(db)

        session = await manager._get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        session = await manager.start_session(session_id)

        return SessionResponse(
            success=True,
            message="Session started successfully",
            session=session.to_dict(),
            livekit_room_name=session.livekit_room_name,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error starting session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start session: {str(e)}",
        )


@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """End a session - generates summary and assignments"""
    try:
        manager = SessionManager(db)

        session = await manager._get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        session = await manager.end_session(session_id)

        return SessionResponse(
            success=True,
            detail="Session ended successfully",
            session=session.to_dict(),
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error ending session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to end session: {str(e)}",
        )


@router.post("/{session_id}/pause", response_model=SessionResponse)
async def pause_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Pause a live session"""
    try:
        manager = SessionManager(db)

        session = await manager._get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        session = await manager.pause_session(session_id)

        return SessionResponse(
            success=True, detail="Session paused", session=session.to_dict()
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error pausing session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to pause session: {str(e)}",
        )


@router.post("/{session_id}/resume", response_model=SessionResponse)
async def resume_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Resume a paused session"""
    try:
        manager = SessionManager(db)

        session = await manager._get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        session = await manager.resume_session(session_id)

        return SessionResponse(
            success=True, detail="Session resumed", session=session.to_dict()
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error resuming session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resume session: {str(e)}",
        )


@router.get("/{session_id}/token", response_model=dict)
async def get_session_token(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get LiveKit token for joining a session.
    Session membership is verified via session_students relational table for students,
    and session.teacher_id for teachers.
    """
    try:
        manager = SessionManager(db)

        session = await manager._get_session(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )

        is_teacher = str(session.teacher_id) == str(current_user.id)
        if not is_teacher:
            is_enrolled, source = await manager.is_student_enrolled(
                session_id, str(current_user.id)
            )
            if not is_enrolled:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a participant in this session",
                )

        if current_user.role == UserRole.TEACHER:
            token = await manager.get_teacher_token(session_id, str(current_user.id))
        else:
            token = await manager.get_student_token(session_id, str(current_user.id))

        return {"token": token, "room_name": f"edunexus-session-{session_id}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session token: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{session_id}/join", response_model=SessionResponse)
async def join_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Student joins a session"""
    try:
        manager = SessionManager(db)

        session = await manager._get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Check enrollment using relational table (with legacy context fallback)
        is_enrolled, source = await manager.is_student_enrolled(
            session_id, str(current_user.id)
        )

        if not is_enrolled:
            raise HTTPException(status_code=403, detail="Not enrolled in this session")

        session = await manager.student_join(session_id, str(current_user.id))

        return SessionResponse(
            success=True,
            detail="Joined session successfully",
            session=session.to_dict(),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to join session: {str(e)}",
        )


@router.post("/{session_id}/leave", response_model=SessionResponse)
async def leave_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Student leaves a session"""
    try:
        manager = SessionManager(db)
        session = await manager.student_leave(session_id, str(current_user.id))

        return SessionResponse(
            success=True, detail="Left session successfully", session=session.to_dict()
        )
    except Exception as e:
        logger.error(f"Error leaving session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to leave session: {str(e)}",
        )


@router.get("/last-history", response_model=Dict[str, Any])
async def get_last_session_history(
    subject_id: str,
    student_ids: str,  # Comma separated
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Fetch the most recent session's continuity notes for a subject/student group"""
    try:
        manager = SessionManager(db)
        s_ids = student_ids.split(",")
        last_session = await manager.get_last_session_for_context(
            teacher_id=str(current_user.id), subject_id=subject_id, student_ids=s_ids
        )

        if not last_session:
            return {"found": False}

        return {
            "found": True,
            "session_id": str(last_session.id),
            "continuity_notes": last_session.continuity_notes,
            "topic_name": last_session.topic.name if last_session.topic else None,
            "actual_end": last_session.actual_end.isoformat()
            if last_session.actual_end
            else None,
        }
    except Exception as e:
        logger.error(f"Error fetching last session history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prepare-lesson/{student_id}/{subject_id}", response_model=dict)
async def prepare_smart_lesson(
    student_id: str,
    subject_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """
    Generate AI-driven lesson preparation materials (Outline, Quiz, Assignment)
    for a specific student and subject.
    """
    try:
        manager = SessionManager(db)
        result = await manager.prepare_smart_lesson(
            teacher_id=str(current_user.id),
            student_id=student_id,
            subject_id=subject_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error preparing smart lesson: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/push-content", response_model=dict)
async def push_session_content(
    session_id: str,
    request: ContentPushRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """
    Teacher pushes content (Pop Quiz or Notes) to a student's screen in real-time.
    """
    try:
        from app.services.websocket_manager import websocket_manager, WebSocketMessage, MessageType

        manager = SessionManager(db)
        session = await manager._get_session(session_id)
        if not session or str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        # Save to context so students can retrieve/submit later if they miss the WS message
        if request.content_type == "pop_quiz":
            session.context["active_pop_quiz"] = request.content
            msg_type = MessageType.CONTENT_SHARED  # We'll map this in Task 3
        else:
            session.context["active_notes"] = request.content
            msg_type = MessageType.CONTENT_SHARED

        # Force context update
        session.context = dict(session.context)
        await db.commit()

        # Broadcast via WebSocket
        room = websocket_manager.rooms.get(session_id)
        if room:
            message = WebSocketMessage(
                type=msg_type,
                payload={
                    "content_type": request.content_type,
                    "content": request.content,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                sender_id=str(current_user.id),
                sender_name=current_user.full_name or "Teacher",
                sender_role="teacher",
                session_id=session_id
            )
            
            if request.target_student_id:
                # Send to specific student
                await room.send_to_user(request.target_student_id, message)
            else:
                # Broadcast to all students
                await room.broadcast_to_students(message)

        # Send to student inbox (Notifications)
        from app.models.notification import Notification
        
        student_ids = []
        if request.target_student_id:
            student_ids.append(uuid.UUID(request.target_student_id))
        else:
            stmt = select(SessionStudent.student_id).filter(SessionStudent.session_id == uuid.UUID(session_id))
            res = await db.execute(stmt)
            student_ids = res.scalars().all()
            
        content_label = request.content_type.replace('_', ' ').title()
        for sid in student_ids:
            notif = Notification(
                user_id=sid,
                type="content_shared",
                title=f"New {content_label} Shared",
                message=f"Your teacher has shared a new {content_label} with you from the live session.",
                link=f"/student", # Route to dashboard
                created_at=datetime.now(timezone.utc)
            )
            db.add(notif)
            
        await db.commit()

        return {"success": True, "detail": f"Content {request.content_type} pushed successfully"}
    except Exception as e:
        logger.error(f"Error pushing content: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/generate-outline", response_model=dict)
async def generate_session_outline(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Generate a teacher-facing session outline"""
    try:
        manager = SessionManager(db)
        session = await manager._get_session(session_id)
        if not session or str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        outline = await manager._generate_session_outline(session)
        session.session_outline = outline
        await db.commit()
        return {"success": True, "outline": outline}
    except Exception as e:
        logger.error(f"Error generating outline: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/share-notes", response_model=dict)
async def share_class_notes(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Mark session notes as shared with students"""
    try:
        manager = SessionManager(db)
        session = await manager._get_session(session_id)
        if not session or str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        session.notes_shared_with_students = True
        await db.commit()

        # In a real app, we might trigger an email/PDF generation here
        return {"success": True, "detail": "Notes shared with student inbox"}
    except Exception as e:
        logger.error(f"Error sharing notes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{session_id}", response_model=dict)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Delete a teaching session and its related data"""
    try:
        manager = SessionManager(db)
        session = await manager._get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        success = await manager.delete_session(session_id)
        return {"success": success, "detail": "Session deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session: {str(e)}",
        )


@router.post("/{session_id}/engagement/participation", response_model=SessionResponse)
async def record_participation(
    session_id: str,
    event_type: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Record student participation event"""
    try:
        manager = SessionManager(db)
        session = await manager.record_participation(
            session_id=session_id,
            student_id=str(current_user.id),
            event_type=event_type,
        )
        return SessionResponse(
            success=True, detail=f"Recorded {event_type}", session=session.to_dict()
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error recording participation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record participation: {str(e)}",
        )


@router.post("/{session_id}/engagement/tab-switch", response_model=SessionResponse)
async def record_tab_switch(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Record student tab switch event"""
    try:
        manager = SessionManager(db)
        session = await manager.record_tab_switch(
            session_id=session_id, student_id=str(current_user.id)
        )
        return SessionResponse(
            success=True, detail="Recorded tab switch", session=session.to_dict()
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error recording tab switch: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record tab switch: {str(e)}",
        )


@router.post("/{session_id}/submit-quiz", response_model=dict)
async def submit_quiz(
    session_id: str,
    submission: QuizSubmission,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Student submits answers to pre/post session quiz"""
    try:
        manager = SessionManager(db)
        if submission.quiz_type == "live_pop":
            result = await manager.submit_live_quiz(
                session_id=session_id,
                student_id=str(current_user.id),
                answers=submission.answers
            )
        else:
            result = await manager.submit_quiz_answers(
                session_id=session_id,
                student_id=str(current_user.id),
                quiz_type=submission.quiz_type,
                answers=submission.answers,
            )
        return {
            "success": True,
            "detail": "Quiz submitted and scored successfully",
            "result": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error submitting quiz: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit quiz: {str(e)}",
        )


@router.post("/{session_id}/engagement/video-frame", response_model=dict)
async def submit_video_frame(
    session_id: str,
    submission: VideoFrameSubmission,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a video frame for engagement analysis"""
    try:
        manager = SessionManager(db)
        # Verify student is in session
        session = await manager._get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Process frame (this would ideally be async/backgrounded)
        metrics = await manager.process_video_frame(
            session_id=session_id,
            student_id=submission.student_id,
            frame_data=submission.frame_data,
        )

        return {"success": True, "metrics": metrics.to_dict() if metrics else None}
    except Exception as e:
        logger.error(f"Error processing video frame: {str(e)}")
        # Don't fail the request, just log
        return {"success": False, "error": str(e)}


@router.get("/{session_id}/engagement/report", response_model=dict)
async def get_engagement_report(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Get full engagement report for teacher"""
    try:
        manager = SessionManager(db)
        report = await manager.get_engagement_report(session_id)
        return {"success": True, "report": report}
    except Exception as e:
        logger.error(f"Error getting engagement report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{session_id}/ai-config", response_model=SessionResponse)
async def update_ai_config(
    session_id: str,
    config_data: SessionAIConfigUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_teacher),
):
    """Update AI configuration for session"""
    try:
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        # Update AI config
        ai_config = AIConfigModel(**session.ai_config)

        if config_data.llm_enabled is not None:
            ai_config.llm_enabled = config_data.llm_enabled
        if config_data.tts_enabled is not None:
            ai_config.tts_enabled = config_data.tts_enabled
        if config_data.stt_enabled is not None:
            ai_config.stt_enabled = config_data.stt_enabled

        session.ai_config = ai_config.dict()
        await db.commit()
        await db.refresh(session)

        return SessionResponse(
            success=True, detail="AI configuration updated", session=session.to_dict()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating AI config: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update AI config: {str(e)}",
        )


# WebSocket endpoints for real-time communication
@router.websocket("/ws/{session_id}/teacher")
async def teacher_websocket(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
):
    """
    WebSocket for teacher dashboard - real-time updates
    """
    # C-08: Authenticate WebSocket connection
    # Check query param OR cookie
    final_token = token or websocket.cookies.get("access_token")
    if not final_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        # Removed local import of verify_token
        user = await verify_token(final_token, db)
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        user_id = str(user.id)

        sess_res = await db.execute(
            select(TeachingSession).filter(TeachingSession.id == uuid.UUID(session_id))
        )
        session = sess_res.scalars().first()

        if not user or not session or str(session.teacher_id) != user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    # Store connection
    if session_id not in active_connections:
        active_connections[session_id] = {}
    active_connections[session_id]["teacher"] = websocket

    # Start heartbeat task
    heartbeat = asyncio.create_task(heartbeat_task(websocket, session_id))

    try:
        while True:
            # Receive messages from teacher
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "pong":
                websocket.state.last_pong = datetime.now(timezone.utc)
                continue

            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

            # Broadcast to students if needed
            if "students" in active_connections.get(session_id, {}):
                for student_ws in active_connections[session_id]["students"].values():
                    await student_ws.send_json(message)

    except WebSocketDisconnect:
        # Remove connection
        if (
            session_id in active_connections
            and "teacher" in active_connections[session_id]
        ):
            del active_connections[session_id]["teacher"]
            # Clean up empty session dict
            if not active_connections[session_id]:
                del active_connections[session_id]

        if not heartbeat.done():
            heartbeat.cancel()
        logger.info(f"Teacher disconnected from session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await websocket.close()


@router.websocket("/ws/{session_id}/student/{student_id}")
async def student_websocket(
    websocket: WebSocket,
    session_id: str,
    student_id: str,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
):
    """
    WebSocket for student - real-time updates
    """
    # C-08: Authenticate WebSocket connection
    final_token = token or websocket.cookies.get("access_token")
    if not final_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        # Removed local import of verify_token
        user = await verify_token(final_token, db)
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        user_id = str(user.id)

        # Verify user matches student_id and is enrolled in the session
        if user_id != student_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        res_enroll = await db.execute(
            select(SessionStudent).filter(
                SessionStudent.session_id == uuid.UUID(session_id),
                SessionStudent.student_id == uuid.UUID(student_id),
            )
        )
        enrollment = res_enroll.scalars().first()
        if not enrollment:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    # Store connection
    if session_id not in active_connections:
        active_connections[session_id] = {}
    if "students" not in active_connections[session_id]:
        active_connections[session_id]["students"] = {}
    active_connections[session_id]["students"][student_id] = websocket

    # Start heartbeat task
    heartbeat = asyncio.create_task(heartbeat_task(websocket, session_id))

    try:
        while True:
            # Receive messages from student
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "pong":
                websocket.state.last_pong = datetime.now(timezone.utc)
                continue

            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif message.get("type") == "raise_hand":
                # Notify teacher
                if "teacher" in active_connections.get(session_id, {}):
                    await active_connections[session_id]["teacher"].send_json(
                        {"type": "student_raised_hand", "student_id": student_id}
                    )
            elif message.get("type") == "chat_message":
                # Forward to teacher and all students
                broadcast_message = {
                    "type": "chat_message",
                    "student_id": student_id,
                    "message": message.get("message"),
                }

                # Send to teacher
                if "teacher" in active_connections.get(session_id, {}):
                    await active_connections[session_id]["teacher"].send_json(
                        broadcast_message
                    )

                # Send to other students
                if "students" in active_connections.get(session_id, {}):
                    for sid, student_ws in active_connections[session_id][
                        "students"
                    ].items():
                        if sid != student_id:
                            await student_ws.send_json(broadcast_message)

    except WebSocketDisconnect:
        # Remove connection
        if (
            session_id in active_connections
            and "students" in active_connections[session_id]
            and student_id in active_connections[session_id]["students"]
        ):
            del active_connections[session_id]["students"][student_id]
            # Clean up empty students dict
            if not active_connections[session_id]["students"]:
                del active_connections[session_id]["students"]
            # Clean up empty session dict
            if not active_connections[session_id]:
                del active_connections[session_id]

        if not heartbeat.done():
            heartbeat.cancel()
        logger.info(f"Student {student_id} disconnected from session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await websocket.close()


# Endpoint for students to join using access code (no auth required)
class JoinByCodeRequest(BaseModel):
    access_code: str
    student_name: str


@router.post("/join-by-code")
# Intent: Prevent brute-force enumeration of access codes while allowing legitimate students to join
@limiter.limit("3/minute", key_func=get_remote_address)
async def join_session_by_code(
    request: JoinByCodeRequest,
    req: Request,
    db: AsyncSession = Depends(get_async_db),
):
    """
    Join a session using the student access code.
    For teacher-linked students who don't have portal login.
    """
    # Find session by access code
    sess_res = await db.execute(
        select(TeachingSession).filter(
            TeachingSession.student_access_code == request.access_code.upper(),
            TeachingSession.student_access_enabled == True,
            TeachingSession.status.in_(["scheduled", "live"]),
        )
    )
    session = sess_res.scalars().first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired session code. Please check with your teacher.",
        )

    # Check if session is active
    if session.status == "scheduled":
        # Check if session time is within 15 minutes
        from datetime import timedelta

        time_diff = session.scheduled_start - datetime.now(timezone.utc)
        if time_diff > timedelta(minutes=15):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session has not started yet. Please join closer to the scheduled time.",
            )

    # Generate a simple token for the student (not a real JWT, just for WebSocket identification)
    student_token = f"guest_{uuid.uuid4().hex[:12]}"

    return {
        "success": True,
        "detail": "Access granted",
        "session": {
            "id": str(session.id),
            "title": session.context.get("title", "Live Session"),
            "subject": session.subject.name if session.subject else None,
            "topic": session.topic.name if session.topic else None,
            "status": session.status,
            "teacher_name": session.teacher.full_name if session.teacher else "Teacher",
            "scheduled_start": session.scheduled_start.isoformat()
            if session.scheduled_start
            else None,
            "duration_minutes": session.duration_minutes,
            "livekit_room_name": session.livekit_room_name,
        },
        "student_token": student_token,
    }


@router.get("/verify-code/{access_code}")
# Intent: Prevent automated scraping and brute-forcing of active session codes
@limiter.limit("5/minute", key_func=get_remote_address)
async def verify_session_code(
    access_code: str,
    request: Request,
    db: AsyncSession = Depends(get_async_db),
):
    """
    Verify a session access code and return session info (for join page preview)
    """
    sess_res = await db.execute(
        select(TeachingSession).filter(
            TeachingSession.student_access_code == access_code.upper(),
            TeachingSession.student_access_enabled == True,
        )
    )
    session = sess_res.scalars().first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid session code",
        )

    return {
        "valid": True,
        "session": {
            "id": str(session.id),
            "title": session.context.get("title", "Live Session"),
            "subject": session.subject.name if session.subject else None,
            "teacher_name": session.teacher.full_name if session.teacher else "Teacher",
            "scheduled_start": session.scheduled_start.isoformat()
            if session.scheduled_start
            else None,
            "status": session.status,
        },
    }
