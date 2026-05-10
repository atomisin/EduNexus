import { Sparkles, Brain, X, Target, CheckCircle2, Lock, Play, RefreshCw, Trophy, Zap, Star, Video, BookMarked, Loader2, Layers, Repeat, FileText, Activity, BookOpen, Clock, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import MathText from '@/components/MathText';
import { normalizeAcademicTextForDisplay } from '@/utils/academicText';
import { AIMasteryTest } from './AIMasteryTest';
import { BrainPowerCard } from '@/features/student/learning/BrainPowerCard';
import type { BrainPowerCardData } from '@/features/student/learning/BrainPowerCard';
import { useReadingRecommendations } from '@/features/student/hooks/useReadingRecommendations';
import { useTopicProgress } from '@/features/student/hooks/useTopicProgress';
import { useTTS } from '@/features/student/hooks/useTTS';
import { useSpeechRecognition } from '@/features/student/hooks/useSpeechRecognition';
import { getPersonaEmoji, getPersonaName } from '@/features/student/utils/personaUtils';
import React, { useCallback, useEffect, useState } from 'react';

const renderRichText = (value: string) => {
  const parts = value.split(/(\+\+[^+]+\+\+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('++') && part.endsWith('++')) {
      return (
        <span key={`${part}-${index}`} className="underline decoration-primary/70 decoration-2 underline-offset-4 font-semibold">
          <MathText>{part.slice(2, -2)}</MathText>
        </span>
      );
    }
    return <MathText key={`${part}-${index}`}>{part}</MathText>;
  });
};

const renderMathChildren = (children: React.ReactNode): React.ReactNode =>
  React.Children.map(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return renderRichText(String(child));
    }
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{ children?: React.ReactNode }>;
      return React.cloneElement(element, {
        children: renderMathChildren(element.props.children),
      });
    }
    return child;
  });

const mathMarkdownComponents = {
  h1: ({ children }: any) => <h3 className="mb-3 min-w-0 break-words text-lg font-black tracking-normal text-slate-950 [overflow-wrap:anywhere] dark:text-white">{renderMathChildren(children)}</h3>,
  h2: ({ children }: any) => <h3 className="mb-3 min-w-0 break-words text-lg font-black tracking-normal text-slate-950 [overflow-wrap:anywhere] dark:text-white">{renderMathChildren(children)}</h3>,
  h3: ({ children }: any) => <h4 className="mb-2 min-w-0 break-words text-base font-black tracking-normal text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">{renderMathChildren(children)}</h4>,
  p: ({ children }: any) => <p className="mb-3 min-w-0 break-words [overflow-wrap:anywhere] last:mb-0">{renderMathChildren(children)}</p>,
  ul: ({ children }: any) => <ul className="my-3 ml-5 min-w-0 list-disc space-y-1.5 marker:text-primary">{children}</ul>,
  ol: ({ children }: any) => <ol className="my-3 ml-5 min-w-0 list-decimal space-y-1.5 marker:text-primary marker:font-bold">{children}</ol>,
  li: ({ children }: any) => <li className="min-w-0 break-words pl-1 [overflow-wrap:anywhere]">{renderMathChildren(children)}</li>,
  strong: ({ children }: any) => <strong className="font-black text-slate-950 dark:text-white">{renderMathChildren(children)}</strong>,
  em: ({ children }: any) => <em className="italic text-slate-700 dark:text-slate-200">{renderMathChildren(children)}</em>,
  code: ({ children }: any) => <code className="whitespace-pre-wrap break-words rounded bg-slate-100 px-1.5 py-0.5 text-sm font-semibold text-slate-800 [overflow-wrap:anywhere] dark:bg-slate-900 dark:text-slate-100">{children}</code>,
  blockquote: ({ children }: any) => <blockquote className="my-3 border-l-4 border-primary/50 pl-4 text-slate-600 dark:text-slate-300">{children}</blockquote>,
};

const PLACEHOLDER_TOPIC_NAMES = new Set(['CLASS', 'SUBJECT', 'TERM', 'TOPIC', 'TOPICS']);

const isRealLearningTopic = (topic: any) => {
  const name = String(topic?.name || '').trim();
  return Boolean(name) && !PLACEHOLDER_TOPIC_NAMES.has(name.toUpperCase());
};

const openTutorFromSelection = (
  selectedTopic: any,
  setShowAIPanel: (val: boolean) => void,
  handleAIContinue: (message: string) => Promise<void>,
  aiChatMessages: any[],
) => {
  if (!selectedTopic) return;
  setShowAIPanel(true);
  if (aiChatMessages.length === 0) {
    void handleAIContinue(`Start tutoring me on ${selectedTopic.name}. Give me the goal, the core idea, and one quick check question.`);
  }
};

interface AIChatSectionProps {
  tutorGender: 'male' | 'female';
  setTutorGender: (val: 'male' | 'female') => void;
  showAIPanel: boolean;
  setShowAIPanel: (val: boolean) => void;
  selectedTopic: any;
  selectedSubject: any;
  roadmap: any;
  viewingSubtopic: string | null;
  setViewingSubtopic: (val: string | null) => void;
  handleSubtopicClick: (st: any) => Promise<void>;
  showMasteryTest: boolean;
  activeSubtopic: string | undefined;
  aiChatMessages: any[];
  avatarUrl: string | null;
  profile: any;
  user: any;
  aiLoading: boolean;
  lessonController?: any;
  handleAIContinue: (msg: string) => Promise<void>;
  isCheckingUnderstanding?: boolean;
  subjects: any[];
  enrolledSubjects: string[];
  handleSubjectSelect: (subject: any) => Promise<void>;
  handleTopicSelect: (topic: any) => Promise<void>;
  suggestedVideos: any[];
  setSelectedVideo: (video: any) => void;
  setEnergy: (val: any) => void;
  suggestedTopics: any[];
  weaknessAreas: string[];
  setActiveView: (view: any) => void;
  loading: boolean;
  topics: any[];
  roadmapLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onMasteryTestComplete: (evalResult: any) => Promise<void>;
  getFullName: () => string;
  structuredTopics?: any[];
  isStructuredLoading?: boolean;
  dismissQuizConfirm?: () => void;
  aiState?: any;
  placementState?: any;
  lockedLessonNotice?: any;
  startPlacementCheck?: (targetTopic: any) => Promise<void>;
  submitPlacementCheck?: (answersByQuestionId: Record<string, string>) => Promise<void>;
  acceptPlacementRecommendation?: () => Promise<void>;
  cancelPlacementCheck?: () => void;
  openCurrentUnlockedLesson?: () => Promise<void>;
}

