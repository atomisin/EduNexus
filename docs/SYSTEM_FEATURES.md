# EduNexus System Features

EduNexus 2.0 is a comprehensive, AI-powered private tutoring platform customized for the Nigerian context. It offers an expansive suite of features designed to enhance student engagement, automate teacher workloads, and personalize learning paths.

## Core Roles
- **Student (Child/Teen/Adult)**: Accesses personalized learning paths, interactive AI tutoring, video lessons, and gamified progress tracking.
- **Teacher/Tutor**: Manages subjects, creates learning materials, monitors student engagement via the dashboard, and initiates live teaching sessions.
- **Professional**: Specialized student role for adult learners taking private, isolated, proprietary courses without gamification distractions.

## 1. Smart Learning & AI Assistance

### AI Generalist
- **Omnipresent Chat Bot**: A floating interactive widget available across the dashboard.
- **Ultra-low Latency**: Powered by `llama-3.1-8b-instant`, it provides near-instantaneous, concise answers to general questions.
- **Conversion-Focused**: Redirects deep or curriculum-specific questions to the registration flow or the internal Learning Partner to encourage active enrollment.

### Zero-to-Hero Learning Partner (Tutor)
- **Context-Aware Assistance**: Embeds context about the currently viewed subject, specific topic, and the student's age group into the prompt.
- **Socratic Teaching Method**: Never just gives the answer. Instead, it breaks concepts down from the absolute basics, introduces technical terms gradually, uses culturally relevant Nigerian analogies, and asks follow-up questions to verify understanding.
- **Markdown & Code Support**: Fully renders complex markdown, bolding, and structured lists using dynamic React renderers.

### Automated Context Extraction & Content Generation
- **Automated Notes Extraction**: During live teaching sessions, the AI parses teacher audio streams securely via LiveKit and Whisper to generate live, beautifully formatted summary notes.
- **Concept Explanation Generation**: Teachers can generate 7 distinct types of explanations (Analogy, Visual, Step-by-Step, etc.) in real-time and broadcast them to connected student WebSockets for immediate review.

## 2. Curriculum & Material Management

### Subject Hierarchy
- **Syllabus Alignment**: Built-in support for standard Nigerian curricula including WAEC, NECO, and JAMB.
- **Structure**: Core Subject → Specific Topics → Individual Lessons/Subtopics.

### Smart Material Processing
- **Format Agnostic Uploads**: Supports uploading PDFs, DOCX, TXT, and Markdown files.
- **Non-blocking Extraction**: Uses IBM's Docling library to chunk and parse uploaded files in the background via Celery/Redis without freezing the frontend.
- **SeaweedFS Integration**: Instantly stores uploaded materials in an S3-compatible backend, ensuring high availability and seamless URL resolution directly to the frontend.
- **Access Control**: Materials can be isolated to specific invited students or made public.

### "Brain Power" Energy System
- **Gamified Usage Limits**: Students utilize "Brain Power" points to interact with the AI Learning Partner.
- **Consumption Logic**: Each AI response consumes 10 Brain Power points, encouraging deliberate and focused questions.
- **Reward Mechanisms**:
    - **Active Learning**: Watching suggested videos rewards the student with +25 Brain Power.
    - **Full Recharge**: Achieving a high score (Mastery) on specific tests fully restores Brain Power to 100%.

### Adaptive Gamification
- **Experience Points (XP)**: Earned through logging in, completing assessments, interacting with the AI, and finishing topics.
- **Streak Tracking**: Encourages daily platform usage.
- **Trophy/Badge System**: Visual milestones based on sustained topic mastery and XP thresholds.
- **Professional Override**: Gamification elements are cleanly stripped away for adult/professional learners to maintain a clean, distraction-free environment.

### Live Session Engagement (Teacher Dashboard)
- **Computer Vision Tracking**: Integrates client-side webcam monitoring (processed locally or via backend streams) to detect student faces, track gaze orientation, and generate an active "Attention Score" (0-100%).
- **Automated Alerts**: Alerts the teacher if a student looks away, switches browser tabs, or walks away from the camera.
- **Participation Metrics**: Tracks raised hands, questions asked, and chat messages in real time over WebSockets.

## 4. Assessment & Mastery

### Mastery Testing
- **Dynamic Quiz Generation**: Creates MCQs, Fill-in-the-blanks, and True/False questions directly from the student's recent chat history and syllabus materials.
- **Bloom's Taxonomy Validation**: Ensures questions generated span from basic recall to complex application.
- **Rule-Based Grading**: High-performance, deterministic evaluation logic ensures instant and accurate test scoring for immediate feedback.

## 5. Live Teaching Infrastructure

### Real-Time Video Conferencing
- **Integration**: Powered by LiveKit WebRTC for sub-50ms latency video and audio broadcasting.
- **Token Vending**: Edunexus backend completely handles secure, ephemeral room token generation.
- **Session Continuity**: Allows a teacher to seamlessly pause a session and resume it days later with all context, chat history, and generated notes perfectly intact.
