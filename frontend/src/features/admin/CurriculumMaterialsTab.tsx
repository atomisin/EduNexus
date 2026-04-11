import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { adminAPI } from '@/services/api';
import { EDUCATION_LEVELS } from '@/constants/educationLevels';

interface CurriculumMaterialsTabProps {
  isLoggedIn: boolean;
}

export const CurriculumMaterialsTab: React.FC<CurriculumMaterialsTabProps> = ({ isLoggedIn }) => {
  const [materials, setMaterials] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const [materialForm, setMaterialForm] = useState({
    title: '',
    description: '',
    subject: '',
    education_level: '',
    topic: '',
    file: null as File | null,
  });

  const [matFilters, setMatFilters] = useState({
    subject: '',
    education_level: '',
    search: '',
  });

  const fetchMaterials = async () => {
    try {
      const data = await adminAPI.listMaterials(matFilters);
      setMaterials(data);
    } catch (error: any) {
      toast.error('Failed to fetch materials: ' + error.message);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchMaterials();
    }
  }, [matFilters, isLoggedIn]);

  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialForm.file || !materialForm.title || !materialForm.subject || !materialForm.education_level) {
      toast.error('Please fill in all required fields and select a PDF file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('title', materialForm.title);
    formData.append('description', materialForm.description);
    formData.append('subject', materialForm.subject);
    formData.append('education_level', materialForm.education_level);
    formData.append('topic', materialForm.topic);
    formData.append('file', materialForm.file);

    try {
      await adminAPI.uploadMaterial(formData);
      toast.success('Material uploaded and processing started!');
      setMaterialForm({ title: '', description: '', subject: '', education_level: '', topic: '', file: null });
      fetchMaterials();
    } catch (error: any) {
      toast.error('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this material and all its chunks?')) return;
    try {
      await adminAPI.deleteMaterial(id);
      toast.success('Material deleted');
      fetchMaterials();
    } catch (error: any) {
      toast.error('Delete failed: ' + error.message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Upload Form */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-4 h-4" /> Bulk Upload
          </CardTitle>
          <CardDescription>Upload curriculum PDF materials</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUploadMaterial} className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="e.g. Intro to Algebra"
                value={materialForm.title}
                onChange={e => setMaterialForm({ ...materialForm, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input
                placeholder="e.g. Mathematics"
                value={materialForm.subject}
                onChange={e => setMaterialForm({ ...materialForm, subject: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Education Level *</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-transparent"
                value={materialForm.education_level}
                onChange={e => setMaterialForm({ ...materialForm, education_level: e.target.value })}
                required
              >
                <option value="">Select Level</option>
                {EDUCATION_LEVELS.map(level => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Topic (Optional)</Label>
              <Input
                placeholder="e.g. Polynomials"
                value={materialForm.topic}
                onChange={e => setMaterialForm({ ...materialForm, topic: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>PDF File *</Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={e => setMaterialForm({ ...materialForm, file: e.target.files?.[0] || null })}
                required
              />
            </div>
            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg" disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload Material
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Materials List */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Uploaded Materials</CardTitle>
              <CardDescription>Manage curriculum content</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Search..."
                className="w-32 h-8 text-xs"
                value={matFilters.search}
                onChange={e => setMatFilters({ ...matFilters, search: e.target.value })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {materials.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No materials found</p>
              </div>
            ) : (
              materials.map(mat => (
                <div key={mat.id} className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-md">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{mat.title}</h4>
                      <div className="flex gap-2 text-[10px] text-slate-500">
                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{(mat.subject || 'N/A').replace(/_/g, ' ')}</span>
                        <span className="bg-accent/10 text-amber-700 px-1.5 py-0.5 rounded uppercase font-bold">{(mat.education_level || 'N/A').replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteMaterial(mat.id)} className="text-slate-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
