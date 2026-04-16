const raw_api_url = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000/api/v1' 
    : 'https://edunexus-krb1.onrender.com/api/v1');

// Automatically append /api/v1 if missing to prevent 404 errors
const API_BASE_URL = raw_api_url.includes('/api/v1') 
  ? raw_api_url 
  : `${raw_api_url.replace(/\/$/, '')}/api/v1`;

// Generic fetch wrapper with credentials (HttpOnly Cookies)
export async function fetchWithAuth(endpoint: string, options: RequestInit & { silentAuth?: boolean } = {}) {
  const { silentAuth, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Add Authorization header if token exists in localStorage (C-05 fallback)
  const token = localStorage.getItem('edunexus_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const targetUrl = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(targetUrl, {
      ...fetchOptions,
      headers,
      credentials: 'include', // CRITICAL: Send cookies with request
    });

    if (!response.ok) {
      if (response.status === 401 && !silentAuth) {
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
      const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
      throw new Error(error.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  } catch (err: any) {
    // Distinguish between API errors and Network/CORS errors
    if (err.name === 'TypeError' || err.message?.includes('Failed to fetch')) {
      const errorMsg = `🚨 Network Error: Failed to reach ${targetUrl}.`;
      console.error(errorMsg, err);
      // Dispatch custom event so App.tsx can show a visible diagnostic toast
      window.dispatchEvent(new CustomEvent('api:fetch_failed', { 
        detail: { url: targetUrl, error: err.message } 
      }));
    }
    throw err;
  }
}

// Auth API
export const authAPI = {
  // Generic registration
  register: (userData: {
    email: string;
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    role: string;
    phone_number?: string;
  }) => fetchWithAuth('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),

  // Teacher registration
  registerTeacher: (teacherData: {
    email: string;
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    phone_number?: string;
    qualifications?: string[];
    specialization?: string;
    years_of_experience?: number;
    subjects_taught?: string[];
    education_levels?: string[];
  }) => fetchWithAuth('/auth/register/teacher', {
    method: 'POST',
    body: JSON.stringify(teacherData),
  }),

  // Student registration
  registerStudent: (studentData: {
    email: string;
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    phone_number?: string;
    education_level?: string;
    school_name?: string;
    curriculum_type?: string;
    grade_level?: string;
    learning_style?: string;
    desired_topics?: string[];
    career_interests?: string[];
    course_name?: string;
    department?: string;
    guardian_name?: string;
    guardian_email?: string;
    guardian_phone?: string;
    gender?: string;
    age?: number;
  }) => fetchWithAuth('/auth/register/student', {
    method: 'POST',
    body: JSON.stringify(studentData),
  }),

  // Login (Sets HttpOnly cookies via backend)
  login: async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const targetUrl = `${API_BASE_URL}/auth/login`;
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        credentials: 'include', // CRITICAL: Receive cookies
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Login failed' }));
        // If detail is an object, stringify it so the Error message preserves it
        const message = typeof errorData.detail === 'object' 
          ? JSON.stringify(errorData.detail) 
          : (errorData.detail || 'Login failed');
        throw new Error(message);
      }

      const data = await response.json();
      
      // Store access_token for Authorization header fallback (C-05)
      if (data && data.access_token) {
        localStorage.setItem('edunexus_token', data.access_token);
      }
      
      return data;
    } catch (err: any) {
      if (err.name === 'TypeError' || err.message?.includes('Failed to fetch')) {
        console.error(`🚨 Login Network Error: Failed to reach ${targetUrl}.`, err);
      }
      throw err;
    }
  },

  // Logout (Clears HttpOnly cookies via backend)
  logout: () => fetchWithAuth('/auth/logout', { method: 'POST' }),

  // Verify email with code
  verifyEmail: (data: { email: string; code: string }) =>
    fetchWithAuth('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Resend verification email
  resendVerification: (data: { email: string }) =>
    fetchWithAuth('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Change Password (GAP 4 Requirement)
  changePassword: (data: { old_password?: string; new_password: string }) =>
    fetchWithAuth('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Teacher API
export const teacherAPI = {
  // Get all my students
  getMyStudents: (filters?: { search?: string; education_level?: string; learning_style?: string }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.education_level) params.append('education_level', filters.education_level);
    if (filters?.learning_style) params.append('learning_style', filters.learning_style);

    return fetchWithAuth(`/teachers/students?${params.toString()}`);
  },

  // Register and add student to roster
  registerStudent: (data: {
    full_name: string;
    username: string;
    email: string;
    password: string;
    phone_number?: string;
    guardian_name?: string;
    guardian_email?: string;
    education_level?: string;
    grade_level?: string;
    school_name?: string;
    curriculum_type?: string;
    course_name?: string;
    notes?: string;
  }) => fetchWithAuth('/teachers/register-student', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Teacher-Student Linking
  getMyLinkedStudents: () => fetchWithAuth('/teacher-students/my-students'),

  addStudentById: (studentId: string) =>
    fetchWithAuth('/teacher-students/add-by-id', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    }),

  removeStudent: (studentId: string) =>
    fetchWithAuth(`/teacher-students/remove-student/${studentId}`, {
      method: 'DELETE',
    }),

  getStudentDetails: (studentId: string) =>
    fetchWithAuth(`/teachers/students/${studentId}`),

  getStudentLearningAnalytics: (studentId: string) =>
    fetchWithAuth(`/teachers/students/${studentId}/learning-analytics/`),

  getStudentProgressSummary: (studentId: string) =>
    fetchWithAuth(`/teachers/students/${studentId}/progress-summary`),

  // Alias for compatibility
  getStudents: (filters?: { search?: string; education_level?: string; learning_style?: string }) =>
    teacherAPI.getMyStudents(filters),
};

// Admin API
export const adminAPI = {
  // Admin login
  login: async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const targetUrl = `${API_BASE_URL}/auth/login`;
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Login failed' }));
        throw new Error(error.detail || 'Login failed');
      }

      const data = await response.json();

      // Store access_token for Authorization header fallback (C-05)
      if (data && data.access_token) {
        localStorage.setItem('edunexus_token', data.access_token);
      }

      return data;
    } catch (err: any) {
      if (err.name === 'TypeError' || err.message?.includes('Failed to fetch')) {
        console.error(`🚨 Admin Login Network Error: Failed to reach ${targetUrl}.`, err);
      }
      throw err;
    }
  },

  // List all users
  getAllUsers: (filters?: {
    role?: string;
    status?: string;
    search?: string;
    is_active?: boolean;
    skip?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.is_active !== undefined) params.append('is_active', String(filters.is_active));
    if (filters?.skip !== undefined) params.append('skip', String(filters.skip));
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit));

    return fetchWithAuth(`/admin/users?${params.toString()}`);
  },

  // Get user details
  getUser: (userId: string) => fetchWithAuth(`/admin/users/${userId}`),

  // Update user
  updateUser: (userId: string, data: any) =>
    fetchWithAuth(`/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Delete user
  deleteUser: (userId: string, reason?: string) =>
    fetchWithAuth(`/admin/users/${userId}?reason=${encodeURIComponent(reason || '')}`, {
      method: 'DELETE',
    }),

  // Deactivate user
  deactivateUser: (userId: string, reason?: string) =>
    fetchWithAuth(`/admin/users/${userId}/deactivate?reason=${encodeURIComponent(reason || '')}`, {
      method: 'POST',
    }),

  // Activate user
  activateUser: (userId: string) =>
    fetchWithAuth(`/admin/users/${userId}/activate`, {
      method: 'POST',
    }),

  // List teachers with limits
  getTeachers: (filters?: { plan_type?: string; is_verified?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.plan_type) params.append('plan_type', filters.plan_type);
    if (filters?.is_verified !== undefined) params.append('is_verified', String(filters.is_verified));

    return fetchWithAuth(`/admin/teachers?${params.toString()}`);
  },

  // Update teacher limits
  updateTeacherLimits: (teacherId: string, data: { max_students: number; plan_type?: string }) =>
    fetchWithAuth(`/admin/teachers/${teacherId}/limits`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Get system stats
  getStats: () => fetchWithAuth('/admin/stats/overview'),

  // Security Review Endpoints (C-12)
  getAuditLogs: () => fetchWithAuth('/admin/audit-logs'),
  getFlaggedUsers: () => fetchWithAuth('/admin/flagged-users'),
  getSystemCriticalEvents: () => fetchWithAuth('/admin/critical-events'),

  // Material Management
  uploadMaterial: (formData: FormData) => 
    fetch(`${API_BASE_URL}/admin/materials/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then(r => {
      if (!r.ok) throw new Error('Upload failed');
      return r.json();
    }),

  listMaterials: (filters?: { subject?: string; education_level?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.subject) params.append('subject', filters.subject);
    if (filters?.education_level) params.append('education_level', filters.education_level);
    if (filters?.search) params.append('search', filters.search);
    return fetchWithAuth(`/admin/materials?${params.toString()}`);
  },

  deleteMaterial: (materialId: string) =>
    fetchWithAuth(`/materials/${materialId}`, { method: 'DELETE' }),

  // Get AI usage analytics
  getAIUsage: (params: { days?: number; model_name?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.days) query.append('days', String(params.days));
    if (params.model_name) query.append('model_name', params.model_name);
    return fetchWithAuth(`/admin/usage?${query.toString()}`);
  },
};

