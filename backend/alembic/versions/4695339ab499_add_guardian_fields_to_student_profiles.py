"""add_guardian_fields_to_student_profiles

Revision ID: 4695339ab499
Revises: 46ff8b522ea4
Create Date: 2026-03-26 21:56:13.943159

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4695339ab499"
down_revision: Union[str, Sequence[str], None] = "46ff8b522ea4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add guardian_name, guardian_email, guardian_phone to student_profiles"""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('student_profiles')]

    if "guardian_name" not in columns:
        op.add_column(
            "student_profiles", sa.Column("guardian_name", sa.String(200), nullable=True)
        )
    if "guardian_email" not in columns:
        op.add_column(
            "student_profiles", sa.Column("guardian_email", sa.String(200), nullable=True)
        )
    if "guardian_phone" not in columns:
        op.add_column(
            "student_profiles", sa.Column("guardian_phone", sa.String(50), nullable=True)
        )


def downgrade() -> None:
    """Remove guardian fields from student_profiles"""
    op.drop_column("student_profiles", "guardian_phone")
    op.drop_column("student_profiles", "guardian_email")
    op.drop_column("student_profiles", "guardian_name")
