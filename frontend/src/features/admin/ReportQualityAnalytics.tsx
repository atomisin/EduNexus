import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { adminAPI } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, ShieldCheck, FileText, BookOpenCheck } from 'lucide-react';
import { toast } from 'sonner';

interface QualitySummary {
  reports_analyzed: number;
  validated_assessments: number;
  fallback_assessments: number;
  fallback_share_pct: number;
}

interface MonthlyItem {
  month: string;
  reports: number;
  validated_assessments: number;
  fallback_assessments: number;
}

interface SubjectItem {
  subject: string;
  sessions: number;
  validated_assessments: number;
  fallback_assessments: number;
  avg_post_score: number;
}

interface TeacherItem {
  teacher_name: string;
  reports: number;
  validated_assessments: number;
  fallback_assessments: number;
}

interface ReportQualityData {
  summary: QualitySummary;
  monthly_trend: MonthlyItem[];
  subjects: SubjectItem[];
  teachers: TeacherItem[];
}

export const ReportQualityAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState('6');
  const [data, setData] = useState<ReportQualityData | null>(null);

  useEffect(() => {
    fetchData();
  }, [months]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await adminAPI.getReportQualityOverview({ limit_months: parseInt(months, 10) });
      setData(result);
    } catch (error: any) {
      toast.error('Failed to load report quality analytics: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Reviewing assessment quality signals...</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Report Quality Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Track how much of the platform&apos;s learner evidence comes from validated assessments versus safe fallback checks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Range:</span>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Select months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 Months</SelectItem>
              <SelectItem value="6">Last 6 Months</SelectItem>
              <SelectItem value="12">Last 12 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="rounded-lg border border-border bg-background shadow-none">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.2fr_1fr]">
          <div className="space-y-2">
            <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 px-3 py-1 text-primary">
              Quality brief
            </Badge>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-foreground">What these signals mean</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                A high fallback share means the platform is leaning more often on safe backup assessments instead of validated question sets.
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-subtle p-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Validated evidence</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{data.summary.validated_assessments}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fallback share</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{data.summary.fallback_share_pct}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="rounded-lg border-border shadow-none">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> Reports Analysed
            </CardDescription>
            <CardTitle className="text-3xl font-bold">{data.summary.reports_analyzed}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-lg border-border shadow-none">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-primary">
              <ShieldCheck className="w-4 h-4" /> Validated Checks
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-primary">{data.summary.validated_assessments}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-lg border-border shadow-none">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-4 h-4" /> Fallback Checks
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-amber-600">{data.summary.fallback_assessments}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-lg border-border shadow-none">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BookOpenCheck className="w-4 h-4" /> Fallback Share
            </CardDescription>
            <CardTitle className="text-3xl font-bold">{data.summary.fallback_share_pct}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="rounded-lg border-border shadow-none">
        <CardHeader>
          <CardTitle>Monthly Assessment Quality Trend</CardTitle>
          <CardDescription>Validated and fallback checks inside generated monthly reports.</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
              <Legend />
              <Bar dataKey="validated_assessments" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Validated" />
              <Bar dataKey="fallback_assessments" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Fallback" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="rounded-lg border-border shadow-none">
          <CardHeader>
            <CardTitle>Subjects Needing Attention</CardTitle>
            <CardDescription>Subjects with the highest fallback pressure across reports.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.subjects.length ? data.subjects.map((item) => (
                <div key={item.subject} className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.sessions} sessions • Avg post-score {item.avg_post_score}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/15">
                      V {item.validated_assessments}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={
                        item.fallback_assessments > 0
                          ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                      }
                    >
                      F {item.fallback_assessments}
                    </Badge>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-8">No subject-level report quality data yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-none">
          <CardHeader>
            <CardTitle>Teachers to Review</CardTitle>
            <CardDescription>Teachers whose report periods relied most on fallback assessment artifacts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.teachers.length ? data.teachers.map((item) => (
                <div key={item.teacher_name} className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.teacher_name}</div>
                    <div className="text-xs text-muted-foreground">{item.reports} reports analysed</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/15">
                      V {item.validated_assessments}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={
                        item.fallback_assessments > 0
                          ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                      }
                    >
                      F {item.fallback_assessments}
                    </Badge>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-8">No teacher-level report quality data yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReportQualityAnalytics;
