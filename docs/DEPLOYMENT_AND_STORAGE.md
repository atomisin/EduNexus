# Deployment and Storage Architecture

EduNexus utilizes robust containerization via Docker and highly scalable object storage integration ensuring readiness for production workloads.

## 1. Docker & Container Network
The entire application operates via `docker-compose.yml`, which provisions an internal virtual Linux network tying disparate services.

### **Core Containers**
- `edunexus-api`: Port 8000. Houses Uvicorn pointing at FastAPI. Reinstantiates instantly relying on `main.py` hot-reload triggers.
- `edunexus-frontend`: Port 3000. Uses Vite's dev server locally but bundles to static React via Nginx for production releases.
- `postgres`: Port 5432. The primary relational DB carrying all schemas and `session_students` mappings.
- `redis`: Port 6379. Session state management and message queuing interface.
- `seaweedfs`: The fundamental underlying S3-equivalent File System routing all uploaded content blobs.

## 2. Storage Subsystem: SeaweedFS

EduNexus completely isolates binary files (Images, Profile Avatars, PDF Materials, Media) from Database Blob architectures using **SeaweedFS**.
- **The Engine**: SeaweedFS executes lightning-fast O(1) file lookups.
- **S3 API Compatibility**: The FastAPI `StorageService` (`boto3`) seamlessly interfaces using standard AWS hooks.

### **Public Reading & ACLs**
A key design aspect is making material instantly available dynamically to frontend elements. 
- SeaweedFS initializes a `edunexus` bucket.
- A `BucketPolicy` configures the bucket explicitly with a `s3:GetObject` `Allow` rule universally tied to anonymous callers.
- **Boto3 Hook**: Fastapi specifically defines `ACL="public-read"` for any `upload_fileobj()` call to circumvent default `AccessDenied` errors.

### **URL Reconciliation Engine**
Because the system runs inside internal docker networks (`http://seaweedfs:8333`), a major issue was that browsers attempt to retrieve images using these unresolvable local IPs.
- The `StorageService.resolve_url()` immediately executes a regex substitution mapping internal hosts explicitly against the `.env` configuration `STORAGE_PUBLIC_URL` (usually localhost/public ip).
- This mutation occurs instantaneously on Backend endpoints returning User Profiles, ensuring the DOM paints the avatar instantly.

## 3. Environment Specifications
The platform relies centrally on a `.env` file containing critical keys.
- **`GROQ_API_KEY`**: Authenticates requests directly against LPU servers.
- **`STORAGE_PUBLIC_URL`**: Defines the public routing domain for uploading media mapping.
- **`LIVEKIT_API_KEY / LIVEKIT_API_SECRET`**: Grants the backend the cryptographic capability to sign JWT WebSocket tickets enabling users to safely join video sessions.
