import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Brain, CheckCircle, XCircle, AlertCircle, Sparkles, ArrowRight, RotateCcw, Loader2, Timer } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
    id: number | string;
    question: string;
    options: string[];
    correct_answer: string;
    explanation: string;
}

interface Quiz {
    title: string;
    questions: Question[];
}

interface QuizViewProps {
    quiz: Quiz;
    onComplete: (answers: Record<string, string>) => Promise<void>;
    isLoading?: boolean;
    results?: {
        score: number;
        total: number;
        percentage: number;
        results: any[];
        feedback: string;
    };
    timeLimitMinutes?: number;
}

export const QuizView = ({ quiz, onComplete, isLoading, results, timeLimitMinutes = 5 }: QuizViewProps) => {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(timeLimitMinutes * 60);
    const [hasStarted, setHasStarted] = useState(false);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);

    const questions = quiz.questions || [];
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    // Timer countdown
    useEffect(() => {
        if (!hasStarted || isSubmitted || results) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleAutoSubmit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [hasStarted, isSubmitted, results]);

    // Format time as MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleStart = () => {
        setHasStarted(true);
    };

    const handleAutoSubmit = useCallback(async () => {
        if (isSubmitted || results) return;
        setIsSubmitted(true);
        toast.warning('Time is up! Submitting your answers...');
        await onComplete(answers);
    }, [answers, isSubmitted, results, onComplete]);

    const handleAnswerChange = (value: string) => {
        setAnswers((prev) => ({
            ...prev,
            [currentQuestion.id.toString()]: value,
        }));

        // Streak check
        if (value === currentQuestion.correct_answer) {
            setStreak(prev => {
                const newStreak = prev + 1;
                if (newStreak > maxStreak) setMaxStreak(newStreak);
                if (newStreak >= 3) toast.success(`🔥 ${newStreak} IN A ROW!`, { duration: 1000 });
                return newStreak;
            });
        } else {
            setStreak(0);
        }
    };

    const handleNext = () => {
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
            handleSubmit();
        }
    };

    const handleSubmit = async () => {
        if (Object.keys(answers).length < questions.length) {
            toast.error('Please answer all questions before submitting.');
            return;
        }
        setIsSubmitted(true);
        await onComplete(answers);
    };

    if (!questions.length) {
        return (
            <Card className="border-0 shadow-lg text-center p-12">
                <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <CardTitle>No Questions Available</CardTitle>
                <CardDescription>The AI is still preparing the quiz for this session.</CardDescription>
            </Card>
        );
    }

    // Start screen before timer begins
    if (!hasStarted) {
        return (
            <Card className="border-0 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="h-2 bg-gradient-to-r from-indigo-500 to-purple-500" />
                <CardHeader className="text-center pb-4">
                    <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-10 h-10 text-indigo-500" />
                    </div>
                    <CardTitle className="text-2xl">{quiz.title}</CardTitle>
                    <CardDescription className="text-base mt-2">
                        This assessment contains {questions.length} questions
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400">
                        <Timer className="w-5 h-5" />
                        <span className="font-medium">Time Limit: {timeLimitMinutes} minutes</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-sm text-slate-600 dark:text-slate-400">
                        <p className="font-medium mb-2">Instructions:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li>Answer all questions before time runs out</li>
                            <li>Each question has 4 options (A, B, C, D)</li>
                            <li>Your score will be shown after submission</li>
                            <li>Questions auto-submit when time expires</li>
                        </ul>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleStart} className="w-full btn-primary rounded-xl py-6 text-lg">
                        <Sparkles className="w-5 h-5 mr-2" />
                        Start Assessment
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    if (results) {
        return (
            <Card className="border-0 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className={`h-2 bg-gradient-to-r ${results.percentage >= 70 ? 'from-emerald-400 to-teal-500' : 'from-amber-400 to-orange-500'}`} />
                <CardHeader className="text-center pb-2">
                    <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 border-4 border-white dark:border-slate-900 shadow-xl">
                        {results.percentage >= 70 ? (
                            <CheckCircle className="w-10 h-10 text-emerald-500" />
                        ) : (
                            <AlertCircle className="w-10 h-10 text-amber-500" />
                        )}
                    </div>
                    <CardTitle className="text-3xl font-bold">Quiz Results</CardTitle>
                    <CardDescription className="text-lg">
                        You scored <span className="font-bold text-slate-900 dark:text-slate-100">{results.score}/{results.total}</span> points
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col items-center">
                        <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 to-indigo-600">
                            {Math.round(results.percentage)}%
                        </div>
                        <p className="text-sm text-slate-500 mt-1 uppercase tracking-widest font-semibold flex items-center gap-1">
                            Accuracy Level {results.percentage >= 90 && <Sparkles className="w-4 h-4 text-amber-500" />}
                        </p>
                        {maxStreak >= 3 && (
                            <div className="mt-4 flex items-center gap-2 px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full font-bold animate-bounce">
                                <span className="text-xl">🔥</span> {maxStreak} Answer Streak!
                            </div>
                        )}
                    </div>

                    <div className="bg-indigo-50 dark:bg-indigo-950/30 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 relative overflow-hidden">
                        <Sparkles className="absolute top-2 right-2 w-5 h-5 text-indigo-400/30" />
                        <h4 className="font-bold text-indigo-900 dark:text-indigo-400 mb-2 flex items-center gap-2">
                            <Brain className="w-4 h-4" />
                            AI Personal Feedback
                        </h4>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed italic">
                            "{results.feedback}"
                        </p>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-semibold text-sm text-slate-500 uppercase tracking-wider">Question Breakdown</h4>
                        {results.results.map((res, i) => (
                            <div key={i} className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                                {res.is_correct ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                )}
                                <div>
                                    <p className="font-medium text-sm mb-1">{questions[i]?.question}</p>
                                    <div className="flex gap-2 text-xs">
                                        <span className="text-slate-500">Your answer: <span className={res.is_correct ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{res.student_answer}</span></span>
                                        {!res.is_correct && (
                                            <span className="text-slate-500">Correct: <span className="text-emerald-600 font-bold">{res.correct_answer}</span></span>
                                        )}
                                    </div>
                                    {res.explanation && (
                                        <p className="text-xs text-slate-400 mt-2 bg-white/50 dark:bg-black/20 p-2 rounded-lg italic">
                                            {res.explanation}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button variant="outline" className="w-full rounded-xl" onClick={() => window.location.reload()}>
                        <RotateCcw className="w-4 h-4 mr-2" /> Finish & Continue
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="border-0 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="h-2 bg-indigo-500 w-full" />
            <CardHeader className="pb-4">
                <div className="flex justify-between items-center mb-2">
                    <Badge variant="secondary" className="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 border-0">
                        Question {currentQuestionIndex + 1} of {questions.length}
                    </Badge>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${timeLeft < 60 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                        <Timer className="w-4 h-4" />
                        <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
                    </div>
                </div>
                <CardTitle className="text-xl leading-relaxed">{quiz.title}</CardTitle>
                <Progress value={progress} className="h-1.5 mt-4" />
            </CardHeader>

            <CardContent className="py-6">
                <div className="mb-8">
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-6">
                        {currentQuestion.question}
                    </h3>

                    <RadioGroup
                        value={answers[currentQuestion.id.toString()]}
                        onValueChange={handleAnswerChange}
                        className="space-y-3"
                    >
                        {currentQuestion.options.map((option, idx) => {
                            const label = ['A', 'B', 'C', 'D'][idx];
                            const isSelected = answers[currentQuestion.id.toString()] === label;
                            return (
                                <div key={idx} className={`flex items-center space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${isSelected
                                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
                                    : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                                    }`} onClick={() => handleAnswerChange(label)}>
                                    <RadioGroupItem value={label} id={`option-${idx}`} className="sr-only" />
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                        }`}>
                                        {label}
                                    </div>
                                    <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                                        {option}
                                    </Label>
                                </div>
                            );
                        })}
                    </RadioGroup>
                </div>
            </CardContent>

            <CardFooter className="bg-slate-50 dark:bg-slate-900/50 p-6 flex justify-between items-center">
                <p className="text-xs text-slate-400 italic flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Think carefully before choosing!
                </p>
                <Button
                    onClick={handleNext}
                    disabled={!answers[currentQuestion.id.toString()] || isLoading || isSubmitted}
                    className="btn-primary rounded-xl px-8"
                >
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : currentQuestionIndex < questions.length - 1 ? (
                        <>Next <ArrowRight className="w-4 h-4 ml-2" /></>
                    ) : (
                        'Finish Assessment'
                    )}
                </Button>
            </CardFooter>
        </Card>
    );
};
