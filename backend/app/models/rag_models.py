import uuid
from datetime import datetime
from sqlalchemy import Column, Text, ForeignKey, Integer, DateTime, func, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from pgvector.sqlalchemy import Vector
from app.db.database import Base

class MaterialChunk(Base):
    """
    Stores semantic chunks of educational materials for RAG.
    Each chunk is represented as a high-dimensional vector for similarity search.
    """
    __tablename__ = "material_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material_id = Column(UUID(as_uuid=True), ForeignKey("materials.id", ondelete="CASCADE"), nullable=False)
    
    # The actual text content of the chunk
    content = Column(Text, nullable=False)
    
    page_number = Column(Integer, nullable=True)
    chunk_index = Column(Integer, nullable=False)
    
    # Metadata for better retrieval context
    chunk_metadata = Column(JSONB, nullable=True, default={})
    
    # Vector column - using 384 dimensions for lightweight models (like all-MiniLM-L6-v2)
    # or 1536 for OpenAI embeddings. 384 is a good default for local/Docling usage.
    embedding = Column(Vector(384), nullable=True)
    
    # TSVECTOR for full-text search (BM25)
    from sqlalchemy.dialects.postgresql import TSVECTOR
    search_vector = Column(TSVECTOR, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index(
            "ix_material_chunks_embedding_hnsw",
            embedding,
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    def __repr__(self):
        return f"<MaterialChunk(material_id={self.material_id}, index={self.chunk_index})>"
