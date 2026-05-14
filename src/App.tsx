/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { SessionProvider } from './context/SessionContext';
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
const InventoryAudits = React.lazy(() => import('./pages/InventoryAudits'));
const InventoryAuditDetails = React.lazy(() => import('./pages/InventoryAuditDetails'));

import ProtectedRoute from './components/ProtectedRoute';

const LoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <SessionProvider>
            <Router>
              <React.Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  
                  <Route path="/" element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }>
                    <Route index element={<Dashboard />} />
                    <Route path="pos" element={<POS />} />
                    <Route path="inventory" element={<Inventory />} />
                    <Route path="inventory/audits" element={<InventoryAudits />} />
                    <Route path="inventory/audits/:id" element={<InventoryAuditDetails />} />
                    <Route path="stock-movements" element={<StockMovements />} />
                    <Route path="categories" element={<Categories />} />
                    <Route path="sales-history" element={<SalesHistory />} />
                    <Route path="customers" element={<Customers />} />
                    <Route path="suppliers" element={<Suppliers />} />
                    <Route path="expenses" element={<Expenses />} />
                    <Route path="cash-history" element={<CashHistory />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="settings" element={<Settings />} />
                  </Route>
  
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </React.Suspense>
            </Router>
          </SessionProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
