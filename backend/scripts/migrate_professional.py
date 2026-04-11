import sqlite3
import os
import uuid
from sqlalchemy import create_url

def migrate():
    # Detect if we are using SQLite or PostgreSQL from env
    db_url = os.getenv("DATABASE_URL", "sqlite:///./edunexus.db")
    
    if db_url.startswith("sqlite"):
        db_path = "./edunexus.db"
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Add course_name
            try:
                cursor.execute("ALTER TABLE student_profiles ADD COLUMN course_name VARCHAR(255)")
                print("Added course_name to student_profiles")
            except sqlite3.OperationalError:
                print("course_name already exists")
                
            # Add professional_curriculum
            try:
                cursor.execute("ALTER TABLE student_profiles ADD COLUMN professional_curriculum JSON")
                print("Added professional_curriculum to student_profiles")
            except sqlite3.OperationalError:
                print("professional_curriculum already exists")
            
            conn.commit()
            conn.close()
    else:
        # PostgreSQL migration (likely using psycopg2 or similar)
        import psycopg2
        try:
            conn = psycopg2.connect(db_url)
            cursor = conn.cursor()
            
            # Add course_name
            try:
                cursor.execute("ALTER TABLE student_profiles ADD COLUMN course_name VARCHAR(255)")
                print("Added course_name to student_profiles")
            except Exception as e:
                print(f"course_name migration info: {e}")
                
            # Add professional_curriculum
            try:
                cursor.execute("ALTER TABLE student_profiles ADD COLUMN professional_curriculum JSONB")
                print("Added professional_curriculum to student_profiles")
            except Exception as e:
                print(f"professional_curriculum migration info: {e}")
                
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"PostgreSQL migration failed: {e}")

if __name__ == "__main__":
    migrate()
