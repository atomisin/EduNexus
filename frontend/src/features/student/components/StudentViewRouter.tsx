import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ViewType, Subject, Session } from '../types';
import { DashboardHome } from '../dashboard/DashboardHome';
import { AIChatSection } from '../ai-tutor/AIChatSection';
import { QuizView } from '../ai-tutor/QuizView';
import { SessionsView } from '../sessions/SessionsView';
import { SubjectsView } from '../learning/SubjectsView';
import MockExamsView from '../learning/MockExamsView';
import { ProgressView } from '../dashboard/ProgressView';
import { ProfileView } from '../profile/ProfileView';
import { MessagingView } from '@/components/messaging/MessagingView';

interface StudentViewRouterProps {
  activeView: ViewType;
  isLoading: boolean;
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
  avatarUrl: string | null;
  user: any;
  showMasteryConfirm: boolean;
  handleAIContinue: (msg: string) => Promise<void>;
  subjects: Subject[];
  enrolledSubjects: string[];
  handleSubjectSelect: (subject: any) => Promise<void>;
  handleTopicSelect: (topic: any, subject?: any) => Promise<void>;
  suggestedVideos: any[];
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
  getFullName: () => string;
  // Subjects props
  materials: any[];
  handleEnroll: (id: string, enrolled: boolean) => Promise<void>;
  handleDeleteMaterial: (id: string) => Promise<void>;
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
}

export const StudentViewRouter: React.FC<StudentViewRouterProps> = ({
  activeView, isLoading, profile, energy, getLearningStyleLabel,
  setActiveView, liveSessions, upcomingSessions, handleJoinSession,
  formatDate, showAIPanel, setShowAIPanel, selectedTopic, selectedSubject,
  roadmap, viewingSubtopic, setViewingSubtopic, handleSubtopicClick,
  showMasteryTest, activeSubtopic, messages, aiState, avatarUrl, user,
  showMasteryConfirm, handleAIContinue, subjects, enrolledSubjects,
  handleSubjectSelect, handleTopicSelect, suggestedVideos, setSelectedVideo,
  setProfile, suggestedTopics, weaknessAreas, topics,
  roadmapLoading, structuredTopics, isStructuredLoading, scrollAreaRef, onMasteryTestComplete,
  startQuiz, dismissQuizConfirm, getFullName, materials, handleEnroll, handleDeleteMaterial, customCourseName,
  setCustomCourseName, isGeneratingCourse, handleGenerateCustomCourse,
  isEditingProfile, setIsEditingProfile, profileFormData, setProfileFormData,
  setAvatarUrl, startAssessment, progress, radarData, searchQuery, setSearchQuery
}) => {
  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': return isLoading ? (
        <div className="flex items-center justify-center h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
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
        />
      );
      case 'learn': return <AIChatSection
        tutorGender="female"
        setTutorGender={() => { }}
        showAIPanel={showAIPanel}
        setShowAIPanel={setShowAIPanel}
        selectedTopic={selectedTopic}
        selectedSubject={selectedSubject}
        roadmap={roadmap}
        viewingSubtopic={viewingSubtopic}
        setViewingSubtopic={setViewingSubtopic}
        handleSubtopicClick={handleSubtopicClick}
        showMasteryTest={showMasteryTest}
        setShowMasteryTest={startQuiz}
        dismissQuizConfirm={dismissQuizConfirm}
        activeSubtopic={activeSubtopic}
        aiChatMessages={messages}
        aiLoading={aiState.status === 'chatting'}
        aiState={aiState}
        avatarUrl={avatarUrl}
        profile={profile}
        user={user}
        showMasteryConfirm={showMasteryConfirm}
        handleAIContinue={handleAIContinue}
        subjects={subjects}
        enrolledSubjects={enrolledSubjects}
        handleSubjectSelect={handleSubjectSelect}
        handleTopicSelect={(t: any) => handleTopicSelect(t, selectedSubject)}
        suggestedVideos={suggestedVideos}
        setSelectedVideo={setSelectedVideo}
        setEnergy={(val: any) => {
          const current = profile?.brain_power ?? 100;
          const next = typeof val === 'function' ? val(current) : val;
          setProfile({ ...profile, brain_power: next } as any);
        }}
        suggestedTopics={suggestedTopics}
        weaknessAreas={weaknessAreas}
        setActiveView={setActiveView}
        loading={isLoading}
        topics={topics}
        roadmapLoading={roadmapLoading}
        structuredTopics={structuredTopics}
        isStructuredLoading={isStructuredLoading}
        scrollAreaRef={scrollAreaRef}
        onMasteryTestComplete={onMasteryTestComplete}
        getFullName={getFullName}
      />;
      case 'quiz': return <QuizView
        selectedTopic={selectedTopic}
        handleAIContinue={handleAIContinue}
        subjects={subjects}
        enrolledSubjects={enrolledSubjects}
        selectedSubject={selectedSubject}
        handleSubjectSelect={handleSubjectSelect}
        topics={topics}
        setSelectedTopic={(t: any) => handleTopicSelect(t, selectedSubject)} 
        setActiveView={setActiveView}
        setShowAIPanel={setShowAIPanel}
        setShowMasteryTest={startQuiz}
        progress={progress}
        profile={profile}
      />;
      case 'sessions': return isLoading ? (
        <div className="flex items-center justify-center h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
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
        handleEnroll={handleEnroll}
        materials={materials}
        expandedSubjectId={null}
        setExpandedSubjectId={() => { }}
        handleDeleteMaterial={handleDeleteMaterial}
        user={user}
        profile={profile}
        customCourseName={customCourseName}
        setCustomCourseName={setCustomCourseName}
        isGeneratingCourse={isGeneratingCourse}
        handleGenerateCustomCourse={() => handleGenerateCustomCourse()}
        setUploadSubject={() => { }}
        setShowUploadModal={() => { }}
      />;
      case 'mock-exams': return <MockExamsView />;
      case 'progress': return <ProgressView progress={progress} radarData={radarData} />;
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
      />;
      case 'messages': return <MessagingView currentUser={user} />;
      default: return null;
    }
  };

  return renderContent();
};
