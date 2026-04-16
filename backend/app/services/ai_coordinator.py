"""
AI Coordinator Service
Coordinates all AI services during a live teaching session
Manages: STT → Analysis → LLM → TTS pipeline
"""

import os
import json
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from enum import Enum

from app.models.session import TeachingSession, AIConfigModel
from app.services.llm_service import llm_service
from app.services.tutor_persona import get_persona, is_gibberish, is_low_engagement
from app.services.video_service import search_educational_videos

# ---------------------------------------------------------------------------
# Prompt construction utilities for AI Tutor
# ---------------------------------------------------------------------------

BASE_SYSTEM_PROMPT = (
    "You are an AI Tutor for EduNexus. Your role is to guide a {education_level} student named {student_name} "
    "through the topic '{topic}' in the subject '{subject}'. The student’s learning style is {learning_style} "
    "and their proficiency in this subject is {proficiency}%."
    "\n\nGuidelines:\n"
    "- Friendly, encouraging tone. Use the student's name approximately every 2‑3 messages.\n"
    "- Provide concise explanations (max 3 sentences). End each logical chunk with the marker '---NEXT---'.\n"
    "- After every explanation, always ask a reflective question and prepend it with '---QUESTION---'.\n"
    "- Generate call‑to‑action suggestions (examples, videos, exercises) and prepend them with '---CTA---'.\n"
    "- If relevant, suggest up to 2 educational videos. Precede the list with '---VIDEO---' and format each as '[title](url)'.\n"
    "- Never include <thinking> tags or internal reasoning. Keep responses within a reasonable token budget.\n"
    "- Avoid disallowed content."
)

def build_system_prompt(
    student_name: str,
    education_level: str,
    subject: str,
    topic: str,
    learning_style: str = "general",
    proficiency: float = 0.5,
) -> str:
    """Construct the system prompt for the LLM.
    All dynamic values are injected safely.
    """
    return BASE_SYSTEM_PROMPT.format(
        student_name=student_name,
        education_level=education_level,
        subject=subject,
        topic=topic,
        learning_style=learning_style,
        proficiency=int(proficiency * 100),
    )


logger = logging.getLogger(__name__)

import re


def strip_thinking_tags(text: str) -> str:
    """
    Remove <thinking>...</thinking> blocks
    from LLM output. Some models (e.g.
    DeepSeek, o1-style) output reasoning
    in these tags — students must never
    see them.
    """
    # Strip full thinking blocks
    cleaned = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.DOTALL)
    # Also strip any orphaned opening tags
    cleaned = re.sub(r"<thinking>.*$", "", cleaned, flags=re.DOTALL)
    return cleaned.strip()


class ExplanationType(str, Enum):
    """Types of AI-generated explanations"""

    CONCEPT_BREAKDOWN = "concept_breakdown"
    ANALOGY = "analogy"
    STEP_BY_STEP = "step_by_step"
    VISUAL_DESCRIPTION = "visual_description"
    REAL_WORLD_EXAMPLE = "real_world_example"
    COMMON_MISTAKE = "common_mistake"
    SIMPLIFIED = "simplified"


