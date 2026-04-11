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
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # 1. Add missing columns to 'teacher_students' safely
    if 'teacher_students' in inspector.get_table_names():
        existing_cols = [c['name'] for c in inspector.get_columns('teacher_students')]
        if 'status' not in existing_cols:
            op.add_column('teacher_students', sa.Column('status', sa.String(length=20), server_default='active', nullable=True))
        if 'added_by' not in existing_cols:
            op.add_column('teacher_students', sa.Column('added_by', sa.String(length=50), server_default='teacher', nullable=True))
        if 'private_notes' not in existing_cols:
            op.add_column('teacher_students', sa.Column('private_notes', sa.Text(), nullable=True))

    # 2. Migrate data from 'teacher_student_links' to 'teacher_students' (Safe & Secure)
    # Check if both tables exist before attempting data move
    existing_tables = inspector.get_table_names()
    if 'teacher_student_links' in existing_tables and 'teacher_students' in existing_tables:
        # Note: Using RAW SQL here because Alembic context is limited for cross-table data migrations.
        op.execute("""
            INSERT INTO teacher_students (id, teacher_id, student_id, status, added_at, added_by, private_notes)
            SELECT id, teacher_id, student_id, status, added_at, added_by, private_notes
            FROM teacher_student_links
            ON CONFLICT (teacher_id, student_id) DO NOTHING;
        """)
        
        # 3. Drop legacy table safely
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
