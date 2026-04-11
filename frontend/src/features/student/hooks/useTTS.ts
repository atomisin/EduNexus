import { useEffect, useRef } from 'react';

export const useTTS = (educationLevel: string | undefined) => {
  const synthRef = useRef<SpeechSynthesis | null>(
    typeof window !== 'undefined' ? window.speechSynthesis : null
  );

  const YOUNG_LEVELS = [
    'creche', 'nursery_1', 'nursery_2', 'kindergarten'
  ];

  const isYoungLearner = YOUNG_LEVELS.includes(educationLevel?.toLowerCase() || '');

  const speak = (text: string) => {
    if (!synthRef.current) return;
    if (!isYoungLearner) return;

    // Stop any current speech
    synthRef.current.cancel();

    // Strip emoji and markdown for speech
    const cleanText = text
      .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Strip markdown links but keep text
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.85; // Slightly slower for children
    utterance.pitch = 1.1; // Slightly higher for child-friendly tone
    utterance.volume = 1.0;
    utterance.lang = 'en-NG'; // Prefer Nigerian English if available

    // Prefer a female voice if available (often perceived as warmer for young learners)
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v => 
      v.lang.startsWith('en') && 
      v.name.toLowerCase().includes('female')
    ) || voices.find(v => 
      v.lang.startsWith('en')
    );
    
    if (preferred) {
      utterance.voice = preferred;
    }

    synthRef.current.speak(utterance);
  };

  const stop = () => {
    synthRef.current?.cancel();
  };

  // Stop speech when component unmounts
  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return { speak, stop, isYoungLearner };
};
