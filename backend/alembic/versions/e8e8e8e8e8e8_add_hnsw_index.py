"""add_hnsw_index

Revision ID: e8e8e8e8e8e8
Revises: 6d23ec055133
Create Date: 2026-04-06 09:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8e8e8e8e8e8'
down_revision: Union[str, Sequence[str], None] = '6d23ec055133'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable pgvector extension (should already be there, but safe to check)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    
    # 2. Add HNSW index for cosine distance
    # We use 384 dimensions as defined in the MaterialChunk model
    # m=16, ef_construction=64 are good balanced defaults
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_material_chunks_embedding_hnsw 
        ON material_chunks 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_material_chunks_embedding_hnsw")
