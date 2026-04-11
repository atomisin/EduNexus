
import asyncio
from sqlalchemy import text
from app.db.database import engine

async def setup_test():
    async with engine.connect() as conn:
        email = 'examstudent@example.com'
        print(f"Targeting student: {email}")
        
        # 1. Reset to strings
        subjects = ["Mathematics", "English"]
        await conn.execute(
            text("UPDATE student_profiles SET enrolled_subjects = :subj FROM users WHERE users.id = student_profiles.user_id AND users.email = :email"),
            {"subj": subjects, "email": email}
        )
        await conn.commit()
        
        # 2. Verify
        res = await conn.execute(
            text("SELECT enrolled_subjects FROM student_profiles JOIN users ON users.id = student_profiles.user_id WHERE users.email = :email"),
            {"email": email}
        )
        row = res.fetchone()
        print(f"Current subjects in DB: {row[0]}")
        
if __name__ == "__main__":
    asyncio.run(setup_test())