class AIExplanation:
    """AI-generated explanation model"""

    def __init__(
        self,
        id: str,
        session_id: str,
        concept: str,
        explanation_type: ExplanationType,
        content: str,
        trigger_type: str,
        triggered_by: Optional[str] = None,
        trigger_text: str = "",
        difficulty_level: str = "intermediate",
        adapted_for_learning_style: Optional[str] = None,
        adapted_for_proficiency: Optional[float] = None,
        local_examples: List[str] = None,
        has_audio: bool = False,
        audio_url: Optional[str] = None,
        model_used: str = "",
        generation_time_ms: int = 0,
    ):
        self.id = id
        self.session_id = session_id
        self.concept = concept
        self.explanation_type = explanation_type
        self.content = content
        self.trigger_type = trigger_type
        self.triggered_by = triggered_by
        self.trigger_text = trigger_text
        self.difficulty_level = difficulty_level
        self.adapted_for_learning_style = adapted_for_learning_style
        self.adapted_for_proficiency = adapted_for_proficiency
        self.local_examples = local_examples or []
        self.has_audio = has_audio
        self.audio_url = audio_url
        self.model_used = model_used
        self.generation_time_ms = generation_time_ms
        self.created_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "concept": self.concept,
            "explanation_type": self.explanation_type.value,
            "content": self.content,
            "trigger_type": self.trigger_type,
            "triggered_by": self.triggered_by,
            "trigger_text": self.trigger_text,
            "difficulty_level": self.difficulty_level,
            "adapted_for_learning_style": self.adapted_for_learning_style,
            "adapted_for_proficiency": self.adapted_for_proficiency,
            "local_examples": self.local_examples,
            "has_audio": self.has_audio,
            "audio_url": self.audio_url,
            "model_used": self.model_used,
            "generation_time_ms": self.generation_time_ms,
            "created_at": self.created_at.isoformat(),
        }


class WhisperService:
    """
    Speech-to-Text service using Whisper.cpp
    Open source, self-hosted, fast
    """

    def __init__(self):
        self.enabled = True
        self.model_size = os.getenv(
            "WHISPER_MODEL", "base"
        )  # tiny, base, small, medium, large
        self.service_url = os.getenv("WHISPER_URL", "http://localhost:8001")

        # In production, this would be a Whisper.cpp server
        # For now, we'll use a mock implementation
        logger.info(f"WhisperService initialized with model: {self.model_size}")

    async def transcribe(self, audio_data: bytes) -> str:
        """
        Transcribe audio to text

        Args:
            audio_data: Audio bytes (WAV format recommended)

        Returns:
            Transcribed text
        """
        try:
            # In production, send to Whisper.cpp server
            # async with httpx.AsyncClient() as client:
            #     files = {'audio': ('audio.wav', audio_data, 'audio/wav')}
            #     response = await client.post(
            #         f"{self.service_url}/transcribe",
            #         files=files,
            #         timeout=30.0
            #     )
            #     result = response.json()
            #     return result.get("text", "")

            # Mock implementation for development
            await asyncio.sleep(0.1)  # Simulate processing
            return "Mock transcription: The teacher is explaining quadratic equations."

        except Exception as e:
            logger.error(f"Whisper transcription error: {e}")
            return ""

    async def transcribe_stream(self, audio_chunk: bytes) -> str:
        """
        Transcribe audio chunk for streaming
        Used for real-time transcription during live sessions
        """
        return await self.transcribe(audio_chunk)


