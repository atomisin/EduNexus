# EduNexus 2.0

EduNexus is a Nigerian education platform for students, teachers, schools, and professional learners. It combines structured curriculum progression, AI tutoring, live classroom support, assessments, progress analytics, parent reporting, and admin oversight in one learning workspace.

The platform is built with FastAPI, SQLAlchemy async, PostgreSQL, React, TypeScript, Vite, Tailwind CSS, Docker, LiveKit, SeaweedFS-compatible object storage, and Groq-powered AI services.

## Core Capabilities

- AI Tutor with lesson-aware teaching, guided prompts, mastery checks, speech support, and professional math/academic rendering.
- Curriculum-aware learning paths for primary, JSS, SS, exam-prep, and professional learners.
- Lesson locking with placement checks for learners who want to jump ahead.
- Practice quizzes, pre/post assessments, mastery quizzes, and performance analytics.
- Teacher live sessions with lesson prep, outlines, class notes, quizzes, take-home assignments, and student activity tracking.
- Parent/guardian progress reports with charts, strengths, improvement areas, attendance, participation, and quiz performance.
- Admin dashboard for user approval, AI usage/cost visibility, content oversight, and platform operations.
- Email verification, admin approval, password reset, and secure cookie-based authentication.
- Student and teacher profile management, including avatar uploads.
- Mobile-first student, teacher, admin, registration, and legal document layouts.

## Repository Layout

```text
backend/     FastAPI API, services, models, scripts, and tests
frontend/    React + TypeScript client
docs/        Architecture and subsystem documentation
config/      Local service configuration
docker-compose.yml
```

Useful docs:

- [System Features](docs/SYSTEM_FEATURES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Frontend Architecture](docs/FRONTEND_ARCHITECTURE.md)
- [Backend Architecture](docs/BACKEND_ARCHITECTURE.md)
- [AI System](docs/AI_SYSTEM.md)
- [Deployment and Storage](docs/DEPLOYMENT_AND_STORAGE.md)

## Local Setup

### Prerequisites

- Docker and Docker Compose
- Node.js and npm
- Python 3.11+
- Git

### Environment

Create a `.env` file in the project root. Typical local values include:

```env
APP_NAME=EduNexus 2.0
ENVIRONMENT=development

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=edunexus
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/edunexus

GROQ_API_KEY=your_groq_api_key
YOUTUBE_API_KEY=your_youtube_api_key

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password_without_spaces
SMTP_USE_TLS=true
SMTP_FROM_EMAIL=your_email@gmail.com
SMTP_FROM_NAME=EduNexus

VERIFICATION_ENABLED=true
VERIFICATION_BYPASS=false
VERIFICATION_TOKEN_EXPIRE_HOURS=24
APP_BASE_URL=http://localhost:3000

STORAGE_PUBLIC_URL=http://localhost:8333
LIVEKIT_API_KEY=your_livekit_key
LIVEKIT_API_SECRET=your_livekit_secret
```

For Gmail SMTP, use a Google App Password and remove spaces before saving it in `.env`.

### Start Services

From the repository root:

```bash
docker-compose up --build -d
```

Access:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/health](http://localhost:8000/health)

## Development Commands

Frontend:

```bash
cd frontend
npm install
npx tsc --noEmit
npm run build
```

Backend:

```bash
cd backend
python -m compileall app
```

Run a single Python file compile check after backend edits:

```bash
python -m py_compile backend/app/api/v1/endpoints/auth.py
```

## Authentication Flow

1. A student or teacher registers from the landing page.
2. EduNexus sends a 6-digit email verification code.
3. The user enters the code in the verification screen.
4. Admin reviews and approves the account.
5. The user signs in and is routed directly to the correct dashboard.

Password reset is available from the login form. Reset links are signed, expire using the configured verification expiry window, and direct users to `/reset-password`.

## Production Notes

- Use `SameSite=None` and `Secure=True` cookies when frontend and backend are hosted on different domains.
- Keep backend workers and database pools small on free-tier hosting to stay under memory limits.
- Configure SMTP before enabling public registration, otherwise users can register but will not receive verification or reset emails.
- Ensure production databases receive schema migrations or hotpatches when ORM models gain columns.
- Do not commit local-only agent files, secrets, `.env`, build artifacts, cache folders, or generated reports.

## Demo Accounts

Default accounts depend on the target database and seed scripts. Verify or reset demo users in the target environment before relying on them for QA.

## Legal

EduNexus includes in-app Terms of Service and Privacy Policy content for registration and public landing-page access. Review the copy with qualified legal counsel before using it as a final production policy.

## Support

EduNexus is built for structured digital learning in the Nigerian education ecosystem.
