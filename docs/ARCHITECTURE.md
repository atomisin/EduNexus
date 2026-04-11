# Overall System Architecture

EduNexus 2.0 employs a modern, multi-layer service architecture consisting of a frontend application, an API gateway backend alongside several specialized microservices, a rich data storage layer, and an AI intelligence engine.

## 1. High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                          │
│  React 18 + TypeScript + Vite + Zustand + Tailwind CSS      │
│  (Real-time Dashboards, Video, WebSockets, Markdown)        │
└────────────────────────────────────────────┬────────────────┘
                                             │ HTTP/WebSocket
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     API GATEWAY / CORE                      │
│  FastAPI (Python 3.11) - Async REST API                     │
│  (Auth, Sessions, Users, WebSockets, Material Processing)   │
└─┬────────────────────────────┬────────────────────────────┬─┘
  │                            │                            │
  ▼                            ▼                            ▼
┌─────────────────┐ ┌────────────────────────┐ ┌───────────────────┐
│   DATA STORE    │ │   AI & PROCESSING      │ │ REAL-TIME SVCS    │
│                 │ │                        │ │                   │
│ - PostgreSQL 16 │ │ - Groq API (LLMs)      │ │ - LiveKit Server  │
│   (Relational)  │ │ - Llama 3.1 70B & 8B   │ │   (WebRTC/Video)  │
│                 │ │ - Whisper.cpp (STT)    │ │ - Redis           │
│ - SeaweedFS (S3)│ │ - IBM Docling (PDF)    │ │   (Broker/Cache)  │
│   (Object Storage)│ - Celery Workers         │ │                   │
└─────────────────┘ └────────────────────────┘ └───────────────────┘
```

## 2. Core Operational Flow

### User Authentication & State
The user initiates a login via the frontend (React). A JWT (JSON Web Token) is assigned securely via FastAPI's `OAuth2PasswordBearer` scheme. The frontend stores this in standard secure storage and passes it back in the `Authorization` header for all protected API calls.

### Real-time Lesson Sessions
1. **Creation**: A Teacher hits the REST API to establish a lesson context (Subject, Topic).
2. **Video Handshake**: FastAPI requests securely signed room and user tokens from the LiveKit internal service.
3. **Connection**: Frontend (student and teacher variants) connects WebRTC streams and WebSockets simultaneously. Video/audio flows through LiveKit; Chat, Hand-raising, and AI explanations route through FastAPI WebSockets.

### Material Processing Pipeline
1. **Upload**: The user uploads a PDF or document via the backend `/materials/upload` endpoint.
2. **Storage**: The file is streamed synchronously to SeaweedFS (S3 compatible) under the `edunexus` bucket (`ACL="public-read"`).
3. **Background Inference**: A Celery worker takes the stored file URL and processes it via IBM Docling offline, generating raw text, semantic chunks, and topic suggestions that are subsequently stored back into PostgreSQL associated with the `Material` row.

## 3. Communication Protocols
- **REST / HTTP 1.1**: The standard synchronous backbone used for CRUD operations, User Profile syncs, fetching material lists, and REST-specific triggers.
- **WebSocket (wss://)**: Used strictly for real-time engagement monitoring, live chat relays, dynamic lesson status (start, pause, complete), and live AI metric distribution.
- **WebRTC**: Real-time peer-to-peer and multiplexed audio/video streaming managed robustly by LiveKit.
