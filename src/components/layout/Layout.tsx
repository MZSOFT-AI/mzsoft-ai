import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { motion } from 'motion/react';
import { useSession } from '../../context/SessionContext';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import StartSessionModal from '../StartSessionModal';
import NotificationPanel from './NotificationPanel';
import NotificationDetail from './NotificationDetail';
import { Menu, Package, Bell, Sun, Moon, User, Calendar, ShieldCheck } from 'lucide-react';

const Layout: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { userData, user, isOnline } = useAuth();
  const { activeSession, loading } = useSession();
  const { notifications, unreadCount, setIsPanelOpen } = useNotification();
  const { settings } = useSettings();
  const location = useLocation();
  const lastNotificationId = useRef<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close mobile sidebar on route changes
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Sound and Desktop Notifications Watcher
  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      
      // Only trigger if it's new and unread
      if (latest.id !== lastNotificationId.current && (latest.status === 'unread' || !latest.isRead)) {
        lastNotificationId.current = latest.id || null;

        // 1. Sound Alert
        if (settings.notificationSound) {
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
          } catch (e) {
            console.warn("Could not play notification sound:", e);
          }
        }

        // 2. Desktop Notification
        if (settings.desktopNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(latest.title, {
            body: latest.message,
            icon: '/favicon.ico'
          });
        }
      }
    }
  }, [notifications, settings.notificationSound, settings.desktopNotifications]);

  // Request notification permission if needed
  useEffect(() => {
    if (settings.desktopNotifications && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [settings.desktopNotifications]);

  // Pages that require an active session
  const sessionPages = ['/pos'];
  const needsSession = sessionPages.includes(location.pathname);

  const getPageTitle = (path: string) => {
    if (path === '/') return 'Tableau de Bord Administratif';
    if (path.startsWith('/pos')) return 'Caisse & Point de Vente (POS)';
    if (path.startsWith('/inventory/audits')) return 'Audits & Inventaires Physiques';
    if (path.startsWith('/inventory')) return 'Gestion du Stock & Produits';
    if (path.startsWith('/stock-movements')) return 'Flux & Mouvements de Stock';
    if (path.startsWith('/categories')) return 'Classification des Articles';
    if (path.startsWith('/sales-history')) return 'Historique Commercial & Finances';
    if (path.startsWith('/customers')) return 'Répertoire Clients';
    if (path.startsWith('/suppliers')) return 'Répertoire Fournisseurs';
    if (path.startsWith('/expenses')) return 'Registre des Dépenses';
    if (path.startsWith('/accounting')) return 'Comptabilité Générale';
    if (path.startsWith('/cash-history')) return 'Clôture de Caisse';
    if (path.startsWith('/reports')) return 'Rapports & Statistiques Extrêmes';
    if (path.startsWith('/quotes')) return 'Gestion des Devis Pro';
    if (path.startsWith('/invoices')) return 'Gestion de Facturation / Factures';
    if (path.startsWith('/projects')) return 'Suivi et Gestion des Chantiers';
    if (path.startsWith('/employees')) return 'Portail Ressources Humaines & Employés';
    if (path.startsWith('/users')) return 'Contrôle d\'Accès & Utilisateurs';
    if (path.startsWith('/settings')) return 'Paramètres d\'Entreprise & Système';
    return 'Système Astra ERP';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] flex font-sans transition-colors duration-200">
      {/* Mobile Top Navbar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-100 flex items-center justify-between px-4 z-40 border-b border-slate-200 dark:border-slate-800/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-600 dark:text-slate-300"
            aria-label="Open sidebar"
          >
            <Menu size={24} />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#0274be] rounded-lg flex items-center justify-center overflow-hidden shrink-0">
              {settings.logo ? (
                <img src={settings.logo} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              ) : (
                <Package className="text-white w-4 h-4" />
              )}
            </div>
            <span className="font-extrabold text-sm uppercase tracking-tight text-slate-800 dark:text-slate-100 truncate max-w-[150px]">{settings.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-600 dark:text-slate-300"
            aria-label="Changer de thème"
          >
            {theme === 'dark' ? <Sun size={20} className="text-yellow-500" /> : <Moon size={20} />}
          </button>

          <button 
            onClick={() => setIsPanelOpen(true)}
            className="p-2 relative hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-600 dark:text-slate-300"
            aria-label="View notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border border-white animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Sidebar overlay backdrop for mobile screen */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-all duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Styled Responsive Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {/* Adjust container left padding on wide screens: pl-[260px], on mobile: pt-16 and normal padding */}
      <main className="flex-1 transition-all duration-300 ease-in-out pl-0 lg:pl-[260px] pt-16 lg:pt-0">
        {!isOnline && (
          <div className="bg-amber-600 dark:bg-amber-700 text-white py-2 px-6 text-xs font-black uppercase tracking-wider text-center flex items-center justify-center gap-2 border-b border-amber-500/30 shadow-sm z-50">
            <span className="w-2.5 h-2.5 bg-white rounded-full animate-ping shrink-0" />
            <span>Mode Hors-Ligne Actif — Vos actions sont en mémoire et seront synchronisées automatiquement avec Firebase dès le retour d'Internet</span>
          </div>
        )}
        
        {/* Desktop Sticky Header */}
        <header className="hidden lg:flex sticky top-0 z-35 bg-white/80 dark:bg-[#111827]/85 backdrop-blur-md h-16 border-b border-slate-200 dark:border-slate-800/80 items-center justify-between px-8 shadow-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[#0274be] w-5 h-5 shrink-0" />
            <h1 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              {getPageTitle(location.pathname)}
            </h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Calendar size={13} className="text-[#0274be]" />
              <span>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all hover:scale-105"
              title={theme === 'dark' ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {theme === 'dark' ? <Sun size={18} className="text-yellow-500" /> : <Moon size={18} />}
            </button>

            {/* Notification Bell */}
            <button 
              onClick={() => setIsPanelOpen(true)}
              className="p-2 relative bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all hover:scale-105"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border border-white animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Quick Profile Summary */}
            <div className="flex items-center gap-2.5 pl-4 border-l border-slate-200 dark:border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0274be]">
                <User size={15} />
              </div>
              <div className="text-left">
                <span className="block text-xs font-black text-slate-800 dark:text-slate-100 leading-tight">
                  {userData?.displayName || user?.displayName || 'Admin'}
                </span>
                <span className="block text-[8px] font-bold uppercase tracking-widest text-slate-400 leading-none mt-0.5">
                  {userData?.role || 'Admin'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 min-h-screen">
           <Outlet />
        </div>
      </main>
      <NotificationPanel />
      <NotificationDetail />
      <StartSessionModal isOpen={!loading && !activeSession && needsSession} />
    </div>
  );
};

export default Layout;
