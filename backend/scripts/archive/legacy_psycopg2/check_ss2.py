import os, psycopg2
db_url = os.getenv('DATABASE_URL').replace('postgresql+asyncpg://', 'postgresql://')
conn = psycopg2.connect(db_url)
try:
    with conn.cursor() as cur:
        cur.execute("SELECT code, name FROM subjects WHERE code LIKE '%ss2%';")
        rows = cur.fetchall()
        print(f"Found {len(rows)} SS2 subjects.")
        if rows:
            for r in rows[:5]:
                print(f"{r[0]} | {r[1]}")
finally:
    conn.close()
