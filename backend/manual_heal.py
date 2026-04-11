import asyncio
import uuid
from sqlalchemy import select, any_
from sqlalchemy.orm.attributes import flag_modified
from app.db.database import AsyncSessionLocal
from app.models.student import StudentProfile
from app.models.subject import Subject

def map_grade_level(grade: str) -> str:
    if not grade: return grade
    g = grade.lower()
    if g.startswith('primary_'): return f'P{g.split("_")[1]}'
    if g.startswith('jss_'): return f'JSS{g.split("_")[1]}'
    if g.startswith('ss_'): return f'SS{g.split("_")[1]}'
    if g == 'kindergarten': return 'KG'
    return grade.upper()

async def manual_heal(user_id_str):
    uid = uuid.UUID(user_id_str)
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == uid))
        profile = res.scalars().first()
        if not profile:
            print('Profile not found')
            return
        
        print(f'Initial enrolled: {profile.enrolled_subjects}')
        enrolled = profile.enrolled_subjects or []
        fixed_enrolled = []
        needs_update = False
        
        for subj_ident in enrolled:
            try:
                uuid.UUID(str(subj_ident))
                fixed_enrolled.append(subj_ident)
            except ValueError:
                needs_update = True
                print(f'Healing: {subj_ident}')
                
                # Tier 1: Exact matches (Grade + Dept)
                q1 = select(Subject).filter(Subject.name == subj_ident, Subject.is_active == True)
                if profile.grade_level:
                    mapped_grade = map_grade_level(profile.grade_level)
                    q1 = q1.filter(mapped_grade == any_(Subject.grade_levels))
                if profile.department:
                    q1 = q1.filter(profile.department == any_(Subject.departments))
                
                r1 = await db.execute(q1)
                s1 = r1.scalars().first()
                
                if not s1 and profile.grade_level:
                    # Tier 2: Match by Grade (Ignore Dept)
                    mapped_grade = map_grade_level(profile.grade_level)
                    q2 = select(Subject).filter(
                        Subject.name == subj_ident, 
                        Subject.is_active == True,
                        mapped_grade == any_(Subject.grade_levels)
                    )
                    r2 = await db.execute(q2)
                    s1 = r2.scalars().first()
                
                if s1:
                    print(f'  Match found: {s1.id}')
                    fixed_enrolled.append(str(s1.id))
                else:
                    # Tier 3: Loose match by name
                    q3 = select(Subject).filter(Subject.name == subj_ident, Subject.is_active == True).limit(1)
                    r3 = await db.execute(q3)
                    s3 = r3.scalars().first()
                    if s3:
                        print(f'  Fallback match: {s3.id}')
                        fixed_enrolled.append(str(s3.id))
                    else:
                        print(f'  FAILED for {subj_ident}')
                        fixed_enrolled.append(subj_ident)
        
        if needs_update:
            profile.enrolled_subjects = list(set(fixed_enrolled))
            flag_modified(profile, 'enrolled_subjects')
            await db.commit()
            print('Successfully committed healed subjects.')
        else:
            print('No healing required.')

if __name__ == "__main__":
    asyncio.run(manual_heal('7e95a167-9b62-4590-8b37-9d47cd8dc696'))
