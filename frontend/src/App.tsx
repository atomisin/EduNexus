import React, { useState, useEffect, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import './App.css';

import VerifyEmail from '@/components/auth/VerifyEmail';
import { SmartHelper } from '@/components/ai/SmartHelper';
import { LandingPage } from './features/landing/LandingPage';
import { StudentJoinPage } from './features/auth/StudentJoinPage';
import { ChangePasswordView } from './features/auth/ChangePasswordView';
import { SessionPortal } from './features/session/SessionPortal';
import { ProtectedRoute } from './components/shared/ProtectedRoute';

import { StudentRoutes } from './routes/StudentRoutes';
import { TeacherRoutes } from './routes/TeacherRoutes';
import { AdminRoutes } from './routes/AdminRoutes';

import type { User as UserType } from '@/types';

function App() {
  const { user, logout, setUser: updateUser, mustChangePassword, completePasswordChange, isAuthenticated } = useAuth();
  const [showSmartHelper, setShowSmartHelper] = useState(false);
  const [activeSession, setActiveSession] = useState<{ id: string; title: string; isTeacher: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const handleUserUpdate = (updatedUser: UserType) => {
    updateUser(updatedUser as any);
    localStorage.setItem('edunexus_user', JSON.stringify(updatedUser));
  };

  useEffect(() => {
    const handleNavigate = (e: CustomEvent) => {
      if (e.detail === 'register') navigate('/register');
    };
    window.addEventListener('navigate', handleNavigate as EventListener);
    
    const handleUnauthorized = () => {
      // If we weren't even logged in, ignore the 401
      if (!isAuthenticated) return;

      // Don't redirect if we're on a public page
      const publicPaths = ['/', '/login', '/register', '/join', '/verify-email'];
      const currentPath = window.location.pathname.toLowerCase().split(/[?#]/)[0].replace(/\/$/, '') || '/';
      
      if (publicPaths.includes(currentPath)) {
        console.log('[Auth] Suppressing unauthorized redirect for public path:', currentPath);
        return;
      }
      
      console.log('[Auth] Session expired or unauthorized at:', currentPath);
      logout();
      navigate('/login');
      toast.error('Session expired. Please log in again.');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    
    return () => {
      window.removeEventListener('navigate', handleNavigate as EventListener);
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [navigate, logout]);

  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token && token.startsWith('verify-')) {
      setVerificationToken(token);
      navigate('/verify-email');
    }
  }, [navigate]);

  if (user && mustChangePassword) {
    return (
      <>
        <ChangePasswordView onComplete={completePasswordChange} />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <Routes>
          <Route path="/" element={
            <LandingPage
              user={user}
              onLogin={() => navigate('/login')}
              onRegister={() => navigate('/register')}
              onAdmin={() => navigate('/admin')}
              onJoinSession={() => navigate('/join')}
              onGoDashboard={() => {
                if (user?.role === 'teacher') navigate('/teacher');
                else if (user?.role === 'admin') navigate('/admin');
                else navigate('/student');
              }}
            />
          } />
          
          <Route path="/login" element={<Navigate to="/?auth=login" replace />} />
          <Route path="/register" element={<Navigate to="/?auth=register" replace />} />

          <Route path="/join" element={<StudentJoinPage onBack={() => window.location.href = '/'} />} />

          {/* Extracted Feature Routes */}
          <Route path="/student/*" element={<StudentRoutes user={user} handleLogout={handleLogout} setActiveSession={setActiveSession} />} />
          <Route path="/teacher/*" element={<TeacherRoutes user={user} logout={logout} handleUserUpdate={handleUserUpdate} refreshKey={refreshKey} setActiveSession={setActiveSession} />} />
          <Route path="/admin/*" element={<AdminRoutes />} />

          <Route path="/verify-email" element={
            <VerifyEmail
              token={verificationToken}
              onBack={() => {
                window.history.replaceState({}, document.title, window.location.pathname);
                setVerificationToken(null);
                navigate('/');
              }}
              onLogin={() => {
                window.history.replaceState({}, document.title, window.location.pathname);
                setVerificationToken(null);
                navigate('/');
              }}
            />
          } />

          <Route path="/session/:sessionId" element={
            <ProtectedRoute>
              {activeSession ? (
                <SessionPortal
                  sessionId={activeSession.id}
                  title={activeSession.title}
                  isTeacher={activeSession.isTeacher}
                  onClose={() => {
                    setActiveSession(null);
                    setRefreshKey(prev => prev + 1);
                    navigate(-1);
                  }}
                />
              ) : <Navigate to="/" replace />}
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {user && (
        <>
          <SmartHelper
            isOpen={showSmartHelper}
            onClose={() => setShowSmartHelper(false)}
          />

          <div className="fixed bottom-4 right-4 z-40 flex gap-2">
            <Button
              variant="default"
              size="icon"
              className="h-12 w-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/30"
              onClick={() => setShowSmartHelper(!showSmartHelper)}
            >
              <MessageSquare className="w-5 h-5" />
            </Button>
          </div>
        </>
      )}

      <Toaster />
    </>
  );
}

export default App;
