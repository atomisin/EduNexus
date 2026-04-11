import httpx
import logging
from typing import Optional
from pathlib import Path
import uuid
from app.core.config import settings

logger = logging.getLogger(__name__)


class TTSService:
    """Text-to-Speech Service using external TTS server"""
    
    def __init__(self):
        self.enabled = settings.TTS_ENABLED
        self.service_url = "http://tts:8000"  # Docker service name
    
    async def generate_speech(
        self, 
        text: str, 
        language: str = "en",
        speaker_wav: Optional[str] = None
    ) -> Optional[str]:
        """Generate speech from text"""
        if not self.enabled:
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                payload = {
                    "text": text,
                    "language": language
                }
                
                if speaker_wav:
                    payload["speaker_wav"] = speaker_wav
                
                response = await client.post(
                    f"{self.service_url}/tts",
                    json=payload,
                    timeout=60.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("audio_url")
                else:
                    logger.error(f"TTS error: {response.status_code}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error generating speech: {e}")
            return None
    
    async def get_voices(self) -> list:
        """Get available voices"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.service_url}/voices")
                if response.status_code == 200:
                    return response.json().get("voices", [])
                return []
        except Exception as e:
            logger.error(f"Error getting voices: {e}")
            return []


class STTService:
    """Speech-to-Text Service using Whisper"""
    
    def __init__(self):
        self.enabled = settings.STT_ENABLED
        self.service_url = "http://whisper:8000"  # Docker service name
    
    async def transcribe(
        self, 
        audio_path: str,
        language: Optional[str] = None
    ) -> Optional[str]:
        """Transcribe audio to text"""
        if not self.enabled:
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                with open(audio_path, 'rb') as f:
                    files = {'audio': f}
                    data = {'language': language} if language else {}
                    
                    response = await client.post(
                        f"{self.service_url}/transcribe",
                        files=files,
                        data=data,
                        timeout=60.0
                    )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("text")
                else:
                    logger.error(f"STT error: {response.status_code}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}")
            return None
    
    async def transcribe_stream(
        self,
        audio_chunk: bytes,
        language: Optional[str] = None
    ) -> Optional[str]:
        """Transcribe audio chunk (for streaming)"""
        if not self.enabled:
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                files = {'audio': ('chunk.wav', audio_chunk, 'audio/wav')}
                data = {'language': language} if language else {}
                
                response = await client.post(
                    f"{self.service_url}/transcribe",
                    files=files,
                    data=data,
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    return response.json().get("text")
                return None
                
        except Exception as e:
            logger.error(f"Error in stream transcription: {e}")
            return None


# Global instances
tts_service = TTSService()
stt_service = STTService()