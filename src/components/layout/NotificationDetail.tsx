import React from 'react';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import { 
  Bell, 
  Calendar, 
  User, 
  ArrowRight, 
  ExternalLink, 
  ShieldAlert, 
  Info,
  Clock,
  Tag,
  Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';

const NotificationDetail: React.FC = () => {
  const { selectedNotification, setSelectedNotification, setIsPanelOpen } = useNotification();
  const navigate = useNavigate();

  if (!selectedNotification) return null;

  const handleAction = () => {
    if (selectedNotification.metadata?.link) {
      navigate(selectedNotification.metadata.link);
      setSelectedNotification(null);
      setIsPanelOpen(false);
    }
  };

  const formattedDate = selectedNotification.createdAt 
    ? format(selectedNotification.createdAt instanceof Date ? selectedNotification.createdAt : (selectedNotification.createdAt as any).toDate(), 'PPpp', { locale: fr })
    : '';

  return (
    <Modal
      isOpen={!!selectedNotification}
      onClose={() => setSelectedNotification(null)}
      title="Détail de la notification"
    >
      <div className="space-y-6">
        {/* Type & Priority Header */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 text-blue-500">
                <Bell size={24} />
             </div>
             <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tighter">{selectedNotification.title}</p>
                <div className="flex items-center gap-2 mt-1">
                   <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[9px] font-black uppercase tracking-widest">
                     {selectedNotification.type}
                   </span>
                   <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                     selectedNotification.priority === 'critical' ? 'bg-rose-100 text-rose-600' :
                     selectedNotification.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                     'bg-slate-100 text-slate-600'
                   }`}>
                     Priorité {selectedNotification.priority}
                   </span>
                </div>
             </div>
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Message</label>
          <p className="text-slate-600 leading-relaxed font-medium bg-slate-50/50 p-4 rounded-xl border border-dashed border-slate-200">
            {selectedNotification.message}
          </p>
        </div>

        {/* Meta Info Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1.5"><Clock size={12} /> Reçu le</label>
              <p className="text-xs font-bold text-slate-700">{formattedDate}</p>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1.5"><User size={12} /> Déclenché par</label>
              <p className="text-xs font-bold text-slate-700">{selectedNotification.triggeredByName || 'Système'}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1.5"><Tag size={12} /> Type d'entité</label>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">{selectedNotification.metadata?.entityType || 'Général'}</p>
            </div>
            {selectedNotification.metadata?.entityId && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1.5"><Hash size={12} /> ID Entité</label>
                <p className="text-[10px] font-mono text-slate-500 truncate">{selectedNotification.metadata.entityId}</p>
              </div>
            )}
          </div>
        </div>

        {/* Linked Item Preview Helper */}
        {selectedNotification.metadata?.link && (
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between group">
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-blue-500 shadow-sm">
                   <ExternalLink size={16} />
                </div>
                <div>
                   <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Document lié</p>
                   <p className="text-xs font-black text-blue-600 uppercase tracking-tight">Consulter {selectedNotification.metadata.entityType || 'l\'élément'}</p>
                </div>
             </div>
             <ArrowRight className="text-blue-400 group-hover:translate-x-1 transition-transform" size={18} />
          </div>
        )}

        {/* Security Alert specific */}
        {selectedNotification.type === 'security' && (
           <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
              <ShieldAlert className="text-rose-500 shrink-0" size={20} />
              <div>
                <p className="text-xs font-black text-rose-600 uppercase tracking-tight mb-1">Alerte de Sécurité</p>
                <p className="text-[10px] font-medium text-rose-500/80">Cette action nécessite une vérification immédiate. Les logs système ont enregistré cette tentative.</p>
              </div>
           </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-4 pt-4 border-t border-slate-100">
          <Button 
            variant="outline" 
            className="flex-1" 
            onClick={() => setSelectedNotification(null)}
          >
            Fermer
          </Button>
          {selectedNotification.metadata?.link && (
            <Button 
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" 
              onClick={handleAction}
            >
              Voir l'élément lié
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default NotificationDetail;
