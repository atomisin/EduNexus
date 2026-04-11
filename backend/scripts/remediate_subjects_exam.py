import asyncio
from sqlalchemy import text
from app.db.database import AsyncSessionLocal

async def remediate():
    async with AsyncSessionLocal() as db:
        print("🚀 Starting educational subject remediation (Raw SQL Fixed)...")
        
        # 1. Base subjects (All departments)
        await db.execute(text("UPDATE subjects SET departments = ARRAY['Science', 'Art', 'Commercial'] WHERE name ILIKE '%Mathematics%' OR name ILIKE '%English%' OR name ILIKE '%Civic%';"))
        print("✅ Updated base subjects")

        # 2. Science
        await db.execute(text("UPDATE subjects SET departments = ARRAY['Science'] WHERE name ILIKE '%Physics%' OR name ILIKE '%Chemistry%' OR name ILIKE '%Biology%' OR name ILIKE '%Further%' OR name ILIKE '%Agric%' OR name ILIKE '%Geography%';"))
        print("✅ Updated science subjects")

        # 3. Art
        await db.execute(text("UPDATE subjects SET departments = ARRAY['Art'] WHERE name ILIKE '%Literature%' OR name ILIKE '%Government%' OR name ILIKE '%History%' OR name ILIKE '%Religious%' OR name ILIKE '%Fine Art%' OR name ILIKE '%French%';"))
        print("✅ Updated art subjects")

        # 4. Commercial
        await db.execute(text("UPDATE subjects SET departments = ARRAY['Commercial'] WHERE name ILIKE '%Economics%' OR name ILIKE '%Commerce%' OR name ILIKE '%Accounting%' OR name ILIKE '%Office%' OR name ILIKE '%Insurance%' OR name ILIKE '%Salesmanship%';"))
        print("✅ Updated commercial subjects")

        # 5. Exam Level labeling
        await db.execute(text("UPDATE subjects SET education_level = 'exam' WHERE name ILIKE '%WAEC%' OR name ILIKE '%JAMB%' OR name ILIKE '%NECO%' OR curriculum_type IN ('WAEC', 'JAMB', 'NECO');"))
        print("✅ Labeled exam subjects")

        await db.commit()
        print("✨ Remediation complete!")

if __name__ == "__main__":
    asyncio.run(remediate())
