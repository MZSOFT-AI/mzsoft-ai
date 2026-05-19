import React, { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { motion } from 'motion/react';
import { useSession } from '../../context/SessionContext';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../context/SettingsContext';
import StartSessionModal from '../StartSessionModal';
import NotificationPanel from './NotificationPanel';
import NotificationDetail from './NotificationDetail';

const Layout: React.FC = () => {
  const { activeSession, loading } = useSession();
  const { notifications } = useNotification();
  const { settings } = useSettings();
  const location = useLocation();
  const lastNotificationId = useRef<string | null>(null);

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
    <div className="min-h-screen bg-slate-100 flex font-sans">
      <Sidebar />
      <main className="flex-1 transition-all duration-300 ease-in-out pl-[260px]">
        <div className="p-6 min-h-screen">
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
