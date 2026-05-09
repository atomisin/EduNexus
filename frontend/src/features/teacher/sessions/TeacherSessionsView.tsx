import React, { useState, useEffect } from 'react';
import { Video, Loader2, Mic, Zap, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { sessionAPI } from '@/services/api';
import type { Session } from '@/types';

interface TeacherSessionsViewProps {
  onStart: (id: string, title: string, status?: string) => void;
  onDelete: (sessionId: string) => Promise<void>;
}

export const TeacherSessionsView = ({ onStart, onDelete }: TeacherSessionsViewProps) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const data = await sessionAPI.list();
        const allSessions = Array.isArray(data) ? data : (data.sessions || []);
        setSessions(allSessions.filter((s: any) => s.status !== 'ended'));
      } catch (error) {
        console.error('Failed to load sessions:', error);
      } finally {
        setLoading(false);
      }
    };
    loadSessions();
  }, []);

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : sessions.length === 0 ? (
          <Card className="col-span-full rounded-lg p-12 text-center text-muted-foreground border-dashed border-2 bg-transparent">
            <Video className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium">No sessions scheduled.</p>
          </Card>
        ) : (
          sessions.map(session => (
            <Card key={session.id} className="rounded-lg overflow-hidden border border-border shadow-none group bg-card">
              <div className={`h-1 w-full ${session.status === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-primary'}`} />
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <Badge variant="outline" className={session.status === 'live' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 border-slate-200'}>
                    {session.status?.toUpperCase() || 'SCHEDULED'}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">{session.scheduled_start ? new Date(session.scheduled_start).toLocaleTimeString() : 'NOT SET'}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                      onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors line-clamp-1">{session.context?.subject || 'Session'}</h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-1">{session.context?.topic || 'General Session'}</p>

                <Button
                  onClick={() => onStart(session.id || '', session.context?.subject || 'Session', session.status)}
                  className="w-full rounded-lg gap-2 font-semibold transition-all"
                  variant={session.status === 'live' ? 'default' : 'outline'}
                >
                  {session.status === 'live' ? <><Mic className="w-4 h-4" /> RE-ENTER ROOM</> : <><Zap className="w-4 h-4" /> GO LIVE NOW</>}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
