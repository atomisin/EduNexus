# EduNexus 2.0 — Agent Context
Last updated: 2026-04-11 (OOM Hardening & Interactive Analytics)

## Project
Nigerian EdTech platform. Creche through SS3 + professional.
FastAPI + SQLAlchemy async + PostgreSQL + pgvector + React + 
TypeScript + Vite + Tailwind + Docker + LiveKit + Groq LLM.

## Running services
docker-compose up -d
Frontend: http://localhost:3000
Backend:  http://localhost:8000

## Key accounts
Admin:   admin@edunexus.com / Admin@TempPassword123 (Verify in DB)
Teacher: cleanup performed, no default teacher remains
Exam Student: deleted per user request (2026-04-07)

## Critical rules — ALWAYS follow
- After every Python change: python -m py_compile <file>
- After every frontend change: npx tsc --noEmit
- After a batch: npm run build
- Deploy frontend: docker-compose up -d --build frontend
- Backend uses --reload, changes are live immediately
- NEVER use indigo/blue/purple colors — use bg-primary only
- NEVER rename 'user' variable in auth.py login function
- NEVER add local 'from sqlalchemy import select' inside functions
- NEVER add custom @app.exception_handler() that returns JSONResponse without calling _add_cors_headers(request, resp) — exception handlers bypass CORSMiddleware entirely (discovered 2026-04-06)
- NEVER filter subjects using only `Subject.is_private == False` because some subjects have `NULL` which PG treats as neither True nor False; use `or_(Subject.is_private == False, Subject.is_private == None)` (discovered 2026-04-07)
- NEVER use `engine.begin()` for mass seeding across multiple subjects because a single failure rolls back the entire dataset; use `engine.connect()` with localized `conn.begin()` blocks (discovered 2026-04-08)
- ALWAYS use logical `isAuthenticated` check in `App.tsx`'s `handleUnauthorized` to prevent booting anonymous visitors to the login page (discovered 2026-04-09)
- ALWAYS use `CASE` prioritization in SQL queries for subject self-healing to ensure exam tracks (JAMB/WAEC/NECO) take precedence over generic curricula (discovered 2026-04-09)
- ALWAYS use robust normalization in `map_grade_level()` because users/registration pass "Primary 4" while DB uses "P4" (discovered 2026-04-07)
- ALWAYS truncate `Topic.name` to 250 chars and store the full syllabus name in `Topic.description` because some curriculum topics exceed the `String(255)` column limit (discovered 2026-04-08)
- NEVER use standard `Checkbox` inside a `label` with `htmlFor` in highly reactive lists because it can trigger recursive state updates and fatal React hangs (discovered 2026-04-10)
- ALWAYS use `prev =>` functional updates for complex nested form objects to prevent stale state from crashing the render loop (discovered 2026-04-10)
- ALWAYS verify password hashes using `verify_password` from `security.py` rather than strength validators during login (discovered 2026-04-10)
- ALWAYS delegate scrolling to an inner `ScrollArea` in `StudentDashboard.tsx` to maintain a static sidebar and header (discovered 2026-04-10)
- ALWAYS ensure the AI Tutor input box is anchored at the bottom of the card using `min-h-0` on flex children to prevent layout jumping (discovered 2026-04-10)
- NEVER import `matplotlib`, `seaborn`, `pandas`, `torch`, or `numpy` at the module level in the backend API because they exceed the 512MB RAM limit on Render (discovered 2026-04-11)
- ALWAYS return structured JSON for charts and delegate rendering to Recharts on the frontend to keep the backend footprint lean (discovered 2026-04-11)

## Architecture
Backend:  backend/app/api/v1/endpoints/
AI:       backend/app/services/ai_coordinator.py
Personas: backend/app/services/tutor_persona.py
Frontend: frontend/src/features/
API svc:  frontend/src/services/api.ts
AI hook:  frontend/src/features/student/hooks/useAITutor.ts
Mock Exams: backend/app/api/v1/endpoints/mock_exams.py
Mock Engine: frontend/src/features/student/learning/MockExamEngine.tsx
Math Render: frontend/src/components/MathText.tsx
Student Layout: frontend/src/features/student/components/
Performance Charts: frontend/src/features/student/components/PerformanceCharts.tsx (Recharts library)
App Routes:     frontend/src/routes/
Session Modals: frontend/src/components/session/FloatingContentModal.tsx

