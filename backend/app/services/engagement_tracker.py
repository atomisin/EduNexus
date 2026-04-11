"""
Engagement Tracker Service
Real-time student engagement monitoring
Uses: Face detection, Gaze tracking, Tab switching detection
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
import asyncio

logger = logging.getLogger(__name__)


class EngagementStatus(str, Enum):
    """Student engagement status levels"""
    HIGHLY_ENGAGED = "highly_engaged"      # 80-100%
    ENGAGED = "engaged"                     # 60-79%
    NEUTRAL = "neutral"                     # 40-59%
    DISENGAGED = "disengaged"               # 20-39%
    HIGHLY_DISENGAGED = "highly_disengaged" # 0-19%


class AlertType(str, Enum):
    """Types of engagement alerts"""
    NO_FACE_DETECTED = "no_face_detected"
    MULTIPLE_FACES = "multiple_faces"
    LOOKING_AWAY = "looking_away"
    LOW_ATTENTION = "low_attention"
    TAB_SWITCH = "tab_switch"
    INACTIVE = "inactive"
    PHONE_DETECTED = "phone_detected"


@dataclass
class EngagementMetrics:
    """Real-time engagement metrics for a student"""
    student_id: str
    student_name: str
    
    # Basic metrics
    attention_score: float = 100.0  # 0-100
    is_camera_on: bool = False
    is_mic_on: bool = False
    is_screen_visible: bool = True
    
    # Face detection
    face_detected: bool = False
    face_confidence: float = 0.0
    multiple_faces_detected: bool = False
    
    # Gaze tracking
    gaze_direction: str = "center"  # center, left, right, up, down
    gaze_score: float = 1.0  # 0-1, how centered the gaze is
    looking_at_screen: bool = True
    
    # Activity
    last_activity_timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    tab_switches_count: int = 0
    last_tab_switch: Optional[datetime] = None
    
    # Participation
    questions_asked: int = 0
    answers_given: int = 0
    chat_messages: int = 0
    hand_raises: int = 0
    
    # Time tracking
    joined_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    total_session_time_minutes: float = 0.0
    active_time_minutes: float = 0.0
    
    # Historical
    attention_history: List[Dict[str, Any]] = field(default_factory=list)
    alerts: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "student_id": self.student_id,
            "student_name": self.student_name,
            "attention_score": round(self.attention_score, 1),
            "engagement_status": self.get_engagement_status().value,
            "is_camera_on": self.is_camera_on,
            "is_mic_on": self.is_mic_on,
            "is_screen_visible": self.is_screen_visible,
            "face_detected": self.face_detected,
            "gaze_direction": self.gaze_direction,
            "looking_at_screen": self.looking_at_screen,
            "tab_switches_count": self.tab_switches_count,
            "questions_asked": self.questions_asked,
            "answers_given": self.answers_given,
            "active_time_minutes": round(self.active_time_minutes, 1),
            "last_activity": self.last_activity_timestamp.isoformat(),
            "alerts_count": len(self.alerts)
        }
    
    def get_engagement_status(self) -> EngagementStatus:
        """Convert attention score to engagement status"""
        if self.attention_score >= 80:
            return EngagementStatus.HIGHLY_ENGAGED
        elif self.attention_score >= 60:
            return EngagementStatus.ENGAGED
        elif self.attention_score >= 40:
            return EngagementStatus.NEUTRAL
        elif self.attention_score >= 20:
            return EngagementStatus.DISENGAGED
        else:
            return EngagementStatus.HIGHLY_DISENGAGED
    
    def add_alert(self, alert_type: AlertType, message: str, severity: str = "medium"):
        """Add an alert to the student's record"""
        self.alerts.append({
            "type": alert_type.value,
            "message": message,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Keep only last 20 alerts
        if len(self.alerts) > 20:
            self.alerts = self.alerts[-20:]


class FaceDetectionService:
    """
    Face detection using OpenCV or similar
    In production, this would use a proper face detection model
    """
    
    def __init__(self):
        self.enabled = True
        # In production: load OpenCV Haar cascade or DNN model
        # self.face_cascade = cv2.CascadeClassifier('haarcascade_frontalface_default.xml')
        logger.info("FaceDetectionService initialized")
    
    async def detect_faces(self, image_data: bytes) -> Tuple[int, float]:
        """
        Detect faces in image
        
        Args:
            image_data: Image bytes (JPEG/PNG)
        
        Returns:
            Tuple of (face_count, confidence)
        """
        # Mock implementation
        # In production:
        # 1. Convert bytes to numpy array
        # 2. Run face detection
        # 3. Return count and average confidence
        
        # Simulate processing time
        await asyncio.sleep(0.05)
        
        # Return mock data (would be real detection)
        return (1, 0.85)  # 1 face, 85% confidence


class GazeTrackingService:
    """
    Gaze tracking to determine where student is looking
    """
    
    def __init__(self):
        self.enabled = True
        logger.info("GazeTrackingService initialized")
    
    async def track_gaze(self, image_data: bytes) -> Dict[str, Any]:
        """
        Track gaze direction
        
        Args:
            image_data: Image bytes
        
        Returns:
            Dict with gaze information
        """
        # Mock implementation
        # In production, use gaze tracking model like:
        # - OpenVINO gaze estimation
        # - Custom CNN model
        # - MediaPipe Face Mesh
        
        await asyncio.sleep(0.03)
        
        # Return mock gaze data
        return {
            "direction": "center",  # center, left, right, up, down
            "score": 0.92,  # 0-1, how centered
            "looking_at_screen": True,
            "confidence": 0.88
        }


class EngagementTracker:
    """
    Main engagement tracking service
    Monitors all students in a session
    """
    
    def __init__(self):
        self.face_detector = FaceDetectionService()
        self.gaze_tracker = GazeTrackingService()
        
        # Track metrics per session
        self.session_metrics: Dict[str, Dict[str, EngagementMetrics]] = {}
        self.tracking_active: Dict[str, bool] = {}
        
        logger.info("EngagementTracker initialized")
    
    async def start_tracking(self, session_id: str):
        """Start engagement tracking for a session"""
        self.session_metrics[session_id] = {}
        self.tracking_active[session_id] = True
        logger.info(f"Started engagement tracking for session {session_id}")
    
    async def stop_tracking(self, session_id: str) -> Dict[str, Any]:
        """Stop tracking and return summary report"""
        self.tracking_active[session_id] = False
        
        # Generate final report
        report = await self.generate_engagement_report(session_id)
        
        # Cleanup
        if session_id in self.session_metrics:
            del self.session_metrics[session_id]
        
        logger.info(f"Stopped engagement tracking for session {session_id}")
        return report
    
    async def register_student(
        self,
        session_id: str,
        student_id: str,
        student_name: str
    ):
        """Register a student for engagement tracking"""
        if session_id not in self.session_metrics:
            self.session_metrics[session_id] = {}
        
        self.session_metrics[session_id][student_id] = EngagementMetrics(
            student_id=student_id,
            student_name=student_name,
            joined_at=datetime.now(timezone.utc)
        )
        
        logger.info(f"Registered student {student_name} for tracking in session {session_id}")
    
    async def process_video_frame(
        self,
        session_id: str,
        student_id: str,
        image_data: bytes
    ) -> EngagementMetrics:
        """
        Process a video frame for engagement analysis
        Called repeatedly during live session (e.g., every 2-5 seconds)
        
        Args:
            session_id: Session ID
            student_id: Student ID
            image_data: Video frame as bytes
        
        Returns:
            Updated engagement metrics
        """
        if session_id not in self.session_metrics:
            return None
        
        if student_id not in self.session_metrics[session_id]:
            return None
        
        metrics = self.session_metrics[session_id][student_id]
        
        # 1. Face Detection
        face_count, face_confidence = await self.face_detector.detect_faces(image_data)
        metrics.face_detected = face_count > 0
        metrics.face_confidence = face_confidence
        metrics.multiple_faces_detected = face_count > 1
        
        # 2. Gaze Tracking
        if metrics.face_detected:
            gaze_data = await self.gaze_tracker.track_gaze(image_data)
            metrics.gaze_direction = gaze_data["direction"]
            metrics.gaze_score = gaze_data["score"]
            metrics.looking_at_screen = gaze_data["looking_at_screen"]
        else:
            metrics.gaze_score = 0.0
            metrics.looking_at_screen = False
        
        # 3. Calculate Attention Score
        metrics.attention_score = self._calculate_attention_score(metrics)
        
        # 4. Check for alerts
        await self._check_alerts(session_id, student_id, metrics)
        
        # 5. Update activity timestamp
        metrics.last_activity_timestamp = datetime.now(timezone.utc)
        
        # 6. Store history (keep last 60 data points = ~5 minutes at 5-second intervals)
        metrics.attention_history.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "score": metrics.attention_score,
            "face_detected": metrics.face_detected,
            "looking_at_screen": metrics.looking_at_screen
        })
        if len(metrics.attention_history) > 60:
            metrics.attention_history.pop(0)
        
        return metrics
    
    def _calculate_attention_score(self, metrics: EngagementMetrics) -> float:
        """
        Calculate overall attention score (0-100)
        Based on multiple factors
        """
        score = 100.0
        
        # Face detection factor (30%)
        if not metrics.face_detected:
            score -= 30
        elif metrics.multiple_faces_detected:
            score -= 20
        
        # Gaze factor (40%)
        gaze_penalty = (1.0 - metrics.gaze_score) * 40
        score -= gaze_penalty
        
        # Activity factor (20%)
        inactive_seconds = (
            datetime.now(timezone.utc) - metrics.last_activity_timestamp
        ).total_seconds()
        if inactive_seconds > 30:  # No activity for 30 seconds
            score -= 20
        elif inactive_seconds > 10:  # No activity for 10 seconds
            score -= 10
        
        # Tab switching factor (10%)
        if metrics.tab_switches_count > 0:
            recent_switches = sum(
                1 for alert in metrics.alerts[-10:]
                if alert["type"] == AlertType.TAB_SWITCH.value
            )
            score -= min(10, recent_switches * 2)
        
        return max(0.0, min(100.0, score))
    
    async def _check_alerts(
        self,
        session_id: str,
        student_id: str,
        metrics: EngagementMetrics
    ):
        """Check for alert conditions"""
        
        # No face detected
        if not metrics.face_detected:
            metrics.add_alert(
                AlertType.NO_FACE_DETECTED,
                "Student not visible on camera",
                "high" if metrics.attention_score < 50 else "medium"
            )
        
        # Multiple faces
        elif metrics.multiple_faces_detected:
            metrics.add_alert(
                AlertType.MULTIPLE_FACES,
                "Multiple people detected in frame",
                "high"
            )
        
        # Looking away
        if not metrics.looking_at_screen:
            metrics.add_alert(
                AlertType.LOOKING_AWAY,
                f"Student looking {metrics.gaze_direction}",
                "medium"
            )
        
        # Low attention
        if metrics.attention_score < 40:
            metrics.add_alert(
                AlertType.LOW_ATTENTION,
                f"Attention score dropped to {metrics.attention_score:.0f}%",
                "high"
            )
    
    async def record_tab_switch(
        self,
        session_id: str,
        student_id: str
    ):
        """Record when student switches browser tab"""
        if session_id in self.session_metrics and student_id in self.session_metrics[session_id]:
            metrics = self.session_metrics[session_id][student_id]
            metrics.tab_switches_count += 1
            metrics.last_tab_switch = datetime.now(timezone.utc)
            metrics.add_alert(
                AlertType.TAB_SWITCH,
                "Student switched to different tab/window",
                "low"
            )
    
    async def record_participation(
        self,
        session_id: str,
        student_id: str,
        event_type: str  # "question", "answer", "chat", "hand_raise"
    ):
        """Record student participation event"""
        if session_id in self.session_metrics and student_id in self.session_metrics[session_id]:
            metrics = self.session_metrics[session_id][student_id]
            
            if event_type == "question":
                metrics.questions_asked += 1
            elif event_type == "answer":
                metrics.answers_given += 1
            elif event_type == "chat":
                metrics.chat_messages += 1
            elif event_type == "hand_raise":
                metrics.hand_raises += 1
            
            metrics.last_activity_timestamp = datetime.now(timezone.utc)
    
    async def update_camera_status(
        self,
        session_id: str,
        student_id: str,
        is_on: bool
    ):
        """Update camera on/off status"""
        if session_id in self.session_metrics and student_id in self.session_metrics[session_id]:
            self.session_metrics[session_id][student_id].is_camera_on = is_on
    
    async def update_mic_status(
        self,
        session_id: str,
        student_id: str,
        is_on: bool
    ):
        """Update microphone on/off status"""
        if session_id in self.session_metrics and student_id in self.session_metrics[session_id]:
            self.session_metrics[session_id][student_id].is_mic_on = is_on
    
    async def generate_engagement_report(self, session_id: str) -> Dict[str, Any]:
        """
        Generate comprehensive engagement report for session
        """
        if session_id not in self.session_metrics:
            return {"error": "Session not found"}
        
        students_metrics = self.session_metrics[session_id]
        
        # Calculate session-wide metrics
        if not students_metrics:
            return {"error": "No student data"}
        
        attention_scores = [m.attention_score for m in students_metrics.values()]
        avg_attention = sum(attention_scores) / len(attention_scores)
        
        # Engagement distribution
        status_counts = {"highly_engaged": 0, "engaged": 0, "neutral": 0, 
                        "disengaged": 0, "highly_disengaged": 0}
        for metrics in students_metrics.values():
            status = metrics.get_engagement_status().value
            status_counts[status] = status_counts.get(status, 0) + 1
        
        # Participation stats
        total_questions = sum(m.questions_asked for m in students_metrics.values())
        total_answers = sum(m.answers_given for m in students_metrics.values())
        total_tab_switches = sum(m.tab_switches_count for m in students_metrics.values())
        
        # Student breakdown
        student_reports = []
        for student_id, metrics in students_metrics.items():
            active_time = metrics.active_time_minutes
            total_time = metrics.total_session_time_minutes
            attendance_pct = (active_time / total_time * 100) if total_time > 0 else 0
            
            student_reports.append({
                "student_id": student_id,
                "student_name": metrics.student_name,
                "average_attention": round(metrics.attention_score, 1),
                "engagement_status": metrics.get_engagement_status().value,
                "attendance_percentage": round(attendance_pct, 1),
                "participation_score": self._calculate_participation_score(metrics),
                "questions_asked": metrics.questions_asked,
                "answers_given": metrics.answers_given,
                "tab_switches": metrics.tab_switches_count,
                "alerts_count": len(metrics.alerts),
                "recommendation": self._generate_recommendation(metrics)
            })
        
        # Sort by attention score
        student_reports.sort(key=lambda x: x["average_attention"], reverse=True)
        
        report = {
            "session_id": session_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_students": len(students_metrics),
                "average_attention": round(avg_attention, 1),
                "engagement_distribution": status_counts,
                "total_questions_asked": total_questions,
                "total_answers_given": total_answers,
                "total_tab_switches": total_tab_switches
            },
            "students": student_reports,
            "interventions_needed": [
                s for s in student_reports 
                if s["engagement_status"] in ["disengaged", "highly_disengaged"]
            ],
            "top_performers": student_reports[:3] if len(student_reports) >= 3 else student_reports
        }
        
        return report
    
    def _calculate_participation_score(self, metrics: EngagementMetrics) -> int:
        """Calculate participation score (0-100)"""
        score = 0
        
        # Base score for being present
        score += 20
        
        # Camera on bonus
        if metrics.is_camera_on:
            score += 10
        
        # Activity points
        score += min(30, (metrics.questions_asked + metrics.answers_given) * 5)
        score += min(20, metrics.chat_messages * 2)
        score += min(20, metrics.hand_raises * 5)
        
        return min(100, score)
    
    def _generate_recommendation(self, metrics: EngagementMetrics) -> str:
        """Generate intervention recommendation for student"""
        if metrics.attention_score >= 80:
            return "Excellent engagement. Continue current approach."
        elif metrics.attention_score >= 60:
            return "Good engagement. Encourage more participation."
        elif metrics.attention_score >= 40:
            return "Moderate engagement. Consider direct check-in."
        elif metrics.attention_score >= 20:
            return "Low engagement. Direct intervention recommended."
        else:
            return "Critical: Immediate attention needed."
    
    async def get_student_metrics(
        self,
        session_id: str,
        student_id: str
    ) -> Optional[EngagementMetrics]:
        """Get current metrics for specific student"""
        if session_id in self.session_metrics and student_id in self.session_metrics[session_id]:
            return self.session_metrics[session_id][student_id]
        return None
    
    async def get_session_metrics(self, session_id: str) -> Dict[str, EngagementMetrics]:
        """Get all student metrics for a session"""
        return self.session_metrics.get(session_id, {})


# Singleton instance
engagement_tracker = EngagementTracker()
