import asyncio
import os
import sys
from sqlalchemy import text
import uuid

# Add the parent directory to the path so we can import the app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import SessionLocal

async def consolidate_subjects():
    async with SessionLocal() as session:
        # Define the bad to good mapping
        mapping = {
            "SEC-MAT-001": "ss2-mathematics",
            "SEC-ENG-001": "ss2-english-language",
            "SEC-BIO-001": "ss2-biology",
            "SEC-ECO-001": "ss2-economics",
        }
        
        for bad_code, good_code in mapping.items():
            print(f"\n--- Consolidating {bad_code} -> {good_code} ---")
            
            # Get IDs
            res_bad = await session.execute(text("SELECT id FROM subjects WHERE code = :code"), {"code": bad_code})
            bad_id = res_bad.scalar()
            
            res_good = await session.execute(text("SELECT id FROM subjects WHERE code = :code"), {"code": good_code})
            good_id = res_good.scalar()
            
            if not bad_id:
                print(f"Bad subject {bad_code} not found, skipping.")
                continue
            
            if not good_id:
                print(f"Good subject {good_code} not found, renaming {bad_code} to {good_code} instead of merging.")
                await session.execute(
                    text("UPDATE subjects SET code = :good WHERE id = :bad"),
                    {"good": good_code, "bad": bad_id}
                )
                continue
            
            # 1. Move students in junction table
            print(f"Moving students from {bad_id} to {good_id}...")
            await session.execute(text("""
                INSERT INTO student_subject (student_id, subject_id)
                SELECT student_id, :good_id FROM student_subject WHERE subject_id = :bad_id
                ON CONFLICT (student_id, subject_id) DO NOTHING
            """), {"good_id": good_id, "bad_id": bad_id})
            
            # 2. Move teachers in junction table
            print(f"Moving teachers from {bad_id} to {good_id}...")
            await session.execute(text("""
                INSERT INTO teacher_subject (teacher_id, subject_id)
                SELECT teacher_id, :good_id FROM teacher_subject WHERE subject_id = :bad_id
                ON CONFLICT (teacher_id, subject_id) DO NOTHING
            """), {"good_id": good_id, "bad_id": bad_id})

            # 3. Update StudentTopicProgress (denormalized subject_id)
            print("Updating StudentTopicProgress subject_id references...")
            await session.execute(text("""
                UPDATE student_topic_progress SET subject_id = :good_id WHERE subject_id = :bad_id
            """), {"good_id": good_id, "bad_id": bad_id})

            # 4. Update StudentProfile.enrolled_subjects (ARRAY of Strings)
            print("Updating StudentProfile enrolled_subjects arrays...")
            await session.execute(text("""
                UPDATE student_profiles 
                SET enrolled_subjects = ARRAY_REPLACE(enrolled_subjects, :bad_id, :good_id)
                WHERE :bad_id = ANY(enrolled_subjects)
            """), {"bad_id": str(bad_id), "good_id": str(good_id)})
            
            # 3. Handle Materials
            print("Moving materials...")
            await session.execute(text("""
                UPDATE materials SET subject_id = :good_id WHERE subject_id = :bad_id
            """), {"good_id": good_id, "bad_id": bad_id})
            
            # 4. Handle Mock Exam Series
            print("Updating Mock Exam Series references...")
            await session.execute(text("""
                UPDATE mock_exam_series SET subject_id = :good_id WHERE subject_id = :bad_id
            """), {"good_id": good_id, "bad_id": bad_id})

            # 5. Delete the bad subject
            print(f"Deleting duplicate subject {bad_code}...")
            # First clean up junction table to be safe (though cascade should handle if set)
            await session.execute(text("DELETE FROM student_subject WHERE subject_id = :bad_id"), {"bad_id": bad_id})
            await session.execute(text("DELETE FROM subjects WHERE id = :bad_id"), {"bad_id": bad_id})

        await session.commit()
        print("\nSubject consolidation complete.")

if __name__ == "__main__":
    asyncio.run(consolidate_subjects())
