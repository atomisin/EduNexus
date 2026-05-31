import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, CheckCircle, XCircle, Clock, Search, Users, GraduationCap, Briefcase, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { adminAPI } from '@/services/api';
import { NotificationBell } from '@/components/NotificationBell';
import ThemeToggle from '@/components/ThemeToggle';
import { UserCard } from './UserCard';
import { TeacherLicensesPanel } from './TeacherLicensesPanel';
import { UsageAnalytics } from './UsageAnalytics';
import { CustomCourseRequestsPanel } from './CustomCourseRequestsPanel';
import { ReportQualityAnalytics } from './ReportQualityAnalytics';
import { VideoCreatorProfilesPanel } from './VideoCreatorProfilesPanel';
import { AdminDelegationPanel } from './AdminDelegationPanel';
import { MessagingView } from '@/components/messaging/MessagingView';

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
  const [activeTab, setActiveTab] = useState('pending');
  const [users, setUsers] = useState<UserType[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adminAccess, setAdminAccess] = useState<{
    is_super_admin: boolean;
    permissions: string[];
    permission_labels?: Record<string, string>;
  } | null>(null);
  const fetchDataPromiseRef = useRef<Promise<void> | null>(null);
  const loadedAdminIdRef = useRef<string | null>(null);

  const hasAdminAccess = useCallback((permission: string) => {
    if (!adminAccess) return false;
    return adminAccess.is_super_admin || adminAccess.permissions.includes('*') || adminAccess.permissions.includes(permission);
  }, [adminAccess]);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await adminAPI.getAllUsers();
      setUsers(data);
    } catch (error: any) {
      toast.error('Failed to fetch users: ' + error.message);
    }
  }, []);

  const fetchTeachers = useCallback(async () => {
    setTeachersLoading(true);
    try {
      const data = await adminAPI.getTeachers();
      setTeachers(data);
    } catch (error: any) {
      toast.error('Failed to fetch teachers: ' + error.message);
    } finally {
      setTeachersLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (fetchDataPromiseRef.current) {
      return fetchDataPromiseRef.current;
    }

    setLoading(true);
    const request = (async () => {
      await fetchUsers();
    })().finally(() => {
      fetchDataPromiseRef.current = null;
      setLoading(false);
    });

    fetchDataPromiseRef.current = request;
    return request;
  }, [fetchUsers]);

  const loadAdminAccess = useCallback(async () => {
    setLoading(true);
    try {
      const access = await adminAPI.getAdminPermissions();
      setAdminAccess(access);
      const canReviewUsers = access?.is_super_admin || access?.permissions?.includes('*') || access?.permissions?.includes('user_approvals');
      if (canReviewUsers) {
        await fetchData();
      } else {
        const firstAllowed =
          access?.permissions?.includes('custom_courses') ? 'custom-courses' :
          access?.permissions?.includes('video_evidence') ? 'video-evidence' :
          access?.permissions?.includes('teacher_licenses') ? 'licenses' :
          access?.permissions?.includes('report_quality') ? 'report-quality' :
          access?.permissions?.includes('messages') ? 'messages' :
          'custom-courses';
        setActiveTab(firstAllowed);
      }
    } catch (error: any) {
      toast.error('Failed to load admin permissions: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    if (authUser?.role === 'admin') {
      setIsLoggedIn(true);
      if (loadedAdminIdRef.current !== authUser.id) {
        loadedAdminIdRef.current = authUser.id;
        void loadAdminAccess();
      }
    }
  }, [authUser, loadAdminAccess]);

  useEffect(() => {
    if (!isLoggedIn || activeTab !== 'licenses' || teachers.length > 0 || teachersLoading || !hasAdminAccess('teacher_licenses')) return;
    void fetchTeachers();
  }, [activeTab, fetchTeachers, hasAdminAccess, isLoggedIn, teachers.length, teachersLoading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const success = await login(email, password);
      if (!success) return;
      setIsLoggedIn(true);
      await loadAdminAccess();
      toast.success('Welcome, Admin!');
    } catch (error: any) {
      toast.error(error.message || 'Invalid admin credentials');
    } finally {
      setLoading(false);
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
  const canManageUsers = hasAdminAccess('user_approvals');
  const isSuperAdmin = Boolean(adminAccess?.is_super_admin || adminAccess?.permissions?.includes('*'));

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-lg border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl">Admin Login</CardTitle>
            <CardDescription>Sign in to review approvals and keep the platform healthy.</CardDescription>
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
                Sign in as admin
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Platform Operations</h2>
              <p className="text-sm text-muted-foreground">Review users, governed custom courses, video evidence sources, teacher licenses, AI cost trends, and assessment quality health.</p>
            </div>
            {isSuperAdmin ? (
              <Button
                type="button"
                className="shrink-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setActiveTab('admins')}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Create admin
              </Button>
            ) : null}
          </div>
        </div>

        <Card className="mb-5 rounded-lg border border-border bg-background shadow-none">
          <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.35fr_1fr]">
            <div className="space-y-2">
              <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 px-3 py-1 text-primary">
                Operations brief
              </Badge>
              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-foreground">What to watch here</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  This workspace keeps approvals, course governance, evidence quality, and teacher capacity in one place so the platform stays safe, credible, and well run.
                </p>
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border border-border bg-subtle p-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs review</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{pendingUsers.length} registrations</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Teacher capacity</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{teacherCount} active teacher profiles</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
            <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 bg-secondary/50 p-1">
              {canManageUsers ? <TabsTrigger value="pending" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Pending Approval ({pendingUsers.length})</TabsTrigger> : null}
              {canManageUsers ? <TabsTrigger value="approved" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Approved Users ({approvedUsers.length})</TabsTrigger> : null}
              {canManageUsers ? <TabsTrigger value="suspended" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Suspended ({suspendedUsers.length})</TabsTrigger> : null}
              {hasAdminAccess('custom_courses') ? <TabsTrigger value="custom-courses" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Custom Courses</TabsTrigger> : null}
              {hasAdminAccess('video_evidence') ? <TabsTrigger value="video-evidence" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Video Evidence</TabsTrigger> : null}
              {hasAdminAccess('teacher_licenses') ? <TabsTrigger value="licenses" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Teacher Licenses ({teacherCount})</TabsTrigger> : null}
              {hasAdminAccess('report_quality') ? <TabsTrigger value="report-quality" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Report Quality</TabsTrigger> : null}
              {hasAdminAccess('messages') ? <TabsTrigger value="messages" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Messages</TabsTrigger> : null}
              {isSuperAdmin ? <TabsTrigger value="admins" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">Admins</TabsTrigger> : null}
              {isSuperAdmin ? <TabsTrigger value="usage" className="min-w-0 whitespace-normal rounded-md px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">AI Usage & Cost</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="pending" className="space-y-4">
              {pendingUsers.length === 0 ? (
                <Alert>
                  <CheckCircle className="w-4 h-4" />
                  <AlertDescription>No registrations are waiting for review right now.</AlertDescription>
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

            <TabsContent value="custom-courses" className="space-y-4">
              {activeTab === 'custom-courses' ? <CustomCourseRequestsPanel /> : null}
            </TabsContent>

            <TabsContent value="video-evidence" className="space-y-4">
              {activeTab === 'video-evidence' ? <VideoCreatorProfilesPanel /> : null}
            </TabsContent>

            <TabsContent value="licenses" className="space-y-4">
              {activeTab !== 'licenses' ? null : teachersLoading && teachers.length === 0 ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <TeacherLicensesPanel teachers={teachers} onRefreshTeachers={fetchTeachers} />
              )}
            </TabsContent>

            <TabsContent value="report-quality" className="space-y-6">
              {activeTab === 'report-quality' ? <ReportQualityAnalytics /> : null}
            </TabsContent>

            <TabsContent value="messages" className="space-y-6">
              {activeTab === 'messages' && authUser ? <MessagingView currentUser={authUser} /> : null}
            </TabsContent>

            <TabsContent value="admins" className="space-y-6">
              {activeTab === 'admins' && isSuperAdmin ? (
                <AdminDelegationPanel permissionLabels={adminAccess?.permission_labels} />
              ) : null}
            </TabsContent>

            <TabsContent value="usage" className="space-y-6">
              {activeTab === 'usage' && isSuperAdmin ? <UsageAnalytics /> : null}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;




