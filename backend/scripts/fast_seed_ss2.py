import asyncio
import json
import os
import uuid
import sys
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.core.config import settings

GRADE_MAPPING = {
    "ss2": {"level": "senior_secondary", "grades": ["SS2"]},
}

def truncate(val: str, max_len: int = 250) -> str:
    val = val.strip()
    if len(val) > max_len:
        return val[:max_len]
    return val

async def seed_data():
    db_url = os.getenv('DATABASE_URL').replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(db_url, echo=False, connect_args={"statement_cache_size": 0})
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    json_path = "data/curriculum_data.json"
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for grade_key, subjects_list in data.items():
        if grade_key != "ss2":
            continue

        grade_info = GRADE_MAPPING.get(grade_key)
        education_level = grade_info["level"]
        grade_levels = grade_info["grades"]
        print(f"FAST SEEDING: {grade_key} ({education_level})...")

        for subj_data in subjects_list:
            subj_name = subj_data.get("subject", "").strip()
            slug = subj_data.get("slug", "")
            curriculum = subj_data.get("curriculum", [])
            subject_code = f"{grade_key}-{slug}"
            subj_name_trunc = truncate(subj_name)

            async with async_session() as session:
                async with session.begin():
                    result = await session.execute(
                        text("SELECT id FROM subjects WHERE code = :code"),
                        {"code": subject_code}
                    )
                    row = result.fetchone()
                    if row:
                        subj_id = row[0]
                        print(f"  [EXISTS] {subj_name_trunc}")
                    else:
                        subj_id = uuid.uuid4()
                        await session.execute(
                            text('''
                                INSERT INTO subjects (id, name, code, education_level, grade_levels,
                                                      curriculum_type, is_active, created_at, updated_at)
                                VALUES (:id, :name, :code, :level, :grades, :curr, true, NOW(), NOW())
                            '''),
                            {
                                "id": subj_id,
                                "name": subj_name_trunc,
                                "code": subject_code,
                                "level": education_level,
                                "grades": grade_levels,
                                "curr": "Nigerian National Curriculum",
                            }
                        )
                        print(f"  [NEW] {subj_name_trunc}")

                    # Topics
                    for i, item in enumerate(curriculum):
                        topic_name = item.get("topic", "").strip()
                        if not topic_name: continue
                        lesson_items = item.get("subtopics") or item.get("lessons") or []
                        term, week = item.get("term", ""), item.get("week", "")
                        topic_name_trunc = truncate(topic_name)
                        
                        t_result = await session.execute(
                            text("SELECT id FROM topics WHERE subject_id = :sid AND name = :name"),
                            {"sid": subj_id, "name": topic_name_trunc}
                        )
                        if t_result.fetchone(): continue

                        topic_id = uuid.uuid4()
                        desc_text = f"Term: {term}, Week: {week}" if term else None
                        await session.execute(
                            text('''
                                INSERT INTO topics (id, subject_id, name, description, sort_order,
                                                    learning_outcomes, is_active, created_at)
                                VALUES (:id, :sid, :name, :desc, :order, :outcomes, true, NOW())
                            '''),
                            {"id": topic_id, "sid": subj_id, "name": topic_name_trunc, "desc": desc_text, "order": i, "outcomes": []}
                        )

                        for j, sub in enumerate(lesson_items):
                            if not sub or not isinstance(sub, str) or not sub.strip(): continue
                            await session.execute(
                                text('''
                                    INSERT INTO lessons (id, topic_id, title, content, display_order, created_at, updated_at)
                                    VALUES (:id, :tid, :title, :content, :order, NOW(), NOW())
                                '''),
                                {"id": uuid.uuid4(), "tid": topic_id, "title": truncate(sub.strip()), "content": sub.strip() if len(sub.strip())>250 else None, "order": j}
                            )
    await engine.dispose()
    print('SS2 Seeding logic fully executed.')

if __name__ == "__main__":
    asyncio.run(seed_data())
