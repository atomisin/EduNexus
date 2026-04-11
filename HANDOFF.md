# EduNexus 2.0 — Agent Handoff Document
# For: OpenCode or any capable coding agent
# Date: 26 March 2026
# Platform: Nigerian EdTech, FastAPI + React + 
#   PostgreSQL + Docker + LiveKit + Groq LLM

═══════════════════════════════════════════════
SECTION 1 — PLATFORM OVERVIEW
═══════════════════════════════════════════════

EduNexus 2.0 is a Nigerian educational platform.

Tech stack:
  Backend:  FastAPI + SQLAlchemy async + 
            PostgreSQL + pgvector
  Frontend: React + TypeScript + Vite + 
            Tailwind CSS + Shadcn/UI
  AI:       Groq LLM (llama-3.3-70b-versatile)
  Video:    LiveKit Cloud
  Storage:  SeaweedFS (S3-compatible)
  Infra:    Docker Compose (local dev)

Running services:
  postgres, redis, seaweedfs, api, frontend

Local URLs:
  Frontend: http://localhost:3000
  Backend:  http://localhost:8000
  API docs: http://localhost:8000/docs

Admin account:
  Email: tomisin@edunexus.com
  Password: Admin@Tomisin0411

Test teacher account:
  Email: teacher@edunexus.com
  Password: (active, role=teacher)

Test student account:
  Email: tomisin@edunexus.com (same as admin 
    but registered as student in test DB)
  Education level: primary_3 (Bello persona)

Key file paths:
  Backend endpoints: 
    backend/app/api/v1/endpoints/
  AI coordinator:
    backend/app/services/ai_coordinator.py
  Tutor personas:
    backend/app/services/tutor_persona.py
  Student dashboard:
    frontend/src/features/student/
      StudentDashboard.tsx
  Teacher dashboard:
    frontend/src/features/teacher/
      TeacherDashboard.tsx
  Admin panel:
    frontend/src/features/admin/AdminPanel.tsx
  API service:
    frontend/src/services/api.ts
  AI tutor hook:
    frontend/src/features/student/hooks/
      useAITutor.ts
  AI chat component:
    frontend/src/features/student/ai-tutor/
      AIChatSection.tsx

═══════════════════════════════════════════════
SECTION 2 — WHAT IS WORKING ✅
═══════════════════════════════════════════════

These features are confirmed working:

  ✅ Admin login and user management
  ✅ Student and teacher registration
  ✅ Admin approval flow (pending → active)
  ✅ Student login after approval
  ✅ Teacher login
  ✅ AI tutoring chat (Groq LLM)
  ✅ Adaptive personas (Sparky/Bello/Zara/
       Coach Rex/Dr. Ade) based on 
       education_level
  ✅ Student name injected in AI responses
  ✅ Nigerian analogies in tutor responses
  ✅ Gibberish detection (keyboard mashing 
       returns playful response)
  ✅ LiveKit session start (200 OK confirmed)
  ✅ Session GO LIVE NOW button navigates 
       to room
  ✅ RE-ENTER ROOM for live sessions
  ✅ Monthly reports page loads (reports.py 
       select shadow fixed)
  ✅ Analytics page (1 student, 45% shown)
  ✅ Subject enrollment (enroll/unenroll)
  ✅ Progress route ordering fixed 
       (/progress/summary now works)
  ✅ Mastery test endpoint (200 OK)
  ✅ Messages between teacher and student
  ✅ Brain Power depleted emoji fix 
       (no more surrogate crash)
  ✅ Admin N+1 query optimized with 
       selectinload
  ✅ <thinking> tag stripping from LLM output
  ✅ Token cap per persona 
       (TTS=80, Bello/Zara=300, 
        Rex=400, Dr.Ade=500)
  ✅ Subject cards in student AI tutor
  ✅ Teacher subjects dropdown (replaced tabs)
  ✅ 3-day streak tracking
  ✅ XP and Brain Power display on dashboard

═══════════════════════════════════════════════
SECTION 3 — KNOWN ISSUES TO FIX
═══════════════════════════════════════════════

These issues have been confirmed but not yet 
fully resolved. Fix them in priority order.

───────────────────────────────────────────────
ISSUE P1 — YouTube video recommendations 
not showing in AI tutor chat
───────────────────────────────────────────────

