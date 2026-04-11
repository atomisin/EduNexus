"""
WebSocket Manager Service
Real-time communication hub for teaching sessions
Manages: Connections, Broadcasting, Message Routing, Events
"""

import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
from enum import Enum

logger = logging.getLogger(__name__)


class MessageType(str, Enum):
    """Types of WebSocket messages"""
    # Connection
    PING = "ping"
    PONG = "pong"
    CONNECT = "connect"
    DISCONNECT = "disconnect"
    
    # Session Management
    USER_JOINED = "user_joined"
    USER_LEFT = "user_left"
    SESSION_STARTED = "session_started"
    SESSION_ENDED = "session_ended"
    SESSION_PAUSED = "session_paused"
    SESSION_RESUMED = "session_resumed"
    
    # Chat & Interaction
    CHAT_MESSAGE = "chat_message"
    RAISE_HAND = "raise_hand"
    LOWER_HAND = "lower_hand"
    QUESTION_ASKED = "question_asked"
    ANSWER_GIVEN = "answer_given"
    
    # AI & Content
    TRANSCRIPT_UPDATE = "transcript_update"
    AI_EXPLANATION = "ai_explanation"
    VIDEO_SUGGESTION = "video_suggestion"
    CONTENT_SHARED = "content_shared"
    
    # Engagement
    ENGAGEMENT_UPDATE = "engagement_update"
    ATTENTION_ALERT = "attention_alert"
    PARTICIPATION_UPDATE = "participation_update"
    
    # Control
    MUTE_USER = "mute_user"
    UNMUTE_USER = "unmute_user"
    REMOVE_USER = "remove_user"
    SCREEN_SHARE_STARTED = "screen_share_started"
    SCREEN_SHARE_STOPPED = "screen_share_stopped"
    
    # Errors
    ERROR = "error"
    WARNING = "warning"


class WebSocketMessage:
    """Standardized WebSocket message format"""
    
    def __init__(
        self,
        type: MessageType,
        payload: Dict[str, Any],
        sender_id: Optional[str] = None,
        sender_name: Optional[str] = None,
        sender_role: Optional[str] = None,
        timestamp: Optional[datetime] = None,
        session_id: Optional[str] = None
    ):
        self.type = type
        self.payload = payload
        self.sender_id = sender_id
        self.sender_name = sender_name
        self.sender_role = sender_role
        self.timestamp = timestamp or datetime.now(timezone.utc)
        self.session_id = session_id
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "payload": self.payload,
            "sender": {
                "id": self.sender_id,
                "name": self.sender_name,
                "role": self.sender_role
            } if self.sender_id else None,
            "timestamp": self.timestamp.isoformat(),
            "session_id": self.session_id
        }
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict())
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'WebSocketMessage':
        sender = data.get("sender", {}) or {}
        return cls(
            type=MessageType(data.get("type", "ping")),
            payload=data.get("payload", {}),
            sender_id=sender.get("id"),
            sender_name=sender.get("name"),
            sender_role=sender.get("role"),
            timestamp=datetime.fromisoformat(data["timestamp"]) if "timestamp" in data else None,
            session_id=data.get("session_id")
        )


class Connection:
    """Represents a single WebSocket connection"""
    
    def __init__(
        self,
        websocket,
        user_id: str,
        user_name: str,
        user_role: str,
        session_id: str
    ):
        self.websocket = websocket
        self.user_id = user_id
        self.user_name = user_name
        self.user_role = user_role
        self.session_id = session_id
        self.connected_at = datetime.now(timezone.utc)
        self.last_ping = datetime.now(timezone.utc)
        self.is_active = True
    
    async def send(self, message: WebSocketMessage):
        """Send message to this connection"""
        try:
            await self.websocket.send_text(message.to_json())
        except Exception as e:
            logger.error(f"Error sending message to {self.user_id}: {e}")
            self.is_active = False
    
    async def send_json(self, data: Dict[str, Any]):
        """Send raw JSON to this connection"""
        try:
            await self.websocket.send_json(data)
        except Exception as e:
            logger.error(f"Error sending JSON to {self.user_id}: {e}")
            self.is_active = False


