import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface WebSpeechFeaturesProps {
  onTranscript?: (text: string) => void;
  onSpeak?: (text: string) => void;
  disabled?: boolean;
}

export function WebSpeechFeatures({ onTranscript, onSpeak, disabled }: WebSpeechFeaturesProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;

  // Check browser support
  const isSpeechRecognitionSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (isSpeechSynthesisSupported) {
      const loadVoices = () => {
        const availableVoices = speechSynthesis!.getVoices();
        setVoices(availableVoices);
        // Select English voice by default
        const englishVoice = availableVoices.find(v => v.lang.startsWith('en'));
        if (englishVoice) setSelectedVoice(englishVoice);
      };
      
      loadVoices();
      speechSynthesis!.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    if (!isSpeechRecognitionSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interim = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      
      if (finalTranscript) {
        setTranscript(prev => prev + ' ' + finalTranscript);
        onTranscript?.(finalTranscript);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        setError(`Speech error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        recognition.start();
      }
    };

    return () => {
      recognition.stop();
    };
  }, [onTranscript, isListening]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setError(null);
      setInterimTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  const speakText = useCallback((text: string) => {
    if (!speechSynthesis || !text.trim()) return;

    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthesis.speak(utterance);
    onSpeak?.(text);
  }, [isSpeaking, selectedVoice, onSpeak]);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-indigo-600" />
          Voice Features (Free - Browser Built-in)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Badges */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={isSpeechRecognitionSupported ? 'default' : 'destructive'}>
            {isSpeechRecognitionSupported ? 'Speech Recognition: Ready' : 'Not Available'}
          </Badge>
          <Badge variant={isSpeechSynthesisSupported ? 'default' : 'destructive'}>
            {isSpeechSynthesisSupported ? 'Text-to-Speech: Ready' : 'Not Available'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {voices.length} voices available
          </Badge>
        </div>

        {/* Voice Selection */}
        {voices.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Voice</label>
            <select 
              className="w-full p-2 border rounded-md text-sm"
              value={selectedVoice?.name || ''}
              onChange={(e) => {
                const voice = voices.find(v => v.name === e.target.value);
                setSelectedVoice(voice || null);
              }}
            >
              {voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={isListening ? 'destructive' : 'outline'}
            size="sm"
            onClick={toggleListening}
            disabled={disabled || !isSpeechRecognitionSupported}
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
            onClick={() => speakText(transcript || 'No text to speak')}
            disabled={disabled || !isSpeechSynthesisSupported}
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
                Speak Text
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTranscript('');
              setInterimTranscript('');
            }}
          >
            Clear
          </Button>
        </div>

        {/* Listening Indicator */}
        {isListening && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Listening... Speak now
          </div>
        )}

        {/* Transcript Display */}
        {(transcript || interimTranscript) && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {transcript}
              <span className="text-slate-400">{interimTranscript}</span>
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="text-xs text-slate-500 mt-2">
          💡 Using your browser's built-in speech recognition and synthesis. 
          No external services or Docker containers needed!
        </div>
      </CardContent>
    </Card>
  );
}

export default WebSpeechFeatures;
