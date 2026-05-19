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
import ErrorBoundary from './components/ErrorBoundary';

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
const Projects = React.lazy(() => import('./pages/Projects'));
const Employees = React.lazy(() => import('./pages/Employees'));
const InventoryAudits = React.lazy(() => import('./pages/InventoryAudits'));
const InventoryAuditDetails = React.lazy(() => import('./pages/InventoryAuditDetails'));
const Notifications = React.lazy(() => import('./pages/Notifications'));

import ProtectedRoute from './components/ProtectedRoute';

const LoadingFallback = () => (
  <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-slate-50">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
    <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Chargement du module...</p>
  </div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <SettingsProvider>
              <SessionProvider>
                <div className="min-h-screen bg-slate-50">
                  <Toaster 
                    position="top-right" 
                    reverseOrder={false}
                    toastOptions={{
                      duration: 4000,
                      style: {
                        borderRadius: '8px',
                        background: '#1e293b',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      },
                    }}
                  />
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
                          <Route path="users" element={<Users />} />
                          <Route path="quotes" element={<Quotes />} />
                          <Route path="invoices" element={<Invoices />} />
                          <Route path="projects" element={<Projects />} />
                          <Route path="employees" element={<Employees />} />
                          <Route path="notifications" element={<Notifications />} />
                          <Route path="settings" element={<Settings />} />
                        </Route>

                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </React.Suspense>
                  </Router>
                </div>
              </SessionProvider>
            </SettingsProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