CONFIRMED ROOT CAUSE:
  The frontend hook fetchVideoSuggestions 
  is only triggered when the AI response 
  text contains the words "video" or "watch".
  It is never called on topic selection.
  
  Additionally, even when suggestedVideos 
  state has data, it may not be rendered 
  because the video card section in 
  AIChatSection.tsx either:
  a) Has a condition that always evaluates 
     false, OR
  b) suggestedVideos is not passed as a prop

Files to fix:
  frontend/src/features/student/hooks/
    useAITutor.ts
  frontend/src/features/student/ai-tutor/
    AIChatSection.tsx

What to do:
  1. Read backend/app/services/video_service.py
     and find the EXACT field names returned 
     by search_educational_videos(). 
     Do NOT guess field names.
  
  2. Confirm YOUTUBE_API_KEY is set:
       docker-compose exec api env | 
         findstr YOUTUBE
  
  3. In useAITutor.ts, find 
     handleSubtopicClick (or equivalent).
     After setting the active subtopic, 
     call fetchVideoSuggestions with the 
     subtopic name.
  
  4. In AIChatSection.tsx, add a video 
     cards section using the exact field 
     names from step 1. The section must 
     render below the chat messages, above 
     the input box. Show max 3 cards.
  
  5. Each card must be a clickable link 
     opening YouTube in a new tab.
  
  Evidence required:
    - Screenshot showing video cards 
      below the chat
    - Console log showing the API was called
    - npx tsc --noEmit exit 0

───────────────────────────────────────────────
ISSUE P1 — Mastery quiz not triggering 
automatically during AI tutoring
───────────────────────────────────────────────

CONFIRMED ROOT CAUSE:
  The mastery quiz component (AIMasteryTest.tsx)
  is fully built and works correctly with:
    - Multiple choice questions
    - 70% pass threshold
    - Pass: "Mastery Achieved!" + continue
    - Fail: "Review Missed Concepts" + retry
  
  It triggers when the AI response contains 
  [TRIGGER_MASTERY]. But the LLM does not 
  reliably include this tag.

Files to fix:
  backend/app/services/ai_coordinator.py

What to do:
  1. After getting the LLM response and 
     BEFORE returning it, count turns:
     
       turn_count = len([m for m in 
         conversation_history 
         if m.get('role') == 'user'])
       
       LOW_ENGAGEMENT = {
         'ok','k','yes','no','fine','sure',
         'okay','yeah','yep','nope','hmm',
         'cool','got it','alright','good',
         'nice','great','thanks','thank you'
       }
       
       engaged_turns = len([m for m in 
         conversation_history
         if m.get('role') == 'user'
         and len(m.get('content','').strip())>4
         and m.get('content','').strip().lower()
            not in LOW_ENGAGEMENT])
       
       if (turn_count >= 6 
           and engaged_turns >= 3
           and '[TRIGGER_MASTERY]' not in response):
           response += '\n\n[TRIGGER_MASTERY]'
  
  2. In useAITutor.ts, when the response 
     contains [TRIGGER_MASTERY]:
     - Strip the tag from displayed text
     - Set showMasteryTest to true
     
     Confirm these already work by grepping:
       grep -n "TRIGGER_MASTERY\|
         showMasteryTest" 
         frontend/src/features/student/hooks/
         useAITutor.ts
  
  Evidence required:
    - py_compile exit 0
    - Screenshot showing mastery quiz modal 
      appearing after a tutoring session

───────────────────────────────────────────────
ISSUE P1 — Chat history shared across all 
subjects and topics (must be isolated)
───────────────────────────────────────────────

CONFIRMED ROOT CAUSE:
  Chat is stored in StudentSubjectProgress 
  as a JSONB column called chat_history.
  But all messages go into a flat list 
  with no topic_name key, so switching 
  subjects or topics shows the same chat.

Files to fix:
  backend/app/api/v1/endpoints/ai.py
  frontend/src/features/student/hooks/
    useAITutor.ts

