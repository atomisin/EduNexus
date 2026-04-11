import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText, CheckCircle, Send, Plus, RefreshCw, X, Calendar, Users, Clock, TrendingUp } from 'lucide-react';
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

  if (loading && reports.length === 0) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Monthly Reports</h2>
          <p className="text-sm text-slate-500">Review AI-generated student progress reports before sending them to parents.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchReports} disabled={loading} size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleGenerateReports} disabled={isGenerating} size="sm" className="bg-teal-600 hover:bg-teal-700">
            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
            Generate Current Month
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reports List */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-base">All Reports</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto max-h-[600px]">
              {reports.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No reports generated yet.</p>
                  <Button variant="link" onClick={handleGenerateReports} className="text-teal-600">
                    Generate now
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {reports.map((report) => (
                    <div 
                      key={report.id}
                      onClick={() => handleSelectReport(report)}
                      className={`p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${selectedReport?.id === report.id ? 'bg-primary/5 dark:bg-primary/10 border-l-4 border-primary' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium">{report.student_name}</div>
                        {getStatusBadge(report.status)}
                      </div>
                      <div className="text-xs text-slate-500 flex justify-between">
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
            <Card className="border-t-4 border-t-primary">
              <CardHeader className="flex flex-row items-start justify-between bg-slate-50 dark:bg-slate-900/50">
                <div>
                  <CardTitle>{selectedReport.student_name} - Progress Report</CardTitle>
                  <CardDescription className="mt-1">
                    {getMonthName(selectedReport.month)} {selectedReport.year} Period
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(selectedReport.status)}
                  <div className="text-xs text-slate-500">
                    Parent: {selectedReport.guardian_email || 'Not provided'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                
                {/* Visual indicator of what happened in background */}
                <div className="bg-primary/5 dark:bg-primary/10 p-4 rounded-xl border border-primary/10 dark:border-primary/20">
                    <h4 className="flex items-center gap-2 font-medium text-primary mb-2">
                    <CheckCircle className="w-4 h-4" /> AI Generated Content Ready
                  </h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    The system has compiled all session data, attendance, quiz scores, and portal engagement metrics for this month into a beautiful HTML email format ready to send.
                  </p>
                </div>

                {/* Session Stats Cards */}
                {selectedReport.report_data && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wide">Sessions</span>
                      </div>
                      <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {selectedReport.report_data.total_sessions}
                      </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-medium uppercase tracking-wide">Total Minutes</span>
                      </div>
                      <div className="text-2xl font-bold text-slate-700 dark:text-slate-200">
                        {selectedReport.report_data.total_duration_minutes}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wide">Attendance</span>
                      </div>
                      <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                        {selectedReport.report_data.avg_attendance}%
                      </div>
                    </div>
                  </div>
                )}

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
                    These notes will be appended to the bottom of the AI-generated report summary that the parent receives. Use this to add personal touches or specific behavioral observations.
                  </p>
                  <Textarea
                    placeholder="Add your personal notes to the parent here..."
                    className="min-h-[120px] resize-y"
                    value={teacherNotes}
                    onChange={(e) => setTeacherNotes(e.target.value)}
                    disabled={selectedReport.status === 'sent'}
                  />
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  {selectedReport.status === 'generated' || selectedReport.status === 'approved' ? (
                    <Button 
                      className="flex-1 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
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
            <div className="h-full flex flex-col items-center justify-center p-12 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No Report Selected</p>
              <p className="text-sm mt-2 text-center max-w-sm">Select a student report from the list on the left to review metrics, add notes, and send to parents.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
