"""migrate_to_timezone_aware_datetimes_and_add_brain_power

Revision ID: 635e45906a6d
Revises: 7bad720dd312
Create Date: 2026-03-20 16:07:50.962255

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '635e45906a6d'
down_revision: Union[str, Sequence[str], None] = '7bad720dd312'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # 1. Add brain_power to student_profiles (R-09) safely
    columns = [c['name'] for c in inspector.get_columns('student_profiles')]
    if 'brain_power' not in columns:
        op.add_column('student_profiles', sa.Column('brain_power', sa.Integer(), nullable=False, server_default='100'))

    # 2. Migrate all DateTime columns to TIMESTAMP WITH TIME ZONE (TD-06)
    tables_columns = {
        'users': ['date_of_birth', 'verification_code_expires', 'email_verified_at', 'authorized_at', 'created_at', 'updated_at', 'last_login'],
        'teacher_students': ['added_at'],
        'parent_profiles': ['created_at', 'updated_at'],
        'parent_students': ['added_at'],
        'teacher_profiles': ['plan_expires_at', 'created_at', 'updated_at'],
        'materials': ['created_at', 'updated_at'],
        'student_topic_requests': ['created_at', 'updated_at', 'completed_at'],
        'student_profiles': ['last_active_date', 'created_at', 'updated_at'],
        'learning_style_assessments': ['assessment_date'],
        'teaching_sessions': ['scheduled_start', 'actual_start', 'actual_end', 'created_at', 'updated_at'],
        'session_students': ['joined_at', 'left_at', 'created_at'],
        'subjects': ['created_at', 'updated_at'],
        'topics': ['created_at'],
        'lessons': ['created_at', 'updated_at'],
        'assessments': ['created_at'],
        'assessment_results': ['started_at', 'submitted_at', 'created_at'],
        'proctoring_events': ['timestamp'],
        'student_subject_progress': ['last_active', 'created_at', 'updated_at'],
        'monthly_reports': ['sent_at', 'generated_at', 'created_at'],
        'student_activity_log': ['timestamp'],
        'notifications': ['created_at'],
        'messages': ['read_at', 'created_at'],
        'student_reports': ['approved_at', 'sent_at', 'created_at', 'updated_at'],
        'teacher_student_links': ['added_at']
    }

    schema_tables = inspector.get_table_names()

    for table, columns in tables_columns.items():
        # Only attempt if table exists in current database context
        if table in schema_tables:
            existing_cols = [c['name'] for c in inspector.get_columns(table)]
            for col in columns:
                if col in existing_cols:
                    op.execute(
                        f"ALTER TABLE {table} ALTER COLUMN {col} "
                        f"TYPE TIMESTAMP WITH TIME ZONE "
                        f"USING {col} AT TIME ZONE 'UTC'"
                    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('student_profiles', 'brain_power')
    # Reverting over 50 columns manually is omitted from this manual script for safety unless requested.