What to do:
  1. In the POST /ai/chat endpoint, when 
     saving to chat_history, key by topic:
     
       current = progress.chat_history or {}
       if isinstance(current, list):
           current = {"_legacy": current}
       
       key = topic_name or "general"
       topic_msgs = current.get(key, [])
       topic_msgs.append({
           "role": "user", 
           "content": user_msg
       })
       topic_msgs.append({
           "role": "assistant",
           "content": ai_response
       })
       topic_msgs = topic_msgs[-100:]
       current[key] = topic_msgs
       progress.chat_history = current
  
  2. Add GET /ai/chat-history endpoint:
       Returns messages for a specific 
       subject_id + topic_name combination.
       Returns empty list if none found.
       Validates subject_id is valid UUID 
       before querying.
  
  3. In useAITutor.ts, when a subtopic 
     is clicked:
     a. Call setMessages([]) immediately 
        to clear previous topic's chat
     b. Then fetch history for this topic
     c. If history exists, populate messages
     d. If no history, send the intro message
  
  Evidence required:
    - Chat with topic A
    - Switch to topic B — chat must be empty
    - Switch back to A — messages must reappear
    - Screenshot of each step
    - py_compile and tsc exit 0

───────────────────────────────────────────────
ISSUE P2 — Teacher dashboard stats 
show 0 (not wired to real data)
───────────────────────────────────────────────

Stats showing:
  Total Students: 0
  Active Sessions: 0
  Subjects: 86 (correct — all subjects)
  Impact Score: 0

CAUSE:
  The teacher_students table is empty — 
  no students are linked to the teacher.
  
  Also the stats endpoint may not be 
  correctly counting enrolled students.

Files to fix:
  backend/app/api/v1/endpoints/admin.py 
    or teachers.py

What to do:
  1. Check if teacher_students has rows:
       docker-compose exec -T postgres psql 
         -U postgres -d edunexus -c 
         "SELECT COUNT(*) FROM 
          teacher_students;"
  
  2. If empty, link the test teacher to 
     the test student:
       INSERT INTO teacher_students 
         (teacher_id, student_id)
       SELECT t.id, s.id
       FROM users t, users s
       WHERE t.role = 'teacher' 
         AND t.status = 'active'
         AND s.role = 'student'
         AND s.status = 'active'
       ON CONFLICT DO NOTHING;
  
  3. Confirm the dashboard stats endpoint 
     reads from teacher_students correctly.
  
  Evidence required:
    - SQL showing rows inserted
    - Screenshot showing Total Students > 0

───────────────────────────────────────────────
ISSUE P2 — Monthly report needs full 
visualization (charts)
───────────────────────────────────────────────

CURRENT STATE:
  Report shows "AI Generated Content Ready" 
  with a text description and a notes field.
  There are no charts or visual data.

REQUIRED:
  The report should show actual charts:
  - Quiz scores over time (line chart)
  - Subject mastery breakdown (bar chart)
  - Session attendance (calendar or count)
  - Brain Power usage trend

Files to fix:
  frontend/src/features/teacher/
    (find the report view component)

What to do:
  1. Find the report detail view component
  2. Add recharts (already in package.json) 
     visualizations using the student's 
     actual data from the API response
  3. The "Generate Current Month" button 
     should call the AI to generate the 
     report summary
  
  Evidence required:
    - Screenshot showing charts in the 
      report view

───────────────────────────────────────────────
ISSUE P2 — AI Configuration toggles 
in teacher dashboard not functional
───────────────────────────────────────────────

CURRENT STATE:
  The teacher dashboard shows toggles for:
    LLM Explanations
    Text-to-Speech
    Speech-to-Text
    Auto-Generate Explanations
    Suggest YouTube Videos
    Auto-Generate Assignments
  
  These are UI-only — toggling them does 
  nothing.

Files to fix:
  frontend/src/features/teacher/
    TeacherDashboard.tsx (or a settings 
    component it renders)
  backend (may need a teacher settings 
    endpoint)

What to do:
  1. Find where these toggles are rendered
  2. Check if there is a teacher settings 
     table in the DB:
       SELECT column_name FROM 
       information_schema.columns 
       WHERE table_name = 'teacher_profiles';
  
  3. If no settings column, add one:
       ALTER TABLE teacher_profiles 
       ADD COLUMN IF NOT EXISTS 
         ai_settings JSONB DEFAULT '{}';
  
  4. Create endpoint 
     PATCH /api/v1/teachers/settings 
     that saves ai_settings to teacher_profile
  
  5. Wire each toggle to call this endpoint
     on change and persist to DB
  
  Evidence required:
    - Toggle a setting, refresh the page,
      confirm it is still toggled
    - py_compile and tsc exit 0

───────────────────────────────────────────────
ISSUE P2 — Live session ends abruptly
───────────────────────────────────────────────

SYMPTOM:
  Teacher starts a session, connects to 
  LiveKit room, but the session ends 
  abruptly without any action.

