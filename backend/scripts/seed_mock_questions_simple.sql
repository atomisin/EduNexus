
-- Simple Seed for WAEC Mathematics Core 2024
-- Series ID: dbc28da8-2536-4347-a895-3d82dd9a4dd9

INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, created_at)
VALUES (gen_random_uuid(), 'dbc28da8-2536-4347-a895-3d82dd9a4dd9', 'Solve for x: 2x + 5 = 15', '5', '10', '15', '20', 'A', '2x = 10 => x = 5', NOW());
