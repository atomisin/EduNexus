import json
import logging
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from typing import Optional, Dict, Any, List
from app.core.config import settings

logger = logging.getLogger(__name__)

# Maximum messages to include in LLM context
# Keeps last N exchanges to balance context 
# quality vs token cost
MAX_HISTORY_MESSAGES = 20

class LLMService:
    """Service for interacting with AI models using LiteLLM"""

    def __init__(self):
        # LiteLLM config
        self.primary_model = settings.LLM_PRIMARY_MODEL
        self.fast_model = settings.LLM_FAST_MODEL
        self.fallback_model = settings.LLM_FALLBACK_MODEL
        self.max_retries = settings.LLM_MAX_RETRIES
        self.timeout = settings.LLM_TIMEOUT_SECONDS
        
        # Circuit Breaker state
        self._failure_count = 0
        self._circuit_open_until: Optional[datetime] = None

    def _is_circuit_open(self) -> bool:
        """Check if circuit is currently open (failing)"""
        if self._circuit_open_until:
            if datetime.now(timezone.utc) < self._circuit_open_until:
                return True
            else:
                self._circuit_open_until = None
                self._failure_count = 0
        return False

    def _record_failure(self):
        """Record an API failure and potentially open the circuit"""
        self._failure_count += 1
        if self._failure_count >= 3:
            logger.error("LLM API Circuit Breaker OPENED")
            self._circuit_open_until = datetime.now(timezone.utc) + timedelta(minutes=5)
            
    def _record_success(self):
        """Reset circuit breaker on success"""
        self._failure_count = 0
        self._circuit_open_until = None

    def calculate_cost_microdollars(self, model: str, prompt_tokens: int, completion_tokens: int) -> int:
        """Calculate cost in microdollars (USD * 1,000,000)"""
        # Fallback to $0.05 per 1M tokens if litellm.completion_cost is not used
        # prompt_cost + completion_cost logic:
        prompt_cost = prompt_tokens * 0.05
        completion_cost = completion_tokens * 0.05
        return int(prompt_cost + completion_cost)

    def _log_usage(self, model: str, prompt_tokens: int, completion_tokens: int, total_tokens: int, cost_microdollars: int):
        import asyncio
        asyncio.create_task(self._async_log_usage(model, prompt_tokens, completion_tokens, total_tokens, cost_microdollars))

    async def _async_log_usage(self, model: str, prompt_tokens: int, completion_tokens: int, total_tokens: int, cost_microdollars: int):
        from app.db.database import AsyncSessionLocal
        from app.models.token_usage import TokenUsageLog
        try:
            async with AsyncSessionLocal() as db:
                log_entry = TokenUsageLog(
                    model=model,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    cost_microdollars=cost_microdollars
                )
                db.add(log_entry)
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to log token usage: {e}")


    def _prepare_messages(
        self,
        history: list[dict],
        system_prompt: str
    ) -> list[dict]:
        # System message always first
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Window the history — keep last N messages
        # Always keep pairs (user + assistant) to 
        # avoid orphaned messages
        windowed = history[-MAX_HISTORY_MESSAGES:]
        
        # If windowing cut a conversation, ensure 
        # the first message is from the user not 
        # assistant (LLMs expect user to start)
        if windowed and windowed[0].get("role") == "assistant":
            windowed = windowed[1:]
        
        messages.extend(windowed)
        return messages

    async def maybe_summarize_history(
        self,
        history: list[dict],
        threshold: int = 40
    ) -> list[dict]:
        if len(history) <= threshold:
            return history
        
        # Summarize the first half
        to_summarize = history[:len(history)//2]
        recent = history[len(history)//2:]
        
        summary_prompt = (
            "Summarize this conversation history "
            "in 3-5 sentences, preserving key facts "
            "the student learned:\n\n" +
            "\n".join([
                f"{m.get('role', '')}: {m.get('content', '')[:200]}" 
                for m in to_summarize
            ])
        )
        
        summary = await self.generate(
            prompt=summary_prompt,
            max_tokens=200
        )
        
        summary_message = {
            "role": "system",
            "content": f"[Earlier conversation summary: "
                       f"{summary}]"
        }
        
        return [summary_message] + recent

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        system_prompt: Optional[str] = None,
        format: Optional[str] = None,
    ) -> str:
        """Generate text using LiteLLM"""
        # Check circuit breaker
        if self._is_circuit_open():
            logger.warning("Circuit is open, failing fast")
            raise HTTPException(status_code=503, detail="AI_SERVICE_UNAVAILABLE")

        try:
            use_model = model or self.fast_model
            if use_model and ("/" not in use_model and len(use_model) < 60):
                # Map old bare models to groq/ prefix if needed
                if use_model == "llama-3.1-8b-instant" or use_model == self.model:
                    use_model = self.fast_model
            
            sys_prompt = system_prompt or "You are EduNexus, an AI educational assistant for Nigerian students. Be helpful, clear, and culturally sensitive."
            messages = self._prepare_messages(
                history=[{"role": "user", "content": prompt}],
                system_prompt=sys_prompt
            )

            kwargs = {
                "model": use_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "timeout": self.timeout,
            }
            if format == "json_object":
                kwargs["response_format"] = {"type": "json_object"}

            try:
                import litellm
                response = await litellm.acompletion(**kwargs)
                self._record_success()
                
                if hasattr(response, 'usage') and response.usage:
                    usage = response.usage
                    cost_micros = self.calculate_cost_microdollars(
                        model=use_model,
                        prompt_tokens=getattr(usage, 'prompt_tokens', 0),
                        completion_tokens=getattr(usage, 'completion_tokens', 0)
                    )
                    self._log_usage(
                        model=use_model,
                        prompt_tokens=getattr(usage, 'prompt_tokens', 0),
                        completion_tokens=getattr(usage, 'completion_tokens', 0),
                        total_tokens=getattr(usage, 'total_tokens', 0),
                        cost_microdollars=cost_micros
                    )
                
                return response.choices[0].message.content or ""
            except Exception as primary_e:
                logger.warning(f"Primary model {use_model} failed: {primary_e}. Trying fallback.")
                self._record_failure()
                
                # Try fallback
                kwargs["model"] = self.fallback_model
                try:
                    import litellm
                    fallback_res = await litellm.acompletion(**kwargs)
                    return fallback_res.choices[0].message.content or ""
                except Exception as fallback_e:
                    logger.error(f"Fallback model also failed: {fallback_e}")
                    raise HTTPException(status_code=503, detail="AI_SERVICE_UNAVAILABLE")

        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"LLM error in generate: {e}")
            raise HTTPException(status_code=503, detail="AI_SERVICE_UNAVAILABLE")

    def _fallback_response(self, prompt: str) -> str:
        """Provide educational response when LLM is unavailable.
        IMPORTANT: Never expose the raw prompt to the user.
        """
        # Extract concept name from the prompt intelligently
        concept = self._extract_concept_from_prompt(prompt)
        
        return f"""## {concept}

I'm currently in limited mode and cannot generate a full explanation right now.

For detailed content on **{concept}**, I recommend:
1. Checking your course materials and textbooks
2. Asking your teacher during the next session
3. Trying again in a few moments when AI services are restored

*The AI assistant will be fully operational shortly.*"""

    def _extract_concept_from_prompt(self, prompt: str) -> str:
        """Extract the concept/topic name from an AI prompt without leaking instructions."""
        # Try to extract from **bold** markers (e.g., "explanation for: **Data Science**")
        if "**" in prompt:
            parts = prompt.split("**")
            if len(parts) >= 2 and parts[1].strip():
                return parts[1].strip()
        
        # Try to extract from "Subject:" or "Topic:" lines
        for marker in ["Subject:", "Topic:"]:
            if marker in prompt:
                try:
                    line = [l for l in prompt.split("\n") if marker in l][0]
                    value = line.split(marker)[1].strip().strip('"').strip()
                    if value and value.lower() != "general":
                        return value
                except:
                    pass
        
        # Try to extract from "explanation for:" pattern
        if "explanation for:" in prompt.lower():
            try:
                after = prompt.lower().split("explanation for:")[1]
                concept = after.split("\n")[0].strip().strip('*').strip()
                if concept:
                    return concept
            except:
                pass
        
        return "this topic"

    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
        max_tokens: int = 300,
    ) -> str:
        """Chat completion using LiteLLM"""
        if self._is_circuit_open():
            logger.warning("Circuit is open, failing fast")
            raise HTTPException(status_code=503, detail="AI_SERVICE_UNAVAILABLE")

        try:
            use_model = model or self.fast_model
            if use_model and ("/" not in use_model and len(use_model) < 60):
                if use_model == "llama-3.1-8b-instant" or use_model == self.model:
                    use_model = self.fast_model

            # Summarize if needed
            summarized_messages = await self.maybe_summarize_history(messages)

            sys_prompt = system_prompt or "You are EduNexus, an AI educational assistant for Nigerian students. Be helpful, clear, and culturally sensitive."
            full_messages = self._prepare_messages(
                history=summarized_messages,
                system_prompt=sys_prompt
            )

            kwargs = {
                "model": use_model,
                "messages": full_messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "timeout": self.timeout,
            }

            try:
                import litellm
                response = await litellm.acompletion(**kwargs)
                self._record_success()
                
                if hasattr(response, 'usage') and response.usage:
                    usage = response.usage
                    cost_micros = self.calculate_cost_microdollars(
                        model=use_model,
                        prompt_tokens=getattr(usage, 'prompt_tokens', 0),
                        completion_tokens=getattr(usage, 'completion_tokens', 0)
                    )
                    self._log_usage(
                        model=use_model,
                        prompt_tokens=getattr(usage, 'prompt_tokens', 0),
                        completion_tokens=getattr(usage, 'completion_tokens', 0),
                        total_tokens=getattr(usage, 'total_tokens', 0),
                        cost_microdollars=cost_micros
                    )
                
                return response.choices[0].message.content or ""
            except Exception as primary_e:
                logger.warning(f"Primary model {use_model} chat failed: {primary_e}. Trying fallback.")
                self._record_failure()
                
                kwargs["model"] = self.fallback_model
                try:
                    import litellm
                    fallback_res = await litellm.acompletion(**kwargs)
                    return fallback_res.choices[0].message.content or ""
                except Exception as fallback_e:
                    logger.error(f"Fallback model chat also failed: {fallback_e}")
                    raise HTTPException(status_code=503, detail="AI_SERVICE_UNAVAILABLE")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error in chat: {e}")
            raise HTTPException(status_code=503, detail="AI_SERVICE_UNAVAILABLE")

    def _chat_fallback(self, messages: List[Dict[str, str]]) -> str:
        """Provide fallback response when Groq unavailable"""
        user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_message = msg.get("content", "").lower()
                break

        if not user_message:
            return "Hello! How can I help you learn today?"

        return self._fallback_response(user_message)

    async def generate_lesson_content(
        self,
        topic: str,
        subject: str,
        education_level: str,
        learning_style: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate educational content for a lesson"""

        style_instruction = ""
        if learning_style:
            if learning_style == "visual":
                style_instruction = (
                    "Include descriptions of diagrams, charts, and visual examples."
                )
            elif learning_style == "auditory":
                style_instruction = (
                    "Use rhythmic patterns, mnemonics, and explain as if speaking."
                )
            elif learning_style == "kinesthetic":
                style_instruction = (
                    "Include hands-on activities, experiments, and physical examples."
                )
            elif learning_style == "reading":
                style_instruction = (
                    "Provide detailed written explanations with references."
                )

        prompt = f"""Create a comprehensive lesson on '{topic}' for {education_level} level {subject}.

{style_instruction}

Format your response as JSON with the following structure:
{{
    "title": "Lesson title",
    "introduction": "Brief introduction",
    "content": "Main lesson content with examples",
    "key_points": ["point 1", "point 2", "point 3"],
    "examples": ["example 1", "example 2"],
    "practice_questions": ["question 1", "question 2"],
    "summary": "Brief summary"
}}

Make the content appropriate for Nigerian students and include local context where relevant."""

        response = await self.generate(prompt, temperature=0.8)

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {
                "title": topic,
                "content": response,
                "key_points": [],
                "examples": [],
                "practice_questions": [],
            }


    async def adapt_content_difficulty(
        self, content: str, proficiency: float, learning_style: Optional[str] = None
    ) -> str:
        """Adapt content difficulty based on proficiency"""

        if proficiency < 0.4:
            level = "beginner - simplify, use analogies, more explanations"
        elif proficiency < 0.7:
            level = "intermediate - balanced explanations with examples"
        else:
            level = "advanced - complex concepts, less hand-holding"

        style = f" Adapt for {learning_style} learning style." if learning_style else ""

        prompt = f"""Rewrite this educational content for a {level} student.{style}

Original content:
{content}

Provide the adapted version:"""

        return await self.generate(prompt, temperature=0.7)

    async def explain_concept(
        self,
        concept: str,
        context: Optional[str] = None,
        question: Optional[str] = None,
        student_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Explain a concept using a Socratic tutoring approach"""
        
        age_group = student_context.get("age_group", "teen") if student_context else "teen"
        edu_level = student_context.get("education_level", "secondary") if student_context else "secondary"
        
        system_prompt = f"""You are EduNexus AI, a professional academic tutor for a {age_group} student ({edu_level}).
Your goal: facilitate mastery through precise language and logical progression.

CORE TEACHING RULES (Follow in order):
1. ACADEMIC CLARITY: Start with a clear, authoritative one-sentence explanation of a single concept. 
2. GRADUAL TERMINOLOGY: Explain in plain language first, then introduce the technical term in **Bold**.
3. BREVITY: Limit total response to 2-3 concise sentences.
4. SCHOLARLY ANALOGY: Use ONE short example from engineering, biology, or social systems to illustrate the logic.
5. SOCRATIC QUESTION: End with ONE simple targeted question to verify understanding.
6. ENCOURAGEMENT: Use professional praise like "Excellent logic." or "Correctly identified."
Do NOT use casual filler, disclaimers, or emojis unless for small celebratory markers."""

        prompt = f"Explain the concept of '{concept}' starting from absolute basics. Assume the student knows nothing about it."
        if context:
            prompt += f"\nContext from current session: {context}"
        if question:
            prompt += f"\nStudent's specific question: {question}"

        prompt += "\n\nFirst explain in plain language, then introduce the technical term. End by asking the student to use the term or explain a part back to you."

        return await self.generate(prompt, temperature=0.7, system_prompt=system_prompt)

    async def evaluate_understanding(
        self,
        concept: str,
        student_explanation: str,
        student_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Evaluate a student's self-explanation and provide feedback"""
        
        age_group = student_context.get("age_group", "teen") if student_context else "teen"
        
        prompt = f"""
        Concept: {concept}
        Student's Explanation: "{student_explanation}"
        Student Age Group: {age_group}

        Evaluate the student's understanding. 
        1. If correct, celebrate and provide a small "XP boost" (mentally).
        2. If partially correct, praise the correct part and clarify the misconception.
        3. If incorrect, use a simplified Nigerian analogy to redirect them.

        Format JSON:
        {{
            "is_correct": bool,
            "feedback": "...",
            "next_question": "...",
            "xp_earned": int (0-50)
        }}
        """

        response = await self.generate(prompt, temperature=0.5, format="json_object")
        try:
            return json.loads(response)
        except:
            return {
                "is_correct": True,
                "feedback": "Great job explaining that!",
                "next_question": "Ready for the next topic?",
                "xp_earned": 10
            }


    async def generate_mastery_test(
        self,
        topic: str,
        subject: str,
        education_level: str,
        student_context: Optional[Dict[str, Any]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, Any]]:
        """Generate a 10-question adaptive mastery test"""
        
        age_group = student_context.get("age_group", "teen") if student_context else "teen"
        
        history_text = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in chat_history]) if chat_history else "No specific chat history provided."

        prompt = f"""
        Create a 10-question Mastery Test for the topic '{topic}' in {subject} at {education_level} level.
        Student Age Group: {age_group}

        CHAT HISTORY RECORD:
        ====================
        {history_text}
        ====================

        CRITICAL REQUIREMENT:
        - SYLLABUS ALIGNMENT: Questions must strictly cover the topic '{topic}' in the subject '{subject}' for {education_level} level in Nigeria.
        - CONTEXT PRIORITIZATION: Use the CHAT HISTORY RECORD above as your primary source for concepts, facts, and specific analogies discussed during the session.
        - SYLLABUS KNOWLEDGE: If the CHAT HISTORY is sparse, introductory, or insufficient to generate 10 rigorous, high-quality questions, you MUST leverage your broader academic knowledge of the official syllabus for this topic to fulfill the requirement.
        - NO REPETITION: Create entirely NEW mastery-level questions that test the concepts in different ways.
        - DRILL DEEP: Test for deep conceptual understanding (the "why") rather than surface-level recall (the "what").
        - PUSH LIMITS: The difficulty should be slightly above what was explicitly taught, requiring the student to apply logic to new scenarios.
        - AGE APPROPRIATENESS: Ensure the cognitive load and conceptual complexity are calibrated for the {age_group} group. Challenge their logic, but stay within their developmental "Zone of Proximal Development".

        Pedagogical Requirements:
        - Exactly 10 questions.
        - Difficulty must be ADAPTIVE and INCREASING:
            * Questions 1-3: EASY (Building blocks, vocabulary in context)
            * Questions 4-7: MEDIUM (Application of concepts, identifying relationships between ideas)
            * Questions 8-10: HARD (Critical thinking, multi-step problem solving, complex synthesis. These must be intellectually "heavy" to build mental strength.)
        - Each question must have:
            1. A clear question text.
            2. 4 distinct options (A, B, C, D).
            3. The correct option label.
            4. A short explanation of why it's correct. Use creative, concrete Nigerian analogies (e.g., traffic, construction, markets, music, tech) to clarify the logic. AVOID repetitive fruit examples like mangoes.
            5. A difficulty level label ('easy', 'medium', 'hard').

        Exactly 10 questions.
        OUTPUT FORMAT: JSON array only.
        IMPORTANT: Do not include trailing backslashes, escape sequences outside of strings, or any conversational filler.
        Ensure every option is properly closed with quotes.
        
        Format as JSON array:
        [
          {{
            "id": "q1",
            "text": "...",
            "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
            "correct_option": "A",
            "explanation": "...",
            "difficulty": "easy"
          }},
          ...
        ]
        """

        response = await self.generate(prompt, model=self.primary_model, temperature=0.5, format="json_object")
        try:
            questions = json.loads(response)
            if isinstance(questions, list):
                return questions
            elif isinstance(questions, dict) and "questions" in questions:
                return questions["questions"]
            return []
        except:
            logger.error("Failed to parse mastery test JSON")
            return []

    async def generate_subtopics(
        self,
        topic: str,
        subject: str,
        education_level: str = "secondary",
        grade_level: str = "",
    ) -> List[str]:
        """Generate 4-6 granular subtopics for a given topic and education level"""
        
        prompt = f"""
        Act as a "Zero to Hero" Curriculum Architect. 
        Break down the topic '{topic}' in the subject '{subject}' into exactly 4-6 structured subtopics that form a PROGRESSIVE LEARNING PATH for a student at the {education_level} level {f'({grade_level})' if grade_level else ''}.
        
        CRITICAL TASK: The user may have misspelled the topic '{topic}'. You MUST correct any spelling or grammatical errors in the topic name before proceeding.
        
        ZERO-TO-HERO REQUIREMENTS:
        1. START FROM ZERO: The first subtopic must be the absolute foundation — the most basic "What is this?" starting point. Assume the student knows NOTHING.
        2. PROGRESSIVE BUILDING: Each subsequent subtopic builds on the previous one, gradually increasing in depth and complexity. The journey should feel natural and logical.
        3. TERMINOLOGY IN NAMES: Subtopic names should include the proper technical terms, but be clear and accessible (e.g., instead of just "Organelles & Metabolic Specialization", use "Cell Parts: Understanding Organelles & Their Jobs").
        4. COMPLETE JOURNEY: The final subtopic should represent mastery-level understanding — synthesis, application, or advanced analysis.
        5. ADAPTIVE DEPTH: The ceiling of complexity MUST be calibrated for the {education_level} level. Start from absolute basics but reach the highest level appropriate for their grade.
        
        Format your response ONLY as a JSON object with two keys: 
        1. 'corrected_topic': A string containing the formally corrected spelling of the topic (e.g., 'Python Programming' instead of 'Python Programmimg').
        2. 'subtopics': An array of strings representing the subtopics.
        {{"corrected_topic": "Corrected Topic Name", "subtopics": ["Foundation Subtopic", "Building Block Subtopic", "Deeper Subtopic", "Mastery Subtopic"]}}
        """
        
        response = await self.generate(prompt, temperature=0.5, format="json_object")
        try:
            data = json.loads(response)
            corrected_topic = data.get("corrected_topic", topic)
            subtopics = data.get("subtopics", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            if isinstance(subtopics, list) and len(subtopics) > 0:
                return {"corrected_topic": corrected_topic, "subtopics": subtopics[:6]}  # Limit to 6
            logger.error(f"Generate Subtopics yielded empty array. Raw response: {response}")
            return {"corrected_topic": corrected_topic, "subtopics": []}
        except Exception as e:
            logger.error(f"Failed to parse subtopics JSON. Error: {e}. Raw response: {response}")
            return []

    async def evaluate_mastery_test(
        self,
        topic: str,
        results: List[Dict[str, Any]],
        student_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Evaluate full test results and provide a summary with personalized feedback"""
        
        total_questions = len(results)
        correct_count = sum(1 for r in results if r.get("is_correct"))
        score_percentage = (correct_count / total_questions * 100) if total_questions > 0 else 0
        
        # Difficulty breakdown
        hard_correct = sum(1 for r in results if r.get("difficulty") == "hard" and r.get("is_correct"))
        hard_total = sum(1 for r in results if r.get("difficulty") == "hard")
        
        age_group = student_context.get("age_group", "teen") if student_context else "teen"
        
        # Round percentage for clean display and logic alignment
        rounded_percentage = round(score_percentage)
        
        # Determine mastery level using rounded percentage
        mastery_level = "Beginner"
        if rounded_percentage >= 90: mastery_level = "Master"
        elif rounded_percentage >= 80: mastery_level = "Advanced"
        elif rounded_percentage >= 70: mastery_level = "Proficient"
        elif rounded_percentage >= 50: mastery_level = "Developing"

        prompt = f"""
        Evaluate a student's performance on a 10-question test for topic '{topic}'.
        Score: {correct_count}/{total_questions} ({score_percentage}%)
        Mastery Level: {mastery_level}
        Hard Questions Correct: {hard_correct}/{hard_total}
        Student Age Group: {age_group}

        Write a concise, structural "**Diagnostic Feedback**" report.
        
        Requirements:
        1. HEADER: Start with "**Diagnostic Feedback**" followed by a newline.
        2. SALUTATION: Include "Dear Student," on its own separate line directly below the header.
        3. NO FORMAL SIGN-OFF: Do NOT include any formal letter sign-off like "Sincerely, [Your Name]". End with a final encouraging thought or summarizing sentence.
        4. CLEAN STRUCTURE: Use clear, analytical paragraphs. Avoid the redundant "Teacher's" or "Teacher's Diagnostic Feedback" phrasing within the text.
        5. ANALYTICAL TONE: Focus on "Depth of Understanding" and "Conceptual Logic" rather than just the number of correct answers.
        6. DRILL DEEP: Specifically analyze their performance on "Hard" questions. Did they synthesize information or just recall?
        7. STRETCH GOAL: If the score is > 85%, provide a specific "Advanced Stretch Goal" (a complex topic or research question to explore next). 
        8. REVISION GUIDANCE: If they failed, identify the specific conceptual "Why" they missed.
        9. Keep it professional yet encouraging (Nigerian Academic Excellence style).
        10. ANALOGY RULE: If using examples to explain a concept, be creative and concrete. Avoid overusing fruits or simple counting; use themes of engineering, societal systems, or craftsmanship.
        """

        feedback = await self.generate(prompt, temperature=0.7)
        
        return {
            "score": correct_count,
            "total": total_questions,
            "percentage": rounded_percentage,
            "mastery_level": mastery_level,
            "feedback": feedback,
            "passed": rounded_percentage >= 70,
            "detailed_results": results,
            "is_elite_performance": rounded_percentage >= 95
        }


llm_service = LLMService()
