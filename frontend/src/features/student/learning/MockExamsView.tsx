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
}

interface AttemptHistory {
  id: string;
  series_name: string;
  score: number;
  total_questions: number;
  completed_at: string;
}

const MockExamsView: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [history, setHistory] = useState<AttemptHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'engine' | 'results' | 'combo'>('list');
  const [lastResults, setLastResults] = useState<any>(null);
  const [activeComboSeriesIds, setActiveComboSeriesIds] = useState<string[]>([]);
  const [showComboModal, setShowComboModal] = useState(false);
  const [selectedComboSubjects, setSelectedComboSubjects] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [seriesData, historyData] = await Promise.all([
          mockExamAPI.getSeries(),
          mockExamAPI.getHistory()
        ]);
        setSeries(seriesData);
        setHistory(historyData);
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
         is_combo: true
      });
    } else {
      setLastResults(results);
    }
    setView('results');
    mockExamAPI.getHistory().then(setHistory);
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
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in zoom-in duration-300">
        <Card className="text-center p-8 rounded-3xl border-2 border-primary/20 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-teal-400"></div>
          <Trophy className="w-20 h-20 text-amber-500 mx-auto mb-4 animate-bounce" />
          <CardTitle className="text-3xl font-bold mb-2">Exam Completed!</CardTitle>
          <CardDescription className="text-lg">You've successfully completed the {lastResults.is_combo ? 'JAMB Simulation' : 'mock exam'}.</CardDescription>
          
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
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">Time Spent</p>
              <p className="text-xl font-bold">{Math.round(lastResults.time_spent_seconds / 60)} mins</p>
            </div>
            <div className="p-4 bg-teal-50 dark:bg-teal-950/30 rounded-xl border border-teal-100 dark:border-teal-900/50">
              <p className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase">Correctness</p>
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
            Back to Mock Exams
          </Button>
        </Card>
      </div>
    );
  }

  const jambSeries = series.filter(s => s.exam_type === 'JAMB');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Exam Practice Center</h2>
          <p className="text-muted-foreground mt-1">Realistic mock exams for WAEC, JAMB, and NECO success.</p>
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
              Start JAMB Simulation (4 Subjects)
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={() => toast.info("History feature coming soon")}>
            <History className="w-4 h-4 mr-2" />
            History
          </Button>
        </div>
      </div>

      {showComboModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="max-w-md w-full p-6 animate-in zoom-in-95">
            <CardTitle className="text-2xl font-bold mb-4">Configure JAMB Exam</CardTitle>
            <p className="text-slate-500 text-sm mb-6">Select exactly 4 subjects to simulate the official CBT exam environment.</p>
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
                Begin Exam ({selectedComboSubjects.length}/4)
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
            <div className={`h-2 bg-gradient-to-r ${
              s.exam_type === 'JAMB' ? 'from-teal-400 to-teal-600' : 
              s.exam_type === 'WAEC' ? 'from-blue-400 to-blue-600' : 'from-purple-400 to-purple-600'
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
                <span className="text-muted-foreground">Questions</span>
                <span className="font-bold">{s.total_questions} MCQs</span>
              </div>
              <Button 
                onClick={() => handleStartExam(s.id)}
                className="w-full rounded-xl font-bold bg-slate-900 dark:bg-slate-800 hover:bg-primary text-white"
              >
                Start Practice
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
            Recent Performance
          </h3>
          <div className="space-y-3">
            {history.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    (item.score / item.total_questions) >= 0.7 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {Math.round((item.score / item.total_questions) * 100)}%
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
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Correct</p>
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
