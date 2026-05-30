import json
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.db.database import get_async_db
from app.models.user import User
from app.services.video_service import search_educational_videos

router = APIRouter()

_VIDEO_TABLES_READY = False


class VideoEventRequest(BaseModel):
    video_id: str
    topic_name: str
    subject_name: Optional[str] = None
    source: Optional[str] = "tutor"
    event_type: str = Field(pattern="^(impression|click|watch_start|watch_60s|watch_complete)$")
    watch_seconds: int = 0
    video_title: Optional[str] = None
    channel_title: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class VideoFeedbackRequest(BaseModel):
    video_id: str
    topic_name: str
    subject_name: Optional[str] = None
    feedback: str = Field(pattern="^(like|dislike)$")
    video_title: Optional[str] = None
    channel_title: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


async def _ensure_video_tables(db: AsyncSession) -> None:
    global _VIDEO_TABLES_READY
    if _VIDEO_TABLES_READY:
        return

    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS video_recommendation_events (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL,
                video_id TEXT NOT NULL,
                topic_name TEXT NOT NULL,
                subject_name TEXT,
                source TEXT,
                event_type TEXT NOT NULL,
                watch_seconds INTEGER NOT NULL DEFAULT 0,
                video_title TEXT,
                channel_title TEXT,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_video_events_lookup
            ON video_recommendation_events (video_id, lower(topic_name), event_type)
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS video_recommendation_feedback (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL,
                video_id TEXT NOT NULL,
                topic_name TEXT NOT NULL,
                subject_name TEXT,
                feedback TEXT NOT NULL,
                video_title TEXT,
                channel_title TEXT,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_video_feedback_user_topic UNIQUE (user_id, video_id, topic_name)
            )
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_video_feedback_lookup
            ON video_recommendation_feedback (video_id, lower(topic_name), feedback)
            """
        )
    )
    await db.commit()
    _VIDEO_TABLES_READY = True


async def _platform_evidence(db: AsyncSession, video_id: str, topic_name: str, user_id: uuid.UUID) -> Dict[str, Any]:
    await _ensure_video_tables(db)
    event_result = await db.execute(
        text(
            """
            SELECT
                COALESCE(SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END), 0) AS impressions,
                COALESCE(SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END), 0) AS clicks,
                COALESCE(SUM(CASE WHEN event_type = 'watch_start' THEN 1 ELSE 0 END), 0) AS watch_starts,
                COALESCE(SUM(CASE WHEN event_type = 'watch_60s' THEN 1 ELSE 0 END), 0) AS watch_60s,
                COALESCE(SUM(CASE WHEN event_type = 'watch_complete' THEN 1 ELSE 0 END), 0) AS watch_completions
            FROM video_recommendation_events
            WHERE video_id = :video_id
              AND lower(topic_name) = lower(:topic_name)
            """
        ),
        {"video_id": video_id, "topic_name": topic_name},
    )
    feedback_result = await db.execute(
        text(
            """
            SELECT
                COALESCE(SUM(CASE WHEN feedback = 'like' THEN 1 ELSE 0 END), 0) AS likes,
                COALESCE(SUM(CASE WHEN feedback = 'dislike' THEN 1 ELSE 0 END), 0) AS dislikes
            FROM video_recommendation_feedback
            WHERE video_id = :video_id
              AND lower(topic_name) = lower(:topic_name)
            """
        ),
        {"video_id": video_id, "topic_name": topic_name},
    )
    learner_result = await db.execute(
        text(
            """
            SELECT feedback
            FROM video_recommendation_feedback
            WHERE user_id = :user_id
              AND video_id = :video_id
              AND topic_name = :topic_name
            """
        ),
        {"user_id": user_id, "video_id": video_id, "topic_name": topic_name},
    )
    event_row = event_result.mappings().first() or {}
    feedback_row = feedback_result.mappings().first() or {}
    return {
        "platform_evidence": {
            "impressions": int(event_row.get("impressions") or 0),
            "clicks": int(event_row.get("clicks") or 0),
            "watch_starts": int(event_row.get("watch_starts") or 0),
            "watch_60s": int(event_row.get("watch_60s") or 0),
            "watch_completions": int(event_row.get("watch_completions") or 0),
            "likes": int(feedback_row.get("likes") or 0),
            "dislikes": int(feedback_row.get("dislikes") or 0),
        },
        "learner_feedback": learner_result.scalar_one_or_none(),
    }


async def _attach_platform_evidence(
    db: AsyncSession,
    videos: list[dict],
    topic_name: str,
    user_id: uuid.UUID,
) -> list[dict]:
    enriched = []
    for video in videos:
        evidence = await _platform_evidence(db, str(video.get("id") or ""), topic_name, user_id)
        enriched.append({**video, **evidence})
    return enriched


async def _update_creator_evidence_from_feedback(db: AsyncSession, payload: VideoFeedbackRequest, delta: int) -> None:
    if delta == 0 or not payload.channel_title:
        return
    await db.execute(
        text(
            """
            UPDATE video_creator_profiles
            SET
                community_evidence_count = GREATEST(0, COALESCE(community_evidence_count, 0) + :delta),
                community_evidence_summary = COALESCE(
                    NULLIF(community_evidence_summary, ''),
                    'Learner feedback supports this creator for academic video recommendations.'
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE is_active = TRUE
              AND (
                lower(creator_name) = lower(:channel_title)
                OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(channel_aliases) AS alias
                    WHERE lower(alias) = lower(:channel_title)
                )
              )
            """
        ),
        {"channel_title": payload.channel_title, "delta": delta},
    )


@router.get("/recommendations")
async def get_video_recommendations(
    topic: str = Query(..., description="The topic to search for"),
    limit: int = Query(5, ge=1, le=10),
    level: Optional[str] = Query(None, description="The student's education level"),
    style: Optional[str] = Query(None, description="The student's learning style"),
    subject: Optional[str] = Query(None, description="The academic subject for context"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get educational video recommendations for a specific topic.
    """
    videos = await search_educational_videos(topic, limit, level, style, subject, db=db)
    return await _attach_platform_evidence(db, videos, topic, current_user.id)


