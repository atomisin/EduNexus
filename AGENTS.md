# EduNexus 2.0 â€” Agent Context
Last updated: 2026-05-09 (Generalized AI Tutor Math Guard)

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

## Critical rules â€” ALWAYS follow
- After every Python change: python -m py_compile <file>
- After every frontend change: npx tsc --noEmit
- After a batch: npm run build
- Deploy frontend: docker-compose up -d --build frontend
- Backend uses --reload, changes are live immediately
- NEVER use indigo/blue/purple colors â€” use bg-primary only
- NEVER rename 'user' variable in auth.py login function
- NEVER add local 'from sqlalchemy import select' inside functions
- NEVER add custom @app.exception_handler() that returns JSONResponse without calling _add_cors_headers(request, resp) â€” exception handlers bypass CORSMiddleware entirely (discovered 2026-04-06)
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
- NEVER use `SameSite=Strict` or `SameSite=Lax` on production cookies when the frontend (Vercel) and backend (Render) are on different domains; use `SameSite=None` with `Secure=True` because cross-site requests silently drop Strict/Lax cookies (discovered 2026-04-21)
- ALWAYS wrap production `fetch()` calls with an `AbortController` timeout (25-30s) because Render free-tier cold starts can exceed mobile browser default timeouts, causing silent `TypeError: Failed to fetch` (discovered 2026-04-21)
- NEVER expose unauthenticated utility endpoints that send email or trigger external services because they can be abused for spam, cost, or reputation damage (discovered 2026-05-08)
- NEVER accept caller-supplied `student_id` values for engagement, proctoring, reports, or analytics without verifying the authenticated user is that student or owns the teacher/session relationship because it enables impersonation and cross-student data tampering (discovered 2026-05-08)
- ALWAYS make AI Tutor learning turns action-oriented with a visible next step because passive answer-only chat leaves students unsure how to continue learning (discovered 2026-05-08)
- ALWAYS transition AI Tutor `[TRIGGER_MASTERY]` directly into `quiz_active` because a confirmation state delays the mastery quiz and can leave the tutor in an inconsistent loading state after cancellation (discovered 2026-05-08)
- ALWAYS return structured AI Tutor UI actions from the backend for state transitions because hidden text markers are too fragile to drive critical learning flow (discovered 2026-05-08)
- ALWAYS let the platform own lesson stage transitions while the AI owns teaching language because open-ended chat alone cannot reliably guide students through teach/check/remediate/mastery progression (discovered 2026-05-09)
- NEVER unlock later lessons on request without a prerequisite placement check because progression overrides must prove understanding and recommend the safest starting lesson first (discovered 2026-05-09)
- NEVER ask tutor personas to emit `<thinking>` tags because student-facing math should show clear visible steps without leaking hidden reasoning or conflicting with response sanitization (discovered 2026-05-09)
- NEVER trust client-supplied placement recommendations or partial placement answers because lesson unlocks must be derived, signed, and verified server-side before progress is mutated (discovered 2026-05-09)
- NEVER add machine-specific absolute paths to `.gitignore` because ignore rules must work across every developer and deployment environment (discovered 2026-05-09)
- ALWAYS use the same browser hostname for local frontend and backend cookie auth, preferably `localhost` for both, because mixing `localhost` and `127.0.0.1` can cause SameSite=Lax HttpOnly cookies to be omitted after login (discovered 2026-05-09)
- ALWAYS type FastAPI response-model UUID fields as `uuid.UUID` or explicitly serialize them before returning ORM objects because Pydantic v2 will reject raw UUID objects for `str` fields (discovered 2026-05-09)
- ALWAYS expand explicit revision lessons such as `REVISION OF SS1 WORK` into the referenced previous-class subject topics for AI tutoring and placement checks because first-week revision lessons often have no same-subject prerequisites (discovered 2026-05-09)
- NEVER rely on visual lesson locks alone because alternate topic-selection paths and direct AI chat requests can bypass UI-only progression rules; guard topic selection and `/ai/chat` with lesson unlock state (discovered 2026-05-09)
- ALWAYS render AI Tutor math through `MathText`/KaTeX and prompt the model to use LaTeX delimiters because raw notation like `1 x 10^2` is not acceptable for student-facing math (discovered 2026-05-09)
- ALWAYS route student-facing academic notation through the shared academic text normalizer and MathText/KaTeX because STEM, accounting, and technical subjects need professional display and speakable output (discovered 2026-05-09)
- ALWAYS normalize malformed AI math such as `((10^{3}) = 1000)` and `(\log_{10} 1000 = 3)` before rendering because LLMs may produce near-LaTeX that KaTeX will not parse as math (discovered 2026-05-09)
- NEVER build placement unlock checks from lesson metadata or topic descriptions alone because students must prove usable subject competence with answerable, server-scored questions (discovered 2026-05-09)
- ALWAYS keep the student dashboard shell responsive with a mobile-first sidebar and `min-w-0` content containers because fixed navigation can clip learning screens on tablet-sized viewports (discovered 2026-05-09)
- ALWAYS keep the teacher dashboard shell aligned with the student shell responsive rules because teachers use the same tablet-sized local browser and live-class workflow constraints (discovered 2026-05-09)
- NEVER show the floating Smart Helper inside the dedicated AI Tutor route because competing assistant surfaces confuse the student learning workflow (discovered 2026-05-09)
- NEVER leave debug console logging in student-facing learning screens because it adds noise during QA and can expose implementation details in production builds (discovered 2026-05-09)
- ALWAYS keep admin, teacher, and student dashboards on the same responsive shell density and primary-token palette because inconsistent role surfaces make the platform feel unfinished (discovered 2026-05-09)
- ALWAYS split heavyweight frontend vendors with precise package-path manual chunks because substring-based chunk rules can create circular chunks and oversized bundles (discovered 2026-05-09)
- ALWAYS normalize admin analytics API responses at the UI boundary when backend field names are legacy-compatible aliases because tab panels should not crash on shape drift (discovered 2026-05-09)
- ALWAYS use wrapping or grid tab navigation for dense admin dashboards because horizontal tab strips clip on tablet-width operator screens (discovered 2026-05-09)
- ALWAYS keep the core student learning surfaces on compact academic rows, 8px radii, primary-token colors, and restrained shadows because oversized decorative tutor cards make the learning workspace feel less professional (discovered 2026-05-09)
- ALWAYS wire AI Tutor TTS/STT into the dedicated tutor input rather than relying on Smart Helper because the helper is intentionally hidden on the AI Tutor route (discovered 2026-05-09)
- ALWAYS show the full cold-start login message when the backend is waking because terse labels like "Connecting to server..." look broken to students and parents (discovered 2026-05-09)
- NEVER dispatch login cold-start UI events before every login attempt because a reachable backend can return valid credential errors and the UI must not mislabel 401 Unauthorized as server wake-up (discovered 2026-05-09)
- ALWAYS clear and refetch AI Tutor recommended videos from the selected topic and active subject because stale subject state or empty results can make videos appear frozen across topic changes (discovered 2026-05-09)
- ALWAYS normalize copied Unicode/math-layout artifacts such as stacked `log ⁡ 10 1000` and `a × 10 n` before KaTeX rendering because LLMs and pasted math can split expressions across lines (discovered 2026-05-09)
- NEVER normalize `log` inside plain words such as `logarithm` or `logarithms` because English terms must not be treated as KaTeX log expressions (discovered 2026-05-09)
- NEVER convert natural-language phrases like `log of wood` into math because `log` is also valid English/domain vocabulary outside logarithm notation; require math-shaped base and argument tokens first (discovered 2026-05-09)
- NEVER ask learners to express a logarithm value itself in standard form when teaching logarithms and standard form because that confuses number notation with logarithm evaluation; ask for number standard form or logarithm characteristic instead (discovered 2026-05-09)
- NEVER patch AI Tutor pedagogy with one-off lesson examples when a pattern-based correction is possible because curriculum wording varies across subjects, terms, and classes (discovered 2026-05-09)

