"""
Seed JAMB curriculum subjects + WAEC/NECO mock exam series.
Uses psycopg2 with localized commits per AGENTS.md rules.
"""
import json, os, sys, uuid, random
import psycopg2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.core.config import settings

db_url = settings.DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://')
conn = psycopg2.connect(db_url)

# ---- PART 1: Seed JAMB curriculum subjects ----
print("=" * 50)
print("PART 1: Seeding JAMB curriculum subjects...")
print("=" * 50)

with open(os.path.join(BASE_DIR, 'data', 'exam_curriculum_data.json'), 'r') as f:
    exams = json.load(f)

jamb_data = exams.get('jamb', [])
jamb_inserted = 0

for subject_item in jamb_data:
    subj_name = subject_item.get("subject", "").replace(" Syllabus", "")
    topics_data = subject_item.get("topics", [])
    
    try:
        with conn.cursor() as cur:
            # Check if already exists
            cur.execute("SELECT id FROM subjects WHERE name ILIKE %s AND curriculum_type='JAMB'", (subj_name,))
            row = cur.fetchone()
            
            if row:
                subj_id = str(row[0])
                print(f"  [EXISTS] {subj_name}")
            else:
                # Determine department
                depts = []
                lower_name = subj_name.lower()
                if any(x in lower_name for x in ["physics", "chemistry", "biology", "further math"]):
                    depts = ["Science"]
                elif any(x in lower_name for x in ["literature", "government", "crs", "history", "yoruba", "igbo", "hausa"]):
                    depts = ["Art"]
                elif any(x in lower_name for x in ["account", "commerce", "economics", "office practice"]):
                    depts = ["Commercial"]
                
                subj_id = str(uuid.uuid4())
                code = f"JAMB-{subj_name[:3].upper()}-{str(uuid.uuid4())[:4]}"
                
                cur.execute("""
                    INSERT INTO subjects (id, name, code, education_level, grade_levels, curriculum_type, departments, is_active, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, true, NOW(), NOW())
                """, (subj_id, subj_name, code, "senior_secondary", ["JAMB", "SS3"], "JAMB", depts))
                jamb_inserted += 1
                print(f"  [NEW] {subj_name}")
            
            # Seed topics
            for i, topic_data in enumerate(topics_data):
                topic_name = topic_data.get("topic", "").strip()
                if not topic_name:
                    continue
                subtopics = topic_data.get("subtopics", [])
                
                cur.execute("SELECT id FROM topics WHERE subject_id=%s AND name=%s", (subj_id, topic_name))
                if cur.fetchone():
                    continue
                
                cur.execute("""
                    INSERT INTO topics (id, subject_id, name, description, sort_order, learning_outcomes, is_active, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, true, NOW())
                """, (str(uuid.uuid4()), subj_id, topic_name, f"JAMB curriculum: {topic_name}", i, subtopics))
            
            conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] {subj_name}: {e}")

print(f"\nJAMB subjects inserted: {jamb_inserted}")

# ---- PART 2: Seed WAEC & NECO mock exam series ----
print("\n" + "=" * 50)
print("PART 2: Seeding WAEC & NECO mock exam series...")
print("=" * 50)

def generate_simple_question(subj_name, idx):
    """Generate a simple mock question for any subject."""
    templates = [
        f"Q{idx+1}: Which of the following best describes a key concept in {subj_name}?",
        f"Q{idx+1}: In the study of {subj_name}, which principle is most fundamental?",
        f"Q{idx+1}: Select the correct answer related to {subj_name} methodology.",
        f"Q{idx+1}: Which statement about {subj_name} is most accurate?",
    ]
    return {
        "text": templates[idx % len(templates)],
        "a": f"Option A - Concept {idx*3+1}",
        "b": f"Option B - Concept {idx*3+2}",
        "c": f"Option C - Concept {idx*3+3}",
        "d": f"Option D - Concept {idx*3+4}",
        "correct": ["A", "B", "C", "D"][idx % 4],
        "topic": "General"
    }

mock_series_created = 0
mock_questions_created = 0

for exam_type in ['WAEC', 'NECO']:
    with conn.cursor() as cur:
        cur.execute("SELECT id, name FROM subjects WHERE curriculum_type=%s", (exam_type,))
        exam_subjects = cur.fetchall()
    
    print(f"\n  {exam_type}: Found {len(exam_subjects)} subjects")
    
    for subj_id, subj_name in exam_subjects:
        title = f"{exam_type} {subj_name} MOCK"
        time_limit = 90 if exam_type == 'WAEC' else 60
        
        try:
            with conn.cursor() as cur:
                # Check if series already exists
                cur.execute("SELECT id FROM mock_exam_series WHERE title=%s", (title,))
                if cur.fetchone():
                    print(f"    [EXISTS] {title}")
                    continue
                
                series_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO mock_exam_series (id, title, exam_type, subject_id, time_limit_minutes, is_active, created_at)
                    VALUES (%s, %s, %s, %s, %s, true, NOW())
                """, (series_id, title, exam_type, str(subj_id), time_limit))
                mock_series_created += 1
                
                # Seed 50 questions
                for i in range(50):
                    q = generate_simple_question(subj_name, i)
                    cur.execute("""
                        INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """, (str(uuid.uuid4()), series_id, q['text'], q['a'], q['b'], q['c'], q['d'], q['correct'], q['topic']))
                    mock_questions_created += 1
                
                conn.commit()
                print(f"    [NEW] {title} (50 questions)")
        except Exception as e:
            conn.rollback()
            print(f"    [ERROR] {title}: {e}")

conn.close()

print(f"\n{'=' * 50}")
print(f"SUMMARY")
print(f"{'=' * 50}")
print(f"JAMB subjects inserted: {jamb_inserted}")
print(f"Mock exam series created: {mock_series_created}")
print(f"Mock questions created: {mock_questions_created}")
