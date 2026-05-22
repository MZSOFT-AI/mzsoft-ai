import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { motion } from 'motion/react';
import { useSession } from '../../context/SessionContext';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../context/SettingsContext';
import StartSessionModal from '../StartSessionModal';
import NotificationPanel from './NotificationPanel';
import NotificationDetail from './NotificationDetail';
import { Menu, Package, Bell } from 'lucide-react';

const Layout: React.FC = () => {
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

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Mobile Top Navbar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white text-slate-800 flex items-center justify-between px-4 z-40 border-b border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-600"
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
            <span className="font-extrabold text-sm uppercase tracking-tight text-slate-800 truncate max-w-[150px]">{settings.name}</span>
          </div>
        </div>

        <button 
          onClick={() => setIsPanelOpen(true)}
          className="p-2 relative hover:bg-slate-100 rounded-xl transition-colors text-slate-600"
          aria-label="View notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border border-white animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
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
