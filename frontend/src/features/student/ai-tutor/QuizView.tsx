import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Sparkles, BookMarked, Target, Trophy } from 'lucide-react';

interface QuizViewProps {
  selectedTopic: any;
  handleAIContinue: (prompt: string) => void;
  subjects: any[];
  enrolledSubjects: string[];
  selectedSubject: any;
  handleSubjectSelect: (subject: any) => void;
  topics: any[];
  setSelectedTopic: (topic: any) => void;
  setActiveView: (view: any) => void;
  setShowAIPanel: (val: boolean) => void;
  setShowMasteryTest: (topic?: any, subject?: any) => void;
  progress: any;
  profile: any;
}

export const QuizView: React.FC<QuizViewProps> = ({
  selectedTopic,
  handleAIContinue,
  subjects,
  enrolledSubjects,
  selectedSubject,
  handleSubjectSelect,
  topics,
  setSelectedTopic,
  setActiveView,
  setShowAIPanel,
  setShowMasteryTest,
  progress,
  profile
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" /> Practice Quiz Center
        </h2>
        {selectedTopic && (
          <Button
            onClick={() => handleAIContinue(`Give me a 5-question quiz on ${selectedTopic.name}`)}
            className="bg-teal-600 hover:bg-teal-700 gap-2"
          >
            <Sparkles className="w-4 h-4" /> Generate Quiz for {selectedTopic.name}
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Select a Topic to Test</CardTitle>
            <p className="text-sm text-muted-foreground">Pick a subject and topic you want to be quizzed on. Our AI will generate unique questions for you.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">1. Choose Subject</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {subjects.filter(s => enrolledSubjects.includes(s.id)).map(subject => (
                  <button
                    key={subject.id}
                    className={`p-3 rounded-xl border-2 transition-all text-sm font-medium flex items-center gap-2 ${selectedSubject?.id === subject.id
                      ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/30'
                      : 'border-slate-100 hover:border-slate-200 dark:border-slate-800'}`}
                    onClick={() => handleSubjectSelect(subject)}
                  >
                    <BookMarked className="w-4 h-4" /> {subject.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedSubject && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">2. Select Topic</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {topics.map(topic => (
                    <button
                      key={topic.id}
                      className={`p-3 rounded-xl border transition-all text-sm text-left px-4 ${selectedTopic?.id === topic.id
                        ? 'bg-teal-600 text-white border-teal-100 shadow-md'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-400'}`}
                      onClick={() => setSelectedTopic(topic)}
                    >
                      {topic.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedTopic && (
              <div className="pt-4 animate-in zoom-in-95">
                <Button
                  className="w-full py-6 text-lg rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 shadow-xl shadow-teal-200 dark:shadow-none font-bold"
                  onClick={() => {
                    if (selectedTopic) {
                      setSelectedTopic(selectedTopic);
                      setActiveView('learn');
                      setShowAIPanel(true);
                      setShowMasteryTest(selectedTopic, selectedSubject);
                    }
                  }}
                >
                  Start Mastery Test Now 🚀
                </Button>
              </div>
            )}

            {!selectedSubject && (
              <div className="py-20 text-center border-2 border-dashed rounded-2xl border-slate-100 dark:border-slate-800">
                <div className="w-16 h-16 bg-teal-50 dark:bg-teal-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="w-8 h-8 text-teal-400" />
                </div>
                <p className="text-slate-400 font-medium">Select a subject above to see topics</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Recent Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Average Score</span>
                  <span className="text-lg font-black text-teal-600">{progress?.summary?.average_score ? Math.round(progress.summary.average_score) : 0}%</span>
                </div>
                <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500" style={{ width: `${progress?.summary?.average_score || 0}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase px-1">Quick Stats</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-center">
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{progress?.summary?.total_quizzes || 0}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Total Taken</p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-center">
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{profile?.xp ? Math.floor(profile.xp / 100) : 0}</p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500">Quiz Badges</p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button variant="outline" className="w-full text-xs" onClick={() => setActiveView('progress')}>View Detailed Analytics →</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
