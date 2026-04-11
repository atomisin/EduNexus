import asyncio
from sqlalchemy import text
from app.db.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        # 1. Update all existing 'professional' subjects to be private
        # Also ensure they have a code that doesn't conflict easily
        q = text("""
            UPDATE subjects 
            SET is_private = True 
            WHERE lower(education_level) = 'professional' 
            AND is_private = False
        """)
        result = await session.execute(q)
        print(f"Updated {result.rowcount} professional subjects to private.")

        # 2. Check for subjects with missing created_by (orphans from cleanup)
        q2 = text("""
            SELECT id, name FROM subjects WHERE created_by IS NULL AND lower(education_level) = 'professional'
        """)
        orphans = await session.execute(q2)
        for row in orphans.fetchall():
            print(f"WARNING: Orphaned professional subject found: {row.name} ({row.id})")
            # We keep them private at least (step 1 handled it)

        await session.commit()
        print("Remediation complete.")

if __name__ == "__main__":
    asyncio.run(main())