## Architecture
Backend:  backend/app/api/v1/endpoints/
AI:       backend/app/services/ai_coordinator.py
Revision Context: backend/app/services/revision_context.py
Personas: backend/app/services/tutor_persona.py
Frontend: frontend/src/features/
API svc:  frontend/src/services/api.ts
AI hook:  frontend/src/features/student/hooks/useAITutor.ts
Voice hooks: frontend/src/features/student/hooks/useTTS.ts, frontend/src/features/student/hooks/useSpeechRecognition.ts
Mock Exams: backend/app/api/v1/endpoints/mock_exams.py
Mock Engine: frontend/src/features/student/learning/MockExamEngine.tsx
Math Render: frontend/src/components/MathText.tsx
Academic Text: frontend/src/utils/academicText.ts
Student Layout: frontend/src/features/student/components/
Performance Charts: frontend/src/features/student/components/PerformanceCharts.tsx (Recharts library)
App Routes:     frontend/src/routes/
Session Modals: frontend/src/components/session/FloatingContentModal.tsx
Placement Unlock: backend/app/api/v1/endpoints/student_progress.py (`/student/progress/placement/start`, `/submit`, `/accept`)

## Known stable files â€” do not modify unless instructed
- backend/app/api/v1/endpoints/auth.py (login is stable)
- backend/scripts/force_sync_db.py (Schema builder is stable)
- backend/scripts/master_seed.py (Account seeding is stable)
- backend/app/services/tutor_persona.py (17 personas correct)
- frontend/src/index.css (design tokens correct)
- config/seaweedfs_s3.json (credentials = minioadmin)
- frontend/src/components/MathText.tsx (KaTeX math renderer)
- frontend/src/types/speech.d.ts (Shared Web Speech API declarations)
- frontend/src/utils/academicText.ts (Shared display and speech normalization for academic notation)
- frontend/src/App.tsx (Modular routing architecture with code-splitting)
- frontend/src/features/student/StudentDashboard.tsx (De-mega-fied layout)
- backend/app/models/user.py (Consolidated TeacherStudent model)
- backend/app/api/v1/endpoints/students.py (Self-healing logic stable)
- frontend/src/features/landing/LandingPage.tsx (Mobile-responsive & lazy loaded)
- frontend/src/components/auth/LoginForm.tsx (Cold-start-aware login UX)
- frontend/src/features/admin/AdminPanel.tsx (Responsive admin operations shell)
- frontend/vite.config.ts (Production manual chunking for large frontend vendors)
- frontend/src/components/auth/RegistrationForm.tsx (Hardened subject selection)
- backend/app/services/chart_generator.py (Now returns JSON)
- backend/app/api/v1/endpoints/student_progress.py (Refactored to JSON)
- frontend/src/features/student/dashboard/ProgressView.tsx (Refactored for Recharts)
- backend/app/core/config.py (Enhanced CORS for mobile LAN)
- docker-compose.yml (Local dev frontend/API hostnames aligned for cookie auth)
- backend/app/services/revision_context.py (Previous-class revision resolver for tutor and placement flows)

