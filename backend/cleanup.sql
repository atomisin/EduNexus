-- Cleanup all non-admin users and their data
BEGIN;

-- 1. Identify non-admin user IDs
CREATE TEMP TABLE target_users AS 
SELECT id FROM users WHERE role != 'admin';

-- 2. Clear known dependent tables
DELETE FROM student_subject_progress WHERE student_id IN (SELECT id FROM target_users);
DELETE FROM student_activity_logs WHERE student_id IN (SELECT id FROM target_users);
DELETE FROM student_profiles WHERE user_id IN (SELECT id FROM target_users);
DELETE FROM teacher_profiles WHERE user_id IN (SELECT id FROM target_users);
DELETE FROM subject_outlines WHERE teacher_id IN (SELECT id FROM target_users);
DELETE FROM teaching_sessions WHERE teacher_id IN (SELECT id FROM target_users);
DELETE FROM assessment_results WHERE student_id IN (SELECT id FROM target_users);
DELETE FROM user_notifications WHERE user_id IN (SELECT id FROM target_users);
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM target_users);
DELETE FROM token_usage_logs WHERE user_id IN (SELECT id FROM target_users);
DELETE FROM session_students WHERE student_id IN (SELECT id FROM target_users);

-- Handle other possible tables found by FK discovery
DELETE FROM topic_mastery_tests WHERE student_id IN (SELECT id FROM target_users);
DELETE FROM subject_enrollments WHERE student_id IN (SELECT id FROM target_users);

-- 3. Reset self-references in users table
UPDATE users SET authorized_by = NULL WHERE authorized_by IN (SELECT id FROM target_users);
UPDATE users SET authorized_by = NULL WHERE id IN (SELECT id FROM target_users);

-- 4. Final delete from users
DELETE FROM users WHERE id IN (SELECT id FROM target_users);

COMMIT;
