"""reconcile_schema

Revision ID: 000_reconcile
Revises: None
Create Date: 2026-04-11 16:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '000_reconcile'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 2. Create materials table safely
    op.execute("""
        CREATE TABLE IF NOT EXISTS materials (
            id UUID PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            file_url VARCHAR(500),
            video_url VARCHAR(500),
            file_type VARCHAR(50),
            file_size INTEGER,
            subject VARCHAR(100) NOT NULL,
            subject_id UUID,
            topic VARCHAR(255),
            education_level VARCHAR(50),
            grade_level VARCHAR(50),
            uploader_id UUID NOT NULL,
            is_public BOOLEAN DEFAULT FALSE,
            allowed_students UUID[],
            tags VARCHAR[],
            download_count INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # 3. Create material_chunks table safely
    op.execute("""
        CREATE TABLE IF NOT EXISTS material_chunks (
            id UUID PRIMARY KEY,
            material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            page_number INTEGER,
            chunk_index INTEGER NOT NULL,
            chunk_metadata JSONB DEFAULT '{}'::jsonb,
            embedding vector(384),
            search_vector tsvector,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # 4. Create indexes safely
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_material_chunks_embedding_hnsw 
        ON material_chunks USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    # In a reconciliation migration, downgrade is usually empty or only drops what we created
    # but since this is for healing, we proceed with caution.
    pass
