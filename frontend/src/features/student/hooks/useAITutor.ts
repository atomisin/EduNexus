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

export interface VideoSupportState {
  trigger: 'prefetch' | 'manual_request' | 'repair_support' | 'brain_power_exhausted' | 'revision_support';
  topic: string;
  reason: string;
  autoOpen: boolean;
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

const cleanTopicLabel = (value?: string) => {
  const text = (value || '').trim();
  if (!text) return '';
  return text
    .replace(/[–—]/g, '-')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*-/g, ' - ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\(([^)]*)\)/g, (_, inner: string) => {
      const cleaned = inner.replace(/(?<=\w)\.\s+(?=\w)/g, ', ').replace(/\s+/g, ' ').trim();
      return `(${cleaned})`;
    })
    .replace(/\s+/g, ' ')
    .replace(/[.:-]+$/g, '')
    .trim();
};

const isNonInstructionalTopicFragment = (value?: string) => {
  const text = (value || '').replace(/\s+/g, ' ').trim().replace(/[.:-]+$/g, '').toLowerCase();
  if (!text) return true;
  return (
    /^week\s*:?\s*\d+\b/i.test(text) ||
    /^term\s*:?\s*\d+\b/i.test(text) ||
    /^class\s*:?\s*/i.test(text) ||
    /^subject\s*:?\s*/i.test(text) ||
    /^topic\s*:?\s*/i.test(text) ||
    /\buse the topic description\b/i.test(text) ||
    /\blearning outcomes?\b/i.test(text) ||
    /\blesson boundary\b/i.test(text) ||
    /\bstay within\b/i.test(text) ||
    /\bdo not move into\b/i.test(text) ||
    /\bnext listed lesson\b/i.test(text) ||
    /\bplatform unlocks\b/i.test(text) ||
    /\bset the lesson goal\b/i.test(text) ||
    /\bactivate relevant prior knowledge\b/i.test(text) ||
    /\bask one entry check\b/i.test(text) ||
    /\bteach the current lesson step\b/i.test(text) ||
    /\bwithout drifting\b/i.test(text)
  );
};

const instructionalTopicLabel = (subjectName?: string, topicName?: string) => {
  let label = cleanTopicLabel(topicName || subjectName || 'this topic');
  if (!label) return 'this topic';

  const slashSegments = label.split('/').map(segment => segment.replace(/[.:-]+$/g, '').trim()).filter(Boolean);
  if (slashSegments.length > 1) {
    const learningSlashSegments = slashSegments.filter(
      segment => !/\b(?:student|students|readiness|assessment|test|diagnostic|pretest|pre-test|posttest|post-test|quiz|screening|focus area)\b/i.test(segment)
    );
    label = (learningSlashSegments.length > 0 ? learningSlashSegments : slashSegments).slice(-1)[0] || label;
  }

  const segments = label.split(/\s+-\s+/).map(segment => segment.replace(/[.:-]+$/g, '').trim()).filter(Boolean);
  if (segments.length > 1) {
    const learningSegments = segments.filter(
      segment => !/\b(?:student|students|readiness|assessment|test|diagnostic|pretest|pre-test|posttest|post-test|quiz|screening)\b/i.test(segment)
    );
    const selectedSegments = learningSegments.length > 0 ? learningSegments : segments;
    label = selectedSegments[selectedSegments.length - 1] || label;
  }

  return label
    .replace(/^focus area:\s*/i, '')
    .replace(/^(?:introduction to|introductory|meaning of|concept of|basics of|overview of)\s+/i, '')
    .replace(/[.\s:-]+$/g, '')
    .trim() || 'this topic';
};

const canonicalTopicName = (subjectName?: string, topicName?: string) => {
  const clean = instructionalTopicLabel(subjectName, topicName);
  return clean === 'this topic' ? '' : clean;
};

const topicFocusLabel = (subjectName?: string, topicName?: string) => {
  let label = instructionalTopicLabel(subjectName, topicName);
  const parenMatch = label.match(/\(([^)]*)\)/);
  if (parenMatch?.index != null) {
    const base = label.slice(0, parenMatch.index).replace(/[.:-]+$/g, '').trim();
    const contextMatch = parenMatch[1].trim().match(/\b(using|with|from|for)\s+(.+)$/i);
    if (contextMatch) {
      label = `${base} ${contextMatch[1].toLowerCase()} ${contextMatch[2].trim()}`.trim();
    } else if (base) {
      label = base;
    }
  } else if (/\brelated to\b/i.test(label)) {
    label = label;
  } else if (/,|;|\/|\\|\band\b/i.test(label)) {
    const qualifierMatch = label.replace(/[.\s:)-]+$/g, '').match(/\b(using|with|from|for)\s+(.+)$/i);
    if (qualifierMatch) {
      label = `the listed ideas ${qualifierMatch[1].toLowerCase()} ${qualifierMatch[2].replace(/[.\s:)-]+$/g, '').trim()}`;
    } else if (label.split(/\s+/).length <= 5) {
      label = label;
    } else {
      label = 'the listed ideas in this lesson';
    }
  }
  return label || 'this topic';
};

