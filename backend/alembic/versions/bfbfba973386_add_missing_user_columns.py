"""add_missing_user_columns

Revision ID: bfbfba973386
Revises: b8f1a2c3d4e5
Create Date: 2026-03-23 07:17:39.845067

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bfbfba973386'
down_revision: Union[str, Sequence[str], None] = 'b8f1a2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('users')]
    
    if 'force_password_change' not in columns:
        op.add_column('users', 
            sa.Column('force_password_change', 
                      sa.Boolean(), 
                      nullable=False,
                      server_default='false'))


def downgrade() -> None:
    """Downgrade schema."""
    pass
