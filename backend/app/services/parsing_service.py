import os
import logging
from typing import List, Dict, Any
from docling.datamodel.base_models import InputFormat
from sqlalchemy.orm import Session
import uuid

from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.models.rag_models import MaterialChunk
from app.services.storage_service import storage_service
from app.db.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

class ParsingService:
    def __init__(self):
        # Do NOT load models here to prevent pytest collection hangs
        self._embed_model = None
        self._converter = None

    @property
    def embed_model(self):
        if self._embed_model is None:
            # Lazy import to avoid blocking collection
            from sentence_transformers import SentenceTransformer
            self._embed_model = SentenceTransformer("BAAI/bge-small-en-v1.5")
            logger.info("✅ SentenceTransformer model (BGE) loaded lazily.")
        return self._embed_model

    @property
    def converter(self):
        if self._converter is None:
            # Lazy import to avoid blocking collection
            from docling.document_converter import DocumentConverter
            self._converter = DocumentConverter()
            logger.info("✅ Docling DocumentConverter loaded lazily.")
        return self._converter

    async def process_material(self, material_id: uuid.UUID, file_path: str, subject: str = "General", education_level: str = "secondary"):
        """
        Parses a document, chunks it, generates embeddings, and saves to DB.
        """
        async with AsyncSessionLocal() as db:
            try:
                logger.info(f"⏳ Starting background processing for material {material_id}")
                # 1. Convert document to Markdown using Docling
                result = self.converter.convert(file_path)
                markdown_content = result.document.export_to_markdown()
                
                # Preprocess (e.g. clean up tables or noise)
                markdown_content = self.preprocess_document_text(markdown_content)
                
                # 2. Chunk the content
                chunks = self._split_text(markdown_content)
                logger.info(f"📄 Document converted for {material_id}. Generated {len(chunks)} chunks.")
                
                # 3. Process each chunk
                for i, chunk_text in enumerate(chunks):
                    if len(chunk_text.strip()) < 20:
                        continue
                        
                    # Generate embedding
                    embedding = self.embed_model.encode(chunk_text).tolist()
                    
                    # Save to database
                    db_chunk = MaterialChunk(
                        material_id=material_id,
                        content=chunk_text,
                        chunk_index=i,
                        embedding=embedding,
                        chunk_metadata={
                            "chunk_index": i,
                            "source_document_id": str(material_id),
                            "subject": subject,
                            "education_level": education_level,
                            "source": "docling_conversion"
                        }
                    )
                    db.add(db_chunk)
                
                await db.commit()
                logger.info(f"✅ Successfully processed material {material_id}: {len(chunks)} chunks created")
                
            except Exception as e:
                logger.error(f"❌ Failed to process material {material_id}: {e}")
                await db.rollback()

    def get_query_embedding(self, query: str) -> List[float]:
        """
        Generates an embedding for a search query.
        BGE models require a query prefix for retrieval tasks.
        """
        query_text = f"Represent this sentence: {query}"
        return self.embed_model.encode(query_text).tolist()

    def preprocess_document_text(self, text: str) -> str:
        """Add any cleaning logic here"""
        return text

    def _split_text(self, text: str) -> List[str]:
        """
        Improved chunking using RecursiveCharacterTextSplitter.
        """
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", " ", ""]
        )
        return splitter.split_text(text)

parsing_service = ParsingService()
