import logging
from typing import List, Dict, Any
import uuid

# NO MORE HEAVY IMPORTS (docling, sentence_transformers, etc.)
# This service is now a lightweight stub for the Render free tier.

logger = logging.getLogger(__name__)

class ParsingService:
    def __init__(self):
        self.enabled = False
        logger.info("ℹ️ ParsingService initialized in LEAN mode (RAG Disabled).")

    async def process_material(self, material_id: uuid.UUID, file_path: str, subject: str = "General", education_level: str = "secondary"):
        """
        Stubbed out for the 512MB RAM tier.
        """
        logger.warning(f"⚠️ process_material called for {material_id}. RAG features are disabled in this deployment.")
        # In the future, this can be offloaded to a worker with more RAM
        return None

    def get_query_embedding(self, query: str) -> List[float]:
        """
        Stubbed out query embedding. Returns a zero vector.
        """
        logger.warning("⚠️ get_query_embedding called. Returning zero vector (RAG Disabled).")
        return [0.0] * 384 # Standard size for bge-small

    def preprocess_document_text(self, text: str) -> str:
        return text

    def _split_text(self, text: str) -> List[str]:
        return [text]

parsing_service = ParsingService()
