import { Sparkles, Brain, X, Target, CheckCircle2, Lock, Play, RefreshCw, Trophy, Zap, Star, Video, BookMarked, Loader2, Layers, Repeat, FileText, Activity, BookOpen, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import { AIMasteryTest } from './AIMasteryTest';
import { BrainPowerCard } from '@/features/student/learning/BrainPowerCard';
import type { BrainPowerCardData } from '@/features/student/learning/BrainPowerCard';
import { useReadingRecommendations } from '@/features/student/hooks/useReadingRecommendations';
import { useTopicProgress } from '@/features/student/hooks/useTopicProgress';
import { useTTS } from '@/features/student/hooks/useTTS';
import { getPersonaEmoji, getPersonaName } from '@/features/student/utils/personaUtils';
import { useEffect, useState } from 'react';

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
  setShowMasteryTest?: (val: boolean) => void;
  activeSubtopic: string | undefined;
  aiChatMessages: any[];
  avatarUrl: string | null;
  profile: any;
  user: any;
  showMasteryConfirm: boolean;
  setShowMasteryConfirm?: (val: boolean) => void;
  masteryTestTriggered?: boolean;
  resetMasteryTrigger?: () => void;
  aiLoading: boolean;
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
  setShowMasteryTest = () => {},
  activeSubtopic,
  aiChatMessages,
  avatarUrl,
  profile,
  user,
  showMasteryConfirm,
  setShowMasteryConfirm = () => {},
  masteryTestTriggered = false,
  resetMasteryTrigger = () => {},
  aiLoading,
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
  aiState = { status: 'idle' }
}: AIChatSectionProps) => {
  const { getTopicProgress } = useTopicProgress();
  const { speak, stop, isYoungLearner } = useTTS(profile?.education_level);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  const topicsForCurrentSubject = structuredTopics.filter(
    (t: any) => !selectedSubject || !t.subject_id || t.subject_id === selectedSubject.id
  );

  const isCurrentTopicCompleted = topicsForCurrentSubject.find((st: any) => st.id === selectedTopic?.id)?.status === 'completed';

  const displaySubjects = enrolledSubjects.length > 0
    ? subjects.filter(s => enrolledSubjects.some((e: any) => (e.id || e) === s.id))
    : subjects;

  console.log('[AI Tutor] subjects:', subjects.length, 'enrolled:', enrolledSubjects.length, 'display:', displaySubjects.length);

  // Auto-speak new AI messages for young learners
  useEffect(() => {
    const lastMessage = aiChatMessages[aiChatMessages.length - 1];
    if (lastMessage?.role === 'ai') {
      speak(lastMessage.content);
    }
  }, [aiChatMessages, speak]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {!showAIPanel && (
        <div className="flex items-center justify-between px-6 py-1 shrink-0">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <img src={`/avatars/ai_tutor_${tutorGender}.png`} alt="AI Tutor" className="w-8 h-8 rounded-full border border-teal-200" /> AI Tutoring Center
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-full border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setTutorGender('female')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${tutorGender === 'female' ? 'bg-white dark:bg-slate-700 shadow-sm text-teal-600' : 'text-slate-500'}`}
              >
                Female
              </button>
              <button
                onClick={() => setTutorGender('male')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${tutorGender === 'male' ? 'bg-white dark:bg-slate-700 shadow-sm text-teal-600' : 'text-slate-500'}`}
              >
                Male
              </button>
            </div>
            {!showAIPanel && (
              <Button onClick={() => setShowAIPanel(true)} className="gap-2 bg-gradient-to-r from-teal-600 to-teal-600 hover:from-teal-700 hover:to-teal-700 shadow-md">
                <Sparkles className="w-4 h-4" /> Open AI Tutor
              </Button>
            )}
          </div>
        </div>
      )}

      {showAIPanel ? (
        <Card className="flex-1 flex flex-col shadow-2xl border-0 overflow-hidden bg-white dark:bg-slate-900 min-h-0">
          <CardHeader className="h-14 py-0 border-b bg-white dark:bg-slate-900 z-10 shrink-0 flex items-center justify-center">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12 border-2 border-teal-100 dark:border-teal-900 shadow-sm">
                  <AvatarImage src={avatarUrl || ''} />
                  <AvatarFallback className="bg-teal-50 text-teal-600">
                    <Brain className="w-6 h-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <CardTitle className="text-xl font-black flex items-center gap-2 text-slate-800 dark:text-slate-100 leading-tight mb-0.5">
                    {getPersonaName(profile?.education_level)} {getPersonaEmoji(profile?.education_level)}
                  </CardTitle>
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 leading-none">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Online & Ready
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-full border border-slate-100 dark:border-slate-700 mr-2">
                  <button
                    onClick={() => setTutorGender('female')}
                    className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight transition-all ${tutorGender === 'female' ? 'bg-white dark:bg-slate-700 shadow-sm text-teal-600' : 'text-slate-400'}`}
                  >
                    Female
                  </button>
                  <button
                    onClick={() => setTutorGender('male')}
                    className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight transition-all ${tutorGender === 'male' ? 'bg-white dark:bg-slate-700 shadow-sm text-teal-600' : 'text-slate-400'}`}
                  >
                    Male
                  </button>
                </div>
                {selectedTopic && (
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-100 hidden md:flex h-7">
                    Learning: {selectedTopic.name}
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowAIPanel(false)} className="rounded-full h-8 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="w-4 h-4 mr-1.5" /> Close
                </Button>
              </div>
            </div>
          </CardHeader>

          <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
            {/* Sidebar - Learning Path / Roadmap */}
            {(roadmap || (topicsForCurrentSubject && topicsForCurrentSubject.length > 0)) && (
              <div className="w-80 min-w-[280px] border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hidden md:flex flex-col shrink-0">
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
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(20,184,166,0.3)]"
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
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(20,184,166,0.3)]"
                          style={{ width: `${(roadmap.subtopics.filter((s: any) => s.status === 'completed').length / roadmap.subtopics.length) * 100}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-1">
                    {topicsForCurrentSubject && topicsForCurrentSubject.length > 0 ? (
                      topicsForCurrentSubject.map((st: any, idx: number) => {
                        const isActive = selectedTopic?.id === st.id;
                        const isLocked = st.status === 'locked';
                        const isCompleted = st.status === 'completed';
                        
                        return (
                          <button
                            key={st.id}
                            disabled={isLocked}
                            onClick={() => handleTopicSelect(st)}
                            className={`w-full text-left p-3 rounded-xl transition-all border group relative ${
                              isActive 
                                ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 shadow-sm' 
                                : isLocked
                                  ? 'opacity-40 grayscale pointer-events-none'
                                  : 'hover:bg-white dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-transparent border-transparent'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                isCompleted 
                                  ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600' 
                                  : isActive 
                                    ? 'bg-teal-600 text-white shadow-md' 
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                              }`}>
                                {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : isLocked ? <Lock className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold leading-tight mb-1 ${isActive ? 'text-teal-900 dark:text-teal-100' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {st.name}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {st.status === 'completed' ? 'Mastered!' : isLocked ? 'Locked' : 'Active Learning'}
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

              <ScrollArea ref={scrollAreaRef} className="flex-1 h-full min-h-0">
                <div className="max-w-6xl mx-auto p-4 lg:p-6 pb-20">
                  {aiChatMessages.length === 0 ? (
                    <div className="text-center py-20 animate-in fade-in zoom-in duration-700">
                      <div className="w-28 h-28 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-teal-500/20 rotate-3 hover:rotate-0 transition-transform duration-500 overflow-hidden border-4 border-white dark:border-slate-800">
                        <img src={`/avatars/ai_tutor_${tutorGender}.png`} alt="AI Tutor" className="w-full h-full object-cover scale-110" />
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-4 tracking-tight">Your AI Learning Partner</h3>
                      <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-10 text-lg leading-relaxed">
                        I'll help you master {activeSubtopic ? <span className="text-teal-600 font-bold">{activeSubtopic}</span> : 'this topic'} through interactive discussion.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                        <Button
                          variant="outline"
                          disabled={roadmapLoading}
                          className="h-auto py-5 px-6 rounded-2xl border-slate-200 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-all hover:scale-[1.02] shadow-sm"
                          onClick={() => handleAIContinue(`Introduce me to ${(typeof viewingSubtopic === 'object' ? (viewingSubtopic as any)?.name : viewingSubtopic) || activeSubtopic || selectedTopic?.name || 'this topic'} — what am I about to learn?`)}
                        >
                          <div className="text-left">
                            <p className="font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest text-[10px] mb-1">Start Journey 🚀</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Begin with an intro</p>
                          </div>
                        </Button>
                        <Button
                          variant="outline"
                          disabled={roadmapLoading}
                          className="h-auto py-5 px-6 rounded-2xl border-slate-200 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-all hover:scale-[1.02] shadow-sm"
                          onClick={() => handleAIContinue(`Teach me about ${(typeof viewingSubtopic === 'object' ? (viewingSubtopic as any)?.name : viewingSubtopic) || activeSubtopic || selectedTopic?.name || 'this topic'} using a very short, fun story`)}
                        >
                          <div className="text-left">
                            <p className="font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest text-[10px] mb-1">Story Mode 📖</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Learn through a story</p>
                          </div>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8 pb-10">
                      {aiChatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
                          <div className={`flex gap-4 max-w-[90%] lg:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <Avatar className="w-10 h-10 flex-shrink-0 shadow-lg border-2 border-white dark:border-slate-800">
                              {msg.role === 'ai' ? (
                                <AvatarImage src={`/avatars/ai_tutor_${tutorGender}.png`} className="object-cover" />
                              ) : (
                                <AvatarImage src={avatarUrl || profile?.avatar_url || user.avatar} className="object-cover" />
                              )}
                              <AvatarFallback className={msg.role === 'ai' ? 'bg-teal-600 text-white' : 'bg-slate-200'}>
                                {msg.role === 'ai' ? <Brain className="w-5 h-5" /> : (getFullName()[0] || 'U')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col gap-3 max-w-full">
                              <div className={`p-5 rounded-3xl shadow-xl ${msg.role === 'user'
                                ? 'bg-gradient-to-br from-teal-600 to-teal-700 text-white rounded-tr-none'
                                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-tl-none ring-1 ring-black/5 dark:ring-white/5'
                                }`}>
                                <div className={`${isYoungLearner && msg.role === 'ai' ? 'text-xl font-bold font-display' : 'text-base'} leading-relaxed prose dark:prose-invert max-w-none break-words overflow-hidden`}>
                                  {msg.role === 'ai' ? (
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                  ) : (
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                  )}
                                </div>
                              </div>

                              {/* Mastery Confirmation Card (Only for the latest AI message if triggered) */}
                              {msg.role === 'ai' && idx === aiChatMessages.length - 1 && showMasteryConfirm && (
                                <Card className="border-2 border-teal-500 bg-teal-50/50 dark:bg-teal-950/20 shadow-2xl animate-in zoom-in duration-500 rounded-3xl overflow-hidden mt-2">
                                  <CardContent className="p-6">
                                    <div className="flex items-center gap-4 mb-4">
                                      <div className="w-12 h-12 bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                                        <Trophy className="w-6 h-6 text-white" />
                                      </div>
                                      <div>
                                        <h4 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Mastery Test Ready! 🎓</h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">You've covered all the concepts. Ready to prove your mastery?</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-3">
                                      <Button
                                        className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-black py-6 rounded-2xl shadow-xl shadow-teal-500/30 transition-all hover:scale-[1.02] active:scale-95"
                                        onClick={() => {
                                          if (setShowMasteryTest) {
                                            setShowMasteryTest(true);
                                          }
                                          setShowMasteryConfirm(false);
                                          // Force scroll to top of the screen when test starts
                                          window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                      >
                                        I'm Ready! Start Test 🚀
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        className="font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                        onClick={() => {
                                          setShowMasteryConfirm(false);
                                          handleAIContinue("I'd like to review a bit more before taking the test.");
                                        }}
                                      >
                                        I need more review
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Video Suggestions for current message (if relevant) */}
                              {msg.role === 'ai' && idx === aiChatMessages.length - 1 && suggestedVideos.length > 0 && (
                                <div className="mt-4 space-y-4">
                                  <p className="text-sm font-bold text-slate-500 flex items-center gap-2">
                                    <Video className="w-4 h-4" /> Watch these to understand better:
                                  </p>
                                  {activeVideo && (
                                    <div className="relative w-full rounded-xl overflow-hidden shadow-2xl ring-1 ring-black/10 transition-all duration-700" 
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
                                                   rounded-full p-2 hover:bg-black/80 shadow-lg"
                                        onClick={() => setActiveVideo(null)}
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                  <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                                    {suggestedVideos.map((video, vIdx) => (
                                      <Card key={vIdx} className="min-w-[200px] max-w-[200px] shrink-0 overflow-hidden cursor-pointer hover:border-teal-400 transition-all shadow-md group" onClick={() => { setSelectedVideo(video); setActiveVideo(video.id); }}>
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

                              {/* Young Learner Speaker Icon */}
                              {msg.role === 'ai' && isYoungLearner && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => speak(msg.content)}
                                  className="self-start text-teal-600 dark:text-teal-400 hover:text-teal-700 mt-1"
                                >
                                  🔊 Listen again
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {aiLoading && (
                        <div className="flex justify-start animate-in fade-in duration-300">
                          <div className="flex gap-4 items-center">
                            <Avatar className="w-10 h-10 shadow-lg border-2 border-white dark:border-slate-800">
                              <AvatarImage src={`/avatars/ai_tutor_${tutorGender}.png`} />
                              <AvatarFallback className="bg-teal-600 text-white"><Brain className="w-5 h-5" /></AvatarFallback>
                            </Avatar>
                            <div className="flex items-center gap-2 p-4 px-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl rounded-tl-none border border-slate-100 dark:border-slate-700">
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
              <div className="p-3 px-6 border-t bg-white/50 dark:bg-slate-900/50 backdrop-blur-md z-10">
                {selectedTopic && !aiLoading && aiChatMessages.length > 0 && !showMasteryTest && (
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mb-2">
                    {isYoungLearner ? (
                      <>
                        <Button
                          variant="outline"
                          className="whitespace-nowrap rounded-3xl bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 px-6 py-6 font-black text-lg"
                          onClick={() => handleAIContinue("Explain like I'm 5! 🐥")}
                        >
                          🐥 Explain simpler
                        </Button>
                        <Button
                          variant="outline"
                          className="whitespace-nowrap rounded-3xl bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200 px-6 py-6 font-black text-lg"
                          onClick={() => handleAIContinue("Show me a picture or video! 🎥")}
                        >
                          🎥 See it
                        </Button>
                        <Button
                          variant="outline"
                          className="whitespace-nowrap rounded-3xl bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200 px-6 py-6 font-black text-lg"
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
                          className="whitespace-nowrap rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 px-5 py-5 font-bold"
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
                          className="whitespace-nowrap rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 px-5 py-5 font-bold"
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
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50/80 dark:bg-slate-900/80 rounded-3xl backdrop-blur-[1px] border border-emerald-200 dark:border-emerald-900/50">
                      <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-emerald-500/10 border border-emerald-100 dark:border-emerald-900">
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
                    className="rounded-3xl py-6 pl-6 pr-20 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-4 focus:ring-teal-500/10 transition-all shadow-2xl text-lg resize-none"
                    autoFocus
                    disabled={showMasteryTest || aiLoading || isCurrentTopicCompleted}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim() && !showMasteryTest && !isCurrentTopicCompleted) {
                        handleAIContinue(e.currentTarget.value);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  {!showMasteryTest && !isCurrentTopicCompleted && (
                    <Button
                      size="icon"
                      disabled={aiLoading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 shadow-2xl shadow-teal-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                      onClick={(e) => {
                        const input = e.currentTarget.parentElement?.querySelector('input');
                        if (input && input.value.trim() && !isCurrentTopicCompleted) {
                          handleAIContinue(input.value);
                          input.value = '';
                        }
                      }}
                    >
                      <Brain className="w-7 h-7 text-white" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-center gap-6 mt-4 opacity-50">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">EduNexus Socratic Engineering v2.0</p>
                  <div className="h-1 w-1 bg-slate-400 rounded-full" />
                  <p className="text-[11px] font-black text-teal-600 uppercase tracking-[0.2em]">Mastery Mode Enabled</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-y-auto no-scrollbar pb-6 px-4">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-0 shadow-lg bg-white dark:bg-slate-900">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Select Subject</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Pick a subject you are enrolled in to start learning</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {displaySubjects.length > 0 ? (
                    displaySubjects.map(subject => (
                      <button
                        key={subject.id}
                        className={`group p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 text-center ${selectedSubject?.id === subject.id
                          ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20'
                          : 'border-slate-100 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-900/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/50'
                          }`}
                        onClick={() => handleSubjectSelect(subject)}
                      >
                        <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform">
                          <BookMarked className="w-6 h-6" />
                        </div>
                        <span className="font-semibold text-sm">{subject.name}</span>
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
              <Card className="border-0 shadow-lg bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/10 dark:to-slate-900 border-teal-100 dark:border-teal-900/50 mb-6">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Video className="w-5 h-5 text-teal-600" /> Recommended for {selectedTopic.name}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] uppercase font-bold text-teal-600 border-teal-200">YouTube Resources</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeVideo && (
                    <div className="mb-6 relative w-full rounded-xl overflow-hidden shadow-2xl ring-1 ring-black/10 transition-all duration-700" 
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
                                   rounded-full p-2 hover:bg-black/80 shadow-lg"
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
                            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
              <Card className="border-0 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Topics in {selectedSubject.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Choose a specific area to focus on</p>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-teal-500" /></div>
                  ) : (
                    <div className="space-y-6">
                      {Array.from(new Set(topics.map(t => t.term || 'Other'))).sort((a, b) => {
                        const order: Record<string, number> = { 'First Term': 1, 'Second Term': 2, 'Third Term': 3, 'Other': 4 };
                        return (order[a as string] || 5) - (order[b as string] || 5);
                      }).map((termGroup) => (
                        <div key={termGroup as string}>
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 ml-1 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-teal-500" />
                            {termGroup as string}
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {topics.filter(t => (t.term || 'Other') === termGroup).map(topic => {
                              const tp = getTopicProgress(topic.id);
                              const pct = tp?.progress_pct ?? 0;
                              const done = !!tp?.completed_at;
                              return (
                                <Button
                                  key={topic.id}
                                  variant={selectedTopic?.id === topic.id ? 'default' : 'outline'}
                                  className={`h-auto min-h-[3.5rem] rounded-xl text-sm justify-start px-4 gap-3 flex-col items-stretch ${selectedTopic?.id === topic.id ? 'bg-teal-600' : 'hover:bg-teal-50 dark:hover:bg-teal-950/30'
                                    }`}
                                  onClick={() => handleTopicSelect(topic)}
                                >
                                  <div className="flex items-center gap-3 w-full">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedTopic?.id === topic.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
                                      }`}>
                                      {done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Layers className="w-4 h-4" />}
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
                  {topics.length === 0 && !loading && (
                    <div className="py-10 text-center">
                      <p className="text-muted-foreground italic">No topics found for this subject yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {selectedTopic && (
              <Card className="border-0 shadow-xl bg-gradient-to-r from-teal-600 to-teal-700 text-white animate-in zoom-in-95 duration-500">
                <CardContent className="p-8">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="w-32 h-32 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center flex-shrink-0 border border-white/20 overflow-hidden shadow-2xl">
                      <img src={`/avatars/ai_tutor_${tutorGender}.png`} alt="AI Tutor" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <Badge variant="outline" className="text-white border-white/30 bg-white/10 mb-2">Ready to Learn</Badge>
                      <h3 className="text-2xl font-bold mb-2">{selectedTopic.name}</h3>
                      <p className="text-teal-50 mb-6 max-w-lg">I'm ready to teach you about {selectedTopic.name}. We can start with a basic explanation or dive straight into practice.</p>

                      <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                        <Button className="bg-white text-teal-700 hover:bg-teal-50 rounded-xl px-6 gap-2" onClick={() => setShowAIPanel(true)}>
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
            <Card className="border-0 shadow-lg">
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

            <Card className="border-0 shadow-lg">
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

            <Card className="border-0 shadow-lg bg-teal-50 dark:bg-emerald-950/20 border-teal-100 dark:border-teal-900/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-sm">
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
    <Card className="border-0 shadow-lg bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/10 dark:to-slate-900 border-teal-100 dark:border-teal-900/50 mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" /> Study Materials for {topicName}
          </CardTitle>
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-teal-600 border-teal-200">Reading Material</Badge>
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
