from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, and_
from typing import List, Dict, Any, Optional
import uuid
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_student
from app.models.user import User, Material
from app.models.rag_models import MaterialChunk
from app.models.student import StudentProfile
from app.services.parsing_service import parsing_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/recommendations")
async def get_reading_recommendations(
    topic: str = Query(..., min_length=2),
    subject: Optional[str] = Query(None),
    limit: int = Query(5, ge=1, le=10),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_student)
):
    """
    Get personalized reading recommendations (Brain Power Cards)
    based on the student's level and subject.
    """
    # 1. Get student profile for education level filtering
    result = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == current_user.id)
    )
    profile = result.scalars().first()
    if not profile:
        return {"cards": [], "total": 0}

    edu_level = profile.education_level
    
    # 2. Prepare Hybrid Search
    query_vector = parsing_service.get_query_embedding(topic)
    ts_query = func.plainto_tsquery("english", topic)
    
    # Scores
    vector_score = 1.0 - (MaterialChunk.embedding.cosine_distance(query_vector) / 2.0)
    bm25_score = func.ts_rank_cd(MaterialChunk.search_vector, ts_query)
    
    alpha = 0.7
    combined_score = (
        alpha * func.coalesce(vector_score, 0.0) + 
        (1.0 - alpha) * func.coalesce(bm25_score, 0.0)
    ).label("combined_score")
    
    # 3. Build Query
    stmt = (
        select(MaterialChunk, Material, combined_score)
        .join(Material, MaterialChunk.material_id == Material.id)
        .filter(Material.education_level == edu_level)
    )
    
    if subject:
        stmt = stmt.filter(Material.subject.ilike(f"%{subject}%"))
        
    # Hybrid filter: Relevant by vector similarity OR full-text match
    stmt = stmt.filter(or_(
        MaterialChunk.embedding.cosine_distance(query_vector) < 0.6,
        MaterialChunk.search_vector.op("@@")(ts_query)
    ))
    
    stmt = stmt.order_by(combined_score.desc()).limit(limit)
    
    # 4. Execute
    exec_result = await db.execute(stmt)
    results = exec_result.all()
    
    cards = []
    for chunk, material, score in results:
        # Calculate read time
        word_count = len(chunk.content.split())
        read_seconds = max(30, int((word_count / 150) * 60))
        
        cards.append({
            "id": str(chunk.id),
            "material_id": str(material.id),
            "title": material.title,
            "subject": material.subject,
            "topic": material.topic or topic,
            "content": chunk.content[:800],  # Truncate to 800 chars
            "snippet": chunk.content[:150] + "..." if len(chunk.content) > 150 else chunk.content,
            "estimated_read_seconds": read_seconds,
            "confidence_score": round(float(score), 3),
            "page_number": getattr(chunk, 'page_number', None)
        })
        
    return {
        "cards": cards,
        "total": len(cards),
        "topic": topic,
        "education_level": edu_level
    }