const extractFiniteTopicTerms = (topicName?: string) => {
  if (!topicName) return [];
  let source = instructionalTopicLabel(undefined, topicName);
  source = source.replace(/(?<=\w)\.\s+(?=\w)/g, ', ').replace(/[.\s:-]+$/g, '').trim();
  const relatedMatch = source.match(/^(.+?)\s+related to\s+(.+)$/i);
  if (relatedMatch?.[1] && relatedMatch?.[2]) {
    source = `${relatedMatch[1]}, ${relatedMatch[2]}`;
  }
  const parenMatch = source.match(/\(([^)]*(?:,|;|\band\b)[^)]*)\)/i);
  if (parenMatch?.[1]) {
    source = parenMatch[1];
  } else if (source.includes(':')) {
    source = source.split(':').slice(1).join(':');
  } else {
    const match = source.match(/\b(?:using|including|such as)\b/i);
    if (match?.index != null) {
      source = source.slice(match.index + match[0].length);
    }
  }

  const seen = new Set<string>();
  const terms = source
    .split(/,|;|\/|\\|\band\b/i)
    .map(part => part
      .replace(/\([^)]*\)/g, '')
      .replace(/^\s*(?:and|or|including|such as)\s+/i, '')
      .replace(/^\s*(?:the|a|an)\s+/i, '')
      .replace(/\s+(?:using|with|from|for)\s+.+$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.\]:)-]+$/g, '')
    )
    .filter(part => part && part.length <= 60 && part.split(/\s+/).length <= 4 && !isNonInstructionalTopicFragment(part))
    .filter(part => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return terms.length >= 2 ? terms : [];
};

const fallbackKeyLine = (term: string, focusLabel: string, index = 0) => {
  const relatedMatch = focusLabel.match(/^(.+?)\s+related to\s+(.+)$/i);
  if (relatedMatch) {
    const rightContext = relatedMatch[2].trim();
    const lowerTerm = term.toLowerCase();
    if (lowerTerm === 'vocabulary') {
      return `- **${term}:** the words and meanings used for this topic.`;
    }
    if (lowerTerm === 'functions') {
      return `- **${term}:** what a part, system, or idea does.`;
    }
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(rightContext)) {
      return `- **${term}:** the topic area the words will describe.`;
    }
    if (index === 0) {
      return `- **${term}:** the first feature to notice in the lesson words.`;
    }
  }
  return `- **${term}:** a key idea we will define and use in this step.`;
};

