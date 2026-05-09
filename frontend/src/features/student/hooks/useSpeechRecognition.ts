import { useCallback, useEffect, useRef, useState } from 'react';

type UseSpeechRecognitionOptions = {
  lang?: string;
  onTranscript?: (transcript: string) => void;
};

const getSpeechRecognitionConstructor = () => {
  if (typeof window === 'undefined') return undefined;
  return window.SpeechRecognition || window.webkitSpeechRecognition || undefined;
};

export const useSpeechRecognition = ({
  lang = 'en-GB',
  onTranscript,
}: UseSpeechRecognitionOptions = {}) => {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const isSpeechRecognitionSupported = Boolean(getSpeechRecognitionConstructor());

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return undefined;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
      setSpeechError(null);
      setInterimTranscript('');
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      setInterimTranscript(interimText.trim());
      if (finalText.trim()) {
        onTranscriptRef.current?.(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      const message = event.error === 'not-allowed'
        ? 'Microphone permission is blocked for this browser.'
        : 'Voice input stopped. Please try again.';
      setSpeechError(message);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setSpeechError('Voice input is not supported in this browser.');
      return;
    }

    try {
      setSpeechError(null);
      setInterimTranscript('');
      recognition.start();
    } catch {
      recognition.stop();
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isSpeechRecognitionSupported,
    isListening,
    interimTranscript,
    speechError,
    startListening,
    stopListening,
    toggleListening,
  };
};
