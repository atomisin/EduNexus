"""merge_heads

Revision ID: 732e3c28381e
Revises: 635e45906a6d, a1b2c3d4e5f6
Create Date: 2026-03-21 05:57:04.082306

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '732e3c28381e'
down_revision: Union[str, Sequence[str], None] = ('635e45906a6d', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
