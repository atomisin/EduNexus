import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileUp, X } from 'lucide-react';

interface UploadMaterialModalProps {
  showUploadModal: boolean;
  setShowUploadModal: (show: boolean) => void;
  uploadSubject: string;
  setUploadSubject: (subject: string) => void;
  enrolledSubjects: string[];
  subjects: any[];
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;
  uploading: boolean;
  handleUpload: () => void;
}

export const UploadMaterialModal: React.FC<UploadMaterialModalProps> = ({
  showUploadModal,
  setShowUploadModal,
  uploadSubject,
  setUploadSubject,
  enrolledSubjects,
  subjects,
  uploadFile,
  setUploadFile,
  uploading,
  handleUpload
}) => {
  if (!showUploadModal) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <Card className="w-full max-w-md shadow-2xl border-0 overflow-hidden rounded-3xl animate-in zoom-in-95 duration-500">
        <CardHeader className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl font-black">Upload Course Material</CardTitle>
              <p className="text-teal-50 text-xs mt-1">Add context for your AI Tutor</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowUploadModal(false)} className="text-white hover:bg-white/20 rounded-full">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 bg-white dark:bg-slate-900 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Select Course</label>
            <Select value={uploadSubject} onValueChange={setUploadSubject}>
              <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
              <SelectContent>
                {(enrolledSubjects.length > 0
                  ? subjects.filter(s => enrolledSubjects.includes(s.id))
                  : subjects
                ).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
                {subjects.length === 0 && (
                  <SelectItem value="none" disabled>No courses available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold">File</label>
            <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
          </div>
          <Button
            onClick={handleUpload}
            disabled={!uploadFile || !uploadSubject || uploading}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold h-12 rounded-xl"
          >
            {uploading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <FileUp className="w-5 h-5 mr-2" />}
            {uploading ? 'Uploading to RAG Engine...' : 'Upload Material'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
