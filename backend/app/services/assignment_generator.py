"""
Assignment Generator Service
Auto-generates personalized assignments from session content
Uses: LLM + Session transcript + Student profiles + Bloom's Taxonomy
"""

import uuid
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from enum import Enum

from app.models.session import TeachingSession
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)


class QuestionType(str, Enum):
    """Types of assignment questions"""
    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"
    SHORT_ANSWER = "short_answer"
    LONG_ANSWER = "long_answer"
    PROBLEM_SOLVING = "problem_solving"
    MATCHING = "matching"
    FILL_IN_BLANK = "fill_in_blank"
    ESSAY = "essay"


class BloomLevel(str, Enum):
    """Bloom's Taxonomy levels for cognitive complexity"""
    REMEMBER = "remember"       # Recall facts
    UNDERSTAND = "understand"   # Explain concepts
    APPLY = "apply"            # Use information
    ANALYZE = "analyze"        # Draw connections
    EVALUATE = "evaluate"      # Justify decisions
    CREATE = "create"          # Produce new work


class AssignmentQuestion:
    """Single question in an assignment"""
    
    def __init__(
        self,
        id: str,
        question_type: QuestionType,
        question: str,
        options: Optional[List[str]] = None,
        correct_answer: Optional[str] = None,
        model_answer: Optional[str] = None,
        rubric: Optional[str] = None,
        difficulty: str = "medium",
        bloom_level: BloomLevel = BloomLevel.UNDERSTAND,
        concept_tested: str = "",
        points: int = 1,
        time_estimate_minutes: int = 2
    ):
        self.id = id
        self.question_type = question_type
        self.question = question
        self.options = options or []
        self.correct_answer = correct_answer
        self.model_answer = model_answer
        self.rubric = rubric
        self.difficulty = difficulty
        self.bloom_level = bloom_level
        self.concept_tested = concept_tested
        self.points = points
        self.time_estimate_minutes = time_estimate_minutes
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "question_type": self.question_type.value,
            "question": self.question,
            "options": self.options,
            "correct_answer": self.correct_answer,
            "model_answer": self.model_answer,
            "rubric": self.rubric,
            "difficulty": self.difficulty,
            "bloom_level": self.bloom_level.value,
            "concept_tested": self.concept_tested,
            "points": self.points,
            "time_estimate_minutes": self.time_estimate_minutes
        }


class GeneratedAssignment:
    """Complete generated assignment"""
    
    def __init__(
        self,
        id: str,
        session_id: str,
        teacher_id: str,
        title: str,
        description: str,
        questions: List[AssignmentQuestion],
        total_points: int,
        time_limit_minutes: Optional[int],
        difficulty_distribution: Dict[str, int],
        bloom_distribution: Dict[str, int],
        personalized_for: Dict[str, List[str]],  # student_id -> question_ids
        instructions: str,
        resources_allowed: List[str],
        created_at: datetime
    ):
        self.id = id
        self.session_id = session_id
        self.teacher_id = teacher_id
        self.title = title
        self.description = description
        self.questions = questions
        self.total_points = total_points
        self.time_limit_minutes = time_limit_minutes
        self.difficulty_distribution = difficulty_distribution
        self.bloom_distribution = bloom_distribution
        self.personalized_for = personalized_for
        self.instructions = instructions
        self.resources_allowed = resources_allowed
        self.created_at = created_at
        self.is_published = False
        self.published_at = None
        self.due_date = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "teacher_id": self.teacher_id,
            "title": self.title,
            "description": self.description,
            "questions": [q.to_dict() for q in self.questions],
            "total_points": self.total_points,
            "time_limit_minutes": self.time_limit_minutes,
            "difficulty_distribution": self.difficulty_distribution,
            "bloom_distribution": self.bloom_distribution,
            "personalized_for": self.personalized_for,
            "instructions": self.instructions,
            "resources_allowed": self.resources_allowed,
            "created_at": self.created_at.isoformat(),
            "is_published": self.is_published,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "due_date": self.due_date.isoformat() if self.due_date else None
        }