class YouTubeService:
    """
    Service to find relevant YouTube videos for concepts
    Uses YouTube Data API v3
    """

    def __init__(self):
        self.api_key = os.getenv("YOUTUBE_API_KEY", "")
        self.enabled = bool(self.api_key)

        if not self.enabled:
            logger.warning("YOUTUBE_API_KEY not set. Video suggestions disabled.")

    async def search_videos(
        self, query: str, subject: str, topic: str, max_results: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Search for relevant educational videos

        Args:
            query: Search query (concept being taught)
            subject: Subject name (e.g., "Mathematics")
            topic: Topic name (e.g., "Algebra")
            max_results: Number of videos to return

        Returns:
            List of video information
        """
        if not self.enabled:
            # Return mock videos for development
            return [
                {
                    "id": f"mock_video_{i}",
                    "title": f"Understanding {query} - {subject}",
                    "description": f"Educational video about {query} for {topic}",
                    "thumbnail": f"https://img.youtube.com/vi/mock{i}/mqdefault.jpg",
                    "channel": "EduNexus Learning",
                    "duration": "8:30",
                }
                for i in range(max_results)
            ]

        try:
            # Integrate with the robust video search service
            results = await search_educational_videos(
                query=query,
                limit=max_results,
                subject=subject
            )
            return results

        except Exception as e:
            logger.error(f"YouTube search error: {e}")
            return []


class AICoordinator:
    """
    Main coordinator for AI services during a live session
    Manages the pipeline: STT → Analysis → LLM → TTS
    """

    def __init__(self):
        self.whisper = WhisperService()
        self.llm = llm_service
        self.youtube = YouTubeService()
        self.explanations_cache: Dict[
            str, List[AIExplanation]
        ] = {}  # session_id -> explanations

    async def process_teacher_speech(
        self, session: TeachingSession, audio_data: bytes
    ) -> Dict[str, Any]:
        """
        Process teacher's speech in real-time:
        1. Convert speech to text (STT)
        2. Analyze complexity
        3. Generate explanations if needed
        4. Suggest videos if relevant
        5. Return results to teacher dashboard

        Args:
            session: Current teaching session
            audio_data: Audio bytes from teacher

        Returns:
            Dictionary with transcript, complexity, explanation, video suggestions
        """
        ai_config = AIConfigModel(**session.ai_config)

        if not ai_config.stt_enabled:
            return {
                "status": "stt_disabled",
                "transcript": None,
                "complexity_score": 0,
                "explanation": None,
                "video_suggestions": None,
            }

        start_time = datetime.now(timezone.utc)

        # 1. Speech to Text
        transcript = await self.whisper.transcribe(audio_data)

        if not transcript:
            return {
                "status": "no_transcript",
                "transcript": None,
                "complexity_score": 0,
                "explanation": None,
                "video_suggestions": None,
            }

        result = {
            "status": "processed",
            "transcript": transcript,
            "complexity_score": 0,
            "explanation": None,
            "video_suggestions": None,
        }

        # 2. Analyze complexity if auto-explain is enabled
        if ai_config.auto_explain and ai_config.llm_enabled:
            complexity_score = await self._analyze_complexity(
                transcript, session.context
            )
            result["complexity_score"] = complexity_score

            # 3. Generate explanation if complexity is high
            if complexity_score > ai_config.explanation_threshold:
                explanation = await self.generate_explanation(
                    session=session,
                    concept=transcript[
                        :100
                    ],  # Use first 100 chars as concept identifier
                    trigger_text=transcript,
                    trigger_type="complexity_detected",
                )
                result["explanation"] = explanation.to_dict()

                # Add to session's generated explanations
                if session_id := str(session.id):
                    if session_id not in self.explanations_cache:
                        self.explanations_cache[session_id] = []
                    self.explanations_cache[session_id].append(explanation)

        # 4. Suggest videos if enabled and complexity warrants it
        if (
            ai_config.suggest_videos
            and result["complexity_score"] > ai_config.video_suggestion_threshold
        ):
            videos = await self._suggest_videos(transcript, session.context)
            result["video_suggestions"] = videos

        # 5. Add to session transcript
        await self._append_to_transcript(
            session, transcript, result["complexity_score"]
        )

        processing_time = (
            datetime.now(timezone.utc) - start_time
        ).total_seconds() * 1000
        result["processing_time_ms"] = int(processing_time)

        return result

    async def generate_explanation(
        self,
        session: TeachingSession,
        concept: str,
        explanation_type: ExplanationType = ExplanationType.CONCEPT_BREAKDOWN,
        trigger_text: str = "",
        trigger_type: str = "teacher_request",
        target_student_id: Optional[str] = None,
    ) -> AIExplanation:
        """
        Generate AI explanation for a concept

        Args:
            session: Teaching session context
            concept: The concept to explain
            explanation_type: Type of explanation to generate
            trigger_text: Text that triggered the explanation
            trigger_type: Why the explanation was triggered
            target_student_id: If personalizing for a specific student

        Returns:
            AIExplanation object
        """
        ai_config = AIConfigModel(**session.ai_config)

        # Build prompt with context
        prompt = build_system_prompt(
            student_name=session.context.get('student_name', 'Student'),
            education_level=session.context.get('education_level', 'unknown'),
            subject=session.context.get('subject', 'General'),
            topic=session.context.get('topic', 'General'),
            learning_style=learning_style or 'general',
            proficiency=proficiency or 0.5,
        )

        # Get student profile if personalizing
        learning_style = None
        proficiency = None
        if target_student_id:
            student_profiles = session.context.get("student_profiles", {})
            student_profile = student_profiles.get(target_student_id, {})
            learning_style = student_profile.get("learning_style")
            proficiency = student_profile.get("subject_proficiency", {}).get(
                session.context.get("subject", ""), 0.5
            )

        # Generate explanation
        start_time = datetime.now(timezone.utc)
        content = await self.llm.generate(
            prompt=prompt, 
            model=ai_config.llm_model, 
            temperature=0.7, 
            max_tokens=1024,
            user_id=session.teacher_id
        )
        # Append markers if they are not already present
        if not any(marker in content for marker in ["---NEXT---", "---QUESTION---", "---CTA---"]):
            content = content.strip() + MARKERS

        generation_time = int(
            (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        )

        # Adapt for learning style if needed
        if learning_style:
            content = await self._adapt_for_learning_style(content, learning_style)

        # Extract Nigerian/local examples
        local_examples = self._extract_local_examples(content)

        # Estimate difficulty level
        difficulty = self._estimate_difficulty(content, proficiency)

        # Create explanation object
        import uuid
        MARKERS = "\n---NEXT---\n---QUESTION---\n---CTA---"

        explanation = AIExplanation(
            id=str(uuid.uuid4()),
            session_id=str(session.id),
            concept=concept[:100],
            explanation_type=explanation_type,
            content=content,
            trigger_type=trigger_type,
            triggered_by=target_student_id,
            trigger_text=trigger_text,
            difficulty_level=difficulty,
            adapted_for_learning_style=learning_style,
            adapted_for_proficiency=proficiency,
            local_examples=local_examples,
            has_audio=False,  # TTS can be added later
            audio_url=None,
            model_used=ai_config.llm_model,
            generation_time_ms=generation_time,
        )

        logger.info(
            f"Generated explanation for '{concept[:50]}...' in {generation_time}ms"
        )

        return explanation

    async def _analyze_complexity(self, text: str, context: Dict[str, Any]) -> float:
        """
        Analyze text complexity to determine if explanation needed
        Returns score 0-1
        """
        prompt = f"""
        Analyze the complexity of this educational content for {context.get("education_level", "secondary")} students.
        
        Content: "{text}"
        Subject: {context.get("subject", "General")}
        Topic: {context.get("topic", "General")}
        
        Rate the complexity from 0.0 (very simple) to 1.0 (very complex).
        Consider:
        - Technical terminology
        - Conceptual difficulty
        - Prerequisites required
        - Abstraction level
        
        Return only a number between 0.0 and 1.0.
        """

        result = await self.llm.generate(prompt, max_tokens=10, user_id=context.get("teacher_id"))
        try:
            score = float(result.strip())
            return max(0.0, min(1.0, score))  # Clamp to 0-1
        except:
            return 0.5  # Default moderate complexity

    async def _suggest_videos(
        self, text: str, context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Find relevant YouTube videos for the concept
        """
        # Extract key concept from text
        concept = text[:100]  # Simplified - in production, use better extraction

        videos = await self.youtube.search_videos(
            query=concept,
            subject=context.get("subject", ""),
            topic=context.get("topic", ""),
            max_results=3,
        )

        return videos

    def _build_explanation_prompt(
        self,
        concept: str,
        explanation_type: ExplanationType,
        session_context: Dict[str, Any],
        target_student_id: Optional[str] = None,
    ) -> str:
        """Build context-rich prompt for explanation generation"""

        base_prompt = f"""You are the EduNexus AI Generalist.
Your goal is to provide QUICK, MINIMAL, and DIRECT information.

Create a brief explanation for: **{concept}**

Context:
- Subject: {session_context.get("subject", "General")}
- Topic: {session_context.get("topic", "General")}
- Education Level: {session_context.get("education_level", "Secondary")}
- Curriculum: {session_context.get("curriculum_type", "WAEC")}

ZERO-TO-HERO RULES:
- Be extremely concise.
- Use plain, everyday language.
- If the explanation requires more than 2 paragraphs, provide a 1-sentence summary and tell the student to "Register on EduNexus for the full 'Zero to Hero' masterclass on this topic."
"""

        # Add explanation type specific instructions
        type_instructions = {
            ExplanationType.CONCEPT_BREAKDOWN: """
Break down the concept starting from zero:
1. What is this in everyday terms? (plain language explanation)
2. What is the proper name for this? (introduce technical term)
3. Key components — explained simply, then named properly
4. How it works — step by step
5. Why it matters
Build from simple to complex. Use clear language.""",
            ExplanationType.ANALOGY: """
Create an analogy that relates this concept to everyday Nigerian life.
Examples:
- Market trading
- Farming/agriculture
- Transportation
- Cooking
- Sports
Make it relatable and memorable.""",
            ExplanationType.STEP_BY_STEP: """
Provide a step-by-step breakdown:
1. First, ...
2. Then, ...
3. Next, ...
4. Finally, ...
Make each step clear and actionable.""",
            ExplanationType.VISUAL_DESCRIPTION: """
Describe how this would look visually:
- What diagrams would help?
- What shapes, colors, or patterns are involved?
- How would you draw it step by step?
Help the student visualize the concept.""",
            ExplanationType.REAL_WORLD_EXAMPLE: """
Provide 2-3 real-world examples from Nigerian context:
1. Example from everyday life
2. Example from business/trade
3. Example from technology/science
Make them practical and relevant.""",
            ExplanationType.COMMON_MISTAKE: """
Address common mistakes students make:
1. What's the common misconception?
2. Why do students get this wrong?
3. How to avoid this mistake?
4. What's the correct approach?""",
            ExplanationType.SIMPLIFIED: """
Explain this as if to a 10-year-old:
- Use simple words
- Use everyday examples
- Break it into the simplest parts
- Avoid jargon""",
        }

        prompt = base_prompt + type_instructions.get(explanation_type, "")

        # Add personalization if specific student
        if target_student_id:
            prompt += f"""

Personalize for student {target_student_id}:
- Adapt to their learning style
- Consider their current proficiency level
- Use examples that would resonate with them"""

        # Add formatting instructions
        prompt += """

Format your response using markdown:
- Use headers (##) for sections
- Use **bold** for key terms
- Use bullet points for lists
- Include at least one Nigerian context example
- Keep it concise but comprehensive (max 400 words)"""

        return prompt

    async def _adapt_for_learning_style(self, content: str, learning_style: str) -> str:
        """
        Adapt explanation content for specific learning style
        """
        adaptations = {
            "visual": "Include more visual descriptions and mention diagrams/charts.",
            "auditory": "Use rhythmic patterns and suggest verbal repetition.",
            "kinesthetic": "Include hands-on activities and physical examples.",
            "reading": "Emphasize written explanations and suggest note-taking.",
        }

        # For now, just add a note - in production, regenerate with adaptation
        if learning_style in adaptations:
            content += f"\n\n*Note: This explanation is adapted for {learning_style} learners. {adaptations[learning_style]}*"

        return content

    def _extract_local_examples(self, content: str) -> List[str]:
        """
        Extract Nigerian/local examples from generated content
        """
        # Simple extraction - look for sentences with Nigerian keywords
        nigerian_keywords = [
            "nigeria",
            "nigerian",
            "lagos",
            "abuja",
            "kano",
            "ibadan",
            "market",
            "trading",
            "farm",
            "agriculture",
            "yam",
            "cassava",
            "okada",
            "keke",
            "suya",
            "jollof",
            "naira",
        ]

        examples = []
        sentences = content.split(".")

        for sentence in sentences:
            if any(keyword in sentence.lower() for keyword in nigerian_keywords):
                examples.append(sentence.strip())

        return examples[:3]  # Return top 3 examples

    def _estimate_difficulty(
        self, content: str, target_proficiency: Optional[float] = None
    ) -> str:
        """
        Estimate difficulty level of generated content
        """
        # Simple heuristic based on content length and vocabulary
        words = content.split()
        avg_word_length = sum(len(w) for w in words) / len(words) if words else 0

        if avg_word_length > 6:
            return "advanced"
        elif avg_word_length > 4.5:
            return "intermediate"
        else:
            return "beginner"

    async def _append_to_transcript(
        self, session: TeachingSession, text: str, complexity_score: float
    ):
        """
        Add transcription to session transcript
        """
        session.transcript.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "speaker": "teacher",
                "text": text,
                "complexity_score": complexity_score,
            }
        )

        # Force SQLAlchemy to detect change in JSON field
        session.transcript = list(session.transcript)

        # Update session in database would happen here
        # await self.db.commit()

    def get_session_explanations(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Get all explanations generated for a session
        """
        explanations = self.explanations_cache.get(session_id, [])
        return [exp.to_dict() for exp in explanations]

    def clear_session_cache(self, session_id: str):
        """
        Clear cached explanations when session ends
        """
        if session_id in self.explanations_cache:
            del self.explanations_cache[session_id]

    async def get_chat_response(
        self,
        messages: List[Dict[str, str]],
        student_profile: Optional[Any] = None,
        mode: str = "teaching",
        model: Optional[str] = None,
        temperature: float = 0.6,
        student_name: Optional[str] = None,
        subject_name: Optional[str] = None,
        topic_name: Optional[str] = None,
        user_id: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Adaptive chat response with persona and engagement detection.
        Refactored from ai.py for Batch 10.
        """
        if not messages:
            return {"response": "I didn't receive any message.", "needs_tts": False}

        # Get the latest user message
        user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_message = msg.get("content", "")
                break

        # 1. Select Persona
        education_level = (
            student_profile.education_level if student_profile else "jss_1"
        )
        persona = get_persona(education_level)

        # 2. Handle Gibberish
        if is_gibberish(user_message):
            gibberish_response = (
                f"Oops! Looks like your fingers slipped! \ud83d\ude04 "
                f"No worries, let's try again. What would you like to know?"
            )
            return {
                "response": f"{persona.emoji} **{persona.name}**: {gibberish_response}",
                "needs_tts": persona.use_tts,
                "persona": persona.__dict__,
            }

        # 3. Detect Low Engagement
        needs_intervention = is_low_engagement(user_message, messages)

        # 4. Build System Prompt & Calculate max_tokens
        if mode == "generalist":
            system_prompt = """You are the EduNexus AI Generalist. 
Your goal is to be minimal, short, and direct. 
Do NOT teach concepts or provide in-depth explanations. 
Tone: Professional, concise."""
            max_tokens = 100
        else:
            system_prompt = persona.system_prompt

            if student_name:
                system_prompt += f"\n\nSTUDENT NAME: {student_name}\nGREETING RULE: Greet the student by their name '{student_name}' if appropriate for the conversation state. Do NOT use generic terms like 'young friend' or 'dear student' if you know their actual name."

            # Inject Enrolled Subjects & Department for Exam/Secondary students
            if student_profile:
                if student_profile.department:
                    system_prompt += f"\nSTUDENT DEPARTMENT: {student_profile.department}"
                
                if student_profile.enrolled_subjects:
                    subjects_list = ", ".join(student_profile.enrolled_subjects)
                    system_prompt += f"\nENROLLED SUBJECTS/FOCUS: {subjects_list}"
                    system_prompt += "\nRULE: Prioritize examples and context from these specific subjects when explaining cross-cutting concepts."

            if subject_name and topic_name:
                system_prompt += f"\n\nCURRENT CONTEXT:\n- Subject: {subject_name}\n- Topic: {topic_name}\nSTRICT RULE: Focus your teaching and conversation ONLY on this topic. If the student asks about something else, politely redirect them back to {topic_name}."

            # Token cap based on persona
            # TTS personas need very short responses
            # Primary personas need enough to finish
            # a thought without mid-sentence cuts
            if persona.use_tts:
                max_tokens = 80  # Creche/Nursery/KG
            elif persona.name in ("Bello", "Zara"):
                max_tokens = 300  # Primary 1-6
            elif persona.name == "Coach Rex":
                max_tokens = 400  # JSS 1-3
            else:
                max_tokens = 500  # SS/Professional

            if needs_intervention:
                system_prompt += """
                
IMPORTANT: The student has given several short replies. They may be confused or bored. Do ONE of these right now:
1. Tell a very short fun story or analogy
2. Ask "What part is confusing you?"
3. Say "Let me show you a different way..."
Then explain the concept differently.
"""

            if mode == "teaching":
                system_prompt += """
                
CRITICAL RULE FOR MASTERY QUIZ:
If you have fully taught ALL the required concepts for the current topic, and the student has demonstrated a clear understanding, you MUST append the exact string [TRIGGER_MASTERY] at the very end of your response to test them. Do NOT trigger this too early. Wait until you have comprehensively reviewed the current topic.
"""

        # 5. Call LLM
        response = await self.llm.chat(
            messages=messages,
            model=model,
            temperature=temperature,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            user_id=user_id or (student_profile.user_id if student_profile else None),
        )
        response = strip_thinking_tags(response)

        # 6. Post-process response (Prefix for young learners)
        if persona.use_emoji and persona.name:
            # Smarter check to prevent double prefixing: if name or prefix is already in start of response
            prefix_plain = f"**{persona.name}**"
            if (
                prefix_plain not in response[:35]
                and f"{persona.name}:" not in response[:35]
            ):
                response = f"{persona.emoji} **{persona.name}**: {response}"


        return {
            "response": response,
            "needs_tts": persona.use_tts,
            "persona": {
                "name": persona.name,
                "emoji": persona.emoji,
                "education_level": education_level,
            },
        }


    async def generate_smart_prep(
        self,
        student_name: str,
        education_level: str,
        subject: str,
        topic: str,
        proficiency: float = 0.5,
        generate_assignments: bool = True,
        suggest_videos: bool = True,
        user_id: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Generates lesson materials (Outline, Pop Quiz, Assignment)
        """
        prompt = f"""
        Act as a "Smart Teaching Assistant" for a Nigerian teacher.
        Prepare lesson materials for '{student_name}' ({education_level}) on the topic '{topic}' in '{subject}'.
        The student's current proficiency is {proficiency*100}%.

        Generate the following in JSON format:
        1. "outline": A list of 3-5 clear teaching points for the teacher to follow.
        2. "pop_quiz": A 3-question multiple-choice quiz that the teacher can push to the student's screen.
           Each question must have:
           - "text": The question.
           - "options": ["Option A", "Option B", "Option C", "Option D"].
           - "correct_index": The index (0-3) of the correct answer.
           - "explanation": A brief explanation of why the answer is correct."""
           
        if generate_assignments:
            prompt += """\n        3. "assignment": A 1-sentence take-home task for the student."""
            
        if suggest_videos:
            prompt += """\n        4. "suggested_videos": A list of 1-3 highly relevant search terms to find YouTube videos for this topic."""

        prompt += """\n
        Make the content appropriate for the grade level and culturally relevant to Nigeria.
        Return ONLY a JSON object.
        """
        response = await self.llm.generate(prompt, temperature=0.7, format="json_object", user_id=user_id)
        try:
            data = json.loads(response)
            # Ensure it has the expected keys
            if "outline" not in data: data["outline"] = ["Overview", "Core Principles", "Practical Examples"]
            if "pop_quiz" not in data: data["pop_quiz"] = []
            if "assignment" not in data: data["assignment"] = "Research more on this topic."
            return data
        except Exception as e:
            logger.error(f"Failed to parse smart prep JSON: {e}")
            return {
                "outline": ["Introduction", "Core Concepts", "Examples", "Summary"],
                "pop_quiz": [],
                "assignment": "Review the topic at home."
            }


# Singleton instance
ai_coordinator = AICoordinator()
