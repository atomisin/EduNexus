"""
WebSocket & Real-Time API Endpoints
Complete WebSocket infrastructure for real-time communication
"""

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import json
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user, verify_token
from app.models.user import User
from app.services.websocket_manager import (
    websocket_manager, WebSocketMessage, MessageType, Connection
)
from app.services.session_manager import SessionManager
from app.services.engagement_tracker import engagement_tracker

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/sessions/{session_id}/teacher")
async def teacher_websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None), # JWT token for authentication
    db: AsyncSession = Depends(get_async_db)
):
    """
    WebSocket endpoint for teacher dashboard
    Real-time updates: AI explanations, engagement metrics, student interactions (C-08 Secured)
    """
    # Authenticate teacher
    try:
        # Removed local import of verify_token
        # Check query param OR cookie
        final_token = token or websocket.cookies.get("access_token")
        if not final_token:
            await websocket.close(code=4001, reason="Unauthorized")
            return
            
        current_user = await verify_token(final_token, db)
        if not current_user or current_user.role not in ['teacher', 'admin']:
            await websocket.close(code=4001, reason="Unauthorized")
            return
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
        await websocket.close(code=4001, reason="Authentication failed")
        return
    
    # Verify session ownership
    manager = SessionManager(db)
    session = await manager._get_session(session_id)
    
    if not session or str(session.teacher_id) != str(current_user.id):
        await websocket.close(code=4004, reason="Session not found or access denied")
        return
    
    # Connect to WebSocket manager
    connection = await websocket_manager.connect(
        websocket=websocket,
        session_id=session_id,
        user_id=str(current_user.id),
        user_name=current_user.full_name or current_user.email,
        user_role="teacher"
    )
    
    try:
        while True:
            # Receive message from teacher
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Handle message
            await websocket_manager.handle_message(
                session_id=session_id,
                user_id=str(current_user.id),
                data=message_data
            )
            
    except WebSocketDisconnect:
        logger.info(f"Teacher {current_user.email} disconnected from session {session_id}")
        await websocket_manager.disconnect(session_id, str(current_user.id))
    except Exception as e:
        logger.error(f"Teacher WebSocket error: {e}")
        await websocket.close()


@router.websocket("/ws/sessions/{session_id}/student")
async def student_websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db)
):
    """
    WebSocket endpoint for students
    Real-time updates: Explanations, chat, session events (C-08 Secured)
    """
    # Authenticate student
    try:
        # Removed local import of verify_token
        # Check query param OR cookie
        final_token = token or websocket.cookies.get("access_token")
        if not final_token:
            await websocket.close(code=4001, reason="Unauthorized")
            return

        current_user = await verify_token(final_token, db)
        if not current_user:
            await websocket.close(code=4001, reason="Unauthorized")
            return
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
        await websocket.close(code=4001, reason="Authentication failed")
        return
    
    # Verify enrollment
    manager = SessionManager(db)
    session = await manager._get_session(session_id)
    
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return
    
    enrolled = session.context.get("enrolled_students", [])
    if str(current_user.id) not in enrolled:
        await websocket.close(code=4003, reason="Not enrolled in this session")
        return
    
    # Connect to WebSocket manager
    connection = await websocket_manager.connect(
        websocket=websocket,
        session_id=session_id,
        user_id=str(current_user.id),
        user_name=current_user.full_name or current_user.email,
        user_role="student"
    )
    
    # Register with engagement tracker
    await engagement_tracker.register_student(
        session_id=session_id,
        student_id=str(current_user.id),
        student_name=current_user.full_name or current_user.email
    )
    
    try:
        while True:
            # Receive message from student
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Handle message
            await websocket_manager.handle_message(
                session_id=session_id,
                user_id=str(current_user.id),
                data=message_data
            )
            
    except WebSocketDisconnect:
        logger.info(f"Student {current_user.email} disconnected from session {session_id}")
        await websocket_manager.disconnect(session_id, str(current_user.id))
    except Exception as e:
        logger.error(f"Student WebSocket error: {e}")
        await websocket.close()


@router.post("/sessions/{session_id}/engagement/video-frame")
async def submit_video_frame(
    session_id: str,
    student_id: str,
    frame_data: str,  # Base64 encoded image
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Submit video frame for engagement analysis
    Called periodically by student client (every 2-5 seconds)
    """
    try:
        # Decode base64 image
        import base64
        image_bytes = base64.b64decode(frame_data.split(',')[1] if ',' in frame_data else frame_data)
        
        # Process frame
        metrics = await engagement_tracker.process_video_frame(
            session_id=session_id,
            student_id=student_id,
            image_data=image_bytes
        )
        
        if metrics:
            # Broadcast engagement update to teacher
            await websocket_manager.broadcast_engagement_update(
                session_id=session_id,
                student_id=student_id,
                attention_score=metrics.attention_score,
                is_camera_on=metrics.is_camera_on,
                is_mic_on=metrics.is_mic_on,
                face_detected=metrics.face_detected,
                looking_at_screen=metrics.looking_at_screen
            )
        
        return {
            "success": True,
            "attention_score": metrics.attention_score if metrics else 0,
            "status": metrics.get_engagement_status().value if metrics else "unknown"
        }
        
    except Exception as e:
        logger.error(f"Error processing video frame: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process video frame"
        )


@router.post("/sessions/{session_id}/engagement/tab-switch")
async def record_tab_switch(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """Record when student switches browser tab"""
    try:
        await engagement_tracker.record_tab_switch(
            session_id=session_id,
            student_id=str(current_user.id)
        )
        
        return {"success": True, "detail": "Tab switch recorded"}
        
    except Exception as e:
        logger.error(f"Error recording tab switch: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record tab switch"
        )


@router.post("/sessions/{session_id}/engagement/participation")
async def record_participation(
    session_id: str,
    event_type: str,  # "question", "answer", "chat", "hand_raise"
    current_user: User = Depends(get_current_user)
):
    """Record student participation event"""
    try:
        await engagement_tracker.record_participation(
            session_id=session_id,
            student_id=str(current_user.id),
            event_type=event_type
        )
        
        return {"success": True, "detail": f"{event_type} recorded"}
        
    except Exception as e:
        logger.error(f"Error recording participation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record participation"
        )


@router.get("/sessions/{session_id}/engagement/report")
async def get_engagement_report(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Get comprehensive engagement report for session
    Teacher only
    """
    try:
        # Verify teacher access
        manager = SessionManager(db)
        session = await manager._get_session(session_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if str(session.teacher_id) != str(current_user.id) and current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Generate report
        report = await engagement_tracker.generate_engagement_report(session_id)
        
        return {
            "success": True,
            "report": report
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating engagement report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate engagement report"
        )


@router.get("/sessions/{session_id}/engagement/student/{student_id}")
async def get_student_engagement(
    session_id: str,
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Get engagement metrics for specific student
    Teachers can view any student, students can only view themselves
    """
    try:
        # Check access
        manager = SessionManager(db)
        session = await manager._get_session(session_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Teachers can view any student, students only themselves
        is_teacher = str(session.teacher_id) == str(current_user.id) or current_user.role == "admin"
        is_self = str(current_user.id) == student_id
        
        if not (is_teacher or is_self):
            raise HTTPException(status_code=403, detail="Not authorized to view this student's data")
        
        # Get metrics
        metrics = await engagement_tracker.get_student_metrics(session_id, student_id)
        
        if not metrics:
            raise HTTPException(status_code=404, detail="Student metrics not found")
        
        return {
            "success": True,
            "metrics": metrics.to_dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting student engagement: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get student engagement"
        )
