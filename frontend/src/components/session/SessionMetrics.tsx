import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, BarChart2, Users, Sparkles } from 'lucide-react';

interface SessionMetricsProps {
    engagementTimeline: any[];
    studentPresence: Record<string, any>;
    quizResults?: {
        title?: string;
        totalQuestions: number;
        submissions: Array<{
            studentId: string;
            studentName: string;
            score: number;
            correct: number;
            total: number;
            submittedAt?: string | null;
            details: any[];
        }>;
        questionBreakdown: Array<{
            questionNumber: number;
            question: string;
            options: string[];
            correctIndex: number;
            correctChoice: string;
            responses: Array<{
                studentId: string;
                studentName: string;
                selectedIndex: number | null;
                selectedChoice: string;
                correctIndex: number;
                correctChoice: string;
                isCorrect: boolean;
            }>;
        }>;
    } | null;
    className?: string;
}

export const SessionMetrics: React.FC<SessionMetricsProps> = ({
    engagementTimeline,
    studentPresence,
    quizResults,
    className,
}) => {
    // Process timeline data for Chart
    const timelineData = useMemo(() => {
        return engagementTimeline.map((point) => ({
            time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            attention: point.average_attention || 0,
            participation: point.total_participation || 0,
        }));
    }, [engagementTimeline]);

    // Process student participation comparison
    const participationData = useMemo(() => {
        return Object.values(studentPresence).map(student => ({
            name: student.name || 'Student',
            questions: student.questions_asked || 0,
            answers: student.answers_given || 0,
            participation: student.participation_count || 0,
        })).sort((a, b) => b.participation - a.participation).slice(0, 5);
    }, [studentPresence]);

    // Overall metrics
    const stats = useMemo(() => {
        const students = Object.values(studentPresence);
        const avgAttention = students.length > 0
            ? students.reduce((acc, s) => acc + (s.attention_score || 0), 0) / students.length
            : 0;
        const totalParticipation = students.reduce((acc, s) => acc + (s.participation_count || 0), 0);

        return {
            avgAttention: Math.round(avgAttention),
            totalParticipation,
            activeStudents: students.filter(s => s.is_active !== false).length,
            totalStudents: students.length
        };
    }, [studentPresence]);

    return (
        <div className={`min-w-0 space-y-4 ${className}`}>
            {/* Quick Stats */}
            <div className="grid min-w-0 grid-cols-3 gap-2">
                <Card className="border-border bg-background shadow-none">
                    <CardContent className="p-2.5 sm:p-3 flex min-w-0 flex-col gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">Attendance</p>
                            <p className="text-lg font-semibold text-foreground">{stats.activeStudents}/{stats.totalStudents}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border bg-background shadow-none">
                    <CardContent className="p-2.5 sm:p-3 flex min-w-0 flex-col gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                            <Activity className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">Attention</p>
                            <p className="text-lg font-semibold text-foreground">{stats.avgAttention}%</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border bg-background shadow-none">
                    <CardContent className="p-2.5 sm:p-3 flex min-w-0 flex-col gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                            <Sparkles className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                            <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">Quiz</p>
                            <p className="truncate text-lg font-semibold text-foreground">
                                {quizResults ? `${quizResults.submissions.length} submitted` : 'No Quiz'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {quizResults && quizResults.questionBreakdown.length > 0 && (
                <Card className="border-border bg-background shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            {quizResults.title || 'Live Pop Quiz'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {quizResults.submissions.length > 0 && (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {quizResults.submissions.map((submission) => (
                                    <div key={submission.studentId} className="rounded-lg border border-border bg-subtle p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-semibold text-foreground">{submission.studentName}</span>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {Math.round(submission.score)}% · {submission.correct}/{submission.total}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="space-y-3">
                            {quizResults.questionBreakdown.map((item) => (
                                <div key={item.questionNumber} className="rounded-lg border border-border bg-subtle p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                                        Question {item.questionNumber} · Correct answer {item.correctChoice}
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-foreground">{item.question}</p>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {item.responses.map((response) => (
                                            <div
                                                key={`${item.questionNumber}-${response.studentId}`}
                                                className={`rounded-lg border p-2 text-xs ${
                                                    response.isCorrect
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                                        : 'border-rose-200 bg-rose-50 text-rose-800'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate font-semibold">{response.studentName}</span>
                                                    <span className="font-bold">
                                                        {response.selectedChoice}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
                {/* Attention Timeline */}
                <Card className="border-border bg-background shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Engagement Timeline
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={timelineData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis
                                    dataKey="time"
                                    stroke="#64748b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="#64748b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, 100]}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                                    itemStyle={{ color: '#334155' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="attention"
                                    stroke="#c67b2b"
                                    strokeWidth={3}
                                    dot={false}
                                    animationDuration={1000}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Participation Comparison */}
                <Card className="border-border bg-background shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-amber-600" />
                            Top Participants
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={participationData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    stroke="#64748b"
                                    fontSize={10}
                                    width={80}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                                />
                                <Bar
                                    dataKey="participation"
                                    fill="#c67b2b"
                                    radius={[0, 4, 4, 0]}
                                    barSize={20}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
