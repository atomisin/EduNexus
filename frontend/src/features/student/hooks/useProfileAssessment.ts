import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { studentAPI } from '@/services/api';

export const useProfileAssessment = (profile?: any, setProfile?: (p: any) => void) => {
  const [learningStyle, setLearningStyle] = useState<string | undefined>(profile?.learning_style);
  const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    education_level: profile?.education_level || '',
    grade_level: profile?.grade_level || '',
    school_name: profile?.school_name || '',
    curriculum_type: profile?.curriculum_type || '',
    course_name: profile?.course_name || '',
    best_study_time: profile?.best_study_time || 'Morning',
    attention_span_minutes: profile?.attention_span_minutes || 30,
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const [assessmentStep, setAssessmentStep] = useState(0);
  const [learningStyleQuestions, setLearningStyleQuestions] = useState<any[]>([]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);

  const fetchQuestions = useCallback(async () => {
    try {
      const data = await studentAPI.getLearningStyleQuestions();
      setLearningStyleQuestions(data.questions || data || []);
    } catch (err) {
      console.error('Failed to fetch questions:', err);
    }
  }, []);

  const openAssessment = useCallback(() => {
    fetchQuestions();
    setIsAssessmentOpen(true);
    setAssessmentStep(0);
  }, [fetchQuestions]);

  const closeAssessment = useCallback(() => setIsAssessmentOpen(false), []);

  const handleAvatarUpload = useCallback(async (file: File) => {
    try {
      const result = await studentAPI.uploadAvatar(file);
      setAvatarUrl(result.avatar_url);
      if (setProfile) setProfile({ ...profile, avatar_url: result.avatar_url });
      toast.success('Avatar updated!');
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Avatar upload failed');
      return false;
    }
  }, [profile, setProfile]);

  const updateProfile = useCallback(async (data: any) => {
    setIsUpdating(true);
    try {
      await studentAPI.updateProfile(data);
      toast.success('Profile updated successfully!');
      if (setProfile) setProfile({ ...profile, ...data });
      setIsEditingProfile(false);
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
      return false;
    } finally {
      setIsUpdating(false);
    }
  }, [profile, setProfile]);

  const submitAssessment = useCallback(async (dominantStyle: string) => {
    setIsUpdating(true);
    try {
      await studentAPI.updateProfile({ learning_style: dominantStyle });
      toast.success(`Assessment Complete! You are a ${dominantStyle} learner! 🎓`);
      setLearningStyle(dominantStyle);
      if (setProfile) setProfile({ ...profile, learning_style: dominantStyle });
      setIsAssessmentOpen(false);
    } catch (err) {
      toast.error("Failed to save assessment result");
    } finally {
      setIsUpdating(false);
    }
  }, [profile, setProfile]);

  return {
    learningStyle,
    isAssessmentOpen,
    assessmentStep,
    setAssessmentStep,
    learningStyleQuestions,
    profileForm,
    setProfileForm,
    isUpdating,
    isEditingProfile,
    setIsEditingProfile,
    avatarUrl,
    setAvatarUrl,
    handleAvatarUpload,
    openAssessment,
    closeAssessment,
    updateProfile,
    submitAssessment
  };
};
