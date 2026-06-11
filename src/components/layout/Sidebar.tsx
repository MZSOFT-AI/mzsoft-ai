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
      "fixed left-0 top-0 h-full w-[260px] bg-white dark:bg-[#080a16] text-[#090c15] dark:text-[#DCE2F9] z-50 flex flex-col shadow-[0_10px_30px_rgba(0,0,0,0.03)] border-r border-slate-150/80 dark:border-[#1E2243] transition-transform duration-300 ease-in-out lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
    )}>
      {/* Brand Header */}
      <div className="p-6 bg-white dark:bg-[#080a16] border-b border-slate-100 dark:border-[#1E2243] relative overflow-hidden group">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 bg-[#0066ff] rounded-xl flex items-center justify-center shadow-lg shadow-[#0066ff]/20 overflow-hidden shrink-0">
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" className="w-full h-full object-contain p-0.5" referrerPolicy="no-referrer" />
            ) : (
              <Package className="text-white w-5 h-5" />
            )}
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 text-[12.5px] uppercase tracking-tight block leading-snug truncate">
              {settings.name || 'SARL MZ TECH'}
            </span>
            <span className="text-[8px] font-black text-[#0066ff] tracking-[0.05em] leading-tight uppercase mt-0.5 whitespace-normal break-words">
              {settings.slogan || 'VOTRE SATISFACTION EST NOTRE PRIORITÉ'}
            </span>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-[#151833]/50 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Profile Area */}
      <div className="px-5 py-4 bg-white dark:bg-[#080a16] border-b border-slate-105 dark:border-[#1E2243]/60">
        <div className="flex items-center gap-3 bg-white dark:bg-[#10132A] p-3 border border-slate-200/90 dark:border-[#1E2243] rounded-2xl shadow-xs">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-[#0066ff]/10 flex items-center justify-center text-[#0066ff] shrink-0">
            <User size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate text-slate-800 dark:text-slate-100 leading-tight">
              {userData?.displayName || user?.displayName || 'Djelloul Mohamed'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shrink-0" />
              <p className="text-[8.5px] text-slate-400 dark:text-[#727C9F] font-black uppercase tracking-wider truncate leading-none">
                {userData?.role || 'SUPERADMIN'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto py-5 custom-scrollbar px-3 space-y-7 bg-white dark:bg-[#080a16]">
        {sections.map((section, idx) => {
          const visibleItems = section.items
            .map(id => MENU_ITEMS.find(item => item.id === id))
            .filter(item => item && canShowItem(item.id));

          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-1.5">
              <h3 className="px-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-[#727C9F]">
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
                        "group flex items-center justify-between px-3.5 py-3 rounded-xl transition-all text-[11px] font-extrabold uppercase tracking-wider",
                        isActive
                          ? "bg-[#0066ff] text-white shadow-md shadow-[#0066ff]/20 font-black"
                          : "text-slate-600 dark:text-[#DCE2F9]/80 hover:bg-slate-50 dark:hover:bg-[#151833]/50 hover:text-[#0066ff] dark:hover:text-[#0066ff]"
                      )
                    }
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn("w-4 h-4 shrink-0 transition-transform group-hover:scale-105")} />
                      <span>{item.label}</span>
                    </div>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 bg-white dark:bg-[#080a16] border-t border-slate-100 dark:border-[#1E2243]">
        <button
          onClick={handleLogout}
          className="group flex items-center justify-center gap-2.5 w-full py-3 bg-[#FFF0F0] dark:bg-[#2A151D] text-[#E11D48] dark:text-[#F43F5E] hover:bg-[#E11D48] hover:text-white dark:hover:bg-[#E11D48] dark:hover:text-white transition-all rounded-2xl text-xs font-black uppercase tracking-widest border border-[#FFE0E0] dark:border-[#4B1B25] shadow-xs cursor-pointer h-12"
        >
          <LogOut size={15} className="transition-transform group-hover:-translate-x-1" />
          <span>DÉCONNEXION</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
