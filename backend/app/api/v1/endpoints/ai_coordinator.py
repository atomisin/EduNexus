"""
AI Coordinator API Endpoints
Real-time AI processing for teaching sessions
"""

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
    UploadFile,
    File,
    Query,
)
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user, get_current_teacher, verify_token
from app.models.user import User
from app.models.session import TeachingSession
from app.services.ai_coordinator import ai_coordinator, AIExplanation, ExplanationType
from app.services.session_manager import SessionManager
from pydantic import BaseModel

class SessionExplanationRequest(BaseModel):
    concept: Optional[str] = None
    topic: Optional[str] = None
    explanation_type: str = "concept_breakdown"
    target_student_id: Optional[str] = None

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai-coordinator"])


@router.post("/sessions/{session_id}/process-speech")
async def process_teacher_speech(
    session_id: str,
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Process teacher's speech in real-time:
    - Transcribe audio (STT)
    - Analyze complexity
    - Generate explanation if needed
    - Suggest videos if relevant

    This endpoint is called repeatedly during a live session
    whenever the teacher is speaking.
    """
    try:
        # Get session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify teacher owns this session
        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        # Check session is live
        if session.status != "live":
            raise HTTPException(
                status_code=400,
                detail=f"Session must be live to process speech. Current status: {session.status}",
            )

        # Read audio data
        audio_data = await audio.read()

        # Process speech through AI Coordinator
        result = await ai_coordinator.process_teacher_speech(session, audio_data)
        
        # Save transcript changes
        await db.commit()

        return {"success": True, "data": result}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing speech: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process speech: {str(e)}",
        )


@router.post("/sessions/{session_id}/generate-outline")
async def generate_lesson_outline(
    session_id: str,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Generate a concise lesson outline for the teacher.
    This is a teaching guide, NOT a full explanation.
    Only visible to the teacher.
    """
    try:
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        from app.services.llm_service import llm_service

        subject = session.context.get("subject", "General")
        topic = session.context.get("topic", "General")
        education_level = session.context.get("education_level", "secondary")
        curriculum = session.context.get("curriculum_type", "WAEC")

        prompt = f"""You are a curriculum expert. Create a concise LESSON OUTLINE for a teacher who is about to teach:

Subject: {subject}
Topic: {topic}
Level: {education_level} ({curriculum} curriculum)

Format the outline as a SHORT, actionable teaching guide:

## {topic}

### Learning Objectives (2-3 bullet points)
### Key Points to Cover (4-6 bullet points)
### Suggested Activities (1-2 brief activities)
### Assessment Check (1-2 quick questions to ask students)

RULES:
- Keep each bullet point to ONE line
- Total outline should be under 200 words
- This is for the TEACHER, not the student
- Be specific to {topic}, not generic"""

        outline = await llm_service.generate(prompt=prompt, max_tokens=256, user_id=current_user.id)

        # Store in session
        session.session_outline = {"content": outline, "generated_at": datetime.now(timezone.utc).isoformat()}
        await db.commit()

        return {"success": True, "outline": outline}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating outline: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate outline: {str(e)}",
        )


