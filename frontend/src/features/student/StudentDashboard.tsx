import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

import { StudentSidebar } from './components/StudentSidebar';
import { StudentHeader } from './components/StudentHeader';
import { StudentViewRouter } from './components/StudentViewRouter';
import { UploadMaterialModal } from './modals/UploadMaterialModal';
import { LearningStyleAssessmentModal } from './modals/LearningStyleAssessmentModal';

import { subjectsAPI, studentAPI } from '@/services/api';
import { useStudentData } from './hooks/useStudentData';
import { useAITutor } from './hooks/useAITutor';
import { useProfileAssessment } from './hooks/useProfileAssessment';
import type { ViewType, Subject } from './types';
import { getAgeAppropriateGreeting, getLearningStyleLabel, formatDate } from './utils';

export const StudentDashboard = ({
  user,
  onLogout,
  onJoinSession,
}: {
  user: any;
  onLogout: () => void;
  onJoinSession?: (sessionId: string, title: string) => void;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const currentPath = location.pathname.split('/').pop();
  const initialView = (!currentPath || currentPath === 'student') ? 'dashboard' : currentPath as ViewType;
  
  const [activeViewState, setActiveViewState] = useState<ViewType>(initialView);
  
  const setActiveView = useCallback((view: ViewType) => {
    setActiveViewState(view);
    navigate(`/student${view === 'dashboard' ? '' : `/${view}`}`);
  }, [navigate]);

  useEffect(() => {
    const path = location.pathname.split('/').pop();
    const view = (!path || path === 'student') ? 'dashboard' : path as ViewType;
    if (view !== activeViewState) {
      setActiveViewState(view);
    }
  }, [location.pathname]);

  const activeView = activeViewState;

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [customCourseName, setCustomCourseName] = useState('');
  const [isGeneratingCourse, setIsGeneratingCourse] = useState(false);
  const [tutorGender, setTutorGenderState] = useState<'male' | 'female'>(() => {
    if (typeof window === 'undefined') return 'female';
    return localStorage.getItem('edunexus_tutor_gender') === 'male' ? 'male' : 'female';
  });
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const setTutorGender = useCallback((nextGender: 'male' | 'female') => {
    setTutorGenderState(nextGender);
    localStorage.setItem('edunexus_tutor_gender', nextGender);
  }, []);

  const getFullName = useCallback(() => {
    return user?.full_name || user?.name || 'Student';
  }, [user]);

  const {
    profile, sessions, subjects, progress, analytics, enrolledSubjects,
    materials, brainPower, brainPowerData, isLoading: isDataLoading, error,
    refetchProfile, refetchSessions, refetchBrainPower,
    handleEnroll, handleDeleteMaterial, handleUpload, handleJoinSession,
    setProfile
  } = useStudentData(user);

  const {
    messages, aiState, currentTopic: selectedTopic,
    lessonController,
    setCurrentTopic: setSelectedTopic, currentSubject: selectedSubject,
    setCurrentSubject: setSelectedSubject, sendMessage, clearMessages,
    topics, roadmap, roadmapLoading, showAIPanel, setShowAIPanel,
    viewingSubtopic, setViewingSubtopic, activeSubtopic,
    suggestedVideos, selectedVideo, setSelectedVideo,
    weaknessAreas, suggestedTopics, structuredTopics, isStructuredLoading, refetchStructured,
    handleSubjectSelect, handleTopicSelect, handleSubtopicClick,
    handleAIContinue, onMasteryTestComplete, startQuiz, dismissQuizConfirm,
    placementState, startPlacementCheck, submitPlacementCheck,
    acceptPlacementRecommendation, cancelPlacementCheck,
    lockedLessonNotice, openCurrentUnlockedLesson
  } = useAITutor(profile, getFullName);

  const isLoading = isDataLoading || aiState.status === 'chatting';
  const showMasteryTest = aiState.status === 'quiz_active';

  const {
    learningStyle, isAssessmentOpen: showLearningStyleModal, assessmentStep, setAssessmentStep,
    learningStyleQuestions, profileForm: profileFormData, setProfileForm: setProfileFormData,
    isUpdating, isEditingProfile, setIsEditingProfile, avatarUrl, setAvatarUrl,
    handleAvatarUpload, openAssessment: startAssessment, closeAssessment: setShowLearningStyleModal,
    updateProfile, submitAssessment: handleAssessmentAnswer
  } = useProfileAssessment(profile, setProfile);

  const liveSessions = sessions.filter(s => s.status === 'live');
  const upcomingSessions = sessions.filter(s => s.status === 'scheduled');
  
  const radarData = useMemo(() => {
    if (!profile?.subject_proficiency || !enrolledSubjects?.length) return [];
    
    return enrolledSubjects
      .map(subjectId => {
        const subject = subjects.find(s => s.id === subjectId);
        if (!subject) return null;
        const proficiency = profile?.subject_proficiency?.[subject.name] || 0;
        return {
          subject: subject.name,
          proficiency: Math.round(proficiency * 100)
        };
      })
      .filter((d): d is { subject: string; proficiency: number } => d !== null && d.proficiency > 0);
  }, [profile?.subject_proficiency, enrolledSubjects, subjects]);

  const progressForView = useMemo(() => {
    const subjectRows = Array.isArray((progress as any)?.progress) ? (progress as any).progress : [];
    const completedLessons = subjectRows.reduce((sum: number, row: any) => sum + (Array.isArray(row.topics_completed) ? row.topics_completed.length : 0), 0);
    const progressSummary = subjectRows.reduce(
      (acc: any, row: any) => ({
        total_quizzes: acc.total_quizzes + Number(row.total_quizzes || 0),
        total_time_spent: acc.total_time_spent + Number(row.total_time_spent || 0),
        average_score_sum: acc.average_score_sum + Number(row.average_quiz_score || row.mastery_percentage || 0),
        average_score_count: acc.average_score_count + (Number(row.average_quiz_score || row.mastery_percentage || 0) > 0 ? 1 : 0),
      }),
      { total_quizzes: 0, total_time_spent: 0, average_score_sum: 0, average_score_count: 0 }
    );
    const fallbackAverage = progressSummary.average_score_count
      ? progressSummary.average_score_sum / progressSummary.average_score_count
      : 0;

    return {
      ...(progress || {}),
      ...(analytics || {}),
      summary: {
        ...((progress as any)?.summary || {}),
        ...((analytics as any)?.summary || {}),
        total_quizzes: (analytics as any)?.summary?.total_quizzes ?? progressSummary.total_quizzes,
        total_time_spent: (analytics as any)?.summary?.total_time_spent ?? progressSummary.total_time_spent,
        average_score: (analytics as any)?.summary?.average_score ?? fallbackAverage,
        total_lessons: (analytics as any)?.summary?.total_lessons ?? completedLessons,
        ai_chats: (analytics as any)?.summary?.ai_chats ?? 0,
      },
      subject_progress_rows: subjectRows,
    };
  }, [analytics, progress]);

  const handleGenerateCustomCourse = async (name?: string) => {
    const courseName = name || customCourseName;
    if (!courseName.trim() || isGeneratingCourse) return;

    setIsGeneratingCourse(true);
    try {
      const correctRes = await subjectsAPI.correctName(courseName.trim());
      const cleanName = correctRes.corrected || courseName.trim();
      toast.info(`Creating course: "${cleanName}"`);
      const result = await subjectsAPI.create({
        name: cleanName,
        education_level: profile?.education_level || "professional",
        auto_generate_topics: true
      });
      if (result && result.id) await studentAPI.enrollSubject(result.id);
      setCustomCourseName('');
      queryClient.invalidateQueries({ queryKey: ['student', 'subjects'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'enrolled-subjects'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'profile'] });
      toast.success('Course generated and enrolled successfully!');
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.message || 'Failed to generate course';
      toast.error(message);
      setIsGeneratingCourse(false);
    } finally {
      if (isGeneratingCourse) setTimeout(() => setIsGeneratingCourse(false), 5000);
    }
  };

  useEffect(() => {
    if (isLoading || !subjects.length) return;
    const lastSubjectId = localStorage.getItem('edunexus_last_subject_id');
    const lastTopicId = localStorage.getItem('edunexus_last_topic_id');
    if (lastSubjectId && lastTopicId && !selectedSubject) {
      const subject = subjects.find((s: Subject) => s.id === lastSubjectId);
      if (subject) handleSubjectSelect(subject);
    }
  }, [isLoading, subjects, selectedSubject, handleSubjectSelect]);

  useEffect(() => {
    if (isLoading || !topics.length) return;
    const lastTopicId = localStorage.getItem('edunexus_last_topic_id');
    const lastSubjectId = localStorage.getItem('edunexus_last_subject_id');
    if (lastTopicId && !selectedTopic && selectedSubject?.id === lastSubjectId) {
      const topic = topics.find((t: any) => t.id === lastTopicId);
      const subject = subjects.find((s: Subject) => s.id === lastSubjectId);
      if (topic && subject) {
        handleTopicSelect(topic, subject);
        setActiveView('learn');
      }
    }
  }, [isLoading, topics, subjects, selectedTopic, handleTopicSelect]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [messages, isLoading]);

  const profileWithBrainPower = profile ? { ...profile, ...(brainPowerData || {}), brain_power: brainPower } : profile;
  const energy = brainPower;

  return (
    <div className="h-dvh bg-subtle flex w-full relative overflow-hidden">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <StudentSidebar
        activeView={activeView}
        setActiveView={setActiveView}
        sidebarOpen={sidebarOpen}
        profile={profileWithBrainPower}
      />

      <main className="min-w-0 flex-1 flex flex-col h-full overflow-hidden relative">
        <StudentHeader
          user={user}
          profile={profileWithBrainPower}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          onLogout={onLogout}
          setActiveView={setActiveView}
          getFullName={getFullName}
          getAgeAppropriateGreeting={getAgeAppropriateGreeting}
          avatarUrl={avatarUrl}
        />

        <div className="flex-1 overflow-hidden relative flex flex-col">
          {isLoading && activeView === 'dashboard' ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            </div>
          ) : (
            activeView === 'learn' ? (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <StudentViewRouter
                   activeView={activeView} isLoading={isLoading} profile={profileWithBrainPower} energy={energy}
                   getLearningStyleLabel={getLearningStyleLabel} setActiveView={setActiveView}
                   liveSessions={liveSessions} upcomingSessions={upcomingSessions}
                   handleJoinSession={(s) => handleJoinSession(s, onJoinSession)} formatDate={formatDate}
                   showAIPanel={showAIPanel} setShowAIPanel={setShowAIPanel} selectedTopic={selectedTopic}
                   selectedSubject={selectedSubject} roadmap={roadmap} viewingSubtopic={viewingSubtopic}
                   setViewingSubtopic={setViewingSubtopic} handleSubtopicClick={handleSubtopicClick}
                   showMasteryTest={showMasteryTest} activeSubtopic={activeSubtopic} messages={messages}
                   aiState={aiState} lessonController={lessonController} avatarUrl={avatarUrl} user={user}
                   handleAIContinue={handleAIContinue} subjects={subjects} enrolledSubjects={enrolledSubjects}
                   handleSubjectSelect={handleSubjectSelect} handleTopicSelect={handleTopicSelect}
                   suggestedVideos={suggestedVideos} setSelectedVideo={setSelectedVideo} setProfile={setProfile}
                   suggestedTopics={suggestedTopics} weaknessAreas={weaknessAreas} topics={topics}
                   roadmapLoading={roadmapLoading} structuredTopics={structuredTopics} isStructuredLoading={isStructuredLoading}
                   scrollAreaRef={scrollAreaRef} onMasteryTestComplete={async (r) => { await onMasteryTestComplete(r); await refetchStructured(); }}
                   startQuiz={startQuiz} dismissQuizConfirm={dismissQuizConfirm}
                   placementState={placementState} startPlacementCheck={startPlacementCheck}
                   submitPlacementCheck={submitPlacementCheck} acceptPlacementRecommendation={acceptPlacementRecommendation}
                   cancelPlacementCheck={cancelPlacementCheck} lockedLessonNotice={lockedLessonNotice}
                   openCurrentUnlockedLesson={openCurrentUnlockedLesson}
                   getFullName={getFullName} tutorGender={tutorGender} setTutorGender={setTutorGender}
                   materials={materials} handleEnroll={handleEnroll} handleDeleteMaterial={handleDeleteMaterial}
                   customCourseName={customCourseName} setCustomCourseName={setCustomCourseName} isGeneratingCourse={isGeneratingCourse}
                   handleGenerateCustomCourse={handleGenerateCustomCourse} isEditingProfile={isEditingProfile}
                   setIsEditingProfile={setIsEditingProfile} profileFormData={profileFormData}
                   setProfileFormData={setProfileFormData} setAvatarUrl={setAvatarUrl} startAssessment={startAssessment}
                   progress={progressForView} radarData={radarData} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                />
              </div>
            ) : (
              <ScrollArea className="flex-1 h-full">
                <div className="w-full max-w-7xl mx-auto px-3 py-4 pb-24 sm:p-4 md:p-6 md:pb-8">
                  <StudentViewRouter
                     activeView={activeView} isLoading={isLoading} profile={profileWithBrainPower} energy={energy}
                     getLearningStyleLabel={getLearningStyleLabel} setActiveView={setActiveView}
                     liveSessions={liveSessions} upcomingSessions={upcomingSessions}
                     handleJoinSession={(s) => handleJoinSession(s, onJoinSession)} formatDate={formatDate}
                     showAIPanel={showAIPanel} setShowAIPanel={setShowAIPanel} selectedTopic={selectedTopic}
                     selectedSubject={selectedSubject} roadmap={roadmap} viewingSubtopic={viewingSubtopic}
                     setViewingSubtopic={setViewingSubtopic} handleSubtopicClick={handleSubtopicClick}
                     showMasteryTest={showMasteryTest} activeSubtopic={activeSubtopic} messages={messages}
                     aiState={aiState} lessonController={lessonController} avatarUrl={avatarUrl} user={user}
                     handleAIContinue={handleAIContinue} subjects={subjects} enrolledSubjects={enrolledSubjects}
                     handleSubjectSelect={handleSubjectSelect} handleTopicSelect={handleTopicSelect}
                     suggestedVideos={suggestedVideos} setSelectedVideo={setSelectedVideo} setProfile={setProfile}
                     suggestedTopics={suggestedTopics} weaknessAreas={weaknessAreas} topics={topics}
                     roadmapLoading={roadmapLoading} structuredTopics={structuredTopics} isStructuredLoading={isStructuredLoading}
                     scrollAreaRef={scrollAreaRef} onMasteryTestComplete={async (r) => { await onMasteryTestComplete(r); await refetchStructured(); }}
                     startQuiz={startQuiz} dismissQuizConfirm={dismissQuizConfirm}
                     placementState={placementState} startPlacementCheck={startPlacementCheck}
                     submitPlacementCheck={submitPlacementCheck} acceptPlacementRecommendation={acceptPlacementRecommendation}
                     cancelPlacementCheck={cancelPlacementCheck} lockedLessonNotice={lockedLessonNotice}
                     openCurrentUnlockedLesson={openCurrentUnlockedLesson}
                     getFullName={getFullName} tutorGender={tutorGender} setTutorGender={setTutorGender}
                     materials={materials} handleEnroll={handleEnroll} handleDeleteMaterial={handleDeleteMaterial}
                     customCourseName={customCourseName} setCustomCourseName={setCustomCourseName} isGeneratingCourse={isGeneratingCourse}
                     handleGenerateCustomCourse={handleGenerateCustomCourse} isEditingProfile={isEditingProfile}
                     setIsEditingProfile={setIsEditingProfile} profileFormData={profileFormData}
                     setProfileFormData={setProfileFormData} setAvatarUrl={setAvatarUrl} startAssessment={startAssessment}
                     progress={progressForView} radarData={radarData} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                  />
                </div>
              </ScrollArea>
            )
          )}
        </div>
      </main>

      <UploadMaterialModal
        showUploadModal={false} // Trigger handles modal now
        setShowUploadModal={() => { }}
        uploadSubject=""
        setUploadSubject={() => { }}
        enrolledSubjects={enrolledSubjects}
        subjects={subjects}
        uploadFile={null}
        setUploadFile={() => { }}
        uploading={false}
        handleUpload={() => { }}
      />

      <LearningStyleAssessmentModal
        showLearningStyleModal={showLearningStyleModal}
        setShowLearningStyleModal={setShowLearningStyleModal}
        assessmentStep={assessmentStep}
        learningStyleQuestions={learningStyleQuestions}
        handleAssessmentAnswer={handleAssessmentAnswer}
        isUpdating={isUpdating}
      />
    </div>
  );
};

export default StudentDashboard;
