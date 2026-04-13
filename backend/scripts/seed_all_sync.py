import json
import os
import uuid
import psycopg2
from psycopg2.extras import execute_batch

def truncate(val, max_len=250):
    val = val.strip()
    return val[:max_len] if len(val) > max_len else val

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

def sync_seed():
    db_url = os.getenv('DATABASE_URL').replace('postgresql+asyncpg://', 'postgresql://')
    conn = psycopg2.connect(db_url)
    
    with open('data/curriculum_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    with conn.cursor() as cur:
        # Pre-cache existing subject codes to prevent duplicate checks
        cur.execute("SELECT code FROM subjects")
        existing_subject_codes = set(row[0] for row in cur.fetchall())
        
        # Pre-cache existing topic names per subject
        cur.execute("SELECT subject_id, name FROM topics")
        existing_topics = set(f"{row[0]}-{row[1]}" for row in cur.fetchall())
    
    total_subjects = 0
    total_topics = 0
    total_lessons = 0
    
    for grade_key, subjects_list in data.items():
        grade_info = GRADE_MAPPING.get(grade_key)
        if not grade_info: continue
        
        education_level = grade_info["level"]
        grade_levels = grade_info["grades"]
        print(f"\\nSeeding {grade_key} ({education_level})...")

        for subj_data in subjects_list:
            subj_name = subj_data.get("subject", "").strip()
            slug = subj_data.get("slug", "")
            curriculum = subj_data.get("curriculum", [])
            if not subj_name: continue

            subject_code = f"{grade_key}-{slug}"
            subj_name_trunc = truncate(subj_name)
            
            # 1. Insert Subject
            if subject_code not in existing_subject_codes:
                subj_id = str(uuid.uuid4())
                with conn.cursor() as cur:
                    cur.execute('''
                        INSERT INTO subjects (id, name, code, education_level, grade_levels, curriculum_type, is_active, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, true, NOW(), NOW())
                    ''', (subj_id, subj_name_trunc, subject_code, education_level, grade_levels, "Nigerian National Curriculum"))
                existing_subject_codes.add(subject_code)
                print(f"  [NEW DB] {subj_name_trunc}")
                total_subjects += 1
            else:
                with conn.cursor() as cur:
                    cur.execute("SELECT id FROM subjects WHERE code = %s", (subject_code,))
                    subj_id = str(cur.fetchone()[0])

            # Prepare topics and lessons
            topics_to_insert = []
            lessons_to_insert = []
            
            for i, item in enumerate(curriculum):
                topic_name = truncate(item.get("topic", "").strip())
                if not topic_name: continue
                
                topic_key = f"{subj_id}-{topic_name}"
                if topic_key in existing_topics:
                    continue
                    
                topic_id = str(uuid.uuid4())
                term = item.get("term", "")
                week = item.get("week", "")
                desc_text = f"Term: {term}, Week: {week}" if term else None
                
                lesson_items = item.get("subtopics") or item.get("lessons") or []
                
                topics_to_insert.append((
                    topic_id, subj_id, topic_name, desc_text, i, [], True
                ))
                existing_topics.add(topic_key)
                total_topics += 1
                
                for j, sub in enumerate(lesson_items):
                    if not sub or not isinstance(sub, str) or not sub.strip(): continue
                    full_text = sub.strip()
                    title = truncate(full_text)
                    content = full_text if len(full_text) > 250 else None
                    lessons_to_insert.append((
                        str(uuid.uuid4()), topic_id, title, content, j
                    ))
                    total_lessons += 1
            
            # Bulk Insert Topics and Lessons
            if topics_to_insert:
                with conn.cursor() as cur:
                    execute_batch(cur, '''
                        INSERT INTO topics (id, subject_id, name, description, sort_order, learning_outcomes, is_active, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                    ''', topics_to_insert)
            
            if lessons_to_insert:
                with conn.cursor() as cur:
                    execute_batch(cur, '''
                        INSERT INTO lessons (id, topic_id, title, content, display_order, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                    ''', lessons_to_insert)
            
            conn.commit()

    conn.close()
    print(f"\\n--- ALL CURRICULUM SEEDED ---")
    print(f"Total Subjects Inserted: {total_subjects}")
    print(f"Total Topics Inserted: {total_topics}")
    print(f"Total Lessons Inserted: {total_lessons}")

if __name__ == "__main__":
    sync_seed()
