import React from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';

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
              setActiveSession({ id, title, isTeacher: false });
              navigate(`/session/${id}`);
            }}
          />
        </ProtectedRoute>
      } />
    </Routes>
  );
};
