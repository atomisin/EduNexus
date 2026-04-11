
from app.db.database import engine
from sqlalchemy import inspect
from app.models.session import TeachingSession
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, Float

def compare_and_generate_sql():
    inspector = inspect(engine)
    db_cols = {c['name']: c for c in inspector.get_columns('teaching_sessions')}
    
    # Get model columns
    model_cols = TeachingSession.__table__.columns
    
    missing_sql = []
    for col in model_cols:
        if col.name not in db_cols:
            # Determine type for SQL
            col_type = str(col.type)
            if "JSONB" in col_type:
                sql_type = "JSONB"
            elif "UUID" in col_type:
                sql_type = "UUID"
            elif "VARCHAR" in col_type or "String" in col_type:
                sql_type = "VARCHAR(255)"
            elif "BOOLEAN" in col_type or "Boolean" in col_type:
                sql_type = "BOOLEAN"
            elif "TEXT" in col_type or "Text" in col_type:
                sql_type = "TEXT"
            elif "INTEGER" in col_type or "Integer" in col_type:
                sql_type = "INTEGER"
            elif "DATETIME" in col_type or "DateTime" in col_type:
                sql_type = "TIMESTAMP"
            else:
                sql_type = col_type
                
            default_clause = ""
            if col.default is not None:
                if hasattr(col.default, 'arg') and not callable(col.default.arg):
                    if isinstance(col.default.arg, bool):
                        default_clause = f" DEFAULT {'TRUE' if col.default.arg else 'FALSE'}"
                    elif isinstance(col.default.arg, (dict, list)):
                        default_clause = " DEFAULT '{}'::jsonb" if isinstance(col.default.arg, dict) else " DEFAULT '[]'::jsonb"
                    else:
                        default_clause = f" DEFAULT {col.default.arg}"
            
            missing_sql.append(f"ALTER TABLE teaching_sessions ADD COLUMN {col.name} {sql_type}{default_clause};")
            
    if missing_sql:
        with open('fix_columns.sql', 'w') as f:
            f.write("\n".join(missing_sql))
        print(f"Wrote {len(missing_sql)} missing columns to fix_columns.sql")
    else:
        print("No missing columns found")

if __name__ == "__main__":
    compare_and_generate_sql()
