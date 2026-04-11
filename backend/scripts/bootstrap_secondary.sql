
-- Bootstrap Secondary Curriculum and Student Profile
-- For user: examstudent@edunexus.com

DO $$
DECLARE
    v_user_id UUID;
    v_student_profile_id UUID;
    v_math_subject_id UUID;
    v_english_subject_id UUID;
    v_biology_subject_id UUID;
    v_economics_subject_id UUID;
BEGIN
    -- 1. Get User ID
    SELECT id INTO v_user_id FROM users WHERE email = 'examstudent@edunexus.com';
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User examstudent@edunexus.com not found';
    END IF;

    -- 2. Create/Update Subjects (Secondary Level)
    -- Mathematics
    SELECT id INTO v_math_subject_id FROM subjects WHERE name = 'Mathematics' AND education_level = 'senior_secondary';
    IF v_math_subject_id IS NULL THEN
        v_math_subject_id := gen_random_uuid();
        INSERT INTO subjects (id, name, code, education_level, grade_levels, curriculum_type, departments, is_active, created_at, updated_at)
        VALUES (v_math_subject_id, 'Mathematics', 'ss2-mathematics', 'senior_secondary', '{SS1, SS2, SS3, JAMB, WAEC}', 'NATIONAL', '{Science, Commercial, Art}', true, NOW(), NOW());
    END IF;

    -- English
    SELECT id INTO v_english_subject_id FROM subjects WHERE name = 'English Language' AND education_level = 'senior_secondary';
    IF v_english_subject_id IS NULL THEN
        v_english_subject_id := gen_random_uuid();
        INSERT INTO subjects (id, name, code, education_level, grade_levels, curriculum_type, departments, is_active, created_at, updated_at)
        VALUES (v_english_subject_id, 'English Language', 'ss2-english-language', 'senior_secondary', '{SS1, SS2, SS3, JAMB, WAEC}', 'NATIONAL', '{Science, Commercial, Art}', true, NOW(), NOW());
    END IF;

    -- Biology
    SELECT id INTO v_biology_subject_id FROM subjects WHERE name = 'Biology' AND education_level = 'senior_secondary';
    IF v_biology_subject_id IS NULL THEN
        v_biology_subject_id := gen_random_uuid();
        INSERT INTO subjects (id, name, code, education_level, grade_levels, curriculum_type, departments, is_active, created_at, updated_at)
        VALUES (v_biology_subject_id, 'Biology', 'ss2-biology', 'senior_secondary', '{SS1, SS2, SS3, JAMB, WAEC}', 'NATIONAL', '{Science}', true, NOW(), NOW());
    END IF;

    -- Economics
    SELECT id INTO v_economics_subject_id FROM subjects WHERE name = 'Economics' AND education_level = 'senior_secondary';
    IF v_economics_subject_id IS NULL THEN
        v_economics_subject_id := gen_random_uuid();
        INSERT INTO subjects (id, name, code, education_level, grade_levels, curriculum_type, departments, is_active, created_at, updated_at)
        VALUES (v_economics_subject_id, 'Economics', 'ss2-economics', 'senior_secondary', '{SS1, SS2, SS3, JAMB, WAEC}', 'NATIONAL', '{Commercial, Art}', true, NOW(), NOW());
    END IF;

    -- 3. Update Student Profile
    SELECT id INTO v_student_profile_id FROM student_profiles WHERE user_id = v_user_id;
    IF v_student_profile_id IS NULL THEN
        v_student_profile_id := gen_random_uuid();
        INSERT INTO student_profiles (id, user_id, registration_number, grade_level, education_level, department, enrolled_subjects, jamb_subjects, exam_targets, created_at, updated_at)
        VALUES (v_student_profile_id, v_user_id, 'EXM/2026/001', 'SS3', 'senior_secondary', 'Science', 
                ARRAY[v_math_subject_id, v_english_subject_id, v_biology_subject_id, v_economics_subject_id],
                ARRAY['Mathematics', 'English Language', 'Biology', 'Economics'],
                ARRAY['JAMB', 'WAEC'],
                NOW(), NOW());
    ELSE
        UPDATE student_profiles SET 
            grade_level = 'SS3',
            education_level = 'senior_secondary',
            department = 'Science',
            enrolled_subjects = ARRAY[v_math_subject_id, v_english_subject_id, v_biology_subject_id, v_economics_subject_id],
            jamb_subjects = ARRAY['Mathematics', 'English Language', 'Biology', 'Economics'],
            exam_targets = ARRAY['JAMB', 'WAEC'],
            updated_at = NOW()
        WHERE id = v_student_profile_id;
    END IF;

    -- 4. Re-map existing Mock Exam Series to the new Secondary Math subject
    UPDATE mock_exam_series SET 
        subject_id = v_math_subject_id,
        exam_type = 'WAEC'
    WHERE title = 'WAEC Mathematics Core 2024';

END $$;
