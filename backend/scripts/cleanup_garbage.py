import os
import psycopg2

def run_cleanup():
    with open('.env', 'r') as f:
        env_str = f.read()

    db_url = ''
    for line in env_str.split('\n'):
        if line.startswith('DATABASE_URL='):
            db_url = line.split('=', 1)[1].strip().strip('\'"').replace('postgresql+asyncpg://', 'postgresql://')

    if not db_url:
        print("DATABASE_URL not found")
        return

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            # 1. Clean up Topics (CSV Headers)
            garbage_topics = ["CLASS", "SUBJECT", "TERM", "TOPICS"]
            cur.execute(
                "SELECT id, name FROM topics WHERE name = ANY(%s)", 
                (garbage_topics,)
            )
            found_topics = cur.fetchall()
            print(f"Found {len(found_topics)} garbage topics to delete.")
            if found_topics:
                cur.execute("DELETE FROM lessons WHERE topic_id IN (SELECT id FROM topics WHERE name = ANY(%s))", (garbage_topics,))
                cur.execute("DELETE FROM topics WHERE name = ANY(%s)", (garbage_topics,))
                print(f"Deleted {cur.rowcount} garbage topics.")

            # 2. Clean up Subjects
            placeholder_codes = ['MAT-SS_', 'ENG-SS_', 'PHY-SS_']
            cur.execute(
                "SELECT id, name, code FROM subjects WHERE code = ANY(%s)",
                (placeholder_codes,)
            )
            found_subjects = cur.fetchall()
            print(f"Found {len(found_subjects)} placeholder subjects to delete.")
            
            for subj in found_subjects:
                subj_id = subj[0]
                
                # Delete cascaded references manually just in case cascade is not fully configured
                cur.execute("DELETE FROM student_subject WHERE subject_id = %s", (subj_id,))
                cur.execute("DELETE FROM teacher_subject WHERE subject_id = %s", (subj_id,))
                cur.execute("DELETE FROM lessons WHERE topic_id IN (SELECT id FROM topics WHERE subject_id = %s)", (subj_id,))
                cur.execute("DELETE FROM topics WHERE subject_id = %s", (subj_id,))
                cur.execute("DELETE FROM mock_exam_series WHERE subject_id = %s", (subj_id,))
                cur.execute("DELETE FROM subjects WHERE id = %s", (subj_id,))
                
                print(f"Deleted subject and associated data: {subj[1]} ({subj[2]})")
                
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    run_cleanup()
