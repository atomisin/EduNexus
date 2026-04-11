import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle } from 'lucide-react';

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
  };
  variant: 'pending' | 'approved' | 'suspended';
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, variant, onApprove, onReject }) => {
  const avatarClass = variant === 'pending'
    ? 'text-xl bg-primary text-primary-foreground'
    : variant === 'approved'
    ? 'text-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
    : 'text-xl bg-slate-400 text-white';

  const nameClass = variant === 'suspended' ? 'font-semibold text-lg text-slate-500' : 'font-semibold text-lg';
  const emailClass = variant === 'suspended' ? 'text-slate-400' : 'text-slate-500';

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className={`w-16 h-16${variant === 'suspended' ? ' opacity-50' : ''}`}>
            <AvatarImage src={user.avatar_url} />
            <AvatarFallback className={avatarClass}>
              {(user.full_name || user.name)?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className={nameClass}>{user.full_name || user.name}</h3>
                <p className={emailClass}>{user.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="outline" className={`capitalize${variant === 'suspended' ? ' opacity-50' : ''}`}>
                    {user.role}
                  </Badge>
                  {variant === 'pending' && (
                    <Badge className="bg-amber-100 text-amber-700">Pending Approval</Badge>
                  )}
                  {variant === 'approved' && (
                    <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                  )}
                  {variant === 'suspended' && (
                    <Badge variant="destructive">Suspended</Badge>
                  )}
                </div>
                {variant === 'pending' && user.created_at && (
                  <p className="text-sm text-muted-foreground mt-1"> {/* Changed from slate-400 */}
                    Registered: {new Date(user.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {variant === 'pending' && (
                  <>
                    <Button onClick={() => onApprove(user.id)} className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle className="w-4 h-4 mr-2" /> Approve
                    </Button>
                    <Button variant="destructive" onClick={() => onReject(user.id)}>
                      <XCircle className="w-4 h-4 mr-2" /> Reject
                    </Button>
                  </>
                )}
                {variant === 'approved' && (
                  <Button variant="outline" onClick={() => onReject(user.id)}>Suspend</Button>
                )}
                {variant === 'suspended' && (
                  <Button variant="default" onClick={() => onApprove(user.id)}>Reactivate</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
