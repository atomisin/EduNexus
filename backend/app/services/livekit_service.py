import os
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from app.core.config import settings

# LiveKit Python SDK
# pip install livekit

try:
    from livekit import api
    from livekit.api import AccessToken, TokenVerifier

    LIVEKIT_AVAILABLE = True
except ImportError:
    LIVEKIT_AVAILABLE = False
    logging.warning("LiveKit SDK not installed. Video functionality will be limited.")

logger = logging.getLogger(__name__)


class LiveKitService:
    """
    Service for managing LiveKit video rooms
    Handles: room creation, token generation, participant management
    """

    def __init__(self):
        self.api_key = os.getenv(
            "LIVEKIT_API_KEY", getattr(settings, "LIVEKIT_API_KEY", "")
        )
        self.api_secret = os.getenv(
            "LIVEKIT_API_SECRET", getattr(settings, "LIVEKIT_API_SECRET", "")
        )
        self.livekit_url = os.getenv(
            "LIVEKIT_URL", getattr(settings, "LIVEKIT_URL", "wss://localhost:7880")
        )

        logger.info(f"Initializing LiveKitService with URL: {self.livekit_url}")

        if not LIVEKIT_AVAILABLE:
            logger.warning("LiveKit SDK not installed. Running in mock mode.")
        elif not self.api_key or not self.api_secret:
            logger.warning(
                f"LiveKit credentials missing (Key: {'Set' if self.api_key else 'Missing'}, Secret: {'Set' if self.api_secret else 'Missing'}). Running in mock mode."
            )
        else:
            masked_key = (
                f"{self.api_key[:4]}...{self.api_key[-4:]}"
                if len(self.api_key) > 8
                else "****"
            )
            logger.info(f"LiveKit credentials configured (API Key: {masked_key}).")

    def is_configured(self) -> bool:
        """Check if LiveKit is properly configured"""
        configured = LIVEKIT_AVAILABLE and bool(self.api_key) and bool(self.api_secret)
        if not configured:
            logger.debug(
                f"LiveKit not configured: Available={LIVEKIT_AVAILABLE}, Key={bool(self.api_key)}, Secret={bool(self.api_secret)}"
            )
        return configured

    async def create_room(
        self,
        room_name: str,
        max_participants: int = 50,
        empty_timeout: int = 600,  # 10 minutes - prevents premature room deletion
        departure_timeout: int = 20,
        metadata: str = "",
    ) -> Dict[str, Any]:
        """Create a new LiveKit room"""
        if not self.is_configured():
            logger.info(f"Mock: Creating room {room_name}")
            return {
                "room_name": room_name,
                "mock": True,
                "max_participants": max_participants,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

        try:
            async with api.LiveKitAPI(
                url=self.livekit_url, api_key=self.api_key, api_secret=self.api_secret
            ) as livekit_api:
                if not metadata:
                    metadata = json.dumps(
                        {"created_at": datetime.now(timezone.utc).isoformat()}
                    )

                room = await livekit_api.room.create_room(
                    api.CreateRoomRequest(
                        name=room_name,
                        max_participants=max_participants,
                        empty_timeout=empty_timeout,
                        departure_timeout=departure_timeout,
                        metadata=metadata,
                    )
                )
                logger.info(f"Created LiveKit room: {room_name}")
                return {
                    "room_name": room.name,
                    "room_sid": room.sid,
                    "max_participants": room.max_participants,
                    "creation_time": room.creation_time,
                    "num_participants": room.num_participants,
                    "mock": False,
                }
        except Exception as e:
            logger.error(f"LiveKit create_room failed: {e}")
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "live_session_unavailable",
                    "message": "Could not create live session. Please try again.",
                },
            )

    async def generate_teacher_token(
        self, room_name: str, teacher_id: str, teacher_name: str, ttl_hours: int = 4
    ) -> str:
        """Generate access token for teacher (host privileges)"""
        if not self.is_configured():
            return f"mock_token_teacher_{teacher_id}_{room_name}"

        try:
            token = (
                api.AccessToken(api_key=self.api_key, api_secret=self.api_secret)
                .with_identity(identity=teacher_id)
                .with_name(teacher_name)
                .with_ttl(timedelta(hours=ttl_hours))
            )

            grants = api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
                room_admin=True,
                room_create=True,
                room_list=False,
                room_record=True,
            )
            token = token.with_grants(grants)
            return token.to_jwt()

        except Exception as e:
            logger.error(f"Error generating teacher token: {str(e)}")
            raise

    async def generate_student_token(
        self,
        room_name: str,
        student_id: str,
        student_name: str,
        can_publish: bool = True,
        ttl_hours: int = 3,
    ) -> str:
        """Generate access token for student"""
        if not self.is_configured():
            return f"mock_token_student_{student_id}_{room_name}"

        try:
            token = (
                api.AccessToken(api_key=self.api_key, api_secret=self.api_secret)
                .with_identity(identity=student_id)
                .with_name(student_name)
                .with_ttl(timedelta(hours=ttl_hours))
            )

            grants = api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=can_publish,
                can_subscribe=True,
                can_publish_data=True,
                room_admin=False,
                room_create=False,
                room_list=False,
                room_record=False,
            )
            token = token.with_grants(grants)
            return token.to_jwt()

        except Exception as e:
            logger.error(f"Error generating student token: {str(e)}")
            raise

    # Legacy method wrapper mapping to list_participants to avoid breaking endpoints.py
    async def get_room_participants(self, room_name: str) -> list:
        return await self.list_participants(room_name)

    async def generate_token(
        self,
        room_name: str,
        participant_identity: str,
        participant_name: str,
        ttl_hours: int = 3,
    ) -> str:
        """Helper to match integration script signature from prompt"""
        return await self.generate_student_token(
            room_name, participant_identity, participant_name, True, ttl_hours
        )

    async def delete_room(self, room_name: str) -> bool:
        """Delete a LiveKit room"""
        if not self.is_configured():
            logger.info(f"Mock: Deleting room {room_name}")
            return True

        try:
            async with api.LiveKitAPI(
                url=self.livekit_url, api_key=self.api_key, api_secret=self.api_secret
            ) as livekit_api:
                await livekit_api.room.delete_room(
                    api.DeleteRoomRequest(room=room_name)
                )
                logger.info(f"Room deleted: {room_name}")
                return True
        except Exception as e:
            logger.warning(f"LiveKit delete_room failed for {room_name}: {e}")
            return False

    async def list_participants(self, room_name: str) -> list:
        """Get list of participants in a room"""
        if not self.is_configured():
            return []

        try:
            async with api.LiveKitAPI(
                url=self.livekit_url, api_key=self.api_key, api_secret=self.api_secret
            ) as livekit_api:
                response = await livekit_api.room.list_participants(
                    api.ListParticipantsRequest(room=room_name)
                )
                return [
                    {
                        "identity": p.identity,
                        "name": p.name,
                        "sid": p.sid,
                        "joined_at": p.joined_at,
                        "is_publisher": p.is_publisher,
                    }
                    for p in response.participants
                ]
        except Exception as e:
            logger.error(f"LiveKit list_participants failed: {e}")
            return []

    async def mute_participant(
        self,
        room_name: str,
        participant_identity: str,
        track_sid: str,
        muted: bool = True,
    ) -> bool:
        """Mute a participant"""
        if not self.is_configured():
            logger.info(f"Mock: Muting participant {participant_identity}")
            return True

        try:
            async with api.LiveKitAPI(
                url=self.livekit_url, api_key=self.api_key, api_secret=self.api_secret
            ) as livekit_api:
                await livekit_api.room.mute_published_track(
                    api.MuteRoomTrackRequest(
                        room=room_name,
                        identity=participant_identity,
                        track_sid=track_sid,
                        muted=muted,
                    )
                )
                return True
        except Exception as e:
            logger.error(f"LiveKit mute failed: {e}")
            return False

    async def remove_participant(
        self, room_name: str, participant_identity: str
    ) -> bool:
        """Remove a participant from the room"""
        if not self.is_configured():
            logger.info(f"Mock: Removing participant {participant_identity}")
            return True

        try:
            async with api.LiveKitAPI(
                url=self.livekit_url, api_key=self.api_key, api_secret=self.api_secret
            ) as livekit_api:
                await livekit_api.room.remove_participant(
                    api.RoomParticipantIdentity(
                        room=room_name, identity=participant_identity
                    )
                )
                return True
        except Exception as e:
            logger.error(f"LiveKit remove_participant failed: {e}")
            return False

    async def start_recording(self, room_name: str) -> Dict[str, Any]:
        """Start recording a session"""
        # DEFERRED — requires LiveKit Egress
        # Enable Egress in LiveKit Cloud dashboard before implementing.
        # See: https://docs.livekit.io/egress
        logger.warning("Recording not implemented: LiveKit Egress not configured")
        raise HTTPException(
            status_code=501,
            detail={
                "error": "recording_not_available",
                "message": "Recording is not available yet.",
            },
        )

    async def stop_recording(self, recording_id: str) -> Dict[str, Any]:
        """Stop recording a session"""
        logger.warning("Recording not implemented: LiveKit Egress not configured")
        raise HTTPException(
            status_code=501,
            detail={
                "error": "recording_not_available",
                "message": "Recording is not available yet.",
            },
        )


# Singleton instance
livekit_service = LiveKitService()