class SessionRoom:
    """Manages all connections for a single teaching session"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.connections: Dict[str, Connection] = {}  # user_id -> Connection
        self.teacher_connection: Optional[Connection] = None
        self.created_at = datetime.now(timezone.utc)
        self.message_history: List[WebSocketMessage] = []  # Last 100 messages
        
    def add_connection(self, connection: Connection):
        """Add a new connection to the room"""
        self.connections[connection.user_id] = connection
        
        if connection.user_role == "teacher":
            self.teacher_connection = connection
            logger.info(f"Teacher {connection.user_name} joined session {self.session_id}")
        else:
            logger.info(f"Student {connection.user_name} joined session {self.session_id}")
    
    def remove_connection(self, user_id: str):
        """Remove a connection from the room"""
        if user_id in self.connections:
            connection = self.connections[user_id]
            
            if connection.user_role == "teacher":
                self.teacher_connection = None
                logger.info(f"Teacher {connection.user_name} left session {self.session_id}")
            else:
                logger.info(f"Student {connection.user_name} left session {self.session_id}")
            
            del self.connections[user_id]
    
    async def broadcast(self, message: WebSocketMessage, exclude_user_id: Optional[str] = None):
        """Broadcast message to all connections in the room"""
        message.session_id = self.session_id
        
        # Store in history
        self.message_history.append(message)
        if len(self.message_history) > 100:
            self.message_history.pop(0)
        
        # Send to all active connections
        disconnected = []
        for user_id, connection in self.connections.items():
            if user_id == exclude_user_id:
                continue
            
            if connection.is_active:
                await connection.send(message)
            else:
                disconnected.append(user_id)
        
        # Clean up disconnected
        for user_id in disconnected:
            self.remove_connection(user_id)
    
    async def broadcast_to_students(self, message: WebSocketMessage):
        """Broadcast only to students (not teacher)"""
        message.session_id = self.session_id
        
        disconnected = []
        for user_id, connection in self.connections.items():
            if connection.user_role == "student" and connection.is_active:
                await connection.send(message)
            elif not connection.is_active:
                disconnected.append(user_id)
        
        for user_id in disconnected:
            self.remove_connection(user_id)
    
    async def send_to_teacher(self, message: WebSocketMessage):
        """Send message only to the teacher"""
        if self.teacher_connection and self.teacher_connection.is_active:
            message.session_id = self.session_id
            await self.teacher_connection.send(message)
    
    async def send_to_user(self, user_id: str, message: WebSocketMessage):
        """Send message to specific user"""
        if user_id in self.connections:
            connection = self.connections[user_id]
            if connection.is_active:
                message.session_id = self.session_id
                await connection.send(message)
    
    def get_active_users(self) -> List[Dict[str, Any]]:
        """Get list of active users in the room"""
        return [
            {
                "user_id": conn.user_id,
                "user_name": conn.user_name,
                "user_role": conn.user_role,
                "connected_at": conn.connected_at.isoformat()
            }
            for conn in self.connections.values()
            if conn.is_active
        ]
    
    def get_student_count(self) -> int:
        """Get number of connected students"""
        return sum(
            1 for conn in self.connections.values()
            if conn.user_role == "student" and conn.is_active
        )


class WebSocketManager:
    """
    Central manager for all WebSocket connections
    Handles multiple session rooms
    """
    
    def __init__(self):
        self.rooms: Dict[str, SessionRoom] = {}  # session_id -> SessionRoom
        logger.info("WebSocketManager initialized")
    
    def get_or_create_room(self, session_id: str) -> SessionRoom:
        """Get existing room or create new one"""
        if session_id not in self.rooms:
            self.rooms[session_id] = SessionRoom(session_id)
            logger.info(f"Created new room for session {session_id}")
        return self.rooms[session_id]
    
    def remove_room(self, session_id: str):
        """Remove a room (when session ends)"""
        if session_id in self.rooms:
            del self.rooms[session_id]
            logger.info(f"Removed room for session {session_id}")
    
    async def connect(
        self,
        websocket,
        session_id: str,
        user_id: str,
        user_name: str,
        user_role: str
    ) -> Connection:
        """
        Handle new WebSocket connection
        
        Args:
            websocket: The WebSocket object
            session_id: Session they're joining
            user_id: User's ID
            user_name: Display name
            user_role: "teacher" or "student"
        
        Returns:
            Connection object
        """
        await websocket.accept()
        
        # Get or create room
        room = self.get_or_create_room(session_id)
        
        # Create connection
        connection = Connection(
            websocket=websocket,
            user_id=user_id,
            user_name=user_name,
            user_role=user_role,
            session_id=session_id
        )
        
        # Add to room
        room.add_connection(connection)
        
        # Notify others
        await room.broadcast(
            WebSocketMessage(
                type=MessageType.USER_JOINED,
                payload={
                    "user_id": user_id,
                    "user_name": user_name,
                    "user_role": user_role,
                    "total_participants": len(room.connections)
                },
                sender_id=user_id,
                sender_name=user_name,
                sender_role=user_role,
                session_id=session_id
            ),
            exclude_user_id=user_id
        )
        
        # Send welcome message to new user
        await connection.send_json({
            "type": "connected",
            "payload": {
                "session_id": session_id,
                "user_id": user_id,
                "active_users": room.get_active_users(),
                "your_role": user_role
            }
        })
        
        logger.info(f"User {user_name} ({user_role}) connected to session {session_id}")
        
        return connection
    
    async def disconnect(self, session_id: str, user_id: str):
        """Handle WebSocket disconnection"""
        if session_id not in self.rooms:
            return
        
        room = self.rooms[session_id]
        
        # Get user info before removing
        connection = room.connections.get(user_id)
        if connection:
            # Notify others
            await room.broadcast(
                WebSocketMessage(
                    type=MessageType.USER_LEFT,
                    payload={
                        "user_id": user_id,
                        "user_name": connection.user_name,
                        "user_role": connection.user_role,
                        "total_participants": len(room.connections) - 1
                    },
                    session_id=session_id
                )
            )
        
        # Remove from room
        room.remove_connection(user_id)
        
        # Clean up empty room
        if len(room.connections) == 0:
            self.remove_room(session_id)
    
    async def handle_message(
        self,
        session_id: str,
        user_id: str,
        data: Dict[str, Any]
    ):
        """
        Handle incoming WebSocket message
        
        Args:
            session_id: Session ID
            user_id: Sender's user ID
            data: Message data (parsed JSON)
        """
        if session_id not in self.rooms:
            return
        
        room = self.rooms[session_id]
        connection = room.connections.get(user_id)
        
        if not connection:
            return
        
        try:
            msg_type = data.get("type", "ping")
            payload = data.get("payload", {})
            
            # Handle different message types
            if msg_type == "ping":
                await connection.send_json({"type": "pong"})
                connection.last_ping = datetime.now(timezone.utc)
            
            elif msg_type == "chat_message":
                # Broadcast chat to everyone
                await room.broadcast(
                    WebSocketMessage(
                        type=MessageType.CHAT_MESSAGE,
                        payload={
                            "message": payload.get("message"),
                            "message_id": payload.get("message_id")
                        },
                        sender_id=user_id,
                        sender_name=connection.user_name,
                        sender_role=connection.user_role,
                        session_id=session_id
                    )
                )
            
            elif msg_type == "raise_hand":
                # Notify only teacher
                await room.send_to_teacher(
                    WebSocketMessage(
                        type=MessageType.RAISE_HAND,
                        payload={
                            "student_id": user_id,
                            "student_name": connection.user_name
                        },
                        sender_id=user_id,
                        sender_name=connection.user_name,
                        sender_role="student",
                        session_id=session_id
                    )
                )
            
            elif msg_type == "lower_hand":
                await room.send_to_teacher(
                    WebSocketMessage(
                        type=MessageType.LOWER_HAND,
                        payload={
                            "student_id": user_id,
                            "student_name": connection.user_name
                        },
                        session_id=session_id
                    )
                )
            
            elif msg_type == "question_asked":
                # Track question and notify teacher
                await room.send_to_teacher(
                    WebSocketMessage(
                        type=MessageType.QUESTION_ASKED,
                        payload={
                            "question": payload.get("question"),
                            "student_id": user_id,
                            "student_name": connection.user_name
                        },
                        sender_id=user_id,
                        sender_name=connection.user_name,
                        sender_role="student",
                        session_id=session_id
                    )
                )
            
            elif msg_type == "transcript_update":
                # Teacher's speech transcript
                if connection.user_role == "teacher":
                    await room.broadcast_to_students(
                        WebSocketMessage(
                            type=MessageType.TRANSCRIPT_UPDATE,
                            payload={
                                "transcript": payload.get("transcript"),
                                "is_final": payload.get("is_final", False)
                            },
                            sender_id=user_id,
                            sender_name=connection.user_name,
                            sender_role="teacher",
                            session_id=session_id
                        )
                    )
            
            elif msg_type == "ai_explanation":
                # Teacher sharing AI explanation
                if connection.user_role == "teacher":
                    await room.broadcast_to_students(
                        WebSocketMessage(
                            type=MessageType.AI_EXPLANATION,
                            payload={
                                "explanation": payload.get("explanation"),
                                "concept": payload.get("concept")
                            },
                            sender_id=user_id,
                            sender_name=connection.user_name,
                            sender_role="teacher",
                            session_id=session_id
                        )
                    )
            
            elif msg_type == "engagement_update":
                # Student engagement data
                await room.send_to_teacher(
                    WebSocketMessage(
                        type=MessageType.ENGAGEMENT_UPDATE,
                        payload={
                            "student_id": user_id,
                            "attention_score": payload.get("attention_score"),
                            "is_camera_on": payload.get("is_camera_on"),
                            "is_mic_on": payload.get("is_mic_on")
                        },
                        session_id=session_id
                    )
                )
            
            elif msg_type == "mute_user":
                # Teacher mutes a student
                if connection.user_role == "teacher":
                    target_user_id = payload.get("target_user_id")
                    await room.send_to_user(
                        target_user_id,
                        WebSocketMessage(
                            type=MessageType.MUTE_USER,
                            payload={"by": "teacher"},
                            session_id=session_id
                        )
                    )
            
            elif msg_type == "remove_user":
                # Teacher removes a student
                if connection.user_role == "teacher":
                    target_user_id = payload.get("target_user_id")
                    await room.send_to_user(
                        target_user_id,
                        WebSocketMessage(
                            type=MessageType.REMOVE_USER,
                            payload={"by": "teacher"},
                            session_id=session_id
                        )
                    )
            
            else:
                # Unknown message type
                logger.warning(f"Unknown message type: {msg_type}")
        
        except Exception as e:
            logger.error(f"Error handling message from {user_id}: {e}")
            await connection.send_json({
                "type": "error",
                "payload": {"message": "Failed to process message"}
            })
    
    # Convenience methods for broadcasting from services
    
    async def broadcast_transcript(
        self,
        session_id: str,
        transcript: str,
        is_final: bool = False
    ):
        """Broadcast transcript update to all students"""
        if session_id in self.rooms:
            await self.rooms[session_id].broadcast_to_students(
                WebSocketMessage(
                    type=MessageType.TRANSCRIPT_UPDATE,
                    payload={"transcript": transcript, "is_final": is_final},
                    session_id=session_id
                )
            )
    
    async def broadcast_explanation(
        self,
        session_id: str,
        explanation: Dict[str, Any],
        concept: str
    ):
        """Broadcast AI explanation to all students"""
        if session_id in self.rooms:
            await self.rooms[session_id].broadcast_to_students(
                WebSocketMessage(
                    type=MessageType.AI_EXPLANATION,
                    payload={"explanation": explanation, "concept": concept},
                    session_id=session_id
                )
            )
    
    async def broadcast_engagement_update(
        self,
        session_id: str,
        student_id: str,
        attention_score: float,
        **kwargs
    ):
        """Broadcast engagement update to teacher"""
        if session_id in self.rooms:
            await self.rooms[session_id].send_to_teacher(
                WebSocketMessage(
                    type=MessageType.ENGAGEMENT_UPDATE,
                    payload={
                        "student_id": student_id,
                        "attention_score": attention_score,
                        **kwargs
                    },
                    session_id=session_id
                )
            )
    
    async def notify_session_started(self, session_id: str):
        """Notify all users that session has started"""
        if session_id in self.rooms:
            await self.rooms[session_id].broadcast(
                WebSocketMessage(
                    type=MessageType.SESSION_STARTED,
                    payload={"session_id": session_id},
                    session_id=session_id
                )
            )
    
    async def notify_session_ended(self, session_id: str, summary: Dict[str, Any]):
        """Notify all users that session has ended"""
        if session_id in self.rooms:
            await self.rooms[session_id].broadcast(
                WebSocketMessage(
                    type=MessageType.SESSION_ENDED,
                    payload={"session_id": session_id, "summary": summary},
                    session_id=session_id
                )
            )


# Global WebSocket manager instance
websocket_manager = WebSocketManager()
