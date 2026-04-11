import React from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { toast } from 'sonner';
import { sessionAPI } from '@/services/api';

const TeacherDashboard = React.lazy(() => import('@/features/teacher/TeacherDashboard').then(m => ({ default: m.TeacherDashboard })));

interface TeacherRoutesProps {
  user: any;
  logout: () => void;
  handleUserUpdate: (u: any) => void;
  refreshKey: number;
  setActiveSession: (session: { id: string; title: string; isTeacher: boolean } | null) => void;
}

export const TeacherRoutes: React.FC<TeacherRoutesProps> = ({
  user,
  logout,
  handleUserUpdate,
  refreshKey,
  setActiveSession
}) => {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/*" element={
        <ProtectedRoute allowedRoles={['teacher']}>
          <TeacherDashboard
            user={user!}
            onLogout={logout}
            onUserUpdate={handleUserUpdate}
            refreshKey={refreshKey}
            onStartSession={async (id, title, status) => {
              try {
                if (status === 'live') {
                  setActiveSession({ id, title, isTeacher: true });
                  navigate(`/session/${id}`);
                } else if (status === 'paused') {
                  await sessionAPI.resume(id);
                  setActiveSession({ id, title, isTeacher: true });
                  navigate(`/session/${id}`);
                } else {
                  await sessionAPI.start(id);
                  setActiveSession({ id, title, isTeacher: true });
                  navigate(`/session/${id}`);
                }
              } catch (error) {
                toast.error('Failed to start session. Please try again.');
              }
            }}
          />
        </ProtectedRoute>
      } />
    </Routes>
  );
};
