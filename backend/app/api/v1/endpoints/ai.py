from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
import uuid
import traceback
import re

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.student import StudentProfile
from app.models.student_progress import StudentActivityLog, StudentSubjectProgress
from app.models.subject import Subject, Topic
from app.models.junction_tables import StudentTopicProgress
from app.services.llm_service import llm_service
from app.services.ai_service import tts_service, stt_service
from app.utils.validators import sanitize_user_input
from fastapi import Request, BackgroundTasks
from slowapi.util import get_remote_address
from jose import jwt, JWTError
from app.core.config import settings
from app.services.ai_coordinator import ai_coordinator
from app.services.revision_context import get_revision_context, get_subject_and_topic
from app.services.lesson_plan_service import get_or_create_lesson_teaching_plan
from app.services.gamification import mark_student_learning_activity
from app.services.academic_agent_service import (
    ASSESSMENT_VALIDATOR_AGENT,
    review_structured_academic_output,
)
from app.services.brain_power import (
    brain_power_cost_for_tokens,
    current_brain_power_date,
    estimate_message_tokens,
    estimate_text_tokens,
)
from app.utils.topic_filters import filter_learning_topics
import logging

logger = logging.getLogger(__name__)
from app.services.age_content_service import (
    get_student_context,
    get_content_complexity,
    get_age_group,
)
from app.core.limiter import limiter
from app.api.v1.endpoints.student_progress import complete_topic_progression


def handle_api_error(
    endpoint: str, error: Exception, db: AsyncSession = None
) -> HTTPException:
    """Secure error handling - logs full traceback internally, returns generic message to client."""
    error_id = uuid.uuid4().hex[:8]
    logger.error(f"[{endpoint}] Error {error_id}: {error}\n{traceback.format_exc()}")
    if db:
        import asyncio

        try:
            asyncio.create_task(db.rollback())
        except:
            pass
    return HTTPException(
        status_code=500,
        detail=f"An error occurred while {endpoint}. Please try again. (Ref: {error_id})",
    )


router = APIRouter()

async def ensure_ai_topic_unlocked(
    db: AsyncSession,
    student_id: uuid.UUID,
    subject_id: Any,
    topic_id: Any,
) -> None:
    """Prevent direct AI tutoring on lessons that are still locked."""
    try:
        subject_uuid = uuid.UUID(str(subject_id))
        topic_uuid = uuid.UUID(str(topic_id))
    except (TypeError, ValueError):
        return

    res_topics = await db.execute(
        select(Topic)
        .filter(Topic.subject_id == subject_uuid)
        .order_by(Topic.sort_order.asc(), Topic.name.asc())
    )
    topics = filter_learning_topics(res_topics.scalars().all())
    if not topics or topic_uuid not in {topic.id for topic in topics}:
        return

    topic_ids = [topic.id for topic in topics]
    res_progress = await db.execute(
        select(StudentTopicProgress).filter(
            StudentTopicProgress.student_id == student_id,
            StudentTopicProgress.topic_id.in_(topic_ids),
        )
    )
    progress_by_topic = {record.topic_id: record for record in res_progress.scalars().all()}
    min_sort_order = min(getattr(topic, "sort_order", 999) for topic in topics)
    statuses: Dict[uuid.UUID, str] = {}
    for topic in topics:
        progress = progress_by_topic.get(topic.id)
        if progress:
            statuses[topic.id] = progress.status
        elif getattr(topic, "sort_order", 0) == min_sort_order:
            statuses[topic.id] = "in_progress"
        else:
            statuses[topic.id] = "locked"

    if statuses.get(topic_uuid) == "completed":
        raise HTTPException(
            status_code=409,
            detail="This lesson is already completed. It is open for revision, but chat is disabled for mastered lessons.",
        )

    if statuses.get(topic_uuid) != "locked":
        return

    current_topic = next(
        (
            topic for topic in topics
            if statuses.get(topic.id) in {"in_progress", "unlocked", "active"}
        ),
        None,
    ) or next((topic for topic in topics if statuses.get(topic.id) != "locked"), None) or topics[0]

    raise HTTPException(
        status_code=403,
        detail=f"This lesson is locked. Continue from '{current_topic.name}' first.",
    )


def _question(
    idx: int,
    text: str,
    options: Dict[str, str],
    correct_option: str,
    explanation: str,
    difficulty: str = "medium",
) -> Dict[str, Any]:
    return {
        "id": f"fallback-{idx}",
        "text": text,
        "options": options,
        "correct_option": correct_option,
        "explanation": explanation,
        "difficulty": difficulty,
    }


def _place_value_questions(topic_label: str) -> List[Dict[str, Any]]:
    return [
        _question(
            1,
            "In 482,315, what is the value of the digit 4?",
            {"A": "400,000", "B": "40,000", "C": "4,000", "D": "400"},
            "A",
            "The digit 4 is in the hundred thousands place, so its value is 400,000.",
            "easy",
        ),
        _question(
            2,
            "In 760,124, which digit is in the ten thousands place?",
            {"A": "7", "B": "6", "C": "1", "D": "2"},
            "B",
            "Reading from the right gives ones, tens, hundreds, thousands, ten thousands; the digit 6 is in that place.",
            "easy",
        ),
        _question(
            3,
            "What is the word form of 305,018?",
            {
                "A": "Three hundred five thousand, eighteen",
                "B": "Three hundred fifty thousand, eighteen",
                "C": "Thirty-five thousand, eighteen",
                "D": "Three million, five thousand, eighteen",
            },
            "A",
            "305,018 has 305 thousands and 18 ones, so it is three hundred five thousand, eighteen.",
            "easy",
        ),
        _question(
            4,
            "Which number has 9 in the hundred thousands place?",
            {"A": "934,210", "B": "394,210", "C": "49,321", "D": "4,932"},
            "A",
            "In 934,210, the leftmost digit 9 is in the hundred thousands place.",
            "medium",
        ),
        _question(
            5,
            "In 1,204,673, what is the place value of the digit 2?",
            {"A": "Millions", "B": "Hundred thousands", "C": "Ten thousands", "D": "Thousands"},
            "B",
            "The digit 2 is in the hundred thousands place in 1,204,673.",
            "medium",
        ),
        _question(
            6,
            "Write a number with 6 in the millions place, 3 in the ten thousands place, and 8 in the hundreds place.",
            {"A": "6,030,800", "B": "630,800", "C": "6,300,080", "D": "6,003,800"},
            "A",
            "6,030,800 has 6 in the millions place, 3 in the ten thousands place, and 8 in the hundreds place.",
            "medium",
        ),
        _question(
            7,
            "Which expanded form matches 740,506?",
            {
                "A": "700,000 + 40,000 + 500 + 6",
                "B": "700,000 + 4,000 + 500 + 6",
                "C": "70,000 + 40,000 + 500 + 6",
                "D": "700,000 + 40,000 + 5,000 + 6",
            },
            "A",
            "740,506 separates into 700,000, 40,000, 500, and 6.",
            "medium",
        ),
        _question(
            8,
            "A number is written as 5,000,000 + 200,000 + 40,000 + 9. What is the number?",
            {"A": "5,240,009", "B": "5,204,009", "C": "5,024,009", "D": "524,009"},
            "A",
            "Combining the place values gives 5,240,009.",
            "hard",
        ),
        _question(
            9,
            "In 5,500,000, what is the place value of the leftmost digit 5?",
            {"A": "Millions", "B": "Hundred thousands", "C": "Ten thousands", "D": "Thousands"},
            "A",
            "The question names the leftmost 5, which is in the millions place.",
            "hard",
        ),
        _question(
            10,
            "In 5,500,000, what is the place value of the second digit 5 from the left?",
            {"A": "Millions", "B": "Hundred thousands", "C": "Ten thousands", "D": "Thousands"},
            "B",
            "The second 5 from the left is in the hundred thousands place.",
            "hard",
        ),
    ]


