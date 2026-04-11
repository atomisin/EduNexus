import asyncio
import uuid
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, MetaData, Table, insert

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def seed_mock_exams():
    async with engine.connect() as conn:
        metadata = MetaData()
        # Reflect tables
        await conn.run_sync(metadata.reflect, only=['subjects', 'mock_exam_series', 'mock_questions'])
        subjects_t = metadata.tables['subjects']
        series_t = metadata.tables['mock_exam_series']
        questions_t = metadata.tables['mock_questions']

        async with AsyncSessionLocal() as db:
            try:
                # 1. Find Subjects
                res = await db.execute(select(subjects_t.c.id, subjects_t.c.name))
                subject_rows = res.all()
                subject_map = {row.name: row.id for row in subject_rows}
                print(f"Loaded {len(subject_map)} subjects via reflection.")
                
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
                            },
                            {
                                "text": "The process of maintaining a constant internal environment is called:",
                                "options": ["Metabolism", "Homeostasis", "Osmoregulation", "Diffusion"],
                                "correct": "B",
                                "explanation": "Homeostasis refers to the ability of the body or a cell to seek and maintain a condition of equilibrium or stability.",
                                "topic": "Homeostasis"
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

                from datetime import datetime, timezone

                for exam in exam_data:
                    subj_id = subject_map.get(exam['subject'])
                    if not subj_id:
                        print(f"Skipping {exam['title']} - Subject {exam['subject']} not found.")
                        continue
                    
                    # Check if exists
                    exists_res = await db.execute(select(series_t.c.id).where(series_t.c.title == exam['title']))
                    if exists_res.scalar():
                        print(f"Series {exam['title']} already exists.")
                        continue
                    
                    series_id = uuid.uuid4()
                    await db.execute(insert(series_t).values(
                        id=series_id,
                        title=exam['title'],
                        exam_type=exam['exam_type'],
                        subject_id=subj_id,
                        time_limit_minutes=exam['time_limit'],
                        is_active=True,
                        created_at=datetime.now(timezone.utc)
                    ))
                    
                    for q in exam['questions']:
                        await db.execute(insert(questions_t).values(
                            id=uuid.uuid4(),
                            series_id=series_id,
                            question_text=q['text'],
                            option_a=q['options'][0],
                            option_b=q['options'][1],
                            option_c=q['options'][2],
                            option_d=q['options'][3],
                            correct_option=q['correct'],
                            explanation=q['explanation'],
                            topic_tag=q['topic'],
                            created_at=datetime.now(timezone.utc)
                        ))
                
                await db.commit()
                print("Mock exams seeded successfully using reflected tables.")
                
            except Exception as e:
                print(f"Error seeding mock exams: {e}")
                import traceback
                traceback.print_exc()
                await db.rollback()

if __name__ == "__main__":
    asyncio.run(seed_mock_exams())
