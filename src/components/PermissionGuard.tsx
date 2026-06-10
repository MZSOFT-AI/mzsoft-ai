import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, LogOut, ArrowLeft } from 'lucide-react';
import { Button } from './ui/Button';
import { useNavigate } from 'react-router-dom';
import { UserPermissions } from '../types';

interface PermissionGuardProps {
  children: React.ReactNode;
  permission: keyof UserPermissions;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({ children, permission }) => {
  const { hasPermission, logout } = useAuth();
  const navigate = useNavigate();

  const hasAccess = hasPermission(permission);

  if (!hasAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[75vh] p-8 text-center bg-transparent">
        <div className="w-20 h-20 bg-rose-50 dark:bg-rose-950/10 rounded-3xl flex items-center justify-center text-rose-600 dark:text-rose-500 mb-6 shadow-xl shadow-rose-100 dark:shadow-none border border-rose-100 dark:border-rose-950/30 animate-bounce">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase mb-3">
          Accès Restreint
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md text-sm font-semibold mb-8 leading-relaxed">
          Désolé, votre rôle ou votre compte utilisateur ne dispose pas de l'autorisation spécifique <span className="text-rose-600 dark:text-rose-400 font-black uppercase">"{permission}"</span> requise pour accéder à cette page.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={() => navigate(-1)} 
            variant="outline" 
            className="flex items-center gap-2 font-black uppercase text-xs tracking-widest px-6 h-12 rounded-xl"
          >
            <ArrowLeft size={16} />
            Retour
          </Button>
          <Button 
            onClick={() => navigate('/')} 
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 border border-slate-700 text-white font-black uppercase text-xs tracking-widest px-6 h-12 rounded-xl"
          >
            Aller au Tableau de bord
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default PermissionGuard;
