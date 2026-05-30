import React from 'react';
import type { ViewType, Subject, Session } from '../types';
import { DashboardHome } from '../dashboard/DashboardHome';
import { AIChatSection } from '../ai-tutor/AIChatSection';
import { SessionsView } from '../sessions/SessionsView';
import { SubjectsView } from '../learning/SubjectsView';
import MockExamsView from '../learning/MockExamsView';
import { ProgressView } from '../dashboard/ProgressView';
import { ProfileView } from '../profile/ProfileView';
import { MessagingView } from '@/components/messaging/MessagingView';
import { StudentEmptyState, StudentPageSkeleton } from './StudentStatePanel';

interface StudentViewRouterProps {
  activeView: ViewType;
  isLoading: boolean;
  error?: string | null;
  profile: any;
  energy: number;
  getLearningStyleLabel: (style?: string) => { label: string; desc: string };
  setActiveView: (view: ViewType) => void;
  liveSessions: Session[];
  upcomingSessions: Session[];
  handleJoinSession: (s: any) => void;
  formatDate: (d: any) => string;
  // Tutor props
  showAIPanel: boolean;
  setShowAIPanel: (val: boolean) => void;
  selectedTopic: any;
  selectedSubject: Subject | null;
  roadmap: any;
  viewingSubtopic: any;
  setViewingSubtopic: (val: any) => void;
  handleSubtopicClick: (st: any) => Promise<void>;
  showMasteryTest: boolean;
  activeSubtopic: string | undefined;
  messages: any[];
  aiState: any;
  lessonController?: any;
  avatarUrl: string | null;
  user: any;
  handleAIContinue: (msg: string) => Promise<void>;
  subjects: Subject[];
  enrolledSubjects: string[];
  handleSubjectSelect: (subject: any) => Promise<void>;
  handleTopicSelect: (topic: any, subject?: any) => Promise<void>;
  suggestedVideos: any[];
  videoSupportState?: any;
  setSelectedVideo: (v: any) => void;
  setProfile: (p: any) => void;
  suggestedTopics: any[];
  weaknessAreas: string[];
  topics: any[];
  roadmapLoading: boolean;
  structuredTopics: any[];
  isStructuredLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onMasteryTestComplete: (r: any) => Promise<void>;
  startQuiz: (topic?: any, subject?: any) => void;
  dismissQuizConfirm: () => void;
  placementState?: any;
  lockedLessonNotice?: any;
  startPlacementCheck?: (targetTopic: any) => Promise<void>;
  submitPlacementCheck?: (answersByQuestionId: Record<string, string>) => Promise<void>;
  acceptPlacementRecommendation?: () => Promise<void>;
  cancelPlacementCheck?: () => void;
  openCurrentUnlockedLesson?: () => Promise<void>;
  getFullName: () => string;
  tutorGender: 'male' | 'female';
  setTutorGender: (val: 'male' | 'female') => void;
  handleEnroll: (id: string, enrolled: boolean) => Promise<void>;
  customCourseName: string;
  setCustomCourseName: (val: string) => void;
  isGeneratingCourse: boolean;
  handleGenerateCustomCourse: (name?: string) => Promise<void>;
  // Profile props
  isEditingProfile: boolean;
  setIsEditingProfile: (val: boolean) => void;
  profileFormData: any;
  setProfileFormData: (val: any) => void;
  setAvatarUrl: (val: string | null) => void;
  startAssessment: () => void;
  progress: any;
  radarData: any[];
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  examHistoryInsights?: any;
}

