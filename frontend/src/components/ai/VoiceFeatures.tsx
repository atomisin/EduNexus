import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { aiAPI } from '@/services/api';

interface VoiceFeaturesProps {
  sessionId?: string;
  onTranscriptChange?: (transcript: string) => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function VoiceFeatures({ sessionId, onTranscriptChange, disabled }: VoiceFeaturesProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const speechSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        recognitionRef.current = new SpeechRecognitionAPI();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscript) {
            const newTranscript = transcript + ' ' + finalTranscript;
            setTranscript(newTranscript);
            onTranscriptChange?.(newTranscript);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setError(`Speech recognition error: ${event.error}`);
          setIsListening(false);
        };

        recognitionRef.current.onend = () => {
          if (isListening) {
            recognitionRef.current?.start();
          }
        };
      }
    }

    return () => {
      recognitionRef.current?.stop();
      if (speechSynthesis) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        setTranscript('');
        setError(null);
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err: any) {
        setError(`Failed to start: ${err.message}`);
      }
    }
  };

  const speakText = (text: string) => {
    if (!speechSynthesis) {
      setError('Text-to-speech not supported');
      return;
    }

    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechSynthesis.speak(utterance);
  };

  const processSpeech = async () => {
    if (!sessionId || !transcript.trim()) return;

    try {
      setError(null);
      await aiAPI.processSpeech(sessionId, new Blob([transcript], { type: 'text/plain' }));
    } catch (err: any) {
      setError(`Failed to process: ${err.message}`);
    }
  };

  const availableVoices = speechSynthesis?.getVoices() || [];

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mic className="w-4 h-4 text-indigo-600" />
          Voice Features
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={isListening ? 'destructive' : 'outline'}
            size="sm"
            onClick={toggleListening}
            disabled={disabled || !recognitionRef.current}
            className="gap-2"
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                Stop Listening
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                Start Listening
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => speakText(transcript || 'No transcript available')}
            disabled={disabled || !transcript.trim() || !speechSynthesis}
            className="gap-2"
          >
            {isSpeaking ? (
              <>
                <VolumeX className="w-4 h-4" />
                Stop
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                Speak
              </>
            )}
          </Button>

          {sessionId && (
            <Button
              variant="outline"
              size="sm"
              onClick={processSpeech}
              disabled={disabled || !transcript.trim()}
              className="gap-2"
            >
              <Loader2 className="w-4 h-4" />
              Process with AI
            </Button>
          )}
        </div>

        {isListening && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Listening...
          </div>
        )}

        {transcript && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <p className="text-sm text-slate-700 dark:text-slate-300">{transcript}</p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Badge variant="outline" className="text-xs">
            {recognitionRef.current ? 'Speech Recognition: Ready' : 'Speech Recognition: Not Available'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {speechSynthesis ? 'TTS: Ready' : 'TTS: Not Available'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {availableVoices.length} voices
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
