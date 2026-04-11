"""consolidate_teacher_student_links

Revision ID: f9f9f9f9f9f9
Revises: e8e8e8e8e8e8
Create Date: 2026-04-06 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f9f9f9f9f9f9'
down_revision: Union[str, Sequence[str], None] = 'e8e8e8e8e8e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add missing columns to 'teacher_students'
    # 'added_at' and 'notes' already exist
    op.add_column('teacher_students', sa.Column('status', sa.String(length=20), server_default='active', nullable=True))
    op.add_column('teacher_students', sa.Column('added_by', sa.String(length=50), server_default='teacher', nullable=True))
    op.add_column('teacher_students', sa.Column('private_notes', sa.Text(), nullable=True))

    # 2. Migrate data from 'teacher_student_links' to 'teacher_students'
    # We use COALESCE and conflict resolution logic. Since they represent redundant links, we only insert if not already present.
    # Note: Using RAW SQL here because Alembic context is limited for cross-table data migrations.
    op.execute("""
        INSERT INTO teacher_students (id, teacher_id, student_id, status, added_at, added_by, private_notes)
        SELECT id, teacher_id, student_id, status, added_at, added_by, private_notes
        FROM teacher_student_links
        ON CONFLICT (teacher_id, student_id) DO NOTHING;
    """)
    
    # 3. Drop legacy table
    op.drop_table('teacher_student_links')


def downgrade() -> None:
    # Reverse migration: recreate the table (simplified)
    op.create_table('teacher_student_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('teacher_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('student_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='active'),
        sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('added_by', sa.String(length=50), server_default='teacher'),
        sa.Column('private_notes', sa.Text(), nullable=True),
    )
    # Move some data back or just leave it since the code is being upgraded
    # We drop the newly added columns on downgrade
    op.drop_column('teacher_students', 'private_notes')
    op.drop_column('teacher_students', 'added_by')
    op.drop_column('teacher_students', 'status')
