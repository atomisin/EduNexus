import React, { useState, useEffect } from 'react';
import {
  Home, Users, Video, Layers, MessageSquare, FileText, BarChart3, LucideUser, Settings,
  LogOut, Menu, BookOpen, Award, Trash2, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

import { NotificationBell } from '@/components/NotificationBell';
import ThemeToggle from '@/components/ThemeToggle';
import Profile from '@/components/Profile';
import { MessagingView } from '@/components/messaging/MessagingView';
import { AITogglePanel } from './sessions/AITogglePanel';
import { CreateSessionDialog } from './sessions/CreateSessionDialog';
import { SubjectManager } from './subjects/SubjectManager';
import { TeacherSessionsView } from './sessions/TeacherSessionsView';
import { TeacherReports } from './reports/TeacherReports';
import { AnalyticsView } from './analytics/AnalyticsView';
import { SettingsView } from './settings/SettingsView';
import { StudentManagementView } from './students/StudentManagementView';

import { subjectsAPI, teacherAPI, sessionAPI } from '@/services/api';
import { fetchWithAuth } from '@/services/api';
import type { User as UserType, Session, AIConfig, View } from '@/types';

interface TeacherDashboardProps {
  user: UserType;
  onLogout: () => void;
  onUserUpdate?: (user: UserType) => void;
  onStartSession: (sessionId: string, title: string, status?: string) => void;
  refreshKey?: number;
}

export const TeacherDashboard = ({ user, onLogout, onUserUpdate, onStartSession, refreshKey }: TeacherDashboardProps) => {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    llmEnabled: true,
    ttsEnabled: false,
    sttEnabled: false,
    autoExplain: true,
    suggestVideos: true,
    generateAssignments: true,
    llmModel: 'llama3.2:3b'
  });

  const [dashboardStats, setDashboardStats] = useState({
    totalStudents: 0,
    activeSessions: 0,
    totalSubjects: 0,
    impactScore: 0
  });

  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [linkedStudents, setLinkedStudents] = useState<any[]>([]);

  const loadLinkedStudents = async () => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    try {
      const data = await teacherAPI.getMyLinkedStudents();
      setLinkedStudents(data.students || []);
    } catch (error) {
      console.error('Failed to load linked students:', error);
    }
  };

  const loadAISettings = async () => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    try {
      const response = await fetchWithAuth('/teachers/settings/ai');
      if (response.ai_settings) {
        setAiConfig({
          llmEnabled: response.ai_settings.llm_enabled ?? true,
          ttsEnabled: response.ai_settings.tts_enabled ?? false,
          sttEnabled: response.ai_settings.stt_enabled ?? false,
          autoExplain: response.ai_settings.auto_explain ?? true,
          suggestVideos: response.ai_settings.suggest_videos ?? true,
          generateAssignments: response.ai_settings.generate_assignments ?? true,
          llmModel: response.ai_settings.llm_model ?? 'llama3.2:3b'
        });
      }
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  };

  const saveAISettings = async (config: AIConfig) => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    try {
      await fetchWithAuth('/teachers/settings/ai', {
        method: 'PATCH',
        body: JSON.stringify({
          llm_enabled: config.llmEnabled,
          tts_enabled: config.ttsEnabled,
          stt_enabled: config.sttEnabled,
          auto_explain: config.autoExplain,
          suggest_videos: config.suggestVideos,
          generate_assignments: config.generateAssignments,
          llm_model: config.llmModel
        })
      });
    } catch (error) {
      console.error('Failed to save AI settings:', error);
    }
  };

  const handleAiConfigChange = (config: AIConfig) => {
    setAiConfig(config);
    saveAISettings(config);
  };

  useEffect(() => {
    if (user?.role?.toLowerCase() === 'teacher') {
      loadLinkedStudents();
      loadAISettings();
    }
  }, [user?.role]);

  const loadDashboardData = async () => {
    setSessionsLoading(true);
    try {
      const [sessionsData, subjectsData] = await Promise.all([
        sessionAPI.list('scheduled'),
        subjectsAPI.getAll()
      ]);
      const activeSessionsList = (sessionsData.sessions || []).filter((s: any) => s.status !== 'ended');
      setUpcomingSessions(activeSessionsList);
      setDashboardStats({
        totalStudents: linkedStudents.length,
        activeSessions: activeSessionsList.length,
        totalSubjects: subjectsData.subjects?.length || 0,
        impactScore: user.gamification?.impact_score || 0
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [refreshKey, user.gamification?.impact_score, linkedStudents.length]);

  const handleSessionCreated = async () => {
    const data = await sessionAPI.list('scheduled');
    const activeSessionsList = (data.sessions || []).filter((s: any) => s.status !== 'ended');
    setUpcomingSessions(activeSessionsList);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      await sessionAPI.delete(sessionId);
      toast.success('Session deleted successfully');
      setUpcomingSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete session');
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'subjects', label: 'Subjects', icon: Layers },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];



  const quickStats = [
    { label: 'Total Students', value: dashboardStats.totalStudents.toString(), change: '+0', icon: Users },
    { label: 'Active Sessions', value: dashboardStats.activeSessions.toString(), change: '+0', icon: Video },
    { label: 'Subjects', value: dashboardStats.totalSubjects.toString(), change: '+0', icon: BookOpen },
    { label: 'Impact Score', value: dashboardStats.impactScore.toString(), change: '+0', icon: Award },
  ];

  return (
    <div className="min-h-screen bg-subtle flex w-full relative overflow-x-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden animate-in fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed md:relative z-50 h-screen bg-background border-r border-border transition-all duration-300 flex flex-col shadow-2xl md:shadow-none ${sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-20 md:translate-x-0'
          }`}
      >
        <div className="p-5 flex items-center justify-start">
          <img src="/edunexus-logo.png" alt="EduNexus" className="h-[100px] w-auto" />
        </div>

        <ScrollArea className="flex-1 py-4 px-3">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id as View)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  activeView === item.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </button>
            ))}
          </nav>
        </ScrollArea>

        {/* Sidebar Footer Removed */}
      </aside>

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="bg-background border-b border-border px-6 py-4 flex items-center justify-between text-foreground">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-500">
              <Menu className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg md:text-xl font-semibold line-clamp-1">
                Welcome back, {user.first_name || user.name?.split(' ')[0] || 'Teacher'}!
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">Here's what's happening today</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white dark:border-slate-800 shadow-sm hover:border-primary transition-colors"
              >
                <Avatar className="w-full h-full">
                  <AvatarImage src={user.avatar || user.avatar_url} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {(user.first_name?.[0] || user.name?.[0] || 'U').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-12 z-20 w-48 rounded-xl border border-border bg-background shadow-lg py-1">
                    <button
                      onClick={() => {
                        setActiveView('settings');
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('messages');
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Messages
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('profile');
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                    >
                      <LucideUser className="w-4 h-4" />
                      Profile
                    </button>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={onLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <ScrollArea className="flex-1 p-6">
          {activeView === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
                {quickStats.map((stat: any, i: number) => (
                  <Card key={i} className="border border-border shadow-sm hover-lift overflow-hidden">
                    <div className="h-1 bg-primary" />
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{stat.label}</p>
                          <p className="text-3xl font-bold text-foreground mt-1">{stat.value}</p>
                          <Badge variant="outline" className="mt-2 border-primary/20 text-primary">
                            +{stat.change} this week
                          </Badge>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <stat.icon className="w-6 h-6 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">My Sessions</h2>
                      <p className="text-muted-foreground italic">Manage your active and upcoming teaching sessions</p>
                    </div>
                    <Button onClick={() => { setShowCreateSession(true); loadLinkedStudents(); }} className="btn-primary shadow-lg shadow-primary/20 rounded-xl px-6">
                      <Video className="w-4 h-4 mr-2" /> New Session
                    </Button>
                  </div>
                  <TeacherSessionsView onStart={onStartSession} onDelete={handleDeleteSession} />
                </div>

                <AITogglePanel config={aiConfig} onChange={handleAiConfigChange} />
              </div>
            </div>
          )}

          {activeView === 'profile' && <Profile user={user} onUserUpdate={onUserUpdate} />}
          {activeView === 'subjects' && <SubjectManager />}
          {activeView === 'reports' && <TeacherReports onNavigate={(view: any) => setActiveView(view as View)} />}
          {activeView === 'analytics' && <AnalyticsView onNavigate={(view: any) => setActiveView(view as View)} />}
          {activeView === 'settings' && <SettingsView user={user} onUserUpdate={onUserUpdate} />}
          {activeView === 'students' && <StudentManagementView />}
          {activeView === 'messages' && <MessagingView currentUser={user} />}
        </ScrollArea>
      </main>

      <CreateSessionDialog
        open={showCreateSession}
        onOpenChange={setShowCreateSession}
        aiConfig={aiConfig}
        onAiConfigChange={setAiConfig}
        linkedStudents={linkedStudents}
        userRole={user?.role ?? undefined}
        onSessionCreated={handleSessionCreated}
      />
    </div>
  );
};
