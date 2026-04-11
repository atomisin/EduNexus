"""add_subject_id_to_materials

Revision ID: 46ff8b522ea4
Revises: bfbfba973386
Create Date: 2026-03-23 08:04:15.491636

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '46ff8b522ea4'
down_revision: Union[str, Sequence[str], None] = 'bfbfba973386'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('materials')]
    
    if 'subject_id' not in columns:
        op.add_column('materials', sa.Column('subject_id', sa.UUID(), nullable=True))
    
    # Check if FK already exists
    fks = inspector.get_foreign_keys('materials')
    fk_names = [fk['name'] for fk in fks]
    if 'fk_materials_subject_id_subjects' not in fk_names:
        op.create_foreign_key('fk_materials_subject_id_subjects', 'materials', 'subjects', ['subject_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_materials_subject_id_subjects', 'materials', type_='foreignkey')
    op.drop_column('materials', 'subject_id')
