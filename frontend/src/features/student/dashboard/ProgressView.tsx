import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Activity, Star, Brain, BookMarked, Target, TrendingUp, History, FileText, Video } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, PieChart, Pie, Cell, Legend, LineChart, CartesianGrid, XAxis, YAxis, Line } from 'recharts';

interface ProgressViewProps {
  progress: any;
  radarData: any[];
}

export const ProgressView: React.FC<ProgressViewProps> = ({ progress, radarData }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">My Progress</h2>
      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="p-6 text-center"><Trophy className="w-12 h-12 mx-auto mb-4 text-primary" /><p className="text-3xl font-bold">{progress?.summary?.total_time_spent || 0}</p><p className="text-muted-foreground">Minutes Studied</p></CardContent></Card>
        <Card><CardContent className="p-6 text-center"><Activity className="w-12 h-12 mx-auto mb-4 text-primary" /><p className="text-3xl font-bold">{progress?.summary?.total_quizzes || 0}</p><p className="text-muted-foreground">Quizzes Completed</p></CardContent></Card>
        <Card><CardContent className="p-6 text-center"><Star className="w-12 h-12 mx-auto mb-4 text-primary" /><p className="text-3xl font-bold">{progress?.summary?.average_score ? Math.round(progress.summary.average_score) : 0}%</p><p className="text-muted-foreground">Average Score</p></CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="w-5 h-5 text-teal-600" /> Mastery Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    <Radar
                      name="Proficiency"
                      dataKey="proficiency"
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      fillOpacity={0.6}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Brain className="w-12 h-12 opacity-20 mb-2" />
                  <p>Complete more lessons to see your mastery map</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-emerald-600" /> Subject Focus
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {progress?.chart_data && progress.chart_data.labels?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(progress?.chart_data?.labels || []).map((l: string, i: number) => ({ name: l, value: progress?.chart_data?.scores?.[i] || 0 }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {(progress?.chart_data?.labels || []).map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={['#0d9488', '#8b5cf6', '#f59e0b', '#ef4444'][index % 4]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Target className="w-12 h-12 opacity-20 mb-2" />
                  <p>Start learning to see your focus areas</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-600" /> Score Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {progress?.chart_data && progress.chart_data.scores?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(progress?.chart_data?.labels || []).map((l: string, i: number) => ({ date: l, score: progress?.chart_data?.scores?.[i] || 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Activity className="w-12 h-12 opacity-20 mb-2" />
                  <p>No test data available yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-teal-600" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(progress?.recent_activities || []).length > 0 ? (
                (progress?.recent_activities || []).map((act: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${act.type === 'quiz' ? 'bg-teal-100 text-teal-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                        {act.type === 'quiz' ? <FileText className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold truncate max-w-[150px]">{act.name || (act.type === 'quiz' ? 'Mastery Test' : 'Live Class')}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-black">{new Date(act.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {act.score !== null && (
                      <Badge className={act.score >= 70 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
                        {Math.round(act.score)}%
                      </Badge>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center py-12 text-muted-foreground italic">No recent activity found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
