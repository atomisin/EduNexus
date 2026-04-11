ALTER TABLE teaching_sessions ADD COLUMN session_outline JSONB;
ALTER TABLE teaching_sessions ADD COLUMN class_notes JSONB;
ALTER TABLE teaching_sessions ADD COLUMN notes_shared_with_students BOOLEAN DEFAULT FALSE;