## Known stable files — do not modify unless instructed
- backend/app/api/v1/endpoints/auth.py (login is stable)
- backend/app/services/tutor_persona.py (17 personas correct)
- frontend/src/index.css (design tokens correct)
- config/seaweedfs_s3.json (credentials = minioadmin)
- frontend/src/components/MathText.tsx (KaTeX math renderer)
- frontend/src/App.tsx (Modular routing architecture)
- frontend/src/features/student/StudentDashboard.tsx (De-mega-fied layout)
- backend/app/models/user.py (Consolidated TeacherStudent model)
- backend/app/api/v1/endpoints/students.py (Self-healing logic stable)
- frontend/src/features/landing/LandingPage.tsx (Floating auth integrated)
- frontend/src/components/auth/RegistrationForm.tsx (Hardened subject selection)
- backend/app/services/chart_generator.py (Now returns JSON)
- backend/app/api/v1/endpoints/student_progress.py (Refactored to JSON)
- frontend/src/features/student/dashboard/ProgressView.tsx (Refactored for Recharts)

## Current open issues
See HANDOFF.md for full details on remaining bugs.
- ✅ FIXED 2026-04-05: Topic model display_order attribute error in curriculum generation preventing standard subjects from loading during registration
- ✅ FIXED 2026-04-05: Resolved subject data leakage where students could see all platform subjects when fetching their own dashboard due to a missing filter condition in the /subjects endpoint
- ✅ FIXED 2026-04-05: Resolved AI Tutor chat message duplication by implementing a race-condition lock and functional state updates in useAITutor.ts
- ✅ FIXED 2026-04-05: Performed system-wide cleanup of non-admin users and their relative data (profiles, progress, logs) to ensure a fresh start while preserving the core administrator account.
- ✅ FIXED 2026-04-05: Enforced strict data isolation for professional subjects in `subjects.py` and remediated existing database records to prevent global curriculum leakage.
- ✅ FIXED 2026-04-05: Explicitly blocked teachers and admins from making professional subjects public.
- ✅ FIXED 2026-04-05: Resolved AI Tutor topic hallucination and context-switching bugs by injecting explicit topic metadata into the system prompt and refactoring persona Math biases.
- ✅ FIXED 2026-04-06: Mock Exams sidebar visibility and KaTeX math rendering integrated into MockExamEngine with 10 sample WAEC questions.
- ✅ FIXED 2026-04-06: 50+ question template generator created for Mathematics, Physics, Chemistry, Biology, and English (`seed_extended_mock_exams.py`).
- ✅ FIXED 2026-04-06: Multi-subject JAMB combo backend endpoints (`/combo-attempt`, `/combo-submit`) implemented to support bulk operations.
- ✅ FIXED 2026-04-06: Frontend `ComboExamEngine.tsx` created to simulate the authentic multi-tab, unified timer JAMB CBT environment.
- ✅ FIXED 2026-04-06: `Department` mapping and `Guardian` contact details added to student registration flow. Only surfaces Department for SS1-SS3 students. Mock exam dashboards restrict subject visibility heavily based on precise department matching.
- ✅ FIXED 2026-04-06: Redundant `TeacherStudentLink` model consolidated into unified `TeacherStudent` model across all services, scripts, and endpoints.
- ✅ FIXED 2026-04-06: `StudentDashboard.tsx` and `App.tsx` de-mega-fication completed; extracted layout components and feature-specific routes.
- ✅ FIXED 2026-04-06: Parent Dashboard deprecated; reports now delivered solely via automated approve/send email flow for security/UX.
- ✅ FIXED 2026-04-06: "Login twice" race condition resolved by ensuring `AuthContext` initialization synchronizes with `localStorage` state.
- ✅ FIXED 2026-04-06: Production performance hardening: HNSW (Lantern) vector index implemented for RAG; eliminated N+1 queries in `api/v1/auth/me`.
- ✅ FIXED 2026-04-06: Curriculum seeding confirmed working — 277 Nigerian National Curriculum subjects across Primary 1-6, JSS1-3, SS1-3 seeded via `seed_curriculum.py` raw SQL (no ORM mapper issue remains).
- ✅ FIXED 2026-04-06: Admin Panel CORS error resolved — custom FastAPI exception handlers (401, 403, 500) now inject CORS headers via `_add_cors_headers()` helper in `backend/app/main.py`, fixing browser block on admin user verification.
- ✅ FIXED 2026-04-06: Resolved 500 Internal Server Error during login caused by a `teacher_students.status` schema mismatch and cleaned up stale `teacher_student_link` references in Alembic `env.py`.
- ✅ FIXED 2026-04-06: Corrected Pydantic response validation error in `/api/v1/admin/users` endpoint by defining `UserListResponse.full_name` as `Optional[str]` to align with the DB schema where it can be `None`.
- ✅ FIXED 2026-04-06: Extracted mapping configuration in the Student Registration form to expose and process "Field of Study / Department" alongside Subject selection for Exam Prep students (WAEC, NECO, JAMB), resolving the visibility bug that restricted their enrollment scope.
- ✅ FIXED 2026-04-06: Fixed UI overflow causing unselectable Exam subjects and mapped SS1-SS3 students to inherit Base Mandatory Subjects (English, Maths, Civic).
- ✅ FIXED 2026-04-06: Resolved 500 status on `/auth/login` by adding robust `user is None` check.
- ✅ FIXED 2026-04-06: Implemented `EDUCATION_LEVEL_MAP` for correctly filtering subjects by grade level (ss_1 to senior_secondary, etc).
- ✅ FIXED 2026-04-06: Automated professional student subject creation and AI-driven curriculum generation during registration.
- ✅ FIXED 2026-04-06: Updated authorization guard on `POST /subjects/` to allow professional students to create custom courses for themselves.
- ✅ FIXED 2026-04-07: Resolved subject filtering bug in `get_subjects` by auto-detecting `education_level` and `grade_level` from student profiles.
- ✅ FIXED 2026-04-07: Implemented frontend dashboard redirects from `/` and `/login` for authenticated users in `App.tsx` and `LoginPage.tsx`.
- ✅ FIXED 2026-04-07: Resolved "self-healing" crash in `students.py` caused by missing `or_` import.
- ✅ FIXED 2026-04-07: Cleaned up `adascience` and `examstudent` test accounts and all associated professional subjects/topics.
- ✅ FIXED 2026-04-07: Resolved global "No subjects available" bug by implementing `NULL` safe `is_private` filtering and robust `education_level` mapping in `subjects.py`.
- ✅ FIXED 2026-04-07: Enhanced `map_grade_level` to handle diverse input formats ("Primary 4" -> "P4") ensuring Primary/JSS track visibility.
- ✅ FIXED 2026-04-07: Verified end-to-end self-healing mechanism (String Name -> Subject UUID conversion) for all educational levels.
- ✅ FIXED 2026-04-07: Resolved subject overflow issue where SS1 students saw SS2/SS3 subjects by deriving grade_level from education_level when grade was NULL in `subjects.py`.
- ✅ FIXED 2026-04-07: Deleted 693 garbage topics (CLASS/SUBJECT/TERM/TOPICS) incorrectly seeded from CSV headers.
- ✅ FIXED 2026-04-07: Refactored topic grouping by adding a formal `term` column to the Database (`First Term`, `Second Term`, `Third Term`) and updating the frontend `AIChatSection.tsx` to group topics via mapped headers.
- ✅ FIXED 2026-04-07: Verified standard WAEC/NECO/JAMB mock exam subjects correctly populate via the robust `EDUCATION_LEVEL_MAP` mechanism mapped over the `curriculum_type`.
- ✅ FIXED 2026-04-07: Refactored `<StudentDashboard />` navigation state to be driven purely by `react-router-dom` URL paths (e.g. `/student/learn`, `/student/subjects`).
- ✅ FIXED 2026-04-07: Verified the YouTube recommended videos algorithm works via a valid `YOUTUBE_API_KEY` injected into `.env`.
- ✅ FIXED 2026-04-08: Implemented dedicated exam curricula for JAMB, WAEC, and NECO, separating them from standard secondary subjects to ensure syllabus accuracy and topic isolation.
- ✅ FIXED 2026-04-08: Hardened student enrollment logic to prioritize curriculum-specific subjects during self-healing and prevent fallback to primary school curriculum for exam-track students.
- ✅ FIXED 2026-04-09: Resolved persistent landing page navigation bug where visitors were forced to the login screen with a "Session expired" toast.
- ✅ FIXED 2026-04-09: Hardened cross-track subject enrollment healing, ensuring Mathematics, English, etc., correctly resolve to track-specific IDs (JAMB/WAEC/NECO) across all grade levels.
- ✅ FIXED 2026-04-09: Resolved "Empty Dashboard" and "Empty Practice Center" issues for specialized tracks by reconciling `MockExamSeries` database links to point to syllabus-accurate subject IDs.
- ✅ FIXED 2026-04-10: Implemented floating Sign In and Get Started modals on the landing page for a seamless, premium entry experience.
- ✅ FIXED 2026-04-10: Hardened Authentication Security by enforcing bcrypt hash verification on login and exposing tokens for frontend persistence.
- ✅ FIXED 2026-04-10: Resolved fatal React crash in Student Registration by refactoring subject selection with functional state updates and resilient UI patterns.
- ✅ FIXED 2026-04-10: Resolved track-specific sidebar filtering (hiding Practice for Exam students, hiding Mock Exams for Standard students).
- ✅ FIXED 2026-04-10: Resolved Admin Login failure (500 Error) by migrating legacy plain-text password to identified bcrypt hash.
- ✅ FIXED 2026-04-10: Consolidated legacy `Economics` subject duplicates (`SEC-ECO-001` -> `ss2-economics`) and migrated student enrollments/topic progress via raw SQL array operations.
- ✅ FIXED 2026-04-10: Overhauled `StudentDashboard` layout to fix sidebar/header during scrolling and implemented "Ancor to Bottom" AI Tutor chat input.
- ✅ FIXED 2026-04-10: Modernized authentication flow by deprecating standalone `/login` and `/register` pages in favor of landing page floating modals with deep-link support (`/?auth=login`).
- ✅ FIXED 2026-04-10: Increased AI Tutor chat message area by compacting the input section and button padding.
- ✅ FIXED 2026-04-10: Resolved Practice Quiz "Master Test" redirection bug by correctly passing and calling the `startQuiz` trigger across the routing layers.
- ✅ FIXED 2026-04-10: Expanded AI Tutor layout to ultra-wide (max-w-6xl) and removed outer margins to maximize chat visibility.
- ✅ FIXED 2026-04-10: Resolved Mastery Test blank page infinite loop by correctly propagating `dismissQuizConfirm` to handle assessment cancellation/errors.
- ✅ FIXED 2026-04-10: Shrunk AI Tutor header (reduced padding, smaller avatar/title) to maximize vertical space for chat history.
- ✅ FIXED 2026-04-10: Resolved "Could not generate test questions" error by implementing a "Metadata Lock" on `startQuiz` to prevent fallback strings from poisoning the AI generator.
- ✅ FIXED 2026-04-10: Automated Smart Classroom workflows implemented — `AICoordinator.generate_smart_prep()` orchestrates AI-driven lesson outlines, pop quizzes, and take-home assignments based on student progress records.
- ✅ FIXED 2026-04-10: Real-time Content Delivery established — Pop Quizzes and Lesson Notes can be launched by the teacher during a Live Session. They appear immediately on the student's screen via WebSockets (`FloatingContentModal.tsx`).
- ✅ FIXED 2026-04-10: Enhanced Reporting Architecture — Refactored `ReportService` to natively separate and track `live_pop_score` vs `pre_score`/`post_score`, affording teachers clear feedback loops on mid-lecture student comprehension.
- ✅ FIXED 2026-04-10: Persistent Session Content — Implemented synchronous Notification seeding within the WebSocket `push-content` endpoint to ensure shared lecture notes automatically store themselves in the student dashboard Inbox.
- ✅ FIXED 2026-04-11: Resolved critical Production OOM crashes by purging heavy dependencies (torch, pandas, matplotlib) and refactoring the backend into a "Lean Data" service.
- ✅ FIXED 2026-04-11: Launched high-fidelity interactive student analytics using Recharts, replacing static backend images with animated responsive components.
- ✅ FIXED 2026-04-11: Resolved 'Unable to connect' error on Vercel deployment by hardening backend CORS defaults and enhancing frontend API diagnostic logging.

## No open issues remain at this time.

## Self-update instructions for agents

At the END of every session, before stopping, you MUST:

1. Update the "Last updated" date at the top of this file
2. Add any new "never do" rules discovered this session to 
   the Critical rules section
3. Add any newly stable files to the Known stable files section
4. Update the Current open issues section to reflect what 
   was fixed and what remains
5. If a new API endpoint was created, add it to Architecture

Format for new critical rules:
- NEVER <do X> because <reason> (discovered <date>)

Format for fixed issues:
- ✅ FIXED <date>: <description>

Format for new issues:
- 🔴 OPEN: <description> — <file to fix>

DO NOT ask for permission to update this file.
DO NOT skip this step even if the session was short.
This file is the shared memory across all agents and sessions.