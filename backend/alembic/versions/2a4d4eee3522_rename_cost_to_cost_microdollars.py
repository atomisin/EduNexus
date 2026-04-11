"""rename_cost_to_cost_microdollars

Revision ID: 2a4d4eee3522
Revises: 732e3c28381e
Create Date: 2026-03-21 05:57:16.058556

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a4d4eee3522'
down_revision: Union[str, Sequence[str], None] = '732e3c28381e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename column and change type
    op.alter_column(
        'token_usage_logs',
        'cost',
        new_column_name='cost_microdollars',
        type_=sa.Integer(),
        existing_type=sa.Float(),
        postgresql_using='ROUND(cost * 1000000)::integer'
    )


def downgrade() -> None:
    op.alter_column(
        'token_usage_logs',
        'cost_microdollars',
        new_column_name='cost',
        type_=sa.Float(),
        existing_type=sa.Integer(),
        postgresql_using='cost_microdollars::float / 1000000'
    )