const buildSafeTutorFallback = (subjectName?: string, topicName?: string, latestUserText?: string) => {
  const focusLabel = topicFocusLabel(subjectName, topicName);
  const topicLabel = focusLabel;
  const finiteTerms = extractFiniteTopicTerms(topicName);
  const focusIsPlural = focusLabel.toLowerCase().startsWith('the listed ideas') || focusLabel.toLowerCase().startsWith('these ');
  const wantsEasyExample = /\b(?:easy|simple|small)\s+example\b/i.test(latestUserText || '')
    || /\bstart with\b/i.test(latestUserText || '');
  const wantsGuidedIntro = wantsEasyExample
    || /\binteractively\b/i.test(latestUserText || '')
    || /\bexplain one idea\b/i.test(latestUserText || '')
    || /\bone check question\b/i.test(latestUserText || '');

  if (wantsGuidedIntro) {
    const keyLines = finiteTerms.slice(0, 4).map(
      (term, index) => fallbackKeyLine(term, focusLabel, index)
    );
    const relatedMatch = focusLabel.match(/^(.+?)\s+related to\s+(.+)$/i);
    const exampleLine = /\bgrouped data\b/i.test(focusLabel)
      ? 'For example, if test scores are grouped as 0-9, 10-19, and 20-29, the frequency tells us how many students fall in each interval.'
      : relatedMatch
      ? `For example, take one word from **${relatedMatch[2].trim()}**, say it slowly, and notice where the first key idea in the title appears.`
      : finiteTerms.length > 0
      ? `We will start with **${finiteTerms[0]}** and connect it to **${finiteTerms[1] || focusLabel}**.`
      : `We will start with one small example from **${focusLabel}** and build the main idea from it.`;
    const tryThis = /\bgrouped data\b/i.test(focusLabel)
      ? 'In a grouped frequency table, what does the **frequency** tell us?'
      : /\brelated to\b/i.test(focusLabel)
      ? (
        finiteTerms.some(term => /\bconsonant clusters?\b/i.test(term))
          ? 'Choose one word from the topic area, say it slowly, and tell me whether you notice two consonant sounds together.'
          : 'Choose one word from the topic area and tell me which key idea from the title it connects to.'
      )
      : finiteTerms.length > 0
      ? `Which of these terms do you already recognize: ${finiteTerms.slice(0, 3).join(', ')}?`
      : (
        focusIsPlural
          ? `Which part of **${focusLabel}** sounds most familiar to you?`
          : `What part of **${focusLabel}** sounds most familiar to you?`
      );

    return [
      '### Goal.',
      `By the end of this lesson, you should be able to explain **${focusLabel}** clearly.`,
      '',
      '### Core idea.',
      relatedMatch
        ? (() => {
            const leftTerms = relatedMatch[1].split(/,|;|\band\b/i).map(item => item.trim()).filter(Boolean);
            return leftTerms.length >= 2
              ? `This lesson has two jobs: notice **${leftTerms[0]}** in words, and build **${leftTerms[1]}** for **${relatedMatch[2].trim()}**.`
              : `This lesson connects **${relatedMatch[1].trim()}** with **${relatedMatch[2].trim()}**, so you can recognize the idea and use the words correctly.`;
          })()
        : `We will focus on one clear step in **${topicLabel}**, then check your understanding with one short question.`,
      '',
      '### Key terms.',
      ...(keyLines.length > 0 ? keyLines : [`- **${focusLabel}:** the main idea in this lesson step.`]),
      '',
      '### Example.',
      exampleLine,
      '',
      '### Try this.',
      tryThis,
    ].join('\n');
  }

  const keyLines = finiteTerms.length > 0
    ? [
        `- **${focusLabel}:** the central idea we will work with in this lesson.`,
        ...finiteTerms
          .slice(0, 10)
          .map((term, index) => fallbackKeyLine(term, focusLabel, index)),
      ]
    : [
        `- **${focusLabel}:** the central idea we will work with in this lesson.`,
        `- **Use:** what ${focusLabel} helps us understand or calculate.`,
        '- **Check:** one small example that shows the idea in action.',
      ];
  const termPreview = finiteTerms.slice(0, 4).join(', ');
  const tryThis = finiteTerms.length > 0
    ? `Which of these terms do you already recognize: ${termPreview}?`
    : (
      focusIsPlural
        ? `In one sentence, what do you think ${focusLabel} help someone understand or do?`
        : `In one sentence, what do you think ${focusLabel} helps someone understand or do?`
    );

  return [
    '### Goal.',
    `By the end of this lesson, you should be able to explain ${focusLabel} clearly and use the important terms correctly.`,
    '',
    '### Core idea.',
    `This lesson is about ${topicLabel}. We will first name the key ideas clearly, then connect them to one useful example.`,
    '',
    '### Key terms.',
    ...keyLines,
    '',
    '### Try this.',
    tryThis,
  ].join('\n');
};

