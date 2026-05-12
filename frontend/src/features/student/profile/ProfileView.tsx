import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EDUCATION_LEVELS } from '@/constants/educationLevels';
import { studentAPI, userAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurriculumLabel, formatEducationLevel } from '@/utils/educationDisplay';

interface ProfileFormData {
  education_level: string;
  grade_level: string;
  school_name: string;
  curriculum_type: string;
  course_name: string;
  best_study_time: string;
  attention_span_minutes: number;
  department?: string;
  exam_targets?: string[];
  jamb_subjects?: string[];
}

interface ProfileViewProps {
  user: any;
  profile: any;
  setProfile: (p: any) => void;
  isEditingProfile: boolean;
  setIsEditingProfile: (v: boolean) => void;
  profileFormData: ProfileFormData;
  setProfileFormData: (d: ProfileFormData) => void;
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  subjects: any[];
  enrolledSubjects: string[];
  getLearningStyleLabel: (style: string | undefined) => { label: string };
  startAssessment: () => void;
}

export const ProfileView = ({
  user,
  profile,
  setProfile,
  isEditingProfile,
  setIsEditingProfile,
  profileFormData,
  setProfileFormData,
  avatarUrl,
  setAvatarUrl,
  subjects,
  enrolledSubjects,
  getLearningStyleLabel,
  startAssessment,
}: ProfileViewProps) => {
  const { logout, setUser } = useAuth();
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSavingProfile(true);
    try {
      await studentAPI.updateProfile(profileFormData);
      toast.success('Profile updated successfully!');
      if (profile) setProfile({ ...profile, ...profileFormData });
      setIsEditingProfile(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to save profile');
    }
    setSavingProfile(false);
  };

  const enrolled = subjects.filter((subject) => enrolledSubjects.includes(subject.id));
  const jambSubjects = subjects.filter(
    (subject) => subject.grade_levels?.includes('JAMB') || subject.grade_levels?.includes('SS3')
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">My Profile</h2>
          <p className="text-sm text-muted-foreground">Keep your learning details accurate and useful.</p>
        </div>
        <Button
          variant={isEditingProfile ? 'default' : 'outline'}
          className="w-full rounded-lg sm:w-auto"
          onClick={() => (isEditingProfile ? handleSave() : setIsEditingProfile(true))}
        >
          {isEditingProfile ? (savingProfile ? 'Saving...' : 'Save Changes') : 'Edit Profile'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <Card className="overflow-hidden rounded-lg border-border shadow-none">
          <CardHeader className="px-4 py-4 sm:px-5">
            <CardTitle className="text-base font-semibold sm:text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-subtle p-4 sm:flex-row sm:items-center">
              <div className="relative group">
                <Avatar className="h-20 w-20 overflow-hidden border border-border bg-muted shadow-sm sm:h-24 sm:w-24">
                  <AvatarImage
                    src={avatarUrl || user.avatar || profile?.avatar_url}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-primary/10 text-2xl text-primary">
                    {user.name?.charAt(0) || user.first_name?.charAt(0) || 'S'}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {uploadingAvatar ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                      toast.error('Please choose an image file.');
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error('Profile image must be 5MB or smaller.');
                      return;
                    }
                    setUploadingAvatar(true);
                    try {
                      const result = await studentAPI.uploadAvatar(file);
                      setAvatarUrl(result.avatar_url);
                      if (user) {
                        setUser({
                          ...user,
                          avatar: result.avatar_url,
                          avatar_url: result.avatar_url,
                        });
                      }
                      toast.success('Profile picture updated!');
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to upload photo');
                    } finally {
                      setUploadingAvatar(false);
                    }
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold sm:text-xl">{user.first_name} {user.last_name}</h3>
                <p className="break-all text-sm text-muted-foreground">{user.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">Tap photo to change</p>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/20">
              <label className="text-sm font-medium text-amber-700 dark:text-amber-400">Your Student ID</label>
              <p className="break-all font-mono text-base font-bold text-amber-800 dark:text-amber-300 sm:text-lg">
                {profile?.student_id || 'Complete registration to get your ID'}
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">Share this ID with your teacher to join their class.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground">Education Level / Grade</label>
                {isEditingProfile ? (
                  <div className="space-y-2">
                    <Select disabled value={profileFormData.education_level} onValueChange={(val) => setProfileFormData({ ...profileFormData, education_level: val })}>
                      <SelectTrigger className="cursor-not-allowed bg-subtle"><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary_1">Primary 1</SelectItem>
                        <SelectItem value="primary_2">Primary 2</SelectItem>
                        <SelectItem value="primary_3">Primary 3</SelectItem>
                        <SelectItem value="primary_4">Primary 4</SelectItem>
                        <SelectItem value="primary_5">Primary 5</SelectItem>
                        <SelectItem value="primary_6">Primary 6</SelectItem>
                        {EDUCATION_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                        ))}
                        <SelectItem value="professional">Professional / Career Track</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] font-medium text-amber-600">Locked: promotion is system-controlled based on performance.</p>
                  </div>
                ) : (
                  <p className="font-medium">{formatEducationLevel(profile?.education_level)}</p>
                )}
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Graduation Status</label>
                <p className="flex items-center gap-1 font-medium text-primary">
                  <CheckCircle2 className="h-3 w-3" />
                  Active Learning
                </p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">School / Organization</label>
                {isEditingProfile ? (
                  <Input value={profileFormData.school_name} onChange={(e) => setProfileFormData({ ...profileFormData, school_name: e.target.value })} placeholder="Your school or company" />
                ) : (
                  <p className="break-words font-medium">{profile?.school_name || 'Not set'}</p>
                )}
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Curriculum</label>
                {isEditingProfile ? (
                  <Select value={profileFormData.curriculum_type} onValueChange={(val) => setProfileFormData({ ...profileFormData, curriculum_type: val })}>
                    <SelectTrigger><SelectValue placeholder="Select curriculum" /></SelectTrigger>
                    <SelectContent>
                      {(!profileFormData.education_level || profileFormData.education_level.startsWith('primary')) && (
                        <>
                          <SelectItem value="Nigerian Primary Curriculum">Nigerian Primary</SelectItem>
                          <SelectItem value="British Curriculum">British</SelectItem>
                          <SelectItem value="American Curriculum">American</SelectItem>
                        </>
                      )}
                      {(profileFormData.education_level?.startsWith('jss') || profileFormData.education_level?.startsWith('ss')) && (
                        <>
                          <SelectItem value="Nigerian Secondary Curriculum">Nigerian Secondary</SelectItem>
                          <SelectItem value="British Curriculum">British</SelectItem>
                          <SelectItem value="American Curriculum">American</SelectItem>
                          <SelectItem value="WAEC">WAEC</SelectItem>
                          <SelectItem value="NECO">NECO</SelectItem>
                          <SelectItem value="JAMB">JAMB / UTME</SelectItem>
                        </>
                      )}
                      {profileFormData.education_level === 'professional' && (
                        <SelectItem value="Professional Career Track">Professional / Custom AI Curriculum</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="break-words font-medium">{formatCurriculumLabel(profile?.curriculum_type)}</p>
                )}
              </div>

              {profileFormData.education_level === 'professional' && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:col-span-2">
                  <label className="text-sm font-bold uppercase tracking-wide text-primary">Professional Course / Certification</label>
                  {isEditingProfile ? (
                    <Input
                      value={profileFormData.course_name || ''}
                      onChange={(e) => setProfileFormData({ ...profileFormData, course_name: e.target.value })}
                      placeholder="e.g., Data Science, UI/UX Design, AWS Associate"
                      className="mt-2"
                    />
                  ) : (
                    <p className="mt-1 break-words text-lg font-semibold">{profile?.course_name || 'Not set'}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">AI will curate a comprehensive curriculum based on this course.</p>
                </div>
              )}

              {profileFormData.education_level?.startsWith('ss') && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:col-span-2">
                  <label className="mb-2 block text-sm font-bold uppercase tracking-tight text-primary">Academic Department</label>
                  {isEditingProfile ? (
                    <Select value={profileFormData.department} onValueChange={(val) => setProfileFormData({ ...profileFormData, department: val })}>
                      <SelectTrigger><SelectValue placeholder="Choose Department" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Science">Science (Physics, Chemistry, Biology)</SelectItem>
                        <SelectItem value="Art">Art (Literature, Government, CRS)</SelectItem>
                        <SelectItem value="Commercial">Commercial (Accounting, Commerce)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className="bg-primary px-3 py-1 text-primary-foreground hover:bg-primary">{profile?.department || 'Not selected'}</Badge>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">This automatically filters your core and elective subjects.</p>
                </div>
              )}

              {(profileFormData.education_level?.startsWith('ss') || profileFormData.education_level === 'jss_3') && (
                <div className="rounded-lg border border-border bg-subtle p-4 sm:col-span-2">
                  <label className="mb-2 block text-sm font-bold">National Exam Targets</label>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {['WAEC', 'JAMB', 'NECO'].map((exam) => (
                      <Badge
                        key={exam}
                        variant={profileFormData.exam_targets?.includes(exam) ? 'default' : 'outline'}
                        className="cursor-pointer transition-all active:scale-95"
                        onClick={() => {
                          if (!isEditingProfile) return;
                          const current = profileFormData.exam_targets || [];
                          const next = current.includes(exam) ? current.filter((item) => item !== exam) : [...current, exam];
                          setProfileFormData({ ...profileFormData, exam_targets: next });
                        }}
                      >
                        {exam}
                      </Badge>
                    ))}
                  </div>

                  {profileFormData.exam_targets?.includes('JAMB') && (
                    <div className="mt-4 border-t border-border pt-4">
                      <label className="mb-2 block text-sm font-bold text-primary">JAMB Subjects (Select 4)</label>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {jambSubjects.map((subject) => (
                          <button
                            key={subject.id}
                            type="button"
                            disabled={!isEditingProfile}
                            onClick={() => {
                              const current = profileFormData.jamb_subjects || [];
                              const next = current.includes(subject.id)
                                ? current.filter((id) => id !== subject.id)
                                : current.length < 4 ? [...current, subject.id] : current;
                              setProfileFormData({ ...profileFormData, jamb_subjects: next });
                            }}
                            className={`rounded-lg border px-3 py-1.5 text-left transition-all ${
                              profileFormData.jamb_subjects?.includes(subject.id)
                                ? 'border-primary/50 bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/15'
                                : 'border-border bg-white hover:border-primary hover:bg-primary/5 dark:bg-slate-800'
                            }`}
                          >
                            {subject.name}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Select the 4 subjects you will write in UTME.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <label className="mb-3 block text-sm font-bold text-slate-700 dark:text-slate-300">Enrolled Courses & Subjects</label>
              <div className="flex flex-wrap gap-2">
                {enrolled.map((subject) => (
                  <Badge key={subject.id} variant="secondary" className="bg-primary/10 px-3 py-1.5 text-sm text-primary">
                    {subject.name}
                  </Badge>
                ))}
                {enrolled.length === 0 && (
                  <span className="text-sm italic text-muted-foreground">No active courses</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-none">
          <CardHeader className="px-4 py-4 sm:px-5">
            <CardTitle className="text-base font-semibold sm:text-lg">Learning Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
            <div className="rounded-lg border border-border bg-subtle p-4">
              <label className="text-sm text-muted-foreground">Learning Style</label>
              <p className="font-medium">{getLearningStyleLabel(profile?.learning_style).label}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <label className="text-sm text-muted-foreground">Best Study Time</label>
                {isEditingProfile ? (
                  <Select value={profileFormData.best_study_time} onValueChange={(val) => setProfileFormData({ ...profileFormData, best_study_time: val })}>
                    <SelectTrigger><SelectValue placeholder="Time" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning</SelectItem>
                      <SelectItem value="Afternoon">Afternoon</SelectItem>
                      <SelectItem value="Evening">Evening</SelectItem>
                      <SelectItem value="Night">Night</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium">{profile?.best_study_time || 'Not set'}</p>
                )}
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Focus Duration</label>
                {isEditingProfile ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={profileFormData.attention_span_minutes}
                      onChange={(e) => setProfileFormData({ ...profileFormData, attention_span_minutes: parseInt(e.target.value, 10) })}
                      className="w-24"
                    />
                    <span className="text-xs">min</span>
                  </div>
                ) : (
                  <p className="font-medium">{profile?.attention_span_minutes || 30} minutes</p>
                )}
              </div>
            </div>

            {!isEditingProfile && (
              <Button className="mt-2 w-full rounded-lg" onClick={startAssessment}>
                Take Learning Style Assessment
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-red-200 bg-red-50/40 shadow-none dark:border-red-900/60 dark:bg-red-950/10">
          <CardHeader className="px-4 py-4 sm:px-5">
            <CardTitle className="text-base font-semibold text-red-700 dark:text-red-300">Account Control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-5 sm:px-5">
            <p className="text-sm text-red-700/80 dark:text-red-200/80">
              Delete your EduNexus account permanently. This removes your profile, learning records, and access.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full rounded-lg">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete My Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action is permanent and cannot be undone. Your account and associated learning data will be removed from EduNexus.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deletingAccount}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deletingAccount}
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={async () => {
                      setDeletingAccount(true);
                      try {
                        await userAPI.deleteMe();
                        toast.success('Your account has been deleted.');
                        logout();
                      } catch (error: any) {
                        toast.error(error.message || 'Failed to delete account');
                      } finally {
                        setDeletingAccount(false);
                      }
                    }}
                  >
                    {deletingAccount ? 'Deleting...' : 'Delete Account'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
