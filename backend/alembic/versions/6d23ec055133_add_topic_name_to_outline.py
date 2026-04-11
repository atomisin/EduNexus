"""add_topic_name_to_outline

Revision ID: 6d23ec055133
Revises: 4ac221b1af9e
Create Date: 2026-03-31 08:33:38.009660

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6d23ec055133'
down_revision: Union[str, Sequence[str], None] = '4ac221b1af9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('subject_outlines', sa.Column('topic_name', sa.VARCHAR(length=200), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('subject_outlines', 'topic_name')
