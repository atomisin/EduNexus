
import asyncio
import uuid
import os
import sys

# Ensure backend root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import select, or_, text, case
from app.db.database import engine

# Import ALL models correctly
import app.models.user
import app.models.student
import app.models.subject
import app.models.junction_tables
import app.models.session 
import app.models.message
import app.models.report
import app.models.notification

from app.models.student import StudentProfile
from app.models.subject import Subject
from app.api.v1.endpoints.students import map_grade_level
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession

async def verify_healing():
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as db:
        email = 'examstudent@example.com'
        print(f"\n--- SELF-HEALING PROOF FOR {email} (v5) ---")
        
        # 1. Setup - Re-fetch user_id
        res = await db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": email})
        user_id = res.scalar()
        
        # 2. Reset to String subjects
        test_subjects = ["Mathematics", "English"]
        print(f"STEP 1: Injecting string-based subjects: {test_subjects}")
        await db.execute(
            text("UPDATE student_profiles SET enrolled_subjects = :subjects WHERE user_id = :uid"),
            {"subjects": test_subjects, "uid": user_id}
        )
        await db.commit()
        
        # 3. Fetch Fresh Profile
        res = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == user_id))
        profile = res.scalars().first()
        print(f"STEP 2: Student track={profile.curriculum_type}, Grade={profile.grade_level}")

        # 4. RUN THE UPDATED LOGIC (Reflecting students.py changes)
        enrolled = profile.enrolled_subjects or []
        fixed_enrolled = []
        needs_update = False

        for subj_ident in enrolled:
            try:
                uuid.UUID(str(subj_ident))
                fixed_enrolled.append(subj_ident)
            except ValueError:
                needs_update = True
                print(f"  > Attempting to heal: '{subj_ident}'")
                
                check_names = [subj_ident]
                if profile.curriculum_type:
                    check_names.append(f"{profile.curriculum_type.upper()} {subj_ident}")
                    check_names.append(f"{subj_ident} ({profile.curriculum_type.upper()})")

                query = select(Subject).filter(
                    Subject.name.in_(check_names),
                    Subject.is_active == True
                )
                
                if profile.curriculum_type:
                    track = profile.curriculum_type.upper()
                    query = query.order_by(
                        case((Subject.curriculum_type == track, 1), else_=0).desc(),
                        Subject.created_at.desc()
                    )

                # Applying grade filter if exists
                if profile.grade_level:
                    mapped_grade = map_grade_level(profile.grade_level)
                    query = query.filter(or_(Subject.grade_levels.contains([mapped_grade]), Subject.grade_levels == []))

                res_s = await db.execute(query)
                mapped_subj = res_s.scalars().first()

                if mapped_subj:
                    print(f"    [MATCHED] '{subj_ident}' -> '{mapped_subj.name}' (ID: {mapped_subj.id}, Type: {mapped_subj.curriculum_type})")
                    fixed_enrolled.append(str(mapped_subj.id))
                else:
                    print(f"    [FAILED] '{subj_ident}'")
                    fixed_enrolled.append(subj_ident)

        if needs_update:
            from sqlalchemy.orm.attributes import flag_modified
            profile.enrolled_subjects = list(set(fixed_enrolled))
            flag_modified(profile, "enrolled_subjects")
            await db.commit()

        # 5. Final SQL Verification
        print("\nSTEP 3: Final state check in DB...")
        res_final = await db.execute(
            text("SELECT enrolled_subjects FROM student_profiles WHERE user_id = :uid"),
            {"uid": user_id}
        )
        row = res_final.fetchone()
        print(f"Final subjects in DB: {row[0]}")
        
        all_uuids = True
        has_jamb = False
        for s in row[0]:
            try:
                uuid.UUID(s)
                # Check if it matches a JAMB subject (curriculum_type = 'JAMB')
                r = await db.execute(text("SELECT curriculum_type FROM subjects WHERE id = :sid"), {"sid": s})
                ctype = r.scalar()
                if ctype == 'JAMB':
                    has_jamb = True
            except:
                all_uuids = False
        
        if all_uuids and has_jamb:
            print("\nVERIFICATION COMPLETE: SUCCESS (Matched dedicated exam curriculum)")
        else:
            print("\nVERIFICATION COMPLETE: FAILURE (Still matching generic curriculum)")

if __name__ == "__main__":
    asyncio.run(verify_healing())
