import React, { useState, useEffect } from 'react';
import { Repeat, Users, Activity, TrendingUp, Brain, Search, Loader2, ChevronRight, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { teacherAPI } from '@/services/api';
import { toast } from 'sonner';

interface AnalyticsViewProps {
  onNavigate?: (view: string) => void;
}

export const AnalyticsView = ({ onNavigate }: AnalyticsViewProps) => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [studentAnalytics, setStudentAnalytics] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const data = await teacherAPI.getMyStudents();
      setStudents(data || []);
      setAiInsights(generateAIInsights(data || []));
    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast.error('Failed to load students for analytics');
    } finally {
      setLoading(false);
    }
  };

  const calculateAvgProficiency = () => {
    if (students.length === 0) return 0;
    const allProficiencies = students.flatMap(s => Object.values(s.subject_proficiency || {}) as number[]);
    if (allProficiencies.length === 0) return 0;
    return Math.round((allProficiencies.reduce((a, b) => a + b, 0) / allProficiencies.length) * 100);
  };

  const loadStudentDetails = async (student: any) => {
    setSelectedStudent(student);
    setLoadingDetails(true);
    try {
      const analytics = await teacherAPI.getStudentLearningAnalytics(student.id);
      setStudentAnalytics(analytics);
    } catch (error) {
      console.error('Failed to load student details:', error);
      toast.error('Failed to load detailed analytics');
    } finally {
      setLoadingDetails(false);
    }
  };

  const generateAIInsights = (studentData: any[]) => {
    const insights = [];
    if (studentData.length === 0) {
      insights.push({
        type: 'info',
        title: 'Build Your Roster',
        description: 'Add students to your classes to begin generating AI-powered learning insights.',
        action: 'Add Students',
        handler: () => onNavigate?.('students')
      });
      return insights;
    }

    const lowProficiency = studentData.filter(s => {
      const prof = Object.values(s.subject_proficiency || {}).map(v => Number(v));
      return prof.length > 0 && (prof.reduce((a, b) => a + b, 0) / prof.length) < 0.6;
    });

    if (lowProficiency.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Focus Required',
        description: `${lowProficiency.length} student(s) are performing below 60% average. Personalized revision is recommended.`,
        action: 'Review Scores'
      });
    }

    const styles = studentData.reduce((acc: any, s: any) => {
      const style = s.learning_style || 'Not Set';
      acc[style] = (acc[style] || 0) + 1;
      return acc;
    }, {});

    const topStyle = Object.entries(styles).sort((a: any, b: any) => b[1] - a[1])[0];
    if (topStyle && topStyle[0] !== 'Not Set') {
      insights.push({
        type: 'success',
        title: 'Style Synergy',
        description: `Most students (${topStyle[1]}) prefer ${topStyle[0]} learning. AI is optimizing lesson delivery for this style.`,
      });
    }

    return insights;
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'success': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'info': return <Brain className="w-5 h-5 text-indigo-500" />;
      default: return <Sparkles className="w-5 h-5 text-teal-500" />;
    }
  };

  const getInsightStyles = (type: string) => {
    switch (type) {
      case 'warning': return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800';
      case 'success': return 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800';
      default: return 'bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-teal-800 to-emerald-600 dark:from-white dark:to-teal-400 bg-clip-text text-transparent">
            Learning Analytics
          </h2>
          <p className="text-slate-500 mt-1">Real-time student performance insights and AI recommendations</p>
        </div>
        <Button variant="outline" onClick={loadAnalytics} className="gap-2">
          <Repeat className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Data
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Students', value: students.length, icon: Users, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950/30' },
          { label: 'Active Students', value: students.filter(s => s.education_level).length, icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Avg. Proficiency', value: `${calculateAvgProficiency()}%`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'AI Insights', value: aiInsights.length, icon: Brain, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
        ].map((stat, i) => (
          <Card key={i} className="hover-lift border-0 shadow-sm overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-lg overflow-hidden">
            <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Student Performance Roster</CardTitle>
                <div className="relative w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Search students..." className="pl-9 h-9 rounded-full bg-white dark:bg-slate-800 border-slate-200" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-slate-500 text-sm">Synthesizing analytics...</p>
                  </div>
                ) : students.length === 0 ? (
                  <div className="px-8 py-20 text-center">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No students found. Start by adding students to your roster.</p>
                    <Button variant="outline" className="mt-4" onClick={() => onNavigate?.('students')}>Add Students</Button>
                  </div>
                ) : (
                  <div className="divide-y text-foreground">
                    {students.map((student) => (
                      <div
                        key={student.id}
                        className={`p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${selectedStudent?.id === student.id ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}
                        onClick={() => loadStudentDetails(student)}
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10 border border-indigo-100 shadow-sm">
                            <AvatarImage src={student.avatar_url} alt={student.full_name} />
                            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-teal-500 text-white font-bold">
                              {student.full_name?.[0] || 'S'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{student.full_name}</p>
                            <p className="text-xs text-slate-500">{student.education_level?.replace('_', ' ').toUpperCase() || 'GENERAL'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <Badge variant="outline" className="font-mono text-[10px] mb-1">
                              {student.learning_style || 'ANALYZING...'}
                            </Badge>
                            <div className="flex items-center gap-2">
                              {(() => {
                                const profValues = Object.values(student.subject_proficiency || {}) as number[];
                                const avg = profValues.length > 0 
                                  ? Math.round((profValues.reduce((a, b) => a + Number(b), 0) / profValues.length) * 100)
                                  : 0;
                                return (
                                  <>
                                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div className={`h-full ${avg >= 70 ? 'bg-emerald-500' : avg >= 40 ? 'bg-amber-500' : 'bg-red-500'} rounded-full`} style={{ width: `${avg}%` }} />
                                    </div>
                                    <span className="text-xs font-medium">{avg}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          <ChevronRight className={`w-5 h-5 text-slate-300 transition-transform ${selectedStudent?.id === student.id ? 'rotate-90 text-indigo-500' : ''}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 shadow-lg bg-indigo-900 text-white overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-md flex items-center gap-2">
                <Brain className="w-5 h-5" />
                AI Learning Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiInsights.map((insight, idx) => (
                <div key={idx} className={`p-4 rounded-2xl border ${getInsightStyles(insight.type)}`}>
                  <div className="flex gap-3">
                    <div className="mt-0.5">{getInsightIcon(insight.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">{insight.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{insight.description}</p>
                      {insight.action && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 px-2 text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:bg-white/50"
                          onClick={() => insight.handler ? insight.handler() : toast.info('Action pending backend integration')}
                        >
                          {insight.action} →
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {selectedStudent && (
            <Card className="border-0 shadow-lg animate-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-md">Personalized Profile: {selectedStudent.full_name}</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingDetails ? (
                  <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
                ) : studentAnalytics ? (
                  <div className="space-y-6">
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={
                          Object.entries(studentAnalytics.assimilation_metrics?.subject_breakdown || {}).map(([key, val]) => ({
                            subject: key,
                            A: (val as number) * 100
                          }))
                        }>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
                          <Radar
                            name="Proficiency"
                            dataKey="A"
                            stroke="#6366f1"
                            fill="#6366f1"
                            fillOpacity={0.6}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                        <p className="text-[10px] uppercase text-slate-500 font-bold">Assimilation</p>
                        <p className={`text-sm font-bold text-${studentAnalytics.assimilation_metrics?.color || 'indigo'}-600`}>
                          {studentAnalytics.assimilation_metrics?.level || 'N/A'}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                        <p className="text-[10px] uppercase text-slate-500 font-bold">Style</p>
                        <p className="text-sm font-bold text-indigo-600 capitalize">
                          {studentAnalytics.learning_profile?.learning_style || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Focus Recommendations</p>
                      <div className="flex flex-wrap gap-1">
                        {(studentAnalytics.focus_areas || ['No weaknesses identified']).map((area: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{area}</Badge>
                        ))}
                      </div>
                    </div>

                    <Button className="w-full bg-slate-900 text-white rounded-xl shadow-lg shadow-slate-200">
                      Generate Parent Report
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-4 text-center">Select a student to see AI insights</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