// RAG (Retrieval Augmented Generation) API
export const ragAPI = {
  // Generate content using materials
  generateContent: (data: {
    query: string;
    subject?: string;
    topic?: string;
    context_type?: string;
    target_audience?: string;
    difficulty_level?: string;
    max_materials?: number;
  }) => fetchWithAuth('/rag/generate-content', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Explain topic using materials
  explainTopic: (topic: string, subject?: string, studentId?: string) =>
    fetchWithAuth(`/rag/explain-topic?topic=${encodeURIComponent(topic)}${subject ? `&subject=${subject}` : ''}${studentId ? `&student_id=${studentId}` : ''}`, {
      method: 'POST',
    }),

  // Create study guide
  createStudyGuide: (subject: string, topics?: string[]) =>
    fetchWithAuth('/rag/create-study-guide', {
      method: 'POST',
      body: JSON.stringify({ subject, topics }),
    }),
};

// Readings (Brain Power Cards) API
export const readingsAPI = {
  getReadingRecommendations: (params: {
    topic: string;
    subject?: string;
    educationLevel?: string;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    searchParams.append('topic', params.topic);
    if (params.subject) searchParams.append('subject', params.subject);
    if (params.limit) searchParams.append('limit', String(params.limit));
    // educationLevel is handled by the backend from the student profile
    
    return fetchWithAuth(`/readings/recommendations?${searchParams.toString()}`);
  },
};

// Subjects API
export const subjectsAPI = {
  // Get all subjects
  getAll: (filters?: { education_level?: string; grade_level?: string; department?: string; curriculum_type?: string; search?: string; mine?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.education_level) params.append('education_level', filters.education_level);
    if (filters?.grade_level) params.append('grade_level', filters.grade_level);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.curriculum_type) params.append('curriculum_type', filters.curriculum_type);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.mine) params.append('mine', 'true');

    return fetchWithAuth(`/subjects?${params.toString()}`);
  },

  create: (data: {
    id?: string;
    name: string;
    education_level: string;
    curriculum_type?: string;
    description?: string;
    grade_levels?: string[];
    auto_generate_topics?: boolean;
  }) => fetchWithAuth('/subjects', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  update: (subjectId: string, data: { name?: string; description?: string; is_active?: boolean }) =>
    fetchWithAuth(`/subjects/${subjectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (subjectId: string) =>
    fetchWithAuth(`/subjects/${subjectId}`, { method: 'DELETE' }),

  getTopics: async (subjectId: string) => {
    const response = await fetchWithAuth(`/subjects/${subjectId}`);
    return response;
  },

  // Correct course name
  correctName: (name: string) => fetchWithAuth('/subjects/correct-name', {
    method: 'POST',
    body: JSON.stringify({ name })
  }),
};

export const sessionAPI = {
  // Create new session
  create: (data: {
    title: string;
    subject_id: string;
    topic_id?: string;
    student_ids: string[];
    ai_config?: {
      llm_enabled?: boolean;
      tts_enabled?: boolean;
      stt_enabled?: boolean;
      llm_model?: string;
      auto_explain?: boolean;
      suggest_videos?: boolean;
      generate_assignments?: boolean;
      track_engagement?: boolean;
    };
    previous_session_id?: string;
    scheduled_start?: string;
    duration_minutes?: number;
  }) => fetchWithAuth('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // List sessions
  list: (status?: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (limit) params.append('limit', String(limit));
    if (offset) params.append('offset', String(offset));
    return fetchWithAuth(`/sessions?${params.toString()}`);
  },

  // Get session details
  get: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}`),

  // Start session
  start: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}/start`, {
    method: 'POST',
  }),

  // Resume session
  resume: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}/resume`, {
    method: 'POST',
  }),

  // End session
  end: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}/end`, {
    method: 'POST',
  }),

  // Pause session
  pause: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}/pause`, {
    method: 'POST',
  }),

  // Join session (student)
  join: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}/join`, {
    method: 'POST',
  }),

  // Leave session (student)
  leave: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}/leave`, {
    method: 'POST',
  }),

  // Delete session (teacher)
  delete: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}`, {
    method: 'DELETE',
  }),

  // Update AI config
  updateAIConfig: (sessionId: string, config: any) =>
    fetchWithAuth(`/sessions/${sessionId}/ai-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  // Get LiveKit token
  getToken: (sessionId: string) => fetchWithAuth(`/sessions/${sessionId}/token`),

  // Submit quiz answers
  submitQuiz: (sessionId: string, studentId: string, quizType: string, answers: Record<string | number, string>) =>
    fetchWithAuth(`/sessions/${sessionId}/submit-quiz`, {
      method: 'POST',
      body: JSON.stringify({
        student_id: studentId,
        quiz_type: quizType,
        answers: answers
      }),
    }),
    
  // Smart Classroom Additions
  prepareSmartLesson: (studentId: string, subjectId: string) =>
    fetchWithAuth(`/sessions/prepare-lesson/${studentId}/${subjectId}`),

  submitLiveQuiz: (sessionId: string, answers: any) =>
    fetchWithAuth(`/sessions/${sessionId}/submit-quiz`, {
      method: 'POST',
      body: JSON.stringify({
        quiz_type: 'live_pop',
        answers: answers
      }),
    }),

  pushContent: (sessionId: string, data: any) =>
    fetchWithAuth(`/sessions/${sessionId}/push-content`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // DESIGN DECISION: These endpoints are intentionally unauthenticated to allow 
  // guest student session joining via code. See C-11 in the security audit.
  verifyCode: (code: string) =>
    fetch(`${API_BASE_URL}/sessions/verify-code/${code}`)
      .then(r => r.json()),
  
  joinByCode: (data: { 
    access_code: string, 
    student_name: string 
  }) =>
    fetch(`${API_BASE_URL}/sessions/join-by-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),
};

// AI Coordinator API
export const aiAPI = {
  // Process teacher speech (upload audio)
  processSpeech: async (sessionId: string, audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.wav');

    const response = await fetch(`${API_BASE_URL}/ai/sessions/${sessionId}/process-speech`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Processing failed' }));
      throw new Error(error.detail || 'Failed to process speech');
    }

    return response.json();
  },

  // Generate explanation
  generateExplanation: (sessionId: string, data: {
    concept: string;
    explanation_type: string;
    target_student_id?: string;
  }) => fetchWithAuth(`/ai/sessions/${sessionId}/explain`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Generate lesson outline
  generateOutline: (sessionId: string) => fetchWithAuth(`/ai/sessions/${sessionId}/generate-outline`, {
    method: 'POST',
  }),

  // Generate notes
  generateNotes: (sessionId: string) => fetchWithAuth(`/ai/sessions/${sessionId}/generate-notes`, {
    method: 'POST',
  }),

  // Get video suggestions
  suggestVideos: (sessionId: string, concept: string) =>
    fetchWithAuth(`/ai/sessions/${sessionId}/suggest-videos?concept=${encodeURIComponent(concept)}`),

  // Get session explanations
  getExplanations: (sessionId: string) =>
    fetchWithAuth(`/ai/sessions/${sessionId}/explanations`),

  // Approve explanation (teacher)
  approveExplanation: (sessionId: string, explanationId: string) =>
    fetchWithAuth(`/ai/sessions/${sessionId}/explanations/${explanationId}/approve`, {
      method: 'POST',
    }),

  // Share explanation with students (teacher)
  shareExplanation: (sessionId: string, explanationId: string) =>
    fetchWithAuth(`/ai/sessions/${sessionId}/explanations/${explanationId}/share`, {
      method: 'POST',
    }),

  // Rate explanation helpfulness
  rateExplanation: (sessionId: string, explanationId: string, rating: number) =>
    fetchWithAuth(`/ai/sessions/${sessionId}/explanations/${explanationId}/rate?rating=${rating}`, {
      method: 'POST',
    }),

  // Get explanation types
  getExplanationTypes: () => fetchWithAuth('/ai/explanation-types'),

  // Smart Helper Chat
  chat: (messages: { role: string; content: string }[], mode?: string, model?: string, temperature?: number, subject_name?: string, topic_name?: string) =>
    fetchWithAuth('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, mode, model, temperature, subject_name, topic_name }),
    }),

  // Evaluate understanding
  evaluateUnderstanding: (data: { concept: string; explanation: string }) =>
    fetchWithAuth('/ai/evaluate-understanding', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Generate mastery test
  generateMasteryTest: (data: { topic: string; subject: string; chat_history?: { role: string; content: string }[] }) =>
    fetchWithAuth('/ai/mastery-test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Evaluate mastery test
  evaluateMasteryTest: (data: { topic: string; topicId?: string; subjectId?: string; subtopic?: string; results: any[] }) =>
    fetchWithAuth('/ai/evaluate-mastery', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Get topic breakdown
  getTopicBreakdown: (topic: string, subjectId: string) =>
    fetchWithAuth('/ai/breakdown', {
      method: 'POST',
      body: JSON.stringify({ topic, subject_id: subjectId }),
    }),

  // Save chat history
  saveChatHistory: (data: {
    subject_id?: string;
    topic_id?: string;
    topic_name?: string;
    subtopic_name?: string;
    messages: { role: string; content: string }[];
  }) => fetchWithAuth('/ai/save-chat', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Get chat history
  getChatHistory: (data: {
    subject_id?: string;
    topic_id?: string;
    topic_name?: string;
    subtopic_name?: string;
  }) => fetchWithAuth('/ai/get-chat', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Engagement Tracking API
export const engagementAPI = {
  // Submit video frame for analysis (base64 encoded)
  submitVideoFrame: (sessionId: string, studentId: string, frameData: string) =>
    fetchWithAuth(`/sessions/${sessionId}/engagement/video-frame/`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, frame_data: frameData }),
    }),

  // Record tab switch
  recordTabSwitch: (sessionId: string) =>
    fetchWithAuth(`/sessions/${sessionId}/engagement/tab-switch/`, {
      method: 'POST',
    }),

  // Record participation
  recordParticipation: (sessionId: string, eventType: 'question' | 'answer' | 'chat' | 'hand_raise' | 'reaction') =>
    fetchWithAuth(`/sessions/${sessionId}/engagement/participation/?event_type=${eventType}`, {
      method: 'POST',
    }),

  // Get engagement report (teacher)
  getReport: (sessionId: string) =>
    fetchWithAuth(`/sessions/${sessionId}/engagement/report`),

  // Get student engagement metrics
  getStudentMetrics: (sessionId: string, studentId: string) =>
    fetchWithAuth(`/sessions/${sessionId}/engagement/student/${studentId}/`),
};

// Materials API
export const materialsAPI = {
  // Get available materials for students
  getAll: (filters?: { subject?: string; topic?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.subject) params.append('subject', filters.subject);
    if (filters?.topic) params.append('topic', filters.topic);
    if (filters?.search) params.append('search', filters.search);
    const queryString = params.toString();
    return fetchWithAuth(`/materials/available${queryString ? '?' + queryString : ''}`);
  },

  // Get teacher's own materials
  getMine: (filters?: { subject?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.subject) params.append('subject', filters.subject);
    if (filters?.search) params.append('search', filters.search);
    const queryString = params.toString();
    return fetchWithAuth(`/materials/my-materials${queryString ? '?' + queryString : ''}`);
  },

  // Upload material
  upload: async (data: any) => {
    let formData: FormData;

    if (data instanceof FormData) {
      formData = data;
    } else {
      formData = new FormData();
      formData.append('title', data.title);
      if (data.description) formData.append('description', data.description);
      formData.append('subject', data.subject);
      if (data.subject_id) formData.append('subject_id', data.subject_id);
      if (data.topic) formData.append('topic', data.topic);
      if (data.education_level) formData.append('education_level', data.education_level);
      if (data.grade_level) formData.append('grade_level', data.grade_level);
      if (data.video_url) formData.append('video_url', data.video_url);
      formData.append('is_public', String(data.is_public || false));
      if (data.file) formData.append('file', data.file);
    }

    const response = await fetch(`${API_BASE_URL}/materials/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || 'Upload failed');
    }

    return response.json();
  },

  // Delete material
  delete: (materialId: string) =>
    fetchWithAuth(`/materials/${materialId}`, { method: 'DELETE' }),
};

