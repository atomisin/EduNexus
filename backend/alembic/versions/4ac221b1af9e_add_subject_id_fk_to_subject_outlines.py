"""add_subject_id_fk_to_subject_outlines

Revision ID: 4ac221b1af9e
Revises: 4695339ab499
Create Date: 2026-03-27 22:28:09.452448

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4ac221b1af9e"
down_revision: Union[str, Sequence[str], None] = "4695339ab499"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add subject_id FK to subject_outlines, replacing subject string column."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'subject_outlines' not in inspector.get_table_names():
        return # Table not created yet, skip
        
    columns = [c['name'] for c in inspector.get_columns('subject_outlines')]
    
    # Step 1: Add subject_id column (nullable initially) safely
    if 'subject_id' not in columns:
        op.add_column("subject_outlines", sa.Column("subject_id", sa.UUID(), nullable=True))

    # Step 2: Backfill subject_id by matching subject name to subjects table
    # This joins subject_outlines.subject (name) with subjects.id
    if 'subject' in columns:
        op.execute("""
            UPDATE subject_outlines so
            SET subject_id = s.id
            FROM subjects s
            WHERE so.subject = s.name
            AND so.subject_id IS NULL
        """)

        # Step 3: Drop the old subject string column safely
        op.drop_column("subject_outlines", "subject")

    # Step 4: Add NOT NULL constraint and FK safely
    # Check if FK already exists
    fks = inspector.get_foreign_keys('subject_outlines')
    fk_names = [fk['name'] for fk in fks]
    
    if 'subject_id' in [c['name'] for c in inspector.get_columns('subject_outlines')]:
        op.alter_column("subject_outlines", "subject_id", nullable=False)
        
        if "fk_subject_outlines_subject_id" not in fk_names:
            op.create_foreign_key(
                "fk_subject_outlines_subject_id",
                "subject_outlines",
                "subjects",
                ["subject_id"],
                ["id"],
            )


def downgrade() -> None:
    """Remove subject_id FK, restore subject string column."""
    # Remove FK constraint
    op.drop_constraint(
        "fk_subject_outlines_subject_id", "subject_outlines", type_="foreignkey"
    )

    # Add back subject string column
    op.add_column(
        "subject_outlines", sa.Column("subject", sa.String(100), nullable=True)
    )

    # Backfill subject names from subjects table
    op.execute("""
        UPDATE subject_outlines so
        SET subject = s.name
        FROM subjects s
        WHERE so.subject_id = s.id
    """)

    # Drop subject_id column
    op.drop_column("subject_outlines", "subject_id")
