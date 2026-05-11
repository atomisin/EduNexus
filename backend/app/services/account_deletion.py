from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def delete_user_account(db: AsyncSession, user: User) -> None:
    """Delete a user and known dependent records in FK-safe order."""
    user_id = user.id

    existing_tables = set(
        (
            await db.execute(
                text(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    """
                )
            )
        )
        .scalars()
        .all()
    )

    statements = [
        # Child records hanging off assessment results must go before results.
        ({"proctoring_events", "assessment_results", "assessments"}, """
        DELETE FROM proctoring_events
        WHERE assessment_result_id IN (
            SELECT ar.id
            FROM assessment_results ar
            LEFT JOIN assessments a ON a.id = ar.assessment_id
            WHERE ar.student_id = :user_id OR a.teacher_id = :user_id
        )
        """),
        ({"assessment_results", "assessments"}, """
        DELETE FROM assessment_results
        WHERE student_id = :user_id
           OR assessment_id IN (SELECT id FROM assessments WHERE teacher_id = :user_id)
        """),
        ({"assessments"}, "DELETE FROM assessments WHERE teacher_id = :user_id"),
        ({"mock_attempts", "student_profiles"}, """
        DELETE FROM mock_attempts
        WHERE student_id IN (SELECT id FROM student_profiles WHERE user_id = :user_id)
        """),
        ({"learning_style_assessments", "student_profiles"}, """
        DELETE FROM learning_style_assessments
        WHERE student_id IN (SELECT id FROM student_profiles WHERE user_id = :user_id)
        """),
        ({"messages"}, "DELETE FROM messages WHERE sender_id = :user_id OR recipient_id = :user_id"),
        ({"notifications"}, "DELETE FROM notifications WHERE user_id = :user_id"),
        ({"student_reports"}, "DELETE FROM student_reports WHERE student_id = :user_id OR teacher_id = :user_id"),
        ({"monthly_reports"}, "DELETE FROM monthly_reports WHERE student_id = :user_id"),
        ({"session_students", "teaching_sessions"}, """
        DELETE FROM session_students
        WHERE student_id = :user_id
           OR session_id IN (SELECT id FROM teaching_sessions WHERE teacher_id = :user_id)
        """),
        ({"teaching_sessions"}, """
        UPDATE teaching_sessions
        SET previous_session_id = NULL
        WHERE previous_session_id IN (SELECT id FROM teaching_sessions WHERE teacher_id = :user_id)
        """),
        ({"teaching_sessions"}, """
        UPDATE teaching_sessions
        SET next_session_id = NULL
        WHERE next_session_id IN (SELECT id FROM teaching_sessions WHERE teacher_id = :user_id)
        """),
        ({"teaching_sessions"}, "DELETE FROM teaching_sessions WHERE teacher_id = :user_id"),
        ({"student_activity_log"}, "DELETE FROM student_activity_log WHERE student_id = :user_id"),
        ({"student_topic_progress"}, "DELETE FROM student_topic_progress WHERE student_id = :user_id"),
        ({"student_subject_progress"}, "DELETE FROM student_subject_progress WHERE student_id = :user_id"),
        ({"student_subject"}, "DELETE FROM student_subject WHERE student_id = :user_id"),
        ({"teacher_subject"}, "DELETE FROM teacher_subject WHERE teacher_id = :user_id"),
        ({"teacher_students"}, "DELETE FROM teacher_students WHERE teacher_id = :user_id OR student_id = :user_id"),
        ({"parent_students"}, "DELETE FROM parent_students WHERE parent_id = :user_id OR student_id = :user_id"),
        ({"student_topic_requests"}, """
        DELETE FROM student_topic_requests
        WHERE student_id = :user_id OR assigned_teacher_id = :user_id
        """),
        ({"materials"}, "DELETE FROM materials WHERE uploader_id = :user_id"),
        ({"subjects"}, "UPDATE subjects SET created_by = NULL WHERE created_by = :user_id"),
        ({"users"}, "UPDATE users SET authorized_by = NULL WHERE authorized_by = :user_id"),
        ({"token_usage"}, "UPDATE token_usage SET user_id = NULL WHERE user_id = :user_id"),
        ({"parent_profiles"}, "DELETE FROM parent_profiles WHERE user_id = :user_id"),
        ({"teacher_profiles"}, "DELETE FROM teacher_profiles WHERE user_id = :user_id"),
        ({"student_profiles"}, "DELETE FROM student_profiles WHERE user_id = :user_id"),
        ({"users"}, "DELETE FROM users WHERE id = :user_id"),
    ]

    for required_tables, statement in statements:
        if not required_tables.issubset(existing_tables):
            continue
        await db.execute(text(statement), {"user_id": user_id})
