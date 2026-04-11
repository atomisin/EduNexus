import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle, User, GraduationCap } from 'lucide-react';

interface SimpleRegistrationFormProps {
  onSuccess?: () => void;
  onLoginClick?: () => void;
}

export const SimpleRegistrationForm: React.FC<SimpleRegistrationFormProps> = ({
  onSuccess,
  onLoginClick
}) => {
  const { register, error, isLoading } = useAuth();
  const [role, setRole] = useState<'teacher' | 'student'>('student');
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    // Student fields
    educationLevel: '',
    schoolName: '',
    gradeLevel: '',
    // Teacher fields
    specialization: '',
    yearsOfExperience: '',
    courseName: '',
    department: '',
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
  });

  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const validateForm = (): boolean => {
    if (!formData.email || !formData.email.includes('@')) {
      setFormError('Please enter a valid email address');
      return false;
    }


    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match');
      return false;
    }

    if (!formData.firstName || formData.firstName.length < 2) {
      setFormError('Please enter your first name');
      return false;
    }

    if (!formData.lastName || formData.lastName.length < 2) {
      setFormError('Please enter your last name');
      return false;
    }

    if (!agreedToTerms) {
      setFormError('You must agree to the terms and conditions');
      return false;
    }

    if (role === 'student' && !formData.educationLevel) {
      setFormError('Please select your education level');
      return false;
    }

    if (role === 'student' && ['ss_1', 'ss_2', 'ss_3'].includes(formData.educationLevel) && !formData.department) {
      setFormError('Please select a department (Science, Art, or Commercial)');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!validateForm()) return;

    try {
      await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        role: role,
        educationLevel: formData.educationLevel || undefined,
        courseName: role === 'student' && formData.educationLevel === 'professional' ? formData.courseName : undefined,
        subjects: role === 'teacher' && formData.specialization ? [formData.specialization] : undefined,
        gradeLevel: role === 'student' ? formData.gradeLevel : undefined,
        schoolName: role === 'student' ? formData.schoolName : undefined,
        department: role === 'student' && ['ss_1', 'ss_2', 'ss_3'].includes(formData.educationLevel) ? formData.department : undefined,
        guardianName: role === 'student' ? formData.guardianName : undefined,
        guardianEmail: role === 'student' ? formData.guardianEmail : undefined,
        guardianPhone: role === 'student' ? formData.guardianPhone : undefined,
        specialization: role === 'teacher' ? formData.specialization : undefined,
        yearsOfExperience: role === 'teacher' ? formData.yearsOfExperience : undefined,
        phoneNumber: formData.phoneNumber,
      });

      setRegistrationComplete(true);
      setTimeout(() => {
        onSuccess?.();
      }, 2000);
    } catch (err: any) {
      setFormError(err.message || 'Registration failed. Please try again.');
    }
  };

  if (registrationComplete) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <CardTitle className="mb-2">Registration Successful!</CardTitle>
          <CardDescription>
            Your {role} account has been created. Redirecting to login...
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Create Your Account</CardTitle>
        <CardDescription>
          Join EduNexus as a teacher or student
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Role Selection */}
        <div className="flex gap-4 mb-6">
          <button
            type="button"
            onClick={() => setRole('student')}
            className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${role === 'student'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 hover:border-gray-300'
              }`}
          >
            <GraduationCap className="w-5 h-5" />
            <span className="font-medium">Student</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('teacher')}
            className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${role === 'teacher'
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 hover:border-gray-300'
              }`}
          >
            <User className="w-5 h-5" />
            <span className="font-medium">Teacher</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {(formError || error) && (
            <Alert variant="destructive">
              <AlertDescription>{formError || error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder="John"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Min 8 characters"
                required
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
              />
            </div>
          </div>

          {/* Role-specific fields */}
          {role === 'student' && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-medium text-gray-700">Student Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="educationLevel">Education Level *</Label>
                  <select
                    id="educationLevel"
                    value={formData.educationLevel}
                    onChange={(e) => handleInputChange('educationLevel', e.target.value)}
                    className="w-full p-2 border rounded-lg"
                    required
                  >
                    <option value="">Select level</option>
                    <option value="primary">Primary School</option>
                    <option value="secondary">Secondary School</option>
                    <option value="professional">Professional / Career Track</option>
                  </select>
                </div>
                {['ss_1', 'ss_2', 'ss_3'].includes(formData.educationLevel) && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300 col-span-2">
                    <Label htmlFor="department">Department *</Label>
                    <select
                      id="department"
                      value={formData.department}
                      onChange={(e) => handleInputChange('department', e.target.value)}
                      className="w-full p-2 border rounded-lg"
                      required
                    >
                      <option value="">Select department</option>
                      <option value="Science">Science</option>
                      <option value="Art">Art</option>
                      <option value="Commercial">Commercial</option>
                    </select>
                  </div>
                )}
                {formData.educationLevel === 'professional' && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300 col-span-2">
                    <Label htmlFor="courseName">Professional Course / Certification *</Label>
                    <Input
                      id="courseName"
                      value={formData.courseName}
                      onChange={(e) => handleInputChange('courseName', e.target.value)}
                      placeholder="e.g., Data Science, Agile Master, AWS Architect"
                      required
                    />
                    <p className="text-xs text-gray-500">✨ We will generate a comprehensive curriculum based on this course.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="gradeLevel">Grade/Level</Label>
                  <Input
                    id="gradeLevel"
                    value={formData.gradeLevel}
                    onChange={(e) => handleInputChange('gradeLevel', e.target.value)}
                    placeholder="e.g., SS2, Year 3"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="schoolName">School Name</Label>
                <Input
                  id="schoolName"
                  value={formData.schoolName}
                  onChange={(e) => handleInputChange('schoolName', e.target.value)}
                  placeholder="Your school"
                />
              </div>
              <div className="pt-4 border-t space-y-4">
                <h3 className="font-medium text-gray-700">Parent / Guardian Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="guardianName">Guardian Name</Label>
                  <Input
                    id="guardianName"
                    value={formData.guardianName}
                    onChange={(e) => handleInputChange('guardianName', e.target.value)}
                    placeholder="e.g. Mrs. Grace Doe"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guardianEmail">Guardian Email</Label>
                    <Input
                      id="guardianEmail"
                      type="email"
                      value={formData.guardianEmail}
                      onChange={(e) => handleInputChange('guardianEmail', e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guardianPhone">Guardian Phone</Label>
                    <Input
                      id="guardianPhone"
                      type="tel"
                      value={formData.guardianPhone}
                      onChange={(e) => handleInputChange('guardianPhone', e.target.value)}
                      placeholder="+234..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {role === 'teacher' && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-medium text-gray-700">Teacher Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="specialization">Specialization</Label>
                  <Input
                    id="specialization"
                    value={formData.specialization}
                    onChange={(e) => handleInputChange('specialization', e.target.value)}
                    placeholder="e.g., Mathematics"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearsOfExperience">Years of Experience</Label>
                  <Input
                    id="yearsOfExperience"
                    type="number"
                    value={formData.yearsOfExperience}
                    onChange={(e) => handleInputChange('yearsOfExperience', e.target.value)}
                    placeholder="5"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              value={formData.phoneNumber}
              onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
              placeholder="+234..."
            />
          </div>

          <div className="flex items-start space-x-2 pt-4">
            <Checkbox
              id="terms"
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
            />
            <Label htmlFor="terms" className="text-sm cursor-pointer leading-tight">
              I agree to the{' '}
              <a href="#" className="text-primary hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-primary hover:underline">
                Privacy Policy
              </a>
            </Label>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !agreedToTerms}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              `Create ${role === 'teacher' ? 'Teacher' : 'Student'} Account`
            )}
          </Button>

          <div className="text-center text-sm text-gray-500 pt-2">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onLoginClick}
              className="text-primary hover:underline font-medium"
            >
              Sign in
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default SimpleRegistrationForm;
