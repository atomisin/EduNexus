import React, { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, User as UserIcon, GraduationCap, Users, Clock, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';
import { 
  EDUCATION_CATEGORIES, 
  EDUCATION_LEVELS, 
  DEPARTMENTS, 
  DEPARTMENT_SUBJECTS, 
  BASE_EXAM_SUBJECTS,
  JAMB_MAX_SUBJECTS,
  WAEC_NECO_RANGE
} from '@/constants/educationLevels';
import VerificationSuccess from './VerificationSuccess';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RegistrationFormProps {
  onSuccess?: () => void;
  onLoginClick?: () => void;
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({ onSuccess, onLoginClick }) => {
  const { register, error, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'teacher' | 'student'>('student');
  const [isTeacherMode, setIsTeacherMode] = useState(false);

  // Sync isTeacherMode to activeTab
  React.useEffect(() => {
    setActiveTab(isTeacherMode ? 'teacher' : 'student');
  }, [isTeacherMode]);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    educationLevel: '',
    schoolName: '',
    specialization: '',
    gender: '',
    dateOfBirth: '',
    courseName: '',
    department: '',
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
    educationCategory: '' as keyof typeof EDUCATION_CATEGORIES | '',
    enrolledSubjects: [] as string[],
  });

  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const validateForm = (): boolean => {
    if (!formData.firstName || formData.firstName.length < 2) {
      setFormError('Please enter your first name (minimum 2 characters)');
      return false;
    }
    if (!formData.lastName || formData.lastName.length < 2) {
      setFormError('Please enter your last name (minimum 2 characters)');
      return false;
    }

    if (!formData.email || !formData.email.includes('@')) {
      setFormError('Please enter a valid email address');
      return false;
    }

    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters long');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match');
      return false;
    }

    if (activeTab === 'student' && !formData.educationLevel) {
      setFormError('Please select your education level');
      return false;
    }

    if (activeTab === 'student' && ['ss_1', 'ss_2', 'ss_3', 'waec', 'neco', 'jamb'].includes(formData.educationLevel) && !formData.department) {
      setFormError('Please select a department (Science, Art, or Commercial)');
      return false;
    }

    if (activeTab === 'teacher' && !formData.specialization) {
      setFormError('Please enter your specialization');
      return false;
    }

    if (!agreedToTerms) {
      setFormError('You must agree to the terms and conditions');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!validateForm()) return;

    try {
      console.log('Submitting registration...', { role: activeTab, email: formData.email });
      const result = await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        role: activeTab,
        educationLevel: activeTab === 'student' ? formData.educationLevel : undefined,
        subjects: activeTab === 'teacher' && formData.specialization ? [formData.specialization] : undefined,
        courseName: activeTab === 'student' && formData.educationLevel === 'professional' ? formData.courseName : undefined,
        gender: activeTab === 'student' ? formData.gender : undefined,
        dateOfBirth: activeTab === 'student' && formData.dateOfBirth ? formData.dateOfBirth : undefined,
        schoolName: activeTab === 'student' ? formData.schoolName : undefined,
        department: activeTab === 'student' && ['ss_1', 'ss_2', 'ss_3', 'waec', 'neco', 'jamb'].includes(formData.educationLevel) ? formData.department : undefined,
        guardianName: activeTab === 'student' ? formData.guardianName : undefined,
        guardianEmail: activeTab === 'student' ? formData.guardianEmail : undefined,
        guardianPhone: activeTab === 'student' ? formData.guardianPhone : undefined,
        enrolledSubjects: activeTab === 'student' ? formData.enrolledSubjects : undefined,
        educationCategory: activeTab === 'student' ? formData.educationCategory || undefined : undefined,
        specialization: activeTab === 'teacher' ? formData.specialization : undefined,
      });

      console.log('Registration result:', result);

      if (result.success) {
        if (result.verificationSent) {
          setRegisteredEmail(result.email || formData.email);
          setVerificationToken('code-verification'); // Use code-based verification
          setRegistrationComplete(true);
        } else {
          onSuccess?.();
        }
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setFormError('Unable to connect to the server. Please make sure the backend is running (npm run dev in the backend folder).');
      } else {
        setFormError(err.message || 'Registration failed. Please try again.');
      }
    }
  };

  // Show verification success page
  if (registrationComplete) {
    return (
      <VerificationSuccess
        email={registeredEmail}
        verificationToken={verificationToken}
        onContinue={() => onSuccess?.()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary/5 pointer-events-none" />

      <Card className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-xl">
        <div className="h-1 bg-primary" />
        <CardHeader className="pb-6 text-center">
          <div className="mx-auto mb-4">
            <img src="/edunexus-logo.png" alt="EduNexus" className="h-16 w-auto mx-auto" />
          </div>
          <CardTitle className="text-3xl">Create Your Account</CardTitle>
          <CardDescription className="text-lg">
            Join EduNexus and start your learning journey
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <div className="w-full">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                  {isTeacherMode ? 'Teacher Registration' : 'Student Registration'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsTeacherMode(!isTeacherMode)}
                  className="text-xs font-bold text-primary hover:underline transition-all"
                >
                  {isTeacherMode ? 'Back to Student' : 'Are you a Teacher? Click here'}
                </button>
              </div>
              {(formError || error) && (
                <Alert variant="destructive">
                  <AlertDescription>{formError || error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    placeholder="First Name"
                    required
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    placeholder="Last Name"
                    required
                    className="h-12"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="h-12"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="Min 8 characters"
                    required
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder="Re-enter password"
                    required
                    className="h-12"
                  />
                </div>
              </div>

              {activeTab === 'student' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender</Label>
                      <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Date of Birth</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                        className="h-12"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="educationCategory">Education Category *</Label>
                      <Select 
                        value={formData.educationCategory} 
                        onValueChange={(value) => {
                          setFormData(prev => ({ 
                            ...prev, 
                            educationCategory: value as any,
                            educationLevel: '', // Reset level on category change
                            department: '',
                            enrolledSubjects: []
                          }));
                        }}
                      >
                        <SelectTrigger className="h-12 border-primary/20 bg-primary/5 truncate">
                          <div className="truncate"><SelectValue placeholder="Select Category" /></div>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(EDUCATION_CATEGORIES).map(([key, cat]) => (
                            <SelectItem key={key} value={key}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="educationLevel">Class/Level *</Label>
                      <Select 
                        value={formData.educationLevel} 
                        onValueChange={(value) => {
                          const base = BASE_EXAM_SUBJECTS[value as keyof typeof BASE_EXAM_SUBJECTS] || [];
                          let newSubjects = [...(formData.enrolledSubjects || [])];
                          newSubjects = [...new Set([...newSubjects, ...base])];

                          setFormData(prev => ({ 
                            ...prev, 
                            educationLevel: value,
                            enrolledSubjects: newSubjects
                          }));
                        }}
                        disabled={!formData.educationCategory}
                      >
                        <SelectTrigger className="h-12 truncate">
                          <div className="truncate"><SelectValue placeholder={formData.educationCategory ? "Select Level" : "Select Category first"} /></div>
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                          {formData.educationCategory && (EDUCATION_CATEGORIES[formData.educationCategory as keyof typeof EDUCATION_CATEGORIES].levels as any).map((level: any) => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {['ss_1', 'ss_2', 'ss_3', 'waec', 'neco', 'jamb'].includes(formData.educationLevel) && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <Label htmlFor="department">Field of Study / Department *</Label>
                      <Select 
                        value={formData.department} 
                        onValueChange={(value) => {
                          const base = BASE_EXAM_SUBJECTS[formData.educationLevel as keyof typeof BASE_EXAM_SUBJECTS] || [];
                          setFormData(prev => ({ ...prev, department: value, enrolledSubjects: [...base] }));
                        }}
                      >
                        <SelectTrigger className="h-12 border-accent/20 bg-accent/5 truncate">
                          <div className="truncate"><SelectValue placeholder="Select your department" /></div>
                        </SelectTrigger>
                        <SelectContent>
                          {(DEPARTMENTS as any).map((dept: any) => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Subject Picker for Secondary/Exam */}
                  {formData.department && ['ss_1', 'ss_2', 'ss_3', 'waec', 'neco', 'jamb'].includes(formData.educationLevel) && (
                    <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 animate-in fade-in duration-500">
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-sm font-bold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                          Select Subjects for {formData.educationLevel.toUpperCase()} ({formData.department})
                        </Label>
                        <Badge variant="outline" className={cn(
                          "font-mono",
                          formData.educationLevel === 'jamb' 
                            ? ((formData.enrolledSubjects?.length || 0) === (JAMB_MAX_SUBJECTS || 4) ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")
                            : ((formData.enrolledSubjects?.length || 0) >= (WAEC_NECO_RANGE?.[0] || 7) ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")
                        )}>
                          {(formData.enrolledSubjects?.length || 0)} {formData.educationLevel === 'jamb' ? `/ ${JAMB_MAX_SUBJECTS || 4}` : `Selected (Min ${WAEC_NECO_RANGE?.[0] || 7})`}
                        </Badge>
                      </div>

                      <div className="max-h-[350px] overflow-y-auto pr-2 space-y-2 border rounded-xl p-3 bg-slate-100/30 dark:bg-slate-900/40">
                        <div className="grid grid-cols-1 gap-2">
                          {/* Base/Mandatory Subjects */}
                          {(Array.isArray(BASE_EXAM_SUBJECTS?.[formData.educationLevel as keyof typeof BASE_EXAM_SUBJECTS]) 
                            ? (BASE_EXAM_SUBJECTS?.[formData.educationLevel as keyof typeof BASE_EXAM_SUBJECTS] as any) 
                            : []
                          ).map((subject: string) => (
                             <div key={`base-row-${subject}`} className="flex items-center space-x-3 p-3 bg-white/60 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                               <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                                 <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                               </div>
                               <div className="flex-1">
                                 <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{subject}</span>
                                 <span className="ml-2 text-[10px] text-primary font-bold uppercase py-0.5 px-2 rounded-full bg-primary/10 border border-primary/20">Required</span>
                               </div>
                             </div>
                          ))}

                          {/* Departmental Options */}
                           {(Array.isArray(DEPARTMENT_SUBJECTS?.[formData.department as keyof typeof DEPARTMENT_SUBJECTS])
                            ? (DEPARTMENT_SUBJECTS?.[formData.department as keyof typeof DEPARTMENT_SUBJECTS] as any)
                            : []
                           ).map((subject: string) => {
                             const isSelected = Array.isArray(formData.enrolledSubjects) && formData.enrolledSubjects.includes(subject);
                             const isMandatory = (Array.isArray(BASE_EXAM_SUBJECTS?.[formData.educationLevel as keyof typeof BASE_EXAM_SUBJECTS])
                               ? (BASE_EXAM_SUBJECTS?.[formData.educationLevel as keyof typeof BASE_EXAM_SUBJECTS] as any)
                               : []
                             ).includes(subject);
                             
                             if (isMandatory) return null;

                             const inputId = `reg-subject-${subject.replace(/[^a-zA-Z0-9]/g, '')}`;

                             return (
                               <div 
                                 key={`opt-row-${subject}`} 
                                 className={cn(
                                   "flex items-center space-x-3 p-3 rounded-xl border transition-all duration-200 shadow-sm",
                                   isSelected 
                                     ? "bg-primary text-primary-foreground border-primary" 
                                     : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary/50"
                                 )}
                               >
                                 <Checkbox 
                                   id={inputId} 
                                   checked={isSelected} 
                                   onCheckedChange={(checked) => {
                                      const currentEnrolled = Array.isArray(formData.enrolledSubjects) ? formData.enrolledSubjects : [];
                                      let newSelection = [...currentEnrolled];
                                      
                                      if (!checked) {
                                        newSelection = newSelection.filter(s => s !== subject);
                                      } else {
                                        if (formData.educationLevel === 'jamb' && newSelection.length >= (JAMB_MAX_SUBJECTS || 4)) {
                                          toast.error(`You can only select up to ${JAMB_MAX_SUBJECTS || 4} subjects for JAMB.`);
                                          return;
                                        }
                                        if (!newSelection.includes(subject)) {
                                          newSelection.push(subject);
                                        }
                                      }
                                      handleInputChange('enrolledSubjects', newSelection);
                                   }}
                                   className={isSelected ? "border-white bg-white text-primary" : ""}
                                 />
                                 <label 
                                   htmlFor={inputId}
                                   className="text-sm flex-1 font-bold cursor-pointer select-none"
                                 >
                                   {subject}
                                 </label>
                               </div>
                             );
                           })}
                        </div>
                      </div>
                      {formData.educationLevel === 'jamb' && (formData.enrolledSubjects?.length || 0) < (JAMB_MAX_SUBJECTS || 4) && (
                        <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-2">
                          <AlertCircle className="w-3 h-3" />
                          Please select exactly {JAMB_MAX_SUBJECTS || 4} subjects (including English).
                        </p>
                      )}
                    </div>
                  )}

                  {formData.educationLevel === 'professional' && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <Label htmlFor="courseName">Professional Course / Certification *</Label>
                      <Input
                        id="courseName"
                        value={formData.courseName}
                        onChange={(e) => handleInputChange('courseName', e.target.value)}
                        placeholder="e.g., Data Science, Agile Master, AWS Architect"
                        required
                        className="h-12 border-teal-300 focus:border-teal-500"
                      />
                      <p className="text-xs text-teal-600 font-medium">✨ We will generate a comprehensive curriculum based on this course.</p>
                    </div>
                  )}

                  <div className="pt-4 mt-2 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Parent / Guardian Details</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="guardianName">Guardian Full Name</Label>
                        <Input
                          id="guardianName"
                          value={formData.guardianName}
                          onChange={(e) => handleInputChange('guardianName', e.target.value)}
                          placeholder="e.g., Mrs. Grace Doe"
                          className="h-12"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="guardianEmail">Guardian Email (Optional)</Label>
                          <Input
                            id="guardianEmail"
                            type="email"
                            value={formData.guardianEmail}
                            onChange={(e) => handleInputChange('guardianEmail', e.target.value)}
                            placeholder="guardian@example.com"
                            className="h-12"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="guardianPhone">Guardian Phone</Label>
                          <Input
                            id="guardianPhone"
                            type="tel"
                            value={formData.guardianPhone}
                            onChange={(e) => handleInputChange('guardianPhone', e.target.value)}
                            placeholder="+234 xxx xxx xxxx"
                            className="h-12"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'teacher' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="specialization">Specialization *</Label>
                    <Input
                      id="specialization"
                      value={formData.specialization}
                      onChange={(e) => handleInputChange('specialization', e.target.value)}
                      placeholder="e.g., Mathematics, Physics"
                      required
                      className="h-12"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-start space-x-3 pt-4">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                />
                <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                  I agree to the{' '}
                  <a href="#" className="text-primary hover:underline font-medium">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="#" className="text-primary hover:underline font-medium">
                    Privacy Policy
                  </a>
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full h-14 text-base font-medium btn-primary"
                disabled={isLoading || !agreedToTerms}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  `Create ${activeTab === 'teacher' ? 'Teacher' : 'Student'} Account`
                )}
              </Button>
            </form>
          </div>

          <div className="text-center mt-8 pt-6 border-t">
            <p className="text-sm text-slate-500">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onLoginClick}
                className="text-primary hover:underline font-medium"
              >
                Sign in here
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegistrationForm;