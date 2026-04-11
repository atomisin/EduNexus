"""add_hybrid_search_to_chunks

Revision ID: d57ecf4a463c
Revises: 2a4d4eee3522
Create Date: 2026-03-21 15:39:55.554005

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd57ecf4a463c'
down_revision: Union[str, Sequence[str], None] = '2a4d4eee3522'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add column
    op.add_column('material_chunks', sa.Column('search_vector', postgresql.TSVECTOR(), nullable=True))
    
    # 2. Basic GIN index
    op.create_index('ix_material_chunks_search_vector', 'material_chunks', ['search_vector'], unique=False, postgresql_using='gin')
    
    # 3. Create trigger function (using 'english' dictionary for Nigerian curriculum)
    op.execute("""
        CREATE OR REPLACE FUNCTION material_chunks_tsvector_trigger() RETURNS trigger AS $$
        BEGIN
          new.search_vector := to_tsvector('english', coalesce(new.content, ''));
          return new;
        END
        $$ LANGUAGE plpgsql;
    """)
    
    # 4. Create trigger
    op.execute("""
        CREATE TRIGGER tsvector_update BEFORE INSERT OR UPDATE
        ON material_chunks FOR EACH ROW EXECUTE FUNCTION material_chunks_tsvector_trigger();
    """)
    
    # 5. Backfill existing data
    op.execute("UPDATE material_chunks SET search_vector = to_tsvector('english', coalesce(content, ''));")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tsvector_update ON material_chunks;")
    op.execute("DROP FUNCTION IF EXISTS material_chunks_tsvector_trigger();")
    op.drop_index('ix_material_chunks_search_vector', table_name='material_chunks')
    op.drop_column('material_chunks', 'search_vector')
