import React, { useState, useEffect, useMemo } from 'react';
import { Brain, CheckCircle2, ClipboardCheck, FileText, History, ListChecks, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { EDUCATION_LEVELS } from '@/constants/educationLevels';
import { AITogglePanel } from './AITogglePanel';
import AcademicMarkdown from '@/components/AcademicMarkdown';

import { subjectsAPI, sessionAPI } from '@/services/api';
import type { AIConfig, Subject, EducationLevel } from '@/types';
import { formatTopicLike } from '@/utils/topicText';

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiConfig: AIConfig;
  onAiConfigChange: (config: AIConfig) => void;
  linkedStudents: any[];
  userRole?: string;
  onSessionCreated: (session?: any) => void;
}

export const CreateSessionDialog: React.FC<CreateSessionDialogProps> = ({
  open,
  onOpenChange,
  aiConfig,
  onAiConfigChange,
  linkedStudents,
  userRole,
  onSessionCreated,
}) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<{ id: string; name: string; term?: string | null; display_order?: number }[]>([]);
  const [topicSearch, setTopicSearch] = useState('');
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectLevel, setNewSubjectLevel] = useState('');
  const [createdSession, setCreatedSession] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [lessonPickerOpen, setLessonPickerOpen] = useState(true);
  const [continuityInfo, setContinuityInfo] = useState<any>(null);
  const [continuityLoading, setContinuityLoading] = useState(false);

  const [sessionFormData, setSessionFormData] = useState({
    title: '',
    subjectId: '',
    topicId: '',
    level: EDUCATION_LEVELS[0].value as EducationLevel,
    date: '',
    time: '',
    duration: 60,
    studentIds: [] as string[],
  });

  const loadSubjects = async (educationLevel?: string) => {
    try {
      const data = await subjectsAPI.getAll({ education_level: educationLevel });
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error('Failed to load subjects:', error);
    }
  };

  useEffect(() => {
    if (sessionFormData.level) {
      loadSubjects(sessionFormData.level);
      setSessionFormData(prev => ({ ...prev, subjectId: '', topicId: '' }));
      setTopics([]);
      setTopicSearch('');
      setLessonPickerOpen(true);
      setContinuityInfo(null);
    }
  }, [sessionFormData.level]);

  useEffect(() => {
    if (open) {
      loadSubjects(sessionFormData.level);
    } else {
      setCreatedSession(null);
      setContinuityInfo(null);
      setLessonPickerOpen(true);
    }
  }, [open]);

  const loadTopics = async (subjectId: string) => {
    try {
      const data = await subjectsAPI.getTopics(subjectId);
      setTopics(data.topics || []);
      setTopicSearch('');
      setLessonPickerOpen(true);
    } catch (error) {
      console.error('Failed to load topics:', error);
      setTopics([]);
    }
  };

  const handleCreateNewSubject = async () => {
    if (!newSubjectName || !newSubjectLevel) {
      toast.error('Please enter subject name and education level');
      return;
    }
    try {
      const result = await subjectsAPI.create({
        name: newSubjectName,
        education_level: newSubjectLevel,
        auto_generate_topics: true,
      });
      await loadSubjects();
      setSessionFormData({ ...sessionFormData, subjectId: result.id });
      setShowNewSubject(false);
      setNewSubjectName('');
      setNewSubjectLevel('');
      toast.success('Subject created successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create subject');
    }
  };

  const handleCreateSession = async () => {
    if (!sessionFormData.subjectId || !sessionFormData.title || !sessionFormData.topicId) {
      toast.error('Please select a subject, lesson, and session title');
      return;
    }

    try {
      setCreating(true);
      let scheduledStart = null;
      if (sessionFormData.date && sessionFormData.time) {
        scheduledStart = new Date(`${sessionFormData.date}T${sessionFormData.time}`);
      }

      const result = await sessionAPI.create({
        title: sessionFormData.title,
        subject_id: sessionFormData.subjectId,
        topic_id: sessionFormData.topicId || undefined,
        duration_minutes: sessionFormData.duration,
        scheduled_start: scheduledStart ? scheduledStart.toISOString() : undefined,
        student_ids: sessionFormData.studentIds,
        previous_session_id: continuityInfo?.found ? continuityInfo.session_id : undefined,
        ai_config: {
          llm_enabled: aiConfig.llmEnabled,
          tts_enabled: aiConfig.ttsEnabled,
          stt_enabled: aiConfig.sttEnabled,
          auto_explain: aiConfig.autoExplain,
          suggest_videos: aiConfig.suggestVideos,
          generate_assignments: aiConfig.generateAssignments,
          llm_model: aiConfig.llmModel,
        },
      });

      toast.success('Session created. Review the prep material before going live.');
      setCreatedSession(result?.session || null);

      setSessionFormData({
        title: '',
        subjectId: '',
        topicId: '',
        level: EDUCATION_LEVELS[0].value as EducationLevel,
        date: '',
        time: '',
        duration: 60,
        studentIds: [],
      });
      setContinuityInfo(null);
      setLessonPickerOpen(true);

      onSessionCreated(result?.session);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const lessonMaterial = createdSession?.context?.lesson_materials;
  const previewOutline = createdSession?.session_outline || lessonMaterial?.outline || [];
  const previewClassNote = createdSession?.class_notes || lessonMaterial?.class_note;
  const previewQuiz = createdSession?.pre_session_quiz?.questions || lessonMaterial?.pop_quiz || [];
  const previewAssignment = createdSession?.take_home_assignment || lessonMaterial?.assignment;
  const previewTips = createdSession?.context?.teacher_tips || lessonMaterial?.teacher_tips || [];
  const selectedSubject = subjects.find((subject) => subject.id === sessionFormData.subjectId);
  const selectedTopic = topics.find((topic) => topic.id === sessionFormData.topicId);
  const filteredTopics = useMemo(() => {
    const query = topicSearch.trim().toLowerCase();
    if (!query) return topics;
    return topics.filter((topic) => {
      const label = formatTopicLike(topic).toLowerCase();
      return label.includes(query) || (topic.term || '').toLowerCase().includes(query);
    });
  }, [topics, topicSearch]);
  const topicsByTerm = useMemo(() => {
    return filteredTopics.reduce<Record<string, typeof filteredTopics>>((groups, topic) => {
      const term = topic.term || 'Lessons';
      if (!groups[term]) groups[term] = [];
      groups[term].push(topic);
      return groups;
    }, {});
  }, [filteredTopics]);

  useEffect(() => {
    let cancelled = false;
    const subjectId = sessionFormData.subjectId;
    const studentIds = sessionFormData.studentIds;

    if (!open || !subjectId || studentIds.length === 0) {
      setContinuityInfo(null);
      return;
    }

    setContinuityLoading(true);
    sessionAPI.getLastHistory(subjectId, studentIds)
      .then((data) => {
        if (cancelled) return;
        setContinuityInfo(data?.found ? data : null);
        if (data?.found && data.topic_id && !sessionFormData.topicId) {
          setSessionFormData((prev) => {
            if (prev.topicId || prev.subjectId !== subjectId) return prev;
            const topic = topics.find((item) => item.id === data.topic_id);
            const topicLabel = topic ? formatTopicLike(topic) : data.topic_name;
            return {
              ...prev,
              topicId: data.topic_id,
              title: prev.title.trim() ? prev.title : `${selectedSubject?.name || 'Lesson'}: ${topicLabel}`,
            };
          });
          setLessonPickerOpen(false);
        }
      })
      .catch(() => {
        if (!cancelled) setContinuityInfo(null);
      })
      .finally(() => {
        if (!cancelled) setContinuityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sessionFormData.subjectId, sessionFormData.studentIds, sessionFormData.topicId, selectedSubject?.name, topics]);

  const handleTopicSelect = (topic: { id: string; name: string }) => {
    const topicLabel = formatTopicLike(topic);
    setSessionFormData((prev) => ({
      ...prev,
      topicId: topic.id,
      title: prev.title.trim() ? prev.title : `${selectedSubject?.name || 'Lesson'}: ${topicLabel}`,
    }));
    setLessonPickerOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col border-0 shadow-2xl overflow-hidden p-0">
        <div className="h-1.5 bg-gradient-to-r from-teal-500 to-teal-600 shrink-0" />
        <div className="p-6 shrink-0 pb-2">
          <DialogTitle className="text-2xl">Create New Session</DialogTitle>
          <DialogDescription>Schedule a new live teaching session with AI configuration</DialogDescription>
        </div>
        <div className="flex-1 overflow-y-auto p-6 pt-0">
          {createdSession ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-wider text-primary">Teacher preparation pack</p>
                <h3 className="mt-1 text-lg font-semibold">{createdSession.context?.topic || createdSession.title}</h3>
                <p className="text-sm text-muted-foreground">
                  Review this outline and class note before going live. This material is cached for the class, subject, and topic, then copied into this session.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ListChecks className="h-4 w-4 text-primary" />
                    Lesson outline
                  </h4>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    {previewOutline.length > 0 ? previewOutline.map((item: string, idx: number) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-primary">{idx + 1}.</span>
                        <span>{item}</span>
                      </li>
                    )) : <li>Outline is still preparing. Open the session again in a moment.</li>}
                  </ol>
                </div>

                <div className="rounded-lg border p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ClipboardCheck className="h-4 w-4 text-primary" />
                    Quick checks
                  </h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>{previewQuiz.length} pre-session question{previewQuiz.length === 1 ? '' : 's'} prepared.</p>
                    {previewAssignment?.instructions && (
                      <div className="space-y-2">
                        <p className="text-foreground">Take-home assignment</p>
                        <p>{previewAssignment.instructions}</p>
                        {Array.isArray(previewAssignment.tasks) && previewAssignment.tasks.length > 0 && (
                          <ol className="list-decimal space-y-1 pl-5">
                            {previewAssignment.tasks.map((task: string, idx: number) => (
                              <li key={idx}>{task}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                    {previewTips.length > 0 && (
                      <div>
                        <p className="text-foreground">Teacher tips</p>
                        <ul className="list-disc pl-5">
                          {previewTips.slice(0, 3).map((tip: string, idx: number) => <li key={idx}>{tip}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-primary" />
                  Class note
                </h4>
                <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-4 text-sm leading-7 text-muted-foreground">
                  <AcademicMarkdown>
                    {previewClassNote?.content || 'Class note is still preparing. Open the session again in a moment.'}
                  </AcademicMarkdown>
                </div>
              </div>
            </div>
          ) : (
          <div className="space-y-6 pb-2">
          <div className="space-y-2">
            <Label>Session Title</Label>
            <Input
              placeholder="e.g., Introduction to Algebra"
              className="input-premium"
              value={sessionFormData.title}
              onChange={(e) => setSessionFormData({ ...sessionFormData, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Education Level</Label>
              <Select
                value={sessionFormData.level}
                onValueChange={(val) => setSessionFormData({ ...sessionFormData, level: val as EducationLevel })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                 <SelectContent>
                  {EDUCATION_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-foreground">
              <Label>Subject</Label>
              {showNewSubject ? (
                <div className="space-y-2">
                  <Input
                    placeholder="New subject name"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    className="input-premium"
                  />
                  <Select value={newSubjectLevel} onValueChange={setNewSubjectLevel}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Education level" />
                    </SelectTrigger>
                     <SelectContent>
                      {EDUCATION_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateNewSubject} className="btn-primary rounded-lg">Create</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowNewSubject(false)} className="rounded-lg">Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Select
                    value={sessionFormData.subjectId}
                    onValueChange={(val) => {
                      setSessionFormData({ ...sessionFormData, subjectId: val, topicId: '' });
                      setContinuityInfo(null);
                      loadTopics(val);
                    }}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                      {subjects.length === 0 && <div className="p-2 text-xs text-muted-foreground italic">No subjects found</div>}
                    </SelectContent>
                  </Select>
                  <Button variant="link" size="sm" onClick={() => setShowNewSubject(true)} className="p-0 h-auto text-xs">
                    + Create new subject
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Label>Lesson</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose from the class and subject curriculum path.
                  </p>
                </div>
                {selectedTopic && (
                  <p className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                    Selected: {formatTopicLike(selectedTopic)}
                  </p>
                )}
              </div>

              {selectedTopic && !lessonPickerOpen ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wider text-primary">Selected lesson</p>
                        <p className="text-sm font-medium leading-6 text-foreground">{formatTopicLike(selectedTopic)}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLessonPickerOpen(true)}
                      className="rounded-lg"
                    >
                      Change lesson
                    </Button>
                  </div>
                </div>
              ) : (
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={topicSearch}
                    onChange={(event) => setTopicSearch(event.target.value)}
                    placeholder={sessionFormData.subjectId ? 'Search lessons...' : 'Select a subject first'}
                    disabled={!sessionFormData.subjectId}
                    className="pl-9"
                  />
                </div>

                {!sessionFormData.subjectId ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Select a class and subject to load available lessons.
                  </div>
                ) : topics.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No lessons found for this subject yet.
                  </div>
                ) : filteredTopics.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No lesson matches your search.
                  </div>
                ) : (
                  <ScrollArea className="h-72 pr-3">
                    <div className="space-y-4">
                      {Object.entries(topicsByTerm).map(([term, termTopics]) => (
                        <div key={term} className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                            {term}
                          </p>
                          <div className="grid gap-2">
                            {termTopics.map((topic, index) => {
                              const selected = sessionFormData.topicId === topic.id;
                              return (
                                <button
                                  key={topic.id}
                                  type="button"
                                  onClick={() => handleTopicSelect(topic)}
                                  className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                                    selected
                                      ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                                      : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5'
                                  }`}
                                >
                                  <div className="flex gap-3">
                                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                                      selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                    }`}>
                                      {topic.display_order || index + 1}
                                    </span>
                                    <span className="min-w-0 text-sm font-medium leading-6">
                                      {formatTopicLike(topic)}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
              )}
            </div>
          </div>

          {(continuityLoading || continuityInfo) && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <History className="h-4 w-4" />
                </span>
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {continuityLoading ? 'Checking previous class...' : 'Previous class continuity found'}
                  </p>
                  {continuityInfo && (
                    <>
                      <p className="text-xs text-muted-foreground">
                        EduNexus will connect this session to the last {selectedSubject?.name || 'subject'} class{continuityInfo.topic_name ? ` on ${continuityInfo.topic_name}` : ''}.
                      </p>
                      {continuityInfo.continuity_notes && (
                        <div className="rounded-lg bg-background/80 p-3 text-xs leading-6 text-muted-foreground">
                          {continuityInfo.continuity_notes}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {userRole?.toLowerCase() === 'teacher' && (
              <div className="space-y-2">
                <Label>Select Students (choose one or more)</Label>
                {linkedStudents.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                    {linkedStudents.map((student) => (
                      <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sessionFormData.studentIds.includes(student.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSessionFormData({
                                ...sessionFormData,
                                studentIds: [...sessionFormData.studentIds, student.id],
                              });
                            } else {
                              setSessionFormData({
                                ...sessionFormData,
                                studentIds: sessionFormData.studentIds.filter(id => id !== student.id),
                              });
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">
                          {student.name || student.email}
                          <span className="text-xs text-muted-foreground ml-2">
                            ({student.grade_level} - {student.education_level})
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-2 bg-slate-50 dark:bg-slate-800 rounded">
                    No students linked yet. Add students from the Students menu to assign them to sessions.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Select
                value={sessionFormData.duration.toString()}
                onValueChange={(val) => setSessionFormData({ ...sessionFormData, duration: parseInt(val) })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                  <SelectItem value="120">120 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                className="input-premium"
                value={sessionFormData.date}
                onChange={(e) => setSessionFormData({ ...sessionFormData, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input
                type="time"
                className="input-premium"
                value={sessionFormData.time}
                onChange={(e) => setSessionFormData({ ...sessionFormData, time: e.target.value })}
              />
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium mb-4 flex items-center gap-2">
              <Brain className="w-5 h-5 text-teal-600" />
              AI Configuration for This Session
            </h4>
            <AITogglePanel config={aiConfig} onChange={onAiConfigChange} />
          </div>
          </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-6 pt-2 shrink-0 border-t border-border mt-2 bg-background">
          {createdSession ? (
            <Button onClick={() => onOpenChange(false)} className="btn-primary rounded-xl">
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={handleCreateSession} disabled={creating} className="btn-primary rounded-xl">
                {creating ? 'Preparing...' : 'Create Session'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
