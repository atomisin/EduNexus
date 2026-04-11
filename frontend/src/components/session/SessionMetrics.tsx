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
    quizResults?: { correct: number; total: number; responses: any[] } | null;
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
        <div className={`space-y-6 ${className}`}>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                            <Users className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400">Attendance</p>
                            <p className="text-xl font-bold">{stats.activeStudents}/{stats.totalStudents}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400">Avg. Attention</p>
                            <p className="text-xl font-bold">{stats.avgAttention}%</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400">Quiz Success</p>
                            <p className="text-xl font-bold">
                                {quizResults ? `${quizResults.correct}/${quizResults.total}` : 'No Quiz'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {quizResults && quizResults.responses.length > 0 && (
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                            Live Pop Quiz Results
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {quizResults.responses.map((res: any, idx: number) => (
                                <div key={idx} className={`p-2 rounded-lg border flex flex-col items-center gap-1 ${res.isCorrect ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                                    <span className="text-xs font-medium truncate w-full text-center">{res.studentName}</span>
                                    <span className={`text-sm font-bold ${res.isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>{res.choice}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Attention Timeline */}
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Activity className="w-4 h-4 text-indigo-400" />
                            Engagement Timeline
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={timelineData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
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
                                    contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                                    itemStyle={{ color: '#cbd5e1' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="attention"
                                    stroke="#6366f1"
                                    strokeWidth={3}
                                    dot={false}
                                    animationDuration={1000}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Participation Comparison */}
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-amber-400" />
                            Top Participants
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={participationData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
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
                                    contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                                />
                                <Bar
                                    dataKey="participation"
                                    fill="#f59e0b"
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
