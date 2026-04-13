import React, { useState, useEffect } from 'react';
import { Brain } from 'lucide-react';
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

import { subjectsAPI, sessionAPI } from '@/services/api';
import type { AIConfig, Subject, EducationLevel } from '@/types';

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiConfig: AIConfig;
  onAiConfigChange: (config: AIConfig) => void;
  linkedStudents: any[];
  userRole?: string;
  onSessionCreated: () => void;
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
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectLevel, setNewSubjectLevel] = useState('');

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
    }
  }, [sessionFormData.level]);

  useEffect(() => {
    if (open) {
      loadSubjects(sessionFormData.level);
    }
  }, [open]);

  const loadTopics = async (subjectId: string) => {
    try {
      const data = await subjectsAPI.getTopics(subjectId);
      setTopics(data.topics || []);
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
    if (!sessionFormData.subjectId || !sessionFormData.title) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      let scheduledStart = null;
      if (sessionFormData.date && sessionFormData.time) {
        scheduledStart = new Date(`${sessionFormData.date}T${sessionFormData.time}`);
      }

      await sessionAPI.create({
        title: sessionFormData.title,
        subject_id: sessionFormData.subjectId,
        topic_id: sessionFormData.topicId || undefined,
        duration_minutes: sessionFormData.duration,
        scheduled_start: scheduledStart ? scheduledStart.toISOString() : undefined,
        student_ids: sessionFormData.studentIds,
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

      toast.success('Session created successfully!');
      onOpenChange(false);

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

      onSessionCreated();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create session');
    }
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Topic (Optional)</Label>
              <Select
                value={sessionFormData.topicId}
                onValueChange={(val) => setSessionFormData({ ...sessionFormData, topicId: val === 'none' ? '' : val })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- No specific topic --</SelectItem>
                  {topics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                  {topics.length === 0 && sessionFormData.subjectId && <div className="p-2 text-xs text-muted-foreground italic">No topics for this subject</div>}
                </SelectContent>
              </Select>
            </div>

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
        </div>
        <div className="flex justify-end gap-3 p-6 pt-2 shrink-0 border-t border-border mt-2 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
          <Button onClick={handleCreateSession} className="btn-primary rounded-xl">
            Create Session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
