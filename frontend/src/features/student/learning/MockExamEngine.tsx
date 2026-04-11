import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, Clock, CheckCircle2, ChevronRight, ChevronLeft, Flag, Send } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { mockExamAPI } from '@/services/api';
import { toast } from 'sonner';
import MathText from '@/components/MathText';

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  topic_tag?: string;
}

interface AttemptDetails {
  id: string;
  series_id: string;
  series_name: string;
  time_limit_minutes: number;
  is_completed: boolean;
  answers: Record<string, string>;
  questions: Question[];
  score: number;
  total_questions: number;
  time_taken_seconds: number;
}

interface MockExamEngineProps {
  seriesId: string;
  onComplete: (results: any) => void;
  onCancel: () => void;
}

const MockExamEngine: React.FC<MockExamEngineProps> = ({ seriesId, onComplete, onCancel }) => {
  const [attempt, setAttempt] = useState<AttemptDetails | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const startExam = async () => {
      try {
        // Step 1: Start attempt (returns attempt_id)
        const startData = await mockExamAPI.startAttempt(seriesId);
        const attemptId = startData.attempt_id;

        // Step 2: Fetch attempt details (returns questions)
        const details = await mockExamAPI.getAttempt(attemptId);
        setAttempt(details);
        setAnswers(details.answers || {});
        setTimeLeft(details.time_limit_minutes * 60);
        setLoading(false);
      } catch (err) {
        toast.error("Failed to start mock exam");
        onCancel();
      }
    };
    startExam();
  }, [seriesId]);

  const handleSubmit = useCallback(async () => {
    if (!attempt || submitting) return;

    const unansweredCount = attempt.questions.length - Object.keys(answers).length;
    if (timeLeft > 0 && unansweredCount > 0) {
      if (!confirm(`You have ${unansweredCount} unanswered question(s). Submit anyway?`)) return;
    }

    setSubmitting(true);
    try {
      const results = await mockExamAPI.submitAttempt(attempt.id, answers);
      onComplete(results);
    } catch (err) {
      toast.error("Failed to submit exam");
      setSubmitting(false);
    }
  }, [attempt, answers, timeLeft, submitting, onComplete]);

  useEffect(() => {
    if (timeLeft <= 0 && !loading && attempt) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, loading, attempt, handleSubmit]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion = attempt?.questions[currentIdx];

  const handleOptionSelect = (optionKey: string) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: optionKey }));
  };

  const toggleFlag = () => {
    if (!currentQuestion) return;
    const newFlags = new Set(flags);
    if (newFlags.has(currentQuestion.id)) {
      newFlags.delete(currentQuestion.id);
    } else {
      newFlags.add(currentQuestion.id);
    }
    setFlags(newFlags);
  };

  // Build options map from flat fields
  const getOptions = (q: Question) => ({
    A: q.option_a,
    B: q.option_b,
    C: q.option_c,
    D: q.option_d,
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground animate-pulse">Preparing your exam environment...</p>
      </div>
    );
  }

  if (!attempt || !currentQuestion) return null;

  const progress = ((currentIdx + 1) / attempt.questions.length) * 100;
  const options = getOptions(currentQuestion);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Clock className={`w-5 h-5 ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-primary'}`} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Time Remaining</p>
            <p className={`text-xl font-mono font-bold ${timeLeft < 300 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
              {formatTime(timeLeft)}
            </p>
          </div>
        </div>

        <div className="flex-1 w-full max-w-md">
          <div className="flex justify-between text-xs font-bold mb-1.5 uppercase tracking-tight">
            <span>Progress: {currentIdx + 1} / {attempt.questions.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-slate-100 dark:bg-slate-800" />
        </div>

        <Button 
          variant="outline" 
          className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={onCancel}
        >
          Quit Exam
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Question Area */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
            <div className="h-1 bg-primary/20"></div>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                  Question {currentIdx + 1}{currentQuestion.topic_tag ? ` — ${currentQuestion.topic_tag}` : ''}
                </Badge>
                <button 
                  onClick={toggleFlag}
                  className={`p-2 rounded-lg transition-colors ${flags.has(currentQuestion.id) ? 'text-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <Flag className={`w-5 h-5 ${flags.has(currentQuestion.id) ? 'fill-current' : ''}`} />
                </button>
              </div>
              <CardTitle className="text-xl md:text-2xl font-semibold leading-relaxed pt-2">
                <MathText>{currentQuestion.question_text}</MathText>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <RadioGroup
                value={answers[currentQuestion.id]}
                onValueChange={(val) => handleOptionSelect(val)}
                className="space-y-4"
              >
                {Object.entries(options).map(([key, value]) => (
                  <div key={key}>
                    <RadioGroupItem value={key} id={`opt-${key}`} className="peer sr-only" />
                    <Label
                      htmlFor={`opt-${key}`}
                      className="flex items-center p-6 rounded-2xl border-2 border-slate-100 hover:border-primary/30 bg-white dark:bg-slate-900 cursor-pointer transition-all duration-200 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 relative overflow-hidden group shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 group-hover:bg-primary/10 text-slate-500 group-hover:text-primary flex items-center justify-center font-black text-lg mr-4 border border-slate-100 dark:border-slate-800 group-hover:border-primary/20 transition-colors">
                        {key}
                      </div>
                      <div className="flex-1 font-semibold text-lg text-slate-800 dark:text-slate-100">
                        <MathText>{value}</MathText>
                      </div>
                      <div className="w-6 h-6 rounded-full border-2 border-slate-200 dark:border-slate-700 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary flex items-center justify-center transition-all ml-2">
                        <div className="w-2 h-2 rounded-full bg-white scale-0 peer-data-[state=checked]:scale-100 transition-transform" />
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center px-2">
            <Button
              variant="outline"
              onClick={() => setCurrentIdx(prev => prev - 1)}
              disabled={currentIdx === 0}
              className="rounded-xl px-6"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
            
            {currentIdx === attempt.questions.length - 1 ? (
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-primary hover:bg-primary/90 text-white rounded-xl px-8 shadow-lg shadow-primary/20"
              >
                {submitting ? 'Submitting...' : 'Complete Exam'}
                <Send className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentIdx(prev => prev + 1)}
                className="rounded-xl px-8"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>

        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm sticky top-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Jump to Question</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {attempt.questions.map((q, idx) => (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all relative ${
                      currentIdx === idx
                        ? 'bg-primary text-white scale-110 shadow-md z-10'
                        : answers[q.id]
                        ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50'
                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {idx + 1}
                    {flags.has(q.id) && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-white dark:border-slate-900"></div>
                    )}
                  </button>
                ))}
              </div>
              
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded bg-green-500"></div>
                  <span>Answered</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <span>Unanswered</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded bg-orange-500"></div>
                  <span>Flagged for Review</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MockExamEngine;
