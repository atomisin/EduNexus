import json
import asyncio
import uuid
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(DATABASE_URL, echo=False)

async def seed_data():
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "exam_curriculum_data.json")
    if not os.path.exists(data_path):
        print(f"File not found: {data_path}")
        return

    with open(data_path, "r") as f:
        exams = json.load(f)

    async with engine.connect() as conn:
        for exam_type, subject_list in exams.items():
            print(f"Seeding {exam_type} subjects...")
            for subject_item in subject_list:
                subj_name = subject_item.get("subject", "").replace(" Syllabus", "")
                topics_data = subject_item.get("topics", [])
                print(f"  Subject: {subj_name}")
                
                try:
                    async with conn.begin():
                        # Check if subject exists for this SPECIFIC curriculum type
                        result = await conn.execute(
                            text("SELECT id FROM subjects WHERE name ILIKE :name AND (curriculum_type = :curriculum_type OR curriculum_type IS NULL)"),
                            {"name": subj_name, "curriculum_type": exam_type.upper()}
                        )
                        subject_row = result.fetchone()
                        
                        if not subject_row:
                            # Create subject
                            depts = []
                            lower_name = subj_name.lower()
                            if any(x in lower_name for x in ["physics", "chemistry", "biology", "further math"]):
                                depts = ["Science"]
                            elif any(x in lower_name for x in ["literature", "government", "crs", "history", "yoruba", "igbo", "hausa"]):
                                depts = ["Art"]
                            elif any(x in lower_name for x in ["account", "commerce", "economics", "office practice"]):
                                depts = ["Commercial"]
                            
                            subj_id = uuid.uuid4()
                            code = f"{exam_type.upper()}-{subj_name[:3].upper()}-{str(uuid.uuid4())[:4]}"
                            
                            await conn.execute(
                                text("""
                                    INSERT INTO subjects (id, name, code, education_level, grade_levels, curriculum_type, departments, is_active, created_at, updated_at)
                                    VALUES (:id, :name, :code, :education_level, :grade_levels, :curriculum_type, :departments, :is_active, NOW(), NOW())
                                """),
                                {
                                    "id": subj_id,
                                    "name": subj_name,
                                    "code": code,
                                    "education_level": "senior_secondary",
                                    "grade_levels": [exam_type.upper(), "SS3"],
                                    "curriculum_type": exam_type.upper(),
                                    "departments": depts,
                                    "is_active": True
                                }
                            )
                        else:
                            subj_id = subject_row[0]
                        
                        # Seed topics
                        for i, topic_data in enumerate(topics_data):
                            topic_name = topic_data.get("topic")
                            if not topic_name: continue
                            
                            # Truncate topic name if too long for DB column
                            display_name = topic_name
                            if len(display_name) > 250:
                                display_name = display_name[:247] + "..."
                                
                            subtopics = topic_data.get("subtopics", [])
                            
                            # Check if topic exists
                            t_result = await conn.execute(
                                text("SELECT id FROM topics WHERE subject_id = :subject_id AND name = :name"),
                                {"subject_id": subj_id, "name": display_name}
                            )
                            topic_row = t_result.fetchone()
                            
                            if not topic_row:
                                await conn.execute(
                                    text("""
                                        INSERT INTO topics (id, subject_id, name, description, sort_order, ai_key_points, is_active, created_at)
                                        VALUES (:id, :subject_id, :name, :description, :sort_order, :ai_key_points, :is_active, NOW())
                                    """),
                                    {
                                        "id": uuid.uuid4(),
                                        "subject_id": subj_id,
                                        "name": display_name,
                                        "description": topic_name, # Full name in description
                                        "sort_order": i,
                                        "ai_key_points": subtopics,
                                        "is_active": True
                                    }
                                )
                            else:
                                await conn.execute(
                                    text("""
                                        UPDATE topics SET sort_order = :sort_order, ai_key_points = :ai_key_points, description = :description WHERE id = :id
                                    """),
                                    {
                                        "id": topic_row[0],
                                        "sort_order": i,
                                        "ai_key_points": subtopics,
                                        "description": topic_name
                                    }
                                )
                except Exception as e:
                    print(f"Error seeding subject {subj_name}: {e}")
                    # Continue to next subject
    
    print("Seeding process finished.")

if __name__ == "__main__":
    asyncio.run(seed_data())
