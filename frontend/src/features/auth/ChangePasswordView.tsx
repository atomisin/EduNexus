import React, { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ChangePasswordViewProps {
  onComplete: (newPassword: string) => Promise<boolean>;
}

export const ChangePasswordView = ({ onComplete }: ChangePasswordViewProps) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const success = await onComplete(newPassword);
      if (success) {
        toast.success("Password updated! Access granted.");
      }
    } catch (err) {
      toast.error("Failed to update password. Use a stronger one.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
      <Card className="relative w-full max-w-md border-0 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="h-2 bg-gradient-to-r from-primary to-indigo-600 rounded-t-xl" />
        <CardHeader className="text-center pt-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Security Requirement</CardTitle>
          <CardDescription className="text-balance mt-2">
            Your account requires a password update before you can access the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">New Password</Label>
              <Input
                type="password"
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="input-premium h-12"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Confirm Password</Label>
              <Input
                type="password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="input-premium h-12"
              />
            </div>
            <Button type="submit" className="w-full btn-primary h-12 text-md font-bold rounded-xl shadow-lg shadow-primary/20" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Securing Account...
                </>
              ) : (
                "Update & Continue"
              )}
            </Button>
          </form>
          <p className="text-center text-[10px] text-muted-foreground mt-6 uppercase tracking-widest font-bold">
            EduNexus Institutional Security Standard
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
