import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import AdminLogin from './components/auth/AdminLogin';
import AdminDashboard from './components/dashboard/AdminDashboard';
import SystemMonitoring from './components/dashboard/SystemMonitoring';
import TenantManagement from './components/tenants/TenantManagement';
import UserManagement from './components/users/UserManagement';
import MarketplaceManagement from './components/marketplace/MarketplaceManagement';
import SystemMonitoring from './components/monitoring/SystemMonitoring';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/layout/ProtectedRoute';

const AppRoutes: React.FC = () => {
  const { isAuthenticated, loading } = useAdminAuth();

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AdminLogin />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="system-monitoring" element={<SystemMonitoring />} />
        <Route path="tenants" element={<TenantManagement />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="marketplace" element={<MarketplaceManagement />} />
        <Route path="monitoring" element={<SystemMonitoring />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AdminAuthProvider>
  );
}

export default App;
