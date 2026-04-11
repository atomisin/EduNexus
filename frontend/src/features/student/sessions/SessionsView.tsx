import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Clock, Calendar, Video } from 'lucide-react';

interface SessionsViewProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  upcomingSessions: any[];
  liveSessions: any[];
  handleJoinSession: (session: any) => void;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  searchQuery,
  setSearchQuery,
  upcomingSessions,
  liveSessions,
  handleJoinSession
}) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My Classes</h2>
        <Input placeholder="Search classes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-64" />
      </div>
      <Tabs defaultValue="upcoming">
        <TabsList><TabsTrigger value="upcoming">Upcoming ({upcomingSessions.length})</TabsTrigger><TabsTrigger value="live">Live ({liveSessions.length})</TabsTrigger></TabsList>
        <TabsContent value="upcoming" className="mt-4">
          {upcomingSessions.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingSessions.filter(s => !searchQuery || (s.title || '').toLowerCase().includes(searchQuery.toLowerCase())).map((session) => (
                <Card key={session.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2"><Badge variant="secondary">{session.subject_name || 'General'}</Badge><span className="text-xs text-muted-foreground">{session.duration_minutes || 60} min</span></div>
                    <p className="font-medium mb-1">{session.title || 'Class Session'}</p>
                    <p className="text-xs text-muted-foreground mb-3">{session.topic_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3"><Clock className="w-3 h-3" />{formatDate(session.scheduled_start)}</div>
                    <Button size="sm" className="w-full" variant="outline" onClick={() => handleJoinSession(session)}>Set Reminder</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No upcoming classes</p></div>
          )}
        </TabsContent>
        <TabsContent value="live" className="mt-4">
          {liveSessions.length > 0 ? (
            <div className="space-y-4">
              {liveSessions.map((session) => (
                <Card key={session.id} className="border-teal-200 bg-teal-50 dark:bg-teal-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><div className="w-4 h-4 rounded-full bg-teal-500 animate-pulse" /></div>
                        <div><h3 className="font-semibold">{session.title || 'Live Session'}</h3><p className="text-sm text-muted-foreground">{session.subject_name}</p></div>
                      </div>
                      <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => handleJoinSession(session)}>Join Now</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <div className="text-center py-12 text-muted-foreground"><Video className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No live classes</p></div>}
        </TabsContent>
      </Tabs>
    </div>
  );
};
