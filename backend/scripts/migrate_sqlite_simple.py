import sqlite3
import os

def migrate():
    db_path = "backend/edunexus.db"
    if not os.path.exists(db_path):
        db_path = "edunexus.db"
    
    if os.path.exists(db_path):
        print(f"Migrating {db_path}...")
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
        print("Migration complete!")
    else:
        print(f"Database {db_path} not found.")

if __name__ == "__main__":
    migrate()
