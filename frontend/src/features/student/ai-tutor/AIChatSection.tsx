import { Sparkles, Brain, X, Target, CheckCircle2, Lock, Play, RefreshCw, Trophy, Zap, Star, Video, BookMarked, Loader2, Layers, Repeat, FileText, Activity, BookOpen, Mic, MicOff, Volume2, VolumeX, ArrowRight, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import MathText from '@/components/MathText';
import { formatTopicName, formatTopicLike } from '@/utils/topicText';
import { AIMasteryTest } from './AIMasteryTest';
import { useTopicProgress } from '@/features/student/hooks/useTopicProgress';
import { useTTS } from '@/features/student/hooks/useTTS';
import { useSpeechRecognition } from '@/features/student/hooks/useSpeechRecognition';
import { getPersonaName } from '@/features/student/utils/personaUtils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { videoAPI } from '@/services/api';

const PLACEHOLDER_TOPIC_NAMES = new Set(['CLASS', 'SUBJECT', 'TERM', 'TOPIC', 'TOPICS']);

const normalizeTopicKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const isPlaceholderOrHeaderTopicName = (name: string) => {
  const key = normalizeTopicKey(name);
  if (!key || PLACEHOLDER_TOPIC_NAMES.has(key)) return true;
  if (key.includes('LAGOS STATE GOVERNMENT MINISTRY OF EDUCATION')) return true;
  if (key.includes('UNIFIED SCHEMES OF WORK FOR PRIMARY SCHOOLS')) return true;
  if (key.startsWith('SUBJECTS ')) return true;
  return false;
};

const isWarmupRevisionTopicName = (name: string) => {
  const key = normalizeTopicKey(name);
  if (!key) return false;
  if (['REVISION', 'GENERAL REVISION', 'READINESS TEST', 'REDINESS TEST'].includes(key)) return true;
  if (/^(REVISION|READINESS|REDINESS|RESUMPTION|RESUMOTION|READING TEST)\b/.test(key)) return true;
  return /^(REVISION|READINESS|REDINESS|RESUMPTION|RESUMOTION)\b.*\b(TEST|WORK|TERM|LESSON)\b/.test(key);
};

const isRealLearningTopic = (topic: any) => {
  const name = String(topic?.name || '').trim();
  return Boolean(name) && !isPlaceholderOrHeaderTopicName(name);
};

const filterLearningTopics = (topicList: any[]) => {
  const visible = topicList.filter(isRealLearningTopic);
  while (visible.length && isWarmupRevisionTopicName(String(visible[0]?.name || ''))) {
    visible.shift();
  }
  return visible;
};

const getYouTubeEmbedSrc = (videoId: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    controls: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
  });
  if (origin) params.set('origin', origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
};

const nudgeYouTubePlayback = (iframe: HTMLIFrameElement | null) => {
  if (!iframe?.contentWindow) return;
  const sendCommand = (func: 'playVideo') => {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      'https://www.youtube.com',
    );
  };
  sendCommand('playVideo');
  window.setTimeout(() => sendCommand('playVideo'), 350);
  window.setTimeout(() => sendCommand('playVideo'), 900);
};

