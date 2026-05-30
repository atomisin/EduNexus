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
  initialToken?: string | null;
  initialRoomName?: string;
  initialSessionData?: any;
  onClose: () => void;
}

export const SessionPortal = ({
  sessionId,
  title,
  isTeacher,
  initialToken,
  initialRoomName,
  initialSessionData,
  onClose
}: SessionPortalProps) => {
  const { user } = useAuth();
  const [stage, setStage] = useState<'loading' | 'pre-quiz' | 'live' | 'post-quiz' | 'completed'>('loading');
  const [sessionData, setSessionData] = useState<any>(initialSessionData ?? null);
  const [livekitToken, setLivekitToken] = useState<string | null>(initialToken ?? null);
  const [roomName, setRoomName] = useState<string>(initialRoomName ?? '');
  const [quizResults, setQuizResults] = useState<any>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  const normalizeQuiz = (quiz: any) => {
    if (!quiz) return null;
    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    return {
      ...quiz,
      questions: questions.map((question: any, index: number) => ({
        ...question,
        id: question?.id ?? index + 1,
        question: question?.question || question?.text || question?.prompt || '',
        correct_answer: question?.correct_answer ?? (
          typeof question?.correct_index === 'number' ? String.fromCharCode(65 + question.correct_index) : undefined
        ),
      })),
    };
  };

  const preQuiz = normalizeQuiz(sessionData?.pre_session_quiz);
  const postQuiz = normalizeQuiz(sessionData?.post_session_quiz);
  const preQuizReady = Boolean(preQuiz?.status === 'ready' && preQuiz?.questions?.length);
  const postQuizReady = Boolean(postQuiz?.status === 'ready' && postQuiz?.questions?.length);

  const refreshSessionState = async () => {
    const sessionResponse = await sessionAPI.get(sessionId, { lite: !isTeacher });
    const session = sessionResponse.session || sessionResponse;
    setSessionData(session);
    return session;
  };

  useEffect(() => {
    const initSession = async () => {
      try {
        setStage('loading');
        let session = initialSessionData ?? null;

        if (isTeacher) {
          const [sessionResponse, tokenData] = await Promise.all([
            refreshSessionState(),
            sessionAPI.getToken(sessionId),
          ]);
          session = sessionResponse;
          setLivekitToken(tokenData.token);
          setRoomName(tokenData.room_name || `edunexus-session-${sessionId}`);
        } else if (!session || !initialToken) {
          const joinResponse = await sessionAPI.join(sessionId);
          session = joinResponse.session || joinResponse;
          setSessionData(session);
          setLivekitToken(joinResponse.livekit_token || null);
          setRoomName(joinResponse.livekit_room_name || session?.livekit_room_name || `edunexus-session-${sessionId}`);
        } else {
          setSessionData(session);
          setLivekitToken(initialToken);
          setRoomName(initialRoomName || session?.livekit_room_name || `edunexus-session-${sessionId}`);
        }

        // Determine starting stage
        if (session.status === 'live') {
          setStage('live');
        } else if (session.status === 'upcoming' || session.status === 'scheduled') {
          setStage('pre-quiz');
        } else if (session.status === 'ended' && Boolean((session.post_session_quiz?.questions || []).length)) {
          setStage('post-quiz');
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
      const apiAnswers = Object.fromEntries(
        Object.entries(answers).map(([questionId, selected]) => {
          const parsedQuestionId = Number(questionId);
          const selectedIndex = /^[A-D]$/i.test(selected)
            ? selected.toUpperCase().charCodeAt(0) - 65
            : Number(selected);
          return [parsedQuestionId, Number.isFinite(selectedIndex) ? selectedIndex : 0];
        })
      );
      const response = await sessionAPI.submitQuiz(sessionId, user.id, type, apiAnswers);
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
      <div className={`w-full min-w-0 mx-auto flex-1 flex flex-col min-h-0 transition-all duration-300 ${isTheaterMode ? 'max-w-none' : 'max-w-[1400px]'}`}>
        {stage === 'pre-quiz' && preQuizReady && (
          <div className="flex-1 flex min-w-0 items-center justify-center px-3 py-6 sm:py-8">
            <div className="max-w-2xl w-full min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-center mb-5 sm:mb-8 text-slate-900 dark:text-slate-100 italic">
                Wait! Let's refresh some concepts before we start...
              </h2>
              <QuizView
                quiz={preQuiz}
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
              (async () => {
                try {
                  const refreshedSession = await refreshSessionState();
                  const refreshedPostQuiz = normalizeQuiz(refreshedSession?.post_session_quiz);
                  if (refreshedSession?.status === 'ended' && refreshedPostQuiz?.questions?.length) {
                    setQuizResults(null);
                    setStage('post-quiz');
                    return;
                  }
                } catch (error) {
                  console.error('Failed to refresh session after live room disconnect:', error);
                }
                if (isTeacher) {
                  setStage('completed');
                } else {
                  onClose();
                }
              })();
            }}
            title={title}
            isTeacher={isTeacher}
            isTheaterMode={isTheaterMode}
            onToggleTheater={() => setIsTheaterMode(!isTheaterMode)}
          />
        )}

        {stage === 'post-quiz' && postQuizReady && (
          <div className="flex-1 flex min-w-0 items-center justify-center px-3 py-6 sm:py-8">
            <div className="max-w-2xl w-full min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-center mb-5 sm:mb-8 text-slate-900 dark:text-slate-100 italic">
                Session Complete! Let's see what you've learned...
              </h2>
              <QuizView
                quiz={postQuiz}
                onComplete={handleQuizComplete}
                isLoading={quizLoading}
                results={quizResults}
                timeLimitMinutes={5}
              />
            </div>
          </div>
        )}

        {stage === 'completed' && (
          <div className="flex-1 flex items-center justify-center px-3">
            <Card className="max-w-md w-full p-6 sm:p-12 text-center shadow-2xl border-0">
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mb-2">Session Finished</h2>
              <p className="text-slate-500 mb-8 text-balance">The session has ended. Your performance and notes will be available in your dashboard shortly.</p>
              <Button onClick={onClose} className="w-full btn-primary rounded-xl">Back to Dashboard</Button>
            </Card>
          </div>
        )}

        {/* Fallback if quiz is missing but stage is quiz */}
        {(stage === 'pre-quiz' && !preQuizReady) && (
          <div className="flex-1 flex items-center justify-center">
            <Button onClick={() => setStage('live')} className="btn-primary rounded-xl">Skip Intro & Start Session</Button>
          </div>
        )}
        {(stage === 'post-quiz' && !postQuizReady) && (
          <div className="flex-1 flex items-center justify-center">
            <Button onClick={() => setStage('completed')} className="btn-primary rounded-xl">Finish Session</Button>
          </div>
        )}
      </div>
    </div>
  );
};
