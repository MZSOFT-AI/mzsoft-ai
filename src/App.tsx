/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { SessionProvider } from './context/SessionContext';
import { SettingsProvider } from './context/SettingsContext';
import { Toaster } from 'react-hot-toast';
import Layout from './components/layout/Layout';

// Lazy loading pages (for better performance)
const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const POS = React.lazy(() => import('./pages/POS'));
const Inventory = React.lazy(() => import('./pages/Inventory'));
const StockMovements = React.lazy(() => import('./pages/StockMovements'));
const Categories = React.lazy(() => import('./pages/Categories'));
const SalesHistory = React.lazy(() => import('./pages/SalesHistory'));
const Customers = React.lazy(() => import('./pages/Customers'));
const Suppliers = React.lazy(() => import('./pages/Suppliers'));
const Expenses = React.lazy(() => import('./pages/Expenses'));
const Reports = React.lazy(() => import('./pages/Reports'));
const CashHistory = React.lazy(() => import('./pages/CashHistory'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Users = React.lazy(() => import('./pages/Users'));
const Quotes = React.lazy(() => import('./pages/Quotes'));
const Invoices = React.lazy(() => import('./pages/Invoices'));
const InventoryAudits = React.lazy(() => import('./pages/InventoryAudits'));
const InventoryAuditDetails = React.lazy(() => import('./pages/InventoryAuditDetails'));

import ProtectedRoute from './components/ProtectedRoute';

const LoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
  </div>
);

const DashboardRedirect = () => {
  const { userData, isAdmin } = useAuth();
  if (isAdmin) return <Dashboard />;
  return <Navigate to="/pos" replace />;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <SettingsProvider>
            <SessionProvider>
            <Toaster position="top-right" reverseOrder={false} />
            <Router>
              <React.Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  
                  <Route path="/" element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }>
                    <Route index element={<DashboardRedirect />} />
                    <Route path="pos" element={<POS />} />
                    <Route path="inventory" element={<ProtectedRoute requireAdmin><Inventory /></ProtectedRoute>} />
                    <Route path="inventory/audits" element={<ProtectedRoute requireAdmin><InventoryAudits /></ProtectedRoute>} />
                    <Route path="inventory/audits/:id" element={<ProtectedRoute requireAdmin><InventoryAuditDetails /></ProtectedRoute>} />
                    <Route path="stock-movements" element={<ProtectedRoute requireAdmin><StockMovements /></ProtectedRoute>} />
                    <Route path="categories" element={<ProtectedRoute requireAdmin><Categories /></ProtectedRoute>} />
                    <Route path="sales-history" element={<SalesHistory />} />
                    <Route path="customers" element={<Customers />} />
                    <Route path="suppliers" element={<ProtectedRoute requireAdmin><Suppliers /></ProtectedRoute>} />
                    <Route path="expenses" element={<ProtectedRoute requireAdmin><Expenses /></ProtectedRoute>} />
                    <Route path="cash-history" element={<CashHistory />} />
                    <Route path="reports" element={<ProtectedRoute requireAdmin><Reports /></ProtectedRoute>} />
                    <Route path="users" element={<ProtectedRoute requireAdmin><Users /></ProtectedRoute>} />
                    <Route path="quotes" element={<Quotes />} />
                    <Route path="invoices" element={<Invoices />} />
                    <Route path="settings" element={<ProtectedRoute requireAdmin><Settings /></ProtectedRoute>} />
                  </Route>
  
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </React.Suspense>
            </Router>
          </SessionProvider>
        </SettingsProvider>
      </NotificationProvider>
    </AuthProvider>
  </ThemeProvider>
  );
}
