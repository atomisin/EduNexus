endpoint_code = '''
@router.post("/cleanup-garbage")
async def cleanup_garbage(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # 1. Topics
    garbage_topics = ["CLASS", "SUBJECT", "TERM", "TOPICS"]
    await db.execute(text("DELETE FROM lessons WHERE topic_id IN (SELECT id FROM topics WHERE name = ANY(:topics))"), {"topics": garbage_topics})
    await db.execute(text("DELETE FROM topics WHERE name = ANY(:topics)"), {"topics": garbage_topics})
    
    # 2. Subjects
    placeholder_codes = ['MAT-SS_', 'ENG-SS_', 'PHY-SS_']
    res = await db.execute(text("SELECT id FROM subjects WHERE code = ANY(:codes)"), {"codes": placeholder_codes})
    subj_ids = [str(r[0]) for r in res.fetchall()]
    
    if subj_ids:
        await db.execute(text("DELETE FROM student_subject WHERE subject_id = ANY(:ids)"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM teacher_subject WHERE subject_id = ANY(:ids)"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM lessons WHERE topic_id IN (SELECT id FROM topics WHERE subject_id = ANY(:ids))"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM topics WHERE subject_id = ANY(:ids)"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM mock_exam_series WHERE subject_id = ANY(:ids)"), {"ids": subj_ids})
        await db.execute(text("DELETE FROM subjects WHERE id = ANY(:ids)"), {"ids": subj_ids})
        
    await db.commit()
    return {"status": "Cleaned up", "deleted_subject_ids": subj_ids}
'''
with open(r'c:\Users\Tommie-YV\edunexus\backend\app\api\v1\endpoints\subjects.py', 'a') as f:
    f.write(endpoint_code)
