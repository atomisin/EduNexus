import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText, CheckCircle, Send, RefreshCw, Calendar, Users, Clock, TrendingUp, ShieldCheck, AlertTriangle } from 'lucide-react';
import { reportsAPI } from '@/services/api';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface Report {
  id: string;
  student_id: string;
  student_name: string;
  guardian_email: string | null;
  guardian_name?: string | null;
  month: number;
  year: number;
  status: string;
  teacher_notes: string | null;
  created_at: string;
  report_data?: ReportData;
}

interface ReportData {
  total_sessions: number;
  total_duration_minutes: number;
  avg_attendance: number;
  avg_participation: number;
  quality_score: number;
  competency_overview?: Array<{
    domain_name: string;
    course_name: string;
    sessions_count: number;
    avg_post_score: number;
    validated_assessments: number;
    fallback_assessments: number;
    practice_consistency_pct: number;
    readiness: string;
    milestone_readiness: string;
    skills_focus?: string[];
    current_gaps?: string[];
    next_focus?: string[];
    teacher_signals?: string[];
  }>;
  quiz_performance?: {
    total_quizzes: number;
    avg_pre_score: number;
    avg_post_score: number;
    avg_improvement: number;
    validated_assessment_total: number;
    quiz_results?: Array<{
      date: string | null;
      subject: string;
      pre_score: number;
      post_score: number;
      live_pop_score?: number | null;
      validated_assessments?: number;
      improvement: number;
    }>;
    by_subject?: Array<{
      subject: string;
      sessions_count: number;
      pre_score_avg: number;
      post_score_avg: number;
      live_pop_avg: number;
      improvement: number;
      validated_assessments: number;
      fallback_assessments: number;
      sessions?: Array<{
        date: string | null;
        topic: string | null;
        pre_score: number;
        post_score: number;
        live_pop_score?: number | null;
        improvement: number;
      }>;
    }>;
  };
  charts?: {
    attendance_timeline?: Array<{date: string; value: number}>;
    participation_timeline?: Array<{date: string; value: number}>;
    quiz_timeline?: Array<{date: string; pre: number; post: number}>;
    session_breakdown?: Array<{label: string; value: number}>;
  };
  student?: {
    name: string;
    email: string;
  };
}

interface TeacherReportsProps {
  onNavigate?: (view: string) => void;
}

