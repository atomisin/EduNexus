import { BookMarked, LifeBuoy, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { StudentEmptyState } from '@/features/student/components/StudentStatePanel';
import { studentAPI } from '@/services/api';

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
  error?: string | null;
  handleEnroll: (id: string, enrolled: boolean) => Promise<void>;
  user: any;
  profile: any;
  customCourseName: string;
  setCustomCourseName: (val: string) => void;
  isGeneratingCourse: boolean;
  handleGenerateCustomCourse: () => Promise<void>;
}

export const SubjectList = ({
  subjects,
  enrolledSubjects,
  searchQuery,
  setSearchQuery,
  loading,
  error,
  handleEnroll,
  profile,
  customCourseName,
  setCustomCourseName,
  isGeneratingCourse,
  handleGenerateCustomCourse,
}: SubjectListProps) => {
  const [helpRequests, setHelpRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestTopic, setRequestTopic] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requestPriority, setRequestPriority] = useState('medium');
  const [requestSubject, setRequestSubject] = useState('');
  const [linkedTeachers, setLinkedTeachers] = useState<any[]>([]);
  const [requestTeacherId, setRequestTeacherId] = useState('');

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleSubjects = subjects
    .filter((subject) => !normalizedQuery || subject.name.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.name.localeCompare(right.name));
  const enrolledVisibleSubjects = visibleSubjects.filter((subject) => enrolledSubjects.includes(subject.id));
  const availableVisibleSubjects = visibleSubjects.filter((subject) => !enrolledSubjects.includes(subject.id));
  const hasTransientDataGap = Boolean(error) && subjects.length > 0 && enrolledSubjects.length === 0;
  const helpSubjectOptions = useMemo(
    () => (enrolledVisibleSubjects.length > 0 ? enrolledVisibleSubjects : visibleSubjects),
    [enrolledVisibleSubjects, visibleSubjects]
  );

  useEffect(() => {
    if (!requestSubject && helpSubjectOptions.length > 0) {
      setRequestSubject(helpSubjectOptions[0].name);
    }
  }, [helpSubjectOptions, requestSubject]);

  useEffect(() => {
    let cancelled = false;

    const loadRequestData = async () => {
      setRequestsLoading(true);
      try {
        const [requestsResult, teachersResult] = await Promise.all([
          studentAPI.getTopicRequests(),
          studentAPI.getMyTeachers(),
        ]);
        if (!cancelled) {
          setHelpRequests(Array.isArray(requestsResult) ? requestsResult : []);
          setLinkedTeachers(Array.isArray(teachersResult) ? teachersResult : []);
        }
      } catch (requestError: any) {
        if (!cancelled) {
          toast.error(requestError?.message || 'Could not load your help request workspace.');
        }
      } finally {
        if (!cancelled) {
          setRequestsLoading(false);
        }
      }
    };

    void loadRequestData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (linkedTeachers.length === 1 && !requestTeacherId) {
      setRequestTeacherId(linkedTeachers[0].id);
    }
  }, [linkedTeachers, requestTeacherId]);

  const submitHelpRequest = async () => {
    if (!requestSubject.trim()) {
      toast.error('Choose the subject you want help with first.');
      return;
    }
    if (!requestTopic.trim()) {
      toast.error('Add the topic or area you want help with.');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const response = await studentAPI.createTopicRequest({
        subject: requestSubject.trim(),
        topic_name: requestTopic.trim(),
        description: requestDescription.trim() || undefined,
        priority: requestPriority,
        preferred_teacher_id: requestTeacherId || undefined,
      });

      setHelpRequests((current) => [
        {
          id: response?.request_id || `temp-${Date.now()}`,
          topic_name: response?.topic_name || requestTopic.trim(),
          subject: response?.subject || requestSubject.trim(),
          priority: response?.priority || requestPriority,
          status: response?.status || 'pending',
          description: requestDescription.trim(),
          assigned_teacher_id: response?.assigned_teacher_id || requestTeacherId || null,
          assigned_teacher_name:
            linkedTeachers.find((teacher) => teacher.id === (response?.assigned_teacher_id || requestTeacherId))
              ?.full_name || null,
        },
        ...current,
      ]);
      setRequestTopic('');
      setRequestDescription('');
      setRequestPriority('medium');
      toast.success('Help request sent. Your teacher can now pick it up outside class.');
    } catch (requestError: any) {
      toast.error(requestError?.message || 'Could not send that help request.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const renderSubjectRow = (subject: Subject, tone: 'enrolled' | 'available') => {
    const isEnrolled = tone === 'enrolled';

    return (
      <div key={subject.id} className="px-3 py-2.5 sm:px-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:grid-cols-[minmax(0,1fr)_120px_140px] md:items-center md:gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <div className="h-8 w-8 shrink-0 rounded-lg border border-primary/20 bg-primary/10 text-primary flex items-center justify-center sm:h-9 sm:w-9">
              <BookMarked className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold leading-tight sm:text-base">{subject.name}</h3>
              <p className="text-xs text-muted-foreground">
                {isEnrolled ? 'In your current learning rhythm' : 'Available when you want to expand'}
              </p>
            </div>
          </div>

          <div className="justify-self-end md:justify-self-auto">
            {isEnrolled ? (
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 sm:text-xs"
              >
                Enrolled
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground sm:text-xs">
                Available
              </Badge>
            )}
          </div>

          <div className="col-span-2 flex justify-start md:col-span-1 md:justify-end">
            <Button
              size="sm"
              variant={isEnrolled ? 'outline' : 'default'}
              className="h-8 rounded-lg px-3"
              onClick={() => handleEnroll(subject.id, isEnrolled)}
            >
              {isEnrolled ? 'Unenroll' : 'Enroll'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderSection = ({
    title,
    description,
    count,
    sectionSubjects,
    tone,
    emptyTitle,
    emptyDescription,
  }: {
    title: string;
    description: string;
    count: number;
    sectionSubjects: Subject[];
    tone: 'enrolled' | 'available';
    emptyTitle: string;
    emptyDescription: string;
  }) => (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full text-[11px] font-semibold">
          {count} subject{count === 1 ? '' : 's'}
        </Badge>
      </div>

      {sectionSubjects.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_140px] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Subject</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-border">{sectionSubjects.map((subject) => renderSubjectRow(subject, tone))}</div>
        </div>
      ) : (
        <StudentEmptyState
          compact
          icon={<BookMarked className="h-10 w-10 opacity-50" />}
          title={emptyTitle}
          description={emptyDescription}
        />
      )}
    </section>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Subjects</h2>
          <p className="text-sm text-muted-foreground">
            Keep your current subjects close, and add new ones only when they support your next stretch of work.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <Badge variant="outline" className="w-fit rounded-full text-[11px] font-semibold">
            {enrolledVisibleSubjects.length} active | {availableVisibleSubjects.length} available
          </Badge>
          <Input
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full md:w-72"
          />
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`subject-row-skeleton-${index}`} className="border-b border-border px-4 py-4 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="min-w-0 space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : hasTransientDataGap ? (
        <StudentEmptyState
          icon={<Loader2 className="h-10 w-10 animate-spin opacity-60" />}
          title="Your subject workspace is still settling"
          description="We found your subject catalog, but your active enrollments are still syncing back in. Give it a moment and the workspace should recover cleanly."
        />
      ) : visibleSubjects.length > 0 ? (
        <div className="space-y-5">
          <Card className="rounded-lg border-border shadow-none">
            <CardContent className="grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active subjects</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{enrolledVisibleSubjects.length}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search focus</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{normalizedQuery ? 'Filtered' : 'Open'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open to add</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{availableVisibleSubjects.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg">
                <LifeBuoy className="h-4 w-4 text-primary" /> Request help on a topic
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Ask for extra explanation outside live class when a topic still feels shaky.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Subject</span>
                  <select
                    value={requestSubject}
                    onChange={(event) => setRequestSubject(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {helpSubjectOptions.map((subject) => (
                      <option key={`help-subject-${subject.id}`} value={subject.name}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Priority</span>
                  <select
                    value={requestPriority}
                    onChange={(event) => setRequestPriority(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>

              {linkedTeachers.length > 1 ? (
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Teacher</span>
                  <select
                    value={requestTeacherId}
                    onChange={(event) => setRequestTeacherId(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Any of my teachers</option>
                    {linkedTeachers.map((teacher) => (
                      <option key={`help-teacher-${teacher.id}`} value={teacher.id}>
                        {teacher.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : linkedTeachers.length === 1 ? (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  This request will go to <span className="font-medium text-foreground">{linkedTeachers[0].full_name}</span>.
                </div>
              ) : null}

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Topic or exact area</span>
                <Input
                  value={requestTopic}
                  onChange={(event) => setRequestTopic(event.target.value)}
                  placeholder="e.g. balancing chemical equations, quadratic graphs, essay structure"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Short note for the teacher</span>
                <Textarea
                  value={requestDescription}
                  onChange={(event) => setRequestDescription(event.target.value)}
                  placeholder="Say what is confusing you, where you got stuck, or what kind of explanation you need."
                  rows={3}
                />
              </label>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">This reaches your teacher outside the current tutor lesson.</p>
                <Button
                  onClick={() => void submitHelpRequest()}
                  disabled={isSubmittingRequest || helpSubjectOptions.length === 0}
                  className="h-9 rounded-lg"
                >
                  {isSubmittingRequest ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                    </>
                  ) : (
                    'Send help request'
                  )}
                </Button>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">Recent requests</p>
                  {requestsLoading ? (
                    <span className="text-xs text-muted-foreground">Loading...</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{helpRequests.length} recorded</span>
                  )}
                </div>

                {helpRequests.length > 0 ? (
                  <div className="space-y-2">
                    {helpRequests.slice(0, 4).map((request) => (
                      <div key={request.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{request.topic_name}</p>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {request.subject}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            {String(request.status || 'pending').replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        {request.description ? (
                          <p className="mt-1 text-xs text-muted-foreground">{request.description}</p>
                        ) : null}
                        {request.assigned_teacher_name ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Teacher: <span className="font-medium text-foreground">{request.assigned_teacher_name}</span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No help requests yet. When you ask for extra support here, it will appear in this list.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {renderSection({
            title: 'My subjects',
            description: 'These are the subjects currently shaping your week, revision, and tutor flow.',
            count: enrolledVisibleSubjects.length,
            sectionSubjects: enrolledVisibleSubjects,
            tone: 'enrolled',
            emptyTitle: normalizedQuery ? 'No active subject matched that search.' : 'You have not enrolled in a subject yet.',
            emptyDescription: normalizedQuery
              ? 'Try a broader search or look in the available section below.'
              : 'Choose a subject below to start building your workspace.',
          })}

          {renderSection({
            title: 'Available subjects',
            description: 'Bring in another subject when it genuinely supports what you need to learn next.',
            count: availableVisibleSubjects.length,
            sectionSubjects: availableVisibleSubjects,
            tone: 'available',
            emptyTitle: normalizedQuery ? 'No available subject matched that search.' : 'No extra subjects are available right now.',
            emptyDescription: normalizedQuery
              ? 'Try a different search term.'
              : 'Your catalog is already fully active for now.',
          })}
        </div>
      ) : (
        <StudentEmptyState
          icon={<BookMarked className="h-12 w-12 opacity-50" />}
          title="No subjects matched this view."
          description="Try a different search term or adjust your enrollment choices."
        />
      )}

      {profile?.education_level === 'professional' ? (
        <Card className="mt-8 rounded-lg border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" /> Generate a Custom Course
            </CardTitle>
            <p className="text-sm text-primary/70">
              Create a tailored syllabus for a professional skill or certification.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:max-w-2xl md:flex-row">
              <Input
                placeholder="e.g., Cloud Architecture, Digital Marketing"
                value={customCourseName}
                onChange={(event) => setCustomCourseName(event.target.value)}
                disabled={isGeneratingCourse}
                spellCheck={true}
                className="border-primary/20 bg-white focus-visible:ring-primary dark:bg-slate-900"
              />
              <Button
                onClick={async () => {
                  if (isGeneratingCourse) return;
                  await handleGenerateCustomCourse();
                }}
                disabled={isGeneratingCourse || !customCourseName.trim()}
                className="whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isGeneratingCourse ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...
                  </>
                ) : (
                  'Generate Course'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
