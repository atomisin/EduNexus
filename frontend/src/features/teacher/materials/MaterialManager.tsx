import React, { useState, useEffect } from 'react';
import { FolderOpen, Plus, Loader2, FileText, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { materialsAPI } from '@/services/api';
import { toast } from 'sonner';
import { EDUCATION_LEVELS } from '../../../constants/educationLevels';

interface MaterialManagerProps {
  subjectId: string;
  subjectName: string;
  onClose: () => void;
}

export const MaterialManager = ({ subjectId, subjectName, onClose }: MaterialManagerProps) => {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadData, setUploadData] = useState({
    title: '',
    description: '',
    subject: subjectName,
    topic: '',
    educationLevel: EDUCATION_LEVELS[0].value as string,
    gradeLevel: EDUCATION_LEVELS[0].label as string,
    videoUrl: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const EDUCATION_LEVEL_MAP = Object.fromEntries(
    EDUCATION_LEVELS.map(l => [l.value, [l.label]])
  ) as Record<string, string[]>;

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const data = await materialsAPI.getMine({ subject: subjectId });
      setMaterials(data || []);
    } catch (error) {
      console.error('Failed to load materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subjectId) {
      loadMaterials();
    }
  }, [subjectId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if ((!selectedFile && !uploadData.videoUrl) || !uploadData.title) {
      toast.error('Please fill in required fields (Title) and select a file or video link');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', uploadData.title);
      formData.append('description', uploadData.description);
      formData.append('subject', subjectName);
      formData.append('subject_id', subjectId);
      formData.append('topic', uploadData.topic);
      formData.append('education_level', uploadData.educationLevel);
      formData.append('grade_level', uploadData.gradeLevel);
      formData.append('video_url', uploadData.videoUrl);
      if (selectedFile) formData.append('file', selectedFile);

      await materialsAPI.upload(formData);
      toast.success('Material uploaded successfully!');
      setShowUploadDialog(false);
      setUploadData({ title: '', description: '', subject: subjectName, topic: '', educationLevel: EDUCATION_LEVELS[0].value, gradeLevel: EDUCATION_LEVELS[0].label, videoUrl: '' });
      setSelectedFile(null);
      loadMaterials();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload material');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (materialId: string) => {
    if (!confirm('Are you sure you want to delete this material?')) return;
    try {
      await materialsAPI.delete(materialId);
      toast.success('Material deleted');
      loadMaterials();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete material');
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <FolderOpen className="text-teal-600" />
              Materials: {subjectName}
            </DialogTitle>
            <Button onClick={() => setShowUploadDialog(true)} className="btn-primary rounded-xl shrink-0">
              <Plus className="w-4 h-4 mr-2" /> New Material
            </Button>
          </div>
          <DialogDescription>
            Manage learning resources for {subjectName}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : materials.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600">No materials yet</h3>
            <p className="text-slate-500 mt-1">Upload your first learning material to get started</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {materials.map((material) => (
              <Card key={material.id} className="hover-lift">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{material.title}</h3>
                        <p className="text-sm text-slate-500">{material.subject} • <span className="text-teal-600">{material.grade_level || 'General'}</span></p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">{material.file_type}</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <span className="text-xs text-slate-400">{material.download_count || 0} downloads</span>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(material.id)}>
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Upload Material</DialogTitle>
              <DialogDescription>Upload learning materials tailored to specific classes</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={uploadData.title}
                  onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
                  placeholder="e.g., Introduction to Algebra Notes"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Education Level *</Label>
                  <Select
                    value={uploadData.educationLevel}
                    onValueChange={(val) => {
                      const levels = EDUCATION_LEVEL_MAP[val] || [];
                      setUploadData({ ...uploadData, educationLevel: val, gradeLevel: levels[0] || '' });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
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
                  <Label>Class / Grade *</Label>
                  <Select
                    value={uploadData.gradeLevel}
                    onValueChange={(val) => setUploadData({ ...uploadData, gradeLevel: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {(EDUCATION_LEVEL_MAP[uploadData.educationLevel] || []).map((grade: string) => (
                        <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Subject *</Label>
                  <Input
                    value={uploadData.subject}
                    disabled
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Specific Topic</Label>
                  <Input
                    value={uploadData.topic}
                    onChange={(e) => setUploadData({ ...uploadData, topic: e.target.value })}
                    placeholder="e.g., Algebra"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Required: File OR Video Link</Label>
                  <Input type="file" onChange={handleFileChange} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Video Link (e.g., YouTube)</Label>
                <Input
                  value={uploadData.videoUrl}
                  onChange={(e) => setUploadData({ ...uploadData, videoUrl: e.target.value })}
                  placeholder="https://youtube.com/..."
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  placeholder="Brief description of the material"
                />
              </div>

              <div className="pt-2">
                <Button onClick={handleUpload} disabled={uploading} className="w-full">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {uploading ? 'Uploading...' : 'Upload Secure Material'}
                </Button>
                <p className="text-xs text-center text-slate-500 mt-2 flex items-center justify-center gap-1">
                  <Network className="w-3 h-3" /> AI Tutor context will be restricted to students of this class.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};
