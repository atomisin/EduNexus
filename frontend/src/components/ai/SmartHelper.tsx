import { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, Send, Bot, User, Volume2, VolumeX, Copy, Check, Sparkles, X, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { aiAPI } from '@/services/api';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SmartHelperProps {
  isOpen: boolean;
  onClose: () => void;
  subject?: string;
  topic?: string;
}

export function SmartHelper({ isOpen, onClose, subject, topic }: SmartHelperProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const speechSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const recognitionRef = useRef<any>(null);

  const isSpeechRecognitionSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    const loadHistory = async () => {
      // Only load if it's the first time opening or if context changed
      if (!isOpen || isInitialized) return;

      try {
        console.log('[SmartHelper] Loading history...', { subject, topic });
        const response = await aiAPI.getChatHistory({
          subject_id: subject,
          topic_name: topic
        });

        if (response.messages && response.messages.length > 0) {
          const restoredMessages: Message[] = response.messages.map((m: any, idx: number) => ({
            id: `restored-${idx}-${Date.now()}`,
            role: m.role,
            content: m.content,
            timestamp: new Date()
          }));
          setMessages(restoredMessages);
          console.log(`[SmartHelper] Restored ${restoredMessages.length} messages`);
        } else {
          const welcomeMessage: Message = {
            id: 'welcome',
            role: 'assistant',
            content: "Hello! I'm your AI partner. I can help you with your studies or answer general questions. How can I help you today?",
            timestamp: new Date(),
          };
          setMessages([welcomeMessage]);
        }
        setIsInitialized(true);
      } catch (err) {
        console.warn('[SmartHelper] Failed to load history:', err);
        // Fallback to welcome message on error if no messages exist
        if (messages.length === 0) {
          setMessages([{
            id: 'welcome-fallback',
            role: 'assistant',
            content: "Hello! I'm here to help. (History loading failed, but we can still chat!)",
            timestamp: new Date(),
          }]);
        }
      }
    };

    loadHistory();
  }, [isOpen, subject, topic, isInitialized]);

  // Reset initialization if context changes
  useEffect(() => {
    setIsInitialized(false);
  }, [subject, topic]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Setup speech recognition
  useEffect(() => {
    if (!isSpeechRecognitionSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognitionAPI();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event: any) => {
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
        setInput(prev => prev + ' ' + finalTranscript);
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
      chatHistory.push({ role: 'user', content: userMessage.content });

      const response = await aiAPI.chat(chatHistory, 'generalist');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response || response.content || response.message || 'I apologize, but I could not generate a response. Please try again.',
        timestamp: new Date(),
      };

      const updatedMessages = [...messages, userMessage, assistantMessage];
      setMessages(updatedMessages);

      // Persist to backend
      try {
        await aiAPI.saveChatHistory({
          subject_id: subject,
          topic_name: topic,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content }))
        });
      } catch (saveErr) {
        console.warn('[SmartHelper] Failed to save chat:', saveErr);
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I encountered an error: ${error.message || 'Please try again.'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSpeak = (message: Message) => {
    if (!speechSynthesis) return;

    if (speakingId === message.id) {
      speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.rate = 0.9;
    utterance.onend = () => setSpeakingId(null);
    setSpeakingId(message.id);
    speechSynthesis.speak(utterance);
  };

  const handleCopy = async (message: Message) => {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] transition-all duration-300 transform ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
      <Card className="shadow-2xl border-0 bg-gradient-to-br from-teal-50/50 to-slate-50/50 dark:from-slate-900/50 dark:to-slate-900/50 border-t-4 border-t-teal-600">
        <CardHeader className="pb-3 border-b bg-white/50 dark:bg-slate-900/50 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8 border border-white dark:border-slate-800">
                <AvatarImage src="/avatars/ai_tutor_female.png" className="object-cover" />
                <AvatarFallback className="bg-teal-600 text-white"><Brain className="w-4 h-4" /></AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-sm font-semibold">AI Generalist</CardTitle>
                <Badge className="text-[10px] h-4 bg-emerald-100 text-emerald-700 border-emerald-200">
                  Online
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[400px] p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${message.role === 'assistant'
                    ? 'border border-teal-100 dark:border-teal-900'
                    : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                    {message.role === 'assistant' ? (
                      <img src="/avatars/ai_tutor_female.png" alt="AI" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    )}
                  </div>
                  <div className={`flex-1 max-w-[80%] ${message.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block p-3 rounded-2xl ${message.role === 'user'
                      ? 'bg-teal-600 text-white rounded-br-md shadow-md shadow-teal-200/50 dark:shadow-none'
                      : 'bg-white dark:bg-slate-800 shadow-sm rounded-bl-md border border-slate-100 dark:border-slate-700'
                      }`}>
                      <div className="text-sm prose dark:prose-invert max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 mt-1 ${message.role === 'user' ? 'justify-end' : ''}`}>
                      {message.role === 'assistant' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleSpeak(message)}
                          >
                            {speakingId === message.id ? (
                              <VolumeX className="w-3 h-3" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleCopy(message)}
                          >
                            {copiedId === message.id ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </Button>
                        </>
                      )}
                      <span className="text-xs text-slate-400">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg overflow-hidden border border-teal-100 dark:border-teal-900">
                    <img src="/avatars/ai_tutor_female.png" alt="AI" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center gap-1 text-slate-500">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t bg-white/50 dark:bg-slate-900/50 rounded-b-lg">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isListening ? "Listening... Speak now" : "Ask me anything..."}
                className="flex-1"
                disabled={isLoading || isListening}
              />
              {isSpeechRecognitionSupported && (
                <Button
                  variant={isListening ? 'destructive' : 'outline'}
                  onClick={toggleListening}
                  disabled={isLoading}
                  size="icon"
                  title={isListening ? 'Stop listening' : 'Use voice input'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              )}
              <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center uppercase tracking-wider font-medium">
              AI Generalist • Express Mode
            </p>
          </div>
        </CardContent>
      </Card>
    </div >
  );
}