## Current open issues
See HANDOFF.md for full details on remaining bugs.
- âœ… FIXED 2026-04-05: Topic model display_order attribute error in curriculum generation preventing standard subjects from loading during registration
- âœ… FIXED 2026-04-05: Resolved subject data leakage where students could see all platform subjects when fetching their own dashboard due to a missing filter condition in the /subjects endpoint
- âœ… FIXED 2026-04-05: Resolved AI Tutor chat message duplication by implementing a race-condition lock and functional state updates in useAITutor.ts
- âœ… FIXED 2026-04-05: Performed system-wide cleanup of non-admin users and their relative data (profiles, progress, logs) to ensure a fresh start while preserving the core administrator account.
- âœ… FIXED 2026-04-05: Enforced strict data isolation for professional subjects in `subjects.py` and remediated existing database records to prevent global curriculum leakage.
- âœ… FIXED 2026-04-05: Explicitly blocked teachers and admins from making professional subjects public.
- âœ… FIXED 2026-04-05: Resolved AI Tutor topic hallucination and context-switching bugs by injecting explicit topic metadata into the system prompt and refactoring persona Math biases.
- âœ… FIXED 2026-04-06: Mock Exams sidebar visibility and KaTeX math rendering integrated into MockExamEngine with 10 sample WAEC questions.
- âœ… FIXED 2026-04-06: 50+ question template generator created for Mathematics, Physics, Chemistry, Biology, and English (`seed_extended_mock_exams.py`).
- âœ… FIXED 2026-04-06: Multi-subject JAMB combo backend endpoints (`/combo-attempt`, `/combo-submit`) implemented to support bulk operations.
- âœ… FIXED 2026-04-06: Frontend `ComboExamEngine.tsx` created to simulate the authentic multi-tab, unified timer JAMB CBT environment.
- âœ… FIXED 2026-04-06: `Department` mapping and `Guardian` contact details added to student registration flow. Only surfaces Department for SS1-SS3 students. Mock exam dashboards restrict subject visibility heavily based on precise department matching.
- âœ… FIXED 2026-04-06: Redundant `TeacherStudentLink` model consolidated into unified `TeacherStudent` model across all services, scripts, and endpoints.
- âœ… FIXED 2026-04-06: `StudentDashboard.tsx` and `App.tsx` de-mega-fication completed; extracted layout components and feature-specific routes.
- âœ… FIXED 2026-04-06: Parent Dashboard deprecated; reports now delivered solely via automated approve/send email flow for security/UX.
- âœ… FIXED 2026-04-06: "Login twice" race condition resolved by ensuring `AuthContext` initialization synchronizes with `localStorage` state.
- âœ… FIXED 2026-04-06: Production performance hardening: HNSW (Lantern) vector index implemented for RAG; eliminated N+1 queries in `api/v1/auth/me`.
- âœ… FIXED 2026-04-06: Curriculum seeding confirmed working â€” 277 Nigerian National Curriculum subjects across Primary 1-6, JSS1-3, SS1-3 seeded via `seed_curriculum.py` raw SQL (no ORM mapper issue remains).
- âœ… FIXED 2026-04-06: Admin Panel CORS error resolved â€” custom FastAPI exception handlers (401, 403, 500) now inject CORS headers via `_add_cors_headers()` helper in `backend/app/main.py`, fixing browser block on admin user verification.
- âœ… FIXED 2026-04-06: Resolved 500 Internal Server Error during login caused by a `teacher_students.status` schema mismatch and cleaned up stale `teacher_student_link` references in Alembic `env.py`.
- âœ… FIXED 2026-04-06: Corrected Pydantic response validation error in `/api/v1/admin/users` endpoint by defining `UserListResponse.full_name` as `Optional[str]` to align with the DB schema where it can be `None`.
- âœ… FIXED 2026-04-06: Extracted mapping configuration in the Student Registration form to expose and process "Field of Study / Department" alongside Subject selection for Exam Prep students (WAEC, NECO, JAMB), resolving the visibility bug that restricted their enrollment scope.
- âœ… FIXED 2026-04-06: Fixed UI overflow causing unselectable Exam subjects and mapped SS1-SS3 students to inherit Base Mandatory Subjects (English, Maths, Civic).
- âœ… FIXED 2026-04-06: Resolved 500 status on `/auth/login` by adding robust `user is None` check.
- âœ… FIXED 2026-04-06: Implemented `EDUCATION_LEVEL_MAP` for correctly filtering subjects by grade level (ss_1 to senior_secondary, etc).
- âœ… FIXED 2026-04-06: Automated professional student subject creation and AI-driven curriculum generation during registration.
- âœ… FIXED 2026-04-06: Updated authorization guard on `POST /subjects/` to allow professional students to create custom courses for themselves.
- âœ… FIXED 2026-04-07: Resolved subject filtering bug in `get_subjects` by auto-detecting `education_level` and `grade_level` from student profiles.
- âœ… FIXED 2026-04-07: Implemented frontend dashboard redirects from `/` and `/login` for authenticated users in `App.tsx` and `LoginPage.tsx`.
- âœ… FIXED 2026-04-07: Resolved "self-healing" crash in `students.py` caused by missing `or_` import.
- âœ… FIXED 2026-04-07: Cleaned up `adascience` and `examstudent` test accounts and all associated professional subjects/topics.
- âœ… FIXED 2026-04-07: Resolved global "No subjects available" bug by implementing `NULL` safe `is_private` filtering and robust `education_level` mapping in `subjects.py`.
- âœ… FIXED 2026-04-07: Enhanced `map_grade_level` to handle diverse input formats ("Primary 4" -> "P4") ensuring Primary/JSS track visibility.
- âœ… FIXED 2026-04-07: Verified end-to-end self-healing mechanism (String Name -> Subject UUID conversion) for all educational levels.
- âœ… FIXED 2026-04-07: Resolved subject overflow issue where SS1 students saw SS2/SS3 subjects by deriving grade_level from education_level when grade was NULL in `subjects.py`.
- âœ… FIXED 2026-04-07: Deleted 693 garbage topics (CLASS/SUBJECT/TERM/TOPICS) incorrectly seeded from CSV headers.
- âœ… FIXED 2026-04-07: Refactored topic grouping by adding a formal `term` column to the Database (`First Term`, `Second Term`, `Third Term`) and updating the frontend `AIChatSection.tsx` to group topics via mapped headers.
- âœ… FIXED 2026-04-07: Verified standard WAEC/NECO/JAMB mock exam subjects correctly populate via the robust `EDUCATION_LEVEL_MAP` mechanism mapped over the `curriculum_type`.
- âœ… FIXED 2026-04-07: Refactored `<StudentDashboard />` navigation state to be driven purely by `react-router-dom` URL paths (e.g. `/student/learn`, `/student/subjects`).
- âœ… FIXED 2026-04-07: Verified the YouTube recommended videos algorithm works via a valid `YOUTUBE_API_KEY` injected into `.env`.
- âœ… FIXED 2026-04-08: Implemented dedicated exam curricula for JAMB, WAEC, and NECO, separating them from standard secondary subjects to ensure syllabus accuracy and topic isolation.
- âœ… FIXED 2026-04-08: Hardened student enrollment logic to prioritize curriculum-specific subjects during self-healing and prevent fallback to primary school curriculum for exam-track students.
- âœ… FIXED 2026-04-09: Resolved persistent landing page navigation bug where visitors were forced to the login screen with a "Session expired" toast.
- âœ… FIXED 2026-04-09: Hardened cross-track subject enrollment healing, ensuring Mathematics, English, etc., correctly resolve to track-specific IDs (JAMB/WAEC/NECO) across all grade levels.
- âœ… FIXED 2026-04-09: Resolved "Empty Dashboard" and "Empty Practice Center" issues for specialized tracks by reconciling `MockExamSeries` database links to point to syllabus-accurate subject IDs.
- âœ… FIXED 2026-04-10: Implemented floating Sign In and Get Started modals on the landing page for a seamless, premium entry experience.
- âœ… FIXED 2026-04-10: Hardened Authentication Security by enforcing bcrypt hash verification on login and exposing tokens for frontend persistence.
- âœ… FIXED 2026-04-10: Resolved fatal React crash in Student Registration by refactoring subject selection with functional state updates and resilient UI patterns.
- âœ… FIXED 2026-04-10: Resolved track-specific sidebar filtering (hiding Practice for Exam students, hiding Mock Exams for Standard students).
- âœ… FIXED 2026-04-10: Resolved Admin Login failure (500 Error) by migrating legacy plain-text password to identified bcrypt hash.
- âœ… FIXED 2026-04-10: Consolidated legacy `Economics` subject duplicates (`SEC-ECO-001` -> `ss2-economics`) and migrated student enrollments/topic progress via raw SQL array operations.
- âœ… FIXED 2026-04-10: Overhauled `StudentDashboard` layout to fix sidebar/header during scrolling and implemented "Ancor to Bottom" AI Tutor chat input.
- âœ… FIXED 2026-04-10: Modernized authentication flow by deprecating standalone `/login` and `/register` pages in favor of landing page floating modals with deep-link support (`/?auth=login`).
- âœ… FIXED 2026-04-10: Increased AI Tutor chat message area by compacting the input section and button padding.
- âœ… FIXED 2026-04-10: Resolved Practice Quiz "Master Test" redirection bug by correctly passing and calling the `startQuiz` trigger across the routing layers.
- âœ… FIXED 2026-04-10: Expanded AI Tutor layout to ultra-wide (max-w-6xl) and removed outer margins to maximize chat visibility.
- âœ… FIXED 2026-04-10: Resolved Mastery Test blank page infinite loop by correctly propagating `dismissQuizConfirm` to handle assessment cancellation/errors.
- âœ… FIXED 2026-04-10: Shrunk AI Tutor header (reduced padding, smaller avatar/title) to maximize vertical space for chat history.
- âœ… FIXED 2026-04-10: Resolved "Could not generate test questions" error by implementing a "Metadata Lock" on `startQuiz` to prevent fallback strings from poisoning the AI generator.
- âœ… FIXED 2026-04-10: Automated Smart Classroom workflows implemented â€” `AICoordinator.generate_smart_prep()` orchestrates AI-driven lesson outlines, pop quizzes, and take-home assignments based on student progress records.
- âœ… FIXED 2026-04-10: Real-time Content Delivery established â€” Pop Quizzes and Lesson Notes can be launched by the teacher during a Live Session. They appear immediately on the student's screen via WebSockets (`FloatingContentModal.tsx`).
- âœ… FIXED 2026-04-10: Enhanced Reporting Architecture â€” Refactored `ReportService` to natively separate and track `live_pop_score` vs `pre_score`/`post_score`, affording teachers clear feedback loops on mid-lecture student comprehension.
- âœ… FIXED 2026-04-10: Persistent Session Content â€” Implemented synchronous Notification seeding within the WebSocket `push-content` endpoint to ensure shared lecture notes automatically store themselves in the student dashboard Inbox.
- âœ… FIXED 2026-04-11: Resolved critical Production OOM crashes by purging heavy dependencies (torch, pandas, matplotlib) and refactoring the backend into a "Lean Data" service.
- âœ… FIXED 2026-04-11: Launched high-fidelity interactive student analytics using Recharts, replacing static backend images with animated responsive components.
- âœ… FIXED 2026-04-11: Resolved 'Unable to connect' error on Vercel deployment by hardening backend CORS defaults and enhancing frontend API diagnostic logging.
- âœ… FIXED 2026-04-12: Hardened backend Docker build against ReadTimeoutErrors by increasing pip default timeout and ensuring pip is upgraded during construction.
- âœ… FIXED 2026-04-12: Resolved persistent UndefinedColumnError (500) during login by writing custom schema patch SQL scripts for missing `attention_span` and `teacher_students.notes` columns that were skipped by `Base.metadata.create_all()`.
- âœ… FIXED 2026-04-12: Hardened SQLAlchemy model relationships by importing all database models in `app/db/database.py` and invoking `Base.registry.configure()`, preventing "Zombie" name-resolution crashes.
- âœ… FIXED 2026-04-16: Implemented granular LLM Token Attribution by propagating `user_id` across `LLMService`, `AICoordinator`, and all AI API endpoints.
- âœ… FIXED 2026-04-16: Enhanced Admin Usage endpoint to provide daily cost/token trends and top user consumption metrics.
- âœ… FIXED 2026-04-16: Launched "AI Usage & Cost" dashboard in the Admin Panel using Recharts for high-fidelity interactive resource monitoring.
âœ… FIXED 2026-04-16: Resolved mobile navigation visibility by implementing a responsive "Hamburger" menu on the landing page.
âœ… FIXED 2026-04-16: Hardened platform performance by implementing aggressive code-splitting (React.lazy) for auth modules and top-level routes.
âœ… FIXED 2026-04-16: Enhanced backend CORS configuration to support local network (LAN) IP addresses for mobile device testing.
- âœ… FIXED 2026-04-21: Resolved mobile "Failed to fetch" on login by adding fetch timeout (AbortController), retry logic (2 attempts with server-waking UI), and fixing cross-domain cookie `SameSite=Strict` â†’ `SameSite=None` for Vercelâ†”Render production setup.

