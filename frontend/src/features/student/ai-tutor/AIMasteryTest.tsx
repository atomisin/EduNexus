import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    ArrowRight,
    Trophy,
    Brain,
    Star,
    ChevronRight,
    TrendingUp,
    Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { aiAPI } from '@/services/api';
import { toast } from "sonner";
import MathText from '@/components/MathText';

interface Question {
    id: string;
    text: string;
    options: { [key: string]: string };
    correct_option: string;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
}

interface AIMasteryTestProps {
    topic: string;
    topicId?: string;
    subject: string;
    subjectId?: string;
    subtopic: string | null;
    chatHistory?: { role: string; content: string }[];
    onComplete: (evaluation: any) => void;
    onCancel: () => void;
}

export const AIMasteryTest: React.FC<AIMasteryTestProps> = ({ topic, topicId, subject, subjectId, subtopic, chatHistory, onComplete, onCancel }) => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string>("");
    const [answers, setAnswers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [evaluation, setEvaluation] = useState<any>(null);

    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                const response = await aiAPI.generateMasteryTest({
                    topic: subtopic || topic,
                    subject,
                    chat_history: chatHistory
                });
                if (response.questions && response.questions.length > 0) {
                    setQuestions(response.questions);
                } else {
                    toast.error("Could not generate test questions. Please try again.");
                    onCancel();
                }
            } catch (error) {
                console.error("Mastery test error:", error);
                toast.error("Failed to load assessment.");
                onCancel();
            } finally {
                setLoading(false);
            }
        };

        fetchQuestions();
    }, [topic, subject, subtopic, onCancel]);

    const handleNext = () => {
        if (!selectedOption) return;

        const currentQuestion = questions[currentIndex];
        const isCorrect = selectedOption === currentQuestion.correct_option;

        const newAnswers = [
            ...answers,
            {
                question_id: currentQuestion.id,
                selected: selectedOption,
                correct_option: currentQuestion.correct_option,
                is_correct: isCorrect,
                difficulty: currentQuestion.difficulty
            }
        ];
        setAnswers(newAnswers);

        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedOption("");
        } else {
            handleSubmit(newAnswers);
        }
    };

    const handleRetake = () => {
        setCurrentIndex(0);
        setSelectedOption("");
        setAnswers([]);
        setEvaluation(null);
        setShowResults(false);
    };

    const handleSubmit = async (finalAnswers: any[]) => {
        setSubmitting(true);
        try {
            const result = await aiAPI.evaluateMasteryTest({
                topic,
                topicId,
                subjectId,
                subtopic: subtopic || undefined,
                results: finalAnswers
            });
            setEvaluation(result);
            setShowResults(true);
            toast.success(`Test Completed! Score: ${result.score}/${result.total}`);
        } catch (error) {
            console.error("Evaluation error:", error);
            toast.error("Failed to evaluate test results.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Card className="w-full max-w-2xl mx-auto border-teal-100 shadow-none overflow-hidden">
                <CardContent className="p-12 flex flex-col items-center justify-center space-y-4">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    >
                        <Brain className="w-12 h-12 text-teal-600" />
                    </motion.div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-800">Preparing Your Mastery Test</h3>
                        <p className="text-slate-500">Generating 10 adaptive questions on {topic}...</p>
                    </div>
                    <div className="w-full max-w-xs bg-slate-100 h-2 rounded-full overflow-hidden">
                        <motion.div
                            className="bg-teal-500 h-full"
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 3 }}
                        />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (showResults && evaluation) {
        const isPassed = evaluation.passed;
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-2xl mx-auto"
                >
                    <Card className="border-teal-200 shadow-none overflow-hidden rounded-lg">
                        <div className={`h-3 ${isPassed ? 'bg-teal-500' : 'bg-amber-500'}`} />
                        <CardHeader className="text-center pb-2 px-5 sm:px-6">
                            <div className="flex justify-center mb-4">
                                {isPassed ? (
                                    <div className="bg-teal-100 p-4 rounded-full relative">
                                        <Trophy className="w-16 h-16 text-teal-600" />
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="absolute -top-2 -right-2 bg-amber-400 p-2 rounded-full shadow-none"
                                        >
                                            <Star className="w-5 h-5 text-white" fill="white" />
                                        </motion.div>
                                    </div>
                                ) : (
                                    <div className="bg-amber-100 p-4 rounded-full">
                                        <Award className="w-16 h-16 text-amber-600" />
                                    </div>
                                )}
                            </div>
                            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                                {isPassed ? 'Mastery Achieved!' : 'Great Effort!'}
                            </CardTitle>
                            <CardDescription className="text-base sm:text-lg">
                                Topic: <span className="font-semibold text-teal-700">{topic}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-5 sm:p-8">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 mb-6 sm:mb-8 text-center">
                                <div className="bg-slate-50 p-4 sm:p-6 rounded-lg border border-slate-100">
                                    <div className="text-3xl sm:text-4xl font-black text-slate-900 mb-1">
                                        {evaluation.score}<span className="text-xl text-slate-400">/{evaluation.total}</span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Final Score</div>
                                </div>
                                <div className="bg-slate-50 p-4 sm:p-6 rounded-lg border border-slate-100">
                                    <div className="text-2xl font-bold text-teal-600 mb-1">{evaluation.mastery_level}</div>
                                    <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Mastery Level</div>
                                </div>
                            </div>

                            <div className="bg-teal-50/50 p-4 sm:p-6 rounded-lg border border-teal-100 relative mb-6 sm:mb-8">
                                <div className="absolute -top-3 left-6 px-3 bg-white text-teal-700 font-bold text-xs uppercase border border-teal-100 rounded-full">
                                    Teacher's Feedback
                                </div>
                                <p className="text-slate-700 italic leading-relaxed text-base sm:text-lg">
                                    "{evaluation.feedback}"
                                </p>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-teal-500" />
                                    Performance Insights
                                </h4>
                                <div className="grid grid-cols-1 gap-2">
                                    <div className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg">
                                        <span className="text-slate-600">Accuracy Rate</span>
                                        <span className="font-bold text-slate-900">{Math.round(evaluation.percentage)}%</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg">
                                        <span className="text-slate-600">Topic Completion</span>
                                        <span className={`font-bold ${isPassed ? 'text-teal-600' : 'text-amber-600'}`}>
                                            {isPassed ? 'Completed' : 'Review Needed'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {evaluation.detailed_results && (
                                <div className="mt-8 space-y-4">
                                    <h4 className="text-lg font-bold text-slate-800 border-b pb-2">Detailed Question Review</h4>
                                    <div className="space-y-4 sm:max-h-[360px] sm:overflow-y-auto sm:pr-2 no-scrollbar">
                                        {evaluation.detailed_results.map((r: any, idx: number) => {
                                            const question = questions.find(q => q.id === r.question_id);
                                            return (
                                                <div key={idx} className={`p-4 rounded-lg border-l-[5px] ${r.is_correct ? 'border-teal-500 bg-teal-50/30' : 'border-amber-500 bg-amber-50/30'}`}>
                                                    <p className="font-semibold text-slate-800 mt-1">{idx + 1}. <MathText>{question?.text || ''}</MathText></p>
                                                    <div className="mt-3 space-y-2 text-sm">
                                                        <div className="flex items-start gap-2">
                                                            <span className="font-bold text-slate-500 w-16">Your Answer:</span>
                                                            <span className={`font-medium ${r.is_correct ? 'text-teal-700' : 'text-amber-700'}`}>
                                                                {question?.options[r.selected] || r.selected} {r.is_correct && '✓'}
                                                            </span>
                                                        </div>
                                                        {!r.is_correct && (
                                                            <div className="flex items-start gap-2 text-teal-700">
                                                                <span className="font-bold text-slate-500 w-16">Correct:</span>
                                                                <span className="font-medium">{question?.options[question.correct_option]} ✓</span>
                                                            </div>
                                                        )}
                                                        <div className="bg-white p-3 rounded-lg border border-slate-100 text-slate-600 mt-2 text-sm">
                                                            <span className="font-bold text-slate-700">Explanation:</span> <MathText>{question?.explanation || ''}</MathText>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                        </CardContent>
                        <CardFooter className="bg-slate-50 p-4 sm:p-6 border-t border-slate-100">
                            {isPassed ? (
                                <Button
                                    onClick={() => onComplete(evaluation)}
                                    className="w-full h-12 text-base sm:text-lg font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700"
                                >
                                    Continue to Next Topic
                                    <ArrowRight className="ml-2 w-5 h-5" />
                                </Button>
                            ) : (
                                <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleRetake}
                                        className="h-12 rounded-lg font-bold"
                                    >
                                        Retake Mastery Test
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => onComplete(evaluation)}
                                        className="h-12 rounded-lg font-bold text-white bg-amber-600 hover:bg-amber-700"
                                    >
                                        Back to Tutor
                                        <ArrowRight className="ml-2 w-5 h-5" />
                                    </Button>
                                </div>
                            )}
                        </CardFooter>
                    </Card>
                </motion.div>
            </AnimatePresence>
        );
    }

    const currentQuestion = questions[currentIndex];
    const progress = ((currentIndex + 1) / questions.length) * 100;

    return (
        <Card className="w-full max-w-2xl mx-auto border-teal-100 shadow-none overflow-hidden min-h-[500px] flex flex-col rounded-lg">
            <CardHeader className="bg-white border-b border-slate-50 p-4 sm:p-5">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="shrink-0 bg-teal-100 p-2 rounded-lg">
                            <Brain className="w-5 h-5 text-teal-600" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-800 leading-tight">Mastery Test</h3>
                            <p className="text-sm sm:text-xs text-slate-500 mt-1 leading-snug break-words">{topic}</p>
                        </div>
                    </div>
                    <div className="text-left sm:text-right">
                        <div className="text-sm font-bold text-slate-900">Question {currentIndex + 1}/{questions.length}</div>
                        <div className="flex sm:justify-end gap-1 mt-1 overflow-hidden">
                            {[...Array(questions.length)].map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 min-w-3 flex-1 sm:flex-none sm:w-3 rounded-full ${i < currentIndex ? 'bg-teal-500' :
                                        i === currentIndex ? 'bg-teal-600 animate-pulse' : 'bg-slate-200'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <Progress value={progress} className="h-1 bg-slate-100" />
            </CardHeader>

            <CardContent className="p-5 sm:p-8 flex-1">
                <div className="mb-6 sm:mb-8">
                    <div className="flex items-center gap-2 mb-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${currentQuestion.difficulty === 'easy' ? 'bg-green-50 text-green-700 border-green-100' :
                            currentQuestion.difficulty === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                'bg-rose-50 text-rose-700 border-rose-100'
                            }`}>
                            {currentQuestion.difficulty} Level
                        </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                        <MathText>{currentQuestion.text}</MathText>
                    </h2>
                </div>

                <RadioGroup
                    value={selectedOption}
                    onValueChange={setSelectedOption}
                    className="space-y-3"
                >
                    {Object.entries(currentQuestion.options).map(([key, value]) => (
                        <div key={key}>
                            <RadioGroupItem value={key} id={`opt-${key}`} className="peer sr-only" />
                            <Label
                                htmlFor={`opt-${key}`}
                                className="flex items-center gap-3 p-4 sm:p-5 rounded-lg border-2 border-slate-100 hover:border-primary/30 bg-white hover:bg-slate-50/30 cursor-pointer transition-all duration-200 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 relative overflow-hidden group shadow-sm"
                            >
                                <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-50 group-hover:bg-primary/10 text-slate-500 group-hover:text-primary peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-white flex items-center justify-center font-black text-lg border border-slate-100 group-hover:border-primary/20 transition-colors">
                                    {key}
                                </div>
                                <div className="min-w-0 flex-1 font-semibold text-base sm:text-lg text-slate-800"><MathText>{value}</MathText></div>
                                <div className="shrink-0 w-7 h-7 rounded-full border-2 border-slate-200 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary flex items-center justify-center transition-all">
                                    <div className="w-2.5 h-2.5 rounded-full bg-white scale-0 peer-data-[state=checked]:scale-100 transition-transform" />
                                </div>
                            </Label>
                        </div>
                    ))}
                </RadioGroup>
            </CardContent>

            <CardFooter className="p-4 sm:p-6 bg-slate-50/80 backdrop-blur-sm border-t border-slate-100">
                <div className="w-full flex flex-col-reverse sm:flex-row gap-3 sm:justify-between sm:items-center">
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        className="text-slate-500 hover:text-rose-600"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleNext}
                        disabled={!selectedOption || submitting}
                        className="w-full sm:w-auto px-8 sm:px-10 bg-teal-600 hover:bg-teal-700 text-white font-bold h-12 rounded-lg shadow-none shadow-teal-500/20"
                    >
                        {submitting ? 'Evaluating...' : currentIndex === questions.length - 1 ? 'Finish Test' : 'Next Question'}
                        <ChevronRight className="ml-1 w-5 h-5" />
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
};
