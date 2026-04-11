# EduNexus 2.0 - AI-Powered Learning Platform

EduNexus 2.0 is a comprehensive educational platform designed specifically for private teachers, professional tutors, and students in Nigeria. It leverages state-of-the-art AI, computer vision, and local infrastructure to heavily personalize learning paths while maintaining data sovereignty.

## 📚 Comprehensive Documentation

The documentation for this project has been extensively modularized to provide deep technical insights into every subsystem. Please refer to the `docs/` directory for detailed architecture and implementation facts.

### 🧭 [System Features Overview](docs/SYSTEM_FEATURES.md)
Discover the core capabilities of EduNexus, including the AI Generalist versus the Zero-to-Hero Teaching Partner, Smart Material Processing (PDF/Markdown extraction), Professional Isolation, Live Video Sessions, and Adaptive Gamification.

### 🏗️ [Overall System Architecture](docs/ARCHITECTURE.md)
Understand the high-level orchestration between the FastAPI backend, React frontend, PostgreSQL database, SeaweedFS storage, and LiveKit WebRTC subsystems.

### 🖥️ [Frontend Architecture](docs/FRONTEND_ARCHITECTURE.md)
Dive deep into the React 18 SPA. Learn about the Zustand state management philosophy, dynamic Markdown rendering with custom plugins (Teal/Slate themes), and the WebSocket/WebRTC integrations powering the live teacher dashboards.

### ⚙️ [Backend Architecture](docs/BACKEND_ARCHITECTURE.md)
Explore the asynchronous FastAPI backend. Review the SQLAlchemy data models (handling strict Student vs Professional roles), the background Celery/Redis tasks for non-blocking PDF ingestion via IBM Docling, and the WebSocket broadcast managers mapping active connections.

### 🧠 [AI System Deep Dive](docs/AI_SYSTEM.md)
Discover how EduNexus manages highly customized prompting. Read about the performance differences between the `llama-3.1-70b-versatile` tutor model and the lightning-fast `llama-3.1-8b-instant` generalist, as well as the audio STT transcription pipeline powered by Whisper.

### 🐳 [Deployment & Storage](docs/DEPLOYMENT_AND_STORAGE.md)
A guide to the containerized ecosystem. Understand how SeaweedFS utilizes S3-compatible `public-read` ACLs, the mapping of internal Docker hostnames to browser-facing `STORAGE_PUBLIC_URL`s, and the required `.env` configurations.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Docker & Docker Compose**
- **Git**
- **Hardware**: 16GB+ RAM (32GB recommended for seamless AI integration), 50GB disk space.

### 2. Environment Setup
Create a `.env` file in the root directory mapping the essential variables (detailed completely in the [Deployment Docs](docs/DEPLOYMENT_AND_STORAGE.md)):

```env
APP_NAME=EduNexus 2.0
GROQ_API_KEY=your_groq_api_key_here
STORAGE_PUBLIC_URL=http://localhost:8333
LIVEKIT_API_KEY=your_livekit_key
LIVEKIT_API_SECRET=your_livekit_secret
```

### 3. Spin Up the Infrastructure
Navigate to the root directory where `docker-compose.yml` resides and execute:

```bash
docker-compose up --build -d
```
*Wait for PostgreSQL, Redis, and SeaweedFS to initialize before starting application containers.*

### 4. Access the Application
- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Backend API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **SeaweedFS Storage Node:** [http://localhost:8333](http://localhost:8333)

---

## Support & Community
Built for the Nigerian education ecosystem.
- 📧 Support: support@edunexus.ng
- 📖 Full Wiki: [docs.edunexus.ng](https://docs.edunexus.ng)

*Made with ❤️ in Nigeria for Africa.*