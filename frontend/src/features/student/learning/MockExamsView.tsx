import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Clock, Trophy, ArrowRight, History, Calendar, Star } from 'lucide-react';
import { mockExamAPI } from '@/services/api';
import { toast } from 'sonner';
import MockExamEngine from './MockExamEngine';
import ComboExamEngine from './ComboExamEngine';

interface Series {
  id: string;
  name: string;
  subject_name: string;
  exam_type: string;
  total_questions: number;
  time_limit_minutes: number;
  expected_theory_questions?: number;
}

interface AttemptHistory {
  id: string;
  series_name: string;
  exam_type?: string;
  score: number;
  total_questions: number;
  percentage?: number;
  time_taken_seconds?: number;
  completed_at: string;
}

interface HistoryInsights {
  attempt_count: number;
  recent_average_pct: number;
  best_percentage: number;
  latest_percentage: number;
  trend: string;
  preparedness: string;
  truth_note: string;
  recurring_weak_topics: { topic: string; weight: number }[];
  recurring_strength_topics: string[];
  question_type_average: { question_type: string; accuracy_pct: number }[];
  timeline: { id: string; series_name: string; exam_type: string; percentage: number; completed_at: string }[];
}

interface StudyRecommendation {
  topic: string;
  question_type: string;
  why: string;
  next_step: string;
}

interface TopicDiagnostic {
  topic: string;
  accuracy_pct: number;
  attempted: number;
  question_type_mix: string[];
}

interface ResultDiagnostics {
  weak_topics?: TopicDiagnostic[];
  question_type_summary?: { question_type: string; accuracy_pct: number; attempted: number }[];
  study_recommendations?: StudyRecommendation[];
  strength_topics?: string[];
}

