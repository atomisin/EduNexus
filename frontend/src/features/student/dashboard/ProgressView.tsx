import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Activity, Star, Brain, BookMarked, TrendingUp, History, FileText, Video } from 'lucide-react';
import { MasteryRadar, PerformanceTimeline, EngagementMix } from '../components/PerformanceCharts';
import { StudentEmptyState } from '../components/StudentStatePanel';

interface ProgressViewProps {
  progress: any;
  radarData: any[];
  error?: string | null;
  profile?: any;
  examHistoryInsights?: any;
}

const metricCards = [
  { key: 'time', label: 'Minutes Studied', shortLabel: 'Minutes', icon: Trophy },
  { key: 'quizzes', label: 'Quizzes Taken', shortLabel: 'Quizzes', icon: Activity },
  { key: 'mastery', label: 'Average Mastery', shortLabel: 'Mastery', icon: Star },
];

export const ProgressView: React.FC<ProgressViewProps> = ({ progress, radarData, error, profile, examHistoryInsights }) => {
  const curriculumType = String(profile?.curriculum_type || '').toLowerCase();
  const isExamStudent = ['jamb', 'waec', 'neco'].includes(curriculumType);
  const summary = progress?.summary || {};
  const competencyOverview = Array.isArray(progress?.competency_overview) ? progress.competency_overview : [];
  const totalTime = Number(summary.total_time_spent || 0);
  const totalQuizzes = Number(summary.total_quizzes || 0);
  const averageScore = Number(summary.average_score || 0);
  const totalLessons = Number(summary.total_lessons || 0);
  const aiChats = Number(summary.ai_chats || 0);
  const hasMasteryData = radarData.some((item) => Number(item.proficiency || 0) > 0);
  const hasEngagementData = totalQuizzes + totalLessons + aiChats > 0;
  const scoredTrend = (progress?.chart_data || []).filter((point: any) => typeof point.score === 'number' && point.score > 0);
  const recommendedAction = averageScore >= 80
    ? 'Great progress. Continue with the next unlocked lesson, then take the mastery check while the idea is still fresh.'
    : totalQuizzes > 0
      ? 'Review the weakest recent quiz area, then try one guided practice before the next mastery check.'
      : totalLessons > 0
        ? 'You have started learning. Complete one mastery quiz so EduNexus can measure your understanding more accurately.'
        : 'Complete one guided lesson or mastery quiz to make the analytics more accurate.';
  const learnerGrowthMessage = progress?.next_growth_step || recommendedAction;
  const hasAnySignals = totalTime > 0 || totalQuizzes > 0 || totalLessons > 0 || aiChats > 0 || competencyOverview.length > 0;
  const hasTransientDataGap = Boolean(error) && !hasAnySignals;
  const readinessSignal = averageScore >= 80 ? 'Steady' : averageScore >= 60 ? 'Building well' : 'Needs reinforcement';
  const evidenceSignal = `${totalQuizzes} quiz${totalQuizzes === 1 ? '' : 'zes'} • ${totalLessons} lesson${totalLessons === 1 ? '' : 's'}`;
  const growthSummary = [
    { label: 'Learning signal', value: readinessSignal },
    { label: 'Evidence base', value: evidenceSignal },
    { label: 'Tutor activity', value: `${aiChats} guided chat${aiChats === 1 ? '' : 's'}` },
  ];
  const examReadiness = examHistoryInsights?.preparedness || 'No readiness signal yet';
  const examTruthNote = examHistoryInsights?.truth_note || 'Complete a few timed papers and EduNexus will tell the truth about your readiness pattern.';
  const examWeakAreas = examHistoryInsights?.recurring_weak_topics || [];
  const examQuestionTypes = examHistoryInsights?.question_type_average || [];
  const examTrend = examHistoryInsights?.trend || 'No trend yet';
  const pageTitle = isExamStudent ? 'Exam readiness analytics' : 'Learning Analytics';
  const pageDescription = isExamStudent
    ? 'Timed-paper evidence, readiness truth, and the next areas to tighten before the real exam.'
    : 'Progress, mastery, and recent learning evidence.';

  const values: Record<string, string | number> = {
    time: totalTime,
    quizzes: totalQuizzes,
    mastery: `${averageScore ? Math.round(averageScore) : 0}%`,
  };

  if (hasTransientDataGap) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <StudentEmptyState
          icon={<TrendingUp className="h-12 w-12 opacity-40" />}
          title={isExamStudent ? 'Your exam evidence is still reconnecting' : 'Your analytics are still reconnecting'}
          description={
            isExamStudent
              ? 'EduNexus has not fully restored your timed-paper evidence yet. Give it a moment and your readiness view should refill without losing your history.'
              : 'EduNexus has not fully restored your progress signals yet. Give it a moment and this page should refill without losing your history.'
          }
        />
      </div>
    );
  }

  if (!hasAnySignals) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <StudentEmptyState
          icon={<Brain className="h-12 w-12 opacity-40" />}
          title={isExamStudent ? 'Your readiness view grows with each timed paper.' : 'Your analytics will grow with your learning.'}
          description={
            isExamStudent
              ? 'Open a timed paper, finish it under the exam clock, and EduNexus will start showing honest readiness signals you can trust.'
              : 'Complete a lesson, answer a few tutor checks, or take a mastery quiz and EduNexus will start showing patterns you can trust.'
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <Badge variant="outline" className="w-fit bg-card border-border py-1.5 px-3 rounded-full flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{isExamStudent ? 'Readiness Tracking' : 'Live Tracking'}</span>
        </Badge>
      </div>

      {isExamStudent && (
        <Card className="rounded-lg border-border shadow-none bg-primary/5">
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Readiness truth</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{examReadiness}</p>
                <p className="mt-2 text-sm text-muted-foreground max-w-3xl">{examTruthNote}</p>
              </div>
              <Badge variant="secondary" className="w-fit shrink-0">{examTrend}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {examQuestionTypes.map((item: any) => (
                <Badge key={item.question_type} variant="outline" className="capitalize">
                  {item.question_type}: {item.accuracy_pct}%
                </Badge>
              ))}
            </div>
            {examWeakAreas.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Most repeated weak areas</p>
                <div className="flex flex-wrap gap-2">
                  {examWeakAreas.map((item: any) => (
                    <Badge key={item.topic} variant="secondary" className="bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">
                      {item.topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-lg border-border shadow-none bg-muted/20">
        <CardContent className="grid gap-2.5 p-4 sm:grid-cols-3">
          {growthSummary.map((item) => (
            <div key={item.label} className="rounded-md border border-border bg-background px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

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
        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Best next step</p>
            <p className="text-sm font-medium text-foreground">
              {learnerGrowthMessage}
            </p>
            <p className="text-xs text-muted-foreground">
              This updates from your recent quiz evidence, lesson activity, and growth signals.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit shrink-0">Updates automatically</Badge>
        </CardContent>
      </Card>

      {competencyOverview.length > 0 ? (
        <Card className="rounded-lg border-border shadow-none overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/30 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-primary" /> Your growth areas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              These are the capability areas already showing up in your recent learning sessions.
            </p>
            <div className="space-y-3">
              {competencyOverview.slice(0, 4).map((domain: any) => (
                <div key={domain.domain_name} className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{domain.domain_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {domain.course_name} • {domain.sessions_count} learning session{domain.sessions_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={
                          domain.readiness === 'Steady'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                            : domain.readiness === 'Growing'
                              ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-primary/10 text-primary border-primary/15'
                        }
                      >
                        {domain.readiness}
                      </Badge>
                      <Badge variant="outline">{domain.milestone_readiness}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="rounded-md border border-border px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Recent score</div>
                      <div className="text-lg font-semibold">{domain.avg_post_score}%</div>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Practice rhythm</div>
                      <div className="text-lg font-semibold">{domain.practice_consistency_pct}%</div>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Validated</div>
                      <div className="text-lg font-semibold text-primary">{domain.validated_assessments}</div>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Fallback</div>
                      <div className="text-lg font-semibold text-amber-600">{domain.fallback_assessments}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Focus skills</p>
                      {domain.skills_focus?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {domain.skills_focus.map((skill: string) => (
                            <Badge key={skill} variant="outline" className="text-xs">{skill}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Your focus skills will appear here as you keep learning.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Strengthen next</p>
                      {domain.current_gaps?.length ? (
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {domain.current_gaps.map((gap: string) => (
                            <li key={gap}>- {gap}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">No major gaps were flagged in your recent sessions.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Next move</p>
                      {domain.next_focus?.length ? (
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {domain.next_focus.map((focus: string) => (
                            <li key={focus}>- {focus}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">Keep practicing this area and EduNexus will suggest the next step.</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-lg border-border shadow-none overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/30 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> Mastery Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {radarData.length > 0 && hasMasteryData ? (
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
            {hasEngagementData ? (
              <EngagementMix summary={summary} />
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
            {scoredTrend.length > 0 ? (
              <PerformanceTimeline data={scoredTrend} />
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
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
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






