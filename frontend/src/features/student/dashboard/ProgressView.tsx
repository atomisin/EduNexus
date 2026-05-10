import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Activity, Star, Brain, BookMarked, TrendingUp, History, FileText, Video } from 'lucide-react';
import { MasteryRadar, PerformanceTimeline, EngagementMix } from '../components/PerformanceCharts';

interface ProgressViewProps {
  progress: any;
  radarData: any[];
}

const metricCards = [
  { key: 'time', label: 'Minutes Studied', shortLabel: 'Minutes', icon: Trophy },
  { key: 'quizzes', label: 'Quizzes Taken', shortLabel: 'Quizzes', icon: Activity },
  { key: 'mastery', label: 'Average Mastery', shortLabel: 'Mastery', icon: Star },
];

export const ProgressView: React.FC<ProgressViewProps> = ({ progress, radarData }) => {
  const values: Record<string, string | number> = {
    time: progress?.summary?.total_time_spent || 0,
    quizzes: progress?.summary?.total_quizzes || 0,
    mastery: `${progress?.summary?.average_score ? Math.round(progress.summary.average_score) : 0}%`,
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Learning Analytics</h2>
          <p className="text-sm text-muted-foreground">Progress, mastery, and activity across EduNexus.</p>
        </div>
        <Badge variant="outline" className="w-fit bg-card border-border py-1.5 px-3 rounded-full flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live Tracking</span>
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {metricCards.map(({ key, label, shortLabel, icon: Icon }) => (
          <Card key={key} className="rounded-lg border-border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
                    <span className="sm:hidden">{shortLabel}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </p>
                  <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">{values[key]}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-lg border-border shadow-none bg-primary/5">
        <CardContent className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Recommended next action</p>
            <p className="text-sm text-muted-foreground">
              Complete one guided lesson or mastery quiz to make the analytics more accurate.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit">Updates automatically</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-lg border-border shadow-none overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/30 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> Mastery Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {radarData.length > 0 ? (
              <MasteryRadar data={radarData} />
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground text-center">
                <Brain className="w-10 h-10 opacity-20 mb-3" />
                <p className="font-semibold">No mastery map yet</p>
                <p className="text-xs">Complete more lessons to unlock subject proficiency.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-none overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/30 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-primary" /> Engagement Mix
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {progress?.summary ? (
              <EngagementMix summary={progress.summary} />
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground text-center">
                <Activity className="w-10 h-10 opacity-20 mb-3" />
                <p className="font-semibold">No engagement data yet</p>
                <p className="text-xs">Activity patterns will appear after learning sessions.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-lg border-border shadow-none overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/30 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Performance Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {progress?.chart_data?.length > 0 ? (
              <PerformanceTimeline data={progress.chart_data} />
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground text-center">
                <div className="w-14 h-1 bg-muted rounded-full mb-3" />
                <p className="font-semibold">No test data available yet</p>
                <p className="text-xs max-w-[220px]">Take a mastery test to start tracking performance over time.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-none overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/30 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-primary" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {(progress?.recent_activities || []).length > 0 ? (
                (progress?.recent_activities || []).slice(0, 6).map((act: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                        {act.type === 'quiz' ? <FileText className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate max-w-[220px]">
                          {act.name || (act.type === 'quiz' ? 'Mastery Test' : 'Live Class')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(act.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {act.score !== null && (
                      <div className="text-right shrink-0">
                        <p className={`text-base font-semibold ${act.score >= 70 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {Math.round(act.score)}%
                        </p>
                        <p className="text-[10px] uppercase text-muted-foreground leading-none">Score</p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-center">
                  <p className="text-sm font-medium">No recent activity logged.</p>
                  <p className="text-xs">Your learning activity will appear here.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
