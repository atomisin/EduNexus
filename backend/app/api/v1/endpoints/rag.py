"""
RAG (Retrieval Augmented Generation) service
Uses teacher materials to generate personalized teaching content
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func, cast
from sqlalchemy.dialects.postgresql import TSVECTOR
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole, Material, TeacherStudent
from app.models.rag_models import MaterialChunk
from app.models.student import StudentProfile
from app.services.llm_service import llm_service
from app.services.parsing_service import parsing_service

logger = logging.getLogger(__name__)
router = APIRouter()


class RAGQueryRequest(BaseModel):
    query: str
    subject: Optional[str] = None
    topic: Optional[str] = None
    context_type: str = "teaching"  # teaching, explanation, quiz, summary
    target_audience: str = "student"  # student, teacher
    difficulty_level: Optional[str] = "intermediate"  # beginner, intermediate, advanced
    max_materials: int = 5


class RAGResponse(BaseModel):
    generated_content: str
    sources_used: List[Dict[str, Any]]
    context_type: str
    tokens_used: Optional[int] = None
    confidence_score: Optional[float] = None


async def hybrid_search(
    db: AsyncSession,
    query: str,
    material_filter: List[Any],
    subject: Optional[str] = None,
    max_results: int = 5,
    alpha: float = 0.7
) -> List[Dict[str, Any]]:
    """
    Perform hybrid search combining Vector similarity and BM25 full-text search.
    """
    # 1. Generate query embedding
    query_vector = parsing_service.get_query_embedding(query)
    
    # 2. Hybrid Search Logic
    # Normalize cosine distance (0 to 2) to a similarity score (0 to 1)
    vector_score = 1.0 - (MaterialChunk.embedding.cosine_distance(query_vector) / 2.0)
    
    # Full-text search score (BM25 via ts_rank_cd)
    ts_query = func.plainto_tsquery("english", query)
    bm25_score = func.ts_rank_cd(MaterialChunk.search_vector, ts_query)
    
    # Combined hybrid score
    combined_score = (
        alpha * func.coalesce(vector_score, 0.0) + 
        (1.0 - alpha) * func.coalesce(bm25_score, 0.0)
    ).label("combined_score")
    
    # 3. Build Statement
    stmt = (
        select(
            MaterialChunk, 
            Material,
            combined_score.label("combined_score"),
            vector_score.label("vector_score"),
            bm25_score.label("bm25_score")
        )
        .join(Material, MaterialChunk.material_id == Material.id)
    )
    
    if material_filter:
        stmt = stmt.filter(and_(*material_filter))
    
    if subject:
        stmt = stmt.filter(Material.subject.ilike(f"%{subject}%"))

    # Apply OR condition: relevant by vector OR relevant by BM25
    stmt = stmt.filter(or_(
        MaterialChunk.embedding.cosine_distance(query_vector) < 0.5,
        MaterialChunk.search_vector.op("@@")(ts_query)
    ))

    # Order by combined score
    stmt = stmt.order_by(combined_score.desc()).limit(max_results)
    
    res_chunks = await db.execute(stmt)
    results = res_chunks.all()
    
    return [
        {
            "chunk": r[0], 
            "material": r[1],
            "combined_score": float(r[2]),
            "vector_score": float(r[3]),
            "bm25_score": float(r[4])
        } 
        for r in results
    ]


async def retrieve_relevant_materials(
    db: AsyncSession,
    user: User,
    query: str,
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    max_results: int = 5,
) -> List[dict]:
    """
    Retrieve material CHUNKS relevant to the query using hybrid search.
    """
    # Build foundation for material access (Security/Permissions)
    material_filter = []
    if user.role == UserRole.STUDENT:
        # Check education track
        res_prof = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == user.id))
        profile = res_prof.scalars().first()
        is_professional = profile and profile.education_level == "professional"
        
        if is_professional:
            material_filter.append(Material.uploader_id == user.id)
        else:
            res_student_info = await db.execute(
                select(TeacherStudent.teacher_id, StudentProfile.grade_level)
                .join(StudentProfile, StudentProfile.user_id == TeacherStudent.student_id)
                .filter(TeacherStudent.student_id == user.id)
            )
            student_info = res_student_info.first()
            if student_info:
                material_filter.append(and_(
                    Material.uploader_id == student_info.teacher_id,
                    Material.grade_level == student_info.grade_level
                ))
            else:
                return []
    elif user.role == UserRole.TEACHER:
        material_filter.append(Material.uploader_id == user.id)

    # Call hybrid_search
    results = await hybrid_search(
        db=db,
        query=query,
        material_filter=material_filter,
        subject=subject,
        max_results=max_results
    )
    
    logger.info(f"DEBUG: Found {len(results)} hybrid chunks for RAG context.")
    return results


def build_rag_context(chunks: List[dict], context_type: str) -> str:
    """
    Build context string from material chunks for RAG
    """
    context_parts = []

    for i, item in enumerate(chunks, 1):
        chunk = item["chunk"]
        material = item["material"]
        context_parts.append(f"\n--- Source {i}: {material.title} (Page {chunk.page_number or 'N/A'}) ---")
        context_parts.append(f"Content: {chunk.content}")
        context_parts.append("")

    return "\n".join(context_parts)


def create_rag_prompt(
    query: str,
    context: str,
    context_type: str,
    target_audience: str,
    difficulty_level: str,
) -> str:
    """
    Create a prompt for RAG-based content generation
    """
    prompts = {
        "teaching": f"""You are an expert educator creating "Zero to Hero" teaching content. 
