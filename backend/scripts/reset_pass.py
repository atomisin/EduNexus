import os
import psycopg2
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
new_hash = pwd_context.hash('StudentPassword001')

db_url = os.getenv('DATABASE_URL').replace('postgresql+asyncpg://', 'postgresql://')
conn = psycopg2.connect(db_url)
try:
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET hashed_password = %s WHERE email = 'testss2@example.com'", (new_hash,))
        cur.execute("UPDATE users SET status = 'active' WHERE email = 'testss2@example.com'")
        conn.commit()
        print('Password for testss2@example.com is now: StudentPassword001')
        print('Status is now: active')
finally:
    conn.close()