export const TeacherReports: React.FC<TeacherReportsProps> = ({ onNavigate }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [teacherNotes, setTeacherNotes] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await reportsAPI.getAll();
      setReports(data || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleGenerateReports = async () => {
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const currentYear = new Date().getFullYear();
    
    setIsGenerating(true);
    try {
      const resp = await reportsAPI.generate({ month: currentMonth, year: currentYear });
      toast.success(resp.message || `Generated reports for ${currentMonth}/${currentYear}`);
      fetchReports();
    } catch (error: any) {
      toast.error('Failed to generate reports: ' + (error.message || 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectReport = async (report: Report) => {
    try {
      const detail = await reportsAPI.getDetail(report.id);
      setSelectedReport(detail);
      setTeacherNotes(detail.teacher_notes || '');
    } catch (error) {
      console.error('Failed to load report details:', error);
      setSelectedReport(report);
      setTeacherNotes(report.teacher_notes || '');
    }
  };

  const handleApprove = async () => {
    if (!selectedReport) return;
    setIsApproving(true);
    try {
      await reportsAPI.approve(selectedReport.id, { teacher_notes: teacherNotes });
      toast.success('Report approved with your notes');
      setSelectedReport({ ...selectedReport, status: 'approved', teacher_notes: teacherNotes });
      fetchReports();
    } catch (error: any) {
      toast.error('Failed to approve report: ' + (error.message || 'Unknown error'));
    } finally {
      setIsApproving(false);
    }
  };

  const handleSend = async () => {
    if (!selectedReport) return;
    setIsSending(true);
    try {
      await reportsAPI.send(selectedReport.id);
      toast.success('Report sent to guardian successfully');
      setSelectedReport({ ...selectedReport, status: 'sent' });
      fetchReports();
    } catch (error: any) {
      toast.error('Failed to send report: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'generated': return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">Needs Review</Badge>;
      case 'approved': return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">Approved</Badge>;
      case 'sent': return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400">Sent to Guardian</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMonthName = (monthNum: number) => {
    const date = new Date(2000, monthNum - 1, 1);
    return date.toLocaleString('default', { month: 'long' });
  };

  const getFallbackAssessmentTotal = (reportData?: ReportData) =>
    reportData?.quiz_performance?.by_subject?.reduce(
      (sum, item) => sum + (item.fallback_assessments || 0),
      0
    ) || 0;

  if (loading && reports.length === 0) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Monthly Reports</h2>
          <p className="text-sm text-muted-foreground">Review the month&apos;s learning evidence, add your note, and send a calmer summary to families.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={fetchReports} disabled={loading} size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleGenerateReports} disabled={isGenerating} size="sm" className="bg-primary hover:bg-primary/90">
            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
            Generate Current Month
          </Button>
        </div>
      </div>

      <Card className="rounded-lg border border-border bg-background shadow-none">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.25fr_1fr]">
          <div className="space-y-2">
            <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 px-3 py-1 text-primary">
              Reporting brief
            </Badge>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-foreground">What this review is for</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Each report combines session attendance, validated checks, and monthly learner signals into one parent-ready summary.
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-subtle p-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reports ready</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{reports.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waiting review</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{reports.filter((report) => report.status === 'generated').length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Reports List */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="rounded-lg border-border bg-background shadow-none">
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-base">All Reports</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto max-h-[600px]">
              {reports.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No reports generated yet.</p>
                  <Button variant="link" onClick={handleGenerateReports} className="text-primary">
                    Generate now
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {reports.map((report) => (
                    <div 
                      key={report.id}
                      onClick={() => handleSelectReport(report)}
                      className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${selectedReport?.id === report.id ? 'bg-primary/5 dark:bg-primary/10 border-l-4 border-primary' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium">{report.student_name}</div>
                        {getStatusBadge(report.status)}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{getMonthName(report.month)} {report.year}</span>
                        <span>{new Date(report.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Report Review Panel */}
        <div className="lg:col-span-2">
          {selectedReport ? (
            <Card className="rounded-lg border border-border shadow-none">
              <CardHeader className="flex flex-row items-start justify-between bg-muted/30 border-b border-border">
                <div>
                  <CardTitle>{selectedReport.student_name} - Progress Report</CardTitle>
                  <CardDescription className="mt-1">
                    {getMonthName(selectedReport.month)} {selectedReport.year} Period
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(selectedReport.status)}
                  <div className="text-xs text-muted-foreground">
                    Parent: {selectedReport.guardian_name || 'Name not provided'}
                    {selectedReport.guardian_email ? ` • ${selectedReport.guardian_email}` : ' • Email not provided'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-5 sm:space-y-6">
                
                {/* Visual indicator of what happened in background */}
                <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
                    <h4 className="flex items-center gap-2 font-medium text-primary mb-2">
                    <CheckCircle className="w-4 h-4" /> AI Generated Content Ready
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    EduNexus has compiled this month's session data, attendance, quiz evidence, and engagement signals into a report that is ready for your review.
                  </p>
                </div>

                {/* Session Stats Cards */}
                {selectedReport.report_data && (
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4 mb-6">
                    <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Sessions</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-semibold text-foreground">
                        {selectedReport.report_data.total_sessions}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-primary" />
                        <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Minutes</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-semibold text-foreground">
                        {selectedReport.report_data.total_duration_minutes}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Attendance</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-semibold text-foreground">
                        {selectedReport.report_data.avg_attendance}%
                      </div>
                    </div>
                    <div className="bg-primary/5 p-3 sm:p-4 rounded-lg border border-primary/15">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        <span className="text-[10px] sm:text-xs text-primary font-medium uppercase tracking-wide">Validated Checks</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-bold text-primary">
                        {selectedReport.report_data.quiz_performance?.validated_assessment_total || 0}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-primary" />
                        <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Fallback Checks</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-semibold text-foreground">
                        {getFallbackAssessmentTotal(selectedReport.report_data)}
                      </div>
                    </div>
                  </div>
                )}

                {selectedReport.report_data?.quiz_performance?.by_subject?.length ? (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Assessment Quality
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        This shows how much of the month&apos;s quiz evidence came from validated assessments versus the safe fallback path.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[minmax(0,1.5fr)_88px_88px_88px] gap-3 bg-muted/40 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <span>Subject</span>
                        <span className="text-center">Sessions</span>
                        <span className="text-center">Validated</span>
                        <span className="text-center">Fallback</span>
                      </div>
                      <div className="divide-y divide-border">
                        {selectedReport.report_data.quiz_performance.by_subject.map((item) => (
                          <div
                            key={item.subject}
                            className="grid grid-cols-[minmax(0,1.5fr)_88px_88px_88px] gap-3 px-4 py-3 items-center"
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate">{item.subject}</div>
                              <div className="text-xs text-muted-foreground">
                                Post-score avg {item.post_score_avg}%
                                {item.live_pop_avg > 0 ? ` • Live quiz ${item.live_pop_avg}%` : ''}
                              </div>
                            </div>
                            <div className="text-center text-sm text-muted-foreground">{item.sessions_count}</div>
                            <div className="flex justify-center">
                              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/15 min-w-[56px] justify-center">
                                {item.validated_assessments}
                              </Badge>
                            </div>
                            <div className="flex justify-center">
                              <Badge
                                variant="secondary"
                                className={
                                  item.fallback_assessments > 0
                                    ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 min-w-[56px] justify-center'
                                    : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 min-w-[56px] justify-center'
                                }
                              >
                                {item.fallback_assessments}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {selectedReport.report_data?.competency_overview?.length ? (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Competency Growth
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        For blueprint-aware and professional tracks, this shows domain strength, practice consistency, current gaps, and readiness for milestone work.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {selectedReport.report_data.competency_overview.map((domain) => (
                        <div key={domain.domain_name} className="rounded-lg border border-border p-4 space-y-3">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="font-medium">{domain.domain_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {domain.course_name} • {domain.sessions_count} session{domain.sessions_count === 1 ? '' : 's'}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={
                                  domain.readiness === 'Strong'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                                    : domain.readiness === 'Developing'
                                      ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
                                      : 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800'
                                }
                              >
                                {domain.readiness}
                              </Badge>
                              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/15">
                                {domain.milestone_readiness}
                              </Badge>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            <div className="rounded-md border border-border px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Post-score</div>
                              <div className="text-lg font-semibold">{domain.avg_post_score}%</div>
                            </div>
                            <div className="rounded-md border border-border px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Practice consistency</div>
                              <div className="text-lg font-semibold">{domain.practice_consistency_pct}%</div>
                            </div>
                            <div className="rounded-md border border-border px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Validated</div>
                              <div className="text-lg font-semibold text-primary">{domain.validated_assessments}</div>
                            </div>
                            <div className="rounded-md border border-border px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Fallback</div>
                              <div className="text-lg font-semibold text-amber-600">{domain.fallback_assessments}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 text-sm">
                            <div>
                              <div className="font-medium mb-1">Skills Focus</div>
                              {domain.skills_focus?.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {domain.skills_focus.map((skill) => (
                                    <Badge key={skill} variant="outline" className="text-xs">{skill}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-muted-foreground text-xs">No explicit skill focus recorded yet.</p>
                              )}
                            </div>
                            <div>
                              <div className="font-medium mb-1">Current Gaps</div>
                              {domain.current_gaps?.length ? (
                                <ul className="space-y-1 text-xs text-muted-foreground">
                                  {domain.current_gaps.map((gap) => (
                                    <li key={gap}>- {gap}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-muted-foreground text-xs">No major gaps were flagged in this period.</p>
                              )}
                            </div>
                            <div>
                              <div className="font-medium mb-1">Next Focus</div>
                              {domain.next_focus?.length ? (
                                <ul className="space-y-1 text-xs text-muted-foreground">
                                  {domain.next_focus.map((focus) => (
                                    <li key={focus}>- {focus}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-muted-foreground text-xs">No next focus has been recorded yet.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Charts Section */}
                {selectedReport.report_data?.charts && (
                  <div className="space-y-6">
                    {/* Attendance & Participation Timeline */}
                    {selectedReport.report_data.charts.attendance_timeline?.length ? (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Attendance & Participation Over Time
                        </h3>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={selectedReport.report_data.charts.attendance_timeline}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{fontSize: 11}} stroke="hsl(var(--muted-foreground))" />
                            <YAxis tick={{fontSize: 11}} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                            <Tooltip contentStyle={{backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))'}} />
                            <Legend />
                            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{fill: 'hsl(var(--primary))'}} name="Attendance %" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Attendance & Participation Over Time
                        </h3>
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No attendance data available yet for this period
                        </p>
                      </div>
                    )}

                    {/* Quiz Scores Over Time */}
                    {selectedReport.report_data.charts.quiz_timeline?.length ? (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Quiz Performance Over Time
                        </h3>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={selectedReport.report_data.charts.quiz_timeline}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{fontSize: 11}} stroke="hsl(var(--muted-foreground))" />
                            <YAxis tick={{fontSize: 11}} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                            <Tooltip contentStyle={{backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))'}} />
                            <Legend />
                            <Line type="monotone" dataKey="pre" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="5 5" name="Pre-Score" />
                            <Line type="monotone" dataKey="post" stroke="hsl(var(--primary))" strokeWidth={2} dot={{fill: 'hsl(var(--primary))'}} name="Post-Score" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Quiz Performance Over Time
                        </h3>
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No quiz data available yet for this period
                        </p>
                      </div>
                    )}

                    {/* Session Breakdown Bar Chart */}
                    {selectedReport.report_data.charts.session_breakdown?.length ? (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Performance Metrics
                        </h3>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={selectedReport.report_data.charts.session_breakdown} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis type="number" tick={{fontSize: 11}} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                            <YAxis type="category" dataKey="label" tick={{fontSize: 11}} stroke="hsl(var(--muted-foreground))" width={100} />
                            <Tooltip contentStyle={{backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))'}} />
                            <Bar dataKey="value" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Performance Metrics
                        </h3>
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No performance data available yet for this period
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Your Additional Notes (Optional)
                  </label>
                  <p className="text-xs text-slate-500">
                    These notes will appear beneath the main report summary. Use them for personal context, encouragement, or important observations.
                  </p>
                  <Textarea
                    placeholder="Add your note to the family here..."
                    className="min-h-[120px] resize-y"
                    value={teacherNotes}
                    onChange={(e) => setTeacherNotes(e.target.value)}
                    disabled={selectedReport.status === 'sent'}
                  />
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  {selectedReport.status === 'generated' || selectedReport.status === 'approved' ? (
                    <Button 
                    className="flex-1 bg-background hover:bg-muted text-foreground border border-border"
                      onClick={handleApprove}
                      disabled={isApproving}
                    >
                      {isApproving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                      {selectedReport.status === 'approved' ? 'Update Notes' : 'Approve Report'}
                    </Button>
                  ) : null}

                  <Button 
                    className={`flex-1 bg-primary hover:bg-primary/90 text-primary-foreground ${!selectedReport.guardian_email || selectedReport.status === 'generated' || selectedReport.status === 'sent' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleSend}
                    disabled={isSending || !selectedReport.guardian_email || selectedReport.status === 'generated' || selectedReport.status === 'sent'}
                    title={!selectedReport.guardian_email ? "No guardian email set for this student" : selectedReport.status === 'generated' ? "Approve the report first" : ""}
                  >
                    {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    {selectedReport.status === 'sent' ? 'Already Sent' : 'Send to Parent'}
                  </Button>
                </div>
                
                {selectedReport.status === 'generated' && selectedReport.guardian_email && (
                  <p className="text-xs text-amber-600 text-center font-medium">
                    Review and approve below before sending.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No Report Selected</p>
              <p className="text-sm mt-2 text-center max-w-sm">Select a student report from the list to review the evidence, add your note, and send it to the family.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};





