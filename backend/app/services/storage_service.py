import boto3
from botocore.config import Config
from typing import Optional, BinaryIO
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self):
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=f"{'https' if settings.STORAGE_USE_SSL else 'http'}://{settings.STORAGE_ENDPOINT}",
            aws_access_key_id=settings.STORAGE_ACCESS_KEY,
            aws_secret_access_key=settings.STORAGE_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1", # Default for SeaweedFS
        )
        self.bucket = settings.STORAGE_BUCKET
        # self._ensure_bucket_exists() # Temporarily disabled to prevent blocking on startup

    def _ensure_bucket_exists(self):
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
        except Exception:
            try:
                self.s3_client.create_bucket(Bucket=self.bucket)
                logger.info(f"Created bucket: {self.bucket}")
            except Exception as e:
                logger.error(f"Failed to create bucket {self.bucket}: {e}")

    def upload_file(self, file_obj: BinaryIO, object_name: str, content_type: Optional[str] = None) -> str:
        """Upload a file to SeaweedFS and return the URL"""
        try:
            extra_args = {"ACL": "public-read"}
            if content_type:
                extra_args["ContentType"] = content_type

            self.s3_client.upload_fileobj(
                file_obj,
                self.bucket,
                object_name,
                ExtraArgs=extra_args
            )
            
            # Construct the URL
            if settings.STORAGE_PUBLIC_URL:
                # Use public URL for browser compatibility
                base_url = settings.STORAGE_PUBLIC_URL.rstrip('/')
                return f"{base_url}/{self.bucket}/{object_name}"
            
            # Fallback to endpoint
            protocol = "https" if settings.STORAGE_USE_SSL else "http"
            return f"{protocol}://{settings.STORAGE_ENDPOINT}/{self.bucket}/{object_name}"
        except Exception as e:
            logger.error(f"Failed to upload file {object_name}: {e}")
            raise Exception(f"File upload failed: {str(e)}")

    def delete_file(self, object_name: str):
        """Delete a file from SeaweedFS"""
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=object_name)
        except Exception as e:
            logger.error(f"Failed to delete file {object_name}: {e}")

    def resolve_url(self, url: Optional[str]) -> Optional[str]:
        """Resolve an internal storage URL to a public-facing one if necessary"""
        if not url or not settings.STORAGE_PUBLIC_URL:
            return url
            
        # Common internal hostnames that might be in the DB
        internal_hosts = [
            f"{'https' if settings.STORAGE_USE_SSL else 'http'}://{settings.STORAGE_ENDPOINT}",
            "http://seaweedfs:8333",
            "http://localhost:8333", # Sometimes localhost is used internally but needs public URL
        ]
        
        public_base = settings.STORAGE_PUBLIC_URL.rstrip('/')
        
        for host in internal_hosts:
            if url.startswith(host):
                return url.replace(host, public_base)
        
        return url

    def get_presigned_url(self, object_name: str, expires_in: int = 3600) -> str:
        """Generate a presigned URL for a file"""
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": object_name},
                ExpiresIn=expires_in,
            )
            
            return self.resolve_url(url) or ""
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for {object_name}: {e}")
            return ""

storage_service = StorageService()