const stripTutorDecorations = (content: string) =>
  (content || '')
    .replace(/(^|\n)\s*(?:[\p{Extended_Pictographic}\uFE0F\u200D]\s*)+(?=#{1,6}\s+)/gu, '$1')
    .replace(/(^|\n)\s*(?:[\p{Extended_Pictographic}\uFE0F\u200D]\s*)+\*\*[^*\n]+?\*\*:\s*/gu, '$1')
    .replace(/(^|\n)\s*\*\*(Sparky|Bello|Zara|Coach Rex|Dr\. Ade)\*\*:\s*/g, '$1')
    .replace(/(^|\n)\s*(Sparky|Bello|Zara|Coach Rex|Dr\. Ade):\s*/g, '$1')
    .replace(/(^|\n)\s*(?:[\p{Extended_Pictographic}\uFE0F\u200D]\s*)+(?=(Goal|Core idea|Try this|Example|Practice|Summary)\b)/giu, '$1### ');

const addSpeechPauseToLearningHeadings = (content: string) =>
  content.replace(
    /^(#{1,6}\s+)(Goal|Core idea|Try this|Example|Practice|Summary|Watch out|Key points|Steps)(?![.!?:])/gim,
    '$1$2.'
  );

const prepareTutorMarkdown = (content: string) =>
  addSpeechPauseToLearningHeadings(stripTutorDecorations(content))
    .replace(/(^|\n)#{1,6}\s+(?:[\p{Extended_Pictographic}\uFE0F\u200D]\s*)+/gu, '$1### ')
    .replace(/^(#{1,6}\s+(?:Goal\.?|Core idea\.?|Try this\.?|Example\.?|Practice\.?|Summary\.?|Watch out\.?|Key points\.?|Steps\.?|Step\s+\d+\.?))\s+(.+)$/gim, '$1\n$2');

const openTutorFromSelection = (
  selectedTopic: any,
  setShowAIPanel: (val: boolean) => void,
  handleAIContinue: (message: string) => Promise<void>,
  aiChatMessages: any[],
) => {
  if (!selectedTopic) return;
  setShowAIPanel(true);
  if (aiChatMessages.length === 0) {
    void handleAIContinue(`Start tutoring me on ${formatTopicLike(selectedTopic)}. Give me the goal, the core idea, and one quick check question.`);
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
  videoSupportState?: {
    trigger: 'prefetch' | 'manual_request' | 'repair_support' | 'brain_power_exhausted' | 'revision_support';
    topic: string;
    reason: string;
    autoOpen: boolean;
  } | null;
  setSelectedVideo: (video: any) => void;
  setEnergy: (val: any) => void;
  suggestedTopics: any[];
  weaknessAreas: string[];
  progress?: any;
  setActiveView: (view: any) => void;
  loading: boolean;
  topics: any[];
  roadmapLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onMasteryTestComplete: (evalResult: any) => Promise<void>;
  startQuiz: (topic?: any, subject?: any) => void;
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
  videoSupportState = null,
  setSelectedVideo,
  setEnergy,
  suggestedTopics,
  weaknessAreas,
  progress,
  setActiveView,
  loading,
  topics,
  roadmapLoading,
  scrollAreaRef,
  onMasteryTestComplete,
  startQuiz,
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
  const { getTopicProgress } = useTopicProgress(showAIPanel);
  const { speak, stop, isYoungLearner, isSpeechSupported, isSpeaking } = useTTS(profile?.education_level, tutorGender);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [activeVideoLoadKey, setActiveVideoLoadKey] = useState(0);
  const [loadingVideoId, setLoadingVideoId] = useState<string | null>(null);
  const [showRecommendedVideos, setShowRecommendedVideos] = useState(false);
  const [videoFeedbackById, setVideoFeedbackById] = useState<Record<string, 'like' | 'dislike' | null>>({});
  const [placementAnswers, setPlacementAnswers] = useState<Record<string, string>>({});
  const [chatInput, setChatInput] = useState('');
  const [showMobilePath, setShowMobilePath] = useState(false);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const loggedVideoImpressionsRef = useRef<Set<string>>(new Set());
  const activeVideoPlayerRef = useRef<HTMLDivElement | null>(null);
  const activeVideoFrameRef = useRef<HTMLIFrameElement | null>(null);
  const activeVideoTrackingRef = useRef<{
    videoId: string;
    watch60Timer: ReturnType<typeof setTimeout> | null;
    completionTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const appendVoiceTranscript = useCallback((transcript: string) => {
    setChatInput((current) => {
      const prefix = current.trim();
      return `${prefix ? `${prefix} ` : ''}${transcript}`.trim();
    });
  }, []);

  useEffect(() => {
    if (!showAIPanel || aiChatMessages.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      latestMessageRef.current?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: aiLoading ? 'auto' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aiChatMessages.length, aiLoading, showAIPanel]);

  const {
    isSpeechRecognitionSupported,
    isListening,
    interimTranscript,
    speechError,
    toggleListening,
  } = useSpeechRecognition({ onTranscript: appendVoiceTranscript });

  const topicsForCurrentSubject = filterLearningTopics(
    structuredTopics.filter((t: any) => !selectedSubject || !t.subject_id || t.subject_id === selectedSubject.id)
  );
  const visibleTopics = filterLearningTopics(topics);

  const selectedTopicName = formatTopicLike(selectedTopic);
  const isCurrentTopicCompleted = topicsForCurrentSubject.find((st: any) => st.id === selectedTopic?.id)?.status === 'completed';
  const masteryPassed = aiState?.status === 'quiz_completed' && aiState?.result?.passed;
  const masteryNeedsReview = aiState?.status === 'quiz_completed' && aiState?.result && !aiState?.result?.passed;
  const isLessonCompleted = Boolean(isCurrentTopicCompleted || masteryPassed || lessonController?.stage === 'completed');
  const inLessonRepairMode = lessonController?.stage === 'remediate' && !masteryNeedsReview && !isLessonCompleted;
  const repairResolved = lessonController?.lastUiAction === 'repair_resolved' && !inLessonRepairMode && !masteryNeedsReview && !isLessonCompleted;
  const focusTopicLabel = formatTopicName((typeof viewingSubtopic === 'object' ? (viewingSubtopic as any)?.name : viewingSubtopic) || activeSubtopic || selectedTopic?.name || 'this topic');
  const conversationTurns = aiChatMessages.filter((m: any) => m.role === 'user').length;
  const lessonStageLabel = (lessonController?.stage || 'intro').replace(/_/g, ' ');
  const progressSummary = progress?.summary || {};
  const recentActivityCount = Array.isArray(progress?.recent_activities)
    ? progress.recent_activities.length
    : Array.isArray(progress?.recent_activity)
      ? progress.recent_activity.length
      : 0;
  const quizzesTaken = Math.max(
    Number(profile?.total_quizzes || 0),
    Number(profile?.quiz_count || 0),
    Number(progress?.total_quizzes || 0),
    Number(progressSummary.total_quizzes || 0),
  );
  const selectedTopicProgress = selectedTopic ? getTopicProgress(selectedTopic.id) : null;
  const focusProgressPercent = Number(selectedTopicProgress?.progress_pct || 0);
  const pathProgress = topicsForCurrentSubject.length
    ? Math.round((topicsForCurrentSubject.filter((s: any) => s.status === 'completed').length / topicsForCurrentSubject.length) * 100)
    : 0;
  const completedLessons = Math.max(
    topicsForCurrentSubject.filter((topic: any) => topic.status === 'completed').length,
    Number(progressSummary.total_lessons || 0),
  );
  const hasLearningSignals = quizzesTaken > 0
    || completedLessons > 0
    || pathProgress > 0
    || Number(progressSummary.total_time_spent || 0) > 0
    || recentActivityCount > 0;
  const currentTopicIndex = topicsForCurrentSubject.findIndex((topic: any) => topic.id === selectedTopic?.id);
  const unlockedNextTopicId = aiState?.result?.next_topic_unlocked;
  const nextLessonCandidate =
    topicsForCurrentSubject.find((topic: any) => topic.id === unlockedNextTopicId) ||
    topicsForCurrentSubject
      .slice(currentTopicIndex >= 0 ? currentTopicIndex + 1 : 0)
      .find((topic: any) => topic.status !== 'completed' && topic.status !== 'locked') ||
    topicsForCurrentSubject.find((topic: any) => topic.status === 'unlocked' || topic.status === 'in_progress' || topic.status === 'active');
  const currentUnlockedLesson =
    topicsForCurrentSubject.find((topic: any) => topic.status === 'in_progress') ||
    topicsForCurrentSubject.find((topic: any) => topic.status === 'unlocked') ||
    topicsForCurrentSubject.find((topic: any) => topic.status === 'active') ||
    topicsForCurrentSubject.find((topic: any) => topic.status !== 'locked' && topic.status !== 'completed') ||
    null;
  const prioritizedTopicIds = useMemo(() => {
    const ids: string[] = [];
    const pushId = (topic: any) => {
      if (!topic?.id) return;
      const normalized = String(topic.id);
      if (!ids.includes(normalized)) ids.push(normalized);
    };
    pushId(currentUnlockedLesson);
    pushId(selectedTopic);
    pushId(nextLessonCandidate);
    topicsForCurrentSubject
      .filter((topic: any) => {
        const status = String(topic.status || '').toLowerCase();
        return status === 'in_progress' || status === 'unlocked' || status === 'active';
      })
      .slice(0, 3)
      .forEach(pushId);
    return ids;
  }, [currentUnlockedLesson, nextLessonCandidate, selectedTopic, topicsForCurrentSubject]);
  const prioritizedTopics = useMemo(() => (
    prioritizedTopicIds
      .map((topicId) => visibleTopics.find((topic: any) => String(topic.id) === topicId))
      .filter(Boolean)
      .slice(0, 4)
  ), [prioritizedTopicIds, visibleTopics]);
  const groupedVisibleTopics = useMemo(() => {
    const order: Record<string, number> = { 'First Term': 1, 'Second Term': 2, 'Third Term': 3, 'Other': 4 };
    return Array.from(new Set(visibleTopics.map((topic: any) => topic.term || 'Other')))
      .sort((a, b) => (order[String(a)] || 5) - (order[String(b)] || 5))
      .map((termGroup) => ({
        termGroup: String(termGroup),
        topics: visibleTopics.filter((topic: any) => (topic.term || 'Other') === termGroup),
      }));
  }, [visibleTopics]);
  const stageGuidance: Record<string, string> = {
    intro: `Start ${focusTopicLabel} with a clear goal, the core idea, and one quick check.`,
    teach: `Continue ${focusTopicLabel} with one focused explanation and a small task.`,
    check_understanding: `Answer one checkpoint so EduNexus can see what is clear and what needs support.`,
    practice: `Try a worked practice question, then compare your method with the tutor's feedback.`,
    remediate: `Choose a repair step for the part that felt weak before trying another question.`,
    mastery_ready: `You are ready for the mastery check on ${focusTopicLabel}.`,
    mastery_quiz: `Complete the mastery questions carefully before returning to tutoring.`,
    completed: `This lesson is complete. Review it, or move to the next unlocked lesson.`,
  };
  const nextMoveText = stageGuidance[lessonController?.stage || 'intro'] || `Choose the support you need next for ${focusTopicLabel}.`;
  const learnerActions = [
    { label: 'Step by step', icon: Layers, prompt: `Teach ${focusTopicLabel} step by step. Start from the basics, then give me one small thing to try.` },
    { label: 'Example', icon: Star, prompt: `Give me a real-world Nigerian example for ${focusTopicLabel}, then ask me one quick check question.` },
    { label: "I'm stuck", icon: Zap, prompt: `I'm stuck on ${focusTopicLabel}. Explain it a different way using smaller steps and one analogy.` },
    { label: 'Quiz me', icon: Target, prompt: `Quiz me on ${focusTopicLabel}. Ask exactly one question first and wait for my answer before explaining.` },
    { label: 'Summarize', icon: FileText, prompt: `Summarize what I need to remember about ${focusTopicLabel} in a short study note with three key points.` },
  ];

  const actionableSuggestedTopics = useMemo(() => {
    const explicit = (suggestedTopics || [])
      .filter(Boolean)
      .map((topic: any) => (typeof topic === 'string' ? { name: topic, subject_id: selectedSubject?.id } : topic));
    if (explicit.length > 0) return explicit.slice(0, 4);

    const currentIdx = topicsForCurrentSubject.findIndex((topic: any) => topic.id === selectedTopic?.id);
    const candidates = topicsForCurrentSubject.filter((topic: any, idx: number) => {
      const status = String(topic.status || '').toLowerCase();
      if (status === 'locked' || status === 'completed') return false;
      if (selectedTopic?.id && topic.id === selectedTopic.id) return false;
      return currentIdx < 0 || idx >= currentIdx;
    });

    return candidates.slice(0, 4);
  }, [selectedSubject?.id, selectedTopic?.id, suggestedTopics, topicsForCurrentSubject]);

  const actionableWeaknessAreas = useMemo(() => {
    const profileWeaknesses = [
      ...(Array.isArray(profile?.weakness_areas) ? profile.weakness_areas : []),
      ...(Array.isArray(profile?.suggested_focus_areas) ? profile.suggested_focus_areas : []),
    ];
    const explicit = [...(weaknessAreas || []), ...profileWeaknesses]
      .filter(Boolean)
      .map((area: any) => String(area).trim())
      .filter((area: string, idx: number, list: string[]) => area && list.indexOf(area) === idx);
    if (explicit.length > 0) return explicit.slice(0, 4);

    return topicsForCurrentSubject
      .filter((topic: any) => {
        const pct = Number(topic.progress_pct || 0);
        const status = String(topic.status || '').toLowerCase();
        return status !== 'locked' && status !== 'completed' && pct > 0 && pct < 70;
      })
      .map((topic: any) => formatTopicLike(topic))
      .slice(0, 3);
  }, [profile?.suggested_focus_areas, profile?.weakness_areas, topicsForCurrentSubject, weaknessAreas]);

  const learningGoal = useMemo(() => {
    const badges = Array.isArray(profile?.badges) ? profile.badges : [];
    const quizBadgeEarned = badges.some((badge: any) => /quiz/i.test(String(badge?.name || badge)));
    const streak = Number(profile?.current_streak || 0);

    if (!quizBadgeEarned && quizzesTaken < 3) {
      const remaining = Math.max(0, 3 - quizzesTaken);
      return {
        title: 'Next Badge: Quiz Whiz',
        progress: Math.min(100, Math.round((quizzesTaken / 3) * 100)),
        note: hasLearningSignals
          ? `${remaining} more ${remaining === 1 ? 'quiz' : 'quizzes'} to unlock`
          : 'Take your first mastery quiz to start badge progress',
      };
    }
    if (completedLessons < 3) {
      const remaining = Math.max(0, 3 - completedLessons);
      return {
        title: 'Next Badge: Lesson Builder',
        progress: Math.min(100, Math.round((completedLessons / 3) * 100)),
        note: `${remaining} more ${remaining === 1 ? 'lesson' : 'lessons'} to unlock`,
      };
    }
    if (streak < 3) {
      const remaining = Math.max(0, 3 - streak);
      return {
        title: 'Next Badge: Consistency Star',
        progress: Math.min(100, Math.round((streak / 3) * 100)),
        note: `${remaining} more study ${remaining === 1 ? 'day' : 'days'} to unlock`,
      };
    }
    return { title: 'Next Badge: Mastery Builder', progress: Math.max(65, pathProgress), note: 'Keep learning to raise your mastery' };
  }, [completedLessons, hasLearningSignals, pathProgress, profile?.badges, profile?.current_streak, quizzesTaken]);
  const focusSignalItems = [
    {
      label: 'Lesson stage',
      value: lessonStageLabel.replace(/\b\w/g, (char: string) => char.toUpperCase()),
    },
    {
      label: 'Topic progress',
      value: `${focusProgressPercent}%`,
    },
    {
      label: 'Learning path',
      value: `${pathProgress}%`,
    },
  ];
  const shouldShowSupportRail = Boolean(
    selectedSubject
    || selectedTopic
    || actionableSuggestedTopics.length > 0
    || actionableWeaknessAreas.length > 0
  );
  const completedLessonLabel = selectedTopic?.name || focusTopicLabel;

  const shouldEncourageVideoReview = videoSupportState?.trigger === 'brain_power_exhausted';
  const failedMasteryReviewQuestions = Array.isArray(aiState?.result?.review_questions) ? aiState.result.review_questions : [];
  const videoSupportBadge = useMemo(() => {
    switch (videoSupportState?.trigger) {
      case 'repair_support':
        return 'Repair support';
      case 'manual_request':
        return 'Second teaching voice';
      case 'brain_power_exhausted':
        return 'Recovery support';
      case 'revision_support':
        return 'Revision support';
      default:
        return 'Ready when needed';
    }
  }, [videoSupportState?.trigger]);
  const videoSupportMessage = videoSupportState?.reason || (
    suggestedVideos.length > 0
      ? 'EduNexus prepared these quietly in case you want a second explanation voice for this lesson.'
      : ''
  );

  useEffect(() => {
    if (videoSupportState?.autoOpen && suggestedVideos.length > 0) {
      setShowRecommendedVideos(true);
    }
  }, [suggestedVideos.length, videoSupportState?.autoOpen]);

  useEffect(() => {
    if (!selectedTopic) {
      setShowRecommendedVideos(false);
    }
  }, [selectedTopic?.id]);

  useEffect(() => {
    const feedbackState = suggestedVideos.reduce((acc: Record<string, 'like' | 'dislike' | null>, video: any) => {
      acc[String(video.id)] = video?.learner_feedback === 'like' || video?.learner_feedback === 'dislike'
        ? video.learner_feedback
        : null;
      return acc;
    }, {});
    setVideoFeedbackById(feedbackState);
  }, [suggestedVideos]);

  const videoContext = useMemo(() => ({
    topicName: String(selectedTopic?.name || activeSubtopic || focusTopicLabel || '').trim(),
    subjectName: String(selectedSubject?.name || '').trim() || undefined,
    source: videoSupportState?.trigger || (shouldEncourageVideoReview ? 'brain_power_exhausted' : 'tutor'),
  }), [activeSubtopic, focusTopicLabel, selectedSubject?.name, selectedTopic?.name, shouldEncourageVideoReview, videoSupportState?.trigger]);

  const recordVideoEvent = useCallback(async (
    video: any,
    eventType: 'impression' | 'click' | 'watch_start' | 'watch_60s' | 'watch_complete',
    extras?: { watch_seconds?: number; metadata?: Record<string, any> },
  ) => {
    if (!video?.id || !videoContext.topicName) return;
    try {
      await videoAPI.recordEvent({
        video_id: String(video.id),
        topic_name: videoContext.topicName,
        subject_name: videoContext.subjectName,
        source: videoContext.source,
        event_type: eventType,
        watch_seconds: extras?.watch_seconds || 0,
        video_title: video.title,
        channel_title: video.channel_title,
        metadata: extras?.metadata || {},
      });
    } catch (error) {
      console.error('Video event tracking failed:', error);
    }
  }, [videoContext]);

  const openRecommendedVideo = useCallback((video: any) => {
    setSelectedVideo(video);
    setEnergy((prev: number) => Math.min(100, prev + 25));
    if (video?.is_search_fallback) {
      window.open(video.url, '_blank', 'noopener,noreferrer');
      setActiveVideo(null);
      setLoadingVideoId(null);
    } else {
      const nextVideoId = String(video.id);
      setShowRecommendedVideos(true);
      setLoadingVideoId(nextVideoId);
      if (String(activeVideo) === nextVideoId) {
        nudgeYouTubePlayback(activeVideoFrameRef.current);
      } else {
        setActiveVideo(nextVideoId);
        setActiveVideoLoadKey((prev) => prev + 1);
      }
    }
    void recordVideoEvent(video, 'click');
  }, [activeVideo, recordVideoEvent, setEnergy, setSelectedVideo]);

  const handleVideoFeedback = useCallback(async (video: any, feedback: 'like' | 'dislike') => {
    if (!video?.id || !videoContext.topicName) return;
    setVideoFeedbackById((prev) => ({ ...prev, [String(video.id)]: feedback }));
    try {
      const response = await videoAPI.setFeedback({
        video_id: String(video.id),
        topic_name: videoContext.topicName,
        subject_name: videoContext.subjectName,
        feedback,
        video_title: video.title,
        channel_title: video.channel_title,
      });

      const evidence = response?.platform_evidence;
      if (evidence) {
        video.platform_evidence = {
          ...(video.platform_evidence || {}),
          ...evidence,
        };
      }
      video.learner_feedback = feedback;
    } catch (error) {
      console.error('Video feedback failed:', error);
    }
  }, [videoContext]);

  useEffect(() => {
    if (!showRecommendedVideos || !videoContext.topicName || suggestedVideos.length === 0) return;
    suggestedVideos.forEach((video: any) => {
      const key = `${videoContext.topicName}::${video.id}`;
      if (loggedVideoImpressionsRef.current.has(key)) return;
      loggedVideoImpressionsRef.current.add(key);
      void recordVideoEvent(video, 'impression');
    });
  }, [recordVideoEvent, showRecommendedVideos, suggestedVideos, videoContext.topicName]);

  useEffect(() => {
    const currentTracking = activeVideoTrackingRef.current;
    if (currentTracking?.watch60Timer) clearTimeout(currentTracking.watch60Timer);
    if (currentTracking?.completionTimer) clearTimeout(currentTracking.completionTimer);
    activeVideoTrackingRef.current = null;

    const activeVideoMeta = suggestedVideos.find((video: any) => String(video.id) === String(activeVideo));
    if (!activeVideo || !activeVideoMeta || activeVideoMeta?.is_search_fallback) {
      return;
    }

    void recordVideoEvent(activeVideoMeta, 'watch_start');
    const durationSeconds = Number(activeVideoMeta.duration || 0);
    const completionDelayMs = Math.max(
      90000,
      Math.min(durationSeconds > 0 ? durationSeconds * 1000 : 240000, 480000),
    );
    const watch60Timer = setTimeout(() => {
      void recordVideoEvent(activeVideoMeta, 'watch_60s', { watch_seconds: 60 });
    }, 60000);
    const completionTimer = setTimeout(() => {
      void recordVideoEvent(activeVideoMeta, 'watch_complete', {
        watch_seconds: Math.max(90, Math.round(completionDelayMs / 1000)),
        metadata: { completion_mode: 'timed_embed_watch' },
      });
    }, completionDelayMs);

    activeVideoTrackingRef.current = {
      videoId: String(activeVideoMeta.id),
      watch60Timer,
      completionTimer,
    };

    return () => {
      clearTimeout(watch60Timer);
      clearTimeout(completionTimer);
    };
  }, [activeVideo, recordVideoEvent, suggestedVideos]);

  useEffect(() => {
    if ((!activeVideo && !loadingVideoId) || !showRecommendedVideos) return;
    const frame = window.requestAnimationFrame(() => {
      activeVideoPlayerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeVideo, loadingVideoId, showRecommendedVideos]);

  const renderRecommendedVideoCard = useCallback((video: any, compact = false) => {
    const learnerFeedback = videoFeedbackById[String(video.id)];
    const evidence = video?.platform_evidence || {};
    const helpfulCount = Number(evidence.likes || 0);
    const isPrimaryRecommendation = suggestedVideos.length > 0 && String(suggestedVideos[0]?.id) === String(video?.id);
    const isActiveRecommendation = !video?.is_search_fallback && String(activeVideo) === String(video?.id);
    const isLoadingRecommendation = !video?.is_search_fallback && String(loadingVideoId) === String(video?.id);
    const recommendationLabel = isPrimaryRecommendation
      ? 'Best next help'
      : video?.is_search_fallback
        ? 'Backup search path'
        : 'More options';
    const recommendationTone = isPrimaryRecommendation
      ? 'border-primary/20 bg-primary/10 text-primary'
        : 'border-slate-200 bg-slate-100/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
    const primaryReason = video?.why_recommended?.[0];
    const secondaryReason = video?.why_recommended?.[1];
    const videoDetails = (
      <CardContent className={compact ? 'p-2.5' : 'p-3'}>
        <div className="flex items-start justify-between gap-2">
          <div className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${recommendationTone}`}>
            {recommendationLabel}
          </div>
          {!video?.is_search_fallback ? (
            <div className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {video.duration_text || 'Video lesson'}
            </div>
          ) : null}
        </div>
        <h4 className="mt-2 line-clamp-2 text-sm font-bold leading-5 transition-colors group-hover:text-primary">{video.title}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{video.channel_title}</p>
        {primaryReason ? (
          <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-600 dark:text-slate-300">{primaryReason}</p>
        ) : null}
        {secondaryReason ? (
          <p className="mt-1 line-clamp-1 text-[10px] leading-4 text-muted-foreground">{secondaryReason}</p>
        ) : null}
      </CardContent>
    );

    return (
      <Card
        key={video.id}
        className={`group min-w-0 overflow-hidden rounded-lg transition-all dark:border-slate-800 ${
          isPrimaryRecommendation
            ? 'border-primary/25 bg-primary/5 shadow-none hover:border-primary/50'
            : 'border-slate-100 bg-white shadow-none hover:border-primary/30'
        }`}
      >
        {isActiveRecommendation || isLoadingRecommendation ? (
          <>
            <div ref={activeVideoPlayerRef} className="relative aspect-video overflow-hidden bg-black">
              {isActiveRecommendation && activeVideo ? (
                <iframe
                  ref={activeVideoFrameRef}
                  key={`${activeVideo}-${activeVideoLoadKey}`}
                  title={`Recommended lesson video: ${video.title}`}
                  className="absolute inset-0 h-full w-full"
                  src={getYouTubeEmbedSrc(String(activeVideo))}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  onLoad={(event) => {
                    setLoadingVideoId((current) => (current === String(video.id) ? null : current));
                    nudgeYouTubePlayback(event.currentTarget);
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                  <Loader2 className="h-7 w-7 animate-spin" />
                  <p className="text-sm font-semibold">Loading video...</p>
                </div>
              )}
              <button
                type="button"
                className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                onClick={() => {
                  setActiveVideo(null);
                  setLoadingVideoId(null);
                }}
                aria-label="Close video"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {videoDetails}
          </>
        ) : (
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => openRecommendedVideo(video)}
          >
            <div className="relative aspect-video overflow-hidden">
              {video.thumbnail ? (
                <>
                  <img src={video.thumbnail} alt={video.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-8 w-8 fill-current text-white" />
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/50 px-4 text-center">
                  <div className="space-y-2">
                    <Video className="mx-auto h-8 w-8 text-primary/70" />
                    <p className="text-xs font-semibold text-foreground">
                      {video?.is_search_fallback ? 'Evidence-based YouTube search' : 'Video suggestion'}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {videoDetails}
          </button>
        )}
        <div
          className="cursor-pointer border-t border-border px-3 py-2.5"
          onClick={() => openRecommendedVideo(video)}
        >
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{isPrimaryRecommendation ? 'Start here first' : (video.duration_text || 'Video lesson')}</span>
            {helpfulCount > 0 ? <span>{helpfulCount} found this helpful</span> : <span>Rate this for others</span>}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={learnerFeedback === 'like' ? 'default' : 'outline'}
              className="h-8 flex-1 rounded-lg"
              onClick={(event) => {
                event.stopPropagation();
                void handleVideoFeedback(video, 'like');
              }}
            >
              <ThumbsUp className="mr-1.5 h-3.5 w-3.5" /> Helpful
            </Button>
            <Button
              type="button"
              size="sm"
              variant={learnerFeedback === 'dislike' ? 'default' : 'outline'}
              className="h-8 flex-1 rounded-lg"
              onClick={(event) => {
                event.stopPropagation();
                void handleVideoFeedback(video, 'dislike');
              }}
            >
              <ThumbsDown className="mr-1.5 h-3.5 w-3.5" /> Not helpful
            </Button>
          </div>
          {video?.is_search_fallback ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              We could not fetch a direct video right now, so EduNexus prepared the best search path instead.
            </p>
          ) : null}
        </div>
      </Card>
    );
  }, [activeVideo, activeVideoLoadKey, handleVideoFeedback, loadingVideoId, openRecommendedVideo, suggestedVideos, videoFeedbackById]);

  const submitChatInput = useCallback(async () => {
    const message = chatInput.trim();
    if (!message || showMasteryTest || aiLoading || isLessonCompleted) return;
    setChatInput('');
    await handleAIContinue(message);
  }, [aiLoading, chatInput, handleAIContinue, isLessonCompleted, showMasteryTest]);

  const handleContinueToNextLesson = useCallback(async () => {
    if (!nextLessonCandidate) return;
    await handleTopicSelect(nextLessonCandidate);
  }, [handleTopicSelect, nextLessonCandidate]);

  const startMasteryRecovery = useCallback(async (mode: 'review' | 'simplify' | 'practice') => {
    const reviewTargets = failedMasteryReviewQuestions
      .slice(0, 2)
      .map((item: any) => item.prompt)
      .filter(Boolean)
      .join(' | ');

    if (mode === 'review') {
      await handleAIContinue(
        reviewTargets
          ? `Help me review the missed parts of ${focusTopicLabel}. Focus especially on these questions: ${reviewTargets}. Explain the mistakes clearly, then ask me one short check question.`
          : `Help me review the missed parts of ${focusTopicLabel}. Explain the weak points clearly, then ask me one short check question.`
      );
      return;
    }

    if (mode === 'simplify') {
      await handleAIContinue(
        `I did not pass the mastery check on ${focusTopicLabel}. Please reteach the hardest part in simpler steps with one analogy before asking me an easier question.`
      );
      return;
    }

    await handleAIContinue(
      reviewTargets
        ? `Give me one fresh practice question on ${focusTopicLabel} that repairs the ideas behind these missed questions: ${reviewTargets}. Wait for my answer before explaining.`
        : `Give me one fresh practice question on ${focusTopicLabel} that targets the part I just missed. Wait for my answer before explaining.`
    );
  }, [failedMasteryReviewQuestions, focusTopicLabel, handleAIContinue]);

  const startLessonRepair = useCallback(async (mode: 'review' | 'simplify' | 'practice') => {
    if (mode === 'review') {
      await handleAIContinue(
        `Let's repair ${focusTopicLabel}. Show me exactly where my last answer went wrong, correct it clearly, then ask me one short check question on that same step.`
      );
      return;
    }

    if (mode === 'simplify') {
      await handleAIContinue(
        `Please reteach the part I just missed in ${focusTopicLabel} using smaller steps and one simple analogy, then ask me an easier question.`
      );
      return;
    }

    await handleAIContinue(
      `Give me one lighter repair question on ${focusTopicLabel} that checks the same idea I just missed. Wait for my answer before explaining.`
    );
  }, [focusTopicLabel, handleAIContinue]);

  const continueAfterRepair = useCallback(async (mode: 'check' | 'practice') => {
    if (mode === 'check') {
      await handleAIContinue(
        `Give me one short confirmation check on ${focusTopicLabel} so I can prove that repaired step is now stable.`
      );
      return;
    }

    await handleAIContinue(
      `Give me one fresh practice question on ${focusTopicLabel} now that the repaired step is clearer. Wait for my answer before explaining.`
    );
  }, [focusTopicLabel, handleAIContinue]);

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
    <div className="flex-1 flex min-w-0 max-w-full flex-col h-full overflow-hidden">
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
        <Card className="flex-1 flex min-w-0 max-w-full flex-col shadow-none border-0 overflow-hidden bg-white dark:bg-slate-900 min-h-0">
          <CardHeader className="min-h-14 h-auto py-2 px-3 sm:px-6 border-b bg-white dark:bg-slate-900 z-10 shrink-0 flex items-center justify-center">
            <div className="flex items-center justify-between w-full gap-2">
              <div className="min-w-0 flex items-center gap-2 sm:gap-3">
                <Avatar className="w-8 h-8 sm:w-12 sm:h-12 border-2 border-teal-100 dark:border-teal-900 shadow-none">
                  <AvatarImage src={`/avatars/ai_tutor_${tutorGender}.png`} className="object-cover" />
                  <AvatarFallback className="bg-teal-50 text-teal-700 text-xs font-bold">
                    AI
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 max-w-[4.8rem] min-[360px]:max-w-[6rem] sm:max-w-none flex flex-col">
                  <CardTitle className="block text-sm sm:text-xl font-bold text-slate-800 dark:text-slate-100 leading-none mb-0.5 truncate whitespace-nowrap">
                    {getPersonaName(profile?.education_level)}
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
                    Learning: {selectedTopicName}
                  </Badge>
                )}
                {topicsForCurrentSubject.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMobilePath((value) => !value)}
                    className="md:hidden rounded-lg h-8 px-2 border-teal-100 text-teal-700"
                  >
                    <Target className="w-4 h-4 mr-1" />
                    Path
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowAIPanel(false)} className="rounded-full h-8 px-2 sm:px-3 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Close</span>
                </Button>
              </div>
            </div>
          </CardHeader>

          {showMobilePath && topicsForCurrentSubject.length > 0 && (
            <>
              <button
                type="button"
                aria-label="Close learning path"
                className="fixed inset-0 z-[70] bg-slate-950/25 md:hidden"
                onClick={() => setShowMobilePath(false)}
              />
              <div className="fixed inset-x-3 top-32 bottom-24 z-[80] md:hidden rounded-lg border border-teal-100 bg-white shadow-2xl flex flex-col overflow-hidden dark:bg-slate-950 dark:border-slate-800">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <Target className="w-3.5 h-3.5 text-teal-600" /> Learning Path
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-teal-700">{pathProgress}%</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowMobilePath(false)}
                        className="h-8 w-8 rounded-full"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden dark:bg-slate-800">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pathProgress}%` }} />
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-2">
                  {topicsForCurrentSubject.map((st: any) => {
                    const isActive = selectedTopic?.id === st.id;
                    const isLocked = st.status === 'locked';
                    const isCompleted = st.status === 'completed';

                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setShowMobilePath(false);
                          void (isLocked ? startPlacementCheck(st) : handleTopicSelect(st));
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-all border ${
                          isActive
                            ? 'bg-teal-50 border-teal-200'
                            : isLocked
                              ? 'bg-slate-50 border-dashed border-slate-200'
                              : 'bg-white border-slate-100'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isCompleted ? 'bg-emerald-100 text-emerald-700' : isActive ? 'bg-teal-600 text-white' : isLocked ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : isLocked ? <Lock className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold leading-snug text-slate-800 break-words dark:text-slate-100">{formatTopicLike(st)}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {isCompleted ? 'Mastered' : isLocked ? 'Placement check required' : 'Active learning'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="flex-1 flex min-w-0 max-w-full flex-row min-h-0 overflow-hidden relative">
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
                          {pathProgress}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-white/50 dark:border-slate-700 shadow-inner">
                        <div
                          className="h-full bg-primary transition-all duration-500 ease-out"
                          style={{ width: `${pathProgress}%` }}
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
                                  {formatTopicLike(st)}
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
                              {formatTopicLike(st)}
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
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md overflow-y-auto p-2 sm:p-4 md:p-10 flex justify-center items-start animate-in fade-in duration-300">
                  <div className="w-full max-w-4xl animate-in zoom-in-95 duration-500 my-4 md:my-auto">
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
                          Unlock {formatTopicName(placementState?.target_topic?.name || placementState?.targetTopic?.name || 'this lesson')}
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
                            {(placementState.prerequisite_topics?.length || 0) || placementState.questions.length} prerequisite lesson{((placementState.prerequisite_topics?.length || 0) || placementState.questions.length) === 1 ? '' : 's'} will be checked with {placementState.questions.length} questions.
                          </p>
                        </div>

                        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                          {placementState.questions.map((question: any, index: number) => (
                            <div key={question.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                                {index + 1}. {formatTopicName(question.topic_name)}
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
                    <div className="animate-in fade-in zoom-in duration-700">
                      <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 items-start gap-4">
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-primary/20 bg-primary/10">
                              <img src={`/avatars/ai_tutor_${tutorGender}.png`} alt="AI Tutor" className="h-full w-full object-cover scale-105" />
                            </div>
                            <div className="min-w-0">
                              <Badge variant="outline" className="mb-2 rounded-full text-[10px] font-semibold uppercase tracking-wide">
                                Guided tutoring
                              </Badge>
                              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                Learn {focusTopicLabel} with a calmer, step-by-step flow
                              </h3>
                              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                                We will build this lesson in small pieces, check what is clear, and slow down where you need support.
                              </p>
                            </div>
                          </div>
                          <div className="grid w-full gap-2 sm:grid-cols-3 lg:max-w-sm">
                            {focusSignalItems.map((item) => (
                              <div key={item.label} className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{item.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <Button
                            variant="outline"
                            disabled={roadmapLoading}
                            className="h-auto rounded-lg border-border px-4 py-4 text-left hover:border-primary/40 hover:bg-muted/40"
                            onClick={() => handleAIContinue(`Give me a learning map for ${focusTopicLabel}. Show the goal, the simple idea, and the first thing I should try.`)}
                          >
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Learning map</p>
                              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Show me the path</p>
                            </div>
                          </Button>
                          <Button
                            variant="outline"
                            disabled={roadmapLoading}
                            className="h-auto rounded-lg border-border px-4 py-4 text-left hover:border-primary/40 hover:bg-muted/40"
                            onClick={() => handleAIContinue(`Teach me ${focusTopicLabel} interactively. Explain one idea, ask one check question, then wait for me.`)}
                          >
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Guided lesson</p>
                              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Teach me interactively</p>
                            </div>
                          </Button>
                          <Button
                            variant="outline"
                            disabled={roadmapLoading}
                            className="h-auto rounded-lg border-border px-4 py-4 text-left hover:border-primary/40 hover:bg-muted/40"
                            onClick={() => handleAIContinue(`Start with an easy example for ${focusTopicLabel}, then ask me one short question.`)}
                          >
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Easy start</p>
                              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Begin with an example</p>
                            </div>
                          </Button>
                          <Button
                            variant="outline"
                            disabled={roadmapLoading}
                            className="h-auto rounded-lg border-border px-4 py-4 text-left hover:border-primary/40 hover:bg-muted/40"
                            onClick={() => handleAIContinue(`Tell me what students usually get wrong about ${focusTopicLabel}, then teach me the right idea.`)}
                          >
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Watch-outs</p>
                              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Show likely mistakes</p>
                            </div>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0 space-y-8 pb-10">
                      {aiChatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          ref={idx === aiChatMessages.length - 1 ? latestMessageRef : null}
                          className={`flex w-full min-w-0 scroll-mt-24 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}
                        >
                          <div className={`flex min-w-0 max-w-full gap-2.5 sm:gap-4 ${msg.role === 'user' ? 'ml-auto w-[92%] flex-row-reverse sm:w-[84%] lg:w-[76%]' : 'w-full sm:max-w-[90%] lg:max-w-[80%]'}`}>
                            <Avatar className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 shadow-none border-2 border-white dark:border-slate-800">
                              {msg.role === 'ai' ? (
                                <AvatarImage src={`/avatars/ai_tutor_${tutorGender}.png`} className="object-cover" />
                              ) : (
                                <AvatarImage src={avatarUrl || user?.avatar_url || profile?.avatar_url || user?.avatar} className="object-cover" />
                              )}
                              <AvatarFallback className={msg.role === 'ai' ? 'bg-teal-600 text-white' : 'bg-slate-200'}>
                                {msg.role === 'ai' ? <Brain className="w-5 h-5" /> : (getFullName()[0] || 'U')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
                              <div className={`w-full min-w-0 max-w-full overflow-hidden p-3 sm:p-5 rounded-lg shadow-none ${msg.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-tr-none'
                                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-tl-none ring-1 ring-black/5 dark:ring-white/5'
                                }`}>
                                <div className={`${isYoungLearner && msg.role === 'ai' ? 'text-base font-bold font-display sm:text-xl' : 'text-sm sm:text-base'} min-w-0 max-w-full overflow-hidden break-words leading-relaxed [overflow-wrap:anywhere] prose dark:prose-invert prose-p:max-w-full prose-pre:max-w-full prose-pre:overflow-x-auto prose-table:block prose-table:max-w-full prose-table:overflow-x-auto`}>
                                  {msg.role === 'ai' ? (
                                    <AcademicMarkdown className="prose-p:mb-3 prose-li:mb-1 prose-headings:mb-3 prose-headings:tracking-normal prose-strong:text-slate-950 dark:prose-strong:text-white">
                                      {prepareTutorMarkdown(msg.content)}
                                    </AcademicMarkdown>
                                  ) : (
                                    <p className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><MathText>{msg.content}</MathText></p>
                                  )}
                                </div>
                              </div>

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

                      {isLessonCompleted && (
                        <div className="max-w-6xl mx-auto rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 shadow-none dark:border-emerald-900/50 dark:bg-emerald-950/20">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Lesson Complete</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                                You have mastered <span className="font-bold">{completedLessonLabel}</span>. This lesson now stays open as a revision stop, while live tutoring stays closed so your progress does not reopen by accident.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {suggestedVideos.length > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-11 rounded-lg border-emerald-200 bg-white px-4 font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-300"
                                  onClick={() => setShowRecommendedVideos(true)}
                                >
                                  <Video className="mr-2 h-4 w-4" />
                                  Review with videos
                                </Button>
                              )}
                              <Button
                                type="button"
                                disabled={!nextLessonCandidate}
                                onClick={handleContinueToNextLesson}
                                className="h-11 rounded-lg bg-teal-600 px-4 font-bold text-white hover:bg-teal-700 disabled:opacity-60"
                              >
                                {nextLessonCandidate ? 'Move to Next Lesson' : 'All Lessons Completed'}
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {isLessonCompleted && (
                        <div className="max-w-6xl mx-auto rounded-lg border border-slate-200 bg-white p-4 shadow-none dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Revision Mode</p>
                              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                Use the lesson transcript, recommended videos, and the next unlocked lesson to keep momentum without reopening this mastered topic.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {aiChatMessages.length > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-lg"
                                  onClick={() => {
                                    latestMessageRef.current?.scrollIntoView({
                                      block: 'start',
                                      inline: 'nearest',
                                      behavior: 'smooth',
                                    });
                                  }}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Review lesson transcript
                                </Button>
                              )}
                              {suggestedVideos.length > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-lg"
                                  onClick={() => setShowRecommendedVideos((prev) => !prev)}
                                >
                                  <Video className="mr-2 h-4 w-4" />
                                  {showRecommendedVideos ? 'Hide videos' : 'Show videos'}
                                </Button>
                              )}
                              {nextLessonCandidate && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-lg"
                                  onClick={handleContinueToNextLesson}
                                >
                                  <ArrowRight className="mr-2 h-4 w-4" />
                                  Open next lesson
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {masteryNeedsReview && !aiLoading && !showMasteryTest && (
                        <div className="max-w-6xl mx-auto rounded-lg border border-amber-200 bg-amber-50/70 p-4 shadow-none dark:border-amber-900/50 dark:bg-amber-950/20">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Recovery Plan</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                                You are close, but <span className="font-bold">{focusTopicLabel}</span> still needs repair before the next mastery check.
                                {aiState?.result?.missed_count
                                  ? ` EduNexus marked ${aiState.result.missed_count} ${aiState.result.missed_count === 1 ? 'question' : 'questions'} for review.`
                                  : ' Start with one guided repair step below.'}
                              </p>
                              {failedMasteryReviewQuestions.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {failedMasteryReviewQuestions.slice(0, 2).map((item: any) => (
                                    <span
                                      key={item.question_id}
                                      className="inline-flex max-w-full items-center rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 dark:border-amber-900/60 dark:bg-slate-900 dark:text-slate-300"
                                    >
                                      {formatTopicLike(item.prompt)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-lg border-amber-200 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-slate-900 dark:text-amber-300"
                                onClick={() => void startMasteryRecovery('review')}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Review missed concepts
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-lg border-amber-200 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-slate-900 dark:text-amber-300"
                                onClick={() => void startMasteryRecovery('simplify')}
                              >
                                <Layers className="mr-2 h-4 w-4" />
                                Simplify it for me
                              </Button>
                              <Button
                                type="button"
                                className="rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                                onClick={() => void startMasteryRecovery('practice')}
                              >
                                <Target className="mr-2 h-4 w-4" />
                                Try one repair question
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {inLessonRepairMode && !aiLoading && !showMasteryTest && (
                        <div className="max-w-6xl mx-auto rounded-lg border border-amber-200 bg-amber-50/70 p-4 shadow-none dark:border-amber-900/50 dark:bg-amber-950/20">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Repair This Step</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                                EduNexus thinks <span className="font-bold">{focusTopicLabel}</span> needs one smaller repair before we move on.
                                Stay with this exact step, fix the weak part, then try a lighter check.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-lg border-amber-200 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-slate-900 dark:text-amber-300"
                                onClick={() => void startLessonRepair('review')}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Show what I missed
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-lg border-amber-200 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-slate-900 dark:text-amber-300"
                                onClick={() => void startLessonRepair('simplify')}
                              >
                                <Layers className="mr-2 h-4 w-4" />
                                Break it down
                              </Button>
                              <Button
                                type="button"
                                className="rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                                onClick={() => void startLessonRepair('practice')}
                              >
                                <Target className="mr-2 h-4 w-4" />
                                Try a lighter check
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {repairResolved && !aiLoading && !showMasteryTest && (
                        <div className="max-w-6xl mx-auto rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 shadow-none dark:border-emerald-900/50 dark:bg-emerald-950/20">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Back On Track</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                                That weak step in <span className="font-bold">{focusTopicLabel}</span> looks healthier now.
                                Confirm it with one short check, or try one fresh practice question before we build further.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-lg border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-300"
                                onClick={() => void continueAfterRepair('check')}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Confirm this step
                              </Button>
                              <Button
                                type="button"
                                className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => void continueAfterRepair('practice')}
                              >
                                <Target className="mr-2 h-4 w-4" />
                                Fresh practice
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!isLessonCompleted && !masteryNeedsReview && !inLessonRepairMode && !repairResolved && !aiLoading && !showMasteryTest && aiChatMessages.length > 0 && (
                        <div className="max-w-6xl mx-auto rounded-lg border border-teal-100 dark:border-teal-900/50 bg-teal-50/60 dark:bg-teal-950/10 p-4 shadow-none">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Next Learning Move</p>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                <span className="font-bold capitalize">{lessonStageLabel}</span>: {nextMoveText}
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

                      {!aiLoading && !showMasteryTest && suggestedVideos.length > 0 && (
                        <div className="max-w-6xl mx-auto min-w-0 rounded-lg border border-slate-100 bg-white p-4 shadow-none dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                                <Video className="h-4 w-4 text-teal-600" /> Recommended videos for this lesson
                              </p>
                              <p className="text-xs text-muted-foreground">{videoSupportMessage}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="w-fit shrink-0 text-[10px] uppercase font-bold text-teal-600 border-teal-200">
                                {videoSupportBadge}
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg"
                                onClick={() => setShowRecommendedVideos((prev) => !prev)}
                              >
                                {showRecommendedVideos ? 'Hide videos' : 'Show videos'}
                              </Button>
                            </div>
                          </div>
                          {showRecommendedVideos && (
                            <>
                              <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">How to use these</p>
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                  Start with the first video if you want the clearest next explanation for this exact lesson step. EduNexus ranks these by topic fit and learner signals, not by pretending the tutor has watched them for you.
                                </p>
                              </div>
                              <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                                {suggestedVideos.map((video) => renderRecommendedVideoCard(video, true))}
                              </div>
                              </>
                            )}
                          </div>
                      )}

                      {aiLoading && (
                        <div className="flex justify-start animate-in fade-in duration-300">
                          <div className="flex gap-4 items-center">
                            <Avatar className="w-10 h-10 shadow-none border-2 border-white dark:border-slate-800">
                              <AvatarImage src={`/avatars/ai_tutor_${tutorGender}.png`} />
                              <AvatarFallback className="bg-teal-600 text-white"><Brain className="w-5 h-5" /></AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 p-4 px-5 bg-slate-50 dark:bg-slate-800/50 rounded-lg rounded-tl-none border border-slate-100 dark:border-slate-700">
                              <div className="flex items-center gap-3">
                                <div className="relative h-8 w-8 shrink-0 rounded-full border border-teal-100 bg-white dark:bg-slate-900">
                                  <span className="absolute inset-1 rounded-full border-2 border-teal-500/20 border-t-teal-600 animate-spin" />
                                  <Brain className="absolute inset-0 m-auto h-3.5 w-3.5 text-teal-700" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Preparing a clear next step</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">Checking the lesson context and your last answer.</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div >
              </ScrollArea>

              {/* Chat Input */}
              <div className="p-3 sm:px-6 border-t bg-white/50 dark:bg-slate-900/50 backdrop-blur-md z-10">
                <div className="relative group max-w-6xl mx-auto">
                  {isLessonCompleted && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50/80 dark:bg-slate-900/80 rounded-lg backdrop-blur-[1px] border border-emerald-200 dark:border-emerald-900/50">
                      <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-900 rounded-lg shadow-none  border border-emerald-100 dark:border-emerald-900">
                        <Trophy className="w-6 h-6 text-emerald-500 animate-bounce" />
                        <div>
                          <p className="text-sm font-black text-slate-800 dark:text-slate-100">Topic Mastered!</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Review Mode Only</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-4 h-8 text-xs font-black text-teal-600 hover:bg-teal-50"
                          onClick={handleContinueToNextLesson}
                          disabled={!nextLessonCandidate}
                        >
                          Next Topic
                        </Button>
                      </div>
                    </div>
                  )}
                  <Input
                    placeholder={showMasteryTest ? "Mastery Test in Progress..." : (isCheckingUnderstanding ? "Type your explanation here..." : isLessonCompleted ? "Topic completed!" : `Ask about ${(typeof viewingSubtopic === 'object' ? (viewingSubtopic as any)?.name : viewingSubtopic) || activeSubtopic || "this topic"}...`)}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="rounded-lg py-5 sm:py-6 pl-4 sm:pl-6 pr-24 sm:pr-32 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-4 focus:ring-teal-500/10 transition-all shadow-none text-base sm:text-lg resize-none"
                    autoFocus
                    disabled={showMasteryTest || aiLoading || isLessonCompleted}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && chatInput.trim() && !showMasteryTest && !isLessonCompleted) {
                        e.preventDefault();
                        submitChatInput();
                      }
                    }}
                  />
                  {!showMasteryTest && !isLessonCompleted && (
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
                {(isListening || interimTranscript || speechError || !isSpeechRecognitionSupported) && !showMasteryTest && !isLessonCompleted && (
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
                <div className="hidden sm:flex items-center justify-center gap-6 mt-4 opacity-60">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Guided lesson flow</p>
                  <div className="h-1 w-1 bg-slate-400 rounded-full" />
                  <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.18em]">Mastery-aware tutor</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className={`grid gap-5 flex-1 min-h-0 overflow-y-auto overscroll-contain pb-8 px-3 sm:px-4 ${shouldShowSupportRail ? 'xl:grid-cols-[minmax(0,1fr)_296px]' : 'grid-cols-1'}`}>
          <div className="min-w-0 space-y-4">
            <Card className="rounded-lg border-border shadow-none bg-card">
              <CardHeader className="flex flex-row items-center justify-between py-3 sm:py-4">
                <div>
                  <CardTitle className="text-base sm:text-lg font-semibold">Select Subject</CardTitle>
                  <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground">Pick a subject you are enrolled in to start learning</p>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <Badge variant="outline" className="rounded-full text-[11px] font-semibold">
                    {displaySubjects.length} active subject{displaySubjects.length === 1 ? '' : 's'}
                  </Badge>
                  {!selectedSubject && (
                    <Badge variant="secondary" className="rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {learningGoal.note}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <div key={`subject-skeleton-${index}`} className="rounded-lg border border-border px-3 py-2.5 sm:p-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-lg sm:h-9 sm:w-9" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : displaySubjects.length > 0 ? (
                    displaySubjects.map(subject => (
                      <button
                        key={subject.id}
                        className={`group min-w-0 rounded-lg border px-3 py-2.5 sm:p-3 transition-all flex items-center gap-3 text-left ${selectedSubject?.id === subject.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/40 hover:bg-muted/40'
                          }`}
                        onClick={() => handleSubjectSelect(subject)}
                      >
                        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <BookMarked className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-[15px] sm:text-sm">{subject.name}</span>
                          <span className="block text-[10px] sm:text-[11px] text-muted-foreground">Ready to continue</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center">
                      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookMarked className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="font-semibold text-slate-700 dark:text-slate-200">You have not picked a learning lane yet.</p>
                      <p className="mt-2 text-sm text-muted-foreground">Open your subject catalog, enroll in the subjects you want, and your tutor workspace will be ready here.</p>
                      <Button variant="outline" onClick={() => setActiveView('subjects')} className="mt-4 rounded-lg">Open Subjects catalog</Button>
                    </div>
                  )}
                </div>

                {!selectedSubject && displaySubjects.length > 0 && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5 lg:col-span-2">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Start here</p>
                          <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Open one subject and let EduNexus guide the next step</h3>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                            Choose the subject you want to study now. Once you open it, EduNexus will surface the right topic, guide the lesson in small steps, and build toward mastery.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {displaySubjects.slice(0, 2).map((subject) => (
                            <Button
                              key={`quick-start-${subject.id}`}
                              variant="outline"
                              className="rounded-lg border-primary/20 bg-white text-slate-700 hover:bg-primary/10"
                              onClick={() => handleSubjectSelect(subject)}
                            >
                              <BookMarked className="mr-2 h-4 w-4 text-primary" />
                              Open {subject.name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/20 p-3.5 sm:p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">How this works</p>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                        <div className="rounded-lg border border-border bg-background px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">1. Choose</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Pick one subject</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">Start with the subject you want to study right now.</p>
                        </div>
                        <div className="rounded-lg border border-border bg-background px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">2. Focus</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Open one topic</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">EduNexus will guide the lesson in small, manageable steps.</p>
                        </div>
                        <div className="rounded-lg border border-border bg-background px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">3. Check</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Build toward mastery</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">You will get quick checks, feedback, and a mastery quiz when ready.</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-3.5 sm:p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Current learning goal</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Trophy className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{learningGoal.title}</p>
                          <p className="text-xs text-muted-foreground">{learningGoal.note}</p>
                        </div>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${learningGoal.progress}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedSubject && !selectedTopic && (
              <Card className="rounded-lg border-primary/20 bg-primary/5 shadow-none">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Next study move</p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                        {currentUnlockedLesson
                          ? `Continue with ${formatTopicLike(currentUnlockedLesson)}`
                          : `Choose a topic in ${selectedSubject.name}`}
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {currentUnlockedLesson
                          ? `EduNexus found your best open lesson in ${selectedSubject.name}. Start there for the safest progression, then the tutor will take over step by step.`
                          : `Your subject is ready. Pick one topic below and EduNexus will open the lesson with a clear goal, one core idea, and one gentle first check.`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {currentUnlockedLesson ? (
                        <Button
                          className="rounded-lg gap-2"
                          onClick={() => handleTopicSelect(currentUnlockedLesson)}
                        >
                          <Play className="h-4 w-4" />
                          Start this lesson
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        className="rounded-lg gap-2"
                        onClick={() => {
                          const firstVisibleTopic = visibleTopics[0];
                          if (firstVisibleTopic) {
                            void handleTopicSelect(firstVisibleTopic);
                          }
                        }}
                        disabled={!visibleTopics.length}
                      >
                        <ArrowRight className="h-4 w-4" />
                        {visibleTopics.length ? 'Open first available topic' : 'Topics loading'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                        <span className="line-clamp-2 break-words">For {selectedTopicName}</span>
                      </span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-fit shrink-0 text-[10px] uppercase font-bold text-teal-600 border-teal-200">YouTube Resources</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => setShowRecommendedVideos((prev) => !prev)}
                      >
                        {showRecommendedVideos ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!showRecommendedVideos ? (
                    <p className="text-sm text-muted-foreground">
                      Keep this folded until you want an extra explanation, or open it when you want to reinforce the lesson at your own pace.
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {suggestedVideos.map((video) => renderRecommendedVideoCard(video))}
                      </div>
                    </>
                  )}
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
                      {prioritizedTopics.length > 0 && (
                        <div>
                          <h4 className="mb-3 ml-1 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                            <Target className="h-4 w-4 text-primary" />
                            Your path right now
                          </h4>
                          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                            {prioritizedTopics.map((topic: any, idx: number) => {
                              const tp = getTopicProgress(topic.id);
                              const structuredTopic = topicsForCurrentSubject.find((st: any) => st.id === topic.id);
                              const status = String(structuredTopic?.status || '').toLowerCase();
                              const isLocked = status === 'locked';
                              const isCurrent = currentUnlockedLesson && String(currentUnlockedLesson.id) === String(topic.id);
                              const isSelected = selectedTopic?.id === topic.id;
                              const pct = tp?.progress_pct ?? 0;
                              const done = !!tp?.completed_at || status === 'completed';
                              const quickLabel = done
                                ? 'Completed'
                                : isCurrent
                                  ? 'Best next lesson'
                                  : status === 'in_progress'
                                    ? 'In progress'
                                    : status === 'unlocked' || status === 'active'
                                      ? 'Ready now'
                                      : 'Available';
                              return (
                                <Button
                                  key={`priority-topic-${topic.id}-${idx}`}
                                  variant={isSelected ? 'default' : 'outline'}
                                  className={`h-auto min-h-[3.6rem] rounded-lg justify-start px-3 gap-2 flex-col items-stretch ${
                                    isSelected
                                      ? 'bg-primary text-primary-foreground'
                                      : isCurrent
                                        ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
                                        : isLocked
                                          ? 'border-dashed border-amber-200 bg-amber-50/40 text-slate-600 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/10'
                                          : 'hover:bg-muted'
                                  }`}
                                  onClick={() => handleTopicSelect(topic)}
                                >
                                  <div className="flex w-full items-center gap-3">
                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                      isSelected ? 'bg-white/20' : isCurrent ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800'
                                    }`}>
                                      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : isLocked ? <Lock className="h-4 w-4 text-amber-600" /> : isCurrent ? <Play className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                                    </div>
                                    <div className="min-w-0 flex-1 text-left">
                                      <span className="block whitespace-normal text-sm font-semibold">{formatTopicLike(topic)}</span>
                                      <span className={`block text-[10px] font-semibold uppercase tracking-wide ${
                                        isSelected ? 'text-white/80' : isCurrent ? 'text-primary' : 'text-muted-foreground'
                                      }`}>
                                        {quickLabel}
                                      </span>
                                    </div>
                                    {pct > 0 && !done && (
                                      <span className="text-[10px] font-bold tabular-nums text-teal-600 dark:text-teal-400">{pct}%</span>
                                    )}
                                  </div>
                                  {pct > 0 && (
                                    <div className="w-full h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
                                      <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                  )}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {groupedVisibleTopics.map(({ termGroup, topics }) => (
                        <div key={termGroup}>
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 ml-1 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-teal-500" />
                            {termGroup}
                          </h4>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            {topics.map(topic => {
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
                                    <span className="flex-1 text-left whitespace-normal">{formatTopicLike(topic)}</span>
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
                        <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{formatTopicLike(lockedLessonNotice.requestedTopic)}</h3>
                        <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                          {lockedLessonNotice.currentTopic
                            ? `You have not unlocked "${formatTopicLike(lockedLessonNotice.requestedTopic)}" yet. Continue from "${formatTopicLike(lockedLessonNotice.currentTopic)}" first.`
                            : `You have not unlocked "${formatTopicLike(lockedLessonNotice.requestedTopic)}" yet. Complete the previous lesson first.`}
                        </p>
                      </div>
                    </div>
                    {lockedLessonNotice.currentTopic ? (
                      <Button className="bg-teal-600 hover:bg-teal-700 rounded-xl gap-2" onClick={openCurrentUnlockedLesson}>
                        <Play className="w-4 h-4" />
                        Open {formatTopicLike(lockedLessonNotice.currentTopic)}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedTopic && (
              <Card className="animate-in zoom-in-95 rounded-lg border-border bg-card shadow-none duration-500">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-primary/20 bg-primary/10">
                        <img src={`/avatars/ai_tutor_${tutorGender}.png`} alt="AI Tutor" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="rounded-full text-[10px] font-semibold uppercase tracking-wide">
                            Ready to learn
                          </Badge>
                          <Badge variant="secondary" className="rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                            {focusProgressPercent}% topic progress
                          </Badge>
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                          {selectedTopicName}
                        </h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                          Start with a gentle explanation, jump to guided practice, or open a quiz when you want to test what is already stable.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[320px] lg:max-w-[360px]">
                      {focusSignalItems.map((item) => (
                        <div key={item.label} className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button className="rounded-lg gap-2" onClick={() => openTutorFromSelection(selectedTopic, setShowAIPanel, handleAIContinue, aiChatMessages)}>
                      <Sparkles className="w-4 h-4" /> Start tutoring
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-lg gap-2"
                      onClick={() => startQuiz(selectedTopic, selectedSubject)}
                    >
                      <FileText className="w-4 h-4" /> Start mastery check
                    </Button>
                    <Button variant="outline" className="rounded-lg gap-2" onClick={() => handleAIContinue(`Give me a summary of ${selectedTopicName}`)}>
                      <Repeat className="w-4 h-4" /> Get summary
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {shouldShowSupportRail && (
          <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <Card className="rounded-lg border-border bg-card shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Focus Support
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Suggested topics
                  </p>
                  <div className="space-y-2">
                    {actionableSuggestedTopics.length > 0 ? actionableSuggestedTopics.map((topic, idx) => (
                      <Button
                        key={idx}
                        variant="ghost"
                        className="w-full justify-start rounded-lg text-sm hover:bg-muted/60 group"
                        onClick={() => {
                          const subject = subjects.find(s => s.id === topic.subject_id) || selectedSubject;
                          if (subject) {
                            handleSubjectSelect(subject);
                            if (typeof topic !== 'string') handleTopicSelect(topic);
                          }
                        }}
                      >
                        <div className="w-2 h-2 rounded-full bg-primary/70 mr-3 group-hover:scale-150 transition-transform" />
                        <span className="truncate">{formatTopicLike(topic)}</span>
                      </Button>
                    )) : (
                      <p className="text-xs text-muted-foreground leading-5">
                        {hasLearningSignals
                          ? 'No extra topic suggestions right now.'
                          : 'Complete a lesson or mastery quiz to generate suggestions.'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Areas to strengthen
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {actionableWeaknessAreas.length > 0 ? actionableWeaknessAreas.map((area, idx) => (
                      <Badge key={idx} variant="destructive" className="rounded-lg px-2.5 py-1">{area}</Badge>
                    )) : (
                      <p className="text-xs text-muted-foreground leading-5">
                        {hasLearningSignals
                          ? 'No specific weaknesses identified from your recent activity.'
                          : 'Complete a lesson or quiz so EduNexus can identify improvement areas.'}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-border bg-card shadow-none">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shadow-none">
                    <Trophy className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-primary font-bold uppercase tracking-wider">Learning Goal</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{learningGoal.title}</p>
                  </div>
                </div>
                <div className="mt-4 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${learningGoal.progress}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 text-right">{learningGoal.note}</p>
              </CardContent>
            </Card>
          </div>
          )}
        </div>
      )}
    </div>
  );
};
