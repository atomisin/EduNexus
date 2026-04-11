import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Target, Eye, Video, Calendar, Clock } from 'lucide-react';
import { StatsCards } from './StatsCards';

interface DashboardHomeProps {
  profile: any;
  energy: number;
  getLearningStyleLabel: (style?: string) => { label: string; desc: string };
  setActiveView: (view: any) => void;
  loading: boolean;
  liveSessions: any[];
  upcomingSessions: any[];
  handleJoinSession: (session: any) => void;
  formatDate: (dateStr?: string) => string;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  profile,
  energy,
  getLearningStyleLabel,
  setActiveView,
  loading,
  liveSessions,
  upcomingSessions,
  handleJoinSession,
  formatDate
}) => {
  return (
    <div className="space-y-6">
      <StatsCards profile={profile} energy={energy} />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-5 h-5" />My Learning Profile</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-secondary rounded-xl">
                <Eye className="w-5 h-5 text-primary" />
                <div><p className="font-medium">{getLearningStyleLabel(profile?.learning_style).label}</p><p className="text-xs text-muted-foreground">{getLearningStyleLabel(profile?.learning_style).desc}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-subtle rounded-xl text-center"><p className="text-lg font-bold">{profile?.best_study_time || 'Not set'}</p><p className="text-xs text-muted-foreground">Best Time</p></div>
                <div className="p-3 bg-subtle rounded-xl text-center"><p className="text-lg font-bold">{profile?.attention_span_minutes || 30} min</p><p className="text-xs text-muted-foreground">Focus Span</p></div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setActiveView('profile')}>Complete Profile</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Video className="w-5 h-5" />Live Classes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : liveSessions.length > 0 ? (
              <div className="space-y-3">
                {liveSessions.slice(0, 3).map((session, i) => (
                  <div key={session.id || i} className="flex items-center justify-between p-4 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><div className="w-3 h-3 rounded-full bg-teal-500 animate-pulse" /></div>
                      <div><p className="font-medium">{session.title || 'Live Session'}</p><p className="text-xs text-muted-foreground">{session.subject_name}</p></div>
                    </div>
                    <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => handleJoinSession(session)}>Join Now</Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground"><Video className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No live classes right now</p></div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />Upcoming Classes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : upcomingSessions.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingSessions.slice(0, 6).map((session) => (
                <div key={session.id} className="p-4 border rounded-xl">
                  <div className="flex items-start justify-between mb-2"><Badge variant="secondary">{session.subject_name || 'General'}</Badge><span className="text-xs text-muted-foreground">{session.duration_minutes || 60} min</span></div>
                  <p className="font-medium mb-1">{session.title || 'Class Session'}</p>
                  <p className="text-xs text-muted-foreground mb-3">{session.topic_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3"><Clock className="w-3 h-3" />{formatDate(session.scheduled_start)}</div>
                  <Button size="sm" className="w-full" variant="outline" onClick={() => handleJoinSession(session)}>Set Reminder</Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No upcoming classes</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
