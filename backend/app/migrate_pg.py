import os
import psycopg2
from sqlalchemy import create_engine, text

def migrate():
    # Use DATABASE_URL from environment
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found in environment!")
        return

    print(f"Connecting to database...")
    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            # Check and add course_name
            try:
                conn.execute(text("ALTER TABLE student_profiles ADD COLUMN course_name VARCHAR(255)"))
                print("Added course_name to student_profiles")
            except Exception as e:
                print(f"course_name migration info: {e}")
                
            # Check and add professional_curriculum
            try:
                conn.execute(text("ALTER TABLE student_profiles ADD COLUMN professional_curriculum JSONB"))
                print("Added professional_curriculum to student_profiles")
            except Exception as e:
                print(f"professional_curriculum migration info: {e}")
            
            conn.commit()
            print("Migration complete!")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