const MockExamsView: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [history, setHistory] = useState<AttemptHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyInsights, setHistoryInsights] = useState<HistoryInsights | null>(null);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'engine' | 'results' | 'combo'>('list');
  const [lastResults, setLastResults] = useState<any>(null);
  const [activeComboSeriesIds, setActiveComboSeriesIds] = useState<string[]>([]);
  const [showComboModal, setShowComboModal] = useState(false);
  const [selectedComboSubjects, setSelectedComboSubjects] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [seriesData, historyData, insightsData] = await Promise.all([
          mockExamAPI.getSeries(),
          mockExamAPI.getHistory(),
          mockExamAPI.getHistoryInsights(),
        ]);
        setSeries(seriesData);
        setHistory(historyData);
        setHistoryInsights(insightsData);
      } catch (err) {
        toast.error("Failed to load mock exams");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleStartExam = (id: string) => {
    setActiveSeriesId(id);
    setView('engine');
  };

  const handleStartCombo = () => {
    if (selectedComboSubjects.length !== 4) {
      toast.error('Please select exactly 4 subjects for the JAMB simulation.');
      return;
    }
    setActiveComboSeriesIds(selectedComboSubjects);
    setShowComboModal(false);
    setView('combo');
  };

  const handleComplete = (results: any) => {
    // If it's a combo, backend returns { combo_results: [], total_score, total_questions }
    if (results.combo_results) {
      setLastResults({
         score: results.total_score,
         total_questions: results.total_questions,
         time_spent_seconds: results.combo_results.reduce((acc: number, cur: any) => acc + (cur.time_taken_seconds || 0), 0) / Math.max(results.combo_results.length, 1) || 7200, // Average or fallback
         is_combo: true,
         study_recommendations: results.study_recommendations || [],
         combo_results: results.combo_results,
      });
    } else {
      setLastResults(results);
    }
    setView('results');
    Promise.all([mockExamAPI.getHistory(), mockExamAPI.getHistoryInsights()]).then(([historyData, insightsData]) => {
      setHistory(historyData);
      setHistoryInsights(insightsData);
    });
  };

  if (view === 'engine' && activeSeriesId) {
    return (
      <MockExamEngine 
        seriesId={activeSeriesId} 
        onComplete={handleComplete} 
        onCancel={() => setView('list')} 
      />
    );
  }

  if (view === 'combo' && activeComboSeriesIds.length > 0) {
    // We import ComboExamEngine lazily or statically
    return (
      <ComboExamEngine 
        seriesIds={activeComboSeriesIds} 
        onComplete={handleComplete} 
        onCancel={() => setView('list')} 
      />
    );
  }

  if (view === 'results' && lastResults) {
    const percentage = Math.round((lastResults.score / lastResults.total_questions) * 100);
    const diagnostics: ResultDiagnostics | undefined = lastResults.diagnostics;
    const studyRecommendations = lastResults.study_recommendations || diagnostics?.study_recommendations || [];
    const weakTopics = diagnostics?.weak_topics || [];
    const questionTypeSummary = diagnostics?.question_type_summary || [];
    const strengths = diagnostics?.strength_topics || [];
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in zoom-in duration-300">
        <Card className="text-center p-8 rounded-3xl border-2 border-primary/20 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-teal-400"></div>
          <Trophy className="w-20 h-20 text-amber-500 mx-auto mb-4 animate-bounce" />
          <CardTitle className="text-3xl font-bold mb-2">Paper completed</CardTitle>
          <CardDescription className="text-lg">Your {lastResults.is_combo ? 'JAMB simulation' : 'timed paper'} has been scored and reviewed for the clearest next study move.</CardDescription>
          
          <div className="my-8 py-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Your Score</p>
            <div className="text-6xl font-black text-primary mb-2">
              {lastResults.score}<span className="text-2xl text-muted-foreground">/{lastResults.total_questions}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Badge variant={percentage >= 50 ? "default" : "destructive"} className="px-4 py-1 text-base rounded-full">
                {percentage}% — {percentage >= 70 ? 'Excellent!' : percentage >= 50 ? 'Good Job' : 'Keep Practicing'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
              <p className="text-xs font-bold text-primary uppercase">Time Spent</p>
              <p className="text-xl font-bold">{Math.round(lastResults.time_spent_seconds / 60)} mins</p>
            </div>
            <div className="p-4 bg-teal-50 dark:bg-teal-950/30 rounded-xl border border-teal-100 dark:border-teal-900/50">
              <p className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase">Score signal</p>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                   <Star 
                     key={star} 
                     className={`w-4 h-4 ${star <= (percentage / 20) ? 'text-amber-500 fill-current' : 'text-slate-300'}`} 
                   />
                ))}
              </div>
            </div>
          </div>

          <Button 
            onClick={() => setView('list')}
            className="w-full h-12 rounded-xl text-lg font-bold shadow-lg shadow-primary/20"
          >
            Back to exam workspace
          </Button>
        </Card>

        {(studyRecommendations.length > 0 || weakTopics.length > 0 || questionTypeSummary.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Study Next</CardTitle>
                <CardDescription>These are the areas that need the most attention before the next paper.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {studyRecommendations.length > 0 ? studyRecommendations.map((item: StudyRecommendation, index: number) => (
                  <div key={`${item.topic}-${index}`} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/60">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="font-bold text-slate-900 dark:text-white">{item.topic}</p>
                      <Badge variant="outline" className="capitalize">{item.question_type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{item.why}</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.next_step}</p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No focused recommendations yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Performance Signals</CardTitle>
                <CardDescription>Quick read on where the paper felt strong or weak.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {questionTypeSummary.map((item) => (
                  <div key={item.question_type} className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold capitalize">{item.question_type}</p>
                      <Badge variant={item.accuracy_pct >= 65 ? 'default' : 'secondary'}>{item.accuracy_pct}%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.attempted} question(s) in this lane</p>
                  </div>
                ))}
                {strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Stronger Areas</p>
                    <div className="flex flex-wrap gap-2">
                      {strengths.map((topic) => (
                        <Badge key={topic} variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900/50">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {weakTopics.length > 0 && (
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Weakest Topics</CardTitle>
              <CardDescription>These topics cost the most marks in this attempt.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {weakTopics.map((item) => (
                <div key={item.topic} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 bg-white dark:bg-slate-900">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{item.topic}</p>
                    <p className="text-xs text-muted-foreground">{item.attempted} question(s) • {item.question_type_mix.join(', ')}</p>
                  </div>
                  <Badge variant={item.accuracy_pct >= 65 ? 'default' : 'destructive'}>
                    {item.accuracy_pct}%
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const jambSeries = series.filter(s => s.exam_type === 'JAMB');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Exam readiness workspace</h2>
          <p className="text-muted-foreground mt-1">Timed papers, honest scoring, and clearer readiness signals for WAEC, JAMB, and NECO.</p>
        </div>
        <div className="flex gap-2">
          {jambSeries.length >= 4 && (
            <Button 
              className="rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30" 
              onClick={() => {
                // Auto-select English if available, plus 3 others
                const english = jambSeries.find(s => s.subject_name.toLowerCase().includes('english'));
                const others = jambSeries.filter(s => s.id !== english?.id).slice(0, 3);
                const defaultSelection = [english, ...others].filter(Boolean).map(s => s!.id);
                setSelectedComboSubjects(defaultSelection.slice(0, 4));
                setShowComboModal(true);
              }}
            >
              Open JAMB Simulation
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={() => toast.info("History feature coming soon")}>
            <History className="w-4 h-4 mr-2" />
            History
          </Button>
        </div>
      </div>

      {historyInsights && historyInsights.attempt_count > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="pt-6">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent Average</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white">{historyInsights.recent_average_pct}%</p>
                <p className="text-xs text-muted-foreground mt-1">Last few timed papers</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="pt-6">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Latest Paper</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white">{historyInsights.latest_percentage}%</p>
                <p className="text-xs text-muted-foreground mt-1">Most recent attempt</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="pt-6">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Best Recent Score</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white">{historyInsights.best_percentage}%</p>
                <p className="text-xs text-muted-foreground mt-1">Strongest recent paper</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="pt-6">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Trend</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white">{historyInsights.trend}</p>
                <p className="text-xs text-muted-foreground mt-1">{historyInsights.attempt_count} completed paper(s)</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Preparedness Signal</CardTitle>
              <CardDescription>This reads the score pattern honestly, not optimistically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">{historyInsights.preparedness}</p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{historyInsights.truth_note}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {historyInsights.question_type_average.map((item) => (
                    <Badge key={item.question_type} variant="outline" className="capitalize">
                      {item.question_type}: {item.accuracy_pct}%
                    </Badge>
                  ))}
                </div>
              </div>

              {historyInsights.timeline.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Paper Trail</p>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    {historyInsights.timeline.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3 py-3">
                        <p className="text-lg font-black text-slate-900 dark:text-white">{item.percentage}%</p>
                        <p className="text-[11px] font-semibold text-muted-foreground truncate">{item.series_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recurring Weak Areas</p>
                  <div className="flex flex-wrap gap-2">
                    {historyInsights.recurring_weak_topics.length > 0 ? historyInsights.recurring_weak_topics.map((item) => (
                      <Badge key={item.topic} variant="secondary" className="bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">
                        {item.topic}
                      </Badge>
                    )) : (
                      <p className="text-sm text-muted-foreground">No recurring weak area identified yet.</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recurring Strong Areas</p>
                  <div className="flex flex-wrap gap-2">
                    {historyInsights.recurring_strength_topics.length > 0 ? historyInsights.recurring_strength_topics.map((topic) => (
                      <Badge key={topic} variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900/50">
                        {topic}
                      </Badge>
                    )) : (
                      <p className="text-sm text-muted-foreground">A stable strength pattern has not formed yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showComboModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="max-w-md w-full p-6 animate-in zoom-in-95">
            <CardTitle className="text-2xl font-bold mb-4">Set up JAMB simulation</CardTitle>
            <p className="text-slate-500 text-sm mb-6">Select exactly 4 subjects to mirror the real CBT pressure and subject mix.</p>
            <div className="space-y-2 mb-8 max-h-[40vh] overflow-y-auto">
              {jambSeries.map(s => {
                const isSelected = selectedComboSubjects.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedComboSubjects(prev => prev.filter(id => id !== s.id));
                      } else if (selectedComboSubjects.length < 4) {
                        setSelectedComboSubjects(prev => [...prev, s.id]);
                      }
                    }}
                    className={`w-full text-left p-3 rounded-lg border-2 text-sm font-bold transition-all ${
                      isSelected 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {s.name} ({s.subject_name})
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowComboModal(false)}>Cancel</Button>
              <Button 
                onClick={handleStartCombo} 
                disabled={selectedComboSubjects.length !== 4}
                className="font-bold"
              >
                Open full simulation ({selectedComboSubjects.length}/4)
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {series.length === 0 && !loading && (
          <div className="col-span-full p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">

             <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
             <h3 className="text-lg font-bold">No Mock Exams Available Yet</h3>
             <p className="text-muted-foreground max-w-sm mx-auto">Enroll in exam-target subjects in your profile to see practice tests here.</p>
          </div>
        )}

        {series.map((s) => (
          <Card key={s.id} className="group hover:border-primary/50 transition-all duration-300 rounded-2xl overflow-hidden border-slate-200 dark:border-slate-800 shadow-md hover:shadow-xl">
            <div className={`h-2 ${
              s.exam_type === 'JAMB' ? 'bg-teal-500' :
              s.exam_type === 'WAEC' ? 'bg-primary' : 'bg-slate-600'
            }`}></div>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline" className="font-bold border-primary text-primary px-3 py-0.5 rounded-full">
                  {s.exam_type}
                </Badge>
                <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {s.time_limit_minutes}m
                </div>
              </div>
              <CardTitle className="text-xl group-hover:text-primary transition-colors">{s.name}</CardTitle>
              <CardDescription className="font-medium text-slate-500">{s.subject_name}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/50 rounded-xl mb-4 text-sm">
                <span className="text-muted-foreground">Paper Format</span>
                <span className="font-bold">
                  {s.total_questions} questions
                  {s.expected_theory_questions ? ` • ${s.expected_theory_questions} theory` : ' • objective'}
                </span>
              </div>
              <Button 
                onClick={() => handleStartExam(s.id)}
                className="w-full rounded-xl font-bold bg-slate-900 dark:bg-slate-800 hover:bg-primary text-white"
              >
                Open timed paper
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {history.length > 0 && (
        <div className="space-y-4 pt-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Recent exam evidence
          </h3>
          <div className="space-y-3">
            {history.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    ((item.percentage ?? ((item.score / item.total_questions) * 100)) / 100) >= 0.7 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {Math.round(item.percentage ?? ((item.score / item.total_questions) * 100))}%
                  </div>
                  <div>
                    <p className="font-bold">{item.series_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.completed_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{item.score} / {item.total_questions}</p>
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                    {item.time_taken_seconds ? `${Math.max(1, Math.round(item.time_taken_seconds / 60))} mins` : 'Timed'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MockExamsView;
