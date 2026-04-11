import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { studentAPI, sessionAPI, subjectsAPI, 
  progressAPI, materialsAPI 
} from '@/services/api';
import type { StudentProfile, Session, Subject, ProgressData } from '../types';

export const useStudentData = (user?: any) => {
  const queryClient = useQueryClient();

  // Profile Query
  const { 
    data: profile, 
    isLoading: isProfileLoading, 
    error: profileError,
    refetch: refetchProfile 
  } = useQuery<StudentProfile | null>({
    queryKey: ['student', 'profile'],
    queryFn: studentAPI.getProfile,
    enabled: !!user,
  });

  // Brain Power Query (Dedicated query as requested for better invalidation)
  const { 
    data: brainPowerData, 
    refetch: refetchBrainPower 
  } = useQuery<any>({
    queryKey: ['student', 'brain-power'],
    queryFn: () => studentAPI.getBrainPower(),
    enabled: !!user,
    staleTime: 0 // Always fresh - changes frequently
  });

  const brainPower = brainPowerData?.brain_power ?? profile?.brain_power ?? 100;

  // Subjects Query
  const { 
    data: allSubjectsRaw = [], 
    isLoading: isSubjectsLoading,
    error: subjectsError
  } = useQuery<Subject[]>({
    queryKey: ['student', 'subjects', profile?.grade_level, profile?.department],
    queryFn: () => subjectsAPI.getAll({ 
      grade_level: profile?.grade_level,
      department: profile?.department
    }).then((r: any) => r.subjects || r || []),
    enabled: !!user && !!profile,
  });

  // Enrolled Subjects Query
  const { 
    data: enrolledSubjects = [], 
    refetch: refetchEnrolled 
  } = useQuery<string[]>({
    queryKey: ['student', 'enrolled-subjects'],
    queryFn: () => studentAPI.getEnrolledSubjects().then((r: any) => r.enrolled_subjects || []),
    enabled: !!user,
  });

  // Sessions Query
  const { 
    data: sessions = [], 
    refetch: refetchSessions,
    isLoading: isSessionsLoading,
    error: sessionsError
  } = useQuery<Session[]>({
    queryKey: ['student', 'sessions'],
    queryFn: () => studentAPI.getSessions().then((r: any) => r.sessions || r || []),
    enabled: !!user,
  });

  // Materials Query
  const { data: materials = [] } = useQuery<any[]>({
    queryKey: ['student', 'materials'],
    queryFn: () => studentAPI.getMaterials().then((r: any) => r.materials || r || []),
    enabled: !!user,
  });

  // Progress Query
  const { data: progress = null } = useQuery<ProgressData | null>({
    queryKey: ['student', 'progress'],
    queryFn: () => studentAPI.getProgress().then((r: any) => r.progress || r || null),
    enabled: !!user,
  });

  // Performance Analytics Query
  const { data: analytics = null } = useQuery<any | null>({
    queryKey: ['student', 'analytics', 'performance'],
    queryFn: () => progressAPI.getPerformanceAnalytics(),
    enabled: !!user,
  });

  const [isLoadingManual, setIsLoadingManual] = useState(false);
  const [errorManual, setErrorManual] = useState<string | null>(null);

  // Derived subjects - show all subjects without education_level filtering
  const subjects = useMemo(() => {
    return allSubjectsRaw || [];
  }, [allSubjectsRaw]);



  const handleEnroll = useCallback(async (subjectId: string, enrolled: boolean) => {
    try {
      if (enrolled) {
        await studentAPI.unenrollSubject(subjectId);
      } else {
        await studentAPI.enrollSubject(subjectId);
      }
      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['student', 'enrolled-subjects'] });
    } catch (err: any) {
      throw err;
    }
  }, [queryClient]);

  const handleDeleteMaterial = useCallback(async (materialId: string) => {
    await materialsAPI.delete(materialId);
    queryClient.invalidateQueries({ queryKey: ['student', 'materials'] });
  }, [queryClient]);

  const handleUpload = useCallback(async (file: File, subject: string) => {
    const result = await materialsAPI.upload({
      title: file.name,
      subject,
      education_level: 'professional',
      is_public: false,
      file
    });
    queryClient.invalidateQueries({ queryKey: ['student', 'materials'] });
    return result;
  }, [queryClient]);

  const handleJoinSession = useCallback(async (session: Session, onJoinSession?: (id: string, title: string) => void) => {
    // Just trigger the callback - App.tsx handles the actual API call and navigation
    onJoinSession?.(session.id, session.title || 'Live Session');
  }, []);

  const combinedLoading = isProfileLoading || isSubjectsLoading || isSessionsLoading || isLoadingManual;
  const combinedError = 
    (profileError as Error)?.message || 
    (subjectsError as Error)?.message || 
    (sessionsError as Error)?.message || 
    errorManual;

  return {
    profile: profile || null,
    sessions,
    subjects,
    enrolledSubjects,
    materials,
    progress,
    analytics,
    brainPower,
    isLoading: combinedLoading,
    error: combinedError,
    refetchProfile,
    refetchSessions,
    refetchBrainPower,
    handleEnroll,
    handleDeleteMaterial,
    handleUpload,
    handleJoinSession,
    setProfile: (p: StudentProfile | null) => queryClient.setQueryData(['student', 'profile'], p)
  };
};
