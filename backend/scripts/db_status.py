import os, psycopg2
db_url = os.getenv('DATABASE_URL').replace('postgresql+asyncpg://', 'postgresql://')
conn = psycopg2.connect(db_url)
try:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM subjects;")
        print(f"Subjects: {cur.fetchone()[0]}")
        cur.execute("SELECT count(*) FROM topics;")
        print(f"Topics: {cur.fetchone()[0]}")
        cur.execute("SELECT count(*) FROM lessons;")
        print(f"Lessons: {cur.fetchone()[0]}")
        cur.execute("SELECT count(*) FROM mock_exam_series;")
        print(f"Mock Exam Series: {cur.fetchone()[0]}")
        cur.execute("SELECT count(*) FROM mock_questions;")
        print(f"Mock Questions: {cur.fetchone()[0]}")
        print("\n--- Subjects by curriculum_type ---")
        cur.execute("SELECT curriculum_type, count(*) FROM subjects GROUP BY curriculum_type ORDER BY count(*) DESC;")
        for r in cur.fetchall():
            print(f"  {r[0]}: {r[1]}")
        print("\n--- Exam subjects (JAMB/WAEC/NECO) ---")
        cur.execute("SELECT code, name, curriculum_type FROM subjects WHERE curriculum_type IN ('JAMB','WAEC','NECO') ORDER BY curriculum_type, name;")
        for r in cur.fetchall():
            print(f"  [{r[2]}] {r[0]} | {r[1]}")
finally:
    conn.close()