class AssignmentGenerator:
    """
    Generates personalized assignments from teaching sessions
    """
    
    def __init__(self):
        self.llm = llm_service
    
    async def generate_assignment(
        self,
        session: TeachingSession,
        question_count: int = 10,
        include_bloom_distribution: bool = True
    ) -> GeneratedAssignment:
        """
        Generate a complete assignment from session content
        
        Args:
            session: The teaching session
            question_count: Total number of questions (default: 10)
            include_bloom_distribution: Whether to distribute across Bloom's levels
        
        Returns:
            GeneratedAssignment object
        """
        logger.info(f"Generating assignment for session {session.id}")
        
        # Extract key concepts from session
        concepts = await self._extract_concepts(session)
        
        # Get session context
        subject = session.context.get("subject", "General")
        topic = session.context.get("topic", "General")
        education_level = session.context.get("education_level", "secondary")
        
        # Build assignment based on average student proficiency
        avg_proficiency = await self._calculate_avg_proficiency(session)
        
        # Determine difficulty distribution
        difficulty_dist = self._get_difficulty_distribution(
            avg_proficiency, 
            question_count
        )
        
        # Determine Bloom's taxonomy distribution
        bloom_dist = self._get_bloom_distribution(question_count) if include_bloom_distribution else None
        
        # Generate questions
        questions = await self._generate_questions(
            concepts=concepts,
            subject=subject,
            topic=topic,
            education_level=education_level,
            difficulty_distribution=difficulty_dist,
            bloom_distribution=bloom_dist,
            session_transcript=session.transcript
        )
        
        # Calculate total points
        total_points = sum(q.points for q in questions)
        
        # Estimate time limit
        time_limit = sum(q.time_estimate_minutes for q in questions) + 5  # +5 min buffer
        
        # Create assignment
        assignment = GeneratedAssignment(
            id=str(uuid.uuid4()),
            session_id=str(session.id),
            teacher_id=str(session.teacher_id),
            title=f"Assignment: {topic}",
            description=f"Practice questions covering today's lesson on {topic}. Complete all questions and show your work where required.",
            questions=questions,
            total_points=total_points,
            time_limit_minutes=time_limit,
            difficulty_distribution=difficulty_dist,
            bloom_distribution=bloom_dist or {},
            personalized_for={},  # Will be populated later
            instructions="Read each question carefully. Show all your work for problem-solving questions. You can use your notes and calculator.",
            resources_allowed=["notes", "calculator"],
            created_at=datetime.now(timezone.utc)
        )
        
        # Personalize for each student
        assignment.personalized_for = await self._personalize_assignment(
            assignment, 
            session
        )
        
        logger.info(f"Generated assignment with {len(questions)} questions")
        
        return assignment
    
    async def _extract_concepts(self, session: TeachingSession) -> List[str]:
        """
        Extract key concepts from session content
        """
        # Get concepts from various sources
        concepts = []
        
        # From learning objectives
        concepts.extend(session.context.get("learning_objectives", []))
        
        # From key moments
        for moment in session.key_moments:
            if "concept" in moment:
                concepts.append(moment["concept"])
        
        # From transcript (simplified)
        if session.transcript:
            # In production, use NLP to extract key concepts
            # For now, use the topic as main concept
            concepts.append(session.context.get("topic", "Main Topic"))
        
        # Remove duplicates while preserving order
        seen = set()
        unique_concepts = []
        for c in concepts:
            if c and c.lower() not in seen:
                seen.add(c.lower())
                unique_concepts.append(c)
        
        return unique_concepts[:5]  # Top 5 concepts
    
    async def _calculate_avg_proficiency(self, session: TeachingSession) -> float:
        """
        Calculate average student proficiency for the subject
        """
        student_profiles = session.context.get("student_profiles", {})
        subject = session.context.get("subject", "")
        
        if not student_profiles:
            return 0.5  # Default moderate
        
        proficiencies = []
        for profile in student_profiles.values():
            subject_prof = profile.get("subject_proficiency", {})
            if subject in subject_prof:
                proficiencies.append(subject_prof[subject])
        
        if not proficiencies:
            return 0.5
        
        return sum(proficiencies) / len(proficiencies)
    
    def _get_difficulty_distribution(
        self, 
        proficiency: float, 
        total_questions: int
    ) -> Dict[str, int]:
        """
        Determine question difficulty distribution based on proficiency
        
        Args:
            proficiency: 0.0 to 1.0
            total_questions: Total number of questions
        
        Returns:
            Dict with counts for each difficulty
        """
        if proficiency < 0.4:
            # Beginners: More easy questions
            return {
                "easy": int(total_questions * 0.5),
                "medium": int(total_questions * 0.3),
                "hard": int(total_questions * 0.2)
            }
        elif proficiency < 0.7:
            # Intermediate: Balanced
            return {
                "easy": int(total_questions * 0.3),
                "medium": int(total_questions * 0.4),
                "hard": int(total_questions * 0.3)
            }
        else:
            # Advanced: More hard questions
            return {
                "easy": int(total_questions * 0.2),
                "medium": int(total_questions * 0.3),
                "hard": int(total_questions * 0.5)
            }
    
    def _get_bloom_distribution(self, total_questions: int) -> Dict[str, int]:
        """
        Distribute questions across Bloom's taxonomy levels
        Focus on Understand, Apply, and Analyze
        """
        return {
            "remember": max(1, int(total_questions * 0.1)),      # 10%
            "understand": max(1, int(total_questions * 0.25)),   # 25%
            "apply": max(1, int(total_questions * 0.3)),         # 30%
            "analyze": max(2, int(total_questions * 0.25)),      # 25%
            "evaluate": max(1, int(total_questions * 0.05)),     # 5%
            "create": max(1, int(total_questions * 0.05))        # 5%
        }
    
    async def _generate_questions(
        self,
        concepts: List[str],
        subject: str,
        topic: str,
        education_level: str,
        difficulty_distribution: Dict[str, int],
        bloom_distribution: Optional[Dict[str, int]],
        session_transcript: List[Dict[str, Any]]
    ) -> List[AssignmentQuestion]:
        """
        Generate questions using LLM
        """
        questions = []
        
        # Build prompt for LLM
        prompt = self._build_question_generation_prompt(
            concepts=concepts,
            subject=subject,
            topic=topic,
            education_level=education_level,
            difficulty_distribution=difficulty_distribution,
            bloom_distribution=bloom_distribution,
            transcript=session_transcript
        )
        
        # Generate with LLM
        response = await self.llm.generate(
            prompt=prompt,
            temperature=0.7,
            max_tokens=2000
        )
        
        # Parse response
        try:
            questions_data = json.loads(response)
            
            for q_data in questions_data.get("questions", []):
                question = AssignmentQuestion(
                    id=str(uuid.uuid4()),
                    question_type=QuestionType(q_data["type"]),
                    question=q_data["question"],
                    options=q_data.get("options"),
                    correct_answer=q_data.get("correct_answer"),
                    model_answer=q_data.get("model_answer"),
                    rubric=q_data.get("rubric"),
                    difficulty=q_data["difficulty"],
                    bloom_level=BloomLevel(q_data["bloom_level"]),
                    concept_tested=q_data["concept"],
                    points=q_data.get("points", 1),
                    time_estimate_minutes=q_data.get("time_estimate", 2)
                )
                questions.append(question)
        
        except json.JSONDecodeError:
            logger.error("Failed to parse LLM response as JSON")
            # Fallback: Create simple questions
            questions = self._create_fallback_questions(concepts)
        
        return questions
    
    def _build_question_generation_prompt(
        self,
        concepts: List[str],
        subject: str,
        topic: str,
        education_level: str,
        difficulty_distribution: Dict[str, int],
        bloom_distribution: Optional[Dict[str, int]],
        transcript: List[Dict[str, Any]]
    ) -> str:
        """Build comprehensive prompt for question generation"""
        
        # Get sample transcript text
        transcript_text = ""
        if transcript:
            samples = transcript[-5:]  # Last 5 entries
            transcript_text = "\n".join([t.get("text", "") for t in samples])
        
        prompt = f"""You are an expert educational assessment creator for Nigerian students.

Create a comprehensive assignment for:
- Subject: {subject}
- Topic: {topic}
- Education Level: {education_level}

Key Concepts Covered:
{chr(10).join(f"- {c}" for c in concepts)}

Sample from Lesson:
{transcript_text[:500]}...

Difficulty Distribution:
- Easy: {difficulty_distribution.get('easy', 0)} questions (recall, basic understanding)
- Medium: {difficulty_distribution.get('medium', 0)} questions (application, some analysis)
- Hard: {difficulty_distribution.get('hard', 0)} questions (complex analysis, evaluation)
"""
        
        if bloom_distribution:
            prompt += f"""
Bloom's Taxonomy Distribution:
- Remember: {bloom_distribution.get('remember', 0)} (recall facts)
- Understand: {bloom_distribution.get('understand', 0)} (explain concepts)
- Apply: {bloom_distribution.get('apply', 0)} (use in new situations)
- Analyze: {bloom_distribution.get('analyze', 0)} (draw connections)
- Evaluate: {bloom_distribution.get('evaluate', 0)} (justify decisions)
- Create: {bloom_distribution.get('create', 0)} (produce new work)
"""
        
        prompt += """
Instructions:
1. Create questions that directly test the concepts listed above
2. Include a mix of question types: multiple_choice, short_answer, problem_solving
3. Ensure questions are appropriate for Nigerian students (use local context where relevant)
4. Each question must specify:
   - type (multiple_choice, short_answer, problem_solving, etc.)
   - question (the actual question text)
   - options (for multiple choice)
   - correct_answer (for auto-grading)
   - model_answer (for open-ended questions)
   - difficulty (easy/medium/hard)
   - bloom_level (remember/understand/apply/analyze/evaluate/create)
   - concept (which concept it tests)
   - points (1-5 based on difficulty)
   - time_estimate (minutes to answer)

Format your response as JSON:
{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "Which of the following best defines the main concept discussed in today's lesson?",
      "options": ["Option A", "Option B", "Option C"],
      "correct_answer": "Option A",
      "difficulty": "easy",
      "bloom_level": "remember",
      "concept": "[Concept Name]",
      "points": 1,
      "time_estimate": 1
    },
    ...
  ]
}

Make questions clear, unambiguous, and educationally valuable."""
        
        return prompt
    
    async def _personalize_assignment(
        self,
        assignment: GeneratedAssignment,
        session: TeachingSession
    ) -> Dict[str, List[str]]:
        """
        Personalize assignment for each student based on their proficiency
        """
        personalized = {}
        student_profiles = session.context.get("student_profiles", {})
        subject = session.context.get("subject", "")
        
        for student_id, profile in student_profiles.items():
            # Get student's proficiency
            proficiency = profile.get("subject_proficiency", {}).get(subject, 0.5)
            
            # Select questions appropriate for their level
            selected_questions = []
            
            if proficiency < 0.4:
                # Beginner: Focus on easy and some medium
                for q in assignment.questions:
                    if q.difficulty in ["easy", "medium"]:
                        selected_questions.append(q.id)
            elif proficiency < 0.7:
                # Intermediate: Mix of all difficulties
                for q in assignment.questions:
                    selected_questions.append(q.id)
            else:
                # Advanced: Focus on medium and hard
                for q in assignment.questions:
                    if q.difficulty in ["medium", "hard"]:
                        selected_questions.append(q.id)
            
            personalized[student_id] = selected_questions
        
        return personalized
    
    def _create_fallback_questions(self, concepts: List[str]) -> List[AssignmentQuestion]:
        """Create simple fallback questions if LLM fails"""
        questions = []
        
        for i, concept in enumerate(concepts[:3]):
            # Create a simple recall question
            q = AssignmentQuestion(
                id=str(uuid.uuid4()),
                question_type=QuestionType.SHORT_ANSWER,
                question=f"Explain the concept of {concept} in your own words.",
                model_answer=f"A good explanation of {concept} would include...",
                difficulty="medium",
                bloom_level=BloomLevel.UNDERSTAND,
                concept_tested=concept,
                points=2,
                time_estimate_minutes=3
            )
            questions.append(q)
        
        return questions
    
    async def regenerate_question(
        self,
        concept: str,
        difficulty: str,
        bloom_level: BloomLevel,
        question_type: QuestionType
    ) -> AssignmentQuestion:
        """
        Regenerate a specific question with different wording
        """
        prompt = f"""Generate a {difficulty} {question_type.value} question that tests understanding of: {concept}

Bloom's Level: {bloom_level.value}

Format as JSON:
{{
  "question": "...",
  "options": [...],  # if multiple choice
  "correct_answer": "...",
  "model_answer": "...",
  "points": 1,
  "time_estimate": 2
}}"""
        
        response = await self.llm.generate(prompt, temperature=0.8)
        
        try:
            data = json.loads(response)
            
            return AssignmentQuestion(
                id=str(uuid.uuid4()),
                question_type=question_type,
                question=data["question"],
                options=data.get("options"),
                correct_answer=data.get("correct_answer"),
                model_answer=data.get("model_answer"),
                difficulty=difficulty,
                bloom_level=bloom_level,
                concept_tested=concept,
                points=data.get("points", 1),
                time_estimate_minutes=data.get("time_estimate", 2)
            )
        except:
            # Fallback
            return AssignmentQuestion(
                id=str(uuid.uuid4()),
                question_type=QuestionType.SHORT_ANSWER,
                question=f"Explain {concept}.",
                difficulty=difficulty,
                bloom_level=bloom_level,
                concept_tested=concept
            )


# Singleton instance
assignment_generator = AssignmentGenerator()
