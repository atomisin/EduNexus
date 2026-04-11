import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Camera, Edit2, Save, X, Mail, Phone, MapPin, Calendar, Award, Briefcase, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { userAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface ProfileProps {
  user: any;
  onUserUpdate?: (updatedUser: any) => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, onUserUpdate }) => {
  const { setUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar || null);
  const [createdAt, setCreatedAt] = useState<string | null>(user.createdAt || null);
  const [formData, setFormData] = useState({
    firstName: user.first_name || user.name?.split(' ')[0] || '',
    lastName: user.last_name || user.name?.split(' ').slice(1).join(' ') || '',
    email: user.email || '',
    phone: user.phone_number || user.phone || '',
    address: user.state || user.address || '',
    bio: user.bio || '',
    specialization: user.profile?.specialization || user.specialization || '',
    educationLevel: user.profile?.education_level || user.educationLevel || user.level || '',
    schoolName: user.profile?.school_name || user.schoolName || '',
    gradeLevel: user.profile?.grade_level || user.gradeLevel || '',
  });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const data = await userAPI.getMe();
        if (data) {
          if (data.created_at) setCreatedAt(data.created_at);

          // Map backend specific profile fields if they exist
          if (data.avatar_url) setAvatarPreview(data.avatar_url);

          if (data.profile) {
            setFormData(prev => ({
              ...prev,
              firstName: data.first_name || prev.firstName,
              lastName: data.last_name || prev.lastName,
              phone: data.phone_number || prev.phone,
              address: data.state || prev.address,
              bio: data.bio || prev.bio,
              educationLevel: data.profile.education_level || prev.educationLevel,
              gradeLevel: data.profile.grade_level || prev.gradeLevel,
              schoolName: data.profile.school_name || prev.schoolName,
              specialization: data.profile.specialization || prev.specialization,
            }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    fetchUserData();
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      const updateData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone_number: formData.phone,
        bio: formData.bio,
        state: formData.address,
        education_level: formData.educationLevel,
        grade_level: formData.gradeLevel,
        school_name: formData.schoolName,
        specialization: formData.specialization,
        avatar_url: avatarPreview || undefined
      };

      const freshUser = await userAPI.updateMe(updateData);

      const updatedUser: any = {
        ...user,
        ...freshUser,
        full_name: freshUser.full_name,
        firstName: freshUser.first_name,
        lastName: freshUser.last_name,
        first_name: freshUser.first_name,
        last_name: freshUser.last_name,
        avatar: freshUser.avatar_url,
        avatar_url: freshUser.avatar_url,
        gamification: freshUser.gamification || user.gamification,
      };

      console.log('Profile: Setting updated user:', updatedUser);
      localStorage.setItem('edunexus_user', JSON.stringify(updatedUser));
      onUserUpdate?.(updatedUser);
      setUser(updatedUser);
      setAvatarPreview(freshUser.avatar_url);
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to save profile. Please try again.');
    }
  };

  const handleCancel = () => {
    // Reset form data
    setFormData({
      firstName: user.first_name || user.name?.split(' ')[0] || '',
      lastName: user.last_name || user.name?.split(' ').slice(1).join(' ') || '',
      email: user.email || '',
      phone: user.phone_number || user.phone || '',
      address: user.state || user.address || '',
      bio: user.bio || '',
      specialization: user.profile?.specialization || user.specialization || '',
      educationLevel: user.profile?.education_level || user.educationLevel || user.level || '',
      schoolName: user.profile?.school_name || user.schoolName || '',
      gradeLevel: user.profile?.grade_level || user.gradeLevel || '',
    });
    setAvatarPreview(user.avatar || null);
    setIsEditing(false);
  };

  const getStatusBadge = () => {
    if (user.status === 'approved') {
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Approved</Badge>;
    } else if (user.status === 'pending') {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending Approval</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Suspended</Badge>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">My Profile</h1>
          <p className="text-slate-500 mt-1">Manage your account information and preferences</p>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge()}
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} className="btn-primary">
              <Edit2 className="w-4 h-4 mr-2" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button onClick={handleCancel} variant="outline">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} className="btn-primary">
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Profile Picture Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Profile Picture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="w-32 h-32">
                {avatarPreview ? (
                  <AvatarImage src={avatarPreview} alt="Profile" className="object-cover" />
                ) : (
                  <AvatarFallback className="text-4xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
              {isEditing && (
                <div className="absolute -bottom-2 -right-2">
                  <label className="cursor-pointer">
                    <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center shadow-lg hover:bg-teal-700 transition-colors">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{user.name}</h3>
              <p className="text-slate-500">{user.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="capitalize">
                  {user.role}
                </Badge>
                {user.createdAt && (
                  <span className="text-sm text-slate-400">
                    Joined {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Personal Information
          </CardTitle>
          <CardDescription>Your basic account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              {isEditing ? (
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  className="h-12"
                />
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <User className="w-4 h-4 text-slate-400" />
                  <span>{formData.firstName || 'Not set'}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              {isEditing ? (
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  className="h-12"
                />
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <User className="w-4 h-4 text-slate-400" />
                  <span>{formData.lastName || 'Not set'}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>{user.email}</span>
                <Badge variant="outline" className="ml-auto">Verified</Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              {isEditing ? (
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="h-12"
                />
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{user.phone || 'Not set'}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              {isEditing ? (
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Your address"
                  className="h-12"
                />
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>{user.address || 'Not set'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            {isEditing ? (
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                placeholder="Tell us about yourself"
                rows={4}
                className="resize-none"
              />
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg min-h-[100px]">
                <p className="text-slate-700 dark:text-slate-300">
                  {user.bio || 'No bio added yet. Tell us about yourself!'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role-Specific Information */}
      {user.role === 'teacher' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Professional Information
            </CardTitle>
            <CardDescription>Your teaching credentials and expertise</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="specialization">Specialization</Label>
                {isEditing ? (
                  <Input
                    id="specialization"
                    value={formData.specialization}
                    onChange={(e) => handleInputChange('specialization', e.target.value)}
                    placeholder="e.g., Mathematics, Physics"
                    className="h-12"
                  />
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <Award className="w-4 h-4 text-slate-400" />
                    <span>{user.subjects?.[0] || 'Not set'}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Subjects Taught</Label>
                <div className="flex flex-wrap gap-2">
                  {user.subjects?.map((subject: string, index: number) => (
                    <Badge key={index} variant="secondary">
                      {subject}
                    </Badge>
                  )) || <span className="text-slate-400">No subjects added</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {user.role === 'student' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5" />
              Academic Information
            </CardTitle>
            <CardDescription>Your educational background and goals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="educationLevel">Education Level</Label>
                {isEditing ? (
                  <Select value={formData.educationLevel} onValueChange={(value) => handleInputChange('educationLevel', value)}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary School</SelectItem>
                      <SelectItem value="secondary">Secondary School</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <GraduationCap className="w-4 h-4 text-slate-400" />
                    <span className="capitalize">{user.level || 'Not set'}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="schoolName">School Name</Label>
                {isEditing ? (
                  <Input
                    id="schoolName"
                    value={formData.schoolName}
                    onChange={(e) => handleInputChange('schoolName', e.target.value)}
                    placeholder="Your school"
                    className="h-12"
                  />
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span>{user.schoolName || 'Not set'}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Account Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div>
                <p className="font-medium">Account Status</p>
                <p className="text-sm text-slate-500">Your current account status</p>
              </div>
              {getStatusBadge()}
            </div>

            {user.status === 'pending' && (
              <Alert>
                <Calendar className="w-4 h-4" />
                <AlertDescription>
                  Your account is currently pending admin approval. You'll receive an email once your account is approved.
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Account Created</p>
                <p className="text-sm text-slate-500">When you joined EduNexus</p>
              </div>
              <span className="text-sm text-slate-600">
                {createdAt ? new Date(createdAt).toLocaleDateString() : 'Unknown'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <div>
                <p className="font-medium text-red-600">Delete Account</p>
                <p className="text-sm text-red-500">Permanently delete your account and all data</p>
              </div>
              <Button variant="destructive" size="sm">
                Delete Account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;