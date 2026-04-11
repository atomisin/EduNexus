import asyncio
import uuid
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(DATABASE_URL, echo=False)

async def seed_mock_exams():
    async with engine.begin() as conn:
        try:
            # 1. Get Subjects
            res = await conn.execute(text("SELECT id, name FROM subjects"))
            subject_rows = res.all()
            subject_map = {row.name: row.id for row in subject_rows}
            print(f"Loaded {len(subject_map)} subjects.")
            
            exam_data = [
                {
                    "title": "JAMB Biology 2024 Prep",
                    "exam_type": "JAMB",
                    "subject": "Biology",
                    "time_limit": 45,
                    "questions": [
                        {
                            "text": "Which of the following is the functional unit of heredity?",
                            "options": ["Gene", "Chromosome", "Nucleus", "Ribosome"],
                            "correct": "A",
                            "explanation": "A gene is a basic physical and functional unit of heredity.",
                            "topic": "Genetics"
                        }
                    ]
                },
                {
                    "title": "WAEC Mathematics Core 2024",
                    "exam_type": "WAEC",
                    "subject": "Mathematics",
                    "time_limit": 60,
                    "questions": [
                        {
                            "text": "Find the value of x if 2^(x+3) = 32.",
                            "options": ["2", "3", "5", "8"],
                            "correct": "A",
                            "explanation": "32 is 2^5. So x+3 = 5, which means x = 2.",
                            "topic": "Indices"
                        }
                    ]
                }
            ]

            for exam in exam_data:
                subj_id = subject_map.get(exam['subject'])
                if not subj_id:
                    print(f"Skipping {exam['title']} - Subject {exam['subject']} not found.")
                    continue
                
                # Check if exists
                exists_res = await conn.execute(
                    text("SELECT id FROM mock_exam_series WHERE title = :title"),
                    {"title": exam['title']}
                )
                if exists_res.scalar():
                    print(f"Series {exam['title']} already exists.")
                    continue
                
                series_id = uuid.uuid4()
                await conn.execute(
                    text("""
                        INSERT INTO mock_exam_series 
                        (id, title, exam_type, subject_id, time_limit_minutes, is_active, created_at)
                        VALUES (:id, :title, :type, :subj_id, :time, true, now())
                    """),
                    {
                        "id": series_id,
                        "title": exam['title'],
                        "type": exam['exam_type'],
                        "subj_id": subj_id,
                        "time": exam['time_limit']
                    }
                )
                
                for q in exam['questions']:
                    await conn.execute(
                        text("""
                            INSERT INTO mock_questions 
                            (id, series_id, question_text, option_a, option_b, option_c, option_d, 
                             correct_option, explanation, topic_tag, created_at)
                            VALUES (:id, :sid, :txt, :oa, :ob, :oc, :od, :co, :exp, :topic, now())
                        """),
                        {
                            "id": uuid.uuid4(),
                            "sid": series_id,
                            "txt": q['text'],
                            "oa": q['options'][0],
                            "ob": q['options'][1],
                            "oc": q['options'][2],
                            "od": q['options'][3],
                            "co": q['correct'],
                            "exp": q['explanation'],
                            "topic": q['topic']
                        }
                    )
            
            print("Mock exams seeded successfully using raw SQL.")
            
        except Exception as e:
            print(f"Error seeding mock exams: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(seed_mock_exams())
