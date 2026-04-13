import os, psycopg2
db_url = os.getenv('DATABASE_URL').replace('postgresql+asyncpg://', 'postgresql://')
conn = psycopg2.connect(db_url)
try:
    with conn.cursor() as cur:
        cur.execute("SELECT id, name, code, curriculum_type FROM subjects WHERE curriculum_type='JAMB' ORDER BY name;")
        rows = cur.fetchall()
        print(f"JAMB subjects in DB: {len(rows)}")
        for r in rows:
            print(f"  id={r[0]} | name='{r[1]}' | code={r[2]} | type={r[3]}")
        
        # Check JSON data names
        import json
        with open('data/exam_curriculum_data.json', 'r') as f:
            data = json.load(f)
        print(f"\nJAMB subjects in JSON: {len(data.get('jamb', []))}")
        for s in data.get('jamb', []):
            raw = s.get("subject", "")
            stripped = raw.replace(" Syllabus", "")
            print(f"  JSON raw='{raw}' -> stripped='{stripped}'")
finally:
    conn.close()