LIKELY CAUSE:
  The LiveKit room TTL (time-to-live) is 
  set too short, or the session is being 
  marked as ended by the backend shortly 
  after creation.

Files to investigate:
  backend/app/services/livekit_service.py
  backend/app/services/session_manager.py

What to do:
  1. Read livekit_service.py and find 
     where the room is created. 
     Check the TTL/empty_timeout setting:
       grep -n "ttl\|empty_timeout\|
         max_participants\|room_config" 
         backend/app/services/
         livekit_service.py
  
  2. If empty_timeout is set to a low 
     value (< 300), increase it:
       empty_timeout=600  # 10 minutes
  
  3. Check if there is a scheduled job 
     that ends sessions:
       grep -n "end_session\|close_session\|
         SessionStatus.ENDED" 
         backend/app/services/
         session_manager.py
  
  Evidence required:
    - Screenshot of a session staying live 
      for more than 2 minutes
    - The LiveKit room config showing 
      updated TTL

───────────────────────────────────────────────
ISSUE P2 — Curriculum outline shared 
across all teachers for same topic
───────────────────────────────────────────────

REQUIREMENT:
  When a teacher creates a session for 
  "Primary 1 Mathematics - Fractions", 
  the AI-generated curriculum outline 
  should be the SAME for all teachers 
  teaching that subject + topic 
  combination. It should NOT regenerate 
  a different outline each time.
  
  Also, the system should track per-student 
  progress through the outline and continue 
  from the last stopping point in the next 
  session.

Files to fix:
  backend/app/api/v1/endpoints/ai.py 
    (breakdown endpoint)
  backend/app/models/ (may need new table)

What to do:
  1. Check if there is a curriculum_outlines 
     or subject_outlines table:
       SELECT table_name FROM 
       information_schema.tables 
       WHERE table_name LIKE '%outline%' 
       OR table_name LIKE '%curriculum%';
  
  2. If not, create one:
       CREATE TABLE IF NOT EXISTS 
       subject_outlines (
         id UUID PRIMARY KEY DEFAULT 
           gen_random_uuid(),
         subject_id UUID REFERENCES 
           subjects(id),
         topic_name VARCHAR(500),
         education_level VARCHAR(100),
         outline JSONB NOT NULL,
         created_at TIMESTAMPTZ DEFAULT NOW(),
         UNIQUE(subject_id, topic_name, 
                education_level)
       );
  
  3. In the POST /ai/breakdown endpoint:
     a. First check if an outline exists 
        for this subject + topic combination
     b. If yes, return the cached outline
     c. If no, generate it with the LLM 
        and save it for future use
  
  4. For session progress tracking, use 
     the existing StudentSubjectProgress 
     model to store the last completed 
     subtopic index.
  
  Evidence required:
    - Two different teacher accounts 
      getting the same outline for the 
      same subject/topic
    - py_compile exit 0

───────────────────────────────────────────────
ISSUE P3 — Parent details needed during 
student registration
───────────────────────────────────────────────

REQUIREMENT:
  During student registration, collect:
    - Parent/guardian full name
    - Parent/guardian email address
    - Parent/guardian phone number (optional)
  
  This is needed for:
    - Sending monthly reports to parents
    - Parent communication from teacher

Files to fix:
  frontend/src/components/auth/
    RegisterForm.tsx (or StudentRegister)
  backend/app/api/v1/endpoints/auth.py
  backend/app/models/student.py (may need 
    new fields)

What to do:
  1. Check what fields StudentProfile has:
       SELECT column_name FROM 
       information_schema.columns 
       WHERE table_name = 'student_profiles';
  
  2. If guardian_name/guardian_email 
     are missing, add migration:
       ALTER TABLE student_profiles 
       ADD COLUMN IF NOT EXISTS 
         guardian_name VARCHAR(200),
       ADD COLUMN IF NOT EXISTS 
         guardian_email VARCHAR(200),
       ADD COLUMN IF NOT EXISTS 
         guardian_phone VARCHAR(50);
  
  3. Add these fields to the SQLAlchemy 
     model in student.py
  
  4. Add the fields to the registration 
     form (only for student registration, 
     not teacher)
  
  5. Update the Pydantic schema to accept 
     these optional fields
  
  Evidence required:
    - Screenshot of registration form 
      showing guardian fields
    - Registered student with guardian 
      email in DB
    - py_compile and tsc exit 0

