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
  avatar_url?: string;
}

interface AdminPanelProps {
  onBack: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  onBack
}) => {
  const { user: authUser } = useAuth();
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
    await Promise.all([fetchUsers(), fetchTeachers()]);
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await adminAPI.login(email, password);
      setIsLoggedIn(true);
      toast.success('Welcome, Admin!');
      fetchUsers();
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
      await adminAPI.updateUser(userId, { status: 'active', is_active: true });
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

  const filteredUsers = users.filter(user => {
    const userName = user.full_name || user.name || '';
    const matchesSearch = userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const pendingUsers = filteredUsers.filter(u => 
    u.status === 'pending' || u.status === 'pending_approval' || u.status === 'PENDING'
  );
  const approvedUsers = filteredUsers.filter(u => 
    u.status === 'active' || u.status === 'approved' || u.status === 'APPROVED'
  );
  const suspendedUsers = filteredUsers.filter(u => u.status === 'suspended');

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <User className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold font-display">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <Button variant="outline" onClick={onBack}>Back to Main</Button>
            <Button variant="ghost" onClick={() => setIsLoggedIn(false)}>Logout</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Users</p>
                  <p className="text-2xl font-bold">{users.length}</p>
                </div>
                <Users className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Pending Approval</p>
                  <p className="text-2xl font-bold text-amber-600">{pendingUsers.length}</p>
                </div>
                <Clock className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Teachers</p>
                  <p className="text-2xl font-bold">{users.filter(u => u.role === 'TEACHER').length}</p>
                </div>
                <Briefcase className="w-8 h-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Students</p>
                  <p className="text-2xl font-bold">{users.filter(u => u.role === 'STUDENT').length}</p>
                </div>
                <GraduationCap className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button variant={filterRole === 'all' ? 'default' : 'outline'} onClick={() => setFilterRole('all')}>All</Button>
            <Button variant={filterRole === 'teacher' ? 'default' : 'outline'} onClick={() => setFilterRole('teacher')}>Teachers</Button>
            <Button variant={filterRole === 'student' ? 'default' : 'outline'} onClick={() => setFilterRole('student')}>Students</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="mb-6 bg-secondary/50 p-1">
              <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Pending Approval ({pendingUsers.length})</TabsTrigger>
              <TabsTrigger value="approved" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Approved Users ({approvedUsers.length})</TabsTrigger>
              <TabsTrigger value="suspended" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Suspended ({suspendedUsers.length})</TabsTrigger>
              <TabsTrigger value="licenses" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Teacher Licenses ({teachers.length})</TabsTrigger>
              <TabsTrigger value="materials" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Curriculum Materials</TabsTrigger>
              <TabsTrigger value="usage" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">AI Usage & Cost</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4">
              {pendingUsers.length === 0 ? (
                <Alert>
                  <CheckCircle className="w-4 h-4" />
                  <AlertDescription>No pending users. All registrations have been approved!</AlertDescription>
                </Alert>
              ) : (
                pendingUsers.map((user) => (
                  <UserCard key={user.id} user={user} variant="pending" onApprove={handleApproveUser} onReject={handleRejectUser} />
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
                  <UserCard key={user.id} user={user} variant="approved" onApprove={handleApproveUser} onReject={handleRejectUser} />
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
                  <UserCard key={user.id} user={user} variant="suspended" onApprove={handleApproveUser} onReject={handleRejectUser} />
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