- âœ… FIXED 2026-05-08: Added an unsafe-method origin guard for credentialed API requests to reduce CSRF exposure on cross-domain cookie authentication.
- âœ… FIXED 2026-05-08: Removed login response bearer tokens from frontend persistence by relying on HttpOnly cookies instead of localStorage token fallback.
- âœ… FIXED 2026-05-08: Admin-protected the SMTP test email utility to prevent unauthenticated email abuse.
- âœ… FIXED 2026-05-08: Hardened engagement/video-frame submission to derive student identity from the authenticated user and require session enrollment.
- âœ… FIXED 2026-05-08: Restricted messaging contact search and direct messages to admins and explicit teacher-student relationships.
- âœ… FIXED 2026-05-08: Added teacher ownership checks around student recommendations and report approval, and added a 100MB admin material upload limit.
- âœ… FIXED 2026-05-08: Improved the AI Tutor student learning experience with guided lesson prompts, a next-learning-move panel, stronger context handling, cleaner AI marker stripping, and a tutor prompt that teaches one step at a time.
- âœ… FIXED 2026-05-08: Confirmed and fixed mastery quiz triggering so `[TRIGGER_MASTERY]` immediately opens the mastery modal, removes the visible trigger marker from chat, and returns cleanly to idle on cancellation.
- âœ… FIXED 2026-05-08: Replaced mastery-confirmation state with structured `ui_action` handling, removed conflicting AI control-marker prompt rules, and made subtopic mastery evaluation update legacy and current roadmap progress keys.
- âœ… FIXED 2026-05-09: Added a deterministic AI Tutor lesson controller for teach/check/practice/remediate/mastery stages, passed lesson context into chat, surfaced the active lesson stage in the learning UI, and added fallback mastery questions plus richer fallback subtopic outlines.

