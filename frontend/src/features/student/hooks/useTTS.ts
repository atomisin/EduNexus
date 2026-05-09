import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeAcademicTextForSpeech } from '@/utils/academicText';

type SpeakOptions = {
  force?: boolean;
};

export const useTTS = (educationLevel: string | undefined) => {
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
    utterance.pitch = isYoungLearner ? 1.1 : 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-NG'; // Prefer Nigerian English if available
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    const availableVoices = voices.length > 0 ? voices : synthRef.current.getVoices();
    const preferred = availableVoices.find(v =>
      v.lang.toLowerCase().startsWith('en-ng')
    ) || availableVoices.find(v =>
      v.lang.toLowerCase().startsWith('en') &&
      v.name.toLowerCase().includes('female')
    ) || availableVoices.find(v =>
      v.lang.toLowerCase().startsWith('en')
    );
    
    if (preferred) {
      utterance.voice = preferred;
    }

    setIsSpeaking(true);
    synthRef.current.speak(utterance);
    return true;
  }, [isYoungLearner, voices]);

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