def _math_log_standard_form_questions(topic_label: str) -> List[Dict[str, Any]]:
    return [
        _question(
            1,
            "Write 3500 in standard form.",
            {"A": "3.5 x 10^3", "B": "35 x 10^2", "C": "0.35 x 10^4", "D": "350 x 10^1"},
            "A",
            "In standard form the first factor must be at least 1 and less than 10, so 3500 = 3.5 x 10^3.",
            "easy",
        ),
        _question(
            2,
            "If N = 4.2 x 10^2, what is the characteristic of log10(N)?",
            {"A": "2", "B": "4.2", "C": "0.2", "D": "log10(4.2)"},
            "A",
            "For N = a x 10^n, log10(N) = n + log10(a). The characteristic is the integer n.",
            "easy",
        ),
        _question(
            3,
            "Complete this correctly: log10(2.5 x 10^4) =",
            {"A": "4 + log10(2.5)", "B": "2.5 + log10(4)", "C": "4 x log10(2.5)", "D": "log10(6.5)"},
            "A",
            "Use log10(a x 10^n) = log10(a) + n, so the expression becomes 4 + log10(2.5).",
            "medium",
        ),
        _question(
            4,
            "Which number is written in valid standard form?",
            {"A": "6.02 x 10^5", "B": "60.2 x 10^4", "C": "0.602 x 10^6", "D": "602 x 10^3"},
            "A",
            "Valid standard form has 1 <= a < 10 in a x 10^n. Only 6.02 satisfies that rule.",
            "medium",
        ),
        _question(
            5,
            "A learner says log10(7000) has characteristic 7 because the first digit is 7. What is the correction?",
            {
                "A": "7000 = 7 x 10^3, so the characteristic is 3",
                "B": "7000 = 7 x 10^3, so the characteristic is 7",
                "C": "7000 = 0.7 x 10^4, so the characteristic is 0.7",
                "D": "The characteristic cannot be found from standard form",
            },
            "A",
            "The characteristic comes from the power of 10 in standard form, not from the leading digit.",
            "hard",
        ),
        _question(
            6,
            "If log10(5.6 x 10^6) = 6 + log10(5.6), what part is the mantissa?",
            {"A": "log10(5.6)", "B": "6", "C": "5.6 x 10^6", "D": "10^6"},
            "A",
            "The mantissa is the fractional logarithmic part, log10(a), while the characteristic is the integer power n.",
            "medium",
        ),
        _question(
            7,
            "Which step is best before using a log table for log10(82,000)?",
            {"A": "Write 82,000 as 8.2 x 10^4", "B": "Write 82,000 as 82 x 10^3", "C": "Divide 82,000 by 10", "D": "Use 82 as the characteristic"},
            "A",
            "Standard form isolates the power of 10 first: 82,000 = 8.2 x 10^4, so the characteristic is 4.",
            "hard",
        ),
        _question(
            8,
            "For a number greater than 1 written as a x 10^n, what must be true about log10(a)?",
            {"A": "It is the mantissa and lies between 0 and 1 when 1 <= a < 10", "B": "It is always equal to n", "C": "It is always a whole number", "D": "It replaces the characteristic"},
            "A",
            "When 1 <= a < 10, log10(a) is between 0 and 1; this is why it works as the mantissa.",
            "hard",
        ),
        _question(
            9,
            "Which expression correctly separates log10(63,000) into characteristic and mantissa?",
            {"A": "4 + log10(6.3)", "B": "6.3 + log10(4)", "C": "5 + log10(0.63)", "D": "log10(63) + 3"},
            "A",
            "63,000 = 6.3 x 10^4, so log10(63,000) = 4 + log10(6.3).",
            "hard",
        ),
        _question(
            10,
            "If a log-table question gives log10(3.2) = 0.5051, what is log10(3200)?",
            {"A": "3.5051", "B": "2.5051", "C": "0.5051", "D": "3200.5051"},
            "A",
            "3200 = 3.2 x 10^3, so log10(3200) = 3 + log10(3.2) = 3.5051.",
            "hard",
        ),
    ]


def _equivalent_fraction_questions(topic_label: str) -> List[Dict[str, Any]]:
    return [
        _question(
            1,
            "Which fraction is equivalent to 1/2?",
            {"A": "2/4", "B": "2/3", "C": "3/5", "D": "1/3"},
            "A",
            "1/2 and 2/4 have the same value because multiplying the top and bottom of 1/2 by 2 gives 2/4.",
            "easy",
        ),
        _question(
            2,
            "To make an equivalent fraction, what must you do?",
            {
                "A": "Multiply or divide the numerator and denominator by the same non-zero number",
                "B": "Multiply only the numerator",
                "C": "Add the same number to the numerator only",
                "D": "Change the denominator randomly",
            },
            "A",
            "The fraction keeps the same value only when the numerator and denominator are changed by the same factor.",
            "easy",
        ),
        _question(
            3,
            "Which fraction is equivalent to 3/5?",
            {"A": "6/10", "B": "6/5", "C": "3/10", "D": "5/3"},
            "A",
            "Multiplying 3 and 5 by 2 gives 6/10, so 3/5 = 6/10.",
            "medium",
        ),
        _question(
            4,
            "Complete the equivalent fraction: 2/3 = ?/12",
            {"A": "8", "B": "6", "C": "4", "D": "10"},
            "A",
            "The denominator 3 was multiplied by 4 to get 12, so the numerator 2 must also be multiplied by 4 to get 8.",
            "medium",
        ),
        _question(
            5,
            "Which pair shows equivalent fractions?",
            {"A": "4/6 and 2/3", "B": "4/6 and 3/4", "C": "2/5 and 3/5", "D": "1/4 and 1/5"},
            "A",
            "4/6 can be simplified by dividing top and bottom by 2, giving 2/3.",
            "medium",
        ),
        _question(
            6,
            "A learner says 1/3 = 2/3 because both denominators are 3. What is the correction?",
            {
                "A": "They are not equal because the numerators show different numbers of the same-sized parts",
                "B": "They are equal because the denominators match",
                "C": "They are equal because both are fractions",
                "D": "They cannot be compared",
            },
            "A",
            "When denominators are the same, the numerator tells how many equal parts are taken; 1 part is not the same as 2 parts.",
            "medium",
        ),
        _question(
            7,
            "Which method proves that 5/10 is equivalent to 1/2?",
            {
                "A": "Divide the numerator and denominator of 5/10 by 5",
                "B": "Add 5 to the numerator only",
                "C": "Change 10 to 2 without changing 5",
                "D": "Multiply the denominator only",
            },
            "A",
            "Dividing 5 and 10 by 5 gives 1/2, so the two fractions are equivalent.",
            "hard",
        ),
        _question(
            8,
            "Tobi shades 3 out of 6 equal parts of a shape. Which statement is correct?",
            {
                "A": "3/6 is equivalent to 1/2",
                "B": "3/6 is equivalent to 1/3",
                "C": "3/6 is greater than 1 whole",
                "D": "3/6 cannot be simplified",
            },
            "A",
            "3/6 simplifies to 1/2 because both 3 and 6 can be divided by 3.",
            "hard",
        ),
        _question(
            9,
            "Complete the equivalent fraction: 5/8 = 20/?",
            {"A": "32", "B": "24", "C": "28", "D": "40"},
            "A",
            "The numerator 5 was multiplied by 4 to get 20, so the denominator 8 must also be multiplied by 4 to get 32.",
            "hard",
        ),
        _question(
            10,
            "Which explanation best proves that 6/9 and 2/3 are equivalent?",
            {
                "A": "Divide both 6 and 9 by 3 to get 2/3",
                "B": "The numerators are both even",
                "C": "Both fractions have a 3 somewhere",
                "D": "The denominators are different",
            },
            "A",
            "Equivalent fractions keep the same value; simplifying 6/9 by the same factor 3 gives 2/3.",
            "hard",
        ),
    ]