- âœ… FIXED 2026-05-09: Added placement-based locked lesson unlocks with prerequisite checks, score-based start recommendations, learner acceptance, and topic unlock updates from the recommended lesson.
- âœ… FIXED 2026-05-09: Tightened AI Tutor prompts with a stage-specific teaching contract, one-action-per-turn lesson flow, stronger mastery trigger discipline, and persona math rules that avoid hidden reasoning tags.
- âœ… FIXED 2026-05-09: Hardened placement unlocks by requiring enrolled-subject access, full prerequisite answer coverage, server-derived signed placement tokens, and stricter mastery readiness gating.
- âœ… FIXED 2026-05-09: Normalized `.gitignore` with portable production hygiene rules for local agent workspaces, caches, logs, temporary files, reports, and generated build artifacts.

- âœ… FIXED 2026-05-09: Aligned local Docker frontend API and app base URLs to `localhost` so HttpOnly auth cookies survive the immediate post-login `/auth/me` and dashboard requests.
- âœ… FIXED 2026-05-09: Fixed `/api/v1/auth/me` response validation by typing `UserResponse.id` as `uuid.UUID`, preventing post-login session bootstrap from crashing.
- âœ… FIXED 2026-05-09: Added previous-class revision awareness so lessons like `REVISION OF SS1 WORK` load SS1 source topics into the AI Tutor prompt and generate placement questions from representative SS1 concepts.
- âœ… FIXED 2026-05-09: Enforced lesson locks at AI Tutor entry points so locked lessons show a current-lesson redirect message and `/api/v1/ai/chat` rejects locked topic tutoring requests.
- âœ… FIXED 2026-05-09: Routed AI Tutor chat math through KaTeX via `MathText`, normalized common scientific notation such as `1 x 10^2`, and instructed the tutor prompt to emit LaTeX math.
- âœ… FIXED 2026-05-09: Added shared academic notation normalization for display and speech across AI Tutor, Smart Helper, live content, mastery tests, and existing `MathText` consumers.
- âœ… FIXED 2026-05-09: Replaced metadata-style placement unlock prompts with deterministic subject-aware competency questions for technical and professional subjects, with server-side scoring and KaTeX rendering in the unlock modal.
- âœ… FIXED 2026-05-09: Hardened `MathText` so non-string React children cannot crash the AI Tutor render path when lesson, placement, or markdown content updates after a click.
- âœ… FIXED 2026-05-09: Extended academic notation normalization to render malformed AI tutor near-LaTeX such as `((10^{3}) = 1000)` and `(\log_{10} 1000 = 3)`.

