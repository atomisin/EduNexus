import uuid
from sqlalchemy import select, create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.subject import Subject
from app.models.mock_exam import MockExamSeries, MockQuestion

# Create sync session
sync_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("postgres://", "postgresql://")
engine = create_engine(sync_url)
Session = sessionmaker(bind=engine)

def to_uuid(val):
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))

def seed_mock_exams():
    db = Session()
    try:
        # 1. Find Subjects
        subjects = db.execute(select(Subject)).scalars().all()
        subject_map = {s.name: to_uuid(s.id) for s in subjects}
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
                        "options": {"A": "Gene", "B": "Chromosome", "C": "Nucleus", "D": "Ribosome"},
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
                        "options": {"A": "2", "B": "3", "C": "5", "D": "8"},
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
            
            # Check if series already exists
            existing = db.execute(select(MockExamSeries).filter_by(title=exam['title'])).scalar_one_or_none()
            if existing:
                print(f"Series {exam['title']} already exists.")
                continue
            
            series_id = uuid.uuid4()
            series = MockExamSeries(
                id=series_id,
                title=exam['title'],
                exam_type=exam['exam_type'],
                subject_id=subj_id,
                time_limit_minutes=exam['time_limit']
            )
            db.add(series)
            
            for q in exam['questions']:
                question = MockQuestion(
                    id=uuid.uuid4(),
                    series_id=series_id,
                    question_text=q['text'],
                    option_a=q['options']['A'],
                    option_b=q['options']['B'],
                    option_c=q['options']['C'],
                    option_d=q['options']['D'],
                    correct_option=q['correct'],
                    explanation=q['explanation'],
                    topic_tag=q['topic']
                )
                db.add(question)
                
        db.commit()
        print("Mock exams seeded successfully using sync engine.")
        
    except Exception as e:
        print(f"Error seeding mock exams: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_mock_exams()