def _database_normalization_questions(topic_label: str) -> List[Dict[str, Any]]:
    return [
        _question(
            1,
            "A table stores StudentID, StudentName, CourseID, CourseName, and Grade. What is the main design problem?",
            {
                "A": "Student and course details repeat across many rows",
                "B": "The table has too few columns",
                "C": "Grades should never be stored",
                "D": "CourseID should be removed from every table",
            },
            "A",
            "Normalization starts by spotting repeated facts that can create update, insert, and delete problems.",
            "easy",
        ),
        _question(
            2,
            "Which split best reduces redundancy while preserving the relationship between students and courses?",
            {
                "A": "Students, Courses, and Enrollments/Grades tables",
                "B": "One table for all names and one table for all IDs",
                "C": "A separate table for every grade value",
                "D": "Remove CourseName and keep only Grade",
            },
            "A",
            "Students and Courses store stable facts; Enrollments/Grades links a student to a course and stores the grade for that relationship.",
            "medium",
        ),
        _question(
            3,
            "In an Enrollments table, why might StudentID + CourseID be a useful key?",
            {
                "A": "Together they identify one student's record in one course",
                "B": "They make StudentName unnecessary in the Students table",
                "C": "They prove every student has the same grade",
                "D": "They remove the need for a Courses table",
            },
            "A",
            "The pair identifies the relationship row: one student taking one course.",
            "medium",
        ),
        _question(
            4,
            "If a CourseName changes and it appears in many enrollment rows, which anomaly can happen?",
            {
                "A": "Some rows may be updated while others keep the old name",
                "B": "The database automatically becomes faster",
                "C": "All grades are deleted",
                "D": "StudentID becomes meaningless",
            },
            "A",
            "Repeated facts can become inconsistent when an update is applied in only some places.",
            "hard",
        ),
        _question(
            5,
            "What is the best evidence that a learner understands normalization?",
            {
                "A": "They can redesign a flawed table and explain the keys",
                "B": "They can recite the word normalization",
                "C": "They always split every column into its own table",
                "D": "They avoid using foreign keys",
            },
            "A",
            "Real mastery is shown by applying the rule to a table design and defending the relationships.",
            "hard",
        ),
        _question(
            6,
            "A StudentName column appears in both Students and Enrollments tables. What should you check first?",
            {
                "A": "Whether StudentName belongs only in Students and Enrollments should reference StudentID",
                "B": "Whether StudentName should become the primary key in every table",
                "C": "Whether Enrollments should be deleted",
                "D": "Whether CourseID should store the student name",
            },
            "A",
            "A fact about a student should be stored once in Students; relationship rows should reference the student by key.",
            "medium",
        ),
        _question(
            7,
            "Which dependency suggests the original table is not well normalized: StudentID, StudentName, CourseID, CourseName, Grade?",
            {
                "A": "StudentID determines StudentName, and CourseID determines CourseName",
                "B": "Grade determines StudentName",
                "C": "CourseName determines every StudentID",
                "D": "StudentName determines every CourseID",
            },
            "A",
            "Student and course facts depend on different keys, so they should not all live as repeated columns in one enrollment table.",
            "hard",
        ),
        _question(
            8,
            "After normalization, where should a student's grade for a course usually be stored?",
            {
                "A": "In the Enrollments/Grades table that links StudentID and CourseID",
                "B": "Only in the Students table",
                "C": "Only in the Courses table",
                "D": "In every table for easier searching",
            },
            "A",
            "The grade belongs to the relationship between one student and one course, so it fits the junction table.",
            "hard",
        ),
        _question(
            9,
            "Which update shows that normalization has improved the design?",
            {
                "A": "Changing one CourseName in Courses updates the name used by all related enrollments",
                "B": "Typing CourseName again in every enrollment row",
                "C": "Deleting the Students table",
                "D": "Putting all grades into the Courses table",
            },
            "A",
            "A normalized design stores each stable fact once and links to it, so one update prevents inconsistent copies.",
            "hard",
        ),
        _question(
            10,
            "A report needs StudentName, CourseName, and Grade after normalization. How should the data be produced?",
            {
                "A": "Join Students, Courses, and Enrollments using their keys",
                "B": "Store all report text in one repeated column",
                "C": "Remove IDs and match names manually",
                "D": "Duplicate every course row inside Students",
            },
            "A",
            "Normalization separates storage, but queries can join related tables through primary and foreign keys.",
            "hard",
        ),
    ]


def build_fallback_mastery_questions(topic: str, subject: str) -> List[Dict[str, Any]]:
    """Deterministic fallback so the mastery modal never dead-ends with generic recall."""
    topic_label = topic or "this topic"
    subject_label = subject or "this subject"
    topic_key = topic_label.lower()
    subject_key = subject_label.lower()

    if (
        "math" in subject_key
        and any(marker in topic_key for marker in ["log", "standard form", "scientific notation"])
    ):
        return _math_log_standard_form_questions(topic_label)

    if "math" in subject_key and any(marker in topic_key for marker in ["equivalent fraction", "equivalent fractions"]):
        return _equivalent_fraction_questions(topic_label)

    if "math" in subject_key and "place value" in topic_key:
        return _place_value_questions(topic_label)

    if any(marker in topic_key for marker in ["normalization", "normalisation", "database design"]):
        return _database_normalization_questions(topic_label)

    return [
        _question(
            idx,
            text.format(topic=topic_label, subject=subject_label),
            options,
            "A",
            explanation.format(topic=topic_label, subject=subject_label),
            difficulty,
        )
        for idx, (text, options, explanation, difficulty) in enumerate(
            [
                (
                    "Which option best describes the main idea of {topic} in {subject}?",
                    {
                        "A": "Understanding the key idea and applying it correctly",
                        "B": "Memorizing random facts without context",
                        "C": "Skipping the examples",
                        "D": "Guessing without checking",
                    },
                    "Mastery means you can explain and apply {topic}, not just recognize words from the lesson.",
                    "easy",
                ),
                (
                    "What should you do first when solving a question on {topic}?",
                    {
                        "A": "Identify what the question is asking",
                        "B": "Choose an answer immediately",
                        "C": "Ignore the given information",
                        "D": "Start with the hardest step",
                    },
                    "A strong first step is to identify the target of the question before choosing a method.",
                    "easy",
                ),
                (
                    "Why are examples useful when learning {topic}?",
                    {
                        "A": "They show how the idea works in real situations",
                        "B": "They replace understanding",
                        "C": "They make practice unnecessary",
                        "D": "They remove the need to check answers",
                    },
                    "Examples connect the core idea to practical use, which strengthens understanding.",
                    "medium",
                ),
                (
                    "If you get a {topic} question wrong, what is the best next action?",
                    {
                        "A": "Review the mistake and try a similar question",
                        "B": "Move on without checking",
                        "C": "Assume the topic is impossible",
                        "D": "Memorize only the answer",
                    },
                    "Reviewing the mistake helps you fix the exact misunderstanding.",
                    "medium",
                ),
                (
                    "What shows the strongest mastery of {topic}?",
                    {
                        "A": "Explaining the idea and applying it to a new question",
                        "B": "Reading the topic title",
                        "C": "Copying one example only",
                        "D": "Avoiding practice",
                    },
                    "The best evidence of mastery is transfer: using the idea correctly in a new situation.",
                    "hard",
                ),
                (
                    "Which answer would be strongest in a {topic} mastery test?",
                    {
                        "A": "An answer that gives the method, applies it, and checks the result",
                        "B": "An answer that only repeats the topic title",
                        "C": "An answer that skips the evidence",
                        "D": "An answer that changes the topic",
                    },
                    "Strong mastery includes method, application, and a check against the question.",
                    "medium",
                ),
                (
                    "When a {topic} question includes several facts, what should you do before answering?",
                    {
                        "A": "Separate the given facts from what the question asks you to find",
                        "B": "Ignore the facts and guess",
                        "C": "Use only the longest option",
                        "D": "Answer before reading the question fully",
                    },
                    "Separating given information from the target helps you choose the right method.",
                    "medium",
                ),
                (
                    "Why should you check your answer after solving a {topic} problem?",
                    {
                        "A": "To confirm the answer fits the question, method, and available evidence",
                        "B": "To make the work longer",
                        "C": "To avoid explaining the method",
                        "D": "To change a correct answer randomly",
                    },
                    "A final check catches method errors and confirms the answer actually solves the problem.",
                    "hard",
                ),
                (
                    "What should a strong final answer on {topic} include?",
                    {
                        "A": "The answer, the method used, and a quick reason it fits the question",
                        "B": "Only the shortest option",
                        "C": "A new unrelated topic",
                        "D": "A guess without checking",
                    },
                    "A strong answer shows both the result and the reasoning that makes it reliable.",
                    "hard",
                ),
                (
                    "How can you show you are ready to move beyond {topic}?",
                    {
                        "A": "Apply the idea correctly to a new example without being led",
                        "B": "Say the topic name once",
                        "C": "Avoid practice questions",
                        "D": "Copy only one worked answer",
                    },
                    "Readiness means transfer: using the idea accurately in a fresh situation.",
                    "hard",
                ),
            ],
            start=1,
        )
    ]


def mastery_questions_need_academic_fallback(
    questions: List[Dict[str, Any]],
    subject: str,
    education_level: Optional[str],
) -> bool:
    subject_key = (subject or "").lower()
    level_key = (education_level or "").lower()
    rigorous_subject = any(
        marker in subject_key
        for marker in [
            "math",
            "physics",
            "chemistry",
            "biology",
            "accounting",
            "economics",
            "data processing",
            "computer",
            "statistics",
            "finance",
        ]
    ) or any(marker in level_key for marker in ["ss", "waec", "neco", "jamb", "professional"])
    if not rigorous_subject:
        return False

    analogy_markers = [
        "imagine",
        "like a",
        "like an",
        "jollof",
        "traffic",
        "market",
        "house",
        "ladder",
        "recipe",
        "blueprint",
        "unlock",
    ]
    analogy_only_count = 0
    for question in questions:
        explanation = str(question.get("explanation") or "").lower()
        if not explanation:
            analogy_only_count += 1
            continue
        has_analogy = any(marker in explanation for marker in analogy_markers)
        if has_analogy:
            analogy_only_count += 1
    return analogy_only_count >= 2


