import React, { useMemo, useState, useEffect } from 'react';
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
  onStartSession: (sessionId: string, title: string, status?: string) => Promise<void>;
  refreshKey?: number;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const INITIAL_SECONDARY_LOAD_DELAY_MS = 350;
const SUBJECT_COUNT_LOAD_DELAY_MS = 900;
const TOPIC_REQUEST_LOAD_DELAY_MS = 1200;
const SUBJECT_COUNT_TIMEOUT_MS = 45000;

const loadTeacherSessionsWithRetry = async (attempts: number = 3): Promise<any[]> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const data = await sessionAPI.list(undefined, 12, 0, true);
      const sessions = Array.isArray(data) ? data : (data.sessions || []);
      if (sessions.length > 0 || attempt === attempts - 1) {
        return sessions;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) {
        throw error;
      }
    }
    await wait(1500 * (attempt + 1));
  }
  if (lastError) throw lastError;
  return [];
};

export const TeacherDashboard = ({ user, onLogout, onUserUpdate, onStartSession, refreshKey }: TeacherDashboardProps) => {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
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
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);
  const [linkedStudents, setLinkedStudents] = useState<any[]>([]);
  const [linkedStudentCount, setLinkedStudentCount] = useState(0);
  const [linkedStudentsLoaded, setLinkedStudentsLoaded] = useState(false);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false);
  const [topicRequests, setTopicRequests] = useState<any[]>([]);
  const [topicRequestsLoading, setTopicRequestsLoading] = useState(false);
  const [topicRequestsLoaded, setTopicRequestsLoaded] = useState(false);

  const loadLinkedStudents = async () => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    try {
      const data = await teacherAPI.getMyLinkedStudents();
      setLinkedStudents(data.students || []);
      setLinkedStudentCount(typeof data.count === 'number' ? data.count : (data.students || []).length);
    } catch (error) {
      console.error('Failed to load linked students:', error);
    } finally {
      setLinkedStudentsLoaded(true);
    }
  };

  const loadLinkedStudentsSummary = async () => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    try {
      const data = await teacherAPI.getMyLinkedStudents({ summary: true });
      setLinkedStudentCount(typeof data.count === 'number' ? data.count : 0);
    } catch (error) {
      console.error('Failed to load linked student summary:', error);
    }
  };

  const loadTopicRequests = async () => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    setTopicRequestsLoading(true);
    try {
      const data = await teacherAPI.getTopicRequests();
      setTopicRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load topic requests:', error);
    } finally {
      setTopicRequestsLoaded(true);
      setTopicRequestsLoading(false);
    }
  };

  const loadPreparedSubjects = async () => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    try {
      const data = await subjectsAPI.getAll(
        { mine: true, summary: true },
        { timeoutMs: SUBJECT_COUNT_TIMEOUT_MS, suppressFailureToast: true }
      );
      setDashboardStats(prev => ({
        ...prev,
        totalSubjects: typeof data?.count === 'number'
          ? data.count
          : (Array.isArray(data) ? data.length : (data?.subjects || []).length),
      }));
    } catch (error) {
      console.error('Failed to load teacher subject count:', error);
    } finally {
      setSubjectsLoaded(true);
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
      loadAISettings();
      const linkedStudentsTimer = window.setTimeout(() => {
        void loadLinkedStudentsSummary();
      }, INITIAL_SECONDARY_LOAD_DELAY_MS);
      const subjectsTimer = window.setTimeout(() => {
        void loadPreparedSubjects();
      }, SUBJECT_COUNT_LOAD_DELAY_MS);
      const topicRequestsTimer = window.setTimeout(() => {
        void loadTopicRequests();
      }, TOPIC_REQUEST_LOAD_DELAY_MS);

      return () => {
        window.clearTimeout(linkedStudentsTimer);
        window.clearTimeout(subjectsTimer);
        window.clearTimeout(topicRequestsTimer);
      };
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    if (activeView === 'students' && !linkedStudentsLoaded) {
      void loadLinkedStudents();
    }
    if (activeView === 'subjects' && !subjectsLoaded) {
      void loadPreparedSubjects();
    }
  }, [activeView, linkedStudentsLoaded, subjectsLoaded, user?.role]);

  const loadDashboardData = async () => {
    setSessionsLoading(true);
    try {
      const [sessionsResult] = await Promise.allSettled([
        loadTeacherSessionsWithRetry(),
      ]);
      const sessionsData = sessionsResult.status === 'fulfilled' ? sessionsResult.value : [];
      const allSessions = Array.isArray(sessionsData) ? sessionsData : [];
      const activeSessionsList = allSessions.filter((s: any) => s.status !== 'ended');
      setUpcomingSessions(activeSessionsList);
      setDashboardStats(prev => ({
        ...prev,
        totalStudents: linkedStudentCount,
        activeSessions: activeSessionsList.length,
        impactScore: user.gamification?.impact_score || 0,
      }));
      if (sessionsResult.status === 'rejected') {
        console.error('Failed to load teacher sessions summary:', sessionsResult.reason);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [refreshKey, user.gamification?.impact_score, linkedStudentCount, subjectsLoaded]);

  const handleAssignTopicRequest = async (requestId: string) => {
    try {
      await teacherAPI.assignTopicRequest(requestId);
      toast.success('Help request assigned to you.');
      await loadTopicRequests();
    } catch (error: any) {
      toast.error(error.message || 'Could not assign that help request.');
    }
  };

  const handleCompleteTopicRequest = async (requestId: string) => {
    try {
      await teacherAPI.completeTopicRequest(requestId);
      toast.success('Help request marked as completed.');
      await loadTopicRequests();
    } catch (error: any) {
      toast.error(error.message || 'Could not complete that help request.');
    }
  };

  const handleSessionCreated = (session?: any) => {
    if (!session) {
      void loadDashboardData();
      setSessionRefreshKey(prev => prev + 1);
      return;
    }

    setUpcomingSessions(prev => {
      const withoutDuplicate = prev.filter(existing => existing.id !== session.id);
      return [session, ...withoutDuplicate]
        .filter((s: any) => s.status !== 'ended')
        .sort((a: any, b: any) => {
          const aTime = new Date(a?.scheduled_start || a?.created_at || 0).getTime();
          const bTime = new Date(b?.scheduled_start || b?.created_at || 0).getTime();
          return bTime - aTime;
        });
    });
    setDashboardStats(prev => ({
      ...prev,
      activeSessions: session?.status === 'ended' ? prev.activeSessions : prev.activeSessions + 1,
    }));
    setSessionRefreshKey(prev => prev + 1);
    void loadDashboardData();
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      await sessionAPI.delete(sessionId);
      toast.success('Session deleted successfully');
      setUpcomingSessions(prev => prev.filter(s => s.id !== sessionId));
      setSessionRefreshKey(prev => prev + 1);
      void loadDashboardData();
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

  const teacherBrief = useMemo(() => {
    const liveOrUpcoming = upcomingSessions[0];
    return {
      nextFocus: liveOrUpcoming?.context?.topic || liveOrUpcoming?.title || 'Review your session plan and learner notes before class.',
      rosterSignal: linkedStudentCount > 0 ? `${linkedStudentCount} learner${linkedStudentCount === 1 ? '' : 's'} linked to your workspace` : 'Your roster is still light. Add or invite learners so teaching can begin with proper context.',
      aiSignal: aiConfig.llmEnabled
        ? aiConfig.autoExplain
          ? 'AI teaching support is ready for explanations, notes, and assignments.'
          : 'AI support is available, though some lesson automation is paused.'
        : 'AI teaching support is paused for now.',
    };
  }, [aiConfig.autoExplain, aiConfig.llmEnabled, linkedStudentCount, upcomingSessions]);

  const onboardingSteps = useMemo(() => {
    const steps: Array<{
      id: string;
      title: string;
      description: string;
      action: string;
      run: () => void;
    }> = [];

    if (dashboardStats.totalSubjects === 0) {
      steps.push({
        id: 'subjects',
        title: 'Add your teaching subjects',
        description: 'Link the subjects you actually teach so lesson planning and session setup have the right curriculum.',
        action: 'Open subjects',
        run: () => setActiveView('subjects'),
      });
    }

    if (linkedStudentCount === 0) {
      steps.push({
        id: 'students',
        title: 'Build your learner roster',
        description: 'Add a learner by ID or register one directly so reports, messages, and live sessions have real students attached.',
        action: 'Open students',
        run: () => setActiveView('students'),
      });
    }

    if (dashboardStats.totalSubjects > 0 && linkedStudentCount > 0 && upcomingSessions.length === 0) {
      steps.push({
        id: 'sessions',
        title: 'Schedule your first live class',
        description: 'Your core setup is ready. Create one session to bring topic selection, prep, and learner access together.',
        action: 'New session',
        run: () => {
          setShowCreateSession(true);
          if (!linkedStudentsLoaded) {
            void loadLinkedStudents();
          }
        },
      });
    }

    return steps;
  }, [dashboardStats.totalSubjects, linkedStudentCount, upcomingSessions.length, linkedStudentsLoaded]);

  return (
    <div className="min-h-dvh bg-subtle flex w-full relative overflow-x-hidden">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden animate-in fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed lg:relative z-50 h-dvh bg-background border-r border-border transition-all duration-300 flex flex-col shadow-2xl lg:shadow-none ${sidebarOpen ? 'w-64 lg:w-60 translate-x-0' : 'w-64 -translate-x-full lg:w-20 lg:translate-x-0'
          }`}
      >
        <div className="h-16 px-4 flex items-center justify-start border-b border-border">
          <img src="/edunexus-logo.png" alt="EduNexus" className="h-12 w-auto object-contain" />
        </div>

        <ScrollArea className="flex-1 py-4 px-3">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id as View)}
                aria-label={item.label}
                title={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  activeView === item.id
                    ? 'bg-primary text-primary-foreground'
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

      <main className="flex-1 flex flex-col min-h-dvh min-w-0 overflow-hidden">
        <header className="min-h-16 bg-background border-b border-border px-2.5 sm:px-4 md:px-5 flex items-center justify-between text-foreground gap-2 overflow-visible">
          <div className="min-w-0 flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="h-8 w-8 shrink-0 text-muted-foreground">
              <Menu className="w-5 h-5" />
            </Button>
            <div className="min-w-0 max-w-[40vw] sm:max-w-none">
              <h1 className="text-sm sm:text-base md:text-lg font-semibold truncate leading-6 py-0.5">
                Good to see you, {user.first_name || user.name?.split(' ')[0] || 'Teacher'}
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground hidden sm:block leading-5">Your teaching workspace is ready.</p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 sm:gap-2 md:gap-4">
            <ThemeToggle />
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-white dark:border-slate-800 shadow-sm hover:border-primary transition-colors"
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
                  <div className="absolute right-0 top-12 z-20 w-48 rounded-lg border border-border bg-background shadow-lg py-1">
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

        <ScrollArea className="flex-1">
          <div className="w-full max-w-7xl mx-auto px-3 py-4 pb-24 sm:p-4 md:p-6 md:pb-8">
          {activeView === 'dashboard' && (
            <div className="space-y-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Teaching Dashboard</h2>
                  <p className="text-sm text-muted-foreground">Plan class flow, guide learners, and keep your teaching rhythm steady.</p>
                </div>
                <Button onClick={() => {
                  setShowCreateSession(true);
                  if (!linkedStudentsLoaded) {
                    void loadLinkedStudents();
                  }
                }} className="w-fit bg-primary hover:bg-primary/90 rounded-lg">
                  <Video className="w-4 h-4 mr-2" /> New Session
                </Button>
              </div>

              <div className="grid gap-3 xl:grid-cols-[1.65fr_1fr]">
                <Card className="rounded-lg border border-border bg-background shadow-none">
                  <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.3fr_1fr]">
                    <div className="space-y-3">
                      <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 px-3 py-1 text-primary">
                        Teaching brief
                      </Badge>
                      <div className="space-y-1.5">
                        <h3 className="text-lg font-semibold text-foreground">Next focus</h3>
                        <p className="text-sm leading-6 text-muted-foreground">{teacherBrief.nextFocus}</p>
                      </div>
                    </div>
                    <div className="grid gap-2 rounded-lg border border-border bg-subtle p-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roster signal</p>
                        <p className="mt-1 text-sm text-foreground">{teacherBrief.rosterSignal}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI support</p>
                        <p className="mt-1 text-sm text-foreground">{teacherBrief.aiSignal}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-lg border border-border bg-background shadow-none">
                  <CardContent className="grid gap-3 p-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Class rhythm</p>
                      <p className="mt-1 text-sm text-foreground">
                        {dashboardStats.activeSessions > 0
                          ? `${dashboardStats.activeSessions} session${dashboardStats.activeSessions === 1 ? '' : 's'} currently in your queue.`
                          : 'No live queue yet. This is a good moment to prepare your next class.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-border bg-subtle px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Learners linked</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{dashboardStats.totalStudents}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-subtle px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Prepared subjects</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{dashboardStats.totalSubjects}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                {quickStats.map((stat: any, i: number) => (
                  <Card key={i} className="rounded-lg border border-border bg-background shadow-none overflow-hidden">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">{stat.label}</p>
                          <p className="text-xl sm:text-2xl font-semibold text-foreground mt-1 sm:mt-2">{stat.value}</p>
                        </div>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {onboardingSteps.length > 0 && (
                <Card className="rounded-lg border border-border bg-background shadow-none">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-base font-semibold">Teacher setup guide</CardTitle>
                    <CardDescription>
                      A few quick steps will turn this into a fully working classroom workspace.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {onboardingSteps.map((step, index) => (
                      <div key={step.id} className="flex flex-col gap-3 rounded-lg border border-border bg-subtle px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {index + 1}. {step.title}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                        </div>
                        <Button variant="outline" className="w-fit rounded-lg" onClick={step.run}>
                          {step.action}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">Teaching sessions</h2>
                      <p className="text-sm text-muted-foreground">Keep your next live class, prep pack, and room entry in one place.</p>
                    </div>
                  </div>
                  <TeacherSessionsView onStart={onStartSession} onDelete={handleDeleteSession} refreshKey={sessionRefreshKey} />
                </div>

                <div className="space-y-6">
                  <Card className="rounded-lg border border-border bg-background shadow-none">
                    <CardHeader className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-base font-semibold">Help requests</CardTitle>
                          <CardDescription>
                            Extra topic support your learners asked for outside live class.
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="rounded-full text-[11px] font-semibold">
                          {topicRequests.length} open
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {topicRequestsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading help requests...
                        </div>
                      ) : topicRequests.length > 0 ? (
                        topicRequests.slice(0, 5).map((request) => (
                          <div key={request.id} className="rounded-lg border border-border bg-subtle px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">{request.topic_name}</p>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {request.subject}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] uppercase">
                                {String(request.priority || 'medium')}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {String(request.status || 'pending').replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              From <span className="font-medium text-foreground">{request.student_name}</span>
                            </p>
                            {request.description ? (
                              <p className="mt-2 text-sm text-muted-foreground">{request.description}</p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {request.status === 'pending' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-lg"
                                  onClick={() => void handleAssignTopicRequest(request.id)}
                                >
                                  Pick this up
                                </Button>
                              ) : null}
                              {request.status === 'in_progress' ? (
                                <Button
                                  size="sm"
                                  className="h-8 rounded-lg bg-primary hover:bg-primary/90"
                                  onClick={() => void handleCompleteTopicRequest(request.id)}
                                >
                                  Mark complete
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No extra support requests are waiting right now.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <AITogglePanel config={aiConfig} onChange={handleAiConfigChange} />
                </div>
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
          </div>
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




