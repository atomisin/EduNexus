import asyncio
import uuid
from sqlalchemy import select, any_
from app.db.database import AsyncSessionLocal
from app.models.user import User
from app.models.student import StudentProfile
from app.models.subject import Subject

def map_grade_level(grade: str) -> str:
    if not grade: return grade
    g = grade.lower()
    if g.startswith("primary_"): return f"P{g.split('_')[1]}"
    if g.startswith("jss_"): return f"JSS{g.split('_')[1]}"
    if g.startswith("ss_"): return f"SS{g.split('_')[1]}"
    if g == "kindergarten": return "KG"
    if g == "nursery_1": return "N1"
    if g == "nursery_2": return "N2"
    if g == "creche": return "CRECHE"
    return grade.upper()

async def test_healing():
    email = "ss1student@example.com"
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).filter(User.email == email))
        user = res.scalars().first()
        if not user:
            print(f"User {email} not found")
            return

        res_prof = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == user.id))
        profile = res_prof.scalars().first()
        if not profile:
            print(f"Profile for {email} not found")
            return

        print(f"Profile: grade_level={profile.grade_level}, dept={profile.department}")
        print(f"Current enrolled_subjects: {profile.enrolled_subjects}")

        enrolled = profile.enrolled_subjects or []
        fixed_enrolled = []
        needs_update = False

        for subj_ident in enrolled:
            try:
                uuid.UUID(str(subj_ident))
                fixed_enrolled.append(subj_ident)
            except ValueError:
                needs_update = True
                print(f"Attempting to heal: {subj_ident}")
                
                # Try strict match
                query = select(Subject).filter(Subject.name == subj_ident, Subject.is_active == True)
                if profile.grade_level:
                    mapped_grade = map_grade_level(profile.grade_level)
                    query = query.filter(mapped_grade == any_(Subject.grade_levels))
                if profile.department:
                    query = query.filter(profile.department == any_(Subject.departments))
                
                res = await db.execute(query)
                mapped_subj = res.scalars().first()
                if mapped_subj:
                    print(f"  Healed to UUID: {mapped_subj.id}")
                    fixed_enrolled.append(str(mapped_subj.id))
                else:
                    print(f"  Strict match failed for {subj_ident}")
                    # Fallback
                    res_fallback = await db.execute(select(Subject).filter(Subject.name == subj_ident, Subject.is_active == True).limit(1))
                    mapped_fallback = res_fallback.scalars().first()
                    if mapped_fallback:
                        print(f"  Healed with fallback to UUID: {mapped_fallback.id}")
                        fixed_enrolled.append(str(mapped_fallback.id))
                    else:
                        print(f"  ALL MATCHES FAILED for {subj_ident}")
                        fixed_enrolled.append(subj_ident)

        if needs_update:
            print(f"Newly healed list: {fixed_enrolled}")
            profile.enrolled_subjects = list(set(fixed_enrolled))
            await db.commit()
            print("Successfully committed changes.")
        else:
            print("No update needed.")

if __name__ == "__main__":
    asyncio.run(test_healing())
