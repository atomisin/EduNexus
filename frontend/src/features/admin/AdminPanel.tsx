import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, CheckCircle, XCircle, Clock, Search, Users, GraduationCap, Briefcase, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminAPI } from '@/services/api';
import { NotificationBell } from '@/components/NotificationBell';
import ThemeToggle from '@/components/ThemeToggle';
import { UserCard } from './UserCard';
import { TeacherLicensesPanel } from './TeacherLicensesPanel';
import { CurriculumMaterialsTab } from './CurriculumMaterialsTab';
import { UsageAnalytics } from './UsageAnalytics';

interface UserType {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  name?: string;
  role: string | null;
  status?: string;
  is_active?: boolean;
  created_at?: string;
  last_login?: string;
  phone_number?: string;
  emailVerified?: boolean;
  email_verified_at?: string | null;
  education_level?: string | null;
  grade_level?: string | null;
  class_level?: string | null;
  department?: string | null;
  curriculum_type?: string | null;
  avatar_url?: string;
}

interface AdminPanelProps {
  onBack: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  onBack
}) => {
  const { user: authUser, login, logout } = useAuth();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'teacher' | 'student'>('all');
  const [users, setUsers] = useState<UserType[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authUser?.role === 'admin') {
      setIsLoggedIn(true);
      fetchData();
    }
  }, [authUser]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchUsers(), fetchTeachers()]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const success = await login(email, password);
      if (!success) return;
      setIsLoggedIn(true);
      toast.success('Welcome, Admin!');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Invalid admin credentials');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await adminAPI.getAllUsers();
      setUsers(data);
    } catch (error: any) {
      toast.error('Failed to fetch users: ' + error.message);
    }
  };

  const fetchTeachers = async () => {
    try {
      const data = await adminAPI.getTeachers();
      setTeachers(data);
    } catch (error: any) {
      toast.error('Failed to fetch teachers: ' + error.message);
    }
  };



  const handleApproveUser = async (userId: string) => {
    try {
      await adminAPI.approveUser(userId);
      toast.success('User approved successfully!');
      fetchUsers();
    } catch (error: any) {
      toast.error('Failed to approve user: ' + error.message);
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      await adminAPI.deactivateUser(userId, 'Rejected by admin');
      toast.info('User rejected');
      fetchUsers();
    } catch (error: any) {
      toast.error('Failed to reject user: ' + error.message);
    }
  };

  const handleDeleteUser = async (userId: string, label: string) => {
    const confirmed = window.confirm(`Permanently delete ${label}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await adminAPI.deleteUser(userId, 'Deleted by admin');
      toast.success('User deleted permanently');
      fetchUsers();
    } catch (error: any) {
      toast.error('Failed to delete user: ' + error.message);
    }
  };

  const filteredUsers = users.filter(user => {
    const userName = user.full_name || user.name || '';
    const matchesSearch = userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role?.toLowerCase() === filterRole;
    return matchesSearch && matchesRole;
  });

  const pendingUsers = filteredUsers.filter(u =>
    (u.status === 'pending' || u.status === 'pending_approval' || u.status === 'PENDING') && Boolean(u.email_verified_at)
  );
  const approvedUsers = filteredUsers.filter(u => 
    u.status === 'active' || u.status === 'approved' || u.status === 'APPROVED'
  );
  const suspendedUsers = filteredUsers.filter(u => u.status === 'suspended');
  const teacherCount = users.filter(u => u.role?.toLowerCase() === 'teacher').length;
  const studentCount = users.filter(u => u.role?.toLowerCase() === 'student').length;

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-lg border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl">Admin Login</CardTitle>
            <CardDescription>Access the admin panel to manage user approvals</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@edunexus.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Login as Admin
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={onBack}>
                Back to Main
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-subtle">
      <header className="min-h-16 bg-background border-b border-border px-2.5 sm:px-4 md:px-5">
        <div className="h-full max-w-7xl mx-auto flex items-center justify-between">
          <div className="min-w-0 flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-sm sm:text-lg font-semibold truncate leading-6 py-0.5">Admin Panel</h1>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 sm:gap-2 md:gap-3">
            <ThemeToggle />
            <NotificationBell />
            <Button variant="outline" className="hidden sm:inline-flex rounded-lg" onClick={onBack}>Back to Main</Button>
            <Button variant="ghost" className="h-9 rounded-lg px-2 sm:px-3" onClick={logout}>Logout</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 py-4 pb-24 sm:p-4 md:p-6 md:pb-8">
        <div className="mb-4 sm:mb-5">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Platform Operations</h2>
          <p className="text-sm text-muted-foreground">Review users, teacher licenses, curriculum materials, and AI cost trends.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-5 sm:mb-6">
          <Card className="rounded-lg border-border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">Total Users</p>
                  <p className="text-xl sm:text-2xl font-semibold mt-1 sm:mt-2">{users.length}</p>
                </div>
                <Users className="w-5 h-5 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-lg border-border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">Pending</p>
                  <p className="text-xl sm:text-2xl font-semibold text-amber-600 mt-1 sm:mt-2">{pendingUsers.length}</p>
                </div>
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-lg border-border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">Teachers</p>
                  <p className="text-xl sm:text-2xl font-semibold mt-1 sm:mt-2">{teacherCount}</p>
                </div>
                <Briefcase className="w-5 h-5 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-lg border-border shadow-none">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">Students</p>
                  <p className="text-xl sm:text-2xl font-semibold mt-1 sm:mt-2">{studentCount}</p>
                </div>
                <GraduationCap className="w-5 h-5 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-lg" variant={filterRole === 'all' ? 'default' : 'outline'} onClick={() => setFilterRole('all')}>All</Button>
            <Button className="rounded-lg" variant={filterRole === 'teacher' ? 'default' : 'outline'} onClick={() => setFilterRole('teacher')}>Teachers</Button>
            <Button className="rounded-lg" variant={filterRole === 'student' ? 'default' : 'outline'} onClick={() => setFilterRole('student')}>Students</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="pending" className="w-full min-w-0">
            <TabsList className="mb-5 grid h-auto w-full grid-cols-2 gap-1 bg-secondary/50 p-1 sm:grid-cols-3 xl:grid-cols-6">
              <TabsTrigger value="pending" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Pending Approval ({pendingUsers.length})</TabsTrigger>
              <TabsTrigger value="approved" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Approved Users ({approvedUsers.length})</TabsTrigger>
              <TabsTrigger value="suspended" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Suspended ({suspendedUsers.length})</TabsTrigger>
              <TabsTrigger value="licenses" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Teacher Licenses ({teachers.length})</TabsTrigger>
              <TabsTrigger value="materials" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Curriculum Materials</TabsTrigger>
              <TabsTrigger value="usage" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">AI Usage & Cost</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4">
              {pendingUsers.length === 0 ? (
                <Alert>
                  <CheckCircle className="w-4 h-4" />
                  <AlertDescription>No pending users. All registrations have been approved!</AlertDescription>
                </Alert>
              ) : (
                pendingUsers.map((user) => (
                  <UserCard key={user.id} user={user} variant="pending" onApprove={handleApproveUser} onReject={handleRejectUser} onDelete={handleDeleteUser} />
                ))
              )}
            </TabsContent>

            <TabsContent value="approved" className="space-y-4">
              {approvedUsers.length === 0 ? (
                <Alert>
                  <Users className="w-4 h-4" />
                  <AlertDescription>No approved users yet.</AlertDescription>
                </Alert>
              ) : (
                approvedUsers.map((user) => (
                  <UserCard key={user.id} user={user} variant="approved" onApprove={handleApproveUser} onReject={handleRejectUser} onDelete={handleDeleteUser} />
                ))
              )}
            </TabsContent>

            <TabsContent value="suspended" className="space-y-4">
              {suspendedUsers.length === 0 ? (
                <Alert>
                  <XCircle className="w-4 h-4" />
                  <AlertDescription>No suspended users.</AlertDescription>
                </Alert>
              ) : (
                suspendedUsers.map((user) => (
                  <UserCard key={user.id} user={user} variant="suspended" onApprove={handleApproveUser} onReject={handleRejectUser} onDelete={handleDeleteUser} />
                ))
              )}
            </TabsContent>

            <TabsContent value="licenses" className="space-y-4">
              <TeacherLicensesPanel teachers={teachers} onRefreshTeachers={fetchTeachers} />
            </TabsContent>

            <TabsContent value="materials" className="space-y-6">
              <CurriculumMaterialsTab isLoggedIn={isLoggedIn} />
            </TabsContent>

            <TabsContent value="usage" className="space-y-6">
              <UsageAnalytics />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;