═══════════════════════════════════════════════
SECTION 4 — HOW TO VERIFY EACH FIX
═══════════════════════════════════════════════

After EVERY backend change:
  python -m py_compile <changed_file>
  echo "EXIT: $LASTEXITCODE"
  Must be 0.

After EVERY frontend change:
  npx tsc --noEmit
  echo "TSC: $LASTEXITCODE"
  Must be 0.

After ALL changes in a batch:
  npm run build
  echo "BUILD: $LASTEXITCODE"
  Must be 0.

To deploy frontend changes:
  docker-compose up -d --build frontend

The api container uses --reload so backend 
changes are live immediately after saving.

To check logs:
  docker-compose logs api --tail 30
  docker-compose logs frontend --tail 20

To check database:
  docker-compose exec -T postgres psql 
    -U postgres -d edunexus -c "YOUR_SQL"

═══════════════════════════════════════════════
SECTION 5 — DESIGN SYSTEM RULES
═══════════════════════════════════════════════

Colors — use CSS variables ONLY:
  Primary actions:  bg-primary 
                    text-primary-foreground
  Secondary:        bg-secondary 
                    text-secondary-foreground
  Accent (amber):   bg-accent 
                    text-accent-foreground
  Success:          emerald-600
  Warning:          amber-500
  Error:            destructive

FORBIDDEN colors (never use):
  indigo-*, blue-*, purple-*, violet-*
  Any hardcoded hex values in .tsx files

Typography:
  Headings: font-display (Plus Jakarta Sans)
  Body:     font-sans (Inter)

Border radius:
  Cards:   rounded-xl
  Buttons: rounded-lg
  Inputs:  rounded-lg
  Badges:  rounded-full

═══════════════════════════════════════════════
SECTION 6 — IMPLEMENTATION ORDER
═══════════════════════════════════════════════

Do these in this exact order:

BATCH A (unblock core learning flow):
  1. Chat history isolation (P1)
  2. Mastery quiz auto-trigger (P1)
  3. YouTube video recommendations (P1)

BATCH B (teacher functionality):
  4. Teacher dashboard stats wired (P2)
  5. AI configuration toggles saved (P2)
  6. Shared curriculum outlines (P2)
  7. Live session stability (P2)

BATCH C (data completeness):
  8. Parent details in registration (P3)
  9. Monthly report with charts (P2)

═══════════════════════════════════════════════
SECTION 7 — EVIDENCE REQUIREMENTS
═══════════════════════════════════════════════

For EACH completed fix, provide:

  1. The file(s) changed (full path)
  2. The specific lines changed 
     (before → after)
  3. py_compile or tsc exit code = 0
  4. A screenshot OR console output 
     confirming the fix works in browser
  5. For database changes: SQL output 
     showing the schema or rows affected

Do not declare a fix complete without 
ALL 5 pieces of evidence.

═══════════════════════════════════════════════
SECTION 8 — KNOWN STABLE FILES
(Do NOT modify these unless specifically 
instructed — they are working correctly)
═══════════════════════════════════════════════

  backend/app/api/v1/endpoints/auth.py
    (login flow is stable — do not touch)
  
  backend/app/services/tutor_persona.py
    (17 personas defined correctly)
  
  backend/app/services/livekit_service.py
    (LiveKit integration working)
  
  frontend/src/features/student/
    StudentDashboard.tsx
    (navigation groups working correctly)
  
  frontend/src/features/teacher/
    TeacherDashboard.tsx
    (navigation and avatar dropdown working)
  
  backend/app/api/v1/endpoints/admin.py
    (N+1 fixed, approval flow working)
  
  config/seaweedfs_s3.json
    (credentials set to minioadmin)
  
  frontend/src/index.css
    (design tokens correct — do not change)

═══════════════════════════════════════════════
SECTION 9 — DEPLOYMENT NOTES
═══════════════════════════════════════════════

Local development only right now.
Production deployment target: Railway + 
Supabase (not yet configured).

Docker compose file: docker-compose.yml
Frontend Dockerfile: frontend/Dockerfile
  (optimized with layer caching — 
   npm install is cached, rebuilds 
   take 2-3 minutes not 3 hours)

Backend .env location: backend/.env
Frontend .env location: frontend/.env
Root .env: only POSTGRES vars for docker

The api service mounts the backend 
code as a volume and uses uvicorn 
--reload, so Python changes are live 
immediately without rebuilding.

Frontend is built nginx — changes require:
  docker-compose up -d --build frontend