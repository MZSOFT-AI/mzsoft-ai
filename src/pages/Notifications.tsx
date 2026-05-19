import React, { useState } from 'react';
import { useNotification } from '../context/NotificationContext';
import { AppNotification } from '../types';
import { 
  Bell, 
  Search, 
  Filter, 
  Trash2, 
  CheckCheck, 
  Archive,
  ArrowRight,
  Clock,
  User,
  AlertCircle,
  Package,
  ShoppingCart,
  FileText,
  CreditCard,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

const Notifications: React.FC = () => {
  const { 
    notifications, 
    markAsRead, 
    archiveNotification, 
    deleteNotification, 
    markAllAsRead,
    setSelectedNotification 
  } = useNotification();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<AppNotification['type'] | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<AppNotification['priority'] | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AppNotification['status'] | 'all'>('all');
  const navigate = useNavigate();

  const filteredNotifications = notifications.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         n.message.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || n.type === typeFilter;
    const matchesPriority = priorityFilter === 'all' || n.priority === priorityFilter;
    const matchesStatus = statusFilter === 'all' || n.status === statusFilter;
    
    return matchesSearch && matchesType && matchesPriority && matchesStatus;
  });

  const getTypeIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'low_stock': return <Package className="text-amber-500" size={18} />;
      case 'sale': return <ShoppingCart className="text-emerald-500" size={18} />;
      case 'invoice': return <FileText className="text-blue-500" size={18} />;
      case 'payment': return <CreditCard className="text-indigo-500" size={18} />;
      case 'user': return <User className="text-slate-500" size={18} />;
      case 'security': return <AlertCircle className="text-rose-500" size={18} />;
      case 'deletion': return <Trash2 className="text-slate-400" size={18} />;
      default: return <Bell className="text-slate-400" size={18} />;
    }
  };

  const getPriorityColor = (priority: AppNotification['priority']) => {
    switch (priority) {
      case 'critical': return 'bg-rose-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-blue-500';
      case 'low': return 'bg-slate-400';
      default: return 'bg-slate-300';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto min-h-screen pb-20">
      {/* New Red Emergency Header for Critical Alerts */}
      <div className="mb-8 overflow-hidden rounded-xl border-l-[6px] border-rose-600 bg-rose-50/50">
        <div className="flex flex-col md:flex-row justify-between items-center px-6 py-4 gap-4">
          <div className="flex items-center gap-3">
             <AlertCircle className="text-rose-600" size={24} />
             <h2 className="text-lg font-black text-rose-900 uppercase tracking-tight">
               Alertes Critiques ({notifications.filter(n => n.priority === 'critical' || n.priority === 'high').length})
             </h2>
          </div>
          <button 
            onClick={markAllAsRead} 
            className="text-[11px] font-black uppercase text-rose-600 hover:text-rose-800 underline underline-offset-4 tracking-widest transition-colors"
          >
            Tout marquer comme lu
          </button>
        </div>

        {/* Dynamic Grid for Critical/Important Alerts */}
        <div className="p-6 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNotifications
            .filter(n => n.priority === 'critical' || n.priority === 'high' || n.status === 'unread')
            .slice(0, 9)
            .map((notification) => (
            <div 
              key={notification.id}
              className="bg-white border border-slate-100 rounded-lg p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[160px] group"
            >
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                    notification.priority === 'critical' ? "bg-rose-100 text-rose-700" :
                    notification.priority === 'high' ? "bg-orange-100 text-orange-700" :
                    "bg-blue-100 text-blue-700"
                  )}>
                    {notification.priority === 'critical' ? 'CRITIQUE' : 
                     notification.priority === 'high' ? 'MOYEN' : 'FAIBLE'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    {format(new Date((notification.createdAt as any)?.toDate() || new Date()), 'dd/MM HH:mm', { locale: fr })}
                  </span>
                </div>
                
                <h3 className="text-sm font-black text-slate-900 mb-1 leading-tight">{notification.title}</h3>
                <p className="text-[11px] text-slate-500 line-clamp-3 leading-relaxed">
                  {notification.message}
                </p>
                
                {/* Specific rupture alert styling */}
                {notification.type === 'low_stock' && (
                  <div className="mt-2 py-1 px-2 bg-rose-50 border border-rose-100 rounded text-[10px] font-bold text-rose-600 flex items-center gap-1.5">
                    <AlertCircle size={12} /> ALERTE DE RUPTURE CRITIQUE
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button 
                  onClick={() => markAsRead(notification.id!)}
                  className="text-[11px] font-black uppercase text-blue-600 hover:text-blue-800 tracking-tighter"
                >
                  ACQUITTER
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historical / Standard Notifications Section */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-2">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">Historique des activités</h3>
        <div className="flex gap-4">
           {notifications.filter(n => n.status === 'unread').length > 0 && (
             <button 
               onClick={markAllAsRead}
               className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
             >
               <CheckCheck size={14} /> Tout marquer comme lu
             </button>
           )}
        </div>
      </div>

      {/* Filters Bar (keeping it but making it sleeker) */}
      <div className="bg-white border border-slate-200 p-4 mb-6 rounded-xl shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Rechercher une notification..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <X size={14} />
            </button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          <select 
            className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold outline-none hover:bg-white transition-all"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
          >
            <option value="all">Tous types</option>
            <option value="low_stock">Stock</option>
            <option value="sale">Ventes</option>
            <option value="invoice">Factures</option>
            <option value="security">Sécurité</option>
            <option value="user">Utilisateurs</option>
          </select>

          <select 
            className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold outline-none hover:bg-white transition-all"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
          >
            <option value="all">Toutes priorités</option>
            <option value="critical">Critique</option>
            <option value="high">Haute</option>
            <option value="medium">Moyenne</option>
            <option value="low">Basse</option>
          </select>

          <select 
            className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold outline-none hover:bg-white transition-all"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">Tous statuts</option>
            <option value="unread">Non lues</option>
            <option value="read">Lues</option>
            <option value="archived">Archivées</option>
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <div 
              className="py-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl"
            >
              <Bell size={48} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 font-bold">Aucune notification trouvée.</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "group relative bg-white border border-slate-200 rounded-xl p-4 transition-all hover:shadow-lg hover:border-blue-300",
                  notification.status === 'unread' && "border-l-4 border-l-blue-600"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 group-hover:bg-white group-hover:shadow-sm transition-all text-slate-500 group-hover:text-blue-600">
                    {getTypeIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-0.5">
                      <div className="flex items-center gap-2">
                        <h3 className={cn(
                          "text-sm font-black truncate",
                          notification.status === 'unread' ? "text-slate-900" : "text-slate-600"
                        )}>
                          {notification.title}
                        </h3>
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          getPriorityColor(notification.priority)
                        )} title={`Priorité: ${notification.priority}`} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap flex items-center gap-1">
                        <Clock size={10} />
                        {format(new Date((notification.createdAt as any)?.toDate() || new Date()), 'dd MMM HH:mm', { locale: fr })}
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                      {notification.message}
                    </p>

                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-4">
                         <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                           <User size={10} />
                           {notification.triggeredByName || 'System'}
                         </span>
                         {notification.status === 'read' && (
                           <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Lu</span>
                         )}
                         {notification.status === 'archived' && (
                           <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest flex items-center gap-1">
                             <Archive size={10} /> Archivé
                           </span>
                         )}
                       </div>

                       <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {notification.status === 'unread' && (
                            <button 
                              onClick={() => markAsRead(notification.id!)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Marquer comme lu"
                            >
                              <CheckCheck size={16} />
                            </button>
                          )}
                          {notification.status !== 'archived' && (
                            <button 
                              onClick={() => archiveNotification(notification.id!)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Archiver"
                            >
                              <Archive size={16} />
                            </button>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id!); }}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button 
                            onClick={() => setSelectedNotification(notification)}
                            className="ml-2 px-3 py-1 bg-slate-900 text-white text-[10px] font-black uppercase rounded-lg hover:bg-blue-600 transition-all flex items-center gap-1"
                          >
                            Détails <ArrowRight size={10} />
                          </button>
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
      </div>
    </div>
  );
};

export default Notifications;
