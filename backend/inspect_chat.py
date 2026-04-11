import os
from app.db.database import SessionLocal
from app.models.user import User

def check_chat_history():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            print(f"User: {user.email}, Role: {user.role}")
            print(f"Chat History: {user.ai_chat_history}")
            print("-" * 20)
    finally:
        db.close()

if __name__ == "__main__":
    check_chat_history()
