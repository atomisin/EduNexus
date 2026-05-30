import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Calendar,
  Clock,
  Eye,
  NotebookPen,
  Target,
  Video,
  Zap,
} from 'lucide-react';
import { StatsCards } from './StatsCards';
import { StudentEmptyState, StudentLoadingState } from '../components/StudentStatePanel';

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
  examHistoryInsights?: any;
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
  formatDate,
  examHistoryInsights,
}) => {
  const learningStyle = getLearningStyleLabel(profile?.learning_style);
  const curriculumType = String(profile?.curriculum_type || '').toLowerCase();
  const isExamStudent = ['jamb', 'waec', 'neco'].includes(curriculumType);
  const examTrackLabel = curriculumType ? curriculumType.toUpperCase() : 'Exam';
  const focusSpan = profile?.attention_span_minutes || 30;
  const bestTime = profile?.best_study_time || 'Not set';
  const nextLiveSession = liveSessions[0] || null;
  const nextUpcomingSession = upcomingSessions[0] || null;
  const learnerRhythm = energy >= 70 ? 'Ready for deeper work' : energy >= 35 ? 'Steady learning pace' : 'Best for review and lighter tasks';
  const nextFocusLine = nextLiveSession
    ? `A live class is ready now in ${nextLiveSession.subject_name || 'your subject'}.`
    : nextUpcomingSession
      ? `Your next scheduled class is ${nextUpcomingSession.subject_name || 'coming up soon'}.`
      : 'Keep your learner profile sharp so the tutor and class planning stay well-paced.';
  const planningStrip = [
    { label: 'Focus window', value: `${focusSpan} min` },
    { label: 'Best study time', value: bestTime },
    { label: 'Live now', value: nextLiveSession ? (nextLiveSession.subject_name || 'Class ready') : 'None live' },
  ];

  if (isExamStudent) {
    const examPlanningStrip = [
      { label: 'Track', value: examTrackLabel },
      { label: 'Focus window', value: `${focusSpan} min` },
      { label: 'Best study time', value: bestTime },
    ];
    const preparedness = examHistoryInsights?.preparedness || 'No readiness signal yet';
    const truthNote = examHistoryInsights?.truth_note || 'Write a few timed papers so EduNexus can read your real exam pattern clearly.';
    const recurringWeaknesses = examHistoryInsights?.recurring_weak_topics || [];
    const recurringStrengths = examHistoryInsights?.recurring_strength_topics || [];
    const questionTypeAverage = examHistoryInsights?.question_type_average || [];
    const recentAverage = examHistoryInsights?.recent_average_pct ?? null;
    const latestScore = examHistoryInsights?.latest_percentage ?? null;
    const trend = examHistoryInsights?.trend || 'No trend yet';

    return (
      <div className="space-y-3 sm:space-y-5">
        <StatsCards profile={profile} energy={energy} />

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1.25fr_0.95fr]">
          <Card className="rounded-lg border-border bg-card shadow-sm">
            <CardContent className="p-3.5 sm:p-5">
              <div className="flex flex-col gap-3 sm:gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                      Exam readiness brief
                    </Badge>
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Keep your exam signal honest and easy to act on.</h2>
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        EduNexus reads your recent papers for trend, weak areas, and readiness under timed pressure, not just one lucky score.
                      </p>
                    </div>
                  </div>
                  <div className="min-w-[180px] rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current readiness</p>
                    <p className="mt-1 font-medium text-foreground">{preparedness}</p>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-2.5 sm:grid-cols-3 sm:gap-2.5 sm:p-3">
                  {examPlanningStrip.map((item) => (
                    <div key={item.label} className="rounded-md border border-border bg-background px-2.5 py-2 sm:px-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
                  <div className="rounded-lg border border-border bg-muted/25 p-2.5 sm:p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Target className="h-4 w-4 text-primary" />
                      Recent average
                    </div>
                    <p className="text-sm font-semibold text-foreground">{recentAverage !== null ? `${recentAverage}%` : 'No papers yet'}</p>
                    <p className="mt-1 text-xs leading-4.5 sm:leading-5 text-muted-foreground">A better signal than judging readiness from one attempt alone.</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/25 p-2.5 sm:p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <NotebookPen className="h-4 w-4 text-primary" />
                      Latest score
                    </div>
                    <p className="text-sm font-semibold text-foreground">{latestScore !== null ? `${latestScore}%` : 'Not written yet'}</p>
                    <p className="mt-1 text-xs leading-4.5 sm:leading-5 text-muted-foreground">Useful, but only meaningful when read alongside the trend.</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/25 p-2.5 sm:p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Eye className="h-4 w-4 text-primary" />
                      Trend
                    </div>
                    <p className="text-sm font-semibold text-foreground">{trend}</p>
                    <p className="mt-1 text-xs leading-4.5 sm:leading-5 text-muted-foreground">This tells you whether your exam shape is strengthening, drifting, or staying flat.</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-primary/5 p-3.5 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Target className="h-4 w-4 text-primary" />
                        Truth note
                      </div>
                      <p className="text-sm text-foreground">{truthNote}</p>
                    </div>
                    <Button className="w-full sm:w-auto" onClick={() => setActiveView('mock-exams')}>
                      Open timed papers
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border bg-card shadow-sm">
            <CardHeader className="space-y-1 p-3.5 pb-2.5 sm:p-5 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Video className="h-5 w-5 text-primary" />
                Exam focus
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Keep the next study move narrow enough to improve the next paper, not just feel busy.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 p-3.5 pt-0 sm:p-5 sm:pt-0">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Question-type signal</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {questionTypeAverage.length > 0 ? questionTypeAverage.map((item: any) => (
                    <Badge key={item.question_type} variant="outline" className="capitalize">
                      {item.question_type}: {item.accuracy_pct}%
                    </Badge>
                  )) : (
                    <p className="text-sm text-muted-foreground">Complete a few papers to compare objective and theory strength.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recurring weak areas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recurringWeaknesses.length > 0 ? recurringWeaknesses.map((item: any) => (
                    <Badge key={item.topic} variant="secondary" className="bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">
                      {item.topic}
                    </Badge>
                  )) : (
                    <p className="text-sm text-muted-foreground">No repeated weak area has formed yet.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Holding steady</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recurringStrengths.length > 0 ? recurringStrengths.map((topic: string) => (
                    <Badge key={topic} variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900/50">
                      {topic}
                    </Badge>
                  )) : (
                    <p className="text-sm text-muted-foreground">A stable strength pattern will appear after a few more timed papers.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      <StatsCards profile={profile} energy={energy} />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1.3fr_0.9fr]">
        <Card className="rounded-lg border-border bg-card shadow-sm">
          <CardContent className="p-3.5 sm:p-5">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                    Today's study brief
                  </Badge>
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Settle into the right pace for today.</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      Here is the clearest read on your learning rhythm right now, without noise you do not need.
                    </p>
                  </div>
                </div>
                <div className="min-w-[160px] rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current rhythm</p>
                  <p className="mt-1 font-medium text-foreground">{learnerRhythm}</p>
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-2.5 sm:grid-cols-3 sm:gap-2.5 sm:p-3">
                {planningStrip.map((item) => (
                  <div key={item.label} className="rounded-md border border-border bg-background px-2.5 py-2 sm:px-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
                <div className="rounded-lg border border-border bg-muted/25 p-2.5 sm:p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Eye className="h-4 w-4 text-primary" />
                    Learning style
                  </div>
                  <p className="text-sm font-semibold text-foreground">{learningStyle.label}</p>
                  <p className="mt-1 text-xs leading-4.5 sm:leading-5 text-muted-foreground">{learningStyle.desc}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 p-2.5 sm:p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <NotebookPen className="h-4 w-4 text-primary" />
                    Study habit
                  </div>
                  <p className="text-sm font-semibold text-foreground">Short, clean sessions</p>
                  <p className="mt-1 text-xs leading-4.5 sm:leading-5 text-muted-foreground">
                    Work in focused blocks, then pause before the quality drops.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 p-2.5 sm:p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Calendar className="h-4 w-4 text-primary" />
                    Planning note
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-5">
                    {nextUpcomingSession ? 'Next class already in view' : 'Keep your next study block visible'}
                  </p>
                  <p className="mt-1 text-xs leading-4.5 sm:leading-5 text-muted-foreground">
                    A visible next step makes revision and tutor practice easier to keep up.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-primary/5 p-3.5 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Target className="h-4 w-4 text-primary" />
                      Next move
                    </div>
                    <p className="text-sm text-foreground">{nextFocusLine}</p>
                  </div>
                  <Button
                    variant={nextLiveSession ? 'default' : 'outline'}
                    className="w-full sm:w-auto"
                    onClick={() => (nextLiveSession ? handleJoinSession(nextLiveSession) : setActiveView('profile'))}
                  >
                    {nextLiveSession ? 'Join live class' : 'Refine learner profile'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border bg-card shadow-sm">
          <CardHeader className="space-y-1 p-3.5 pb-2.5 sm:p-5 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Video className="h-5 w-5 text-primary" />
              Live class focus
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Jump in quickly when class is live, or stay clear on what is coming next.
            </p>
          </CardHeader>
          <CardContent className="p-3.5 pt-0 sm:p-5 sm:pt-0">
            {loading ? (
              <StudentLoadingState label="Loading live classes" rows={2} />
            ) : nextLiveSession ? (
              <div className="space-y-2.5">
                {liveSessions.slice(0, 3).map((session, index) => (
                  <div
                    key={session.id || index}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-muted/25 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{session.title || 'Live Session'}</p>
                          {index === 0 ? <Badge className="rounded-md bg-primary text-primary-foreground hover:bg-primary">Now live</Badge> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{session.subject_name || 'General class'}</p>
                      </div>
                    </div>
                    <Button size="sm" className="w-full sm:w-auto" onClick={() => handleJoinSession(session)}>
                      Join now
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <StudentEmptyState
                compact
                icon={<Video className="h-10 w-10 opacity-40" />}
                title="No live classes right now"
                description="When a teacher goes live, the class will appear here for quick access."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg border-border bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-2 p-3.5 pb-2.5 sm:flex-row sm:items-start sm:justify-between sm:p-5 sm:pb-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              Upcoming classes
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Keep the week visible so classwork, revision, and tutor practice stay connected.
            </p>
          </div>
          {upcomingSessions.length > 0 ? (
            <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
              {upcomingSessions.length} scheduled
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="p-3.5 pt-0 sm:p-5 sm:pt-0">
          {loading ? (
            <StudentLoadingState label="Loading upcoming classes" rows={3} />
          ) : upcomingSessions.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {upcomingSessions.slice(0, 6).map((session) => (
                <div key={session.id} className="rounded-lg border border-border bg-muted/20 p-3 sm:p-3.5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <Badge variant="secondary" className="rounded-md">
                      {session.subject_name || 'General'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{session.duration_minutes || 60} min</span>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{session.title || 'Class Session'}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{session.topic_name || 'Topic will be shared by your teacher.'}</p>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(session.scheduled_start)}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      Stay ready for revision after class
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleJoinSession(session)}>
                      Set reminder
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <StudentEmptyState
              compact
              icon={<Calendar className="h-10 w-10 opacity-40" />}
              title="No upcoming classes"
              description="Your scheduled classes will appear here so it is easy to plan your week."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};