@router.post("/events")
async def record_video_event(
    payload: VideoEventRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    await _ensure_video_tables(db)
    await db.execute(
        text(
            """
            INSERT INTO video_recommendation_events (
                id,
                user_id,
                video_id,
                topic_name,
                subject_name,
                source,
                event_type,
                watch_seconds,
                video_title,
                channel_title,
                metadata,
                created_at
            )
            VALUES (
                :id,
                :user_id,
                :video_id,
                :topic_name,
                :subject_name,
                :source,
                :event_type,
                :watch_seconds,
                :video_title,
                :channel_title,
                CAST(:metadata AS jsonb),
                CURRENT_TIMESTAMP
            )
            """
        ),
        {
            "id": uuid.uuid4(),
            "user_id": current_user.id,
            "video_id": payload.video_id,
            "topic_name": payload.topic_name,
            "subject_name": payload.subject_name,
            "source": payload.source,
            "event_type": payload.event_type,
            "watch_seconds": payload.watch_seconds,
            "video_title": payload.video_title,
            "channel_title": payload.channel_title,
            "metadata": json.dumps(payload.metadata),
        },
    )
    await db.commit()
    return await _platform_evidence(db, payload.video_id, payload.topic_name, current_user.id)


@router.post("/feedback")
async def set_video_feedback(
    payload: VideoFeedbackRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    await _ensure_video_tables(db)
    previous_result = await db.execute(
        text(
            """
            SELECT feedback
            FROM video_recommendation_feedback
            WHERE user_id = :user_id
              AND video_id = :video_id
              AND topic_name = :topic_name
            """
        ),
        {
            "user_id": current_user.id,
            "video_id": payload.video_id,
            "topic_name": payload.topic_name,
        },
    )
    previous_feedback = previous_result.scalar_one_or_none()
    old_positive = previous_feedback == "like"
    new_positive = payload.feedback == "like"
    creator_evidence_delta = int(new_positive) - int(old_positive)

    await db.execute(
        text(
            """
            INSERT INTO video_recommendation_feedback (
                id,
                user_id,
                video_id,
                topic_name,
                subject_name,
                feedback,
                video_title,
                channel_title,
                metadata,
                created_at,
                updated_at
            )
            VALUES (
                :id,
                :user_id,
                :video_id,
                :topic_name,
                :subject_name,
                :feedback,
                :video_title,
                :channel_title,
                CAST(:metadata AS jsonb),
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (user_id, video_id, topic_name)
            DO UPDATE SET
                feedback = EXCLUDED.feedback,
                subject_name = EXCLUDED.subject_name,
                video_title = EXCLUDED.video_title,
                channel_title = EXCLUDED.channel_title,
                metadata = EXCLUDED.metadata,
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        {
            "id": uuid.uuid4(),
            "user_id": current_user.id,
            "video_id": payload.video_id,
            "topic_name": payload.topic_name,
            "subject_name": payload.subject_name,
            "feedback": payload.feedback,
            "video_title": payload.video_title,
            "channel_title": payload.channel_title,
            "metadata": json.dumps(payload.metadata),
        },
    )
    await _update_creator_evidence_from_feedback(db, payload, creator_evidence_delta)
    await db.commit()
    return await _platform_evidence(db, payload.video_id, payload.topic_name, current_user.id)
