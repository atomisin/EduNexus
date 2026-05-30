import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { studentAPI, sessionAPI, subjectsAPI, progressAPI } from '@/services/api';
import type { StudentProfile, Session, Subject, ProgressData, ViewType } from '../types';

const normalizeSubjectName = (name?: string) => (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const MINUTE = 60 * 1000;
const isTransientStudentDataError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    message.includes('unable to connect') ||
    message.includes('failed to fetch') ||
    message.includes('taking too long') ||
    message.includes('try again in a moment') ||
    message.includes('timeout') ||
    message.includes('service unavailable') ||
    message.includes('http 5')
  );
};
const STUDENT_QUERY_OPTIONS = {
  refetchOnWindowFocus: false,
  retry: (failureCount: number, error: unknown) => {
    if (!isTransientStudentDataError(error)) return false;
    return failureCount < 2;
  },
  retryDelay: (attemptIndex: number) => Math.min(1500 * (attemptIndex + 1), 4000),
} as const;

const subjectScore = (subject: Subject, profile?: StudentProfile | null) => {
  const grade = (profile?.grade_level || profile?.education_level || '').toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
  const gradeLevels = (subject as any).grade_levels || [];
  let score = 0;
  if (grade && gradeLevels.some((level: string) => String(level).replace(/[^a-z0-9]/gi, '').toUpperCase() === grade)) score += 100;
  if (profile?.education_level && (subject as any).education_level === profile.education_level) score += 50;
  if ((subject as any).topic_count) score += Math.min((subject as any).topic_count, 20);
  return score;
};

