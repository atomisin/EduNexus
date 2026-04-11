
import uuid
from datetime import datetime, timezone
from sqlalchemy import text
from app.db.database import sync_engine

with sync_engine.begin() as conn:
    res = conn.execute(text("SELECT id FROM users WHERE role = 'TEACHER' LIMIT 1"))
    teacher_id = res.scalar()
    
    res = conn.execute(text("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1"))
    student_id = res.scalar()
    
    if teacher_id and student_id:
        res = conn.execute(text("SELECT id FROM teacher_students WHERE teacher_id = :t AND student_id = :s"), {"t": teacher_id, "s": student_id})
        exists = res.scalar()
        if not exists:
            conn.execute(text("INSERT INTO teacher_students (id, teacher_id, student_id, added_at) VALUES (:i, :t, :s, :a)"), 
                         {"i": str(uuid.uuid4()), "t": teacher_id, "s": student_id, "a": datetime.now(timezone.utc)})
            print("Linked successfully!")
        else:
            print("Already linked")
    else:
        print("Teacher or student missing")

