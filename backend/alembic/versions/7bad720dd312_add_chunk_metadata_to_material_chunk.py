"""add_chunk_metadata_to_material_chunk

Revision ID: 7bad720dd312
Revises: 
Create Date: 2026-03-20 16:02:26.249014

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7bad720dd312'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('material_chunks', sa.Column('chunk_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.execute("ALTER TABLE material_chunks ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('material_chunks', 'chunk_metadata')
    op.execute("ALTER TABLE material_chunks ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE")