export const useStudentData = (user?: any, activeView?: ViewType) => {
  const queryClient = useQueryClient();
  const needsSubjectCatalog = ['learn', 'subjects', 'profile'].includes(activeView || '');
  const needsEnrolledSubjects = ['learn', 'subjects', 'profile'].includes(activeView || '');
  const needsSessions = ['dashboard', 'sessions'].includes(activeView || '');
  const needsProgress = activeView === 'progress';
  const needsAnalytics = activeView === 'progress';
  const needsLiveBrainPower = ['dashboard', 'learn', 'profile'].includes(activeView || '');
  const sessionLimit = activeView === 'sessions' ? 50 : 12;
  const needsFullProfile = ['learn', 'subjects', 'profile', 'progress'].includes(activeView || '');
  const shouldFetchEnrolledSubjects = needsEnrolledSubjects && !needsFullProfile;

  // Profile Query
  const { 
    data: profile, 
    isLoading: isProfileLoading, 
    error: profileError,
    refetch: refetchProfile 
  } = useQuery<StudentProfile | null>({
    queryKey: ['student', 'profile', needsFullProfile ? 'full' : 'summary'],
    queryFn: () => studentAPI.getProfile({ summary: !needsFullProfile }),
    enabled: !!user,
    staleTime: 5 * MINUTE,
    ...STUDENT_QUERY_OPTIONS,
  });

  // Brain Power Query (Dedicated query as requested for better invalidation)
  const { 
    data: brainPowerData, 
    refetch: refetchBrainPower 
  } = useQuery<any>({
    queryKey: ['student', 'brain-power'],
    queryFn: () => studentAPI.getBrainPower(),
    enabled: !!user && needsLiveBrainPower,
    staleTime: MINUTE,
    ...STUDENT_QUERY_OPTIONS,
  });

  const brainPower = brainPowerData?.brain_power ?? profile?.brain_power ?? 100;

  // Subjects Query
  const { 
    data: allSubjectsRaw = [], 
    isLoading: isSubjectsLoading,
    error: subjectsError
  } = useQuery<Subject[]>({
    queryKey: ['student', 'subjects', profile?.education_level, profile?.grade_level, profile?.department],
    queryFn: () => subjectsAPI.getAll({ 
      education_level: profile?.education_level,
      grade_level: profile?.grade_level,
      department: profile?.department,
      mine: profile?.education_level === 'professional',
      light: true,
    }).then((r: any) => r.subjects || r || []),
    enabled: !!user && !!profile && needsSubjectCatalog,
    staleTime: 10 * MINUTE,
    ...STUDENT_QUERY_OPTIONS,
  });

  // Enrolled Subjects Query
  const { 
    data: enrolledSubjects = [], 
    refetch: refetchEnrolled,
    isLoading: isEnrolledLoading,
  } = useQuery<string[]>({
    queryKey: ['student', 'enrolled-subjects'],
    queryFn: () => studentAPI.getEnrolledSubjects().then((r: any) => r.enrolled_subjects || []),
    enabled: !!user && shouldFetchEnrolledSubjects,
    staleTime: 5 * MINUTE,
    ...STUDENT_QUERY_OPTIONS,
  });

  // Sessions Query
  const { 
    data: sessions = [], 
    refetch: refetchSessions,
    isLoading: isSessionsLoading,
    error: sessionsError
  } = useQuery<Session[]>({
    queryKey: ['student', 'sessions', activeView, sessionLimit],
    queryFn: () => studentAPI.getSessions({ limit: sessionLimit, summary: true }).then((r: any) => r.sessions || r || []),
    enabled: !!user && needsSessions,
    staleTime: MINUTE,
    ...STUDENT_QUERY_OPTIONS,
  });

  // Progress Query
  const { data: progress = null } = useQuery<ProgressData | null>({
    queryKey: ['student', 'progress'],
    queryFn: () => studentAPI.getProgress().then((r: any) => r.progress || r || null),
    enabled: !!user && needsProgress,
    staleTime: 2 * MINUTE,
    ...STUDENT_QUERY_OPTIONS,
  });

  // Performance Analytics Query
  const { data: analytics = null } = useQuery<any | null>({
    queryKey: ['student', 'analytics', 'performance'],
    queryFn: () => progressAPI.getPerformanceAnalytics(),
    enabled: !!user && needsAnalytics,
    staleTime: 2 * MINUTE,
    ...STUDENT_QUERY_OPTIONS,
  });

  const [isLoadingManual, setIsLoadingManual] = useState(false);
  const [errorManual, setErrorManual] = useState<string | null>(null);

  // Derived subjects - keep one best class-level subject per name.
  const subjects = useMemo(() => {
    const best = new Map<string, Subject>();
    const bestScore = new Map<string, number>();
    for (const subject of allSubjectsRaw || []) {
      const key = normalizeSubjectName(subject.name);
      const score = subjectScore(subject, profile);
      if (!best.has(key) || score > (bestScore.get(key) ?? -1)) {
        best.set(key, subject);
        bestScore.set(key, score);
      }
    }
    return Array.from(best.values());
  }, [allSubjectsRaw, profile]);

  const rawEnrollmentEntries = useMemo(() => {
    if (Array.isArray(enrolledSubjects) && enrolledSubjects.length > 0) {
      return enrolledSubjects;
    }
    if (Array.isArray(profile?.enrolled_subjects) && profile.enrolled_subjects.length > 0) {
      return profile.enrolled_subjects;
    }
    return [];
  }, [enrolledSubjects, profile?.enrolled_subjects]);

  const resolvedEnrolledSubjects = useMemo(() => {
    if (!Array.isArray(rawEnrollmentEntries) || rawEnrollmentEntries.length === 0) {
      return [];
    }

    const subjectIdSet = new Set(subjects.map((subject) => subject.id));
    const subjectByName = new Map(
      subjects.map((subject) => [normalizeSubjectName(subject.name), subject.id] as const)
    );

    const resolved = new Set<string>();
    for (const entry of rawEnrollmentEntries) {
      const rawValue = typeof entry === 'string'
        ? entry
        : typeof entry === 'object' && entry !== null
          ? String((entry as any).id || (entry as any).subject_id || (entry as any).name || '')
          : '';
      if (!rawValue) continue;

      if (subjectIdSet.has(rawValue)) {
        resolved.add(rawValue);
        continue;
      }

      const matchedId = subjectByName.get(normalizeSubjectName(rawValue));
      if (matchedId) {
        resolved.add(matchedId);
      }
    }

    return Array.from(resolved);
  }, [rawEnrollmentEntries, subjects]);



  const handleEnroll = useCallback(async (subjectId: string, enrolled: boolean) => {
    try {
      if (enrolled) {
        await studentAPI.unenrollSubject(subjectId);
      } else {
        await studentAPI.enrollSubject(subjectId);
      }
      queryClient.invalidateQueries({ queryKey: ['student', 'enrolled-subjects'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'subjects'] });
    } catch (err: any) {
      throw err;
    }
  }, [queryClient]);

  const handleJoinSession = useCallback(async (session: Session, onJoinSession?: (id: string, title: string) => void) => {
    // Just trigger the callback - App.tsx handles the actual API call and navigation
    onJoinSession?.(session.id, session.title || 'Live Session');
  }, []);

  const combinedLoading = isProfileLoading || isSubjectsLoading || isEnrolledLoading || isSessionsLoading || isLoadingManual;
  const combinedError = 
    (profileError as Error)?.message || 
    (subjectsError as Error)?.message || 
    (sessionsError as Error)?.message || 
    errorManual;

  return {
    profile: profile || null,
    sessions,
    subjects,
    enrolledSubjects: resolvedEnrolledSubjects,
    progress,
    analytics,
    brainPower,
    brainPowerData,
    isLoading: combinedLoading,
    error: combinedError,
    refetchProfile,
    refetchSessions,
    refetchBrainPower,
    handleEnroll,
    handleJoinSession,
    setProfile: (p: StudentProfile | null) => {
      queryClient.setQueryData(['student', 'profile', 'full'], p);
      queryClient.setQueryData(['student', 'profile', 'summary'], p);
    }
  };
};
