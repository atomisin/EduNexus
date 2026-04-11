from fastapi import APIRouter, Query, Depends
from typing import List, Dict, Any
from app.services.video_service import search_educational_videos

router = APIRouter()

@router.get("/recommendations")
async def get_video_recommendations(
    topic: str = Query(..., description="The topic to search for"),
    limit: int = Query(5, ge=1, le=10),
    level: str = Query(None, description="The student's education level"),
    style: str = Query(None, description="The student's learning style"),
    subject: str = Query(None, description="The academic subject for context")
):
    """
    Get educational video recommendations for a specific topic.
    """
    videos = await search_educational_videos(topic, limit, level, style, subject)
    return videos
