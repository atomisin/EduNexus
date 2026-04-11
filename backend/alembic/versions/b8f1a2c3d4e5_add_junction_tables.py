"""add junction tables

Revision ID: b8f1a2c3d4e5
Revises: d57ecf4a463c
Create Date: 2026-03-22 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b8f1a2c3d4e5'
down_revision: str = 'd57ecf4a463c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # student_subject junction table
    if 'student_subject' not in existing_tables:
        op.create_table(
            'student_subject',
            sa.Column('student_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('subject_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('enrolled_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('student_id', 'subject_id'),
        )

    # student_topic_progress junction table
    if 'student_topic_progress' not in existing_tables:
        op.create_table(
            'student_topic_progress',
            sa.Column('student_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('topic_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('progress_pct', sa.Integer(), nullable=True, server_default='0'),
            sa.Column('last_accessed', sa.DateTime(timezone=True), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['topic_id'], ['topics.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('student_id', 'topic_id'),
        )

    # teacher_subject junction table
    if 'teacher_subject' not in existing_tables:
        op.create_table(
            'teacher_subject',
            sa.Column('teacher_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('subject_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['teacher_id'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('teacher_id', 'subject_id'),
        )

    # NOTE: Existing ARRAY columns (enrolled_subjects, topics_completed,
    # topics_in_progress, subjects_taught) are NOT dropped in this migration.
    # Data migration from arrays to junction tables is a separate step.
    # TODO: migrate existing data before dropping old columns


def downgrade() -> None:
    op.drop_table('teacher_subject')
    op.drop_table('student_topic_progress')
    op.drop_table('student_subject')
