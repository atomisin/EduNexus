ALTER TABLE student_profiles ALTER COLUMN enrolled_subjects TYPE VARCHAR[] USING enrolled_subjects::VARCHAR[];
