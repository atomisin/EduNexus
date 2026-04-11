export interface StudentProfile {
  id: string;
  user_id: string;
  student_id?: string;
  age?: number;
  learning_style?: string;
  preferred_pace?: string;
  attention_span_minutes?: number;
  best_study_time?: string;
  education_level: string;
  grade_level: string;
  school_name: string;
  curriculum_type: string;
  course_name?: string;
  department?: string;
  enrolled_subjects?: string[];
  guardian_name?: string;
  guardian_email?: string;
  desired_topics?: string[];
  subject_proficiency?: Record<string, number>;
  xp?: number;
  level?: number;
  current_streak?: number;
  longest_streak?: number;
  badges?: any[];
  gender?: string;
  avatar_url?: string;
  brain_power?: number;
  recharge_at?: string;
  seconds_until_recharge?: number;
}

export interface Session {
  id: string;
  title?: string;
  subject_name?: string;
  topic_name?: string;
  status: string;
  scheduled_start?: string;
  duration_minutes?: number;
  teacher_name?: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  color: string;
}

export interface ProgressData {
  total_sessions?: number;
  total_quizzes?: number;
  average_score?: number;
  summary?: {
    total_time_spent: number;
    total_quizzes: number;
    average_score: number;
  };
  chart_data?: any;
  recent_activities?: any[];
  subject_progress?: Record<string, number>;
}

export type ViewType = 'dashboard' | 'sessions' | 'subjects' | 'progress' | 'profile' | 'learn' | 'quiz' | 'messages' | 'mock-exams';
