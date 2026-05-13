import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, X } from 'lucide-react';

interface LearningStyleAssessmentModalProps {
  showLearningStyleModal: boolean;
  setShowLearningStyleModal: (show: boolean) => void;
  assessmentStep: number;
  learningStyleQuestions: any[];
  handleAssessmentAnswer: (optionIndex: number) => void;
  isUpdating?: boolean;
}

export const LearningStyleAssessmentModal: React.FC<LearningStyleAssessmentModalProps> = ({
  showLearningStyleModal,
  setShowLearningStyleModal,
  assessmentStep,
  learningStyleQuestions,
  handleAssessmentAnswer,
  isUpdating = false,
}) => {
  if (!showLearningStyleModal) return null;

  const currentQuestion = learningStyleQuestions[assessmentStep];
  const questionText = currentQuestion?.question || currentQuestion?.text || 'Loading question...';
  const options = currentQuestion?.options || [];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => setShowLearningStyleModal(false)}
    >
      <Card
        className="w-full max-w-lg overflow-hidden rounded-lg border-0 shadow-2xl animate-in zoom-in-95 duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="bg-primary px-5 pb-6 pt-4 text-primary-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-xl font-semibold sm:text-2xl">Learning Style Discovery</CardTitle>
              <p className="mt-1 text-sm text-primary-foreground/80">
                Step {Math.min(assessmentStep + 1, learningStyleQuestions.length || 1)} of {learningStyleQuestions.length || 1}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowLearningStyleModal(false)}
              className="rounded-full text-primary-foreground hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center bg-white p-5 dark:bg-slate-900 sm:p-8">
          <div className="w-full">
            <h3 className="mb-6 text-center text-lg font-semibold leading-snug text-slate-800 dark:text-slate-100 sm:text-xl">
              {questionText}
            </h3>
            <div className="w-full space-y-3">
              {options.length === 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-subtle p-5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing assessment...
                </div>
              ) : (
                options.map((opt: any, idx: number) => (
                  <button
                    key={idx}
                    disabled={isUpdating}
                    className="group flex w-full items-center justify-between rounded-lg border border-border p-4 text-left text-sm font-medium text-slate-700 transition-all hover:border-primary/50 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-60 dark:text-slate-300 sm:text-base"
                    onClick={() => handleAssessmentAnswer(idx)}
                  >
                    <span>{typeof opt === 'string' ? opt : opt.text}</span>
                    {isUpdating && idx === options.length - 1 ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="mt-8 flex gap-1">
            {(learningStyleQuestions.length ? learningStyleQuestions : [null]).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === assessmentStep ? 'w-8 bg-primary' : 'w-2 bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
