import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, Bell } from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AppNotification } from '../types';
import { useAuth } from './AuthContext';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface NotificationContextType {
  showToast: (message: string, type?: ToastType) => void;
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
  isPanelOpen: boolean;
  setIsPanelOpen: (open: boolean) => void;
  selectedNotification: AppNotification | null;
  setSelectedNotification: (n: AppNotification | null) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const { user, userData, isAdmin, isSuperAdmin } = useAuth();

  // Toast logic
  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
    
    // Play sound if requested/native notification logic could go here
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
       new Notification("MZ SOFT POS", { body: message });
    }
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Persistent notifications listener
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Admins see all notifications, others see their own or none
    let q;
    if (isAdmin || isSuperAdmin) {
      q = query(
        collection(db, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    } else {
      q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
      setNotifications(docs);
      setUnreadCount(docs.filter(n => n.status === 'unread' || !n.isRead).length);
    });

    return () => unsubscribe();
  }, [user, isAdmin, isSuperAdmin]);

  const markAsRead = async (id: string) => {
    try {
      const docRef = doc(db, 'notifications', id);
      await updateDoc(docRef, { 
        isRead: true, 
        status: 'read',
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      console.error('Error marking read:', error);
    }
  };

  const archiveNotification = async (id: string) => {
    try {
      const docRef = doc(db, 'notifications', id);
      await updateDoc(docRef, { 
        status: 'archived',
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      console.error('Error archiving:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => n.status === 'unread' || !n.isRead);
      const promises = unread.map(n => markAsRead(n.id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error marking all read:', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  return (
    <NotificationContext.Provider value={{ 
      showToast, 
      notifications, 
      unreadCount, 
      markAsRead, 
      markAllAsRead, 
      deleteNotification,
      archiveNotification,
      isPanelOpen,
      setIsPanelOpen,
      selectedNotification,
      setSelectedNotification
    }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md w-full sm:w-auto">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`
                flex items-center gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-md
                ${toast.type === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : ''}
                ${toast.type === 'error' ? 'bg-rose-500/90 border-rose-400 text-white' : ''}
                ${toast.type === 'info' ? 'bg-slate-800/90 border-slate-700 text-white' : ''}
                ${toast.type === 'warning' ? 'bg-amber-500/90 border-amber-400 text-white' : ''}
              `}
            >
              <div className="shrink-0">
                {toast.type === 'success' && <CheckCircle2 size={24} />}
                {toast.type === 'error' && <AlertCircle size={24} />}
                {toast.type === 'info' && <Info size={24} />}
                {toast.type === 'warning' && <AlertTriangle size={24} />}
              </div>
              <p className="flex-1 text-sm font-bold leading-tight">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
          ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
