import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { aiAPI, subjectsAPI, studentAPI, progressAPI } from '@/services/api';
import type { Subject } from '../types';

export interface Message {
  role: 'user' | 'ai';
  content: string;
}

type LessonStage = 'intro' | 'teach' | 'check_understanding' | 'practice' | 'remediate' | 'mastery_ready' | 'mastery_quiz' | 'completed';

interface LessonControllerState {
  stage: LessonStage;
  nextActions: string[];
  masteryReady: boolean;
  lastUiAction?: string | null;
}

const cleanTutorResponse = (content: string) => {
  return content
    .replace(/---NEXT---/g, '')
    .replace(/---QUESTION---/g, '')
    .replace(/---CTA---/g, '')
    .replace(/---VIDEO---/g, '')
    .replace(/\[TRIGGER_MASTERY\]/g, '')
    .trim();
};

const getChatStorageKey = (subjectId?: string, topicId?: string, topicName?: string, subtopicName?: string) => {
  return `edunexus_chat_${subjectId || 'default'}::${topicId || topicName || 'general'}::${topicName || 'general'}::${subtopicName || 'intro'}`;
};

// State Machine Types for AI Tutoring Flow
export type AIState = 
  | { status: 'idle' }
  | { status: 'chatting' }
  | { status: 'quiz_active'; masteryMetadata?: { topic: any, subject: any }; result?: any }
  | { status: 'quiz_completed'; result?: any };

export type PlacementState =
  | { status: 'idle' }
  | { status: 'loading'; targetTopic: any }
  | { status: 'active'; targetTopic: any; target_topic: any; prerequisite_topics: any[]; questions: any[]; message?: string }
  | { status: 'result'; targetTopic: any; target_topic: any; prerequisite_topics: any[]; questions: any[]; result: any }
  | { status: 'error'; targetTopic?: any; message: string };

type LockedLessonNotice = {
  requestedTopic: any;
  currentTopic: any;
  message: string;
} | null;

