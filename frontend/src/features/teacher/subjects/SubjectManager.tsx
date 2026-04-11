import React, { useState, useEffect } from 'react';
import { Plus, BookOpen, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { subjectsAPI, materialsAPI } from '@/services/api';
import { toast } from 'sonner';
import { MaterialManager } from '../materials/MaterialManager';
import { EDUCATION_LEVELS } from '../../../constants/educationLevels';

export const SubjectManager = () => {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [globalSubjects, setGlobalSubjects] = useState<any[]>([]);
  const [newSubject, setNewSubject] = useState({
    id: '',
    name: '',
    educationLevel: EDUCATION_LEVELS[0].value as string,
    curriculumType: 'WAEC',
    description: '',
    autoGenerateTopics: true
  });
  const [managingSubject, setManagingSubject] = useState<{ id: string, name: string } | null>(null);
  const [selectedLevel, setSelectedLevel] = useState('all');

  useEffect(() => {
    loadSubjects();
  }, []);

  // Sync newSubject defaults when selectedLevel changes
  useEffect(() => {
    if (selectedLevel !== 'all') {
      setNewSubject(prev => ({
        ...prev,
        educationLevel: selectedLevel,
        // Default curriculum for the level
        curriculumType: (selectedLevel.startsWith('jss_') || selectedLevel.startsWith('ss_')) ? 'WAEC' : 'Custom'
      }));
    }
  }, [selectedLevel]);

  const loadSubjects = async () => {
    setLoading(true);
    try {
      const data = await subjectsAPI.getAll({ mine: true });
      setSubjects(data.subjects || []);

      const globalData = await subjectsAPI.getAll();
      setGlobalSubjects(globalData.subjects || []);
    } catch (error) {
      console.error('Failed to load subjects:', error);
      setSubjects([]);
      setGlobalSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubject = async () => {
    if (!newSubject.name && newSubject.educationLevel === 'professional') {
      toast.error('Course name is required');
      return;
    }
    if (!newSubject.id && newSubject.educationLevel !== 'professional') {
      toast.error('Please select a subject from the list to add to your curriculum');
      return;
    }
    try {
      await subjectsAPI.create({
        id: newSubject.educationLevel !== 'professional' ? newSubject.id : undefined,
        name: newSubject.name || globalSubjects.find(s => s.id === newSubject.id)?.name || 'Unknown',
        education_level: newSubject.educationLevel,
        curriculum_type: newSubject.curriculumType,
        description: newSubject.description,
        auto_generate_topics: newSubject.autoGenerateTopics
      });
      toast.success(newSubject.educationLevel === 'professional' ? 'Course created successfully! AI is generating topics...' : 'Subject linked to your portfolio successfully!');
      setShowCreateDialog(false);
      setNewSubject({ id: '', name: '', educationLevel: EDUCATION_LEVELS[0].value, curriculumType: 'WAEC', description: '', autoGenerateTopics: true });
      loadSubjects();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add subject');
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile || !selectedSubject) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', uploadFile.name);
      formData.append('subject', selectedSubject.name);
      formData.append('subject_id', selectedSubject.id);
      formData.append('education_level', selectedSubject.education_level);
      formData.append('file', uploadFile);
      formData.append('is_public', 'false');

      await materialsAPI.upload(formData);
      toast.success('Material uploaded and linked to ' + selectedSubject.name);
      setShowUploadModal(false);
      setUploadFile(null);
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const educationConfig = {
    primary: {
      color: 'from-teal-500 to-emerald-500',
      bg: 'bg-teal-50 dark:bg-teal-950/20',
      text: 'text-teal-700 dark:text-teal-300',
      border: 'border-teal-200 dark:border-teal-800'
    },
    secondary: {
      color: 'from-teal-500 to-teal-600',
      bg: 'bg-teal-50 dark:bg-teal-950/20',
      text: 'text-teal-700 dark:text-teal-300',
      border: 'border-teal-200 dark:border-teal-800'
    },
    professional: {
      color: 'from-amber-500 to-orange-500',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800'
    }
  };

  const ALL_LEVELS = EDUCATION_LEVELS.map(level => ({
    id: level.value,
    label: level.label,
    category: level.value.startsWith('jss_') || 
              level.value.startsWith('ss_') 
              ? 'secondary' 
              : level.value.startsWith('primary_')
              ? 'primary'
              : level.value === 'professional'
              ? 'professional'
              : 'pre-primary'
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Subject Management</h2>
          <p className="text-slate-500 mt-1">Create and manage subjects across all education levels</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-2" /> Add Subject
        </Button>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <label
            htmlFor="level-select"
            className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
          >
            Education Level:
          </label>
          <select
            id="level-select"
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50 min-w-[200px]"
          >
            <option value="all">All Subjects</option>
            {ALL_LEVELS.map(level => (
              <option key={level.id} value={level.id}>
                {level.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {loading ? (
            <div className="col-span-2 flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (selectedLevel === 'all' ? subjects : subjects.filter((s: any) => s.education_level === selectedLevel)).map((subject: any) => {
            const eduCategory = subject.education_level?.split('_')[0] || 'secondary';
            const config = educationConfig[eduCategory as keyof typeof educationConfig] || educationConfig.secondary;
            return (
              <Card key={subject.id} className="group hover-lift overflow-hidden border-0 shadow-lg">
                <div className={`h-1.5 bg-gradient-to-r ${config.color}`} />
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-xl ${config.bg} flex items-center justify-center`}>
                        <BookOpen className={`w-7 h-7 ${config.text}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-xl text-slate-900 dark:text-slate-100">{subject.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={`text-xs ${config.border} ${config.text}`}>
                            {subject.education_level?.replace('_', ' ').toUpperCase()}
                          </Badge>
                          <span className="text-sm text-slate-500">{subject.curriculum_type}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 line-clamp-2">{subject.description || 'No description'}</p>

                        <div className="flex items-center gap-4 mt-6">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg gap-2"
                            onClick={() => {
                              setSelectedSubject(subject);
                              setShowUploadModal(true);
                            }}
                          >
                            <Upload className="w-4 h-4" /> Upload Material
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => setManagingSubject({ id: subject.id, name: subject.name })}
                          >
                            Manage
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {((selectedLevel === 'all' ? subjects : subjects.filter((s: any) => s.education_level === selectedLevel)).length === 0) && !loading && (
            <div className="col-span-2 text-center py-12 bg-white dark:bg-slate-900/50 rounded-2xl border border-dashed">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No subjects found for {ALL_LEVELS.find(l => l.id === selectedLevel)?.label || 'All Subjects'}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">{newSubject.educationLevel === 'professional' ? 'Create Professional Course' : 'Create New Subject'}</DialogTitle>
            <DialogDescription>
              {newSubject.educationLevel === 'professional'
                ? 'Design a custom professional learning track powered by AI'
                : 'Add a new subject to your teaching portfolio'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
             <div className="space-y-2">
              <Label>{newSubject.educationLevel === 'professional' ? 'Course / Certification Name' : 'Select Subject'}</Label>
              {newSubject.educationLevel === 'professional' ? (
                <Input
                  placeholder="e.g., AWS Certified Solutions Architect"
                  value={newSubject.name}
                  onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                  className="input-premium"
                />
              ) : (
                <Select
                  modal={false}
                  value={newSubject.id}
                  onValueChange={(v) => {
                    const subj = globalSubjects.find(s => s.id === v);
                    setNewSubject({ ...newSubject, id: v, name: subj?.name || '' });
                  }}
                >
                  <SelectTrigger className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder="Select an existing subject..." />
                  </SelectTrigger>
                  <SelectContent>
                    {globalSubjects
                      .filter(s => s.education_level === newSubject.educationLevel && s.curriculum_type === newSubject.curriculumType)
                      .map(subject => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))
                    }
                    {globalSubjects.filter(s => s.education_level === newSubject.educationLevel && s.curriculum_type === newSubject.curriculumType).length === 0 && (
                      <SelectItem value="none" disabled>No subjects available for this level</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Education Level</Label>
                <Select
                  modal={false}
                  value={newSubject.educationLevel}
                  onValueChange={(v) => {
                    setNewSubject({
                      ...newSubject,
                      educationLevel: v,
                      curriculumType: v === 'professional' ? 'Custom' : newSubject.curriculumType
                    });
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATION_LEVELS.map(level => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Curriculum</Label>
                <Select
                  modal={false}
                  disabled={newSubject.educationLevel === 'professional'}
                  value={newSubject.curriculumType}
                  onValueChange={(v) => setNewSubject({ ...newSubject, curriculumType: v })}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WAEC">WAEC</SelectItem>
                    <SelectItem value="NECO">NECO</SelectItem>
                    <SelectItem value="Cambridge">Cambridge</SelectItem>
                    <SelectItem value="JAMB">JAMB</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                className="min-h-[100px] rounded-xl resize-none"
                placeholder={newSubject.educationLevel === 'professional'
                  ? "What skills will students gain from this professional course?"
                  : "Describe what students will learn..."}
                value={newSubject.description}
                onChange={(e) => setNewSubject({ ...newSubject, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3 p-4 bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900 rounded-xl">
              <Checkbox
                id="autoTopics"
                checked={newSubject.autoGenerateTopics}
                onCheckedChange={(checked) => setNewSubject({ ...newSubject, autoGenerateTopics: !!checked })}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="autoTopics" className="text-sm font-semibold text-teal-900 dark:text-teal-300 cursor-pointer">
                  Auto-generate curriculum with AI
                </Label>
                <p className="text-xs text-teal-600 dark:text-teal-500">
                  AI will create a comprehensive topic outline and learning objectives.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleCreateSubject} className="btn-primary rounded-xl">
              Create {newSubject.educationLevel === 'professional' ? 'Course' : 'Subject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-teal-600" />
              Upload Material: {selectedSubject?.name}
            </DialogTitle>
            <DialogDescription>
              Add documents or resources to this subject for AI processing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
             <div
              className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center hover:border-teal-500 transition-colors cursor-pointer bg-slate-50 dark:bg-slate-900/50"
              onClick={() => document.getElementById('subject-file-upload')?.click()}
            >
              <input
                id="subject-file-upload"
                type="file"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mx-auto mb-4">
                 <BookOpen className="w-6 h-6 text-teal-600" />
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {uploadFile ? uploadFile.name : 'Click to select or drag and drop'}
              </p>
              <p className="text-xs text-slate-500 mt-1">PDF, DOCX, or Image (Max 10MB)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadModal(false)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={handleFileUpload}
              disabled={!uploadFile || uploading}
              className="btn-primary rounded-xl"
            >
              {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</> : 'Start Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {managingSubject && (
        <MaterialManager
          subjectId={managingSubject.id}
          subjectName={managingSubject.name}
          onClose={() => setManagingSubject(null)}
        />
      )}
    </div>
  );
};
