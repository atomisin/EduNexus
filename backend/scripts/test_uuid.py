import uuid
from sqlalchemy import select, create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.subject import Subject

# Create sync session
sync_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("postgres://", "postgresql://")
engine = create_engine(sync_url)
Session = sessionmaker(bind=engine)

def test_uuids():
    db = Session()
    try:
        s = db.execute(select(Subject)).scalars().first()
        if s:
            print(f"Subject ID: {s.id}")
            print(f"Subject ID type: {type(s.id)}")
            u = uuid.uuid4()
            print(f"Generated UUID: {u}")
            print(f"Generated UUID type: {type(u)}")
        else:
            print("No subjects found.")
    finally:
        db.close()

if __name__ == "__main__":
    test_uuids()
