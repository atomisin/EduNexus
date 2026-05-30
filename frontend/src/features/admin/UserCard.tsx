import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Trash2, XCircle } from 'lucide-react';

interface UserCardProps {
  user: {
    id: string;
    email: string;
    full_name?: string;
    name?: string;
    role: string | null;
    status?: string;
    created_at?: string;
    avatar_url?: string;
    education_level?: string | null;
    grade_level?: string | null;
    class_level?: string | null;
    department?: string | null;
    curriculum_type?: string | null;
  };
  variant: 'pending' | 'approved' | 'suspended';
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
  onDelete: (userId: string, label: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, variant, onApprove, onReject, onDelete }) => {
  const avatarClass = variant === 'pending'
    ? 'text-xl bg-primary text-primary-foreground'
    : variant === 'approved'
    ? 'text-xl bg-primary/15 text-primary'
    : 'text-xl bg-muted text-muted-foreground';

  const nameClass = variant === 'suspended' ? 'font-semibold text-lg text-muted-foreground' : 'font-semibold text-lg text-foreground';
  const emailClass = 'text-muted-foreground';
  const formatClassLevel = (value?: string | null) => {
    if (!value) return '';
    return value
      .replace(/_/g, ' ')
      .replace(/\bss\s*(\d)\b/gi, 'SS $1')
      .replace(/\bjss\s*(\d)\b/gi, 'JSS $1')
      .replace(/\bp\s*(\d)\b/gi, 'Primary $1')
      .replace(/\bprimary\s*(\d)\b/gi, 'Primary $1')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const studentClass = user.role?.toLowerCase() === 'student'
    ? formatClassLevel(user.class_level || user.grade_level || user.education_level)
    : '';

  return (
    <Card className="rounded-lg border-border bg-background shadow-none">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <Avatar className={`w-12 h-12${variant === 'suspended' ? ' opacity-50' : ''}`}>
            <AvatarImage src={user.avatar_url} />
            <AvatarFallback className={avatarClass}>
              {(user.full_name || user.name)?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h3 className={nameClass}>{user.full_name || user.name}</h3>
                <p className={`${emailClass} truncate`}>{user.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="outline" className={`capitalize${variant === 'suspended' ? ' opacity-50' : ''}`}>
                    {user.role}
                  </Badge>
                  {studentClass && (
                    <Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">
                      {studentClass}{user.department ? ` (${user.department})` : ''}
                    </Badge>
                  )}
                  {user.role?.toLowerCase() === 'student' && user.curriculum_type && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {formatClassLevel(user.curriculum_type)}
                    </Badge>
                  )}
                  {variant === 'pending' && (
                    <Badge className="border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">Pending approval</Badge>
                  )}
                  {variant === 'approved' && (
                    <Badge className="border border-primary/20 bg-primary/10 text-primary">Active</Badge>
                  )}
                  {variant === 'suspended' && (
                    <Badge variant="outline" className="border-border text-muted-foreground">Suspended</Badge>
                  )}
                </div>
                {variant === 'pending' && user.created_at && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Registered: {new Date(user.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {variant === 'pending' && (
                  <>
                    <Button onClick={() => onApprove(user.id)} className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                      <CheckCircle className="w-4 h-4 mr-2" /> Approve
                    </Button>
                    <Button variant="outline" className="rounded-lg border-border" onClick={() => onReject(user.id)}>
                      <XCircle className="w-4 h-4 mr-2" /> Reject
                    </Button>
                  </>
                )}
                {variant === 'approved' && (
                  <Button variant="outline" className="rounded-lg border-border" onClick={() => onReject(user.id)}>Suspend</Button>
                )}
                {variant === 'suspended' && (
                  <Button className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onApprove(user.id)}>Reactivate</Button>
                )}
                <Button
                  variant="outline"
                  className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/40 dark:hover:bg-red-950/30"
                  onClick={() => onDelete(user.id, user.full_name || user.name || user.email)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