Your goal is to blend provided source materials with your own deep foundational knowledge to create a comprehensive lesson.

Context from specific educational materials:
{context}

User Query: {query}

Target Audience: {target_audience}
Difficulty Level: {difficulty_level}

Please create comprehensive teaching content that:
1. Explains the core concept from the absolute basics (Hero to Zero approach).
2. Uses the provided context to add specific details, examples, and rigor.
3. If the context is missing specific foundational pieces, use your own expertise to fill the gaps.
4. Integrate the source information naturally without explicitly saying "Source X says".
5. Is appropriate for {target_audience} at {difficulty_level} level.

Generated Content:""",
        "explanation": f"""You are an expert tutor providing a "Zero to Hero" explanation.
You must combine the provided source materials with your own clinical expertise to build a complete answer.

Context from educational materials:
{context}

Question/Topic: {query}

Target Audience: {target_audience}
Difficulty Level: {difficulty_level}

Please provide a clear, comprehensive explanation that:
1. Starts with a plain-language foundation (no jargon first).
2. Incorporates key data, examples, and explanations from the provided context.
3. Uses your own knowledge to bridge any logical gaps between the materials and the query.
4. Breaks down complex concepts into understandable "nuggets" of information.
5. Is appropriate for {target_audience} at {difficulty_level} level.

Explanation:""",
        "quiz": f"""You are an expert educator creating a quiz based on educational materials.

Context from educational materials:
{context}

Quiz Topic: {query}

Target Audience: {target_audience}
Difficulty Level: {difficulty_level}

Please create a quiz that:
1. Tests understanding of the key concepts from the materials
2. Contains 5-10 questions appropriate for {difficulty_level} level
3. Includes a mix of question types (multiple choice, short answer, problem-solving)
4. Provides an answer key at the end

Quiz:""",
        "summary": f"""You are an expert educator creating a summary of educational materials.

Context from educational materials:
{context}

Summary Topic: {query}

Target Audience: {target_audience}
Difficulty Level: {difficulty_level}

Please create a concise summary that:
1. Captures the key points from the materials
2. Is well-structured and easy to understand
3. Highlights the most important concepts
4. Is appropriate for {target_audience}