export const useAITutor = (profile?: any, getFullName?: () => string) => {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const videoRequestSeq = useRef(0);
  const [aiState, setAiState] = useState<AIState>({ status: 'idle' });
  const isChattingRef = useRef<boolean>(false);
  const [currentTopic, setCurrentTopic] = useState<any>(null);
  const [currentSubject, setCurrentSubject] = useState<Subject | null>(null);
  const [lessonController, setLessonController] = useState<LessonControllerState>({
    stage: 'intro',
    nextActions: ['teach_step_by_step', 'give_example', 'check_understanding'],
    masteryReady: false,
    lastUiAction: null,
  });
  const [placementState, setPlacementState] = useState<PlacementState>({ status: 'idle' });
  const [lockedLessonNotice, setLockedLessonNotice] = useState<LockedLessonNotice>(null);

  const setMessagesAndRef = useCallback((
    updater: Message[] | ((prev: Message[]) => Message[])
  ) => {
    setMessages(prev => {
      const next = typeof updater === 'function'
        ? updater(prev)
        : updater;
      messagesRef.current = next;
      return next;
    });
  }, []);

  
  // Topics Query
  const { 
    data: topics = [], 
    isLoading: isTopicsLoading 
  } = useQuery({
    queryKey: ['student', 'topics', currentSubject?.id],
    queryFn: () => subjectsAPI.getTopics(currentSubject!.id).then(data => data.topics || data || []),
    enabled: !!currentSubject?.id,
  });

  // Roadmap Query
  const { 
    data: roadmap = null, 
    isLoading: roadmapLoading 
  } = useQuery({
    queryKey: ['student', 'roadmap', currentSubject?.id, currentTopic?.id || currentTopic?.name],
    queryFn: async () => {
      try {
        return await aiAPI.getTopicBreakdown(currentTopic.id || currentTopic.name, currentSubject!.id);
      } catch (err) {
        console.error('[Roadmap Query] failed:', err);
        return null;
      }
    },
    enabled: !!currentSubject?.id && (!!currentTopic?.id || !!currentTopic?.name),
  });
  
  // Tasks 2A & 3A: Structured Progress Query
  const { 
    data: structuredTopics = [], 
    isLoading: isStructuredLoading,
    refetch: refetchStructured
  } = useQuery({
    queryKey: ['topic-progress', currentSubject?.id],
    queryFn: () => progressAPI.getTopicProgress(currentSubject!.id).then(d => d.topics || []),
    enabled: !!currentSubject?.id,
    staleTime: 0, // Always refetch when subject changes
  });

  const [showAIPanel, setShowAIPanel] = useState(false);
  const [viewingSubtopic, setViewingSubtopic] = useState<any>(null);
  const [activeSubtopic, setActiveSubtopic] = useState<any>(null);
  const [suggestedVideos, setSuggestedVideos] = useState<any[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [weaknessAreas, setWeaknessAreas] = useState<string[]>([]);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  // New UI marker states for interactive tutoring
  const [showNextButton, setShowNextButton] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [showCTA, setShowCTA] = useState(false);

  // Load chat from BACKEND (source of truth) when topic/subject changes
  useEffect(() => {
    if (!currentSubject?.id || !currentTopic?.name) {
      return;
    }

    const loadChatHistory = async () => {
      try {
        const history = await aiAPI.getChatHistory({
          subject_id: currentSubject.id,
          topic_id: currentTopic?.id,
          topic_name: currentTopic.name,
          subtopic_name: activeSubtopic
        });
        
        if (history?.messages?.length > 0) {
          const msgs = history.messages.map((m: any) => ({
            role: m.role === 'assistant' || m.role === 'ai' ? 'ai' : 'user',
            content: m.content
          }));
          setMessagesAndRef(msgs);
          // Update localStorage cache for offline fallback
          const storageKey = getChatStorageKey(currentSubject.id, currentTopic.id, currentTopic.name, activeSubtopic);
          localStorage.setItem(storageKey, JSON.stringify(msgs));
        } else {
          // No backend history - check localStorage cache
          const storageKey = getChatStorageKey(currentSubject.id, currentTopic.id, currentTopic.name, activeSubtopic);
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setMessagesAndRef(parsed);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load chat history from backend:', e);
        // Fallback to localStorage on error
        const storageKey = getChatStorageKey(currentSubject?.id, currentTopic?.id, currentTopic?.name, activeSubtopic);
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) setMessagesAndRef(parsed);
          } catch {}
        }
      }
    };

    loadChatHistory();
  }, [currentSubject?.id, currentTopic?.id, currentTopic?.name, activeSubtopic]);

  // Save chat to BACKEND (source of truth) AND localStorage cache when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    if (!currentSubject?.id) return;

    const storageKey = getChatStorageKey(currentSubject.id, currentTopic?.id, currentTopic?.name, activeSubtopic);
    localStorage.setItem(storageKey, JSON.stringify(messages));

    // Save to backend - fire and forget for performance
    aiAPI.saveChatHistory({
      subject_id: currentSubject.id,
      topic_id: currentTopic?.id,
      topic_name: currentTopic?.name || 'general',
      subtopic_name: activeSubtopic || 'intro',
      messages: messages.map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content
      }))
    }).catch(e => console.error('Failed to save chat to backend:', e));
  }, [messages, currentSubject?.id, currentTopic?.id, currentTopic?.name, activeSubtopic]);

  const fetchVideoSuggestions = useCallback(async (topic: string, subjectOverride?: Subject | null) => {
    const topicLabel = topic?.trim();
    if (!topicLabel) {
      setSuggestedVideos([]);
      setSelectedVideo(null);
      return;
    }

    const requestId = videoRequestSeq.current + 1;
    videoRequestSeq.current = requestId;
    setSuggestedVideos([]);
    setSelectedVideo(null);

    try {
      const subjectForRequest = subjectOverride || currentSubject;
      const result = await studentAPI.getSuggestedVideos({
        topic: topicLabel,
        subject: subjectForRequest?.name,
        educationLevel: profile?.education_level,
        limit: 6,
      });

      if (requestId !== videoRequestSeq.current) {
        return;
      }
      setSuggestedVideos(Array.isArray(result?.videos) ? result.videos : []);
    } catch (e) {
      if (requestId !== videoRequestSeq.current) {
        return;
      }
      setSuggestedVideos([]);
      console.error('Video fetch failed:', e);
    }
  }, [currentSubject, profile]);

  const handleSubjectSelect = useCallback(async (subject: Subject) => {
    setCurrentSubject(subject);
    setCurrentTopic(null);
    setSuggestedVideos([]);
    setSelectedVideo(null);
    queryClient.invalidateQueries({
      queryKey: ['topic-progress']
    });
  }, [queryClient]);



  const sendMessage = useCallback(async (content: string) => {
    if (isChattingRef.current) return;
    isChattingRef.current = true;

    const userMessage: Message = { role: 'user', content };
    setMessagesAndRef(prev => [...prev, userMessage]);
    setAiState({ status: 'chatting' });

    try {
      // Capture current history before sending to avoid duplicate user message
      const msgsForPayload = messagesRef.current;
      const safeHistory = msgsForPayload.filter(m => m !== userMessage).slice(-10).map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }));
      const topicContext = [
        currentTopic?.name,
        activeSubtopic ? `focus area: ${activeSubtopic}` : null,
      ].filter(Boolean).join(' - ');
      const userTurnCount = [...safeHistory, { role: 'user', content }].filter(m => m.role === 'user').length;
      const lessonContext = {
        lesson_stage: lessonController.stage,
        user_turn_count: userTurnCount,
        assistant_turn_count: safeHistory.filter(m => m.role === 'assistant').length,
        active_subtopic: activeSubtopic || null,
        topic_id: currentTopic?.id || null,
        subject_id: currentSubject?.id || null,
      };

      const response = await aiAPI.chat(
        [...safeHistory, { role: 'user', content }],
        'teaching',
        undefined,
        0.6,
        currentSubject?.name || undefined,
        topicContext || undefined,
        lessonContext
      );

      const aiContent = response.response || '';
      // Detect UI markers
      const hasNext = aiContent.includes('---NEXT---');
      const hasQuestion = aiContent.includes('---QUESTION---');
      const hasCTA = aiContent.includes('---CTA---');
      const shouldStartMasteryQuiz = response.ui_action === 'start_mastery_quiz' || response.should_start_mastery_quiz === true || aiContent.includes('[TRIGGER_MASTERY]');
      const cleanContent = cleanTutorResponse(aiContent);
      const nextLessonStage: LessonStage = shouldStartMasteryQuiz
        ? 'mastery_quiz'
        : (response.lesson_stage || lessonController.stage || 'teach');

      setLessonController({
        stage: nextLessonStage,
        nextActions: Array.isArray(response.next_actions) && response.next_actions.length > 0
          ? response.next_actions
          : ['teach_step_by_step', 'give_example', 'check_understanding'],
        masteryReady: Boolean(response.mastery_ready || shouldStartMasteryQuiz),
        lastUiAction: response.ui_action || null,
      });

      if (shouldStartMasteryQuiz) {
        setAiState({
          status: 'quiz_active',
          masteryMetadata: currentTopic ? { topic: currentTopic, subject: currentSubject } : undefined
        });
      } else {
        setAiState({ status: 'idle' });
      }
      isChattingRef.current = false;

      setMessagesAndRef(prev => [...prev, { role: 'ai' as const, content: cleanContent }]);

      // Update marker states for UI
      setShowNextButton(hasNext);
      setCurrentQuestion(hasQuestion ? cleanContent.split('\n')[0] : null);
      setShowCTA(hasCTA);

      // Video suggestions detection
      if (cleanContent.toLowerCase().includes('video') || cleanContent.toLowerCase().includes('watch')) {
        fetchVideoSuggestions(currentTopic?.name || content, currentSubject);
      }
    } catch (err: any) {
      console.error('[AI Tutor] chat request failed:', err);
      setMessagesAndRef(prev => [...prev, {
        role: 'ai',
        content: err?.message?.includes('taking too long')
          ? "The AI tutor is taking longer than usual to respond. Please try again in a moment."
          : "I couldn't complete that response. Please try your last question again."
      }]);
      setAiState({ status: 'idle' });
      isChattingRef.current = false;
    }
  }, [currentTopic, currentSubject, activeSubtopic, lessonController.stage, fetchVideoSuggestions, setMessagesAndRef]);

  const clearMessages = useCallback(() => {
    setMessagesAndRef([]);
    messagesRef.current = [];
    setLessonController({
      stage: 'intro',
      nextActions: ['teach_step_by_step', 'give_example', 'check_understanding'],
      masteryReady: false,
      lastUiAction: null,
    });
    const storageKey = getChatStorageKey(currentSubject?.id, currentTopic?.id, currentTopic?.name);
    localStorage.removeItem(storageKey);
  }, [currentSubject?.id, currentTopic?.id, currentTopic?.name, setMessagesAndRef]);

  const handleSubtopicClick = useCallback(async (subtopic: any) => {
    setViewingSubtopic(subtopic);
    setActiveSubtopic(subtopic.name);
    setShowAIPanel(true);
    setMessagesAndRef([]);
    setLessonController({
      stage: 'intro',
      nextActions: ['teach_step_by_step', 'give_example', 'check_understanding'],
      masteryReady: false,
      lastUiAction: null,
    });

    const topicLabel = subtopic?.name || subtopic?.title || '';
    if (topicLabel) {
      fetchVideoSuggestions(topicLabel, currentSubject);
    }

    if (currentSubject?.id && (currentTopic?.id || currentTopic?.name)) {
      try {
        const history = await aiAPI.getChatHistory({
          subject_id: currentSubject.id,
          topic_id: currentTopic?.id,
          topic_name: currentTopic.name,
          subtopic_name: subtopic.name
        });
        if (history && history.messages && history.messages.length > 0) {
          setMessagesAndRef(history.messages.map((m: any) => ({
             role: m.role === 'assistant' || m.role === 'ai' ? 'ai' : m.role,
             content: m.content
          })));
        } else {
          // Fallback to localStorage
          const storageKey = getChatStorageKey(currentSubject.id, currentTopic?.id, currentTopic.name, subtopic.name);
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setMessagesAndRef(parsed);
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.error("Failed to load chat history", e);
      }
    }
  }, [currentSubject, currentTopic, fetchVideoSuggestions]);

  const handleAIContinue = useCallback(async (content: string) => {
    await sendMessage(content);
  }, [sendMessage]);

  const onMasteryTestComplete = useCallback(async (result: any) => {
    setAiState({ status: 'quiz_completed', result });
    setLessonController(prev => ({
      ...prev,
      stage: result?.passed ? 'completed' : 'remediate',
      masteryReady: false,
      nextActions: result?.passed ? ['next_topic', 'summary'] : ['review_missed', 'try_practice', 'simplify'],
    }));
    if (result?.passed) {
      await refetchStructured();
      if (currentSubject?.id) {
        queryClient.invalidateQueries({ queryKey: ['topic-progress', currentSubject.id] });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['student', 'brain-power'] });
  }, [currentSubject?.id, queryClient, refetchStructured]);

  const startQuiz = useCallback((topic?: any, subject?: any) => {
    setAiState({ 
      status: 'quiz_active',
      masteryMetadata: topic ? { topic, subject: subject || currentSubject } : undefined
    });
    setLessonController(prev => ({ ...prev, stage: 'mastery_quiz', masteryReady: true, lastUiAction: 'start_mastery_quiz' }));
  }, [currentSubject]);

  const dismissQuizConfirm = useCallback(() => {
    setAiState({ status: 'idle' });
    setLessonController(prev => ({ ...prev, stage: 'remediate', masteryReady: false, nextActions: ['review_missed', 'try_practice', 'simplify'] }));
  }, []);

  const findCurrentUnlockedLesson = useCallback(() => {
    if (!structuredTopics.length) return null;
    return (
      structuredTopics.find((topic: any) => topic.status === 'in_progress') ||
      structuredTopics.find((topic: any) => topic.status === 'unlocked') ||
      structuredTopics.find((topic: any) => topic.status === 'active') ||
      structuredTopics.find((topic: any) => topic.status !== 'locked' && topic.status !== 'completed') ||
      structuredTopics.find((topic: any) => topic.status !== 'locked') ||
      structuredTopics[0]
    );
  }, [structuredTopics]);

  const handleTopicSelect = useCallback(async (topic: any, subject?: Subject) => {
    const activeSubject = subject || currentSubject;
    if (!activeSubject) return;
    if (!topic) return;

    const structuredTopic = structuredTopics.find((item: any) => item.id === topic.id);
    const resolvedTopic = structuredTopic ? { ...topic, ...structuredTopic } : topic;
    if (resolvedTopic.status === 'locked') {
      const currentLesson = findCurrentUnlockedLesson();
      setShowAIPanel(false);
      setLockedLessonNotice({
        requestedTopic: resolvedTopic,
        currentTopic: currentLesson,
        message: currentLesson
          ? `You have not unlocked "${resolvedTopic.name}" yet. Continue from "${currentLesson.name}" first.`
          : `You have not unlocked "${resolvedTopic.name}" yet. Complete the previous lesson first.`,
      });
      setMessagesAndRef([]);
      return;
    }
    
    // Clear previous state immediately
    clearMessages();
    setLockedLessonNotice(null);
    setCurrentTopic(resolvedTopic);
    setCurrentSubject(activeSubject);
    setLessonController({
      stage: 'intro',
      nextActions: ['teach_step_by_step', 'give_example', 'check_understanding'],
      masteryReady: false,
      lastUiAction: null,
    });

    // Fetch video recommendations for the dashboard when a topic is selected
    fetchVideoSuggestions(resolvedTopic.name, activeSubject);
  }, [currentSubject, structuredTopics, findCurrentUnlockedLesson, setMessagesAndRef, clearMessages, fetchVideoSuggestions]);

  const openCurrentUnlockedLesson = useCallback(async () => {
    const topicToOpen = lockedLessonNotice?.currentTopic || findCurrentUnlockedLesson();
    if (topicToOpen) {
      setLockedLessonNotice(null);
      await handleTopicSelect(topicToOpen, currentSubject || undefined);
    }
  }, [currentSubject, findCurrentUnlockedLesson, handleTopicSelect, lockedLessonNotice]);

  const startPlacementCheck = useCallback(async (targetTopic: any) => {
    if (!currentSubject?.id || !targetTopic?.id) return;

    setPlacementState({ status: 'loading', targetTopic });
    try {
      const result = await progressAPI.startPlacementCheck({
        subject_id: currentSubject.id,
        target_topic_id: targetTopic.id,
      });

      const questions = Array.isArray(result?.questions) ? result.questions : [];
      if (questions.length === 0) {
        await progressAPI.acceptPlacementRecommendation({
          subject_id: currentSubject.id,
          target_topic_id: targetTopic.id,
          placement_token: result.placement_token,
        });
        await refetchStructured();
        await handleTopicSelect(targetTopic, currentSubject);
        setShowAIPanel(true);
        setPlacementState({ status: 'idle' });
        return;
      }

      setPlacementState({
        status: 'active',
        targetTopic,
        target_topic: result.target_topic,
        prerequisite_topics: result.prerequisite_topics || [],
        questions,
        message: result.message,
      });
    } catch (err: any) {
      setPlacementState({
        status: 'error',
        targetTopic,
        message: err?.message || 'Unable to start the placement check.',
      });
    }
  }, [currentSubject, handleTopicSelect, refetchStructured]);

  const submitPlacementCheck = useCallback(async (answersByQuestionId: Record<string, string>) => {
    if (placementState.status !== 'active' || !currentSubject?.id) return;

    const answers = placementState.questions.map((question: any) => ({
      question_id: question.id,
      topic_id: question.topic_id,
      topic_name: question.topic_name,
      selected_option: answersByQuestionId[question.id],
    }));

    try {
      const result = await progressAPI.submitPlacementCheck({
        subject_id: currentSubject.id,
        target_topic_id: placementState.target_topic?.id || placementState.targetTopic?.id,
        answers,
      });

      setPlacementState({
        status: 'result',
        targetTopic: placementState.targetTopic,
        target_topic: placementState.target_topic,
        prerequisite_topics: placementState.prerequisite_topics,
        questions: placementState.questions,
        result,
      });
    } catch (err: any) {
      setPlacementState({
        status: 'error',
        targetTopic: placementState.targetTopic,
        message: err?.message || 'Unable to score the placement check.',
      });
    }
  }, [currentSubject?.id, placementState]);

  const acceptPlacementRecommendation = useCallback(async () => {
    if (placementState.status !== 'result' || !currentSubject?.id) return;

    const recommendedTopicId = placementState.result?.recommended_topic?.id;
    const placementToken = placementState.result?.placement_token;
    if (!recommendedTopicId || !placementToken) return;

    try {
      const accepted = await progressAPI.acceptPlacementRecommendation({
        subject_id: currentSubject.id,
        target_topic_id: placementState.target_topic?.id || placementState.targetTopic?.id,
        placement_token: placementToken,
      });

      await refetchStructured();
      queryClient.invalidateQueries({ queryKey: ['topic-progress', currentSubject.id] });

      const recommendedTopic =
        structuredTopics.find((topic: any) => topic.id === recommendedTopicId) ||
        accepted?.recommended_topic ||
        placementState.result.recommended_topic;

      await handleTopicSelect(recommendedTopic, currentSubject);
      setShowAIPanel(true);
      setPlacementState({ status: 'idle' });
    } catch (err: any) {
      setPlacementState({
        status: 'error',
        targetTopic: placementState.targetTopic,
        message: err?.message || 'Unable to unlock the recommended lesson.',
      });
    }
  }, [currentSubject, handleTopicSelect, placementState, queryClient, refetchStructured, structuredTopics]);

  const cancelPlacementCheck = useCallback(() => {
    setPlacementState({ status: 'idle' });
  }, []);

  return {
    messages,
    aiState,
    lessonController,
    placementState,
    lockedLessonNotice,
    currentTopic,
    setCurrentTopic,
    currentSubject,
    setCurrentSubject,
    sendMessage,
    clearMessages,
    topics,
    roadmap,
    roadmapLoading,
    structuredTopics,
    isStructuredLoading,
    refetchStructured,
    showAIPanel,
    setShowAIPanel,
    viewingSubtopic,
    setViewingSubtopic,
    activeSubtopic,
    suggestedVideos,
    selectedVideo,
    setSelectedVideo,
    weaknessAreas,
    suggestedTopics,
    handleSubjectSelect,
    handleTopicSelect,
    handleSubtopicClick,
    handleAIContinue,
    onMasteryTestComplete,
    startQuiz,
    dismissQuizConfirm,
    startPlacementCheck,
    submitPlacementCheck,
    acceptPlacementRecommendation,
    cancelPlacementCheck,
    openCurrentUnlockedLesson
  };
};
