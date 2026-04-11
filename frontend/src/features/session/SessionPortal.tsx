import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { sessionAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

// These components are used within SessionPortal but were not defined in App.tsx (likely external or I missed them)
// I will assume they are external or I will define them as placeholders if needed.
// Wait, I'll check App.tsx again for LiveSessionRoom and QuizView.
import { LiveSessionRoom } from '@/components/session/LiveSessionRoom';
import { QuizView } from '@/components/session/QuizView';

interface SessionPortalProps {
  sessionId: string;
  title: string;
  isTeacher: boolean;
  onClose: () => void;
}

export const SessionPortal = ({
  sessionId,
  title,
  isTeacher,
  onClose
}: SessionPortalProps) => {
  const { user } = useAuth();
  const [stage, setStage] = useState<'loading' | 'pre-quiz' | 'live' | 'post-quiz' | 'completed'>('loading');
  const [sessionData, setSessionData] = useState<any>(null);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string>('');
  const [quizResults, setQuizResults] = useState<any>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  useEffect(() => {
    const initSession = async () => {
      try {
        setStage('loading');
        // Fetch session details - API returns {success, session, ...}
        const sessionResponse = await sessionAPI.get(sessionId);
        const session = sessionResponse.session || sessionResponse;
        setSessionData(session);

        // Fetch LiveKit token
        const tokenData = await sessionAPI.getToken(sessionId);
        setLivekitToken(tokenData.token);
        setRoomName(tokenData.room_name || `edunexus-session-${sessionId}`);

        // Determine starting stage
        if (session.status === 'live') {
          setStage('live');
        } else if (session.status === 'upcoming' || session.status === 'scheduled') {
          setStage('pre-quiz');
        } else {
          setStage('completed');
        }
      } catch (error) {
        toast.error('Failed to initialize session');
        onClose();
      }
    };
    initSession();
  }, [sessionId, onClose]);

  const handleQuizComplete = async (answers: Record<string, string>) => {
    setQuizLoading(true);
    try {
      const type = stage === 'pre-quiz' ? 'pre' : 'post';
      if (!user) throw new Error("Not logged in");
      const response = await sessionAPI.submitQuiz(sessionId, user.id, type, answers);
      setQuizResults(response.result || response);
      toast.success(`${type === 'pre' ? 'Pre' : 'Post'}-session quiz completed!`);

      // If pre-quiz, move to live
      if (type === 'pre') {
        setTimeout(() => setStage('live'), 3000);
      }
    } catch (error) {
      toast.error('Failed to submit quiz');
    } finally {
      setQuizLoading(false);
    }
  };

  if (stage === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
          <p className="text-white font-medium">Initializing Secure Session Room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden transition-all duration-300 ${isTheaterMode || stage === 'live' ? 'p-0' : 'p-2 md:p-4'}`}>
      <div className={`w-full mx-auto flex-1 flex flex-col min-h-0 transition-all duration-300 ${isTheaterMode ? 'max-w-none' : 'max-w-[1400px]'}`}>
        {stage === 'pre-quiz' && sessionData?.session?.pre_session_quiz && (
          <div className="flex-1 flex items-center justify-center py-8">
            <div className="max-w-2xl w-full">
              <h2 className="text-2xl font-bold text-center mb-8 text-slate-900 dark:text-slate-100 italic">
                Wait! Let's refresh some concepts before we start...
              </h2>
              <QuizView
                quiz={sessionData.session.pre_session_quiz}
                onComplete={handleQuizComplete}
                isLoading={quizLoading}
                results={quizResults}
                timeLimitMinutes={3}
              />
            </div>
          </div>
        )}

        {stage === 'live' && livekitToken && (
          <LiveSessionRoom
            sessionId={sessionId}
            token={livekitToken}
            roomName={roomName}
            serverUrl={import.meta.env.VITE_LIVEKIT_URL || "ws://localhost:7880"}
            onDisconnect={() => {
              if (isTeacher) {
                setStage('post-quiz');
              } else {
                onClose();
              }
            }}
            title={title}
            isTeacher={isTeacher}
            isTheaterMode={isTheaterMode}
            onToggleTheater={() => setIsTheaterMode(!isTheaterMode)}
          />
        )}

        {stage === 'post-quiz' && sessionData?.session?.post_session_quiz && (
          <div className="flex-1 flex items-center justify-center py-8">
            <div className="max-w-2xl w-full">
              <h2 className="text-2xl font-bold text-center mb-8 text-slate-900 dark:text-slate-100 italic">
                Session Complete! Let's see what you've learned...
              </h2>
              <QuizView
                quiz={sessionData.session.post_session_quiz}
                onComplete={handleQuizComplete}
                isLoading={quizLoading}
                results={quizResults}
                timeLimitMinutes={5}
              />
            </div>
          </div>
        )}

        {stage === 'completed' && (
          <div className="flex-1 flex items-center justify-center">
            <Card className="max-w-md w-full p-12 text-center shadow-2xl border-0">
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Session Finished</h2>
              <p className="text-slate-500 mb-8 text-balance">The session has ended. Your performance and notes will be available in your dashboard shortly.</p>
              <Button onClick={onClose} className="w-full btn-primary rounded-xl">Back to Dashboard</Button>
            </Card>
          </div>
        )}

        {/* Fallback if quiz is missing but stage is quiz */}
        {(stage === 'pre-quiz' && !sessionData?.session?.pre_session_quiz) && (
          <div className="flex-1 flex items-center justify-center">
            <Button onClick={() => setStage('live')} className="btn-primary rounded-xl">Skip Intro & Start Session</Button>
          </div>
        )}
        {(stage === 'post-quiz' && !sessionData?.session?.post_session_quiz) && (
          <div className="flex-1 flex items-center justify-center">
            <Button onClick={() => setStage('completed')} className="btn-primary rounded-xl">Finish Session</Button>
          </div>
        )}
      </div>
    </div>
  );
};
