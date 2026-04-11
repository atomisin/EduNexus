import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { aiAPI, subjectsAPI, studentAPI, progressAPI } from '@/services/api';
import type { Subject } from '../types';
import { getPersonaName, getPersonaEmoji } from '../utils/personaUtils';

export interface Message {
  role: 'user' | 'ai';
  content: string;
}

const getChatStorageKey = (subjectId?: string, topicId?: string, topicName?: string, subtopicName?: string) => {
  return `edunexus_chat_${subjectId || 'default'}::${topicId || topicName || 'general'}::${topicName || 'general'}::${subtopicName || 'intro'}`;
};

// State Machine Types for AI Tutoring Flow
export type AIState = 
  | { status: 'idle' }
  | { status: 'chatting' }
  | { status: 'quiz_confirm' }
  | { status: 'quiz_active'; masteryMetadata?: { topic: any, subject: any }; result?: any }
  | { status: 'quiz_completed'; result?: any };

export const useAITutor = (profile?: any, getFullName?: () => string) => {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const [aiState, setAiState] = useState<AIState>({ status: 'idle' });
  const isChattingRef = useRef<boolean>(false);
  const [currentTopic, setCurrentTopic] = useState<any>(null);
  const [currentSubject, setCurrentSubject] = useState<Subject | null>(null);

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

  const fetchVideoSuggestions = useCallback(async (topic: string) => {
    console.log('[VIDEO] Fetching videos for topic:', topic);
    try {
      const result = await studentAPI.getSuggestedVideos({
        topic,
        subject: currentSubject?.name,
        educationLevel: profile?.education_level
      });
      console.log('[VIDEO] API response:', result);
      if (result.videos?.length > 0) {
        console.log('[VIDEO] Setting', result.videos.length, 'videos');
        setSuggestedVideos(result.videos);
      } else {
        console.log('[VIDEO] No videos returned');
      }
    } catch (e) {
      console.error('Video fetch failed:', e);
    }
  }, [currentSubject, profile]);

  const handleSubjectSelect = useCallback(async (subject: Subject) => {
    setCurrentSubject(subject);
    setCurrentTopic(null);
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
      const safeHistory = msgsForPayload.filter(m => m !== userMessage).map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }));

      const response = await aiAPI.chat(
        [...safeHistory, { role: 'user', content }],
        'teaching',
        undefined,
        0.6,
        currentSubject?.name || undefined,
        currentTopic?.name || undefined
      );

      const aiContent = response.response || '';
      // Detect UI markers
      const hasNext = aiContent.includes('---NEXT---');
      const hasQuestion = aiContent.includes('---QUESTION---');
      const hasCTA = aiContent.includes('---CTA---');
      const cleanContent = aiContent.replace('---NEXT---', '').replace('---QUESTION---', '').replace('---CTA---', '').trim();

      if (cleanContent.includes('[TRIGGER_MASTERY]')) {
        setAiState({ status: 'quiz_confirm' });
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
        fetchVideoSuggestions(currentTopic?.name || content);
      }
    } catch (err) {
      setMessagesAndRef(prev => [...prev, { role: 'ai', content: "Error communicating with AI." }]);
      setAiState({ status: 'idle' });
      isChattingRef.current = false;
    }
  }, [currentTopic, currentSubject, activeSubtopic, fetchVideoSuggestions, setMessagesAndRef]);

  const clearMessages = useCallback(() => {
    setMessagesAndRef([]);
    messagesRef.current = [];
    const storageKey = getChatStorageKey(currentSubject?.id, currentTopic?.id, currentTopic?.name);
    localStorage.removeItem(storageKey);
  }, [currentSubject?.id, currentTopic?.id, currentTopic?.name, setMessagesAndRef]);

  const handleSubtopicClick = useCallback(async (subtopic: any) => {
    setViewingSubtopic(subtopic);
    setActiveSubtopic(subtopic.name);
    setShowAIPanel(true);
    setMessagesAndRef([]);

    const topicLabel = subtopic?.name || subtopic?.title || '';
    if (topicLabel) {
      fetchVideoSuggestions(topicLabel);
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
    queryClient.invalidateQueries({ queryKey: ['student', 'brain-power'] });
  }, [queryClient]);

  const startQuiz = useCallback((topic?: any, subject?: any) => {
    setAiState({ 
      status: 'quiz_active',
      masteryMetadata: topic ? { topic, subject: subject || currentSubject } : undefined
    });
  }, [currentSubject]);

  const dismissQuizConfirm = useCallback(() => {
    setAiState({ status: 'chatting' });
  }, []);

  const handleTopicSelect = useCallback(async (topic: any, subject?: Subject) => {
    const activeSubject = subject || currentSubject;
    if (!activeSubject) return;
    
    // Clear previous state immediately
    clearMessages();
    setCurrentTopic(topic);
    setCurrentSubject(activeSubject);

    // Fetch video recommendations for the dashboard when a topic is selected
    fetchVideoSuggestions(topic.name);
  }, [currentSubject, clearMessages, fetchVideoSuggestions]);

  return {
    messages,
    aiState,
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
    dismissQuizConfirm
  };
};