def option_matching_number(options: Dict[str, Any], expected: float) -> Optional[str]:
    for key, value in (options or {}).items():
        numbers = re.findall(r"-?\d+(?:\.\d+)?", str(value))
        for number in numbers:
            parsed = float(number)
            if abs(parsed - expected) < 0.0001:
                return str(key).upper()
    return None


def derive_numeric_mastery_answer(question: Dict[str, Any]) -> Optional[str]:
    """Correct obvious arithmetic answer keys when generated metadata contradicts the math."""
    text = str(question.get("text") or "")
    lower_text = text.lower()
    options = question.get("options") or {}
    numbers = [float(item) for item in re.findall(r"\b\d+(?:\.\d+)?\b", text)]

    if not numbers:
        return None

    division_intents = [
        "how many group",
        "how many set",
        "how many bundle",
        "how many pack",
        "how many each",
        "share equally",
        "divide",
        "divided",
        "each group",
        "each set",
    ]
    if any(intent in lower_text for intent in division_intents) and len(numbers) >= 2:
        dividend = numbers[0]
        divisor = numbers[-1]
        if divisor:
            return option_matching_number(options, dividend / divisor)

    if "by tens" in lower_text and "next" in lower_text:
        return option_matching_number(options, numbers[-1] + 10)
    if "by fives" in lower_text and "next" in lower_text:
        return option_matching_number(options, numbers[-1] + 5)
    if "by twos" in lower_text and "next" in lower_text:
        return option_matching_number(options, numbers[-1] + 2)
    if "next number after" in lower_text:
        return option_matching_number(options, numbers[-1] + 1)

    expression = re.search(r"(\d+(?:\.\d+)?)\s*([+\-x×*/÷])\s*(\d+(?:\.\d+)?)", text)
    if expression:
        left = float(expression.group(1))
        op = expression.group(2)
        right = float(expression.group(3))
        expected: Optional[float] = None
        if op == "+":
            expected = left + right
        elif op == "-":
            expected = left - right
        elif op in {"x", "×", "*"}:
            expected = left * right
        elif op in {"/", "÷"} and right:
            expected = left / right
        if expected is not None:
            return option_matching_number(options, expected)

    if any(word in lower_text for word in ["altogether", "total", "sum"]) and len(numbers) >= 2:
        matched_option = option_matching_number(options, sum(numbers[:2]))
        if matched_option:
            return matched_option

    if any(word in lower_text for word in ["left", "remain", "remaining", "difference"]) and len(numbers) >= 2:
        matched_option = option_matching_number(options, numbers[0] - numbers[1])
        if matched_option:
            return matched_option

    if any(word in lower_text for word in ["each", "rows of", "columns of", "groups of", "sets of"]) and any(word in lower_text for word in ["total", "altogether", "how many"]) and len(numbers) >= 2:
        if any(word in lower_text for word in ["how many group", "how many set", "how many bundle", "how many pack"]):
            return None
        return option_matching_number(options, numbers[0] * numbers[-1])

    return None


def is_ambiguous_mastery_question(question: Dict[str, Any]) -> bool:
    """Reject generated questions that are mathematically ambiguous or misleading."""
    text = str(question.get("text") or "")
    lower_text = text.lower()
    options = question.get("options") or {}
    if "middle number" in lower_text:
        range_match = re.search(r"\bfrom\s+(\d+)\s+to\s+(\d+)\b", lower_text)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2))
            count = abs(end - start) + 1
            # Even-length ranges have two middle positions. Asking for one
            # "middle number" is not fair unless the expected average appears.
            if count % 2 == 0:
                expected_average = (start + end) / 2
                return option_matching_number(question.get("options") or {}, expected_average) is None
        return True

    if "place value" in lower_text and re.search(r"\bdigit\s+(\d)\b", lower_text):
        digit = re.search(r"\bdigit\s+(\d)\b", lower_text).group(1)
        number_matches = re.findall(r"\b\d[\d,]*\b", text)
        target_number = max(number_matches, key=lambda value: len(value.replace(",", ""))) if number_matches else ""
        if target_number:
            digits_only = target_number.replace(",", "")
            if digits_only.count(digit) > 1 and not re.search(
                r"\b(leftmost|rightmost|first|second|third|fourth|from the left|from the right)\b",
                lower_text,
            ):
                return True

    if "word form" in lower_text and isinstance(options, dict):
        canonical_options = [
            canonical_number_word_option(value)
            for value in options.values()
            if str(value).strip()
        ]
        canonical_options = [value for value in canonical_options if value]
        if len(set(canonical_options)) != len(canonical_options):
            return True
    return False


