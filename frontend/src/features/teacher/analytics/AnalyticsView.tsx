import React, { useMemo, useState, useEffect } from 'react';
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
      const data = await teacherAPI.getMyStudents({ summary: true });
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
        title: 'Build your roster',
        description: 'Add students to your classes so EduNexus can start building useful learning signals.',
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
        title: 'Closer support needed',
        description: `${lowProficiency.length} student(s) are performing below 60% average. Extra revision or follow-up is recommended.`,
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
        title: 'Shared learning pattern',
        description: `Most students (${topStyle[1]}) prefer ${topStyle[0]} learning. EduNexus can lean into that when shaping explanations and support.`,
      });
    }

    return insights;
  };

  const analyticsBrief = useMemo(() => ({
    rosterCount: students.length,
    activeCount: students.filter(s => s.education_level).length,
    lowSupportCount: students.filter(s => {
      const prof = Object.values(s.subject_proficiency || {}).map(v => Number(v));
      return prof.length > 0 && (prof.reduce((a, b) => a + b, 0) / prof.length) < 0.6;
    }).length,
  }), [students]);

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'success': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'info': return <Brain className="w-5 h-5 text-primary" />;
      default: return <Sparkles className="w-5 h-5 text-primary" />;
    }
  };

  const getInsightStyles = (type: string) => {
    switch (type) {
      case 'warning': return 'border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/20';
      case 'success': return 'border-primary/20 bg-primary/5';
      default: return 'border-border bg-subtle';
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Learning Analytics</h2>
          <p className="text-sm text-muted-foreground">Track learner patterns, spot support needs, and use AI signals with good teaching judgment.</p>
        </div>
        <Button variant="outline" onClick={loadAnalytics} className="gap-2">
          <Repeat className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Data
        </Button>
      </div>

      <Card className="rounded-lg border border-border bg-background shadow-none">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.25fr_1fr]">
          <div className="space-y-2">
            <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 px-3 py-1 text-primary">
              Analytics brief
            </Badge>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-foreground">What to look for here</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                This workspace helps you spot which learners are steady, which ones are slipping, and where your next follow-up will matter most.
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-subtle p-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roster in view</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{analyticsBrief.rosterCount}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Learners needing closer support</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{analyticsBrief.lowSupportCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: students.length, icon: Users },
          { label: 'Active Students', value: students.filter(s => s.education_level).length, icon: Activity },
          { label: 'Avg. Proficiency', value: `${calculateAvgProficiency()}%`, icon: TrendingUp },
          { label: 'AI Insights', value: aiInsights.length, icon: Brain },
        ].map((stat, i) => (
          <Card key={i} className="rounded-lg border border-border bg-background shadow-none overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                </div>
                <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-lg border border-border shadow-none overflow-hidden">
            <CardHeader className="border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Student Performance Roster</CardTitle>
                <div className="relative w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search students..." className="h-9 rounded-full border-border bg-background pl-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Preparing learner signals...</p>
                  </div>
                ) : students.length === 0 ? (
                  <div className="px-8 py-20 text-center">
                    <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/35" />
                    <p className="text-muted-foreground">No students found. Start by adding students to your roster.</p>
                    <Button variant="outline" className="mt-4" onClick={() => onNavigate?.('students')}>Add Students</Button>
                  </div>
                ) : (
                  <div className="divide-y text-foreground">
                    {students.map((student) => (
                      <div
                        key={student.id}
                        className={`p-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer ${selectedStudent?.id === student.id ? 'bg-primary/10' : ''}`}
                        onClick={() => loadStudentDetails(student)}
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10 border border-primary/20 shadow-sm">
                            <AvatarImage src={student.avatar_url} alt={student.full_name} />
                            <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                              {student.full_name?.[0] || 'S'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{student.full_name}</p>
                            <p className="text-xs text-muted-foreground">{student.education_level?.replace('_', ' ').toUpperCase() || 'GENERAL'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                              <Badge variant="outline" className="mb-1 font-mono text-[10px] border-primary/20 bg-primary/5 text-primary">
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
                                    <div className="w-24 h-1.5 overflow-hidden rounded-full bg-secondary">
                                      <div className={`h-full ${avg >= 70 ? 'bg-emerald-500' : avg >= 40 ? 'bg-amber-500' : 'bg-red-500'} rounded-full`} style={{ width: `${avg}%` }} />
                                    </div>
                                    <span className="text-xs font-medium">{avg}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          <ChevronRight className={`w-5 h-5 transition-transform ${selectedStudent?.id === student.id ? 'rotate-90 text-primary' : 'text-muted-foreground/50'}`} />
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
          <Card className="rounded-lg border border-border shadow-none bg-card overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-md flex items-center gap-2">
                <Brain className="w-5 h-5" />
                AI learning insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiInsights.map((insight, idx) => (
                <div key={idx} className={`p-4 rounded-lg border ${getInsightStyles(insight.type)}`}>
                  <div className="flex gap-3">
                    <div className="mt-0.5">{getInsightIcon(insight.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="mb-1 text-sm font-semibold text-foreground">{insight.title}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{insight.description}</p>
                      {insight.action && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 px-2 text-xs font-semibold text-primary hover:bg-primary/10"
                          onClick={() => insight.handler ? insight.handler() : toast.info('Action pending backend integration')}
                        >
                          {insight.action} {'->'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {selectedStudent && (
            <Card className="rounded-lg border border-border shadow-none animate-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-md">Personalized Profile: {selectedStudent.full_name}</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingDetails ? (
                  <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
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
                            stroke="hsl(var(--primary))"
                            fill="hsl(var(--primary))"
                            fillOpacity={0.6}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-border bg-subtle p-3">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Assimilation</p>
                        <p className="text-sm font-bold text-primary">
                          {studentAnalytics.assimilation_metrics?.level || 'N/A'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-subtle p-3">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Style</p>
                        <p className="text-sm font-bold text-primary capitalize">
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










