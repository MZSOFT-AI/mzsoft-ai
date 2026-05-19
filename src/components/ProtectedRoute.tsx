import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, LogOut } from 'lucide-react';
import { Button } from './ui/Button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = true }) => {
  const { user, userData, loading, isAdmin, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user && !userData) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // GLOBAL SECURITY ENFORCEMENT: Only admin/superadmin allowed
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-200 p-10 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert size={40} className="text-rose-500" />
          </div>
          
          <h1 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Accès non autorisé</h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            Désolé, votre compte ne dispose pas des permissions nécessaires pour accéder à ce logiciel.
            Seuls les administrateurs sont autorisés.
          </p>

          <Button 
            variant="primary" 
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 h-12 bg-slate-800 hover:bg-slate-900"
          >
            <LogOut size={16} />
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
