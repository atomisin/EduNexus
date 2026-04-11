import React from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { toast } from 'sonner';
import { sessionAPI } from '@/services/api';

const StudentDashboard = React.lazy(() => import('@/features/student/StudentDashboard').then(m => ({ default: m.StudentDashboard })));

interface StudentRoutesProps {
  user: any;
  handleLogout: () => void;
  setActiveSession: (session: { id: string; title: string; isTeacher: boolean } | null) => void;
}

export const StudentRoutes: React.FC<StudentRoutesProps> = ({
  user,
  handleLogout,
  setActiveSession
}) => {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/*" element={
        <ProtectedRoute allowedRoles={['student']}>
          <StudentDashboard
            user={user!}
            onLogout={handleLogout}
            onJoinSession={async (id, title) => {
              try {
                await sessionAPI.join(id);
                setActiveSession({ id, title, isTeacher: false });
                navigate(`/session/${id}`);
              } catch (error) {
                toast.error('Failed to join session. It might not be live yet.');
              }
            }}
          />
        </ProtectedRoute>
      } />
    </Routes>
  );
};
