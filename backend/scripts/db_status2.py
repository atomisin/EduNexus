import os, psycopg2
db_url = os.getenv('DATABASE_URL').replace('postgresql+asyncpg://', 'postgresql://')
conn = psycopg2.connect(db_url)
try:
    with conn.cursor() as cur:
        cur.execute("SELECT exam_type, count(*) FROM mock_exam_series GROUP BY exam_type;")
        print("Mock Exam Series by type:")
        for r in cur.fetchall():
            print(f"  {r[0]}: {r[1]}")
        
        cur.execute("SELECT title FROM mock_exam_series ORDER BY title;")
        print("\nAll Mock Exam Series:")
        for r in cur.fetchall():
            print(f"  {r[0]}")
        
        # Check if JAMB subjects exist
        cur.execute("SELECT code, name FROM subjects WHERE curriculum_type='JAMB';")
        rows = cur.fetchall()
        print(f"\nJAMB subjects in DB: {len(rows)}")
        for r in rows:
            print(f"  {r[0]} | {r[1]}")
finally:
    conn.close()
