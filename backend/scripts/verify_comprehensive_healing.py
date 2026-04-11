
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

async def run_scenario(db, label, data):
    print(f"\n>>> SCENARIO: {label} ({data['email']})")
    print(f"    Target: Track={data['track']}, Grade={data['grade']}, Subjects={data['subjects']}")
    
    # 1. Setup Student
    res = await db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": data['email']})
    user_id = res.scalar()
    
    if not user_id:
        print(f"    [SKIP] User not found.")
        return

    await db.execute(
        text("UPDATE student_profiles SET curriculum_type = :track, grade_level = :grade, enrolled_subjects = :subjects WHERE user_id = :uid"),
        {"track": data['track'], "grade": data['grade'], "subjects": data['subjects'], "uid": user_id}
    )
    await db.commit()
    
    # 2. HEAL (Using the logic from students.py)
    res = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == user_id))
    profile = res.scalars().first()
    
    enrolled = profile.enrolled_subjects or []
    fixed_enrolled = []
    
    for subj_ident in enrolled:
        check_names = [subj_ident]
        if profile.curriculum_type:
            check_names.append(f"{profile.curriculum_type.upper()} {subj_ident}")
            check_names.append(f"{subj_ident} ({profile.curriculum_type.upper()})")

        track = (profile.curriculum_type or 'nigerian').upper()
        
        query = select(Subject).filter(Subject.name.in_(check_names), Subject.is_active == True)
        query = query.order_by(
            case((Subject.curriculum_type == track, 1), else_=0).desc(),
            Subject.created_at.desc()
        )
        
        if profile.grade_level:
            mapped_grade = map_grade_level(profile.grade_level)
            query = query.filter(or_(Subject.grade_levels.contains([mapped_grade]), Subject.grade_levels == []))

        res_s = await db.execute(query)
        mapped_subj = res_s.scalars().first()

        if mapped_subj:
            print(f"    [OK] '{subj_ident}' -> '{mapped_subj.name}' (Track: {mapped_subj.curriculum_type}, ID: {mapped_subj.id})")
            fixed_enrolled.append(str(mapped_subj.id))
        else:
            # Try Tier 2 (ilike)
            query_t2 = select(Subject).filter(Subject.name.ilike(f"%{subj_ident}%"), Subject.is_private == False)
            query_t2 = query_t2.order_by(case((Subject.curriculum_type == track, 1), else_=0).desc(), Subject.created_at.desc())
            if profile.grade_level:
                mapped_grade = map_grade_level(profile.grade_level)
                query_t2 = query_t2.filter(or_(Subject.grade_levels.contains([mapped_grade]), Subject.grade_levels == []))
            
            res_t2 = await db.execute(query_t2)
            mapped_subj = res_t2.scalars().first()
            
            if mapped_subj:
                print(f"    [OK] '{subj_ident}' -> '{mapped_subj.name}' (Fuzzy Match, Track: {mapped_subj.curriculum_type})")
                fixed_enrolled.append(str(mapped_subj.id))
            else:
                print(f"    [FAIL] '{subj_ident}'")
                fixed_enrolled.append(subj_ident)

    # Save
    profile.enrolled_subjects = list(set(fixed_enrolled))
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(profile, "enrolled_subjects")
    await db.commit()

async def verify_comprehensive():
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as db:
        scenarios = [
            {
                "email": "examstudent@example.com",
                "track": "jamb",
                "grade": None,
                "subjects": ["Mathematics", "English"]
            },
            {
                "email": "examstudent@example.com", # Reusing same user for test, but in real app would be separate
                "track": "waec",
                "grade": "SS3",
                "subjects": ["Biology", "Economics"]
            },
            {
                "email": "examstudent@example.com",
                "track": "neco",
                "grade": "SS3",
                "subjects": ["Physics", "Chemistry"]
            },
            {
                "email": "examstudent@example.com",
                "track": "nigerian",
                "grade": "P4",
                "subjects": ["Mathematics", "Basic Science"]
            }
        ]
        
        for s in scenarios:
            await run_scenario(db, s['track'].upper() + " Test", s)

if __name__ == "__main__":
    asyncio.run(verify_comprehensive())
