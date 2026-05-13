import React, { useState, useEffect } from 'react';
import { Video, Loader2, Mic, Zap, Trash2, FileText, ListChecks, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { sessionAPI } from '@/services/api';
import type { Session } from '@/types';
import AcademicMarkdown from '@/components/AcademicMarkdown';

interface TeacherSessionsViewProps {
  onStart: (id: string, title: string, status?: string) => void;
  onDelete: (sessionId: string) => Promise<void>;
}

export const TeacherSessionsView = ({ onStart, onDelete }: TeacherSessionsViewProps) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [prepSession, setPrepSession] = useState<Session | null>(null);

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

  const toList = (value: any): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (typeof value === 'string') return value.split('\n').map((item) => item.replace(/^[-*\d.]\s*/, '').trim()).filter(Boolean);
    return [];
  };

  const prepMaterial = prepSession?.context?.lesson_materials;
  const prepOutline = toList(prepSession?.session_outline || prepMaterial?.outline);
  const prepClassNote = prepSession?.class_notes || prepMaterial?.class_note;
  const prepAssignment = prepSession?.take_home_assignment || prepMaterial?.assignment;
  const prepQuiz = prepSession?.pre_session_quiz?.questions || prepMaterial?.pop_quiz || [];
  const prepTips = toList(prepSession?.context?.teacher_tips || prepMaterial?.teacher_tips);

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
                {(session.session_outline || session.class_notes || session.context?.lesson_materials) && (
                  <div className="mb-4 space-y-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-primary">
                    <p>Prep ready: outline, class note, quiz, and assignment saved for review.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-md border-primary/25 bg-background text-primary hover:bg-primary/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrepSession(session);
                      }}
                    >
                      <FileText className="mr-2 h-3.5 w-3.5" />
                      Review Prep
                    </Button>
                  </div>
                )}

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

      <Dialog open={Boolean(prepSession)} onOpenChange={(open) => !open && setPrepSession(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b p-5">
            <DialogTitle className="text-xl">Teacher Preparation Pack</DialogTitle>
            <DialogDescription>
              {prepSession?.context?.subject || 'Subject'} - {prepSession?.context?.topic || prepSession?.title || 'Session'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[72vh] px-5 py-4">
            <div className="space-y-5 pb-4">
              <section className="rounded-lg border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ListChecks className="h-4 w-4 text-primary" />
                  Lesson outline
                </h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  {prepOutline.length ? prepOutline.map((item, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-primary">{index + 1}.</span>
                      <span>{item}</span>
                    </li>
                  )) : <li>No outline has been generated yet.</li>}
                </ol>
              </section>

              <section className="rounded-lg border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-primary" />
                  Class note
                </h3>
                <AcademicMarkdown>
                  {prepClassNote?.content || 'No class note has been generated yet.'}
                </AcademicMarkdown>
              </section>

              <section className="rounded-lg border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  Checks and assignment
                </h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>{prepQuiz.length} pre-session question{prepQuiz.length === 1 ? '' : 's'} prepared.</p>
                  {prepAssignment ? (
                    <div>
                      <p className="font-medium text-foreground">{prepAssignment.title || 'Take-home assignment'}</p>
                      {prepAssignment.instructions && <p>{prepAssignment.instructions}</p>}
                      {Array.isArray(prepAssignment.tasks) && prepAssignment.tasks.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {prepAssignment.tasks.map((task: string, index: number) => <li key={index}>{task}</li>)}
                        </ul>
                      )}
                    </div>
                  ) : <p>No take-home assignment has been generated yet.</p>}
                  {prepTips.length > 0 && (
                    <div>
                      <p className="font-medium text-foreground">Teacher tips</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {prepTips.map((tip, index) => <li key={index}>{tip}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
