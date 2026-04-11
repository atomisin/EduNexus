import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import type { User as UserType } from '@/types';

interface SettingsViewProps {
  user: UserType | null;
  onUserUpdate?: (user: any) => void;
}

export const SettingsView = ({ user, onUserUpdate }: SettingsViewProps) => {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    aiSuggestions: true,
    darkMode: localStorage.getItem('theme') === 'dark',
  });
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });

  const handleDarkModeToggle = (checked: boolean) => {
    setSettings({ ...settings, darkMode: checked });
    if (checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleUpdateProfile = () => {
    if (user && onUserUpdate) {
      const updatedUser = { ...user, name: profileData.name };
      localStorage.setItem('edunexus_user', JSON.stringify(updatedUser));
      onUserUpdate(updatedUser);
      toast.success('Profile updated successfully!');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Settings</h2>
        <p className="text-slate-500 mt-1">Manage your account and preferences</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={profileData.name}
                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profileData.email} disabled />
            </div>
            <Button onClick={handleUpdateProfile} className="w-full">Update Profile</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-slate-500">Receive updates via email</p>
              </div>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">AI Suggestions</p>
                <p className="text-sm text-slate-500">Get personalized AI recommendations</p>
              </div>
              <Switch
                checked={settings.aiSuggestions}
                onCheckedChange={(checked) => setSettings({ ...settings, aiSuggestions: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-slate-500">Use dark theme</p>
              </div>
              <Switch
                checked={settings.darkMode}
                onCheckedChange={handleDarkModeToggle}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
