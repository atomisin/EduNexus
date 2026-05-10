import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Send, FileText, Zap, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import MathText from "@/components/MathText";
import { normalizeAcademicTextForDisplay } from "@/utils/academicText";

interface FloatingContentModalProps {
  content: any;
  contentType: "pop_quiz" | "notes";
  onClose: () => void;
  onSubmitQuiz: (answers: Record<number, number>) => Promise<any>;
}

export const FloatingContentModal: React.FC<FloatingContentModalProps> = ({
  content,
  contentType,
  onClose,
  onSubmitQuiz,
}) => {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await onSubmitQuiz(answers);
      setResult(res);
    } catch (err) {
      console.error("Failed to submit quiz", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!content) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[92dvh] max-w-[calc(100vw-1rem)] flex flex-col p-0 overflow-hidden border-0 shadow-2xl bg-white dark:bg-slate-900 rounded-lg sm:max-w-2xl sm:rounded-3xl">
        <DialogHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className={`min-w-0 px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest flex items-center gap-1.5 ${
              contentType === 'pop_quiz' ? 'bg-yellow-100 text-yellow-700' : 'bg-primary/10 text-primary'
            }`}>
              {contentType === 'pop_quiz' ? <Zap className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              <span className="truncate">{contentType === 'pop_quiz' ? 'In-Class Quiz' : 'Teacher Shared Notes'}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogTitle className="mt-3 flex min-w-0 items-center gap-3 text-lg font-black leading-tight sm:text-2xl">
            {contentType === "pop_quiz" ? content.title || "Quick Check!" : "Review shared material"}
          </DialogTitle>
          <DialogDescription className="text-sm font-medium sm:text-base">
            {contentType === "pop_quiz"
              ? "Test your understanding of the current topic. Earn XP for participating!"
              : "Pay close attention to these key points shared by your teacher."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4 pb-4 mt-2 sm:px-6 sm:pb-6">
          {contentType === "pop_quiz" ? (
            result ? (
              <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 p-5 sm:p-8 rounded-2xl sm:rounded-3xl text-center border-2 border-emerald-100 dark:border-emerald-800">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
                    <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                    {result.score}% Score!
                  </h3>
                  <p className="text-base sm:text-lg text-emerald-600/70 font-bold mt-1">
                    {result.correct} out of {result.total} correct
                  </p>
                </div>
                <div className="space-y-4">
                  {result.details.map((detail: any, idx: number) => (
                    <div key={idx} className="p-4 sm:p-5 border-2 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <p className="break-words font-bold text-base sm:text-lg mb-3 leading-tight">{detail.question}</p>
                      <div className="flex items-center gap-2 mb-3">
                        {detail.is_correct ? (
                          <div className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-black uppercase">Correct</div>
                        ) : (
                          <div className="px-3 py-1 rounded-full bg-red-500 text-white text-xs font-black uppercase">Incorrect</div>
                        )}
                        <span className={`font-bold ${detail.is_correct ? "text-emerald-600" : "text-red-500"}`}>
                          {detail.is_correct ? "Great job!" : `Answer was ${String.fromCharCode(65 + detail.correct_answer)}`}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border-dashed border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium">
                        <span className="text-xs font-black uppercase block mb-1 opacity-50">Explanation</span>
                        <MathText>{String(detail.explanation || '')}</MathText>
                      </div>
                    </div>
                  ))}
                </div>
                <Button onClick={onClose} className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl">Back to Class</Button>
              </div>
            ) : (
              <div className="space-y-8 py-4 pb-12 sm:space-y-10">
                {(content.questions || content).map((q: any, qIdx: number) => (
                  <div key={qIdx} className="space-y-5 animate-in fade-in slide-in-from-right duration-500" style={{ animationDelay: `${qIdx * 100}ms` }}>
                    <h3 className="break-words text-base font-bold leading-tight sm:text-xl">
                      {qIdx + 1}. {q.text || q.question}
                    </h3>
                    <RadioGroup
                      value={answers[qIdx]?.toString()}
                      onValueChange={(val) =>
                        setAnswers((prev) => ({ ...prev, [qIdx]: parseInt(val) }))
                      }
                      className="space-y-3"
                    >
                      {q.options.map((option: string, oIdx: number) => (
                        <Label
                          key={oIdx}
                          className={`flex items-center space-x-3 sm:space-x-4 p-3 sm:p-5 border-2 rounded-xl sm:rounded-2xl cursor-pointer transition-all duration-200 active:scale-[0.98] ${
                            answers[qIdx] === oIdx
                              ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-100 dark:border-slate-800"
                          }`}
                        >
                          <RadioGroupItem value={oIdx.toString()} className="hidden" />
                          <div className="flex min-w-0 items-center gap-3 sm:gap-4 w-full">
                            <span className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-base sm:text-lg font-black shrink-0 transition-colors ${
                              answers[qIdx] === oIdx ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                            }`}>
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <span className="min-w-0 break-words text-sm font-semibold leading-snug sm:text-lg">{option}</span>
                          </div>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                ))}
                <div className="sticky bottom-0 pt-4 bg-gradient-to-t from-white dark:from-slate-900 via-white dark:via-slate-900 to-transparent">
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || Object.keys(answers).length < (content.questions?.length || content.length)}
                    className="w-full h-12 sm:h-16 text-base sm:text-xl font-black rounded-xl sm:rounded-2xl shadow-2xl bg-primary hover:bg-primary/90 text-primary-foreground group"
                  >
                    {submitting ? (
                        <span className="flex items-center gap-2">
                            <Zap className="animate-spin h-5 w-5" />
                            GRADING...
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <Send className="mr-2 h-6 w-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                            FINISH QUIZ
                        </span>
                    )}
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-6 py-4 animate-in fade-in duration-500">
              <div className="p-4 sm:p-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl sm:rounded-3xl border-2 border-slate-100 dark:border-slate-800">
                <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] prose dark:prose-invert prose-sm sm:prose-lg prose-headings:font-black prose-headings:text-primary prose-strong:text-foreground prose-p:font-medium prose-p:max-w-full">
                  <ReactMarkdown
                    components={{
                      p: ({ children }: any) => <p><MathText>{String(children ?? '')}</MathText></p>,
                      li: ({ children }: any) => <li><MathText>{String(children ?? '')}</MathText></li>,
                    }}
                  >
                    {normalizeAcademicTextForDisplay(String(content.content || content || ''))}
                  </ReactMarkdown>
                </div>
              </div>
              <Button onClick={onClose} className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl">Got it, thanks!</Button>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
