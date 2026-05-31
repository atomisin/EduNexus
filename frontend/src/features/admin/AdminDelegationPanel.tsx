import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminAPI } from '@/services/api';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_PERMISSIONS = [
  ['user_approvals', 'User approvals'],
  ['custom_courses', 'Custom course governance'],
  ['video_evidence', 'Video evidence governance'],
  ['teacher_licenses', 'Teacher licenses'],
  ['report_quality', 'Report quality'],
  ['messages', 'Admin messages'],
] as const;

export const AdminDelegationPanel: React.FC<{
  permissionLabels?: Record<string, string>;
}> = ({ permissionLabels }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['user_approvals']);
  const [working, setWorking] = useState(false);

  const labels = DEFAULT_PERMISSIONS.map(([value, fallback]) => [
    value,
    permissionLabels?.[value] || fallback,
  ] as const);

  const togglePermission = (permission: string) => {
    setPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission],
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      toast.error('Name, email, and temporary password are required.');
      return;
    }
    setWorking(true);
    try {
      await adminAPI.createDelegatedAdmin({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        permissions,
      });
      toast.success('Delegated admin created. They will be prompted to change the temporary password.');
      setFullName('');
      setEmail('');
      setPassword('');
      setPermissions(['user_approvals']);
    } catch (error: any) {
      toast.error(error?.message || 'Could not create delegated admin.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="rounded-lg border-border shadow-none">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle>Delegated Admins</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Temporary password</Label>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Responsibilities</Label>
            <div className="grid gap-2">
              {labels.map(([value, label]) => (
                <div key={value} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                  <Checkbox checked={permissions.includes(value)} onCheckedChange={() => togglePermission(value)} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <Button type="submit" className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" disabled={working}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create delegated admin
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default AdminDelegationPanel;
