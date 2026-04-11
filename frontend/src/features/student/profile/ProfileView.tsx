import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, Camera, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EDUCATION_LEVELS } from '@/constants/educationLevels';
import { studentAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

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
  const { setUser } = useAuth();
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSavingProfile(true);
    try {
      await studentAPI.updateProfile(profileFormData);
      toast.success('Profile updated successfully!');
      if (profile) {
        setProfile({ ...profile, ...profileFormData });
      }
      setIsEditingProfile(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to save profile');
    }
    setSavingProfile(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My Profile</h2>
        <Button variant={isEditingProfile ? "default" : "outline"} onClick={() => isEditingProfile ? handleSave() : setIsEditingProfile(true)}>
          {isEditingProfile ? (savingProfile ? 'Saving...' : 'Save Changes') : 'Edit Profile'}
        </Button>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar with upload */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative group">
                <Avatar className="w-24 h-24 border-4 border-white dark:border-slate-800 shadow-xl overflow-hidden bg-muted">
                  <AvatarImage
                    src={avatarUrl || user.avatar || (profile as any)?.avatar_url}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-2xl bg-teal-100 text-teal-700">
                    {user.name?.charAt(0) || 'S'}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploadingAvatar ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingAvatar(true);
                    try {
                      const result = await studentAPI.uploadAvatar(file);
                      setAvatarUrl(result.avatar_url);

                      // Update global auth context so avatar changes everywhere
                      if (user) {
                        setUser({
                          ...user,
                          avatar: result.avatar_url
                        });
                      }

                      toast.success('Profile picture updated! 🎉', { style: { color: '#fff', background: '#059669', fontWeight: '600' } });
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to upload photo');
                    } finally {
                      setUploadingAvatar(false);
                    }
                  }}
                />
              </div>
              <div>
                <h3 className="text-xl font-semibold">{user.first_name} {user.last_name}</h3>
                <p className="text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground mt-1">Hover over photo to change</p>
              </div>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <label className="text-sm text-amber-700 dark:text-amber-400 font-medium">Your Student ID</label>
              <p className="text-lg font-mono font-bold text-amber-800 dark:text-amber-300">{profile?.student_id || 'Complete registration to get your ID'}</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">Share this ID with your teacher to join their class</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Education Level / Grade</label>
                {isEditingProfile ? (
                  <div className="space-y-2">
                    <Select disabled value={profileFormData.education_level} onValueChange={(val) => setProfileFormData({ ...profileFormData, education_level: val })}>
                      <SelectTrigger className="bg-slate-100 dark:bg-slate-800 cursor-not-allowed"><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary_1">Primary 1</SelectItem>
                        <SelectItem value="primary_2">Primary 2</SelectItem>
                        <SelectItem value="primary_3">Primary 3</SelectItem>
                        <SelectItem value="primary_4">Primary 4</SelectItem>
                        <SelectItem value="primary_5">Primary 5</SelectItem>
                        <SelectItem value="primary_6">Primary 6</SelectItem>
                        {EDUCATION_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="professional">Professional / Career Track</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-amber-600 font-medium">Locked: Promotion is system-controlled based on performance.</p>
                  </div>
                ) : (
                  <p className="font-medium capitalize">{(profile?.education_level || 'Not set').replace('_', ' ')}</p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Graduation Status</label>
                <p className="font-medium text-teal-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Active Learning
                </p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">School / Organization</label>
                {isEditingProfile ? (
                  <Input value={profileFormData.school_name} onChange={(e) => setProfileFormData({ ...profileFormData, school_name: e.target.value })} placeholder="Your school or company" />
                ) : (
                  <p className="font-medium">{profile?.school_name || 'Not set'}</p>
                )}
              </div>
              {profileFormData.education_level === 'professional' && (
                <div className="col-span-2 p-4 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-xl animate-in zoom-in duration-300">
                  <label className="text-sm text-teal-700 dark:text-teal-400 font-bold uppercase tracking-wider">Professional Course / Certification</label>
                  {isEditingProfile ? (
                    <Input
                      value={profileFormData.course_name || ''}
                      onChange={(e) => setProfileFormData({ ...profileFormData, course_name: e.target.value })}
                      placeholder="e.g., Data Science, UI/UX Design, AWS Associate"
                      className="mt-2 border-teal-300 focus:border-teal-500"
                    />
                  ) : (
                    <p className="font-black text-xl text-teal-800 dark:text-teal-200 mt-1">{profile?.course_name || 'Not set'}</p>
                  )}
                  <p className="text-[10px] text-teal-600 dark:text-teal-500 mt-2 font-medium">✨ AI will curate a comprehensive "Zero to Hero" curriculum based on this course.</p>
                </div>
              )}
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
                  <p className="font-medium">{profile?.curriculum_type || 'Not set'}</p>
                )}
              </div>

              {/* Department Selection for SS Students */}
              {(profileFormData.education_level?.startsWith('ss')) && (
                <div className="col-span-2 p-4 bg-primary/5 border border-primary/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm font-bold text-primary mb-2 block uppercase tracking-tight">Academic Department</label>
                  {isEditingProfile ? (
                    <Select value={profileFormData.department} onValueChange={(val) => setProfileFormData({ ...profileFormData, department: val })}>
                      <SelectTrigger className="border-primary/30 focus:ring-primary"><SelectValue placeholder="Choose Department" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Science">Science (Physics, Chemistry, Bio, etc.)</SelectItem>
                        <SelectItem value="Art">Art (Lit, Govt, CRS, etc.)</SelectItem>
                        <SelectItem value="Commercial">Commercial (Accounting, Commerce, etc.)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className="bg-primary text-white hover:bg-primary/90 px-3 py-1">{profile?.department || 'Not Selected'}</Badge>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2 italic">✨ This will automatically filter your core and elective subjects.</p>
                </div>
              )}

              {/* Exam Targets */}
              {(profileFormData.education_level?.startsWith('ss') || profileFormData.education_level === 'jss_3') && (
                <div className="col-span-2 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <label className="text-sm font-bold mb-2 block">National Exam Targets</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {['WAEC', 'JAMB', 'NECO'].map(exam => (
                      <Badge 
                        key={exam}
                        variant={profileFormData.exam_targets?.includes(exam) ? "default" : "outline"}
                        className="cursor-pointer transition-all active:scale-95"
                        onClick={() => {
                          if (!isEditingProfile) return;
                          const current = profileFormData.exam_targets || [];
                          const next = current.includes(exam) 
                            ? current.filter(e => e !== exam)
                            : [...current, exam];
                          setProfileFormData({...profileFormData, exam_targets: next});
                        }}
                      >
                        {exam}
                      </Badge>
                    ))}
                  </div>
                  {profileFormData.exam_targets?.includes('JAMB') && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in zoom-in duration-200">
                      <label className="text-sm font-bold text-teal-600 mb-2 block">JAMB Subjects (Select 4)</label>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {subjects.filter(s => s.grade_levels?.includes('JAMB') || s.grade_levels?.includes('SS3')).map(subj => (
                          <button
                            key={subj.id}
                            disabled={!isEditingProfile}
                            onClick={() => {
                              const current = profileFormData.jamb_subjects || [];
                              const next = current.includes(subj.id)
                                ? current.filter(id => id !== subj.id)
                                : current.length < 4 ? [...current, subj.id] : current;
                              setProfileFormData({...profileFormData, jamb_subjects: next});
                            }}
                            className={`px-3 py-1.5 rounded-lg border transition-all ${
                              profileFormData.jamb_subjects?.includes(subj.id)
                                ? 'bg-teal-600 border-teal-600 text-white shadow-md'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-400'
                            }`}
                          >
                            {subj.name}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2 italic">Select the 4 subjects you will write in UTME.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="col-span-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 block">Enrolled Courses & Subjects</label>
              <div className="flex flex-wrap gap-2">
                {subjects.filter(s => enrolledSubjects.includes(s.id)).map(subject => (
                  <Badge key={subject.id} variant="secondary" className="bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 text-sm py-1.5 px-3">
                    {subject.name}
                  </Badge>
                ))}
                {subjects.filter(s => enrolledSubjects.includes(s.id)).length === 0 && (
                  <span className="text-sm text-muted-foreground italic">No Active Courses</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Learning Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><label className="text-sm text-muted-foreground">Learning Style</label><p className="font-medium">{getLearningStyleLabel(profile?.learning_style).label}</p></div>
            <div className="grid grid-cols-2 gap-4">
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
                    <Input type="number" value={profileFormData.attention_span_minutes} onChange={(e) => setProfileFormData({ ...profileFormData, attention_span_minutes: parseInt(e.target.value) })} className="w-20" />
                    <span className="text-xs">min</span>
                  </div>
                ) : (
                  <p className="font-medium">{profile?.attention_span_minutes || 30} minutes</p>
                )}
              </div>
            </div>
            {!isEditingProfile && <Button className="w-full mt-4" onClick={startAssessment}>Take Learning Style Assessment</Button>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