Summary:""",
    }

    return prompts.get(context_type, prompts["teaching"])


@router.post("/generate-content", response_model=RAGResponse)
async def generate_content_with_rag(
    request: RAGQueryRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate teaching content using RAG (Retrieval Augmented Generation)
    Uses teacher materials as context for generating personalized content
    """
    # Retrieve relevant materials
    materials = await retrieve_relevant_materials(
        db=db,
        user=current_user,
        query=request.query,
        subject=request.subject,
        topic=request.topic,
        max_results=request.max_materials,
    )

    # Build context from materials (if available)
    if materials:
        context = build_rag_context(materials, request.context_type)
        prompt = create_rag_prompt(
            query=request.query,
            context=context,
            context_type=request.context_type,
            target_audience=request.target_audience,
            difficulty_level=request.difficulty_level,
        )
    else:
        # Generate without materials using LLM directly
        prompt = f"""You are an expert educator. Please answer the following question:

Question: {request.query}

Target Audience: {request.target_audience}
Difficulty Level: {request.difficulty_level}

Provide a comprehensive and educational response."""

    # Generate content using LLM
    logger.debug(f"RAG PROMPT:\n{prompt}\nEND PROMPT")
    try:
        generated_content = await llm_service.generate(
            prompt=prompt, temperature=0.7, max_tokens=2000, user_id=current_user.id
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating content: {str(e)}",
        )

    # Prepare sources information
    sources = []
    seen_material_ids = set()
    for item in materials:
        material = item["material"]
        chunk = item["chunk"]
        if str(material.id) not in seen_material_ids:
            seen_material_ids.add(str(material.id))
            sources.append({
                "material_id": str(material.id),
                "title": material.title,
                "subject": material.subject,
                "education_level": material.education_level,
                "confidence_score": round(item["combined_score"], 3)
            })

    # Average combined score for confidence
    avg_score = sum(item["combined_score"] for item in materials) / len(materials) if materials else 0.0

    return RAGResponse(
        generated_content=generated_content,
        sources_used=sources,
        context_type=request.context_type,
        tokens_used=None,
        confidence_score=avg_score
    )


@router.post("/explain-topic", response_model=RAGResponse)
async def explain_topic_with_materials(
    topic: str,
    subject: Optional[str] = None,
    student_id: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a personalized explanation of a topic using available materials
    Teachers can specify a student ID to personalize for that student's level
    """
    difficulty_level = "intermediate"

    # If teacher specifies a student, adjust difficulty based on student's profile
    if current_user.role == UserRole.TEACHER and student_id:
        try:
            student_uuid = uuid.UUID(student_id)
            res_prof = await db.execute(
                select(StudentProfile).filter(StudentProfile.user_id == student_uuid)
            )
            profile = res_prof.scalars().first()

            if profile and profile.subject_proficiency:
                # Calculate average proficiency
                proficiency = profile.subject_proficiency
                avg_prof = (
                    sum(proficiency.values()) / len(proficiency) if proficiency else 0.5
                )

                if avg_prof < 0.4:
                    difficulty_level = "beginner"
                elif avg_prof > 0.7:
                    difficulty_level = "advanced"
        except ValueError:
            pass

    request = RAGQueryRequest(
        query=f"Explain {topic}",
        subject=subject,
        topic=topic,
        context_type="explanation",
        target_audience="student",
        difficulty_level=difficulty_level,
        max_materials=5,
    )

    return await generate_content_with_rag(request, db, current_user)


@router.post("/create-study-guide", response_model=RAGResponse)
async def create_study_guide(
    subject: str,
    topics: Optional[List[str]] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a comprehensive study guide using available materials
    """
    query = f"Create a comprehensive study guide for {subject}"
    if topics:
        query += f" covering: {', '.join(topics)}"

    request = RAGQueryRequest(
        query=query,
        subject=subject,
        context_type="summary",
        target_audience="student",
        difficulty_level="intermediate",
        max_materials=10,
    )

    return await generate_content_with_rag(request, db, current_user)
