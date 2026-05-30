import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, ClipboardCheck, FileText, History, ListChecks, Search, ShieldCheck, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { EDUCATION_LEVELS } from '@/constants/educationLevels';
import type { EducationLevel as SessionEducationLevel } from '@/constants/educationLevels';
import { AITogglePanel } from './AITogglePanel';
import AcademicMarkdown from '@/components/AcademicMarkdown';

import { subjectsAPI, sessionAPI } from '@/services/api';
import type { AIConfig, Subject, SessionPlanSummary, AssessmentArtifactSummary } from '@/types';
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
  const resolveInitialEducationLevel = (): SessionEducationLevel => {
    const supportedLevels = new Set<string>(EDUCATION_LEVELS.map((level) => level.value));
    const gradeToLevel: Record<string, SessionEducationLevel> = {
      'JSS1': 'jss_1',
      'JSS2': 'jss_2',
      'JSS3': 'jss_3',
      'SS1': 'ss_1',
      'SS2': 'ss_2',
      'SS3': 'ss_3',
      'P1': 'primary_1',
      'P2': 'primary_2',
      'P3': 'primary_3',
      'P4': 'primary_4',
      'P5': 'primary_5',
      'P6': 'primary_6',
    };

    for (const student of linkedStudents) {
      const normalizedGrade = String(student?.grade_level || '').trim().toUpperCase();
      if (gradeToLevel[normalizedGrade]) {
        return gradeToLevel[normalizedGrade];
      }

      const normalizedEducationLevel = String(student?.education_level || '').trim().toLowerCase();
      if (supportedLevels.has(normalizedEducationLevel)) {
        return normalizedEducationLevel as SessionEducationLevel;
      }
    }

    return EDUCATION_LEVELS[0].value as SessionEducationLevel;
  };

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
  const continuityPreview = continuityInfo?.session_plan?.teacher_stop_note || continuityInfo?.continuity_notes || '';

  const [sessionFormData, setSessionFormData] = useState({
    title: '',
    subjectId: '',
    topicId: '',
    level: resolveInitialEducationLevel(),
    date: '',
    time: '',
    duration: 60,
    studentIds: [] as string[],
  });
  const subjectCacheRef = React.useRef<Record<string, Subject[]>>({});

  const gradeFromEducationLevel = (level?: string) => {
    const gradeMap: Record<string, string> = {
      primary_1: 'P1',
      primary_2: 'P2',
      primary_3: 'P3',
      primary_4: 'P4',
      primary_5: 'P5',
      primary_6: 'P6',
      jss_1: 'JSS1',
      jss_2: 'JSS2',
      jss_3: 'JSS3',
      ss_1: 'SS1',
      ss_2: 'SS2',
      ss_3: 'SS3',
    };
    return level ? gradeMap[level] : undefined;
  };

  const loadSubjects = async (educationLevel?: string) => {
    try {
      const gradeLevel = gradeFromEducationLevel(educationLevel);
      const cacheKey = `${educationLevel || 'all'}:${gradeLevel || 'any'}:${userRole || 'user'}`;
      if (subjectCacheRef.current[cacheKey]) {
        setSubjects(subjectCacheRef.current[cacheKey]);
        return;
      }

      const mineData = await subjectsAPI.getAll({
        education_level: educationLevel,
        grade_level: gradeLevel,
        mine: true,
        light: true,
        exact_grade: Boolean(gradeLevel),
      });
      const ownSubjects = Array.isArray(mineData) ? mineData : (Array.isArray(mineData?.subjects) ? mineData.subjects : []);

      if (userRole === 'teacher') {
        const catalogData = await subjectsAPI.getAll({
          education_level: educationLevel,
          grade_level: gradeLevel,
          light: true,
          exact_grade: Boolean(gradeLevel),
        });
        const catalogSubjects = Array.isArray(catalogData) ? catalogData : (Array.isArray(catalogData?.subjects) ? catalogData.subjects : []);
        const merged = [...ownSubjects, ...catalogSubjects].reduce<Subject[]>((acc, subject) => {
          if (!acc.some((item) => item.id === subject.id)) {
            acc.push(subject);
          }
          return acc;
        }, []);
        subjectCacheRef.current[cacheKey] = merged;
        setSubjects(merged);
        return;
      }

      subjectCacheRef.current[cacheKey] = ownSubjects;
      setSubjects(ownSubjects);
    } catch (error) {
      console.error('Failed to load subjects:', error);
      setSubjects([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (sessionFormData.level) {
      loadSubjects(sessionFormData.level);
      setSessionFormData(prev => ({ ...prev, subjectId: '', topicId: '' }));
      setTopics([]);
      setTopicSearch('');
      setLessonPickerOpen(true);
      setContinuityInfo(null);
    }
  }, [open, sessionFormData.level]);

  useEffect(() => {
    if (open) {
      const inferredLevel = sessionFormData.subjectId ? sessionFormData.level : resolveInitialEducationLevel();
      setSessionFormData((prev) => (prev.level === inferredLevel ? prev : { ...prev, level: inferredLevel }));
      if (sessionFormData.level === inferredLevel) {
        loadSubjects(inferredLevel);
      }
    } else {
      setCreatedSession(null);
      setContinuityInfo(null);
      setLessonPickerOpen(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open || sessionFormData.subjectId || linkedStudents.length === 0) return;
    const inferredLevel = resolveInitialEducationLevel();
    setSessionFormData((prev) => (prev.level === inferredLevel ? prev : { ...prev, level: inferredLevel }));
  }, [open, linkedStudents, sessionFormData.subjectId]);

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
        grade_levels: gradeFromEducationLevel(newSubjectLevel) ? [gradeFromEducationLevel(newSubjectLevel) as string] : undefined,
        auto_generate_topics: true,
      });
      const createdSubjectId = result?.subject_id || result?.id;
      if (!createdSubjectId) {
        throw new Error('Subject creation succeeded but no subject id was returned.');
      }
      await loadSubjects(newSubjectLevel);
      setSessionFormData((prev) => ({
        ...prev,
        level: newSubjectLevel as SessionEducationLevel,
        subjectId: createdSubjectId,
        topicId: '',
      }));
      await loadTopics(createdSubjectId);
      setShowNewSubject(false);
      setNewSubjectName('');
      setNewSubjectLevel('');
      toast.success(result?.detail || 'Subject created successfully!');
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
        level: resolveInitialEducationLevel(),
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
  const sessionPlan: SessionPlanSummary | undefined = createdSession?.context?.session_plan;
  const assessmentArtifacts: Record<string, AssessmentArtifactSummary> = createdSession?.context?.assessment_artifacts || {};
  const previewOutline = createdSession?.session_outline || lessonMaterial?.outline || [];
  const previewClassNote = createdSession?.class_notes || lessonMaterial?.class_note;
  const previewQuiz = createdSession?.pre_session_quiz?.questions || lessonMaterial?.pop_quiz || [];
  const previewAssignment = createdSession?.take_home_assignment || lessonMaterial?.assignment;
  const previewTips = createdSession?.context?.teacher_tips || lessonMaterial?.teacher_tips || [];
  const previewAssessments = [
    { key: 'pre_session', label: 'Pre-session check' },
    { key: 'pop_quiz', label: 'Live pop quiz' },
    { key: 'post_session', label: 'Post-session check' },
  ].map((item) => ({ ...item, meta: assessmentArtifacts[item.key] })).filter((item) => item.meta);
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
    sessionAPI.getLastHistory(subjectId, studentIds, { timeoutMs: 15000, suppressFailureToast: true })
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-lg border border-border bg-background p-0 shadow-xl">
        <div className="h-1.5 bg-primary shrink-0" />
        <div className="p-6 shrink-0 pb-2">
          <DialogTitle className="text-2xl">Create new session</DialogTitle>
          <DialogDescription>Build one clear teaching session, connect it to the right lesson, and review the prep pack before class.</DialogDescription>
        </div>
        <div className="flex-1 overflow-y-auto p-6 pt-0">
          {createdSession ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-wider text-primary">Teacher preparation pack</p>
                <h3 className="mt-1 text-lg font-semibold">{createdSession.context?.topic || createdSession.title}</h3>
                <p className="text-sm text-muted-foreground">
                  Review the exact session slice before going live. EduNexus has trimmed the wider lesson into what best fits this duration, continuity point, and learner level.
                </p>
              </div>

              {sessionPlan && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <Target className="h-4 w-4 text-primary" />
                      Today&apos;s teaching goal
                    </h4>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {sessionPlan.session_goal || 'The session goal is still being prepared.'}
                    </p>
                    {sessionPlan.continuity_from_previous?.previous_teacher_note && (
                      <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
                        <p className="font-medium text-foreground">From the last class</p>
                        <p>{sessionPlan.continuity_from_previous.previous_teacher_note}</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <ArrowRight className="h-4 w-4 text-primary" />
                      Continuity
                    </h4>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>
                        <span className="text-foreground">Start from:</span>{' '}
                        {sessionPlan.recommended_start_segment || 'First planned segment'}
                      </p>
                      <p>
                        <span className="text-foreground">Planned stopping point:</span>{' '}
                        {sessionPlan.recommended_end_segment || 'Final planned segment'}
                      </p>
                      {sessionPlan.skipped_segments?.length ? (
                        <p>
                          <span className="text-foreground">Still remaining after this class:</span>{' '}
                          {sessionPlan.skipped_segments.map((item) => item.title).join(', ')}
                        </p>
                      ) : (
                        <p>This session plan can cover the full prepared chunk if time allows.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ListChecks className="h-4 w-4 text-primary" />
                    Lesson outline
                  </h4>
                  {sessionPlan?.planned_segments?.length ? (
                    <ol className="space-y-3 text-sm text-muted-foreground">
                      {sessionPlan.planned_segments.map((segment, idx) => {
                        const markers = (sessionPlan.quiz_markers || []).filter((marker: any) => marker.focus_segment_id === segment.segment_id);
                        return (
                          <li key={segment.segment_id || idx} className="space-y-2">
                            <div className="flex gap-2">
                              <span className="text-primary">{idx + 1}.</span>
                              <span>{segment.title}</span>
                            </div>
                            {markers.length > 0 && (
                              <div className="ml-6 flex flex-wrap gap-2">
                                {markers.map((marker: any) => (
                                  <span key={marker.marker_id} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary">
                                    {marker.label} · {marker.trigger_label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <ol className="space-y-2 text-sm text-muted-foreground">
                      {previewOutline.length > 0 ? previewOutline.map((item: string, idx: number) => (
                        <li key={idx} className="flex gap-2">
                          <span className="text-primary">{idx + 1}.</span>
                          <span>{item}</span>
                        </li>
                      )) : <li>Outline is still preparing. Open the session again in a moment.</li>}
                    </ol>
                  )}
                </div>

                <div className="rounded-lg border p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ClipboardCheck className="h-4 w-4 text-primary" />
                    Quick checks
                  </h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    {previewAssessments.length > 0 && (
                      <div className="space-y-2 rounded-lg border border-primary/15 bg-primary/5 p-3">
                        <p className="font-medium text-foreground">Assessment quality</p>
                        {previewAssessments.map(({ key, label, meta }) => {
                          const validated = meta?.validated === 'validated';
                          const usedFallback = Boolean(meta?.validation?.used_fallback);
                          const issues = meta?.validation?.issues || [];
                          return (
                            <div key={key} className="rounded-md border bg-background p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {validated ? (
                                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                                )}
                                <span className="font-medium text-foreground">{label}</span>
                                <span className={`rounded-full px-2 py-1 text-[11px] ${validated ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                  {validated ? 'Validated' : 'Needs review'}
                                </span>
                                {usedFallback && (
                                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                                    Fallback used
                                  </span>
                                )}
                              </div>
                              {issues.length > 0 && (
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                                  {issues.slice(0, 3).map((issue, index) => <li key={index}>{issue}</li>)}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p>{previewQuiz.length} session-scoped question{previewQuiz.length === 1 ? '' : 's'} prepared.</p>
                    {sessionPlan?.classwork_plan?.length ? (
                      <div className="space-y-2">
                        <p className="text-foreground">Classwork flow</p>
                        <ul className="list-disc space-y-1 pl-5">
                          {sessionPlan.classwork_plan.map((task, idx) => (
                            <li key={idx}>{task}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
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
                  <AcademicMarkdown variant="teacher-prep">
                    {previewClassNote?.content || 'Class note is still preparing. Open the session again in a moment.'}
                  </AcademicMarkdown>
                </div>
              </div>
            </div>
          ) : (
          <div className="space-y-6 pb-2">
          <div className="rounded-lg border border-border bg-subtle p-4 text-sm text-muted-foreground">
            Start with the class, subject, and lesson. EduNexus will connect continuity, prep, and teaching support around that choice.
          </div>
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
                onValueChange={(val) => setSessionFormData({ ...sessionFormData, level: val as SessionEducationLevel })}
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
                    </SelectContent>
                  </Select>
                  {subjects.length === 0 ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      No subjects are available for this class yet. Create one now or add subjects from the Subjects workspace first.
                    </p>
                  ) : null}
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
                      {continuityInfo.session_plan?.next_recommended_segment && (
                        <p className="text-xs text-muted-foreground">
                          Suggested resume point: {continuityInfo.session_plan.next_recommended_segment}
                        </p>
                      )}
                      {continuityPreview && (
                        <div className="rounded-lg bg-background/80 p-3 text-xs leading-6 text-muted-foreground">
                          {continuityPreview}
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
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-2 space-y-1">
                    {linkedStudents.map((student) => (
                      <label key={student.id} className="flex items-start gap-3 rounded-lg border border-transparent p-2 text-sm transition hover:border-primary/20 hover:bg-primary/5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sessionFormData.studentIds.includes(student.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSessionFormData((prev) => ({
                                ...prev,
                                studentIds: prev.studentIds.includes(student.id) ? prev.studentIds : [...prev.studentIds, student.id],
                              }));
                            } else {
                              setSessionFormData((prev) => ({
                                ...prev,
                                studentIds: prev.studentIds.filter(id => id !== student.id),
                              }));
                            }
                          }}
                          className="mt-0.5 rounded"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{student.name || student.email}</span>
                          <span className="block text-xs text-muted-foreground">
                            {student.grade_level} • {student.education_level}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-subtle p-3 text-xs text-muted-foreground">
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
            <h4 className="mb-4 flex items-center gap-2 font-medium">
              <Brain className="w-5 h-5 text-primary" />
              Teaching support for this session
            </h4>
            <AITogglePanel config={aiConfig} onChange={onAiConfigChange} />
          </div>
          </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-6 pt-2 shrink-0 border-t border-border mt-2 bg-background">
          {createdSession ? (
            <Button onClick={() => onOpenChange(false)} className="rounded-xl bg-primary hover:bg-primary/90">
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={handleCreateSession} disabled={creating} className="rounded-xl bg-primary hover:bg-primary/90">
                {creating ? 'Preparing...' : 'Create session'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};




