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
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your teaching identity, alerts, and working preferences.</p>
      </div>

      <Card className="rounded-lg border border-border bg-background shadow-none">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.25fr_1fr]">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings brief</p>
            <h3 className="text-lg font-semibold text-foreground">Keep the workspace comfortable and reliable</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              These settings shape how EduNexus supports your teaching day, from notification rhythm to workspace comfort.
            </p>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-subtle p-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email updates</p>
              <p className="mt-1 text-foreground">{settings.emailNotifications ? 'Enabled' : 'Paused'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI suggestions</p>
              <p className="mt-1 text-foreground">{settings.aiSuggestions ? 'Available' : 'Paused'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-lg border border-border bg-background shadow-none">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
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
            <Button onClick={handleUpdateProfile} className="w-full rounded-lg bg-primary hover:bg-primary/90">Save changes</Button>
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-border bg-background shadow-none">
          <CardHeader>
            <CardTitle>Teaching preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Receive teaching updates by email</p>
              </div>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">AI Suggestions</p>
                <p className="text-sm text-muted-foreground">Get AI suggestions shaped to your teaching pattern</p>
              </div>
              <Switch
                checked={settings.aiSuggestions}
                onCheckedChange={(checked) => setSettings({ ...settings, aiSuggestions: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">Use dark theme</p>
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






