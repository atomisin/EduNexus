from datetime import datetime, date
from typing import Optional, Dict, Any


def calculate_age(date_of_birth: date) -> int:
    """Calculate age from date of birth"""
    today = date.today()
    age = today.year - date_of_birth.year
    if (today.month, today.day) < (date_of_birth.month, date_of_birth.day):
        age -= 1
    return age


def get_age_group(age: int) -> str:
    """Get age group for content adaptation"""
    if age < 8:
        return "very_young"  # Ages 5-7
    elif age < 11:
        return "young"  # Ages 8-10
    elif age < 14:
        return "preteen"  # Ages 11-13
    elif age < 16:
        return "teen"  # Ages 14-15
    else:
        return "older_teen"  # Ages 16+


def get_education_level_from_age(age: int) -> str:
    """Map age to education level"""
    if age < 7:
        return "primary_1"
    elif age < 8:
        return "primary_2"
    elif age < 9:
        return "primary_3"
    elif age < 10:
        return "primary_4"
    elif age < 11:
        return "primary_5"
    elif age < 12:
        return "primary_6"
    elif age < 13:
        return "jss_1"
    elif age < 14:
        return "jss_2"
    elif age < 15:
        return "jss_3"
    elif age < 16:
        return "ss_1"
    elif age < 17:
        return "ss_2"
    else:
        return "ss_3"


def get_content_complexity(age_group: str) -> Dict[str, Any]:
    """Get content complexity settings based on age group"""
    complexity_settings = {
        "very_young": {
            "vocabulary_level": "simple",
            "sentence_length": "short",
            "explanation_style": "stories",
            "examples_type": "objects",
            "max_concept_length": 50,
            "use_emoji": True,
            "use_analogies": True,
            "use_visuals": True,
            "break_into_steps": True,
            "max_steps": 3,
        },
        "young": {
            "vocabulary_level": "simple",
            "sentence_length": "medium",
            "explanation_style": "examples",
            "examples_type": "relatable",
            "max_concept_length": 100,
            "use_emoji": True,
            "use_analogies": True,
            "use_visuals": True,
            "break_into_steps": True,
            "max_steps": 4,
        },
        "preteen": {
            "vocabulary_level": "intermediate",
            "sentence_length": "medium",
            "explanation_style": "balanced",
            "examples_type": "relevant",
            "max_concept_length": 150,
            "use_emoji": False,
            "use_analogies": True,
            "use_visuals": True,
            "break_into_steps": True,
            "max_steps": 5,
        },
        "teen": {
            "vocabulary_level": "intermediate",
            "sentence_length": "longer",
            "explanation_style": "detailed",
            "examples_type": "abstract",
            "max_concept_length": 200,
            "use_emoji": False,
            "use_analogies": True,
            "use_visuals": False,
            "break_into_steps": False,
            "max_steps": 0,
        },
        "older_teen": {
            "vocabulary_level": "advanced",
            "sentence_length": "complex",
            "explanation_style": "comprehensive",
            "examples_type": "theoretical",
            "max_concept_length": 300,
            "use_emoji": False,
            "use_analogies": False,
            "use_visuals": False,
            "break_into_steps": False,
            "max_steps": 0,
        },
    }
    return complexity_settings.get(age_group, complexity_settings["teen"])


def adapt_content_for_age(content: str, age: int) -> str:
    """Adapt content based on student's age"""
    age_group = get_age_group(age)
    settings = get_content_complexity(age_group)

    # Add age-appropriate prefix
    age_prefixes = {
        "very_young": "🌟 Let's learn about ",
        "young": "💡 Let's discover ",
        "preteen": "Here's what you need to know about ",
        "teen": "Let's explore ",
        "older_teen": "In this topic, we cover ",
    }

    prefix = age_prefixes.get(age_group, "")

    return f"{prefix}{content}"


def get_quiz_difficulty(age: int, education_level: str) -> str:
    """Determine quiz difficulty based on age and education level"""
    if age < 10:
        return "easy"
    elif age < 13:
        return "medium"
    else:
        return "hard"


def get_learning_pace_recommendation(age: int) -> Dict[str, Any]:
    """Get learning pace recommendations based on age"""
    if age < 10:
        return {
            "recommended_pace": "slow",
            "session_duration": 20,
            "break_frequency": 10,
            "content_chunk_size": "small",
        }
    elif age < 14:
        return {
            "recommended_pace": "moderate",
            "session_duration": 30,
            "break_frequency": 15,
            "content_chunk_size": "medium",
        }
    else:
        return {
            "recommended_pace": "fast",
            "session_duration": 45,
            "break_frequency": 20,
            "content_chunk_size": "large",
        }


def get_student_context(user: Any, student_profile: Any = None) -> Dict[str, Any]:
    """Build student context for AI interactions"""
    context = {
        "age": None,
        "age_group": "teen",
        "education_level": "secondary",
        "learning_style": "visual",
    }

    if not user:
        return context

    # Calculate age from DOB
    if hasattr(user, "date_of_birth") and user.date_of_birth:
        if isinstance(user.date_of_birth, datetime):
            age = calculate_age(user.date_of_birth.date())
        else:
            age = calculate_age(user.date_of_birth)
        context["age"] = age
        context["age_group"] = get_age_group(age)
        context["education_level"] = get_education_level_from_age(age)

    # Override with profile if available
    if student_profile:
        if (
            hasattr(student_profile, "education_level")
            and student_profile.education_level
        ):
            context["education_level"] = student_profile.education_level
        if (
            hasattr(student_profile, "learning_style")
            and student_profile.learning_style
        ):
            context["learning_style"] = student_profile.learning_style
        if hasattr(student_profile, "age") and student_profile.age:
            context["age"] = student_profile.age
            context["age_group"] = get_age_group(student_profile.age)

    return context
