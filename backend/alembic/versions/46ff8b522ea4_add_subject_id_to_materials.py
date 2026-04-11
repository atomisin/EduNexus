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
    op.add_column('materials', sa.Column('subject_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_materials_subject_id_subjects', 'materials', 'subjects', ['subject_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_materials_subject_id_subjects', 'materials', type_='foreignkey')
    op.drop_column('materials', 'subject_id')
