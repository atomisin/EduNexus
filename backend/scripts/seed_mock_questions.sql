-- Seed realistic WAEC/JAMB-style mock questions with LaTeX notation

-- Clear existing sample questions for re-seed
DELETE FROM mock_questions WHERE series_id IN (
    SELECT id FROM mock_exam_series WHERE title ILIKE '%Mathematics%'
);

-- Insert rich math questions with LaTeX
DO $$
DECLARE
    v_series_id UUID;
BEGIN
    SELECT id INTO v_series_id FROM mock_exam_series
    WHERE title ILIKE '%Mathematics%' LIMIT 1;

    IF v_series_id IS NULL THEN
        RAISE NOTICE 'No Mathematics series found. Skipping.';
        RETURN;
    END IF;

    -- Question 1: Quadratic Equation
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'Solve the equation $x^2 - 5x + 6 = 0$. Find the values of $x$.',
        '$x = 2$ or $x = 3$',
        '$x = -2$ or $x = -3$',
        '$x = 1$ or $x = 6$',
        '$x = -1$ or $x = -6$',
        'A', 'Algebra', NOW());

    -- Question 2: Square root / Surds
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'Simplify $\sqrt{48} + \sqrt{27} - \sqrt{12}$.',
        '$5\sqrt{3}$',
        '$7\sqrt{3}$',
        '$3\sqrt{3}$',
        '$4\sqrt{3}$',
        'A', 'Surds', NOW());

    -- Question 3: Fractions
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'Evaluate $\frac{3}{4} + \frac{5}{6} - \frac{1}{3}$.',
        '$\frac{5}{4}$',
        '$\frac{7}{6}$',
        '$\frac{15}{12}$',
        '$\frac{11}{12}$',
        'C', 'Fractions', NOW());

    -- Question 4: Logarithm
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'If $\log_2 x = 5$, find the value of $x$.',
        '$10$',
        '$25$',
        '$32$',
        '$64$',
        'C', 'Logarithms', NOW());

    -- Question 5: Trigonometry
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'In a right triangle, if $\sin\theta = \frac{3}{5}$, find $\cos\theta$.',
        '$\frac{4}{5}$',
        '$\frac{3}{4}$',
        '$\frac{5}{3}$',
        '$\frac{4}{3}$',
        'A', 'Trigonometry', NOW());

    -- Question 6: Simultaneous equations
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'Solve the simultaneous equations: $2x + 3y = 12$ and $x - y = 1$. Find $x + y$.',
        '$3$',
        '$5$',
        '$4$',
        '$6$',
        'B', 'Algebra', NOW());

    -- Question 7: Indices
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'Simplify $\frac{2^{3} \times 4^{2}}{8^{2}}$.',
        '$1$',
        '$2$',
        '$4$',
        '$\frac{1}{2}$',
        'B', 'Indices', NOW());

    -- Question 8: Set theory
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'In a class of 40 students, 25 offer Mathematics, 20 offer English, and 5 offer neither. How many offer both?',
        '$5$',
        '$10$',
        '$15$',
        '$20$',
        'B', 'Set Theory', NOW());

    -- Question 9: Statistics / Mean
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'The mean of five numbers is 12. If four of the numbers are 10, 14, 8, and 15, find the fifth number.',
        '$11$',
        '$12$',
        '$13$',
        '$14$',
        'C', 'Statistics', NOW());

    -- Question 10: Geometry / Circle
    INSERT INTO mock_questions (id, series_id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_tag, created_at)
    VALUES (gen_random_uuid(), v_series_id,
        'Find the area of a circle with radius $7$ cm. (Take $\pi = \frac{22}{7}$)',
        '$44 \text{ cm}^2$',
        '$154 \text{ cm}^2$',
        '$88 \text{ cm}^2$',
        '$308 \text{ cm}^2$',
        'B', 'Mensuration', NOW());

    RAISE NOTICE 'Inserted 10 high-fidelity math questions for series %', v_series_id;
END $$;
