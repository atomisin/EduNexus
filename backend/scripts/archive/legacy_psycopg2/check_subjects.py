import psycopg2, os
with open('.env', 'r') as f:
    env_str = f.read()

db_url = ''
for line in env_str.split('\n'):
    if line.startswith('DATABASE_URL='):
        db_url = line.split('=', 1)[1].strip().strip('\'"').replace('postgresql+asyncpg://', 'postgresql://')

conn = psycopg2.connect(db_url)
cur = conn.cursor()
cur.execute("SELECT name, code, education_level, grade_levels, departments, is_private FROM subjects WHERE education_level IN ('ss_2', 'senior_secondary', 'secondary') LIMIT 15")
rows = cur.fetchall()
print(f'FOUND SUBJECTS: {len(rows)}')
for r in rows:
    print(r)