- âœ… FIXED 2026-05-09: Professionalized the student UI shell with responsive sidebar behavior, a compact header, calmer Subjects and Progress views, a cleaner AI Tutor subject picker, accessible landing auth dialog metadata, and hidden duplicate Smart Helper on the AI Tutor route.
- âœ… FIXED 2026-05-09: Professionalized the teacher UI shell with responsive navigation, compact dashboard/header spacing, calmer session/report/subject/analytics surfaces, accessible collapsed sidebar labels, and removal of banned blue/indigo/violet/purple styling from teacher feature screens.
- âœ… FIXED 2026-05-09: Professionalized the admin panel and landing page with compact responsive surfaces, a full-bleed landing hero image, cleaned academic copy encoding, lowercase-safe role stats, and primary-token admin cards/tabs.
- âœ… FIXED 2026-05-09: Split frontend production bundles into precise route and vendor chunks for LiveKit, charts, academic rendering, UI primitives, icons, motion, routing, and core React, removing oversized generic chunks and circular chunk warnings.
- âœ… FIXED 2026-05-09: Fixed the Admin AI Usage & Cost tab blank screen by normalizing `/admin/usage` response aliases and guarding zero-token attribution percentages before rendering Recharts and summary cards.
- âœ… FIXED 2026-05-09: Hardened the Admin dashboard tabs with a responsive grid tab list, lowercase-safe role filtering, safer loading cleanup, and defensive teacher/material row rendering for missing or legacy-shaped API data.
- âœ… FIXED 2026-05-09: Re-audited the student learning checklist and normalized the AI Tutor, mastery quiz, subject rows, and progress analytics surfaces by removing oversized radii, heavy shadows, old gradients, decorative quick-action copy, and banned hue classes from the core learning workspace.

