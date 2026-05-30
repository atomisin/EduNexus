"""
Seed JAMB subjects, their truncated topics, and JAMB-specific mock exam series.
Uses separate commits per subject to prevent cascading rollbacks (AGENTS.md rule).
"""
import json, os, sys, uuid
import psycopg2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.core.config import settings

def truncate(val, max_len=250):
    val = val.strip()
    return val[:max_len] if len(val) > max_len else val

db_url = settings.DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://')
conn = psycopg2.connect(db_url)

with open(os.path.join(BASE_DIR, 'data', 'exam_curriculum_data.json'), 'r') as f:
    exams = json.load(f)

# ---- STEP 1: Insert JAMB subjects ----
print("STEP 1: Inserting JAMB subjects...")
jamb_data = exams.get('jamb', [])
jamb_subject_ids = {}

for subject_item in jamb_data:
    subj_name = subject_item.get("subject", "").replace(" Syllabus", "")
    
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM subjects WHERE name = %s AND curriculum_type = 'JAMB'", (subj_name,))
            row = cur.fetchone()
            if row:
                jamb_subject_ids[subj_name] = str(row[0])
                print(f"  [EXISTS] {subj_name}")
            else:
                depts = []
                lower_name = subj_name.lower()
                if any(x in lower_name for x in ["physics", "chemistry", "biology", "further math"]):
                    depts = ["Science"]
                elif any(x in lower_name for x in ["literature", "government", "crs", "history"]):
                    depts = ["Art"]
                elif any(x in lower_name for x in ["account", "commerce", "economics"]):
                    depts = ["Commercial"]
                
                subj_id = str(uuid.uuid4())
                code = f"JAMB-{subj_name.replace('JAMB ', '')[:3].upper()}-{str(uuid.uuid4())[:4]}"
                
                cur.execute("""
                    INSERT INTO subjects (id, name, code, education_level, grade_levels, curriculum_type, departments, is_active, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, true, NOW(), NOW())
                """, (subj_id, subj_name, code, "senior_secondary", ["JAMB", "SS3"], "JAMB", depts))
                conn.commit()
                jamb_subject_ids[subj_name] = subj_id
                print(f"  [NEW] {subj_name} -> {code}")
    except Exception as e:
        conn.rollback()
        print(f"  [ERROR creating subject] {subj_name}: {e}")

print(f"\nJAMB subjects ready: {len(jamb_subject_ids)}")

# ---- STEP 2: Insert JAMB topics (with truncation) ----
print("\nSTEP 2: Inserting JAMB topics...")
topics_inserted = 0

for subject_item in jamb_data:
    subj_name = subject_item.get("subject", "").replace(" Syllabus", "")
    subj_id = jamb_subject_ids.get(subj_name)
    if not subj_id:
        print(f"  [SKIP] {subj_name} - no subject ID")
        continue
    
    topics_data = subject_item.get("topics", [])
    
    try:
        with conn.cursor() as cur:
            for i, topic_data in enumerate(topics_data):
                raw_name = topic_data.get("topic", "").strip()
                if not raw_name:
                    continue
                
                topic_name = truncate(raw_name)
                subtopics = topic_data.get("subtopics", [])
                subtopics = [truncate(s, 500) for s in subtopics if s and isinstance(s, str)]
                
                cur.execute("SELECT id FROM topics WHERE subject_id=%s AND name=%s", (subj_id, topic_name))
                if cur.fetchone():
                    continue
                
                desc = raw_name if len(raw_name) > 250 else f"JAMB curriculum: {topic_name}"
                
                cur.execute("""
                    INSERT INTO topics (id, subject_id, name, description, sort_order, learning_outcomes, is_active, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, true, NOW())
                """, (str(uuid.uuid4()), subj_id, topic_name, desc, i, subtopics))
                topics_inserted += 1
            
            conn.commit()
            print(f"  [OK] {subj_name} ({len(topics_data)} topics)")
    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] {subj_name}: {e}")

print(f"\nJAMB topics inserted: {topics_inserted}")

# ---- STEP 3: Seed JAMB mock exam series (for JAMB-specific subjects) ----
print("\nSTEP 3: Seeding JAMB-specific mock exam series...")
series_created = 0

for subj_name, subj_id in jamb_subject_ids.items():
    title = f"JAMB {subj_name.replace('JAMB ', '')} MOCK"
    
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM mock_exam_series WHERE title=%s", (title,))
            if cur.fetchone():
                print(f"  [EXISTS] {title}")
                continue
            
            series_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO mock_exam_series (id, title, exam_type, subject_id, time_limit_minutes, is_active, created_at)
                VALUES (%s, %s, %s, %s, %s, true, NOW())
            """, (series_id, title, "JAMB", subj_id, 120))
            
            for i in range(50):
                q_text = f"Q{i+1}: Test question for {subj_name} concept {i+1}"
                cur.execute("""
                    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (str(uuid.uuid4()), series_id, q_text,
                      f"Option A-{i}", f"Option B-{i}", f"Option C-{i}", f"Option D-{i}",
                      ["A", "B", "C", "D"][i % 4], "General"))
            
            conn.commit()
            series_created += 1
            print(f"  [NEW] {title} (50 questions)")
    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] {title}: {e}")

conn.close()

print(f"\n{'=' * 50}")
print(f"FINAL SUMMARY")
print(f"{'=' * 50}")
print(f"JAMB subjects: {len(jamb_subject_ids)}")
print(f"JAMB topics inserted: {topics_inserted}")
print(f"JAMB mock series created: {series_created}")
