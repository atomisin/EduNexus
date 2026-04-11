import { BookMarked, FileText, ChevronUp, ChevronDown, ExternalLink, Trash2, FileUp, Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Subject {
  id: string;
  name: string;
  code: string;
  color: string;
}

interface SubjectListProps {
  subjects: Subject[];
  enrolledSubjects: string[];
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  loading: boolean;
  handleEnroll: (id: string, enrolled: boolean) => Promise<void>;
  materials: any[];
  expandedSubjectId: string | null;
  setExpandedSubjectId: (id: string | null) => void;
  handleDeleteMaterial: (id: string) => Promise<void>;
  user: any;
  profile: any;
  customCourseName: string;
  setCustomCourseName: (val: string) => void;
  isGeneratingCourse: boolean;
  handleGenerateCustomCourse: () => Promise<void>;
  setUploadSubject: (val: string) => void;
  setShowUploadModal: (val: boolean) => void;
}

export const SubjectList = ({
  subjects,
  enrolledSubjects,
  searchQuery,
  setSearchQuery,
  loading,
  handleEnroll,
  materials,
  expandedSubjectId,
  setExpandedSubjectId,
  handleDeleteMaterial,
  user,
  profile,
  customCourseName,
  setCustomCourseName,
  isGeneratingCourse,
  handleGenerateCustomCourse,
  setUploadSubject,
  setShowUploadModal
}: SubjectListProps) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Subjects</h2>
        <Input placeholder="Search subjects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-64" />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : subjects.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((subject) => {
            const isEnrolled = enrolledSubjects.includes(subject.id);
            const subjectColor = subject.color || 'hsl(var(--primary))';

            return (
              <Card key={subject.id} className="overflow-hidden hover:shadow-xl transition-all duration-300 border-slate-200/60 dark:border-slate-800/60 hover:-translate-y-1">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm bg-primary/10 border border-primary/20 text-primary"
                    >
                      <BookMarked className="w-6 h-6" />
                    </div>
                    {isEnrolled && (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 font-bold">
                        Enrolled
                      </Badge>
                    )}
                  </div>

                  <div className="mb-5">
                    <h3 className="font-bold text-lg leading-tight mb-1">{subject.name}</h3>
                    <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{subject.code || 'CORE-SUBJ'}</p>
                  </div>

                  <Button
                    className={`w-full font-bold transition-all rounded-xl ${isEnrolled
                      ? "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                      }`}
                    variant={isEnrolled ? "ghost" : "default"}
                    onClick={() => handleEnroll(subject.id, isEnrolled)}
                  >
                    {isEnrolled ? "Unenroll" : "Enroll Now"}
                  </Button>

                  {/* Materials Section */}
                  {isEnrolled && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => setExpandedSubjectId(expandedSubjectId === subject.id ? null : subject.id)}
                        className="flex items-center justify-between w-full text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-primary transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Materials ({materials.filter(m => m.subject === subject.name).length})
                        </span>
                        {expandedSubjectId === subject.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {expandedSubjectId === subject.id && (
                        <div className="mt-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                          {materials.filter(m => m.subject === subject.name).length > 0 ? (
                            materials.filter(m => m.subject === subject.name).map((material) => (
                              <div key={material.id} className="group flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm shrink-0">
                                    <FileText className="w-4 h-4 text-slate-500" />
                                  </div>
                                  <div className="truncate">
                                    <p className="text-xs font-bold truncate">{material.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{material.uploader_id === user.id ? 'You' : material.uploader_name}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <a
                                    href={material.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-500 hover:text-primary transition-colors"
                                    title="View Material"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                  {material.uploader_id === user.id && (
                                    <button
                                      onClick={() => handleDeleteMaterial(material.id)}
                                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md text-slate-400 hover:text-red-500 transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-center py-4 text-muted-foreground italic">No materials uploaded yet</p>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-[10px] h-8 font-bold text-primary hover:text-primary-foreground hover:bg-primary/10"
                            onClick={() => {
                              setUploadSubject(subject.name);
                              setShowUploadModal(true);
                            }}
                          >
                            <FileUp className="w-3 h-3 mr-1" /> Add Material
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <BookMarked className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No subjects available</p>
        </div>
      )}

      {profile?.education_level === 'professional' && (
        <Card className="mt-8 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="w-5 h-5" /> Generate a Custom Course
            </CardTitle>
            <p className="text-sm text-primary/70">
              As a professional student, you can generate a tailored "Zero to Hero" syllabus for any topic you want to master.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 max-w-lg">
              <Input
                placeholder="e.g., Advanced System Design, Cloud Architecture, Digital Marketing"
                value={customCourseName}
                onChange={(e) => setCustomCourseName(e.target.value)}
                disabled={isGeneratingCourse}
                spellCheck={true}
                className="bg-white dark:bg-slate-900 border-primary/20 focus-visible:ring-primary"
              />
              <Button
                onClick={async () => {
                   if (isGeneratingCourse) return;
                   await handleGenerateCustomCourse();
                }}
                disabled={isGeneratingCourse || !customCourseName.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground whitespace-nowrap"
              >
                {isGeneratingCourse ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  'Generate Course'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
