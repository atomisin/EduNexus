import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Activity, Star, Brain, BookMarked, TrendingUp, History, FileText, Video } from 'lucide-react';
import { MasteryRadar, PerformanceTimeline, EngagementMix } from '../components/PerformanceCharts';

interface ProgressViewProps {
  progress: any;
  radarData: any[];
}

export const ProgressView: React.FC<ProgressViewProps> = ({ progress, radarData }) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Learning Analytics</h2>
          <p className="text-muted-foreground font-medium">Your progress and performance tracked across Edunexus</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-white dark:bg-slate-900 border-slate-200 py-1.5 px-3 rounded-full flex gap-2 items-center">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Tracking</span>
          </Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-teal-500/10 to-transparent backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mx-auto mb-4 border border-teal-200/50">
              <Trophy className="w-6 h-6 text-teal-600" />
            </div>
            <p className="text-4xl font-black text-slate-800 dark:text-white leading-none mb-2 tracking-tighter">
              {progress?.summary?.total_time_spent || 0}
            </p>
            <p className="text-xs font-black uppercase tracking-widest text-teal-700/60 dark:text-teal-400">Minutes Studied</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-violet-500/10 to-transparent backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4 border border-violet-200/50">
              <Activity className="w-6 h-6 text-violet-600" />
            </div>
            <p className="text-4xl font-black text-slate-800 dark:text-white leading-none mb-2 tracking-tighter">
              {progress?.summary?.total_quizzes || 0}
            </p>
            <p className="text-xs font-black uppercase tracking-widest text-violet-700/60 dark:text-violet-400">Quizzes Aced</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-amber-500/10 to-transparent backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4 border border-amber-200/50">
              <Star className="w-6 h-6 text-amber-600" />
            </div>
            <p className="text-4xl font-black text-slate-800 dark:text-white leading-none mb-2 tracking-tighter">
              {progress?.summary?.average_score ? Math.round(progress.summary.average_score) : 0}%
            </p>
            <p className="text-xs font-black uppercase tracking-widest text-amber-700/60 dark:text-amber-400">Total Mastery</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-2xl overflow-hidden group">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
              <Brain className="w-4 h-4 text-teal-600" /> Mastery Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {radarData.length > 0 ? (
              <MasteryRadar data={radarData} />
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <Brain className="w-12 h-12 opacity-10 mb-4 animate-pulse" />
                <p className="font-bold">Analyzing your proficiency...</p>
                <p className="text-xs">Complete more lessons to unlock your mastery map</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-2xl overflow-hidden group">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
              <BookMarked className="w-4 h-4 text-emerald-600" /> Engagement Mix
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {progress?.summary ? (
              <EngagementMix summary={progress.summary} />
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <Activity className="w-12 h-12 opacity-10 mb-4 animate-pulse" />
                <p className="font-bold">Calculating engagement...</p>
                <p className="text-xs">Your activity patterns will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
              <TrendingUp className="w-4 h-4 text-primary" /> Performance Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {progress?.chart_data?.length > 0 ? (
              <PerformanceTimeline data={progress.chart_data} />
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground text-center">
                <div className="w-16 h-1 w-16 bg-slate-100 dark:bg-slate-800 rounded-full mb-4 animate-pulse" />
                <p className="font-bold">No test data available yet</p>
                <p className="text-xs max-w-[200px]">Take your first mastery test to start tracking your performance timeline</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
              <History className="w-4 h-4 text-slate-500" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              {(progress?.recent_activities || []).length > 0 ? (
                (progress?.recent_activities || []).slice(0, 6).map((act: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 transition-all hover:shadow-md hover:scale-[1.01]">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        act.type === 'quiz' ? 'bg-teal-100 text-teal-600' : 'bg-violet-100 text-violet-600'
                      }`}>
                        {act.type === 'quiz' ? <FileText className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-700 dark:text-white leading-tight mb-0.5 truncate max-w-[180px]">
                          {act.name || (act.type === 'quiz' ? 'Mastery Test' : 'Live Class')}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                          {new Date(act.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {act.score !== null && (
                      <div className="text-right">
                        <p className={`text-lg font-black tracking-tighter ${
                          act.score >= 70 ? 'text-emerald-500' : 'text-amber-500'
                        }`}>
                          {Math.round(act.score)}%
                        </p>
                        <p className="text-[8px] uppercase font-black tracking-tighter text-muted-foreground leading-none">Score</p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground italic text-center">
                  <p className="text-sm">No recent activity logged.</p>
                  <p className="text-[10px]">Your learning journey starts today!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

