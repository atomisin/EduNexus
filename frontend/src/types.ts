export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | null;
export type View = 'landing' | 'login' | 'dashboard' | 'profile' | 'sessions' | 'materials' | 'reports' | 'analytics' | 'students' | 'settings' | 'subjects' | 'knowledge-graph' | 'messages';
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
  pre_session_quiz?: Quiz;
  post_session_quiz?: Quiz;
  student_access_code?: string;
  student_access_enabled?: boolean;
  context?: {
    subject?: string;
    topic?: string;
    [key: string]: any;
  };
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