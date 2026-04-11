"""
Seed curriculum data (Primary + JSS + SS) from curriculum_data.json into the database.
Uses raw SQL via asyncpg to avoid ORM mapper issues.
Handles large text gracefully by truncating names/titles.
"""
import asyncio
import json
import os
import uuid
import sys
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Mapping grade keys to model values
GRADE_MAPPING = {
    "primary1": {"level": "primary", "grades": ["P1"]},
    "primary2": {"level": "primary", "grades": ["P2"]},
    "primary3": {"level": "primary", "grades": ["P3"]},
    "primary4": {"level": "primary", "grades": ["P4"]},
    "primary5": {"level": "primary", "grades": ["P5"]},
    "primary6": {"level": "primary", "grades": ["P6"]},
    "jss1": {"level": "junior_secondary", "grades": ["JSS1"]},
    "jss2": {"level": "junior_secondary", "grades": ["JSS2"]},
    "jss3": {"level": "junior_secondary", "grades": ["JSS3"]},
    "ss1": {"level": "senior_secondary", "grades": ["SS1"]},
    "ss2": {"level": "senior_secondary", "grades": ["SS2"]},
    "ss3": {"level": "senior_secondary", "grades": ["SS3"]},
}


def truncate(val: str, max_len: int = 250) -> str:
    """Truncate string to max_len characters."""
    val = val.strip()
    if len(val) > max_len:
        return val[:max_len]
    return val


async def seed_data():
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif not db_url.startswith("postgresql+asyncpg://"):
        db_url = "postgresql+asyncpg://" + db_url.split("://", 1)[-1]

    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    json_path = os.path.join(BASE_DIR, "data", "curriculum_data.json")
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found. Run scraper first.")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    subjects_created = 0
    topics_created = 0
    lessons_created = 0
    errors = 0

    for grade_key, subjects_list in data.items():
        grade_info = GRADE_MAPPING.get(grade_key)
        if not grade_info:
            print(f"Skipping unknown grade key: {grade_key}")
            continue

        education_level = grade_info["level"]
        grade_levels = grade_info["grades"]
        print(f"\nSeeding {grade_key} ({education_level})...")

        for subj_data in subjects_list:
            subj_name = subj_data.get("subject", "").strip()
            slug = subj_data.get("slug", "")
            curriculum = subj_data.get("curriculum", [])
            if not subj_name:
                continue

            subject_code = f"{grade_key}-{slug}"
            subj_name_trunc = truncate(subj_name)

            async with async_session() as session:
                async with session.begin():
                    try:
                        # Check if subject exists
                        result = await session.execute(
                            text("SELECT id FROM subjects WHERE code = :code"),
                            {"code": subject_code}
                        )
                        row = result.fetchone()

                        if row:
                            subj_id = row[0]
                            print(f"  [EXISTS] {subj_name_trunc} ({subject_code})")
                        else:
                            subj_id = uuid.uuid4()
                            await session.execute(
                                text("""
                                    INSERT INTO subjects (id, name, code, education_level, grade_levels,
                                                          curriculum_type, is_active, created_at, updated_at)
                                    VALUES (:id, :name, :code, :level, :grades, :curr, true, NOW(), NOW())
                                """),
                                {
                                    "id": subj_id,
                                    "name": subj_name_trunc,
                                    "code": subject_code,
                                    "level": education_level,
                                    "grades": grade_levels,
                                    "curr": "Nigerian National Curriculum",
                                }
                            )
                            subjects_created += 1
                            print(f"  [NEW] {subj_name_trunc} ({subject_code})")

                        # Seed topics
                        for i, item in enumerate(curriculum):
                            topic_name = item.get("topic", "").strip()
                            if not topic_name:
                                continue

                            # Try 'subtopics' then 'lessons' for backward/cross-grade compatibility
                            lesson_items = item.get("subtopics") or item.get("lessons") or []
                            term = item.get("term", "")
                            week = item.get("week", "")
                            topic_name_trunc = truncate(topic_name)

                            # Check if topic already exists
                            t_result = await session.execute(
                                text("SELECT id FROM topics WHERE subject_id = :sid AND name = :name"),
                                {"sid": subj_id, "name": topic_name_trunc}
                            )
                            t_row = t_result.fetchone()

                            if t_row:
                                continue  # already seeded

                            topic_id = uuid.uuid4()
                            desc_text = f"Term: {term}, Week: {week}" if term else None

                            await session.execute(
                                text("""
                                    INSERT INTO topics (id, subject_id, name, description, sort_order,
                                                        learning_outcomes, is_active, created_at)
                                    VALUES (:id, :sid, :name, :desc, :order, :outcomes, true, NOW())
                                """),
                                {
                                    "id": topic_id,
                                    "sid": subj_id,
                                    "name": topic_name_trunc,
                                    "desc": desc_text,
                                    "order": i,
                                    "outcomes": [truncate(s, 500) for s in lesson_items if s and isinstance(s, str)],
                                }
                            )
                            topics_created += 1

                            # Seed lessons from lesson_items (subtopics or lessons in JSON)
                            for j, sub in enumerate(lesson_items):
                                if not sub or not isinstance(sub, str) or not sub.strip():
                                    continue
                                full_text = sub.strip()
                                title = truncate(full_text)

                                await session.execute(
                                    text("""
                                        INSERT INTO lessons (id, topic_id, title, content, display_order,
                                                             created_at, updated_at)
                                        VALUES (:id, :tid, :title, :content, :order, NOW(), NOW())
                                    """),
                                    {
                                        "id": uuid.uuid4(),
                                        "tid": topic_id,
                                        "title": title,
                                        "content": full_text if len(full_text) > 250 else None,
                                        "order": j,
                                    }
                                )
                                lessons_created += 1

                    except Exception as e:
                        errors += 1
                        err_msg = str(e)[:120]
                        print(f"    [ERROR] {subj_name_trunc}: {err_msg}")
                        # Session auto-rolls back on exception

    print(f"\n=== Seeding Complete ===")
    print(f"Subjects created: {subjects_created}")
    print(f"Topics created:   {topics_created}")
    print(f"Lessons created:  {lessons_created}")
    print(f"Errors:           {errors}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_data())