@router.post("/sessions/{session_id}/explain")
async def generate_explanation(
    session_id: str,
    request: SessionExplanationRequest,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Generate AI explanation for a concept

    This is called when the teacher explicitly requests an explanation,
    rather than relying on automatic complexity detection.
    """
    try:
        # Get concept from request (handle both concept and topic for compatibility)
        concept = request.concept or request.topic
        if not concept:
            raise HTTPException(status_code=400, detail="concept or topic is required")

        # Get session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify teacher owns this session
        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        # Validate explanation type
        try:
            exp_type = ExplanationType(request.explanation_type)
        except ValueError:
            valid_types = [t.value for t in ExplanationType]
            raise HTTPException(
                status_code=400,
                detail=f"Invalid explanation_type. Must be one of: {valid_types}",
            )

        # Generate explanation
        explanation = await ai_coordinator.generate_explanation(
            session=session,
            concept=concept,
            explanation_type=exp_type,
            trigger_text=concept,
            trigger_type="teacher_request",
            target_student_id=request.target_student_id,
        )

        # Add to session's explanations
        if not session.explanations_generated:
            session.explanations_generated = []

        session.explanations_generated.append(explanation.to_dict())
        await db.commit()

        return {"success": True, "explanation": explanation.to_dict()}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating explanation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate explanation: {str(e)}",
        )


@router.get("/sessions/{session_id}/suggest-videos")
async def suggest_videos(
    session_id: str,
    concept: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Get YouTube video suggestions for a concept
    """
    try:
        # Get session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Check user has access
        enrolled = session.context.get("enrolled_students", [])
        if (
            str(session.teacher_id) != str(current_user.id)
            and str(current_user.id) not in enrolled
        ):
            raise HTTPException(status_code=403, detail="Access denied")

        # Get video suggestions
        videos = await ai_coordinator._suggest_videos(concept, session.context)

        # Add to session
        if not session.videos_suggested:
            session.videos_suggested = []

        session.videos_suggested.append(
            {
                "concept": concept,
                "videos": videos,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        await db.commit()

        return {"success": True, "concept": concept, "videos": videos}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error suggesting videos: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to suggest videos: {str(e)}",
        )


@router.get("/sessions/{session_id}/explanations")
async def get_session_explanations(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Get all AI explanations generated for a session
    """
    try:
        # Get session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Check access
        enrolled = session.context.get("enrolled_students", [])
        if (
            str(session.teacher_id) != str(current_user.id)
            and str(current_user.id) not in enrolled
        ):
            raise HTTPException(status_code=403, detail="Access denied")

        # Get from cache + session
        cached_explanations = ai_coordinator.get_session_explanations(session_id)
        session_explanations = session.explanations_generated or []

        # Combine and deduplicate
        all_explanations = session_explanations + [
            exp
            for exp in cached_explanations
            if exp["id"] not in [se.get("id") for se in session_explanations]
        ]

        return {
            "success": True,
            "explanations": all_explanations,
            "count": len(all_explanations),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting explanations: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get explanations: {str(e)}",
        )


@router.post("/sessions/{session_id}/explanations/{explanation_id}/approve")
async def approve_explanation(
    session_id: str,
    explanation_id: str,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Teacher approves an AI-generated explanation
    This marks it as ready to share with students
    """
    try:
        # Get session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify teacher owns this session
        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        # Find explanation in session
        explanations = session.explanations_generated or []
        explanation_found = False

        for exp in explanations:
            if exp.get("id") == explanation_id:
                exp["teacher_approved"] = True
                exp["approved_at"] = datetime.now(timezone.utc).isoformat()
                explanation_found = True
                break

        if not explanation_found:
            raise HTTPException(status_code=404, detail="Explanation not found")

        await db.commit()

        return {
            "success": True,
            "message": "Explanation approved and ready to share with students",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving explanation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve explanation: {str(e)}",
        )


@router.post("/sessions/{session_id}/explanations/{explanation_id}/share")
async def share_explanation_with_students(
    session_id: str,
    explanation_id: str,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Share an approved explanation with all students in the session
    This would typically be called via WebSocket to broadcast to students
    """
    try:
        # Get session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify teacher owns this session
        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")

        # Find explanation
        explanations = session.explanations_generated or []
        explanation = None

        for exp in explanations:
            if exp.get("id") == explanation_id:
                explanation = exp
                break

        if not explanation:
            raise HTTPException(status_code=404, detail="Explanation not found")

        if not explanation.get("teacher_approved"):
            raise HTTPException(
                status_code=400, detail="Explanation must be approved before sharing"
            )

        # Mark as shared
        explanation["shared_at"] = datetime.now(timezone.utc).isoformat()
        await db.commit()

        # In production, this would broadcast via WebSocket to all students
        # await websocket_manager.broadcast_to_students(session_id, {
        #     "type": "explanation",
        #     "data": explanation
        # })

        return {
            "success": True,
            "message": "Explanation shared with students",
            "explanation": explanation,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sharing explanation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to share explanation: {str(e)}",
        )


@router.post("/sessions/{session_id}/explanations/{explanation_id}/rate")
async def rate_explanation_helpfulness(
    session_id: str,
    explanation_id: str,
    rating: int,  # 1-5
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Rate how helpful an explanation was (by students or teacher)
    Used to improve future AI-generated explanations
    """
    try:
        if rating < 1 or rating > 5:
            raise HTTPException(
                status_code=400, detail="Rating must be between 1 and 5"
            )

        # Get session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Find explanation
        explanations = session.explanations_generated or []

        for exp in explanations:
            if exp.get("id") == explanation_id:
                exp["helpfulness_rating"] = rating
                exp["rated_by"] = str(current_user.id)
                exp["rated_at"] = datetime.now(timezone.utc).isoformat()
                break
        else:
            raise HTTPException(status_code=404, detail="Explanation not found")

        await db.commit()

        return {"success": True, "message": "Rating submitted", "rating": rating}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rating explanation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit rating: {str(e)}",
        )


@router.post("/sessions/{session_id}/generate-notes")
async def generate_session_notes(
    session_id: str,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Generate notes/summary from the session transcript
    """
    try:
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if str(session.teacher_id) != str(current_user.id):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to generate notes for this session",
            )

        from app.services.llm_service import llm_service

        # Get session context
        subject = session.context.get("subject", "General")
        topic = session.context.get("topic", "General")
        education_level = session.context.get("education_level", "secondary")
        curriculum = session.context.get("curriculum_type", "WAEC")

        transcript = session.transcript or []

        if transcript:
            # Generate from transcript
            transcript_text = "\n".join(
                [
                    f"[{t.get('timestamp', '')}] {t.get('speaker', 'Unknown')}: {t.get('text', '')}"
                    for t in transcript
                ]
            )
            prompt = f"""Based on the following teaching session transcript for {subject} - {topic}, create concise class notes for {education_level} students ({curriculum} curriculum).

Transcript:
{transcript_text[:2000]}

Create structured class notes with:
1. **Topic**: {topic}
2. **Key Definitions** (3-5 bullet points)
3. **Main Concepts** (concise explanations)
4. **Examples** (1-2 practical examples)
5. **Summary** (2-3 sentences)

Keep it concise and student-friendly. Use simple language appropriate for {education_level} level."""
        else:
            # Generate from context when no transcript
            prompt = f"""Create concise class notes for a {education_level} level ({curriculum} curriculum) session on:

Subject: {subject}
Topic: {topic}

Create structured class notes with:
1. **Topic**: {topic}
2. **Key Definitions** (3-5 bullet points of essential terms)
3. **Main Concepts** (brief, clear explanations of the core ideas)
4. **Examples** (1-2 practical, relatable examples)
5. **Summary** (2-3 sentences)

Keep it concise and student-friendly. These notes are for the teacher to review before sharing with students."""

        notes = await llm_service.generate(prompt=prompt, max_tokens=600, user_id=current_user.id)

        session.context = session.context or {}
        session.context["generated_notes"] = notes
        await db.commit()

        return {"success": True, "notes": notes}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating notes: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate notes: {str(e)}",
        )


@router.get("/explanation-types")
async def get_explanation_types(current_user: User = Depends(get_current_user)):
    """
    Get list of available explanation types
    """
    return {
        "success": True,
        "explanation_types": [
            {
                "type": "concept_breakdown",
                "name": "Concept Breakdown",
                "description": "Break down the concept into core components and explain how it works",
            },
            {
                "type": "analogy",
                "name": "Analogy",
                "description": "Explain using relatable analogies from Nigerian context",
            },
            {
                "type": "step_by_step",
                "name": "Step-by-Step",
                "description": "Provide clear, sequential steps to understand the concept",
            },
            {
                "type": "visual_description",
                "name": "Visual Description",
                "description": "Describe how the concept would look visually with diagrams",
            },
            {
                "type": "real_world_example",
                "name": "Real-World Examples",
                "description": "Provide practical examples from everyday Nigerian life",
            },
            {
                "type": "common_mistake",
                "name": "Common Mistakes",
                "description": "Address common misconceptions and how to avoid them",
            },
            {
                "type": "simplified",
                "name": "Simplified",
                "description": "Explain as if to a 10-year-old using simple language",
            },
        ],
    }


# WebSocket for real-time AI processing
@router.websocket("/ws/{session_id}/ai")
async def ai_websocket(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db)
):
    """
    WebSocket for real-time AI processing during a session (C-08 Secured)
    """
    # C-08: Authenticate WebSocket connection
    final_token = token or websocket.cookies.get("access_token")
    if not final_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        # Removed local import of verify_token
        current_user = await verify_token(final_token, db)
        if not current_user or current_user.role not in ['teacher', 'admin']:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Verify teacher owns this session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)
        if not session or str(session.teacher_id) != str(current_user.id):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    try:
        # Get session
        manager = SessionManager(db)
        session = await manager._get_session(session_id)

        if not session:
            await websocket.send_json({"type": "error", "message": "Session not found"})
            await websocket.close()
            return

        logger.info(f"AI WebSocket connected for session {session_id}")

        while True:
            # Receive message
            message = await websocket.receive()

            if isinstance(message, bytes):
                # Audio data received
                # Process through AI Coordinator
                result = await ai_coordinator.process_teacher_speech(session, message)

                # Send results back
                await websocket.send_json({"type": "ai_result", "data": result})

                # If explanation generated, notify separately
                if result.get("explanation"):
                    await websocket.send_json(
                        {"type": "explanation_generated", "data": result["explanation"]}
                    )

            elif isinstance(message, str):
                # JSON message
                data = json.loads(message)

                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

                elif data.get("type") == "generate_explanation":
                    # Teacher requests explanation for specific concept
                    explanation = await ai_coordinator.generate_explanation(
                        session=session,
                        concept=data.get("concept"),
                        explanation_type=ExplanationType(
                            data.get("explanation_type", "concept_breakdown")
                        ),
                        trigger_type="teacher_request",
                    )

                    await websocket.send_json(
                        {"type": "explanation_ready", "data": explanation.to_dict()}
                    )

    except WebSocketDisconnect:
        logger.info(f"AI WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"AI WebSocket error: {str(e)}")
        await websocket.close()


# Import at the end to avoid circular import
from datetime import datetime, timezone
import json