def canonical_number_word_option(value: Any) -> str:
    """Normalize accepted number-word variants so duplicate correct options are rejected."""
    text = str(value or "").lower().strip()
    if not text:
        return ""
    text = text.replace("-", " ")
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\band\b", " ", text)
    text = re.sub(r"\bthousands\b", "thousand", text)
    text = re.sub(r"\bhundreds\b", "hundred", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_mastery_questions(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    invalid_answer_phrases = [
        "closest",
        "not available",
        "not in the option",
        "not in the options",
        "option is not available",
        "no option",
        "none of the options",
    ]
    for idx, raw_question in enumerate(questions or [], start=1):
        if not isinstance(raw_question, dict):
            continue
        options = raw_question.get("options") or {}
        if not isinstance(options, dict) or len(options) < 2:
            continue
        cleaned_options = {
            str(key).upper(): str(value)
            for key, value in options.items()
            if str(key).strip() and str(value).strip()
        }
        if len(set(cleaned_options.values())) != len(cleaned_options):
            continue
        if is_ambiguous_mastery_question({**raw_question, "options": cleaned_options}):
            continue
        correct_option = str(raw_question.get("correct_option") or "").upper().strip()
        explanation = str(raw_question.get("explanation") or "").strip()
        combined_answer_text = f"{cleaned_options.get(correct_option, '')} {explanation}".lower()
        if any(phrase in combined_answer_text for phrase in invalid_answer_phrases):
            correct_option = ""

        derived_option = derive_numeric_mastery_answer({**raw_question, "options": cleaned_options})
        if derived_option in cleaned_options:
            correct_option = derived_option
        elif correct_option not in cleaned_options:
            continue

        if not explanation:
            correct_answer = cleaned_options.get(correct_option, "the selected answer")
            explanation = (
                f"The correct answer is {correct_answer}. It follows from applying the lesson idea "
                "directly to the question, then checking that the result matches the option."
            )

        normalized.append({
            "id": str(raw_question.get("id") or f"q{idx}"),
            "text": str(raw_question.get("text") or "").strip(),
            "options": cleaned_options,
            "correct_option": correct_option,
            "explanation": explanation,
            "difficulty": str(raw_question.get("difficulty") or "medium").lower(),
        })
    return normalized


def user_key(request: Request):
    """Rate limit key: use user ID from JWT if available, else IP"""
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt.decode(
                token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
            )
            user_id = payload.get("sub")
            if user_id:
                return str(user_id)
        except JWTError:
            pass
    return get_remote_address(request)


async def deduct_brain_power(user_id: uuid.UUID, cost: int, db: AsyncSession) -> bool:
    """Batch 3 prep: Deduct brain power safely using atomic SQL"""
    today = current_brain_power_date()
    result = await db.execute(
        text("""
            UPDATE student_profiles 
            SET
                brain_power = GREATEST(
                    0,
                    (
                        CASE
                            WHEN brain_power_reset_date IS DISTINCT FROM :today THEN 100
                            ELSE COALESCE(brain_power, 100)
                        END
                    ) - :cost
                ),
                brain_power_reset_date = :today
            WHERE user_id = :uid 
            AND (
                CASE
                    WHEN brain_power_reset_date IS DISTINCT FROM :today THEN 100
                    ELSE COALESCE(brain_power, 100)
                END
            ) >= :cost
        """),
        {"cost": cost, "uid": user_id, "today": today},
    )
    await db.commit()
    return result.rowcount > 0


async def refund_brain_power(user_id: uuid.UUID, cost: int, db: AsyncSession) -> None:
    today = current_brain_power_date()
    await db.execute(
        text("""
            UPDATE student_profiles
            SET
                brain_power = LEAST(
                    100,
                    (
                        CASE
                            WHEN brain_power_reset_date IS DISTINCT FROM :today THEN 100
                            ELSE COALESCE(brain_power, 0)
                        END
                    ) + :cost
                ),
                brain_power_reset_date = :today
            WHERE user_id = :uid
        """),
        {"cost": cost, "uid": user_id, "today": today},
    )
    await db.commit()


async def get_student_education_level(db: AsyncSession, user_id: uuid.UUID) -> Optional[str]:
    res_prof = await db.execute(
        select(StudentProfile.education_level).filter(StudentProfile.user_id == user_id)
    )
    return res_prof.scalar()


def raise_brain_power_depleted():
    from datetime import time as dt_time, timedelta, datetime

    try:
        from zoneinfo import ZoneInfo
        local_tz = ZoneInfo("Africa/Lagos")
    except ImportError:
        import pytz
        local_tz = pytz.timezone("Africa/Lagos")

    now_local = datetime.now(local_tz)
    tomorrow_local = now_local.date() + timedelta(days=1)
    next_midnight = (
        datetime.combine(tomorrow_local, dt_time.min).replace(tzinfo=local_tz).isoformat()
    )
    raise HTTPException(
        status_code=429,
        detail={
            "code": "BRAIN_POWER_DEPLETED",
            "message": "Your Brain Power is fully drained for today \u2014 which means you've been working hard! \u2728 Take a well-earned break, review what you've learned, and come back tomorrow for a full recharge. Your AI tutor will be here waiting.",
            "recharge_at": next_midnight,
        },
    )


class GenerateRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    # C-06: system_prompt removed — server-defined only, not user-controllable


class ChatRequest(BaseModel):
    messages: List[dict]
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    context: Optional[dict] = None
    mode: Optional[str] = "teaching"  # teaching (default) or generalist
    subject_name: Optional[str] = None
    topic_name: Optional[str] = None


class ExplainRequest(BaseModel):
    concept: str
    context: Optional[str] = None
    question: Optional[str] = None


class EvaluateUnderstandingRequest(BaseModel):
    concept: str
    explanation: str


class LessonContentRequest(BaseModel):
    topic: str
    subject: str
    education_level: str
    learning_style: Optional[str] = None


class TTSRequest(BaseModel):
    text: str
    language: Optional[str] = "en"


class MasteryTestRequest(BaseModel):
    topic: str
    subject: str
    chat_history: Optional[List[Dict[str, str]]] = None


class MasteryTestEvaluationRequest(BaseModel):
    topic: str
    subject_id: Optional[uuid.UUID] = None
    topic_id: Optional[uuid.UUID] = None
    results: List[Dict[str, Any]]
    subtopic: Optional[str] = None


class TopicBreakdownRequest(BaseModel):
    topic: str
    subject_id: uuid.UUID


class SaveChatHistoryRequest(BaseModel):
    subject_id: uuid.UUID
    topic_id: Optional[uuid.UUID] = None
    topic_name: str
    subtopic_name: Optional[str] = 'intro'
    messages: List[Dict[str, str]]

class GetChatHistoryRequest(BaseModel):
    subject_id: uuid.UUID
    topic_id: Optional[uuid.UUID] = None
    topic_name: str
    subtopic_name: Optional[str] = 'intro'


@router.post("/generate")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 10/minute.
# Premium: 20/minute.
@limiter.limit("10/minute", key_func=user_key)
async def generate_text(
    request: Request,
    generate_req: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Generate text using LLM (C-06: Sanitized & Rate Limited)"""
    sanitized_prompt = sanitize_user_input(generate_req.prompt)

    education_level = await get_student_education_level(db, current_user.id)
    brain_power_cost = brain_power_cost_for_tokens(
        estimate_text_tokens(sanitized_prompt), 1024, education_level
    )
    if not await deduct_brain_power(current_user.id, brain_power_cost, db):
        raise_brain_power_depleted()

    try:
        response = await llm_service.generate(
            prompt=sanitized_prompt,
            model=generate_req.model,
            temperature=generate_req.temperature,
            user_id=current_user.id
        )
        return {"response": response}
    except Exception:
        await refund_brain_power(current_user.id, brain_power_cost, db)
        raise


@router.post("/chat")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 15/minute.
# Premium: 30/minute.
@limiter.limit("15/minute", key_func=user_key)
async def chat(
    request: Request,
    chat_req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Chat completion using LLM (C-06: Sanitized, Rate Limited, Strict Server Prompts)"""
    request_id = getattr(request.state, "request_id", "unknown")
    # Sanitize all user messages
    for msg in chat_req.messages:
        if msg.get("role") == "user":
            msg["content"] = sanitize_user_input(msg.get("content", ""))
        elif msg.get("role") == "system":
            # C-06: Absolute removal of user-supplied system messages
            msg["role"] = "user"
            msg["content"] = (
                f"[User tried to inject system role]: {sanitize_user_input(msg.get('content', ''))}"
            )

    # Get student context
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)
    age_group = student_context.get("age_group", "teen")
    complexity = get_content_complexity(age_group)

    # Token limit based on age (kept for logic, but persona handled)
    # max_tokens = 80 if age_group == "child" else 150 if age_group == "teen" else 250

    brain_power_cost = brain_power_cost_for_tokens(
        estimate_message_tokens(chat_req.messages),
        900,
        student_profile.education_level if student_profile else None,
    )
    if not await deduct_brain_power(current_user.id, brain_power_cost, db):
        raise_brain_power_depleted()

    try:
        lesson_context = chat_req.context or {}
        logger.info(
            "AI tutor chat started",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "user_id": str(current_user.id),
                "mode": chat_req.mode or "teaching",
                "subject_name": chat_req.subject_name or "",
                "topic_name": chat_req.topic_name or "",
                "lesson_stage": lesson_context.get("lesson_stage", ""),
                "message_count": len(chat_req.messages or []),
            },
        )
        subject_id = lesson_context.get("subject_id")
        topic_id = lesson_context.get("topic_id")
        subject = None
        topic = None
        if subject_id and topic_id:
            await ensure_ai_topic_unlocked(db, current_user.id, subject_id, topic_id)
            subject, topic = await get_subject_and_topic(db, subject_id, topic_id)
            if subject and topic and not lesson_context.get("revision_context"):
                revision_context = await get_revision_context(db, subject, topic)
                if revision_context:
                    lesson_context = {
                        **lesson_context,
                        "revision_context": revision_context,
                    }
            if subject and topic and not lesson_context.get("lesson_teaching_plan"):
                lesson_plan = await get_or_create_lesson_teaching_plan(
                    db=db,
                    subject=subject,
                    topic=topic,
                    education_level=student_profile.education_level if student_profile else "secondary",
                    user_id=current_user.id,
                )
                lesson_context = {
                    **lesson_context,
                    "lesson_teaching_plan": lesson_plan,
                }

        # Refactored for Batch 10: Use AI Coordinator for persona-based response
        result = await ai_coordinator.get_chat_response(
            messages=chat_req.messages,
            student_profile=student_profile,
            mode=chat_req.mode,
            model=chat_req.model,
            temperature=0.6,
            student_name=current_user.first_name,
            subject_name=chat_req.subject_name,
            topic_name=chat_req.topic_name,
            user_id=current_user.id,
            lesson_context=lesson_context,
        )
        # Add student_context for frontend compatibility
        result["student_context"] = student_context
        logger.info(
            "AI tutor chat completed",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "user_id": str(current_user.id),
                "mode": chat_req.mode or "teaching",
                "ui_action": result.get("ui_action", ""),
                "lesson_stage": result.get("lesson_stage", lesson_context.get("lesson_stage", "")),
                "response_length": len(str(result.get("response", ""))),
            },
        )
        try:
            activity = StudentActivityLog(
                student_id=current_user.id,
                activity_type="ai_chat",
                activity_name=f"AI Tutor: {chat_req.topic_name or (topic.name if topic else 'Learning turn')}",
                subject_id=subject.id if subject else None,
                topic_id=topic.id if topic else None,
                extra_data={
                    "subject": chat_req.subject_name,
                    "topic": chat_req.topic_name,
                    "lesson_stage": result.get("lesson_stage", lesson_context.get("lesson_stage", "")),
                    "ui_action": result.get("ui_action"),
                },
            )
            db.add(activity)
            if student_profile:
                mark_student_learning_activity(student_profile)
            await db.commit()
        except Exception:
            logger.warning("Could not record AI tutor learning activity for streak.", exc_info=True)
            await db.rollback()
        return result
    except HTTPException as exc:
        logger.warning(
            "AI tutor chat rejected",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "user_id": str(current_user.id),
                "mode": chat_req.mode or "teaching",
                "status_code": exc.status_code,
                "subject_name": chat_req.subject_name or "",
                "topic_name": chat_req.topic_name or "",
                "lesson_stage": (chat_req.context or {}).get("lesson_stage", ""),
                "error": str(exc.detail),
            },
        )
        await refund_brain_power(current_user.id, brain_power_cost, db)
        raise
    except Exception:
        logger.error(
            "AI tutor chat failed",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "user_id": str(current_user.id),
                "mode": chat_req.mode or "teaching",
                "subject_name": chat_req.subject_name or "",
                "topic_name": chat_req.topic_name or "",
                "lesson_stage": (chat_req.context or {}).get("lesson_stage", ""),
                "message_count": len(chat_req.messages or []),
            },
            exc_info=True,
        )
        await refund_brain_power(current_user.id, brain_power_cost, db)
        raise


