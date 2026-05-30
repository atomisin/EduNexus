export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | null;
export type View = 'landing' | 'login' | 'dashboard' | 'profile' | 'sessions' | 'reports' | 'analytics' | 'students' | 'settings' | 'subjects' | 'knowledge-graph' | 'messages';
export type EducationLevel = 'primary' | 'secondary' | 'professional';
export type LearningStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic';

export interface User {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  full_name?: string;
  role: UserRole;
  avatar?: string;
  avatar_url?: string;
  level?: string;
  subjects?: string[];
  status?: 'pending' | 'approved' | 'suspended';
  phone?: string;
  address?: string;
  bio?: string;
  gamification?: {
    xp?: number;
    level?: number;
    current_streak?: number;
    longest_streak?: number;
    streak?: number;
    badges?: string[];
    impact_score?: number;
  };
}

export interface StudentProfile {
  id: string;
  userId: string;
  learningStyle: LearningStyle;
  preferredPace: 'slow' | 'moderate' | 'fast';
  attentionSpan: number;
  bestStudyTime: 'morning' | 'afternoon' | 'evening';
  educationLevel: EducationLevel;
  schoolName: string;
  curriculumType: string;
  careerInterests: string[];
  strengthAreas: string[];
  weaknessAreas: string[];
  subjectProficiency: Record<string, number>;
}

export interface Session {
  id: string;
  title?: string;
  subject?: string;
  scheduled_at?: string;
  scheduled_start?: string;
  scheduledAt?: string;
  duration_minutes?: number;
  duration?: number;
  status: string;
  students?: number;
  maxStudents?: number;
  aiConfig?: AIConfig;
  subject_name?: string;
  topic_name?: string;
  session_outline?: any;
  class_notes?: any;
  take_home_assignment?: any;
  pre_session_quiz?: Quiz;
  post_session_quiz?: Quiz;
  student_access_code?: string;
  student_access_enabled?: boolean;
  context?: {
    subject?: string;
    topic?: string;
    session_plan?: SessionPlanSummary;
    assessment_artifacts?: Record<string, AssessmentArtifactSummary>;
    [key: string]: any;
  };
}

export interface SessionPlanSegment {
  segment_id: string;
  title: string;
  objective?: string;
  estimated_minutes?: number;
}

export interface SessionQuizMarker {
  marker_id: string;
  label: string;
  kind?: string;
  trigger_label?: string;
  focus_segment_id?: string;
}

export interface SessionPlanSummary {
  session_goal?: string;
  planned_segments?: SessionPlanSegment[];
  quiz_markers?: SessionQuizMarker[];
  skipped_segments?: SessionPlanSegment[];
  session_objectives?: string[];
  classwork_plan?: string[];
  quiz_plan?: { text: string; options?: string[] }[];
  assignment_plan?: {
    title?: string;
    instructions?: string;
    tasks?: string[];
    continuity_note?: string;
  };
  continuity_from_previous?: {
    previous_teacher_note?: string;
    previous_stop_segment?: string | null;
    next_recommended_segment?: string | null;
  };
  recommended_start_segment?: string | null;
  recommended_end_segment?: string | null;
  actual_stop_segment?: string | null;
  teacher_stop_note?: string;
  next_recommended_segment?: string | null;
  learner_difficulties?: string[];
  remaining_coverage?: string;
  next_class_priority?: string;
  validation?: {
    quiz?: { status?: string; issues?: string[] };
    assignment?: { status?: string; issues?: string[] };
  };
}

export interface AssessmentArtifactSummary {
  id?: string;
  status?: string;
  validated?: string;
  validation?: {
    status?: string;
    issues?: string[];
    used_fallback?: boolean;
    generation_issues?: string[];
  };
}

export interface SessionCompetencyUpdate {
  student_id: string;
  student_name: string;
  domain_name: string;
  course_name?: string;
  readiness?: 'Building' | 'Growing' | 'Steady' | string;
  assessment_state?: string;
  last_score_pct?: number;
  source_label?: string;
  gap_signals?: string[];
  next_focus?: string[];
  strength_areas?: string[];
  weakness_areas?: string[];
  suggested_focus_areas?: string[];
  updated_at?: string;
}

export interface AIConfig {
  llmEnabled: boolean;
  ttsEnabled: boolean;
  sttEnabled: boolean;
  autoExplain: boolean;
  suggestVideos: boolean;
  generateAssignments: boolean;
  llmModel: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  educationLevel: EducationLevel;
  curriculumType: string;
  gradeLevels: string[];
  description: string;
  topicCount: number;
  studentCount: number;
  color: string;
}


export interface Question {
  id: number | string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
}

export interface Quiz {
  title: string;
  questions: Question[];
}
