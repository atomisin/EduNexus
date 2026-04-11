# Frontend Architecture

The EduNexus 2.0 frontend is built fundamentally as a modern, decoupled Single Page Application (SPA). It leverages the React ecosystem heavily to provide a rich, highly interactive, desktop-class learning application inside the browser.

## Tech Stack
- **Framework:** React 18, Vite (for rapid build and HMR)
- **Language:** TypeScript 5+ (Strict mode)
- **Styling:** Tailwind CSS, PostCSS, Lucide-React (Icons)
- **Components:** Radix UI / shadcn-ui (accessible primitive components)
- **State Management:** Zustand (Stores) + React Context
- **Routing:** React Router v6
- **Real-time:** LiveKit SDK (Video/Audio WebRTC), Native browser WebSockets

## 1. Modular Directory Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ai/            # AI components: SmartHelper.tsx, Diagnostics.tsx
│   │   ├── auth/          # Authentication screens and forms
│   │   ├── common/        # Shared components: Buttons, Modals, Navbar
│   │   ├── student/       # Student-specific dashboards, Brain Power energy HUD, gamification widgets
│   │   └── teacher/       # Teacher dashboards, engagement trackers, course creation
│   ├── hooks/             # Custom React hooks (e.g., useWebsocket, useAuth)
│   ├── lib/               # Utility functions, formatting, constants
│   ├── services/          # Central API interfaces (api.ts) mapping backend routes
│   ├── types/             # TypeScript definitions matching Backend Pydantic models
│   ├── App.tsx            # Main application root and routing definitions
│   └── main.tsx           # Entry point
```

## 2. Core State Management Philosophy
EduNexus distances itself from Redux to favor simpler, hook-based stores using **Zustand**. 

- **Auth Store:** Governs User roles (Teacher vs Student, Generic vs Professional). Triggers protective re-routes.
- **Session Store:** Holds the context of a live video class. Active connections, LiveKit tokens, and recent WebSocket chat payloads are persisted here during the duration of a lesson.

## 3. Real-Time Interfaces & Rendering

### The `SmartHelper` Component
- Represents the AI Generalist and internal AI Learning Partner.
- Utilizes `react-markdown` dynamically. Instead of rendering raw text, it parses the custom Markdown rules sent by the backend logic, parsing `**bold**` natively, formatting lists smoothly, and enforcing the Teal/Slate color theme natively through specific Tailwind injected classes within the Markdown plugins.

### LiveKit Room Lifecycle
- Rather than handling raw RTCPeerConnections, EduNexus uses `<LiveKitRoom>` wrappers.
- The `video=true` and `audio=true` hooks subscribe automatically to the actively publishing Teacher, adjusting grid breakpoints via Tailwind responsive variables.
- The teacher view includes the capability to publish local microphone lines actively, sending an audio track that LiveKit routes internally.

### Material Dashboard
- Utilizes `materialsAPI` routes heavily. Renders dynamically based on `Subject` mappings.
- Re-fetches gracefully upon encountering `201 OK` from successful SeaweedFS file uploads, mapping `resolve_url()` directly to the `src` attribute of iframe or file preview tags natively in HTML5.
