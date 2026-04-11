import { useState } from 'react';
import { Video, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LiveSessionRoom } from '@/components/session/LiveSessionRoom';

import { sessionAPI } from '@/services/api';

interface StudentJoinPageProps {
  onBack: () => void;
}

export const StudentJoinPage = ({ onBack }: StudentJoinPageProps) => {
  const [accessCode, setAccessCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [joined, setJoined] = useState(false);
  const [activeSession, setActiveSession] = useState<{ id: string; title: string; isTeacher: boolean } | null>(null);

  const verifyCode = async () => {
    if (!accessCode.trim()) {
      setError('Please enter a session code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await sessionAPI.verifyCode(accessCode.trim().toUpperCase());
      setSessionInfo(data.session);
    } catch (err: any) {
      setError(err.message || 'Failed to verify code. Please try again.');
      setSessionInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const joinSession = async () => {
    if (!studentName.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await sessionAPI.joinByCode({ 
        access_code: accessCode.trim().toUpperCase(), 
        student_name: studentName.trim() 
      });
      setJoined(true);
      setActiveSession({ id: data.session.id, title: data.session.title, isTeacher: false });
    } catch (err: any) {
      setError(err.message || 'Failed to join session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (joined && activeSession) {
    return (
      <LiveSessionRoom
        sessionId={activeSession.id}
        sessionTitle={activeSession.title}
        isTeacher={false}
        studentName={studentName}
        onLeave={() => { setJoined(false); setActiveSession(null); setAccessCode(''); setStudentName(''); }}
        onDisconnect={() => { setJoined(false); setActiveSession(null); setAccessCode(''); setStudentName(''); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Video className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Join Live Session</CardTitle>
          <CardDescription>Enter the session code from your teacher</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!sessionInfo ? (
            <>
              <div className="space-y-2">
                <Label>Session Code</Label>
                <Input
                  placeholder="e.g., ABC123XY"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                  className="text-center text-2xl font-bold tracking-widest h-14"
                />
              </div>
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              <Button onClick={verifyCode} className="w-full h-12" disabled={loading}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Code'}
              </Button>
            </>
          ) : (
            <>
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 text-center">
                <p className="text-sm text-slate-500 mb-1">Joining Session:</p>
                <p className="font-bold text-lg">{sessionInfo.title}</p>
                <p className="text-xs text-slate-400">Teacher: {sessionInfo.teacher_name}</p>
              </div>
              <div className="space-y-2">
                <Label>Your Name</Label>
                <Input
                  placeholder="Enter your name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <Button onClick={joinSession} disabled={loading} className="w-full btn-primary">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Video className="w-4 h-4 mr-2" />}
                Join Session
              </Button>
              <Button variant="outline" onClick={() => { setSessionInfo(null); setAccessCode(''); }} className="w-full">
                Use Different Code
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onBack} className="w-full mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