export const StudentViewRouter: React.FC<StudentViewRouterProps> = ({
  activeView, isLoading, error, profile, energy, getLearningStyleLabel,
  setActiveView, liveSessions, upcomingSessions, handleJoinSession,
  formatDate, showAIPanel, setShowAIPanel, selectedTopic, selectedSubject,
  roadmap, viewingSubtopic, setViewingSubtopic, handleSubtopicClick,
  showMasteryTest, activeSubtopic, messages, aiState, lessonController, avatarUrl, user,
  handleAIContinue, subjects, enrolledSubjects,
  handleSubjectSelect, handleTopicSelect, suggestedVideos, videoSupportState, setSelectedVideo,
  setProfile, suggestedTopics, weaknessAreas, topics,
  roadmapLoading, structuredTopics, isStructuredLoading, scrollAreaRef, onMasteryTestComplete,
  startQuiz, dismissQuizConfirm, placementState, startPlacementCheck, submitPlacementCheck,
  acceptPlacementRecommendation, cancelPlacementCheck, lockedLessonNotice, openCurrentUnlockedLesson,
  getFullName, tutorGender, setTutorGender, handleEnroll, customCourseName,
  setCustomCourseName, isGeneratingCourse, handleGenerateCustomCourse,
  isEditingProfile, setIsEditingProfile, profileFormData, setProfileFormData,
  setAvatarUrl, startAssessment, progress, radarData, searchQuery, setSearchQuery, examHistoryInsights
}) => {
  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': return isLoading ? (
        <StudentPageSkeleton
          title="Learning Overview"
          subtitle="Loading dashboard signals and recent activity."
          cards={4}
        />
      ) : error && !profile ? (
        <StudentEmptyState
          title="We are reconnecting to your dashboard"
          description="Your learner summary did not settle yet. Give EduNexus a moment, then reopen this page and your study signals should return."
        />
      ) : (
        <DashboardHome
          profile={profile}
          energy={energy}
          getLearningStyleLabel={getLearningStyleLabel}
          setActiveView={setActiveView}
          loading={isLoading}
          liveSessions={liveSessions}
          upcomingSessions={upcomingSessions}
          handleJoinSession={handleJoinSession}
          formatDate={formatDate}
          examHistoryInsights={examHistoryInsights}
        />
      );
      case 'learn': return <AIChatSection
        tutorGender={tutorGender}
        setTutorGender={setTutorGender}
        showAIPanel={showAIPanel}
        setShowAIPanel={setShowAIPanel}
        selectedTopic={selectedTopic}
        selectedSubject={selectedSubject}
        roadmap={roadmap}
        viewingSubtopic={viewingSubtopic}
        setViewingSubtopic={setViewingSubtopic}
        handleSubtopicClick={handleSubtopicClick}
        showMasteryTest={showMasteryTest}
        dismissQuizConfirm={dismissQuizConfirm}
        activeSubtopic={activeSubtopic}
        aiChatMessages={messages}
        aiLoading={aiState.status === 'chatting'}
        lessonController={lessonController}
        aiState={aiState}
        avatarUrl={avatarUrl}
        profile={profile}
        user={user}
        handleAIContinue={handleAIContinue}
        subjects={subjects}
        enrolledSubjects={enrolledSubjects}
        handleSubjectSelect={handleSubjectSelect}
        handleTopicSelect={(t: any) => handleTopicSelect(t, selectedSubject)}
        suggestedVideos={suggestedVideos}
        videoSupportState={videoSupportState}
        setSelectedVideo={setSelectedVideo}
        setEnergy={(val: any) => {
          const current = profile?.brain_power ?? 100;
          const next = typeof val === 'function' ? val(current) : val;
          setProfile({ ...profile, brain_power: next } as any);
        }}
        suggestedTopics={suggestedTopics}
        weaknessAreas={weaknessAreas}
        progress={progress}
        setActiveView={setActiveView}
        loading={isLoading}
        topics={topics}
        roadmapLoading={roadmapLoading}
        structuredTopics={structuredTopics}
        isStructuredLoading={isStructuredLoading}
        scrollAreaRef={scrollAreaRef}
        onMasteryTestComplete={onMasteryTestComplete}
        startQuiz={startQuiz}
        placementState={placementState}
        lockedLessonNotice={lockedLessonNotice}
        startPlacementCheck={startPlacementCheck}
        submitPlacementCheck={submitPlacementCheck}
        acceptPlacementRecommendation={acceptPlacementRecommendation}
        cancelPlacementCheck={cancelPlacementCheck}
        openCurrentUnlockedLesson={openCurrentUnlockedLesson}
        getFullName={getFullName}
      />;
      case 'sessions': return isLoading ? (
        <StudentPageSkeleton
          title="Classes"
          subtitle="Loading live and upcoming classes."
          cards={3}
        />
      ) : (
        <SessionsView
          searchQuery=""
          setSearchQuery={() => { }}
          upcomingSessions={upcomingSessions}
          liveSessions={liveSessions}
          handleJoinSession={handleJoinSession}
        />
      );
      case 'subjects': return <SubjectsView
        subjects={subjects}
        enrolledSubjects={enrolledSubjects}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        loading={isLoading}
        error={error}
        handleEnroll={handleEnroll}
        user={user}
        profile={profile}
        customCourseName={customCourseName}
        setCustomCourseName={setCustomCourseName}
        isGeneratingCourse={isGeneratingCourse}
        handleGenerateCustomCourse={() => handleGenerateCustomCourse()}
      />;
      case 'mock-exams': return <MockExamsView />;
      case 'progress': return isLoading ? (
        <StudentPageSkeleton
          title="Learning Analytics"
          subtitle="Loading mastery, activity, and growth trends."
          cards={3}
        />
      ) : error && !progress && radarData.length === 0 ? (
        <StudentEmptyState
          title="We are reconnecting to your analytics"
          description="Your progress signals are still loading back in. Give EduNexus a moment and this view should recover without losing any learning history."
        />
      ) : (
        <ProgressView progress={progress} radarData={radarData} error={error} profile={profile} examHistoryInsights={examHistoryInsights} />
      );
      case 'profile': return <ProfileView
        user={user}
        profile={profile}
        setProfile={setProfile}
        isEditingProfile={isEditingProfile}
        setIsEditingProfile={setIsEditingProfile}
        profileFormData={profileFormData as any}
        setProfileFormData={setProfileFormData as any}
        avatarUrl={avatarUrl}
        setAvatarUrl={setAvatarUrl}
        subjects={subjects}
        enrolledSubjects={enrolledSubjects}
        getLearningStyleLabel={getLearningStyleLabel}
        startAssessment={startAssessment}
        handleGenerateCustomCourse={handleGenerateCustomCourse}
        isGeneratingCourse={isGeneratingCourse}
      />;
      case 'messages': return <MessagingView currentUser={user} />;
      default: return null;
    }
  };

  return renderContent();
};


