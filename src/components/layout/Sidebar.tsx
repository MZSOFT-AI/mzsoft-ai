import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MENU_ITEMS } from '../../constants';
import { LogOut, Package, User } from 'lucide-react';
import { cn } from '../../lib/utils';

const Sidebar: React.FC = () => {
  const { logout, user, userData } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isAdmin = userData?.role === 'admin' || user?.email === 'djelloulmohamed1990@gmail.com';

  const filteredMenuItems = MENU_ITEMS.filter(item => {
    if (isAdmin) return true;
    return ['pos', 'sales-history', 'customers', 'dashboard'].includes(item.id);
  });

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-slate-800 text-white z-50 flex flex-col shadow-xl">
      {/* Brand Header */}
      <div className="p-6 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center shadow-lg transform -rotate-3 group-hover:rotate-0 transition-transform">
            <Package className="text-white w-6 h-6" />
          </div>
          <div>
            <span className="font-black text-2xl tracking-tighter block leading-none">MZ SOFT</span>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">ERP & POS SYSTEM</span>
          </div>
        </div>
      </div>

      {/* Profile Area */}
      <div className="p-4 bg-slate-800/50 border-b border-slate-700/50">
         <div className="flex items-center gap-3 bg-slate-900/50 p-2 border border-slate-700/30">
            <div className="w-8 h-8 rounded bg-slate-700 flex items-center justify-center text-slate-400">
               <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-xs font-bold truncate text-slate-200">{user?.displayName || 'Vendeur'}</p>
               <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">{userData?.role || 'Employé'}</p>
            </div>
         </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-0.5">
        {filteredMenuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-6 py-3 transition-colors text-xs font-black uppercase tracking-wider border-l-4",
                isActive
                  ? "bg-slate-700/50 text-blue-400 border-blue-500"
                  : "text-slate-400 hover:bg-slate-700/30 hover:text-white border-transparent"
              )
            }
          >
            <item.icon className={cn("w-4 h-4 shrink-0")} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 bg-slate-900/50">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white transition-all text-xs font-black uppercase tracking-widest border border-red-500/20"
        >
          <LogOut size={16} />
          <span>Quitter le logiciel</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