- ✅ FIXED 2026-05-09: Restored AI Tutor voice support by adding dedicated speech-to-text input, manual listen controls for AI responses, young-learner auto-read behavior, and shared Web Speech API typings across voice components.

- ✅ FIXED 2026-05-09: Updated the login cold-start UX so the server-waking state consistently says "Connecting to server — free hosting can take up to 60 seconds on cold start. Please wait..." and removed non-standard login form styling from the affected fields.

- ✅ FIXED 2026-05-09: Corrected login cold-start handling so invalid credentials no longer show as server wake-up, and reset the local `ss2student@example.com` account password to `@Tommie03` for testing.

- ✅ FIXED 2026-05-09: Restored AI Tutor recommended video refresh on topic and subtopic selection by clearing stale videos, using the selected subject directly, and ignoring out-of-order video responses.

- ✅ FIXED 2026-05-09: Hardened academic math normalization so AI Tutor output like stacked standard form, exponent equations, and split logarithm notation render through KaTeX instead of plain multiline text.

- ✅ FIXED 2026-05-09: Tightened AI Tutor log-expression normalization so plain words like `logarithm` and natural phrases like `log of wood` remain text while copied split expressions such as `log ⁡ 10 1000` still render through KaTeX.

- ? FIXED 2026-05-09: Tightened AI Tutor mathematics pedagogy for logarithm revision so awkward scheme wording is rewritten, duplicated objectives are discouraged, and invalid prompts like asking for `log(10)` in standard form are replaced with proper standard-form/log-characteristic checks.

- ? FIXED 2026-05-09: Generalized the AI Tutor logarithm cleanup so invalid `log(x)` standard-form tasks are rewritten from the captured expression instead of a hardcoded example.

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
- âœ… FIXED <date>: <description>

Format for new issues:
- ðŸ”´ OPEN: <description> â€” <file to fix>

DO NOT ask for permission to update this file.
DO NOT skip this step even if the session was short.
This file is the shared memory across all agents and sessions.
