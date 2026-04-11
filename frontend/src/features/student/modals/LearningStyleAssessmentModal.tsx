import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';

interface LearningStyleAssessmentModalProps {
  showLearningStyleModal: boolean;
  setShowLearningStyleModal: (show: boolean) => void;
  assessmentStep: number;
  learningStyleQuestions: any[];
  handleAssessmentAnswer: (value: string) => void;
}

export const LearningStyleAssessmentModal: React.FC<LearningStyleAssessmentModalProps> = ({
  showLearningStyleModal,
  setShowLearningStyleModal,
  assessmentStep,
  learningStyleQuestions,
  handleAssessmentAnswer
}) => {
  if (!showLearningStyleModal) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={() => setShowLearningStyleModal(false)}
    >
      <Card 
        className="w-full max-w-lg shadow-2xl border-0 overflow-hidden rounded-3xl animate-in zoom-in-95 duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white pt-4 pb-8">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-black">Learning Style Discovery 🧠</CardTitle>
              <p className="text-teal-50 text-sm mt-1">Step {assessmentStep + 1} of {learningStyleQuestions.length}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowLearningStyleModal(false)} className="text-white hover:bg-white/20 rounded-full">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-8 -mt-6 bg-white dark:bg-slate-900 flex-1 flex flex-col items-center">
          <div className="w-full">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 text-center">
              {learningStyleQuestions[assessmentStep]?.text}
            </h3>
            <div className="space-y-3 w-full">
              {learningStyleQuestions[assessmentStep]?.options.map((opt: string, idx: number) => (
                <button
                  key={idx}
                  className="w-full p-4 text-left rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-all font-bold text-slate-700 dark:text-slate-300 group flex items-center justify-between"
                  onClick={() => handleAssessmentAnswer(learningStyleQuestions[assessmentStep].values[idx])}
                >
                  {opt}
                  <Sparkles className="w-4 h-4 opacity-0 group-hover:opacity-100 text-teal-500 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 flex gap-1">
            {learningStyleQuestions.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === assessmentStep ? 'w-8 bg-teal-500' : 'w-2 bg-slate-200 dark:bg-slate-800'}`} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
