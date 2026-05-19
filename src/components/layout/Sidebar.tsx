import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useNotification } from '../../context/NotificationContext';
import { MENU_ITEMS } from '../../constants';
import { LogOut, Package, User, Bell, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const Sidebar: React.FC = () => {
  const { logout, user, userData, isAdmin, isSuperAdmin, hasPermission, loading } = useAuth();
  const { settings } = useSettings();
  const { unreadCount, setIsPanelOpen } = useNotification();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Sections definitions
  const sections = [
    {
      title: 'Principal',
      items: ['dashboard', 'pos', 'sales-history', 'returns']
    },
    {
      title: 'Gestion Commerciale',
      items: ['quotes', 'invoices', 'customers']
    },
    {
      title: 'Stock & Logistique',
      items: ['inventory', 'inventory-audits', 'stock-movements', 'categories', 'suppliers']
    },
    {
      title: 'Finances',
      items: ['expenses', 'cash-history']
    },
    {
      title: 'Configuration',
      items: ['reports', 'users', 'settings']
    }
  ];

  const canShowItem = (id: string) => {
    switch (id) {
      case 'dashboard': return true;
      case 'pos': return hasPermission('canSell');
      case 'inventory': return hasPermission('canManageStock') || hasPermission('canPerformInventory');
      case 'inventory-audits': return hasPermission('canPerformInventory');
      case 'stock-movements': return hasPermission('canManageStock');
      case 'categories': return hasPermission('canManageStock');
      case 'sales-history': return true;
      case 'returns': return hasPermission('canProcessReturns');
      case 'customers': return true;
      case 'suppliers': return hasPermission('canManageStock');
      case 'expenses': return hasPermission('canManageExpenses');
      case 'cash-history': return isAdmin;
      case 'users': return isAdmin; // Fixed: using isAdmin instead of isSuperAdmin based on user request
      case 'quotes': return true;
      case 'invoices': return hasPermission('canSell');
      case 'reports': return hasPermission('canViewReports');
      case 'settings': return isAdmin; // Fixed: using isAdmin instead of isSuperAdmin
      default: return true;
    }
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-slate-800 text-white z-50 flex flex-col shadow-2xl border-r border-slate-700">
      {/* Brand Header */}
      <div className="p-6 bg-slate-900 border-b border-slate-700 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <motion.div 
              whileHover={{ rotate: 0, scale: 1.05 }}
              initial={{ rotate: -3 }}
              className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center shadow-lg transition-transform overflow-hidden shrink-0"
            >
              {settings.logo ? (
                <img src={settings.logo} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Package className="text-white w-6 h-6" />
              )}
            </motion.div>
            <div className="min-w-0">
              <span className="font-black text-xl tracking-tighter block leading-tight truncate uppercase">{settings.name}</span>
              <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest mt-1 block truncate">
                {settings.slogan || 'ERP & POS SYSTEM'}
              </span>
            </div>
          </div>

          <button 
            onClick={() => setIsPanelOpen(true)}
            className="p-2 relative hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
          >
            <Bell size={20} />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-slate-900 animate-pulse"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Profile Area */}
      <div className="p-4 bg-slate-800/50 border-b border-slate-700/50">
         <div className="flex items-center gap-3 bg-slate-900/50 p-2 border border-slate-700/30 rounded-lg">
            <div className="w-8 h-8 rounded bg-slate-700 flex items-center justify-center text-slate-400 shrink-0">
               <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-xs font-bold truncate text-slate-200">{userData?.displayName || user?.displayName || 'Utilisateur'}</p>
               <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    loading ? "bg-amber-500" : "bg-emerald-500"
                  )} />
                  <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest truncate">{userData?.role || 'Employé'}</p>
               </div>
            </div>
         </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto py-6 custom-scrollbar px-3 space-y-8">
        {sections.map((section, idx) => {
          const visibleItems = section.items
            .map(id => MENU_ITEMS.find(item => item.id === id))
            .filter(item => item && canShowItem(item.id));

          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-2">
              <h3 className="px-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">
                {section.title}
              </h3>
              <div className="space-y-1">
                {visibleItems.map((item) => item && (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-xs font-black uppercase tracking-wider",
                        isActive
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                          : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                      )
                    }
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn("w-4 h-4 shrink-0 transition-transform group-hover:scale-110")} />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight size={14} className={cn(
                      "opacity-0 transition-all",
                      "group-hover:opacity-100 group-hover:translate-x-0.5"
                    )} />
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 bg-slate-900/50 border-t border-slate-700/50">
        <button
          onClick={handleLogout}
          className="group flex items-center gap-3 w-full px-4 py-3 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white transition-all rounded-xl text-xs font-black uppercase tracking-widest border border-red-500/20 overflow-hidden relative"
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-red-500 transform -translate-x-full group-hover:translate-x-0 transition-transform" />
          <LogOut size={16} className="relative z-10 transition-transform group-hover:-translate-x-1" />
          <span className="relative z-10">DÉCONNEXION</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
