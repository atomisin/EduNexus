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
  const visibleSubjects = subjects.filter(subject =>
    !searchQuery || subject.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Subjects</h2>
          <p className="text-sm text-muted-foreground">Manage enrolled subjects and learning materials.</p>
        </div>
        <Input
          placeholder="Search subjects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full md:w-72"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : visibleSubjects.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_140px_140px] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Subject</span>
            <span>Status</span>
            <span>Materials</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-border">
            {visibleSubjects.map((subject) => {
              const isEnrolled = enrolledSubjects.includes(subject.id);
              const subjectMaterials = materials.filter(m => m.subject === subject.name);

              return (
                <div key={subject.id} className="px-4 py-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_140px_140px] md:items-center">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 text-primary shrink-0">
                        <BookMarked className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-tight truncate">{subject.name}</h3>
                        <p className="text-xs text-muted-foreground">Curriculum subject</p>
                      </div>
                    </div>

                    <div>
                      {isEnrolled ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          Enrolled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Available
                        </Badge>
                      )}
                    </div>

                    <button
                      disabled={!isEnrolled}
                      onClick={() => setExpandedSubjectId(expandedSubjectId === subject.id ? null : subject.id)}
                      className="flex items-center gap-2 text-sm text-muted-foreground disabled:opacity-40 md:justify-start"
                    >
                      <FileText className="w-4 h-4" />
                      {subjectMaterials.length} material{subjectMaterials.length === 1 ? '' : 's'}
                      {isEnrolled && (expandedSubjectId === subject.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>

                    <div className="flex justify-start md:justify-end">
                      <Button
                        size="sm"
                        variant={isEnrolled ? 'outline' : 'default'}
                        className="rounded-lg"
                        onClick={() => handleEnroll(subject.id, isEnrolled)}
                      >
                        {isEnrolled ? 'Unenroll' : 'Enroll'}
                      </Button>
                    </div>
                  </div>

                  {isEnrolled && expandedSubjectId === subject.id && (
                    <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
                      {subjectMaterials.length > 0 ? (
                        <div className="space-y-2">
                          {subjectMaterials.map((material) => (
                            <div key={material.id} className="flex items-center justify-between gap-3 rounded-lg bg-background border border-border p-2">
                              <div className="min-w-0 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{material.title}</p>
                                  <p className="text-xs text-muted-foreground">{material.uploader_id === user.id ? 'You' : material.uploader_name}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <a
                                  href={material.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                                  title="View material"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                                {material.uploader_id === user.id && (
                                  <button
                                    onClick={() => handleDeleteMaterial(material.id)}
                                    className="p-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    title="Delete material"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No materials uploaded yet.</p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-8 px-2 text-primary"
                        onClick={() => {
                          setUploadSubject(subject.name);
                          setShowUploadModal(true);
                        }}
                      >
                        <FileUp className="w-3.5 h-3.5 mr-1" /> Add material
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <BookMarked className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No subjects available</p>
        </div>
      )}

      {profile?.education_level === 'professional' && (
        <Card className="mt-8 border-primary/20 bg-primary/5 rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="w-5 h-5" /> Generate a Custom Course
            </CardTitle>
            <p className="text-sm text-primary/70">
              Create a tailored syllabus for a professional skill or certification.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:flex-row md:max-w-2xl">
              <Input
                placeholder="e.g., Cloud Architecture, Digital Marketing"
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
