import asyncio
from sqlalchemy import select, delete
from app.db.database import AsyncSessionLocal
from app.models.user import User

async def main():
    async with AsyncSessionLocal() as session:
        # Find all users
        result = await session.execute(select(User))
        users = result.scalars().unique().all()
        
        print(f"Found {len(users)} users.")
        
        admin_users = [u for u in users if u.role == 'admin']
        if not admin_users:
            print("No admin users found! Aborting.")
            return
            
        print(f"Found {len(admin_users)} admin users:")
        for admin in admin_users:
            print(f"- {admin.email}")
            
        # Delete non-admin users
        non_admins = [u for u in users if u.role != 'admin']
        for u in non_admins:
            await session.delete(u)
            
        await session.commit()
        print(f"Deleted {len(non_admins)} non-admin users.")

if __name__ == "__main__":
    asyncio.run(main())
