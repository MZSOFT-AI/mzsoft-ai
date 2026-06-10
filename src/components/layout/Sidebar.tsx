import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useNotification } from '../../context/NotificationContext';
import { MENU_ITEMS } from '../../constants';
import { LogOut, Package, User, Bell, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
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
      items: ['quotes', 'invoices', 'customers', 'projects']
    },
    {
      title: 'Stock & Logistique',
      items: ['inventory', 'inventory-audits', 'stock-movements', 'categories', 'suppliers']
    },
    {
      title: 'Entreprise & RH',
      items: ['employees', 'expenses', 'accounting', 'cash-history']
    },
    {
      title: 'Configuration',
      items: ['reports', 'users', 'settings']
    }
  ];

  const canShowItem = (id: string) => {
    switch (id) {
      case 'dashboard': return hasPermission('canViewDashboard');
      case 'pos': return hasPermission('canManageSales');
      case 'sales-history': return hasPermission('canManageSales');
      case 'returns': return hasPermission('canProcessReturns');
      case 'quotes': return hasPermission('canManageSales');
      case 'invoices': return hasPermission('canManageAccounting');
      case 'projects': return hasPermission('canManageSales') || hasPermission('canViewDashboard');
      case 'customers': return hasPermission('canManageCustomers');
      // Stock & Logistic
      case 'inventory': return hasPermission('canViewProducts') || hasPermission('canManageStock');
      case 'inventory-audits': return hasPermission('canPerformInventory');
      case 'stock-movements': return hasPermission('canManageStock');
      case 'categories': return hasPermission('canManageCategories');
      case 'suppliers': return hasPermission('canManageSuppliers');
      // Enterprise / HR
      case 'employees': return hasPermission('canManageUsers');
      case 'expenses': return hasPermission('canManageExpenses');
      case 'accounting': return hasPermission('canManageAccounting');
      case 'cash-history': return hasPermission('canManageAccounting');
      // Config
      case 'reports': return hasPermission('canViewReports');
      case 'users': return hasPermission('canManageUsers');
      case 'settings': return hasPermission('canManageSettings');
      default: return true;
    }
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full w-[260px] bg-white dark:bg-[#111827] text-[#23282d] dark:text-slate-350 z-50 flex flex-col shadow-sm border-r border-slate-200/80 dark:border-slate-800 transition-transform duration-300 ease-in-out lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
    )}>
      {/* Brand Header */}
      <div className="p-6 bg-slate-50/80 dark:bg-[#111827]/80 border-b border-slate-200/80 dark:border-slate-800 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0274be]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between relative z-10 gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <motion.div 
              whileHover={{ rotate: 0, scale: 1.05 }}
              initial={{ rotate: -3 }}
              className="w-10 h-10 bg-[#0274be] rounded-lg flex items-center justify-center shadow-sm transition-transform overflow-hidden shrink-0"
            >
              {settings.logo ? (
                <img src={settings.logo} alt="Logo" className="w-full h-full object-contain p-0.5" referrerPolicy="no-referrer" />
              ) : (
                <Package className="text-white w-5 h-5" />
              )}
            </motion.div>
            <div className="min-w-0">
              <span className="font-extrabold text-[#191e23] dark:text-slate-100 text-lg tracking-tight block leading-tight truncate uppercase">{settings.name}</span>
              <span className="text-[9px] font-black text-[#0274be] uppercase tracking-widest mt-0.5 block truncate">
                {settings.slogan || 'ERP & POS SYSTEM'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => setIsPanelOpen(true)}
              className="p-1.5 relative hover:bg-slate-150 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-slate-200"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-rose-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-[#111827] animate-pulse"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>

            {/* mobile close menu button */}
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 hover:bg-slate-150 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-slate-200"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Profile Area */}
      <div className="p-4 bg-slate-50/50 dark:bg-[#111827]/40 border-b border-slate-150 dark:border-slate-850">
         <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0274be] shrink-0">
               <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-xs font-black truncate text-[#191e23] dark:text-slate-100">{userData?.displayName || user?.displayName || 'Utilisateur'}</p>
               <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    loading ? "bg-amber-500" : "bg-emerald-500"
                  )} />
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest truncate">{userData?.role || 'Employé'}</p>
               </div>
            </div>
         </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto py-6 custom-scrollbar px-3 space-y-8 bg-white dark:bg-[#111827]">
        {sections.map((section, idx) => {
          const visibleItems = section.items
            .map(id => MENU_ITEMS.find(item => item.id === id))
            .filter(item => item && canShowItem(item.id));

          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-2">
              <h3 className="px-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-3 border-b border-slate-100 dark:border-slate-800 pb-1">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {visibleItems.map((item) => item && (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    onClick={() => {
                       if (onClose) onClose();
                    }}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center justify-between px-3.5 py-2.5 rounded-lg transition-all text-xs font-extrabold uppercase tracking-wider",
                        isActive
                          ? "bg-[#0274be] text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-[#0274be] dark:hover:text-[#0274be]"
                      )
                    }
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn("w-4 h-4 shrink-0 transition-transform group-hover:scale-105")} />
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
      <div className="p-4 bg-slate-50 dark:bg-[#111827] border-t border-slate-205 dark:border-slate-800">
        <button
          onClick={handleLogout}
          className="group flex items-center gap-3 w-full px-4 py-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-600 dark:hover:bg-red-600 hover:text-white transition-all rounded-xl text-xs font-black uppercase tracking-widest border border-red-200 dark:border-red-900/40 overflow-hidden relative"
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-red-600 transform -translate-x-full group-hover:translate-x-0 transition-transform" />
          <LogOut size={16} className="relative z-10 transition-transform group-hover:-translate-x-1" />
          <span className="relative z-10">DÉCONNEXION</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
