import sys, asyncio, traceback
from app.db.database import SessionLocal
from app.services.session_manager import SessionManager
from app.models.session import CreateSessionRequest, AIConfigModel
from app.models.user import User
from app.models.subject import Subject

async def test():
    db = SessionLocal()
    try:
        teacher = db.query(User).filter(User.role == 'teacher').first()
        subject = db.query(Subject).first()
        if not teacher or not subject:
            print(f"Teacher found: {bool(teacher)}, Subject found: {bool(subject)}")
            return
        manager = SessionManager(db)
        req = CreateSessionRequest(
            subject_id=str(subject.id),
            duration_minutes=60,
            ai_config=AIConfigModel()
        )
        await manager.create_session(str(teacher.id), req)
    except Exception as e:
        with open('error_trace.txt', 'w') as f:
            f.write(traceback.format_exc())
            print("Wrote error to error_trace.txt")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test())