// User API
export const userAPI = {
  // Get current user
  getMe: (options?: any) => fetchWithAuth('/users/me', options),

  updateMe: (data: {
    full_name?: string;
    phone_number?: string;
    avatar_url?: string;
    bio?: string;
    state?: string;
    city?: string;
    date_of_birth?: string;
    education_level?: string;
    grade_level?: string;
    school_name?: string;
    learning_style?: string;
    specialization?: string;
    years_of_experience?: number;
  }) => fetchWithAuth('/users/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
};

// Subscription API
export const subscriptionAPI = {
  // Get subscription status
  getStatus: () => fetchWithAuth('/teachers/subscription/status'),
};

// Student API
export const studentAPI = {
  // Get student's own profile
  getProfile: () => fetchWithAuth('/students/profile'),

  // Update student profile
  updateProfile: (data: any) =>
    fetchWithAuth('/students/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Get learning analytics
  getAnalytics: () => fetchWithAuth('/students/analytics/'),

  // Get topic requests
  getTopicRequests: () => fetchWithAuth('/students/topics/my-requests'),

  // Create topic request
  createTopicRequest: (data: { topic_name: string; subject: string; description?: string; priority?: string }) =>
    fetchWithAuth('/students/topics/request', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Get learning style questions
  getLearningStyleQuestions: () => fetchWithAuth('/students/assessment/learning-style/questions'),

  // Submit learning style assessment
  submitLearningStyleAssessment: (answers: number[]) =>
    fetchWithAuth('/students/assessment/learning-style', {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  // Get recommendations
  getRecommendations: (studentId: string) => fetchWithAuth(`/students/${studentId}/recommendations`),

  // Generate and enroll in custom professional course
  enrollCustomProfessionalCourse: (courseName: string) =>
    fetchWithAuth('/students/professional/enroll', {
      method: 'POST',
      body: JSON.stringify({ course_name: courseName }),
    }),

  // Enroll in subject
  enrollSubject: (subjectId: string) =>
    fetchWithAuth('/students/subjects/enroll', {
      method: 'POST',
      body: JSON.stringify({ subject_id: subjectId, action: 'enroll' }),
    }),

  // Unenroll from subject
  unenrollSubject: (subjectId: string) =>
    fetchWithAuth('/students/subjects/enroll', {
      method: 'POST',
      body: JSON.stringify({ subject_id: subjectId, action: 'unenroll' }),
    }),

  // Get enrolled subjects
  getEnrolledSubjects: () => fetchWithAuth('/students/subjects/enrolled'),

  // Get brain power (Dedicated endpoint for energy)
  getBrainPower: () => fetchWithAuth('/students/me/brain-power'),

  // Get student sessions
  getSessions: () => sessionAPI.list(),

  // Get student materials
  getMaterials: () => materialsAPI.getAll(),

  // Get student progress
  getProgress: () => progressAPI.getProgress(),

  // Upload avatar image
  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/students/avatar`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'Avatar upload failed');
    }
    return response.json();
  },

  getSuggestedVideos: (params: {
    topic: string;
    subject?: string;
    educationLevel?: string;
  }) => {
    const query = new URLSearchParams({
      topic: params.topic,
      ...(params.subject && { subject: params.subject }),
      ...(params.educationLevel && { education_level: params.educationLevel }),
    });
    return fetchWithAuth(`/ai/suggest-videos?${query.toString()}`);
  },
};

// Reports API
export const reportsAPI = {
  // Get all reports
  getAll: (filters?: { month?: number; year?: number; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.month) params.append('month', String(filters.month));
    if (filters?.year) params.append('year', String(filters.year));
    if (filters?.status) params.append('status', filters.status);
    return fetchWithAuth(`/reports/?${params.toString()}`);
  },

  // Get report details
  get: (reportId: string) => fetchWithAuth(`/reports/${reportId}`),

  // Get report details (alias)
  getDetail: (reportId: string) => fetchWithAuth(`/reports/${reportId}`),

  // Generate reports for a month
  generate: (data: { month: number; year: number }) =>
    fetchWithAuth('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Approve report
  approve: (reportId: string, data: { teacher_notes?: string }) =>
    fetchWithAuth(`/reports/${reportId}/approve`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Send report
  send: (reportId: string) =>
    fetchWithAuth(`/reports/${reportId}/send`, {
      method: 'POST',
    }),
};

export const assignmentAPI = {
  // Generate assignment from session
  generate: (sessionId: string, questionCount?: number) =>
    fetchWithAuth(`/assignments/generate/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ question_count: questionCount || 10 }),
    }),

  // Get assignments for session
  getForSession: (sessionId: string) =>
    fetchWithAuth(`/assignments/session/${sessionId}`),

  // Get assignment details
  get: (assignmentId: string) =>
    fetchWithAuth(`/assignments/${assignmentId}`),

  // Publish assignment to students (teacher)
  publish: (assignmentId: string, dueDate?: string) =>
    fetchWithAuth(`/assignments/${assignmentId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ due_date: dueDate }),
    }),
};

// Assessment API
export const assessmentAPI = {
  // Get all assessments
  list: (subjectId?: string) => {
    const params = new URLSearchParams();
    if (subjectId) params.append('subject_id', subjectId);
    return fetchWithAuth(`/assessments${params.toString() ? `?${params.toString()}` : ''}`);
  },

  // Get assessment details
  get: (assessmentId: string) => fetchWithAuth(`/assessments/${assessmentId}`),

  // Start assessment
  start: (assessmentId: string) => fetchWithAuth(`/assessments/${assessmentId}/start`, {
    method: 'POST',
  }),

  // Submit assessment results
  submit: (assessmentId: string, data: { score: number; feedback?: string; time_taken_seconds?: number }) =>
    fetchWithAuth(`/assessments/${assessmentId}/submit`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Flashcard API
export const flashcardAPI = {
  // Get due flashcards
  getDue: () => fetchWithAuth('/flashcards/due'),

  // Get all flashcards
  getAll: () => fetchWithAuth('/flashcards'),

  // Create flashcard
  create: (data: { front: string; back: string; subject?: string; topic?: string; tags?: string[] }) =>
    fetchWithAuth('/flashcards', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Review flashcard
  review: (flashcardId: string, quality: number) =>
    fetchWithAuth(`/flashcards/${flashcardId}/review`, {
      method: 'POST',
      body: JSON.stringify({ quality }),
    }),

  // Get flashcard stats
  getStats: () => fetchWithAuth('/flashcards/stats'),
};

// Progress API
export const progressAPI = {
  // Get overall progress
  getProgress: () => fetchWithAuth('/student/progress'),

  // Get progress by subject
  getProgressBySubject: (subjectId: string) => fetchWithAuth(`/student/progress/${subjectId}`),

  // Get performance analytics
  getPerformanceAnalytics: () => fetchWithAuth('/student/analytics/performance/'),

  // Get monthly reports
  getMonthlyReports: () => fetchWithAuth('/student/reports/monthly'),

  // Submit quiz score
  submitQuizScore: (data: { subject_id: string; quiz_id: string; score: number; time_taken_seconds?: number }) =>
    fetchWithAuth('/student/quiz-score', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Completion Tracking
  updateTopicProgress: (data: { topic_id: string; progress_pct: number; completed: boolean }) =>
    fetchWithAuth('/student/progress/update', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getProgressSummary: () => fetchWithAuth('/student/progress/summary'),

  getTopicProgress: (subjectId: string) => fetchWithAuth(`/student/progress/topics/${subjectId}`),

  completeTopic: (topicId: string) =>
    fetchWithAuth('/student/progress/complete-topic', {
      method: 'POST',
      body: JSON.stringify({ topic_id: topicId }),
    }),
};

export const notificationsAPI = {
  getAll: (limit = 20) => fetchWithAuth(`/notifications/?limit=${limit}`),
  markAsRead: (id: string) => fetchWithAuth(`/notifications/${id}/read`, { method: 'POST' }),
  markAllAsRead: () => fetchWithAuth('/notifications/read-all', { method: 'POST' }),
};

export const messageAPI = {
  getConversations: () => fetchWithAuth('/messages/conversations'),
  getMessages: (otherUserId: string) => fetchWithAuth(`/messages/${otherUserId}`),
  sendMessage: (recipientId: string, content: string) => fetchWithAuth('/messages', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: recipientId, content })
  }),
  searchContacts: (query: string) => fetchWithAuth(`/messages/contacts/search?query=${query}`),
};

// Video API
export const videoAPI = {
  getRecommendations: (topic: string, limit: number = 5, level?: string, style?: string, subject?: string) => {
    let url = `/videos/recommendations?topic=${encodeURIComponent(topic)}&limit=${limit}`;
    if (level) url += `&level=${encodeURIComponent(level)}`;
    if (style) url += `&style=${encodeURIComponent(style)}`;
    if (subject) url += `&subject=${encodeURIComponent(subject)}`;
    return fetchWithAuth(url);
  },
};

// Mock Exam API
export const mockExamAPI = {
  // Get available series
  getSeries: (subjectId?: string) => {
    const params = new URLSearchParams();
    if (subjectId) params.append('subject_id', subjectId);
    return fetchWithAuth(`/mock-exams/series?${params.toString()}`);
  },

  // Create/Get active attempt
  startAttempt: (seriesId: string) =>
    fetchWithAuth(`/mock-exams/series/${seriesId}/attempt`, {
      method: 'POST',
    }),

  // Get specific attempt details
  getAttempt: (attemptId: string) =>
    fetchWithAuth(`/mock-exams/attempts/${attemptId}`),

  // Submit attempt
  submitAttempt: (attemptId: string, answers: Record<string, string>) =>
    fetchWithAuth(`/mock-exams/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  // Start combo attempt
  startCombo: (seriesIds: string[]) =>
    fetchWithAuth(`/mock-exams/combo-attempt`, {
      method: 'POST',
      body: JSON.stringify({ series_ids: seriesIds }),
    }),

  // Submit combo attempt
  submitCombo: (attempts: { attempt_id: string; answers: Record<string, string>; time_spent_seconds: number }[]) =>
    fetchWithAuth(`/mock-exams/combo-submit`, {
      method: 'POST',
      body: JSON.stringify({ attempts }),
    }),

  // Get student history
  getHistory: () => fetchWithAuth('/mock-exams/history'),
};

export default {
  auth: authAPI,
  teacher: teacherAPI,
  student: studentAPI,
  materials: materialsAPI,
  user: userAPI,
  subscription: subscriptionAPI,
  admin: adminAPI,
  readings: readingsAPI,
  rag: ragAPI,
  session: sessionAPI,
  ai: aiAPI,
  engagement: engagementAPI,
  flashcard: flashcardAPI,
  progress: progressAPI,
  assignment: assignmentAPI,
  reports: reportsAPI,
  assessment: assessmentAPI,
  notifications: notificationsAPI,
  message: messageAPI,
  video: videoAPI,
  mockExam: mockExamAPI,
};
