import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotification } from '../../context/NotificationContext';
import { 
  X, 
  Bell, 
  CheckCheck, 
  Trash2, 
  Archive, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  ArrowRight,
  ShoppingCart,
  Package,
  FileText,
  User,
  ShieldAlert,
  CreditCard,
  History
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AppNotification } from '../../types';

const NotificationPanel: React.FC = () => {
  const { 
    notifications, 
    unreadCount, 
    isPanelOpen, 
    setIsPanelOpen, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    archiveNotification,
    setSelectedNotification
  } = useNotification();
  
  const navigate = useNavigate();

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'low_stock': return <Package className="text-amber-500" size={18} />;
      case 'sale': return <ShoppingCart className="text-emerald-500" size={18} />;
      case 'invoice': return <FileText className="text-blue-500" size={18} />;
      case 'quote': return <FileText className="text-indigo-500" size={18} />;
      case 'user': return <User className="text-slate-500" size={18} />;
      case 'deletion': return <Trash2 className="text-rose-500" size={18} />;
      case 'payment': return <CreditCard className="text-teal-500" size={18} />;
      case 'security': return <ShieldAlert className="text-rose-600" size={18} />;
      case 'stock_discrepancy': return <AlertTriangle className="text-amber-500" size={18} />;
      case 'cash_discrepancy': return <AlertCircle className="text-rose-500" size={18} />;
      default: return <Info className="text-blue-500" size={18} />;
    }
  };

  const getPriorityColor = (priority: AppNotification['priority']) => {
    switch (priority) {
      case 'critical': return 'bg-rose-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-blue-500';
      default: return 'bg-slate-400';
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    markAsRead(n.id);
    setSelectedNotification(n);
    if (n.metadata?.link) {
      navigate(n.metadata.link);
      setIsPanelOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {isPanelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsPanelOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Bell className="text-slate-800" size={24} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Notifications</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temps réel</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPanelOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            {/* Actions Bar */}
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4">
              <button 
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 disabled:text-slate-300 transition-colors"
              >
                <CheckCheck size={14} />
                Tout marquer comme lu
              </button>
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <History size={12} />
                {notifications.length} Totales
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50">
              {notifications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-50">
                  <Bell size={64} className="text-slate-200 mb-4" />
                  <p className="text-sm font-bold text-slate-400 uppercase">Aucune notification</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <div 
                      key={n.id}
                      className={`
                        relative group p-4 transition-all hover:bg-white cursor-pointer
                        ${n.status === 'unread' || !n.isRead ? 'bg-blue-50/30' : ''}
                      `}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex gap-4">
                        {/* Icon */}
                        <div className={`
                          w-10 h-10 rounded-xl shrink-0 flex items-center justify-center shadow-sm
                          ${n.status === 'unread' || !n.isRead ? 'bg-white' : 'bg-slate-100'}
                        `}>
                          {getIcon(n.type)}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className={`
                              text-xs font-black uppercase tracking-tighter truncate
                              ${n.status === 'unread' || !n.isRead ? 'text-slate-800' : 'text-slate-500'}
                            `}>
                              {n.title}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">
                              {n.createdAt ? formatDistanceToNow(n.createdAt instanceof Date ? n.createdAt : (n.createdAt as any).toDate(), { addSuffix: true, locale: fr }) : ''}
                            </span>
                          </div>
                          <p className={`
                            text-[11px] leading-relaxed mb-2 line-clamp-2
                            ${n.status === 'unread' || !n.isRead ? 'text-slate-600 font-medium' : 'text-slate-400'}
                          `}>
                            {n.message}
                          </p>

                          <div className="flex items-center gap-3">
                            {/* Priority Tag */}
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${getPriorityColor(n.priority)}`} />
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{n.priority}</span>
                            </div>

                            {/* Linked Tag */}
                            {n.metadata?.entityType && (
                              <div className="px-1.5 py-0.5 bg-slate-100 rounded text-[8px] font-black uppercase tracking-widest text-slate-500">
                                {n.metadata.entityType}
                              </div>
                            )}

                            {/* Triggered By */}
                            {n.triggeredByName && (
                              <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                <User size={10} />
                                {n.triggeredByName}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Hover Actions */}
                        <div className="absolute right-4 bottom-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              archiveNotification(n.id);
                            }}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                            title="Archiver"
                          >
                            <Archive size={14} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(n.id);
                            }}
                            className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600"
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button className="p-1.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-600">
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Unread dot */}
                      {(n.status === 'unread' || !n.isRead) && (
                        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-full" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-white flex items-center justify-center">
               <button 
                onClick={() => {
                  setIsPanelOpen(false);
                  navigate('/notifications'); // Future route for all notifications
                }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-800 transition-colors"
               >
                 Historique complet des notifications
               </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationPanel;