const extractTutorKeyBlock = (content: string) => {
  const match = content.match(/(?:^|\n)\s*(?:###\s*)?Key (?:items|terms|units(?: [a-z ]{1,40})?)\.\s*\n([\s\S]*?)(?=\n\s*(?:###\s*)?(?:Try this|Example|Practice|Summary|Watch out|Steps)\.|\s*$)/i);
  return match?.[1] || '';
};

const hasVisibleNamedKeyItems = (content: string) => {
  const keyBlock = extractTutorKeyBlock(content);
  if (!keyBlock.trim()) return true;
  const lines = keyBlock
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^(?:###\s*)?[A-Z][A-Za-z ]+\.\s*$/.test(line));
  if (lines.length === 0) return true;
  const sample = lines.slice(0, Math.min(4, lines.length));
  return sample.every(line => /^(?:[-*]\s+)?(?:\*\*)?[A-Za-z0-9][^:\n*]{0,80}(?:\*\*)?:/.test(line));
};

const isMalformedTutorOpening = (content: string) => {
  const hasStructuralBlank =
    /\b(?:use|using)\s+(?:or|and)\s*[,.;]/i.test(content) ||
    /\b(?:with|between)\s+(?:or|and)\s*[,.;]/i.test(content) ||
    /\b(?:concepts?|ideas?|terms?|items?)\s+of\s+(?:and|or)\s*[,.;]/i.test(content) ||
    /\bcalled\s+(?:an?|the)\s*[,.;]/i.test(content) ||
    /\b(?:such as|including)\s*,/i.test(content) ||
    /\bis the\s*,/i.test(content) ||
    /\bis a\s*,/i.test(content) ||
    /\bresults are often\s*[,.]/i.test(content) ||
    /\bwhy\s+(?:and|or)\s+matter\b/i.test(content) ||
    /\buse\s+(?:and|or)\s+more carefully\b/i.test(content) ||
    /\bcalculate(?:ing)?\s+the\s+in\b/i.test(content) ||
    /\bset the lesson goal,\s*activate relevant prior knowledge,\s*and ask one entry check\b/i.test(content) ||
    /\b(?:the main concept for this lesson|an important term in this lesson\. We will define it clearly before using it)\b/i.test(content) ||
    /(?:^|\n)\s*A\s+(?:\*\*\s*\*\*)?\s*is\s+(?:a|an|the|software|used|meant)\b/im.test(content) ||
    /\band a\s+(?:\*\*\s*\*\*)?\s*is\s+(?:a|an|the|software|used|meant)\b/i.test(content) ||
    /^\s*(?:a|an|the)\s+is\s+\w/im.test(content) ||
    /^(?:###\s*)?(?:goal|core idea)\.\s*\n\s*(?:are|is|was|were|used|helps?|allows?|means|refers)\b/im.test(content) ||
    /^(?:###\s*)?goal\.\s*\n\s*(?:you will learn to|by the end[^.\n]*able to)\s+(?:calculate|understand|use|apply|explain|identify)\s+(?:and|or|to)\b/im.test(content) ||
    /^(?:###\s*)?goal\.\s*\n\s*(?:you will learn to|by the end[^.\n]*able to)[^.\n]*\bits importance\b/im.test(content) ||
    /\*{4,}/.test(content);
  const hasDescriptionOnlyKeyBlock = !hasVisibleNamedKeyItems(content);
  return (
    hasStructuralBlank ||
    hasDescriptionOnlyKeyBlock
  );
};

const repairTutorOpening = (content: string, _subjectName?: string, _topicName?: string) => {
  const repaired = content
    .replace(/(?:^|\n)\s*A\s+\*\*\s*\*\*\s+is\b/g, '\nA is')
    .replace(/\band a\s+\*\*\s*\*\*\s+is\b/gi, ' and a is')
    .trim();
  const hasBrokenPlaceholder =
    /(?:^|\n)\s*A\s+\*\*\s*(?:\r?\n|\s)*\*\*\s+is\b/i.test(repaired) ||
    /\band a\s+\*\*\s*(?:\r?\n|\s)*\*\*\s+is\b/i.test(repaired) ||
    /(?:^|\n)\s*-\s*\*\*\s*(?:\r?\n|\s)*\*\*\s*:?\s*/i.test(repaired) ||
    /\*{4,}/.test(repaired) ||
    !hasVisibleNamedKeyItems(repaired);
  if (hasBrokenPlaceholder) {
    return buildSafeTutorFallback(_subjectName, _topicName);
  }
  return repaired;
};

const parseApiErrorPayload = (raw: string) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const getAITutorErrorMessage = (err: any) => {
  const raw = typeof err?.message === 'string' ? err.message.trim() : '';
  const parsed = parseApiErrorPayload(raw);
  const code = parsed?.code || err?.detail?.code;
  const parsedMessage = parsed?.message || parsed?.detail || err?.detail?.message || err?.detail?.detail;
  if (!raw) {
    return "I couldn't complete that response right now. Please try again in a moment.";
  }

  if (code === 'BRAIN_POWER_DEPLETED') {
    return "You've worked really hard today, and that matters. Take a proud pause, then use the recommended videos below to reinforce what you've learned before your full recharge tomorrow.";
  }

  if (code === 'AI_TUTOR_BUSY' || code === 'AI_SERVICE_BUSY') {
    return typeof parsedMessage === 'string' && parsedMessage.trim()
      ? parsedMessage
      : 'The AI tutor is temporarily busy right now. Please try again in a few seconds.';
  }

  const lower = raw.toLowerCase();
  if (lower.includes('taking too long') || lower.includes('waking up')) {
    return 'The AI tutor is taking longer than usual to respond. Please try again in a moment.';
  }
  if (lower.includes('ai_service_unavailable')) {
    return 'The AI tutor is temporarily unavailable right now. Please try again in a moment.';
  }
  if (lower.includes('unable to connect') || lower.includes('failed to fetch') || lower.includes('network')) {
    return 'I lost the connection to the tutor service for a moment. Please try your last question again.';
  }
  if (lower.includes('brain power')) {
    return typeof parsedMessage === 'string' && parsedMessage.trim()
      ? parsedMessage
      : "You've worked really hard today. Take a short break and use the recommended videos below to reinforce what you've learned.";
  }
  if (lower.includes('session expired') || lower.includes('unauthorized') || lower.includes('log in again')) {
    return 'Your session expired while the tutor was replying. Please sign in again and continue.';
  }
  if (lower.includes('http 5') || lower.includes('internal server error') || lower.includes('service unavailable')) {
    return 'The tutor service hit a temporary issue. Please try again in a moment.';
  }
  if (lower.includes('http 4') || lower.includes('bad request')) {
    return raw;
  }
  return raw.length <= 180
    ? raw
    : "I couldn't complete that response right now. Please try again in a moment.";
};

const isTransientTutorError = (err: any) => {
  const rawMessage = typeof err?.message === 'string' ? err.message.trim() : '';
  const parsed = parseApiErrorPayload(rawMessage);
  const code = parsed?.code || err?.detail?.code;
  if (code === 'AI_TUTOR_BUSY' || code === 'AI_SERVICE_BUSY') {
    return true;
  }
  const raw = rawMessage.toLowerCase();
  return (
    raw.includes('ai_service_unavailable') ||
    raw.includes('ai_tutor_busy') ||
    raw.includes('ai_service_busy') ||
    raw.includes('temporarily busy') ||
    raw.includes('temporarily unavailable') ||
    raw.includes('service unavailable') ||
    raw.includes('taking too long') ||
    raw.includes('waking up') ||
    raw.includes('failed to fetch') ||
    raw.includes('unable to connect')
  );
};

const getTransientTutorRetryDelayMs = (err: any, isFirstTurn: boolean) => {
  const raw = typeof err?.message === 'string' ? err.message.trim() : '';
  const parsed = parseApiErrorPayload(raw);
  const code = parsed?.code || err?.detail?.code;
  const retryAfterSeconds = Number(
    parsed?.retry_after_seconds ??
    err?.detail?.retry_after_seconds ??
    0
  );

  if ((code === 'AI_TUTOR_BUSY' || code === 'AI_SERVICE_BUSY') && retryAfterSeconds > 0 && retryAfterSeconds <= 8) {
    return retryAfterSeconds * 1000;
  }

  if (isFirstTurn && isTransientTutorError(err)) {
    return 1200;
  }

  return null;
};

const getChatStorageKey = (subjectId?: string, topicId?: string, topicName?: string, subtopicName?: string) => {
  const normalizedTopic = canonicalTopicName(undefined, topicName) || 'general';
  const normalizedSubtopic = canonicalTopicName(undefined, subtopicName) || 'intro';
  return `edunexus_chat_v2_${subjectId || 'default'}::${topicId || normalizedTopic}::${normalizedTopic}::${normalizedSubtopic}`;
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

export const useAITutor = (profile?: any, getFullName?: () => string, enabled = true) => {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const saveChatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRequestSeq = useRef(0);
  const videoSuggestionCacheRef = useRef<Map<string, any[]>>(new Map());
  const videoSuggestionInflightRef = useRef<Map<string, Promise<any>>>(new Map());
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
    enabled: enabled && !!currentSubject?.id,
  });

  // Roadmap Query
  const { 
    data: roadmap = null, 
    isLoading: roadmapLoading 
  } = useQuery({
    queryKey: ['student', 'roadmap', currentSubject?.id, currentTopic?.id || currentTopic?.name],
    queryFn: async () => {
      try {
        return await aiAPI.getTopicBreakdown(currentTopic.name, currentSubject!.id);
      } catch (err) {
        console.error('[Roadmap Query] failed:', err);
        return null;
      }
    },
    enabled: enabled && !!currentSubject?.id && (!!currentTopic?.id || !!currentTopic?.name),
  });
  
  // Tasks 2A & 3A: Structured Progress Query
  const { 
    data: structuredTopics = [], 
    isLoading: isStructuredLoading,
    refetch: refetchStructured
  } = useQuery({
    queryKey: ['topic-progress', currentSubject?.id],
    queryFn: () => progressAPI.getTopicProgress(currentSubject!.id).then(d => d.topics || []),
    enabled: enabled && !!currentSubject?.id,
    staleTime: 0, // Always refetch when subject changes
  });

  const [showAIPanel, setShowAIPanel] = useState(false);
  const [viewingSubtopic, setViewingSubtopic] = useState<any>(null);
  const [activeSubtopic, setActiveSubtopic] = useState<any>(null);
  const [suggestedVideos, setSuggestedVideos] = useState<any[]>([]);
  const [videoSupportState, setVideoSupportState] = useState<VideoSupportState | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [weaknessAreas, setWeaknessAreas] = useState<string[]>([]);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  // New UI marker states for interactive tutoring
  const [showNextButton, setShowNextButton] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [showCTA, setShowCTA] = useState(false);

  // Load chat from BACKEND (source of truth) when topic/subject changes
  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!currentSubject?.id || !currentTopic?.name) {
      return;
    }

    const loadChatHistory = async () => {
      try {
        const normalizedTopicName = canonicalTopicName(undefined, currentTopic.name) || currentTopic.name;
        const normalizedSubtopicName = canonicalTopicName(undefined, activeSubtopic) || activeSubtopic;
        const history = await aiAPI.getChatHistory({
          subject_id: currentSubject.id,
          topic_id: currentTopic?.id,
          topic_name: normalizedTopicName,
          subtopic_name: normalizedSubtopicName
        });
        
        if (history?.messages?.length > 0) {
          const msgs = history.messages.map((m: any) => ({
            role: m.role === 'assistant' || m.role === 'ai' ? 'ai' : 'user',
            content: m.role === 'assistant' || m.role === 'ai'
              ? repairTutorOpening(m.content, currentSubject.name, currentTopic.name)
              : m.content
          })).filter((m: Message) => m.role !== 'ai' || !isMalformedTutorOpening(m.content));
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
              const repaired = parsed.map((m: Message) => ({
                ...m,
                content: m.role === 'ai'
                  ? repairTutorOpening(m.content, currentSubject.name, currentTopic.name)
                  : m.content
              })).filter((m: Message) => m.role !== 'ai' || !isMalformedTutorOpening(m.content));
              setMessagesAndRef(repaired);
              localStorage.setItem(storageKey, JSON.stringify(repaired));
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
            if (Array.isArray(parsed)) {
              const repaired = parsed.map((m: Message) => ({
                ...m,
                content: m.role === 'ai'
                  ? repairTutorOpening(m.content, currentSubject?.name, currentTopic?.name)
                  : m.content
              })).filter((m: Message) => m.role !== 'ai' || !isMalformedTutorOpening(m.content));
              setMessagesAndRef(repaired);
              localStorage.setItem(storageKey, JSON.stringify(repaired));
            }
          } catch {}
        }
      }
    };

    loadChatHistory();
  }, [enabled, currentSubject?.id, currentTopic?.id, currentTopic?.name, activeSubtopic]);

  // Save chat to BACKEND (source of truth) AND localStorage cache when messages change
  useEffect(() => {
    if (!enabled) return;
    if (messages.length === 0) return;
    if (!currentSubject?.id) return;

    const storageKey = getChatStorageKey(currentSubject.id, currentTopic?.id, currentTopic?.name, activeSubtopic);
    localStorage.setItem(storageKey, JSON.stringify(messages));

    if (messages[messages.length - 1]?.role !== 'ai') return;
    if (saveChatTimeoutRef.current) {
      clearTimeout(saveChatTimeoutRef.current);
    }

    const payload = {
      subject_id: currentSubject.id,
      topic_id: currentTopic?.id,
      topic_name: canonicalTopicName(undefined, currentTopic?.name) || 'general',
      subtopic_name: canonicalTopicName(undefined, activeSubtopic) || 'intro',
      messages: messages.map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content
      }))
    };

    // Save to backend after the tutor reply settles; localStorage remains immediate.
    saveChatTimeoutRef.current = setTimeout(() => {
      aiAPI.saveChatHistory(payload).catch(e => console.error('Failed to save chat to backend:', e));
    }, 500);

    return () => {
      if (saveChatTimeoutRef.current) {
        clearTimeout(saveChatTimeoutRef.current);
      }
    };
  }, [enabled, messages, currentSubject?.id, currentTopic?.id, currentTopic?.name, activeSubtopic]);

  const fetchVideoSuggestions = useCallback(async (
    topic: string,
    subjectOverride?: Subject | null,
    supportState?: VideoSupportState | null,
  ) => {
    const topicLabel = canonicalTopicName(undefined, topic) || topic?.trim();
    if (!enabled) {
      return;
    }
    if (!topicLabel) {
      setSuggestedVideos([]);
      setSelectedVideo(null);
      setVideoSupportState(null);
      return;
    }

    const subjectForRequest = subjectOverride || currentSubject;
    const resolvedSupportState = supportState ? {
      ...supportState,
      topic: supportState.topic || topicLabel,
    } : null;
    const cacheKey = JSON.stringify({
      topic: topicLabel.toLowerCase(),
      subject: (subjectForRequest?.name || '').toLowerCase(),
      educationLevel: (profile?.education_level || '').toLowerCase(),
      limit: 6,
    });
    const cachedVideos = videoSuggestionCacheRef.current.get(cacheKey);
    if (cachedVideos) {
      if (resolvedSupportState) {
        setVideoSupportState(resolvedSupportState);
      }
      setSuggestedVideos(cachedVideos);
      if (!cachedVideos.some((video: any) => video?.id === selectedVideo?.id)) {
        setSelectedVideo(null);
      }
      return;
    }

    if (videoSuggestionInflightRef.current.has(cacheKey)) {
      return;
    }

    const requestId = videoRequestSeq.current + 1;
    videoRequestSeq.current = requestId;
    if (resolvedSupportState) {
      setVideoSupportState(resolvedSupportState);
    }
    setSuggestedVideos([]);
    setSelectedVideo(null);

    try {
      const requestPromise = studentAPI.getSuggestedVideos({
        topic: topicLabel,
        subject: subjectForRequest?.name,
        educationLevel: profile?.education_level,
        limit: 6,
      });
      videoSuggestionInflightRef.current.set(cacheKey, requestPromise);
      const result = await requestPromise;

      if (requestId !== videoRequestSeq.current) {
        return;
      }
      const videos = Array.isArray(result?.videos) ? result.videos : [];
      if (resolvedSupportState) {
        setVideoSupportState(resolvedSupportState);
      }
      videoSuggestionCacheRef.current.set(cacheKey, videos);
      setSuggestedVideos(videos);
    } catch (e) {
      if (requestId !== videoRequestSeq.current) {
        return;
      }
      if (resolvedSupportState) {
        setVideoSupportState(resolvedSupportState);
      }
      setSuggestedVideos([]);
      console.error('Video fetch failed:', e);
    } finally {
      videoSuggestionInflightRef.current.delete(cacheKey);
    }
  }, [currentSubject, enabled, profile, selectedVideo?.id]);

  const primeRecoveryVideos = useCallback(async () => {
    const topicLabel = canonicalTopicName(undefined, currentTopic?.name || activeSubtopic || '');
    if (!topicLabel) return;
    if (suggestedVideos.length > 0) return;
    await fetchVideoSuggestions(topicLabel, currentSubject, {
      trigger: 'brain_power_exhausted',
      topic: topicLabel,
      reason: 'You have worked hard on this lesson. These videos are here as a calmer reinforcement path while the tutor rests.',
      autoOpen: true,
    });
  }, [activeSubtopic, currentSubject, currentTopic?.name, fetchVideoSuggestions, suggestedVideos.length]);

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
        canonicalTopicName(undefined, currentTopic?.name),
      ].filter(Boolean).join(' - ');
      const normalizedTopicName = canonicalTopicName(undefined, currentTopic?.name || activeSubtopic || undefined);
      const normalizedSubtopicName = canonicalTopicName(undefined, activeSubtopic || undefined);
      const userTurnCount = [...safeHistory, { role: 'user', content }].filter(m => m.role === 'user').length;
      const lessonContext = {
        lesson_stage: lessonController.stage,
        user_turn_count: userTurnCount,
        assistant_turn_count: safeHistory.filter(m => m.role === 'assistant').length,
        active_subtopic: activeSubtopic || null,
        topic_id: currentTopic?.id || null,
        subject_id: currentSubject?.id || null,
      };

      const requestPayload = [
        ...safeHistory,
        { role: 'user' as const, content }
      ];
      let response;
      try {
        response = await aiAPI.chat(
          requestPayload,
          'teaching',
          undefined,
          0.6,
          currentSubject?.name || undefined,
          normalizedTopicName || topicContext || undefined,
          lessonContext
        );
      } catch (firstErr: any) {
        const isFirstTurn = userTurnCount <= 1;
        const retryDelayMs = getTransientTutorRetryDelayMs(firstErr, isFirstTurn);
        if (retryDelayMs == null) {
          throw firstErr;
        }
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        response = await aiAPI.chat(
          requestPayload,
          'teaching',
          undefined,
          0.6,
          currentSubject?.name || undefined,
          normalizedTopicName || topicContext || undefined,
          lessonContext
        );
      }

      const aiContent = typeof response?.response === 'string' ? response.response : '';
      if (!aiContent.trim()) {
        throw new Error('The tutor returned an empty response.');
      }
      // Detect UI markers
      const hasNext = aiContent.includes('---NEXT---');
      const hasQuestion = aiContent.includes('---QUESTION---');
      const hasCTA = aiContent.includes('---CTA---');
      const shouldStartMasteryQuiz = response.ui_action === 'start_mastery_quiz' || response.should_start_mastery_quiz === true;
      const rawCleanContent = repairTutorOpening(
        cleanTutorResponse(aiContent),
        currentSubject?.name,
        normalizedTopicName || normalizedSubtopicName
      );
      const latestUserText = [...msgsForPayload].reverse().find((msg) => msg.role === 'user')?.content;
      const cleanContent = isMalformedTutorOpening(rawCleanContent)
        ? buildSafeTutorFallback(currentSubject?.name, normalizedTopicName || normalizedSubtopicName, latestUserText)
        : rawCleanContent;
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
        fetchVideoSuggestions(currentTopic?.name || content, currentSubject, {
          trigger: 'manual_request',
          topic: normalizedTopicName || content,
          reason: 'EduNexus is surfacing these because the tutor pointed you to a second explanation voice for this exact lesson step.',
          autoOpen: true,
        });
      } else if (nextLessonStage === 'remediate') {
        void fetchVideoSuggestions(currentTopic?.name || content, currentSubject, {
          trigger: 'repair_support',
          topic: normalizedTopicName || content,
          reason: 'These videos are here because this lesson step looks shaky and a second explanation may help before the next check.',
          autoOpen: false,
        });
      } else if (nextLessonStage === 'completed') {
        void fetchVideoSuggestions(currentTopic?.name || content, currentSubject, {
          trigger: 'revision_support',
          topic: normalizedTopicName || content,
          reason: 'These videos are saved here as revision support in case you want a second teaching voice after mastering the lesson.',
          autoOpen: false,
        });
      }
    } catch (err: any) {
      console.error('[AI Tutor] chat request failed:', {
        message: err?.message,
        requestId: err?.requestId,
        status: err?.status,
        detail: err?.detail,
        error: err,
      });
      const raw = typeof err?.message === 'string' ? err.message.trim() : '';
      const parsed = parseApiErrorPayload(raw);
      const isBrainPowerDepleted =
        parsed?.code === 'BRAIN_POWER_DEPLETED' ||
        err?.detail?.code === 'BRAIN_POWER_DEPLETED' ||
        raw.toLowerCase().includes('brain power');
      if (isBrainPowerDepleted) {
        void primeRecoveryVideos();
      }
      setMessagesAndRef(prev => [...prev, {
        role: 'ai',
        content: getAITutorErrorMessage(err)
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
    setActiveSubtopic(canonicalTopicName(undefined, subtopic.name) || subtopic.name);
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
      fetchVideoSuggestions(topicLabel, currentSubject, {
        trigger: 'prefetch',
        topic: topicLabel,
        reason: 'EduNexus prepared these quietly in case you want a second explanation voice for this topic.',
        autoOpen: false,
      });
    }

    if (currentSubject?.id && (currentTopic?.id || currentTopic?.name)) {
      try {
        const normalizedTopicName = canonicalTopicName(undefined, currentTopic.name) || currentTopic.name;
        const normalizedSubtopicName = canonicalTopicName(undefined, subtopic.name) || subtopic.name;
        const history = await aiAPI.getChatHistory({
          subject_id: currentSubject.id,
          topic_id: currentTopic?.id,
          topic_name: normalizedTopicName,
          subtopic_name: normalizedSubtopicName
        });
        if (history && history.messages && history.messages.length > 0) {
          setMessagesAndRef(history.messages.map((m: any) => ({
             role: m.role === 'assistant' || m.role === 'ai' ? 'ai' : m.role,
             content: m.role === 'assistant' || m.role === 'ai'
              ? repairTutorOpening(m.content, currentSubject.name, subtopic.name || currentTopic.name)
              : m.content
          })).filter((m: Message) => m.role !== 'ai' || !isMalformedTutorOpening(m.content)));
        } else {
          // Fallback to localStorage
          const storageKey = getChatStorageKey(currentSubject.id, currentTopic?.id, currentTopic.name, subtopic.name);
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const repaired = parsed.map((m: Message) => ({
                  ...m,
                  content: m.role === 'ai'
                    ? repairTutorOpening(m.content, currentSubject.name, subtopic.name || currentTopic.name)
                    : m.content
                })).filter((m: Message) => m.role !== 'ai' || !isMalformedTutorOpening(m.content));
                setMessagesAndRef(repaired);
                localStorage.setItem(storageKey, JSON.stringify(repaired));
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
    let finalResult = result;
    if (result?.passed && currentTopic?.id && !result?.next_topic_unlocked) {
      try {
        const completion = await progressAPI.completeTopic(currentTopic.id);
        finalResult = {
          ...result,
          next_topic_unlocked: result?.next_topic_unlocked || completion?.next_topic_unlocked || null,
        };
      } catch (error) {
        console.error('Failed to confirm topic completion:', error);
      }
    }

    setAiState({ status: 'quiz_completed', result: finalResult });
    setLessonController(prev => ({
      ...prev,
      stage: finalResult?.passed ? 'completed' : 'remediate',
      masteryReady: false,
      nextActions: finalResult?.passed ? ['next_topic', 'summary'] : ['review_missed', 'try_practice', 'simplify'],
    }));
    if (finalResult?.passed) {
      await refetchStructured();
      if (currentSubject?.id) {
        queryClient.invalidateQueries({ queryKey: ['topic-progress', currentSubject.id] });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['student', 'brain-power'] });
  }, [currentSubject?.id, currentTopic?.id, queryClient, refetchStructured]);

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
    fetchVideoSuggestions(resolvedTopic.name, activeSubject, {
      trigger: 'prefetch',
      topic: resolvedTopic.name,
      reason: 'EduNexus prepared these quietly in case you want a second explanation voice for this topic.',
      autoOpen: false,
    });
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
    videoSupportState,
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
