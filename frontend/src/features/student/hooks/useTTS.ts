import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeAcademicTextForSpeech } from '@/utils/academicText';

type SpeakOptions = {
  force?: boolean;
};

type TutorVoiceGender = 'male' | 'female';

const BRITISH_VOICE_HINTS = ['en-gb', 'united kingdom', 'british', 'uk english', 'great britain'];
const MALE_VOICE_HINTS = [' male', '(male', 'man', 'daniel', 'george', 'ryan', 'thomas', 'arthur', 'oliver'];
const FEMALE_VOICE_HINTS = [' female', '(female', 'woman', 'libby', 'sonia', 'kate', 'serena', 'susan', 'hazel'];

const voiceMatches = (voice: SpeechSynthesisVoice, hints: string[]) => {
  const text = `${voice.name} ${voice.lang}`.toLowerCase();
  return hints.some((hint) => text.includes(hint));
};

const pickTutorVoice = (
  availableVoices: SpeechSynthesisVoice[],
  tutorGender: TutorVoiceGender
) => {
  const englishVoices = availableVoices.filter((voice) =>
    voice.lang.toLowerCase().startsWith('en')
  );
  const britishVoices = englishVoices.filter((voice) =>
    voiceMatches(voice, BRITISH_VOICE_HINTS)
  );
  const genderHints = tutorGender === 'male' ? MALE_VOICE_HINTS : FEMALE_VOICE_HINTS;

  return britishVoices.find((voice) => voiceMatches(voice, genderHints))
    || englishVoices.find((voice) => voice.lang.toLowerCase().startsWith('en-gb') && voiceMatches(voice, genderHints))
    || englishVoices.find((voice) => voiceMatches(voice, genderHints))
    || britishVoices[0]
    || englishVoices[0];
};

export const useTTS = (educationLevel: string | undefined, tutorGender: TutorVoiceGender = 'female') => {
  const synthRef = useRef<SpeechSynthesis | null>(
    typeof window !== 'undefined' ? window.speechSynthesis : null
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const YOUNG_LEVELS = [
    'creche', 'nursery_1', 'nursery_2', 'kindergarten'
  ];

  const isYoungLearner = YOUNG_LEVELS.includes(educationLevel?.toLowerCase() || '');
  const isSpeechSupported =
    typeof window !== 'undefined' &&
    Boolean(synthRef.current) &&
    'SpeechSynthesisUtterance' in window;

  const stop = useCallback(() => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text: string, options: SpeakOptions = {}) => {
    if (!synthRef.current || !text.trim()) return false;
    if (!options.force && !isYoungLearner) return false;

    // Stop any current speech
    synthRef.current.cancel();

    const cleanText = normalizeAcademicTextForSpeech(text);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = isYoungLearner ? 0.85 : 0.92;
    utterance.pitch = isYoungLearner ? 1.1 : tutorGender === 'male' ? 0.95 : 1.03;
    utterance.volume = 1.0;
    utterance.lang = 'en-GB';
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    const availableVoices = voices.length > 0 ? voices : synthRef.current.getVoices();
    const preferred = pickTutorVoice(availableVoices, tutorGender);
    
    if (preferred) {
      utterance.voice = preferred;
    }

    setIsSpeaking(true);
    synthRef.current.speak(utterance);
    return true;
  }, [isYoungLearner, tutorGender, voices]);

  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return undefined;

    const loadVoices = () => setVoices(synth.getVoices());
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);

    return () => {
      synth.removeEventListener?.('voiceschanged', loadVoices);
      synth.cancel();
      setIsSpeaking(false);
    };
  }, []);

  return { speak, stop, isYoungLearner, isSpeechSupported, isSpeaking };
};