@router.post("/public-chat")
@limiter.limit("8/minute", key_func=get_remote_address)
async def public_chat(request: Request, chat_req: ChatRequest):
    """Public EduNexus guide for guests. No tutoring, no private platform details."""
    request_id = getattr(request.state, "request_id", "unknown")
    for msg in chat_req.messages:
        if msg.get("role") == "user":
            msg["content"] = sanitize_user_input(msg.get("content", ""))[:600]
        elif msg.get("role") == "system":
            msg["role"] = "user"
            msg["content"] = "[Blocked system instruction attempt]"

    try:
        logger.info(
            "Public generalist chat started",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "mode": "generalist",
                "message_count": len(chat_req.messages or []),
            },
        )
        result = await ai_coordinator.get_chat_response(
            messages=chat_req.messages[-8:],
            mode="generalist",
            model=chat_req.model,
            temperature=0.45,
        )
        logger.info(
            "Public generalist chat completed",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "mode": "generalist",
                "response_length": len(str(result.get("response", ""))),
            },
        )
        return result
    except Exception:
        logger.error(
            "Public generalist chat failed",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "mode": "generalist",
                "message_count": len(chat_req.messages or []),
            },
            exc_info=True,
        )
        raise


@router.post("/explain")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 10/minute.
# Premium: 20/minute.
@limiter.limit("10/minute", key_func=user_key)
async def explain_concept(
    request: Request,
    explain_req: ExplainRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Explain a concept (C-06: Sanitized & Rate Limited)"""
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)

    explain_input_tokens = estimate_text_tokens(explain_req.concept) + estimate_text_tokens(explain_req.context) + estimate_text_tokens(explain_req.question)
    brain_power_cost = brain_power_cost_for_tokens(
        explain_input_tokens,
        700,
        student_profile.education_level if student_profile else None,
    )
    if not await deduct_brain_power(current_user.id, brain_power_cost, db):
        raise_brain_power_depleted()

    try:
        explanation = await llm_service.explain_concept(
            concept=sanitize_user_input(explain_req.concept, max_length=500),
            context=sanitize_user_input(explain_req.context or ""),
            question=sanitize_user_input(explain_req.question or ""),
            student_context=student_context,
            user_id=current_user.id,
        )
        return {"explanation": explanation, "student_context": student_context}
    except Exception:
        await refund_brain_power(current_user.id, brain_power_cost, db)
        raise


@router.post("/evaluate-understanding")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 5/minute.
# Premium: 10/minute.
@limiter.limit("5/minute", key_func=user_key)
async def evaluate_understanding(
    request: Request,
    eval_req: EvaluateUnderstandingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Evaluate student's self-explanation (C-06: Sanitized & Rate Limited)"""
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)

    eval_input_tokens = estimate_text_tokens(eval_req.concept) + estimate_text_tokens(eval_req.explanation)
    brain_power_cost = brain_power_cost_for_tokens(
        eval_input_tokens,
        500,
        student_profile.education_level if student_profile else None,
    )
    if not await deduct_brain_power(current_user.id, brain_power_cost, db):
        raise_brain_power_depleted()

    try:
        evaluation = await llm_service.evaluate_understanding(
            concept=sanitize_user_input(eval_req.concept, max_length=200),
            student_explanation=sanitize_user_input(
                eval_req.explanation, max_length=1000
            ),
            student_context=student_context,
            user_id=current_user.id,
        )
    except Exception:
        await refund_brain_power(current_user.id, brain_power_cost, db)
        raise

    # Persist XP if student profile exists and is_correct is True
    if evaluation.get("is_correct") and student_profile:
        xp_earned = evaluation.get("xp_earned", 10)
        # C-07: Atomic XP update to prevent TOCTOU race condition
        await db.execute(
            text(
                "UPDATE student_profiles SET xp = COALESCE(xp, 0) + :amt WHERE user_id = :uid"
            ),
            {"amt": xp_earned, "uid": current_user.id},
        )
        await db.refresh(student_profile)

        # Check for level up (simple logic: 1000 XP per level)
        new_level = (student_profile.xp // 1000) + 1
        if new_level > (student_profile.level or 1):
            student_profile.level = new_level
            evaluation["level_up"] = True

        await db.commit()

    return evaluation


@router.post("/lesson-content")
@limiter.limit("3/minute", key_func=user_key)
async def generate_lesson_content(
    request: Request,
    lesson_req: LessonContentRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate lesson content (C-06: Sanitized & Rate Limited)"""
    content = await llm_service.generate_lesson_content(
        topic=sanitize_user_input(lesson_req.topic),
        subject=sanitize_user_input(lesson_req.subject),
        education_level=sanitize_user_input(lesson_req.education_level),
        learning_style=sanitize_user_input(lesson_req.learning_style or ""),
        user_id=current_user.id,
    )
    return content


@router.post("/tts")
@limiter.limit("10/minute", key_func=user_key)
async def text_to_speech(
    request: Request,
    tts_req: TTSRequest,
    current_user: User = Depends(get_current_user),
):
    """Convert text to speech (C-06: Sanitized & Rate Limited)"""
    audio_url = await tts_service.generate_speech(
        text=sanitize_user_input(tts_req.text),
        language=sanitize_user_input(tts_req.language or "en"),
    )

    if audio_url:
        return {"audio_url": audio_url, "status": "success"}
    else:
        raise HTTPException(
            status_code=503, detail="TTS service is currently unavailable"
        )


@router.post("/stt")
async def speech_to_text(
    audio: UploadFile = File(...),
    language: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Convert speech to text"""
    # Save uploaded file temporarily
    import tempfile
    import os

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        text = await stt_service.transcribe(tmp_path, language)

        if text:
            return {"text": text, "status": "success"}
        else:
            raise HTTPException(
                status_code=503, detail="STT service is currently unavailable"
            )
    finally:
        os.unlink(tmp_path)


@router.post("/mastery-test")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 5/minute.
# Premium: 10/minute.
@limiter.limit("5/minute", key_func=user_key)
async def generate_mastery_test(
    request: Request,
    test_req: MasteryTestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Generate a 10-question adaptive mastery test (C-06: Sanitized & Rate Limited)"""
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)

    mastery_input_tokens = estimate_text_tokens(test_req.topic) + estimate_text_tokens(test_req.subject) + estimate_message_tokens(test_req.chat_history)
    brain_power_cost = brain_power_cost_for_tokens(
        mastery_input_tokens,
        2600,
        student_profile.education_level if student_profile else None,
    )
    if not await deduct_brain_power(current_user.id, brain_power_cost, db):
        raise_brain_power_depleted()

    try:
        questions = await llm_service.generate_mastery_test(
            topic=sanitize_user_input(test_req.topic),
            subject=sanitize_user_input(test_req.subject),
            education_level=student_profile.education_level
            if student_profile
            else "secondary",
            student_context=student_context,
            chat_history=test_req.chat_history,
            user_id=current_user.id,
        )
        if not questions:
            logger.warning("[mastery-test] Falling back to deterministic questions for topic %s", test_req.topic)
            questions = build_fallback_mastery_questions(
                sanitize_user_input(test_req.topic),
                sanitize_user_input(test_req.subject),
            )
        normalized_questions = normalize_mastery_questions(questions)
        minimum_mastery_questions = 10
        if len(normalized_questions) >= minimum_mastery_questions:
            review = await review_structured_academic_output(
                agent_name=ASSESSMENT_VALIDATOR_AGENT,
                output_kind="mastery test questions",
                output=normalized_questions,
                context={
                    "topic": sanitize_user_input(test_req.topic),
                    "subject": sanitize_user_input(test_req.subject),
                    "education_level": student_profile.education_level if student_profile else "secondary",
                    "student_context": student_context,
                },
                review_focus=[
                    "topic boundary alignment",
                    "class-level difficulty progression",
                    "answer key correctness",
                    "option clarity and distinctness",
                    "explanation quality",
                    "professional workplace judgement" if student_profile and student_profile.education_level == "professional" else "age-appropriate academic rigor",
                ],
                user_id=current_user.id,
                max_tokens=1800,
            )
            revised_questions = review.get("revised_output")
            if isinstance(revised_questions, list):
                revised_normalized = normalize_mastery_questions(revised_questions)
                if len(revised_normalized) >= minimum_mastery_questions:
                    normalized_questions = revised_normalized
        if mastery_questions_need_academic_fallback(
            normalized_questions,
            sanitize_user_input(test_req.subject),
            student_profile.education_level if student_profile else "secondary",
        ):
            logger.warning(
                "[mastery-test] Generated questions used analogy-heavy explanations; using academic fallback for topic %s",
                test_req.topic,
            )
            normalized_questions = normalize_mastery_questions(build_fallback_mastery_questions(
                sanitize_user_input(test_req.topic),
                sanitize_user_input(test_req.subject),
            ))
        if len(normalized_questions) < minimum_mastery_questions:
            logger.warning("[mastery-test] Generated questions failed validation; using fallback for topic %s", test_req.topic)
            normalized_questions = normalize_mastery_questions(build_fallback_mastery_questions(
                sanitize_user_input(test_req.topic),
                sanitize_user_input(test_req.subject),
            ))
        return {"questions": normalized_questions}
    except Exception:
        await refund_brain_power(current_user.id, brain_power_cost, db)
        raise


@router.post("/breakdown")
# TODO: Replace with tier-based limit when subscription
# system is implemented. Free: 8/minute.
# Premium: 16/minute.
@limiter.limit("8/minute", key_func=user_key)
async def get_topic_breakdown(
    request: Request,
    body: TopicBreakdownRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get or generate subtopic breakdown for a topic (C-06: Sanitized & Rate Limited)

    Uses a shared SubjectOutline cache so all teachers get the same outline
    for the same subject + topic + education_level combination.
    """
    import traceback as tb
    from app.models.subject_outline import SubjectOutline

    try:
        res_prof = await db.execute(
            select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
        )
        student_profile = res_prof.scalars().first()

        education_level = "secondary"
        grade_level = ""
        if student_profile:
            education_level = student_profile.education_level or "secondary"
            grade_level = student_profile.grade_level or ""

        topic_name_str = str(body.topic)
        subject_name = "Subject"
        res_subject = await db.execute(select(Subject).filter(Subject.id == body.subject_id))
        subject = res_subject.scalars().first()
        if subject:
            subject_name = subject.name

        # Check SHARED outline cache first (across all teachers)
        # Use subject_id FK for proper relational integrity
        shared_outline = None
        try:
            res_outline = await db.execute(
                select(SubjectOutline).filter(
                    SubjectOutline.subject_id == body.subject_id,
                    SubjectOutline.topic_name == topic_name_str,
                    SubjectOutline.education_level == education_level,
                )
            )
            shared_outline = res_outline.scalars().first()
        except Exception as e:
            logger.warning(f"[breakdown] Resilience check: SubjectOutline table may be missing topic_name or subject_id: {e}")
            # Continue to generation if query fails (resilience)

        if shared_outline:
            logger.info(f"[breakdown] Using shared outline for {topic_name_str}")
            # Return shared outline but save to student's progress too
            breakdown = shared_outline.outline

            # Also cache in student progress for per-student tracking
            res_prog = await db.execute(
                select(StudentSubjectProgress).filter(
                    StudentSubjectProgress.student_id == current_user.id,
                    StudentSubjectProgress.subject_id == body.subject_id,
                )
            )
            progress = res_prog.scalars().first()

            if not progress:
                progress = StudentSubjectProgress(
                    student_id=current_user.id,
                    subject_id=body.subject_id,
                    subtopic_progress={},
                )
                db.add(progress)
                await db.flush()

            # Check if student already has progress for this topic
            student_progress = dict(progress.subtopic_progress or {})
            if topic_name_str not in student_progress:
                # New topic for this student - use shared outline
                student_progress[topic_name_str] = breakdown
                progress.subtopic_progress = student_progress
                await db.commit()

            return breakdown

        # Get overall subject progress to find/store subtopics
        res_prog = await db.execute(
            select(StudentSubjectProgress).filter(
                StudentSubjectProgress.student_id == current_user.id,
                StudentSubjectProgress.subject_id == body.subject_id,
            )
        )
        progress = res_prog.scalars().first()

        if not progress:
            progress = StudentSubjectProgress(
                student_id=current_user.id,
                subject_id=body.subject_id,
                subtopic_progress={},
            )
            db.add(progress)
            await db.flush()

        topic_id_str = str(body.topic)

        # Check student's own cache
        if progress.subtopic_progress and topic_id_str in progress.subtopic_progress:
            cached_breakdown = progress.subtopic_progress[topic_id_str]
            if (
                isinstance(cached_breakdown, dict)
                and cached_breakdown.get("subtopics")
                and len(cached_breakdown["subtopics"]) > 0
            ):
                first_sub_name = cached_breakdown["subtopics"][0].get("name", "")
                if first_sub_name != "corrected_topic":
                    return cached_breakdown

        breakdown_input_tokens = estimate_text_tokens(body.topic) + estimate_text_tokens(subject_name) + estimate_text_tokens(education_level) + estimate_text_tokens(grade_level)
        brain_power_cost = brain_power_cost_for_tokens(
            breakdown_input_tokens,
            1200,
            student_profile.education_level if student_profile else None,
        )
        if not await deduct_brain_power(current_user.id, brain_power_cost, db):
            raise_brain_power_depleted()

        try:
            # Generate new breakdown
            result = await llm_service.generate_subtopics(
                topic=sanitize_user_input(body.topic),
                subject=subject_name,
                education_level=education_level,
                grade_level=grade_level,
                user_id=current_user.id,
            )
        except Exception:
            await refund_brain_power(current_user.id, brain_power_cost, db)
            raise

        subtopics_list = []
        if isinstance(result, dict):
            subtopics_list = result.get("subtopics", [])
        elif isinstance(result, list):
            subtopics_list = result

        if not subtopics_list:
            # Fallback: still provide a usable learning journey.
            subtopics_list = [
                f"Foundations of {body.topic}",
                f"Worked examples in {body.topic}",
                f"Practice and common mistakes in {body.topic}",
                f"Mastery application of {body.topic}",
            ]

        breakdown = {
            "subtopics": [
                {
                    "name": str(st),
                    "status": "locked" if i > 0 else "active",
                    "score": None,
                }
                for i, st in enumerate(subtopics_list)
            ],
            "current_index": 0,
            "completed": False,
        }

        # Save to SHARED outline cache (first teacher to generate wins)
        try:
            shared_outline = SubjectOutline(
                subject_id=body.subject_id,
                topic_name=topic_name_str,
                education_level=education_level,
                outline=breakdown,
                teacher_id=current_user.id,
            )
            db.add(shared_outline)
            logger.info(f"[breakdown] Saved shared outline for {topic_name_str}")
        except Exception as shared_err:
            logger.warning(f"[breakdown] Could not save shared outline: {shared_err}")

        # Update student's progress
        try:
            new_progress = dict(progress.subtopic_progress or {})
            new_progress[topic_id_str] = breakdown
            progress.subtopic_progress = new_progress
            await db.commit()
        except Exception as save_err:
            logger.error(f"[breakdown] Failed to save progress: {save_err}")
            await db.rollback()

        return breakdown

    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_error("generating topic breakdown", e, db)


@router.post("/evaluate-mastery")
async def evaluate_mastery_test(
    request: MasteryTestEvaluationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Evaluate a complete mastery test and update roadmap progress"""
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = res_prof.scalars().first()
    student_context = get_student_context(current_user, student_profile)

    # Programmatic, rule-based validation. Do not trust client-supplied is_correct.
    normalized_results: List[Dict[str, Any]] = []
    for result in request.results:
        selected = str(result.get("selected") or "").upper().strip()
        correct_option = str(result.get("correct_option") or "").upper().strip()
        is_correct = bool(correct_option and selected == correct_option)
        normalized_results.append({
            **result,
            "selected": selected,
            "correct_option": correct_option,
            "is_correct": is_correct,
        })

    total = len(normalized_results)
    score = sum(1 for r in normalized_results if r.get("is_correct", False))
    percentage = (score / total * 100) if total > 0 else 0
    passed = percentage >= 70

    if percentage >= 90:
        mastery_level = "Expert"
        feedback = f"Outstanding work! You've demonstrated a deep understanding of the material."
    elif percentage >= 70:
        mastery_level = "Proficient"
        feedback = f"Great job! You have a solid grasp of the core concepts."
    elif percentage >= 50:
        mastery_level = "Developing"
        feedback = f"You're making progress, but let's review a few key areas to strengthen your understanding before moving forward."
    else:
        mastery_level = "Beginner"
        feedback = f"It looks like this topic is still a bit tricky. Let's go back and review the fundamentals together."

    evaluation = {
        "score": score,
        "total": total,
        "percentage": percentage,
        "passed": passed,
        "mastery_level": mastery_level,
        "feedback": feedback,
        "detailed_results": normalized_results,
    }

    # Persist results and XP if passed
    if student_profile:
        # Calculate XP based on score
        xp_earned = int(evaluation.get("percentage", 0) / 2)
        # C-07: Atomic XP update to prevent TOCTOU race condition
        from sqlalchemy import text

        await db.execute(
            text(
                "UPDATE student_profiles SET xp = COALESCE(xp, 0) + :amt WHERE user_id = :uid"
            ),
            {"amt": xp_earned, "uid": current_user.id},
        )
        await db.refresh(student_profile)

        # Check for level up
        new_level = (student_profile.xp // 1000) + 1
        if new_level > (student_profile.level or 1):
            student_profile.level = new_level
            evaluation["level_up"] = True

        # Update Roadmap Progress if this was a subtopic test
        if request.subtopic:
            # For now, we update across all subject progresses that have this topic
            res_prog = await db.execute(
                select(StudentSubjectProgress).filter(
                    StudentSubjectProgress.student_id == current_user.id
                )
            )
            all_progress = res_prog.scalars().all()

            for progress in all_progress:
                    subtopic_progress = progress.subtopic_progress or {}
                    topic_key_candidates = [
                        f"{progress.subject_id}::{request.topic_id or request.topic}::{request.topic}",
                        str(request.topic_id) if request.topic_id else None,
                        request.topic,
                    ]
                    topic_key = next((key for key in topic_key_candidates if key and key in subtopic_progress), None)
                    if topic_key:
                        road_map = dict(subtopic_progress[topic_key])
                        current_idx = road_map.get("current_index", 0)
                        subtopics = list(road_map.get("subtopics", []))

                        if (
                            current_idx < len(subtopics)
                            and subtopics[current_idx]["name"] == request.subtopic
                        ):
                            if evaluation.get("passed"):
                                subtopics[current_idx]["status"] = "completed"
                                subtopics[current_idx]["score"] = evaluation.get(
                                    "percentage"
                                )

                                # Move to next subtopic
                                next_idx = current_idx + 1
                                if next_idx < len(subtopics):
                                    subtopics[next_idx]["status"] = "active"
                                    road_map["current_index"] = next_idx
                                else:
                                    road_map["completed"] = True

                                road_map["subtopics"] = subtopics
                                new_sub_prog = dict(progress.subtopic_progress)
                                new_sub_prog[topic_key] = road_map
                                progress.subtopic_progress = new_sub_prog

                            # If topic is fully completed via subtopics, mark it in the main curriculum too
                            if road_map["completed"] and request.topic_id:
                                await complete_topic_progression(db, current_user.id, request.topic_id)
        
        elif request.topic_id and evaluation.get("passed"):
            # This was a main topic mastery test (no subtopic selected)
            next_topic_id = await complete_topic_progression(db, current_user.id, request.topic_id)
            evaluation["next_topic_unlocked"] = str(next_topic_id) if next_topic_id else None

        activity = StudentActivityLog(
            student_id=current_user.id,
            activity_type="mastery_test",
            activity_name=f"Mastery Test: {request.subtopic or request.topic}",
            score=evaluation.get("percentage"),
            extra_data={
                "topic": request.topic,
                "subtopic": request.subtopic,
                "correct_answers": evaluation.get("score"),
                "total_questions": evaluation.get("total"),
                "mastery_level": evaluation.get("mastery_level"),
                "passed": evaluation.get("passed"),
            },
        )
        db.add(activity)
        mark_student_learning_activity(student_profile)
        await db.commit()

    return evaluation


@router.post("/save-chat")
async def save_chat_history(
    request: SaveChatHistoryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Save chat history for a specific topic/subtopic or general AI"""

    try:
        logger.info(
            f"[save-chat] Saving chat for user {current_user.email}. Subject: {request.subject_id}, Topic: {request.topic_name}"
        )

        # Ensure user is in current session
        merged_user = await db.merge(current_user)

        if not request.subject_id:
            # Save general AI chat history to user model
            merged_user.ai_chat_history = [dict(m) for m in request.messages]
            await db.commit()
            await db.refresh(merged_user)
            logger.info(
                f"[save-chat] Saved {len(request.messages)} messages to user general history"
            )
            return {"status": "success"}

        # Save topic-specific chat history
        res_prog = await db.execute(
            select(StudentSubjectProgress).filter(
                StudentSubjectProgress.student_id == current_user.id,
                StudentSubjectProgress.subject_id == request.subject_id,
            )
        )
        progress = res_prog.scalars().first()

        if not progress:
            logger.info(
                f"[save-chat] Creating new progress for subject {request.subject_id}"
            )
            progress = StudentSubjectProgress(
                student_id=current_user.id,
                subject_id=request.subject_id,
                subtopic_progress={},
                chat_history={},
            )
            db.add(progress)
            await db.flush()

        # Update chat history
        current_history = progress.chat_history or {}
        if isinstance(current_history, list):
            current_history = {"general": current_history}

        # FIX 3A: Isolated Chat History by Subject & Topic IDs
        chat_key = f"{request.subject_id}::{request.topic_id or request.topic_name}::{request.topic_name}::{request.subtopic_name or 'intro'}"
        topic_history = [dict(m) for m in request.messages][-100:]
        current_history[chat_key] = topic_history
        progress.chat_history = current_history

        # Explicitly flag as modified for JSONB
        from sqlalchemy.orm.attributes import flag_modified

        flag_modified(progress, "chat_history")

        await db.commit()
        logger.info(
            f"[save-chat] Saved {len(request.messages)} messages to topic-specific history (key: {chat_key})"
        )
        return {"status": "success"}
    except Exception as e:
        raise handle_api_error("saving chat history", e, db)


@router.post("/get-chat")
async def get_chat_history(
    request: GetChatHistoryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get saved chat history for a specific topic/subtopic or general AI"""
    if not request.subject_id:
        # Get general AI chat history from user model
        return {"messages": current_user.ai_chat_history or []}

    # Get topic-specific chat history
    res_prog = await db.execute(
        select(StudentSubjectProgress).filter(
            StudentSubjectProgress.student_id == current_user.id,
            StudentSubjectProgress.subject_id == request.subject_id,
        )
    )
    progress = res_prog.scalars().first()

    if not progress or not progress.chat_history:
        return {"messages": []}

    history = progress.chat_history
    if isinstance(history, list):
        if not request.topic_name:
            return {"messages": history[-50:]}
        return {"messages": []}

    # FIX 3A: Isolated Chat History by Subject & Topic IDs
    chat_key = f"{request.subject_id}::{request.topic_id or request.topic_name}::{request.topic_name}::{request.subtopic_name or 'intro'}"
    messages = history.get(chat_key, [])
    return {"messages": messages[-50:]}


@router.get("/models")
async def get_available_models(current_user: User = Depends(get_current_user)):
    """Get available LLM models"""
    return {
        "models": [
            {
                "id": "llama3.2:3b",
                "name": "Llama 3.2 3B",
                "size": "3B",
                "description": "Fast and efficient",
            },
            {
                "id": "nomic-embed-text",
                "name": "Nomic Embed",
                "size": "-",
                "description": "Text embeddings",
            },
        ],
        "recommended": "llama3.2:3b",
    }


@router.get("/status")
async def get_ai_status(current_user: User = Depends(get_current_user)):
    """Get AI services status"""
    from app.services.ai_service import tts_service, stt_service

    return {
        "status": "online",
        "llm": {"enabled": True, "model": "llama3.2:3b"},
        "tts": {"enabled": tts_service.enabled},
        "stt": {"enabled": stt_service.enabled},
        "embedding": {"enabled": True, "model": "nomic-embed-text"},
    }


@router.get("/suggest-videos")
async def suggest_videos_for_topic(
    topic: str,
    subject: Optional[str] = None,
    education_level: Optional[str] = None,
    limit: int = Query(6, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Get YouTube video suggestions for a topic.
    Used during AI tutoring when engagement is low or student requests a video explanation.
    """
    try:
        from app.services.video_service import search_educational_videos

        # Build query focused on Nigeria as per instructions
        videos = await search_educational_videos(
            query=topic, subject=subject, level=education_level, limit=limit, db=db
        )

        return {"videos": videos, "topic": topic}
    except Exception as e:
        logger.error(f"Video suggestion failed: {e}")
        return {"videos": [], "topic": topic}