export const AIChatSection = ({
  tutorGender,
  setTutorGender,
  showAIPanel,
  setShowAIPanel,
  selectedTopic,
  selectedSubject,
  roadmap,
  viewingSubtopic,
  setViewingSubtopic,
  handleSubtopicClick,
  showMasteryTest,
  activeSubtopic,
  aiChatMessages,
  avatarUrl,
  profile,
  user,
  aiLoading,
  lessonController,
  handleAIContinue,
  isCheckingUnderstanding = false,
  subjects,
  enrolledSubjects,
  handleSubjectSelect,
  handleTopicSelect,
  suggestedVideos,
  setSelectedVideo,
  setEnergy,
  suggestedTopics,
  weaknessAreas,
  setActiveView,
  loading,
  topics,
  roadmapLoading,
  scrollAreaRef,
  onMasteryTestComplete,
  getFullName,
  structuredTopics = [],
  isStructuredLoading = false,
  dismissQuizConfirm = () => {},
  aiState = { status: 'idle' },
  placementState = { status: 'idle' },
  lockedLessonNotice = null,
  startPlacementCheck = async () => {},
  submitPlacementCheck = async () => {},
  acceptPlacementRecommendation = async () => {},
  cancelPlacementCheck = () => {},
  openCurrentUnlockedLesson = async () => {}
}: AIChatSectionProps) => {
  const { getTopicProgress } = useTopicProgress();
  const { speak, stop, isYoungLearner, isSpeechSupported, isSpeaking } = useTTS(profile?.education_level, tutorGender);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [placementAnswers, setPlacementAnswers] = useState<Record<string, string>>({});
  const [chatInput, setChatInput] = useState('');

  const appendVoiceTranscript = useCallback((transcript: string) => {
    setChatInput((current) => {
      const prefix = current.trim();
      return `${prefix ? `${prefix} ` : ''}${transcript}`.trim();
    });
  }, []);

  const {
    isSpeechRecognitionSupported,
    isListening,
    interimTranscript,
    speechError,
    toggleListening,
  } = useSpeechRecognition({ onTranscript: appendVoiceTranscript });

  const topicsForCurrentSubject = structuredTopics.filter(
    (t: any) => isRealLearningTopic(t) && (!selectedSubject || !t.subject_id || t.subject_id === selectedSubject.id)
  );
  const visibleTopics = topics.filter(isRealLearningTopic);

  const isCurrentTopicCompleted = topicsForCurrentSubject.find((st: any) => st.id === selectedTopic?.id)?.status === 'completed';
  const focusTopicLabel = (typeof viewingSubtopic === 'object' ? (viewingSubtopic as any)?.name : viewingSubtopic) || activeSubtopic || selectedTopic?.name || 'this topic';
  const conversationTurns = aiChatMessages.filter((m: any) => m.role === 'user').length;
  const lessonStageLabel = (lessonController?.stage || 'intro').replace(/_/g, ' ');
  const learnerActions = [
    { label: 'Step by step', icon: Layers, prompt: `Teach ${focusTopicLabel} step by step. Start from the basics, then give me one small thing to try.` },
    { label: 'Example', icon: Star, prompt: `Give me a real-world Nigerian example for ${focusTopicLabel}, then ask me one quick check question.` },
    { label: "I'm stuck", icon: Zap, prompt: `I'm stuck on ${focusTopicLabel}. Explain it a different way using smaller steps and one analogy.` },
    { label: 'Quiz me', icon: Target, prompt: `Quiz me on ${focusTopicLabel}. Ask exactly one question first and wait for my answer before explaining.` },
    { label: 'Summarize', icon: FileText, prompt: `Summarize what I need to remember about ${focusTopicLabel} in a short study note with three key points.` },
  ];

  const submitChatInput = useCallback(async () => {
    const message = chatInput.trim();
    if (!message || showMasteryTest || aiLoading || isCurrentTopicCompleted) return;
    setChatInput('');
    await handleAIContinue(message);
  }, [aiLoading, chatInput, handleAIContinue, isCurrentTopicCompleted, showMasteryTest]);

  const displaySubjects = enrolledSubjects.length > 0
    ? subjects.filter(s => enrolledSubjects.some((e: any) => (e.id || e) === s.id))
    : subjects;

  // Auto-speak new AI messages for young learners
  useEffect(() => {
    const lastMessage = aiChatMessages[aiChatMessages.length - 1];
    if (lastMessage?.role === 'ai') {
      speak(lastMessage.content);
    }
  }, [aiChatMessages, speak]);

  useEffect(() => {
    if (placementState?.status === 'active') {
      setPlacementAnswers({});
    }
  }, [placementState?.status, placementState?.target_topic?.id]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {!showAIPanel && (
        <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 sm:px-6 shrink-0">
          <h2 className="min-w-0 flex items-center gap-2 text-base font-semibold tracking-tight sm:text-2xl">
            <img src={`/avatars/ai_tutor_${tutorGender}.png`} alt="AI Tutor" className="h-7 w-7 shrink-0 rounded-full border border-teal-200 sm:h-8 sm:w-8" />
            <span className="truncate">AI Tutoring Center</span>
          </h2>
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => setTutorGender('female')}
                className={`rounded-full px-2 py-1 text-[11px] font-medium transition-all sm:px-3 sm:text-xs ${tutorGender === 'female' ? 'bg-white dark:bg-slate-700 shadow-none text-teal-600' : 'text-slate-500'}`}
              >
                Female
              </button>
              <button
                onClick={() => setTutorGender('male')}
                className={`rounded-full px-2 py-1 text-[11px] font-medium transition-all sm:px-3 sm:text-xs ${tutorGender === 'male' ? 'bg-white dark:bg-slate-700 shadow-none text-teal-600' : 'text-slate-500'}`}
              >
                Male
              </button>
            </div>
            {selectedTopic && !showAIPanel && (
              <Button
                onClick={() => openTutorFromSelection(selectedTopic, setShowAIPanel, handleAIContinue, aiChatMessages)}
                size="sm"
                className="shrink-0 gap-1.5 rounded-lg bg-primary px-3 shadow-none hover:bg-primary/90 sm:gap-2 sm:px-4"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Start Tutoring</span>
                <span className="sm:hidden">Start</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {showAIPanel ? (
        <Card className="flex-1 flex flex-col shadow-none border-0 overflow-hidden bg-white dark:bg-slate-900 min-h-0">
          <CardHeader className="min-h-14 h-auto py-2 px-3 sm:px-6 border-b bg-white dark:bg-slate-900 z-10 shrink-0 flex items-center justify-center">
            <div className="flex items-center justify-between w-full gap-2">
              <div className="min-w-0 flex items-center gap-2 sm:gap-3">
                <Avatar className="w-8 h-8 sm:w-12 sm:h-12 border-2 border-teal-100 dark:border-teal-900 shadow-none">
                  <AvatarImage src={avatarUrl || ''} />
                  <AvatarFallback className="bg-teal-50 text-teal-600">
                    <Brain className="w-5 h-5 sm:w-6 sm:h-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 max-w-[4.8rem] min-[360px]:max-w-[6rem] sm:max-w-none flex flex-col">
                  <CardTitle className="block text-sm sm:text-xl font-bold text-slate-800 dark:text-slate-100 leading-none mb-0.5 truncate whitespace-nowrap">
                    {getPersonaName(profile?.education_level)} {getPersonaEmoji(profile?.education_level)}
                  </CardTitle>
                  <p className="text-[10px] sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 leading-none truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="truncate">Online</span>
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1 sm:gap-3">
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-full border border-slate-100 dark:border-slate-700 sm:mr-2">
                  <button
                    onClick={() => setTutorGender('female')}
                    className={`px-2 sm:px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight transition-all ${tutorGender === 'female' ? 'bg-white dark:bg-slate-700 shadow-none text-teal-600' : 'text-slate-400'}`}
                  >
                    Female
                  </button>
                  <button
                    onClick={() => setTutorGender('male')}
                    className={`px-2 sm:px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight transition-all ${tutorGender === 'male' ? 'bg-white dark:bg-slate-700 shadow-none text-teal-600' : 'text-slate-400'}`}
                  >
                    Male
                  </button>
                </div>
                {selectedTopic && (
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-100 hidden md:flex h-7">
                    Learning: {selectedTopic.name}
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowAIPanel(false)} className="rounded-full h-8 px-2 sm:px-3 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Close</span>
                </Button>
              </div>
            </div>
          </CardHeader>

          <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
            {/* Sidebar - Learning Path / Roadmap */}
            {(roadmap || (topicsForCurrentSubject && topicsForCurrentSubject.length > 0)) && (
              <div className="w-80 min-w-[280px] min-h-0 border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hidden md:flex flex-col shrink-0">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-3">
                    <Target className="w-3.5 h-3.5 text-teal-600" /> Learning Path
                  </h4>
                  {topicsForCurrentSubject && topicsForCurrentSubject.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Total Progress</span>
                        <span className="text-sm font-black text-teal-600">
                          {Math.round((topicsForCurrentSubject.filter((s: any) => s.status === 'completed').length / topicsForCurrentSubject.length) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-white/50 dark:border-slate-700 shadow-inner">
                        <div
                          className="h-full bg-primary transition-all duration-500 ease-out"
                          style={{ width: `${(topicsForCurrentSubject.filter((s: any) => s.status === 'completed').length / topicsForCurrentSubject.length) * 100}%` }}
                        />
                      </div>
                    </>
                  ) : roadmap && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Topic Progress</span>
                        <span className="text-sm font-black text-teal-600">
                          {Math.round((roadmap.subtopics.filter((s: any) => s.status === 'completed').length / roadmap.subtopics.length) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-white/50 dark:border-slate-700 shadow-inner">
                        <div
                          className="h-full bg-primary transition-all duration-500 ease-out"
                          style={{ width: `${(roadmap.subtopics.filter((s: any) => s.status === 'completed').length / roadmap.subtopics.length) * 100}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
                <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
                  <div className="p-3 space-y-1">
                    {topicsForCurrentSubject && topicsForCurrentSubject.length > 0 ? (
                      topicsForCurrentSubject.map((st: any, idx: number) => {
                        const isActive = selectedTopic?.id === st.id;
                        const isLocked = st.status === 'locked';
                        const isCompleted = st.status === 'completed';
                        
                        return (
                          <button
                            key={st.id}
                            onClick={() => isLocked ? startPlacementCheck(st) : handleTopicSelect(st)}
                            className={`w-full text-left p-3 rounded-xl transition-all border group relative ${
                              isActive 
                                ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 shadow-none' 
                                : isLocked
                                  ? 'bg-slate-50 dark:bg-slate-900 border-dashed border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:border-amber-300 dark:hover:border-amber-800'
                                  : 'hover:bg-white dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-transparent border-transparent'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                isCompleted 
                                  ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600' 
                                  : isActive 
                                    ? 'bg-teal-600 text-white shadow-none' 
                                    : isLocked
                                      ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                              }`}>
                                {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : isLocked ? <Lock className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold leading-tight mb-1 ${isActive ? 'text-teal-900 dark:text-teal-100' : isLocked ? 'text-slate-600 dark:text-slate-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {st.name}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {st.status === 'completed' ? 'Mastered!' : isLocked ? 'Placement check required' : 'Active Learning'}
                                </p>
                              </div>
                            </div>
                            {st.progress_pct > 0 && st.status !== 'completed' && (
                              <div className="absolute bottom-0 left-0 h-0.5 bg-teal-500 rounded-full transition-all" style={{ width: `${st.progress_pct}%` }} />
                            )}
                          </button>
                        );
                      })
                    ) : roadmap && (
                      roadmap.subtopics.map((st: any, idx: number) => (
                        <div
                          key={idx}
                          className={`relative flex gap-4 transition-all duration-200 ${st.status !== 'locked' ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-lg -ml-2' : ''} ${viewingSubtopic === st.name ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
                          onClick={() => handleSubtopicClick(st)}
                        >
                          {/* Status Marker */}
                          <div className={`z-10 w-7 h-7 rounded-xl flex items-center justify-center border-2 transition-all duration-500 ${st.status === 'completed' ? 'bg-teal-500 border-teal-500 text-white' :
                            st.status === 'active' ? 'bg-white dark:bg-slate-800 border-teal-500 text-teal-600' :
                              'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-300'
                            }`}>
                            {st.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> :
                              st.status === 'active' ? <Play className="w-3.5 h-3.5 fill-current ml-0.5" /> :
                                <Lock className="w-3.5 h-3.5" />}
                          </div>
  
                          <div className="flex-1 pt-0.5">
                            <p className={`text-sm font-bold leading-tight mb-1 ${st.status === 'locked' ? 'text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
                              {st.name}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Chat Area - Right Side */}
            <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900/30 relative">
              {showMasteryTest ? (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md overflow-y-auto p-4 md:p-10 flex justify-center items-start animate-in fade-in duration-300">
                  <div className="w-full max-w-4xl animate-in zoom-in-95 duration-500 my-auto">
                    <AIMasteryTest
                      topic={aiState.masteryMetadata?.topic?.name || selectedTopic?.name || "current topic"}
                      topicId={aiState.masteryMetadata?.topic?.id || selectedTopic?.id}
                      subject={aiState.masteryMetadata?.subject?.name || selectedSubject?.name || "Subject"}
                      subjectId={aiState.masteryMetadata?.subject?.id || selectedSubject?.id}
                      subtopic={activeSubtopic || null}
                      chatHistory={aiChatMessages}
                      onComplete={onMasteryTestComplete}
                      onCancel={dismissQuizConfirm}
                    />
                  </div>
                </div>
              ) : null}

              {placementState?.status !== 'idle' ? (
                <div className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-md overflow-y-auto p-4 md:p-8 flex justify-center items-start animate-in fade-in duration-300">
                  <div className="w-full max-w-3xl my-auto rounded-lg bg-white dark:bg-slate-950 shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Placement Check</p>
                        <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">
                          Unlock {placementState?.target_topic?.name || placementState?.targetTopic?.name || 'this lesson'}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          EduNexus will recommend the best lesson to start from before opening the path.
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={cancelPlacementCheck} className="rounded-full">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {placementState.status === 'loading' ? (
                      <div className="p-8 flex items-center gap-3 text-slate-600 dark:text-slate-300">
                        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                        Preparing prerequisite questions...
                      </div>
                    ) : null}

                    {placementState.status === 'error' ? (
                      <div className="p-8">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                          {placementState.message || 'The placement check could not be loaded.'}
                        </div>
                        <div className="mt-5 flex justify-end">
                          <Button onClick={cancelPlacementCheck} className="bg-teal-600 hover:bg-teal-700">Close</Button>
                        </div>
                      </div>
                    ) : null}

                    {placementState.status === 'active' ? (
                      <div className="p-5 space-y-4">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {placementState.questions.length} prerequisite lesson{placementState.questions.length === 1 ? '' : 's'} will be checked.
                          </p>
                        </div>

                        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                          {placementState.questions.map((question: any, index: number) => (
                            <div key={question.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                                {index + 1}. {question.topic_name}
                              </p>
                              <p className="font-bold text-slate-900 dark:text-slate-100 mb-3">
                                <MathText>{question.text}</MathText>
                              </p>
                              <div className="grid gap-2">
                                {Object.entries(question.options || {}).map(([key, label]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => setPlacementAnswers(prev => ({ ...prev, [question.id]: key }))}
                                    className={`text-left rounded-xl border px-4 py-3 text-sm transition-all ${
                                      placementAnswers[question.id] === key
                                        ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-100'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-teal-950/20'
                                    }`}
                                  >
                                    <span className="font-black mr-2">{key}.</span>
                                    <MathText>{String(label)}</MathText>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Answer every question so the recommendation is based on the full prerequisite path.
                          </p>
                          <Button
                            disabled={!placementState.questions.every((question: any) => placementAnswers[question.id])}
                            onClick={() => submitPlacementCheck(placementAnswers)}
                            className="bg-teal-600 hover:bg-teal-700"
                          >
                            Check My Level
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {placementState.status === 'result' ? (
                      <div className="p-6 space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Score</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{placementState.result?.score ?? 0}%</p>
                          </div>
                          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:col-span-2">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Recommended Start</p>
                            <p className="text-lg font-black text-teal-700 dark:text-teal-300">{placementState.result?.recommended_topic?.name}</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-teal-100 bg-teal-50/70 dark:border-teal-900/50 dark:bg-teal-950/20 p-4">
                          <p className="text-sm text-slate-700 dark:text-slate-200">{placementState.result?.reason}</p>
                        </div>

                        {placementState.result?.weak_topics?.length > 0 ? (
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Missed Questions Point To</p>
                            <div className="flex flex-wrap gap-2">
                              {placementState.result.weak_topics.map((topic: any) => (
                                <Badge key={topic.topic_id} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                                  {topic.topic_name} ({topic.missed})
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
                          <Button variant="outline" onClick={cancelPlacementCheck}>Cancel</Button>
                          <Button onClick={acceptPlacementRecommendation} className="bg-teal-600 hover:bg-teal-700">
                            Unlock Recommended Lesson
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <ScrollArea ref={scrollAreaRef} className="flex-1 h-full min-h-0 overflow-x-hidden">
                <div className="mx-auto w-full max-w-6xl min-w-0 overflow-x-hidden px-3 py-4 pb-20 sm:px-4 lg:p-6">
                  {aiChatMessages.length === 0 ? (
                    <div className="text-center py-20 animate-in fade-in zoom-in duration-700">
                      <div className="w-28 h-28 bg-primary rounded-lg flex items-center justify-center mx-auto mb-8 shadow-none  transition-transform duration-500 overflow-hidden border-4 border-white dark:border-slate-800">
                        <img src={`/avatars/ai_tutor_${tutorGender}.png`} alt="AI Tutor" className="w-full h-full object-cover scale-110" />
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-4 tracking-tight">Your AI Learning Partner</h3>
                      <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-10 text-lg leading-relaxed">
                        We'll learn <span className="text-teal-600 font-bold">{focusTopicLabel}</span> in small steps, with examples, quick checks, and help when you get stuck.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                        <Button
                          variant="outline"
                          disabled={roadmapLoading}
                          className="h-auto py-5 px-6 rounded-lg border-slate-200 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-all  shadow-none"
                          onClick={() => handleAIContinue(`Give me a learning map for ${focusTopicLabel}. Show the goal, the simple idea, and the first thing I should try.`)}
                        >
                          <div className="text-left">
                            <p className="font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest text-[10px] mb-1">Learning Map</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Show me the path</p>
                          </div>
                        </Button>
                        <Button
                          variant="outline"
                          disabled={roadmapLoading}
                          className="h-auto py-5 px-6 rounded-lg border-slate-200 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-all  shadow-none"
                          onClick={() => handleAIContinue(`Teach me ${focusTopicLabel} interactively. Explain one idea, ask one check question, then wait for me.`)}
                        >
                          <div className="text-left">
                            <p className="font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest text-[10px] mb-1">Guided Lesson</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Teach me interactively</p>
                          </div>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0 space-y-8 pb-10">
                      {aiChatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex w-full min-w-0 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
                          <div className={`flex min-w-0 gap-2.5 sm:gap-4 ${msg.role === 'user' ? 'w-auto max-w-[92%] flex-row-reverse sm:max-w-[84%] lg:max-w-[76%]' : 'w-full max-w-full sm:max-w-[90%] lg:max-w-[80%]'}`}>
                            <Avatar className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 shadow-none border-2 border-white dark:border-slate-800">
                              {msg.role === 'ai' ? (
                                <AvatarImage src={`/avatars/ai_tutor_${tutorGender}.png`} className="object-cover" />
                              ) : (
                                <AvatarImage src={avatarUrl || profile?.avatar_url || user.avatar} className="object-cover" />
                              )}
                              <AvatarFallback className={msg.role === 'ai' ? 'bg-teal-600 text-white' : 'bg-slate-200'}>
                                {msg.role === 'ai' ? <Brain className="w-5 h-5" /> : (getFullName()[0] || 'U')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 max-w-full flex-col gap-3">
                              <div className={`min-w-0 max-w-full overflow-hidden p-3 sm:p-5 rounded-lg shadow-none ${msg.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-tr-none'
                                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-tl-none ring-1 ring-black/5 dark:ring-white/5'
                                }`}>
                                <div className={`${isYoungLearner && msg.role === 'ai' ? 'text-base font-bold font-display sm:text-xl' : 'text-sm sm:text-base'} min-w-0 max-w-full overflow-hidden break-words leading-relaxed [overflow-wrap:anywhere] prose dark:prose-invert prose-pre:max-w-full prose-pre:overflow-x-auto prose-table:block prose-table:max-w-full prose-table:overflow-x-auto`}>
                                  {msg.role === 'ai' ? (
                                    <ReactMarkdown components={mathMarkdownComponents}>{normalizeAcademicTextForDisplay(msg.content)}</ReactMarkdown>
                                  ) : (
                                    <p className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><MathText>{msg.content}</MathText></p>
                                  )}
                                </div>
                              </div>


                              {/* Video Suggestions for current message (if relevant) */}
                              {msg.role === 'ai' && idx === aiChatMessages.length - 1 && suggestedVideos.length > 0 && (
                                <div className="mt-4 space-y-4">
                                  <p className="text-sm font-bold text-slate-500 flex items-center gap-2">
                                    <Video className="w-4 h-4" /> Watch these to understand better:
                                  </p>
                                  {activeVideo && (
                                    <div className="relative w-full rounded-xl overflow-hidden shadow-none ring-1 ring-black/10 transition-all duration-700" 
                                         style={{paddingBottom: '56.25%'}}>
                                      <iframe
                                        className="absolute inset-0 w-full h-full"
                                        src={`https://www.youtube.com/embed/${activeVideo}?autoplay=1`}
                                        allow="accelerometer; autoplay; clipboard-write; 
                                               encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                      />
                                      <button
                                        className="absolute top-2 right-2 bg-black/60 text-white 
                                                   rounded-full p-2 hover:bg-black/80 shadow-none"
                                        onClick={() => setActiveVideo(null)}
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                  <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                                    {suggestedVideos.map((video, vIdx) => (
                                      <Card key={vIdx} className="min-w-[200px] max-w-[200px] shrink-0 overflow-hidden cursor-pointer hover:border-teal-400 transition-all shadow-none group" onClick={() => { setSelectedVideo(video); setActiveVideo(video.id); }}>
                                        <div className="relative aspect-video">
                                          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Play className="w-8 h-8 text-white fill-current" />
                                          </div>
                                        </div>
                                        <div className="p-2">
                                          <p className="text-xs font-bold line-clamp-2">{video.title}</p>
                                        </div>
                                      </Card>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Speaker control */}
                              {msg.role === 'ai' && isSpeechSupported && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => {
                                    if (isSpeaking) {
                                      stop();
                                    } else {
                                      speak(msg.content, { force: true });
                                    }
                                  }}
                                  className="self-start text-teal-600 dark:text-teal-400 hover:text-teal-700 mt-1 gap-2"
                                >
                                  {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                  {isSpeaking ? 'Stop audio' : 'Listen'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {!aiLoading && !showMasteryTest && aiChatMessages.length > 0 && (
                        <div className="max-w-6xl mx-auto rounded-lg border border-teal-100 dark:border-teal-900/50 bg-teal-50/60 dark:bg-teal-950/10 p-4 shadow-none">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Next Learning Move</p>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                Stage: <span className="font-bold capitalize">{lessonStageLabel}</span>. {conversationTurns < 2 ? 'Start with a guided explanation, then answer one quick check.' : 'Choose what you need next: clearer explanation, example, practice, or summary.'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {learnerActions.slice(0, conversationTurns < 2 ? 3 : 5).map((action) => {
                                const Icon = action.icon;
                                return (
                                  <Button
                                    key={action.label}
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg border-teal-100 bg-white text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:bg-slate-900 dark:border-teal-900/50 dark:text-slate-200 dark:hover:bg-teal-950/30"
                                    onClick={() => handleAIContinue(action.prompt)}
                                  >
                                    <Icon className="w-4 h-4 mr-2 text-teal-600" />
                                    {action.label}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {aiLoading && (
                        <div className="flex justify-start animate-in fade-in duration-300">
                          <div className="flex gap-4 items-center">
                            <Avatar className="w-10 h-10 shadow-none border-2 border-white dark:border-slate-800">
                              <AvatarImage src={`/avatars/ai_tutor_${tutorGender}.png`} />
                              <AvatarFallback className="bg-teal-600 text-white"><Brain className="w-5 h-5" /></AvatarFallback>
                            </Avatar>
                            <div className="flex items-center gap-2 p-4 px-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg rounded-tl-none border border-slate-100 dark:border-slate-700">
                              <div className="flex gap-1">
                                <span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce [animation-duration:0.6s]" />
                                <span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.2s]" />
                                <span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.4s]" />
                              </div>
                              <span className="ml-2 text-sm font-bold text-teal-600 uppercase tracking-tighter">
                                {getPersonaName(profile?.education_level)} is thinking...
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div >
              </ScrollArea>

              {/* Chat Input & Floating Actions */}
              <div className="p-3 sm:px-6 border-t bg-white/50 dark:bg-slate-900/50 backdrop-blur-md z-10">
                {selectedTopic && !aiLoading && aiChatMessages.length > 0 && !showMasteryTest && (
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mb-2">
                    {isYoungLearner ? (
                      <>
                        <Button
                          variant="outline"
                          className="whitespace-nowrap rounded-lg bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 px-6 py-6 font-black text-lg"
                          onClick={() => handleAIContinue("Explain like I'm 5! 🐥")}
                        >
                          🐥 Explain simpler
                        </Button>
                        <Button
                          variant="outline"
                          className="whitespace-nowrap rounded-lg bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200 px-6 py-6 font-black text-lg"
                          onClick={() => handleAIContinue("Show me a picture or video! 🎥")}
                        >
                          🎥 See it
                        </Button>
                        <Button
                          variant="outline"
                          className="whitespace-nowrap rounded-lg bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200 px-6 py-6 font-black text-lg"
                          onClick={() => handleAIContinue("I'm confused, help! 🙋")}
                        >
                          🙋 I'm stuck
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="whitespace-nowrap rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 px-5 py-5 font-bold"
                          onClick={() => {
                            const lastAI = aiChatMessages.filter(m => m.role === 'ai').slice(-1)[0]?.content || '';
                            const contextSnippet = lastAI.length > 60 ? lastAI.substring(0, 60) + "..." : lastAI;
                            handleAIContinue(`That last part about "${contextSnippet}" was a bit complex. Can you simplify it or explain it differently, keeping our focus on ${viewingSubtopic || activeSubtopic || selectedTopic.name}? 🐘`);
                          }}
                        >
                          <Zap className="w-4 h-4 mr-2 text-amber-500 fill-amber-500" /> Simplify 🐘
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="whitespace-nowrap rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 px-5 py-5 font-bold"
                          onClick={() => {
                            const lastAI = aiChatMessages.filter(m => m.role === 'ai').slice(-1)[0]?.content || '';
                            const contextSnippet = lastAI.length > 60 ? lastAI.substring(0, 60) + "..." : lastAI;
                            handleAIContinue(`Can you give me a real-world example related to that last point about "${contextSnippet}" within ${(typeof viewingSubtopic === 'object' ? (viewingSubtopic as any)?.name : viewingSubtopic) || activeSubtopic || selectedTopic.name}? 💡`);
                          }}
                        >
                          <Star className="w-4 h-4 mr-2 text-emerald-500 fill-emerald-500" /> Example 💡
                        </Button>
                      </>
                    )}
                  </div>
                )}

                <div className="relative group max-w-6xl mx-auto">
                  {isCurrentTopicCompleted && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50/80 dark:bg-slate-900/80 rounded-lg backdrop-blur-[1px] border border-emerald-200 dark:border-emerald-900/50">
                      <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-900 rounded-lg shadow-none  border border-emerald-100 dark:border-emerald-900">
                        <Trophy className="w-6 h-6 text-emerald-500 animate-bounce" />
                        <div>
                          <p className="text-sm font-black text-slate-800 dark:text-slate-100">Topic Mastered! 🏆</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Review Mode Only</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="ml-4 text-teal-600 font-black text-xs h-8 hover:bg-teal-50"
                          onClick={() => handleTopicSelect(topicsForCurrentSubject.find((t: any) => t.status === 'unlocked' || t.status === 'in_progress'))}
                        >
                          Next Topic →
                        </Button>
                      </div>
                    </div>
                  )}
                  <Input
                    placeholder={showMasteryTest ? "Mastery Test in Progress..." : (isCheckingUnderstanding ? "Type your explanation here..." : isCurrentTopicCompleted ? "Topic completed!" : `Ask about ${(typeof viewingSubtopic === 'object' ? (viewingSubtopic as any)?.name : viewingSubtopic) || activeSubtopic || "this topic"}...`)}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="rounded-lg py-5 sm:py-6 pl-4 sm:pl-6 pr-24 sm:pr-32 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-4 focus:ring-teal-500/10 transition-all shadow-none text-base sm:text-lg resize-none"
                    autoFocus
                    disabled={showMasteryTest || aiLoading || isCurrentTopicCompleted}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && chatInput.trim() && !showMasteryTest && !isCurrentTopicCompleted) {
                        e.preventDefault();
                        submitChatInput();
                      }
                    }}
                  />
                  {!showMasteryTest && !isCurrentTopicCompleted && (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        disabled={!isSpeechRecognitionSupported || aiLoading}
                        title={isListening ? 'Stop voice input' : 'Start voice input'}
                        className={`absolute right-14 sm:right-16 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-lg shadow-none transition-all active:scale-95 disabled:opacity-50 ${isListening ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/30' : 'border-slate-200 bg-white text-slate-600 hover:bg-teal-50 hover:text-teal-700 dark:bg-slate-950 dark:border-slate-800'}`}
                        onClick={toggleListening}
                      >
                        {isListening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        disabled={aiLoading || !chatInput.trim()}
                        className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary hover:bg-primary/90 shadow-none transition-all active:scale-95 disabled:opacity-50"
                        onClick={submitChatInput}
                      >
                        <Brain className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                      </Button>
                    </>
                  )}
                </div>
                {(isListening || interimTranscript || speechError || !isSpeechRecognitionSupported) && !showMasteryTest && !isCurrentTopicCompleted && (
                  <div className="max-w-6xl mx-auto mt-2 min-h-5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {isListening && (
                      <span className="text-teal-700 dark:text-teal-300">
                        Listening{interimTranscript ? `: ${interimTranscript}` : '...'}
                      </span>
                    )}
                    {!isListening && speechError && <span className="text-rose-600 dark:text-rose-400">{speechError}</span>}
                    {!isListening && !speechError && !isSpeechRecognitionSupported && (
                      <span>Voice input is not supported in this browser. Try Chrome or Edge.</span>
                    )}
                  </div>
                )}
                <div className="hidden sm:flex items-center justify-center gap-6 mt-4 opacity-50">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">EduNexus Socratic Engineering v2.0</p>
                  <div className="h-1 w-1 bg-slate-400 rounded-full" />
                  <p className="text-[11px] font-black text-teal-600 uppercase tracking-[0.2em]">Mastery Mode Enabled</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-4 flex-1 min-h-0 overflow-y-auto overscroll-contain pb-8 px-3 sm:px-4">
          <div className="min-w-0 space-y-4">
            <Card className="rounded-lg border-border shadow-none bg-card">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div>
                  <CardTitle className="text-lg font-semibold">Select Subject</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Pick a subject you are enrolled in to start learning</p>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {displaySubjects.length > 0 ? (
                    displaySubjects.map(subject => (
                      <button
                        key={subject.id}
                        className={`group min-w-0 p-3 rounded-lg border transition-all flex items-center gap-3 text-left ${selectedSubject?.id === subject.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/40 hover:bg-muted/40'
                          }`}
                        onClick={() => handleSubjectSelect(subject)}
                      >
                        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <BookMarked className="w-4 h-4" />
                        </div>
                        <span className="min-w-0 font-semibold text-sm truncate">{subject.name}</span>
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full py-12 text-center">
                      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookMarked className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium">You aren't enrolled in any subjects yet.</p>
                      <Button variant="link" onClick={() => setActiveView('subjects')} className="mt-2 text-teal-600 font-bold">Browse Subjects catalog →</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Brain Power Cards Section - Reading Recommendations */}
            {selectedTopic && (
              <BrainPowerCardsSection
                topicName={selectedTopic.name}
                subjectName={selectedSubject?.name}
                onJumpIn={(card) => {
                  handleAIContinue(`I'd like to learn more about "${card.title}" — specifically the part about: ${card.snippet}`);
                  setShowAIPanel(true);
                }}
              />
            )}

            {/* Suggested Videos Section */}
            {selectedTopic && suggestedVideos.length > 0 && (
              <Card className="mb-6 rounded-lg border-border bg-card shadow-none">
                <CardHeader className="pb-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <CardTitle className="flex min-w-0 items-start gap-2 text-base font-semibold leading-snug sm:text-lg">
                      <Video className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 sm:h-5 sm:w-5" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended videos</span>
                        <span className="line-clamp-2 break-words">For {selectedTopic.name}</span>
                      </span>
                    </CardTitle>
                    <Badge variant="outline" className="w-fit shrink-0 text-[10px] uppercase font-bold text-teal-600 border-teal-200">YouTube Resources</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeVideo && (
                    <div className="mb-6 relative w-full rounded-xl overflow-hidden shadow-none ring-1 ring-black/10 transition-all duration-700" 
                         style={{paddingBottom: '56.25%'}}>
                      <iframe
                        className="absolute inset-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${activeVideo}?autoplay=1`}
                        allow="accelerometer; autoplay; clipboard-write; 
                               encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                      <button
                        className="absolute top-2 right-2 bg-black/60 text-white 
                                   rounded-full p-2 hover:bg-black/80 shadow-none"
                        onClick={() => setActiveVideo(null)}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <ScrollArea className="w-full">
                    <div className="flex gap-4 pb-4 w-max">
                      {suggestedVideos.map((video, idx) => (
                        <Card key={idx} className="min-w-[280px] max-w-[280px] group cursor-pointer border-slate-100 dark:border-slate-800 hover:border-teal-400 transition-all overflow-hidden" onClick={() => {
                          setSelectedVideo(video);
                          setEnergy((prev: number) => Math.min(100, prev + 25));
                          setActiveVideo(video.id);
                        }}>
                          <div className="relative aspect-video overflow-hidden">
                            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group- transition-transform duration-500" />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="w-10 h-10 text-white fill-current" />
                            </div>
                          </div>
                          <CardContent className="p-3">
                            <h4 className="font-bold text-sm line-clamp-2 group-hover:text-teal-600 transition-colors">{video.title}</h4>
                            <p className="text-xs text-muted-foreground mt-1">{video.channel_title}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" className="h-2.5" />
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {selectedSubject && (
              <Card className="rounded-lg border-border shadow-none animate-in fade-in slide-in-from-bottom-4 duration-500">
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <div>
                    <CardTitle className="text-lg font-semibold">Topics in {selectedSubject.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Choose a specific area to focus on</p>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 min-h-0">
                  {loading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-teal-500" /></div>
                  ) : (
                    <div className="space-y-6 max-h-[min(68vh,720px)] overflow-y-auto pr-1">
                      {Array.from(new Set(visibleTopics.map(t => t.term || 'Other'))).sort((a, b) => {
                        const order: Record<string, number> = { 'First Term': 1, 'Second Term': 2, 'Third Term': 3, 'Other': 4 };
                        return (order[a as string] || 5) - (order[b as string] || 5);
                      }).map((termGroup) => (
                        <div key={termGroup as string}>
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 ml-1 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-teal-500" />
                            {termGroup as string}
                          </h4>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            {visibleTopics.filter(t => (t.term || 'Other') === termGroup).map(topic => {
                              const tp = getTopicProgress(topic.id);
                              const structuredTopic = topicsForCurrentSubject.find((st: any) => st.id === topic.id);
                              const isLocked = structuredTopic?.status === 'locked';
                              const pct = tp?.progress_pct ?? 0;
                              const done = !!tp?.completed_at;
                              return (
                                <Button
                                  key={topic.id}
                                  variant={selectedTopic?.id === topic.id ? 'default' : 'outline'}
                                  className={`h-auto min-h-[3.25rem] rounded-lg text-sm justify-start px-3 gap-2 flex-col items-stretch ${selectedTopic?.id === topic.id ? 'bg-primary text-primary-foreground' : isLocked ? 'border-dashed border-amber-200 bg-amber-50/40 text-slate-600 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/10' : 'hover:bg-muted'
                                    }`}
                                  onClick={() => handleTopicSelect(topic)}
                                >
                                  <div className="flex items-center gap-3 w-full">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedTopic?.id === topic.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
                                      }`}>
                                      {done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : isLocked ? <Lock className="w-4 h-4 text-amber-600" /> : <Layers className="w-4 h-4" />}
                                    </div>
                                    <span className="flex-1 text-left whitespace-normal">{topic.name}</span>
                                    {pct > 0 && !done && (
                                      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold tabular-nums">{pct}%</span>
                                    )}
                                  </div>
                                  {pct > 0 && (
                                    <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                  )}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {visibleTopics.length === 0 && !loading && (
                    <div className="py-10 text-center">
                      <p className="text-muted-foreground italic">No topics found for this subject yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {lockedLessonNotice && (
              <Card className="border border-amber-200 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/20 shadow-none animate-in fade-in slide-in-from-bottom-4 duration-300">
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-700 dark:text-amber-200 shrink-0">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Lesson Locked</p>
                        <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{lockedLessonNotice.requestedTopic?.name}</h3>
                        <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{lockedLessonNotice.message}</p>
                      </div>
                    </div>
                    {lockedLessonNotice.currentTopic ? (
                      <Button className="bg-teal-600 hover:bg-teal-700 rounded-xl gap-2" onClick={openCurrentUnlockedLesson}>
                        <Play className="w-4 h-4" />
                        Open {lockedLessonNotice.currentTopic.name}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedTopic && (
              <Card className="border-0 shadow-none bg-primary hover:bg-primary/90 text-white animate-in zoom-in-95 duration-500">
                <CardContent className="p-8">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="w-32 h-32 bg-white/20 backdrop-blur-md rounded-lg flex items-center justify-center flex-shrink-0 border border-white/20 overflow-hidden shadow-none">
                      <img src={`/avatars/ai_tutor_${tutorGender}.png`} alt="AI Tutor" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <Badge variant="outline" className="text-white border-white/30 bg-white/10 mb-2">Ready to Learn</Badge>
                      <h3 className="text-2xl font-bold mb-2">{selectedTopic.name}</h3>
                      <p className="text-teal-50 mb-6 max-w-lg">I'm ready to teach you about {selectedTopic.name}. We can start with a basic explanation or dive straight into practice.</p>

                      <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                        <Button className="bg-white text-teal-700 hover:bg-teal-50 rounded-xl px-6 gap-2" onClick={() => openTutorFromSelection(selectedTopic, setShowAIPanel, handleAIContinue, aiChatMessages)}>
                          <Sparkles className="w-4 h-4" /> Start Tutoring
                        </Button>
                        <Button variant="outline" className="border-white/40 text-white hover:bg-white/10 rounded-xl px-6 gap-2" onClick={() => setActiveView('quiz')}>
                          <FileText className="w-4 h-4" /> Take Quiz
                        </Button>
                        <Button variant="outline" className="border-white/40 text-white hover:bg-white/10 rounded-xl px-6 gap-2" onClick={() => handleAIContinue(`Give me a summary of ${selectedTopic.name}`)}>
                          <Repeat className="w-4 h-4" /> Summary
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-500" /> Suggested Topics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {suggestedTopics.length > 0 ? suggestedTopics.map((topic, idx) => (
                    <Button key={idx} variant="ghost" className="w-full justify-start text-sm hover:bg-amber-50 dark:hover:bg-amber-950/20 group" onClick={() => {
                      const subject = subjects.find(s => s.id === topic.subject_id);
                      if (subject) {
                        handleSubjectSelect(subject);
                        handleTopicSelect(topic);
                      }
                    }}>
                      <div className="w-2 h-2 rounded-full bg-amber-400 mr-3 group-hover:scale-150 transition-transform" />
                      <span className="truncate">{topic.name}</span>
                    </Button>
                  )) : (
                    <div className="py-4 text-center">
                      <p className="text-xs text-muted-foreground flex flex-col items-center gap-2">
                        <Sparkles className="w-6 h-6 opacity-30" />
                        Practice more to unlock suggestions
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-red-500" /> Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {weaknessAreas.length > 0 ? weaknessAreas.map((area, idx) => (
                    <Badge key={idx} variant="destructive" className="rounded-lg px-2.5 py-1">{area}</Badge>
                  )) : (
                    <p className="text-xs text-muted-foreground italic">You're doing great! No specific weaknesses identified.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-teal-50 dark:bg-emerald-950/20 border-teal-100 dark:border-teal-900/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center shadow-none">
                    <Trophy className="w-6 h-6 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-xs text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider">Learning Goal</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">Next Badge: Quiz Whiz</p>
                  </div>
                </div>
                <div className="mt-4 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: '65%' }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 text-right">3 more quizzes to unlock</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

// Internal helper component to call the hook
function BrainPowerCardsSection({ topicName, subjectName, onJumpIn }: { topicName: string; subjectName?: string; onJumpIn: (card: BrainPowerCardData) => void }) {
  const { data, isLoading } = useReadingRecommendations({
    topic: topicName,
    subject: subjectName,
    limit: 4,
    enabled: true,
  });

  const cards = data?.cards || [];

  return (
    <Card className="mb-6 rounded-lg border-border bg-card shadow-none">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="flex min-w-0 items-start gap-2 text-base font-semibold leading-snug sm:text-lg">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 sm:h-5 sm:w-5" />
            <span className="min-w-0">
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">Study materials</span>
              <span className="line-clamp-2 break-words">For {topicName}</span>
            </span>
          </CardTitle>
          <Badge variant="outline" className="w-fit shrink-0 text-[10px] uppercase font-bold text-teal-600 border-teal-200">Reading Material</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-4 text-slate-400">
            <p className="text-xs">No reading materials yet. Ask your teacher to upload curriculum PDFs!</p>
          </div>
        ) : (
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4 w-max">
              {cards.map((card) => (
                <Card key={card.id} className="min-w-[280px] max-w-[280px] group cursor-pointer border-slate-100 dark:border-slate-800 hover:border-teal-400 transition-all overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/50">
                        <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      </div>
                      <span className="text-[10px] bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded font-medium">
                        {card.subject}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm line-clamp-2 group-hover:text-teal-600 transition-colors mb-2">
                      {card.title}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
                      {card.snippet}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {Math.max(1, Math.round(card.estimated_read_seconds / 60))} min read
                      </span>
                      <Button 
                        size="sm" 
                        className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                        onClick={() => onJumpIn(card)}
                      >
                        <Zap className="w-3 h-3 mr-1" /> Jump In
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="h-2.5" />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
