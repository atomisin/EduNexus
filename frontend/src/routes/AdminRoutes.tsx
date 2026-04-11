import React from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';

const AdminPanel = React.lazy(() => import('@/features/admin/AdminPanel').then(m => ({ default: m.AdminPanel })));

export const AdminRoutes: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/*" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminPanel onBack={() => navigate('/')} />
        </ProtectedRoute>
      } />
    </Routes>
  );
};
