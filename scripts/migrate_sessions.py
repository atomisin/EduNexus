
import sys
import os
from sqlalchemy import text

# Add the current directory and backend directory to sys.path
if os.path.exists("backend"):
    sys.path.append(os.path.join(os.getcwd(), "backend"))
else:
    sys.path.append(os.getcwd())

from app.db.database import engine

def migrate():
    columns_to_add = [
        ("pre_session_quiz", "JSONB"),
        ("post_session_quiz", "JSONB"),
        ("quiz_results", "JSONB DEFAULT '{}'"),
        ("take_home_assignment", "JSONB"),
    ]
    
    with engine.connect() as conn:
        for col_name, col_type in columns_to_add:
            try:
                print(f"Adding column {col_name}...")
                conn.execute(text(f"ALTER TABLE teaching_sessions ADD COLUMN {col_name} {col_type}"))
                conn.commit()
                print(f"Successfully added {col_name}")
            except Exception as e:
                print(f"Could not add {col_name}: {e}")
                conn.rollback()

if __name__ == "__main__":
    migrate()
    print("Migration complete")
