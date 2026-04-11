import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, CheckCircle2, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react';
import { mockExamAPI } from '@/services/api';
import MathText from '@/components/MathText';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface ComboExamEngineProps {
  seriesIds: string[];
  onComplete: (results: any) => void;
  onCancel: () => void;
}

const ComboExamEngine: React.FC<ComboExamEngineProps> = ({ 
  seriesIds, 
  onComplete, 
  onCancel 
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Array of full attempt data
  const [attempts, setAttempts] = useState<any[]>([]);
  const [activeAttemptIndex, setActiveAttemptIndex] = useState(0);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  
  // attemptId -> questionId -> answer
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isTimeUp, setIsTimeUp] = useState(false);

  useEffect(() => {
    const initializeCombo = async () => {
      try {
        setLoading(true);
        // Start combo attempt
        const comboRes = await mockExamAPI.startCombo(seriesIds);
        
        // Fetch questions for each attempt
        const attemptPromises = comboRes.attempt_ids.map((id: string) => 
          mockExamAPI.getAttempt(id)
        );
        const fetchedAttempts = await Promise.all(attemptPromises);
        
        setAttempts(fetchedAttempts);
        setTimeLeft(comboRes.time_limit_minutes * 60);
        
        // Initialize answer tracking state
        const initialAnswers: Record<string, Record<string, string>> = {};
        fetchedAttempts.forEach(att => {
          initialAnswers[att.id] = att.answers || {};
        });
        setAnswers(initialAnswers);
      } catch (err: any) {
        toast.error(err.message || 'Failed to start combination exam');
        onCancel();
      } finally {
        setLoading(false);
      }
    };
    initializeCombo();
  }, [seriesIds]);

  useEffect(() => {
    if (timeLeft === null || isTimeUp || submitting) return;
    if (timeLeft <= 0) {
      setIsTimeUp(true);
      handleSubmit();
      return;
    }
    const timer = setInterval(() => setTimeLeft(t => t! - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isTimeUp, submitting]);

  const handleSelectAnswer = (questionId: string, option: string) => {
    const attemptId = attempts[activeAttemptIndex].id;
    setAnswers(prev => ({
      ...prev,
      [attemptId]: {
        ...prev[attemptId],
        [questionId]: option
      }
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Calculate time spent roughly based on initial 120 mins
      const totalTimeLimit = 120 * 60; 
      const timeSpent = timeLeft !== null ? (totalTimeLimit - timeLeft) / 4 : 0;
      
      const payload = attempts.map(att => ({
        attempt_id: att.id,
        answers: answers[att.id] || {},
        time_spent_seconds: Math.floor(timeSpent)
      }));
      
      const res = await mockExamAPI.submitCombo(payload);
      onComplete(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit exams');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">
          Starting JAMB Simulation. Retrieving 200 Questions...
        </p>
      </div>
    );
  }

  if (attempts.length === 0) {
    return <div className="text-center p-12">Failed to load exam data.</div>;
  }

  const currentAttempt = attempts[activeAttemptIndex];
  const questions = currentAttempt?.questions || [];
  const currentQuestion = questions[activeQuestionIndex];
  const currentAnswers = answers[currentAttempt.id] || {};

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isWarningTime = timeLeft && timeLeft < 300; // < 5 mins

  return (
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 animate-in fade-in zoom-in-95 duration-300 relative h-[85vh]">
      
      {/* Sidebar for Navigation */}
      <div className="md:w-80 flex flex-col gap-4 sticky top-4 h-full">
        {/* Timer Panel */}
        <Card className="p-5 shadow-lg border-2 border-slate-200 dark:border-slate-800 shrink-0">
          <div className="text-center">
            <p className="text-xs font-black tracking-widest text-slate-500 uppercase mb-1">Time Remaining</p>
            <div className={`text-4xl font-black tabular-nums tracking-tight flex items-center justify-center gap-2
              ${isWarningTime ? 'text-red-500 animate-pulse' : 'text-slate-900 dark:text-white'}
            `}>
              <Clock className="w-6 h-6" />
              {timeLeft !== null ? formatTime(timeLeft) : '--:--'}
            </div>
            {isWarningTime && (
              <p className="text-xs text-red-500 font-bold mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Hurry up!
              </p>
            )}
          </div>
        </Card>

        {/* Global Progress across all subjects */}
        <Card className="flex-1 p-5 shadow-lg border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden max-h-[calc(100vh-250px)]">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-sm">Exam Overview</h3>
          </div>
          
          <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
            {attempts.map((att, idx) => {
              const qs = att.questions || [];
              const ans = answers[att.id] || {};
              const answeredCount = Object.keys(ans).length;
              const isActive = idx === activeAttemptIndex;
              const subjectName = att.series_name.replace(/JAMB | NECO | 2024/g, '').trim();

              return (
                <div key={att.id} className="space-y-2">
                  <div 
                    onClick={() => {
                      setActiveAttemptIndex(idx);
                      setActiveQuestionIndex(0);
                    }}
                    className={`flex justify-between items-center text-sm font-bold p-2 rounded-lg cursor-pointer transition-colors ${
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{subjectName}</span>
                    <Badge variant={isActive ? "secondary" : "outline"} className="text-[10px]">
                      {answeredCount}/{qs.length}
                    </Badge>
                  </div>
                  
                  {/* Miniature Question Grid for the selected subject block */}
                  {isActive && (
                    <div className="grid grid-cols-5 gap-1.5 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                      {qs.map((_: any, qIdx: number) => {
                        const isAnswered = ans[qs[qIdx].id];
                        const isCurrent = qIdx === activeQuestionIndex;
                        return (
                          <button
                            key={qIdx}
                            onClick={() => setActiveQuestionIndex(qIdx)}
                            className={`w-full aspect-square text-[10px] font-bold rounded flex items-center justify-center transition-all
                              ${isCurrent ? 'ring-2 ring-primary bg-primary text-white scale-110 shadow-md' : 
                                isAnswered ? 'bg-teal-500/20 text-teal-700 dark:text-teal-400 font-bold' : 
                                'bg-slate-200 dark:bg-slate-800 text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-700'}
                            `}
                          >
                            {qIdx + 1}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 shrink-0">
             <Button 
                onClick={handleSubmit} 
                disabled={submitting}
                className="w-full font-bold shadow-lg shadow-primary/20 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                Submit All Subjects
              </Button>
              <Button variant="ghost" className="w-full mt-2 text-muted-foreground" onClick={onCancel} disabled={submitting}>
                Leave Exam
              </Button>
          </div>
        </Card>
      </div>

      {/* Main Question Area */}
      <div className="flex-1 flex flex-col overflow-hidden max-h-full">
        <Card className="flex-1 p-8 shadow-xl border-slate-200 dark:border-slate-800 flex flex-col relative overflow-hidden bg-white dark:bg-slate-950">
          
          <div className="absolute top-0 left-0 w-full h-2 flex">
             {attempts.map((att, idx) => (
                <div key={idx} className={`h-full flex-1 ${idx === activeAttemptIndex ? 'bg-primary' : 'bg-slate-100 dark:bg-slate-800'}`} />
             ))}
          </div>

          <div className="flex justify-between items-center mb-8 shrink-0 pt-2">
            <h2 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white flex items-center gap-3">
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg px-3 py-1 text-sm font-bold">
                Q {activeQuestionIndex + 1} of {questions.length}
              </span>
              <span className="text-primary">{currentAttempt.series_name}</span>
            </h2>
            {currentQuestion.topic_tag && (
               <Badge variant="outline" className="text-xs uppercase tracking-widest">{currentQuestion.topic_tag}</Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4">
            <div className="text-2xl text-slate-900 dark:text-slate-100 leading-relaxed font-medium mb-10 overflow-hidden">
               <MathText>{currentQuestion.question_text}</MathText>
            </div>

            <div className="space-y-4">
              <RadioGroup
                value={currentAnswers[currentQuestion.id]}
                onValueChange={(val) => handleSelectAnswer(currentQuestion.id, val)}
                className="space-y-4"
              >
                {['A', 'B', 'C', 'D'].map((opt) => {
                  const optKey = `option_${opt.toLowerCase()}` as keyof typeof currentQuestion;
                  
                  return (
                    <div key={opt}>
                      <RadioGroupItem value={opt} id={`opt-${opt}`} className="peer sr-only" />
                      <Label
                        htmlFor={`opt-${opt}`}
                        className="flex items-center p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-800 hover:border-primary/30 bg-white dark:bg-slate-900 cursor-pointer transition-all duration-200 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 relative overflow-hidden group shadow-md"
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shrink-0 transition-colors
                          peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-white bg-slate-100 dark:bg-slate-800 text-slate-500
                        `}>
                          {opt}
                        </div>
                        <div className="text-lg font-medium text-slate-700 dark:text-slate-300 flex-1 min-w-0 ml-6">
                           <MathText>{currentQuestion[optKey]}</MathText>
                        </div>
                        <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-700 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary flex items-center justify-center transition-all ml-2">
                          <div className="w-2 h-2 rounded-full bg-white scale-0 peer-data-[state=checked]:scale-100 transition-transform" />
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800 mt-6 shrink-0">
            <Button
              variant="outline"
              size="lg"
              className="rounded-xl h-14 px-8 font-bold text-base"
              disabled={activeQuestionIndex === 0 && activeAttemptIndex === 0}
              onClick={() => {
                if (activeQuestionIndex > 0) setActiveQuestionIndex(i => i - 1)
                else if (activeAttemptIndex > 0) {
                   setActiveAttemptIndex(i => i - 1)
                   setActiveQuestionIndex(attempts[activeAttemptIndex - 1].questions.length - 1)
                }
              }}
            >
              <ChevronLeft className="w-5 h-5 mr-2" />
              Previous
            </Button>
            
            <Button
              size="lg"
              className="rounded-xl h-14 px-8 font-bold text-base bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30"
              disabled={activeQuestionIndex === questions.length - 1 && activeAttemptIndex === attempts.length - 1}
              onClick={() => {
                if (activeQuestionIndex < questions.length - 1) setActiveQuestionIndex(i => i + 1)
                else if (activeAttemptIndex < attempts.length - 1) {
                   setActiveAttemptIndex(i => i + 1)
                   setActiveQuestionIndex(0)
                }
              }}
            >
              Next Component
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ComboExamEngine;
