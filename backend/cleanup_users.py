import asyncio
from sqlalchemy import select, text
from app.db.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        # First gather all user IDs to delete
        result = await session.execute(text("SELECT id FROM users WHERE role != 'admin'"))
        user_ids = [row[0] for row in result.fetchall()]
        
        if not user_ids:
            print('No users to delete.')
            return
            
        print(f'Deleting {len(user_ids)} users...')
        try:
            # We must delete from all dependent tables first.
            tables_with_user_id = [
                ('teacher_profiles', 'user_id'),
                ('student_profiles', 'user_id'),
                ('student_subject_progress', 'student_id'),
                ('student_activity_logs', 'student_id'),
                ('subject_outlines', 'teacher_id'),
                ('teaching_sessions', 'teacher_id')
            ]
            
            for table, col in tables_with_user_id:
                try:
                    await session.execute(text(f'DELETE FROM {table} WHERE {col} = ANY(:ids)'), {'ids': user_ids})
                    print(f'Cleared {table}')
                except Exception as e:
                    print(f'Could not clear {table} (it may not have the column or exist):', e)
                    # We continue though because it might not exist
                
            await session.execute(text('DELETE FROM users WHERE id = ANY(:ids)'), {'ids': user_ids})
            print('Cleared users')
            await session.commit()
            print('Done!')
        except Exception as e:
            await session.rollback()
            print('Error:', e)

if __name__ == '__main__':
    asyncio.run(main())
