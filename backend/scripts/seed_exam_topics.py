"""
Fix JAMB topics: truncate names to 250 chars per AGENTS.md rules.
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

topics_inserted = 0

for exam_type in ['jamb', 'waec', 'neco']:
    exam_data = exams.get(exam_type, [])
    print(f"\nSeeding {exam_type.upper()} topics...")
    
    for subject_item in exam_data:
        subj_name = subject_item.get("subject", "").replace(" Syllabus", "")
        topics_data = subject_item.get("topics", [])
        
        try:
            with conn.cursor() as cur:
                # Find existing subject
                cur.execute("SELECT id FROM subjects WHERE name ILIKE %s AND curriculum_type=%s", 
                           (subj_name, exam_type.upper()))
                row = cur.fetchone()
                if not row:
                    print(f"  [SKIP] {subj_name} - subject not found")
                    continue
                
                subj_id = str(row[0])
                
                for i, topic_data in enumerate(topics_data):
                    raw_topic_name = topic_data.get("topic", "").strip()
                    if not raw_topic_name:
                        continue
                    
                    topic_name = truncate(raw_topic_name)
                    subtopics = topic_data.get("subtopics", [])
                    # Truncate subtopics too
                    subtopics = [truncate(s, 500) for s in subtopics if s and isinstance(s, str)]
                    
                    # Check if topic exists (using truncated name)
                    cur.execute("SELECT id FROM topics WHERE subject_id=%s AND name=%s", (subj_id, topic_name))
                    if cur.fetchone():
                        continue
                    
                    # Store full name in description if truncated
                    desc = raw_topic_name if len(raw_topic_name) > 250 else f"{exam_type.upper()} curriculum: {topic_name}"
                    
                    cur.execute("""
                        INSERT INTO topics (id, subject_id, name, description, sort_order, learning_outcomes, is_active, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, true, NOW())
                    """, (str(uuid.uuid4()), subj_id, topic_name, desc, i, subtopics))
                    topics_inserted += 1
                
                conn.commit()
                print(f"  [OK] {subj_name}")
        except Exception as e:
            conn.rollback()
            print(f"  [ERROR] {subj_name}: {e}")

conn.close()
print(f"\nTotal exam topics inserted: {topics_inserted}")
