import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { orderBy, serverTimestamp, addDoc, collection, getDocs, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  Plus, 
  Calendar, 
  User, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ChevronRight,
  History,
  ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn, formatCurrency } from '../lib/utils';
import { useNotification } from '../context/NotificationContext';

const InventoryAudits: React.FC = () => {
  const { user, isAdmin, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const { data: audits, loading } = useCollection<any>('inventory_audits', [orderBy('createdAt', 'desc')]);

  const canPerform = hasPermission('canPerformInventory');

  const [isStarting, setIsStarting] = useState(false);

  if (!canPerform) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white p-12 text-center border border-slate-200">
           <AlertTriangle size={48} className="text-rose-500 mx-auto mb-4" />
           <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Accès Refusé</h2>
           <p className="text-sm text-slate-500 mt-2">Vous n'avez pas l'autorisation d'effectuer des inventaires physiques.</p>
           <Button onClick={() => navigate('/inventory')} className="mt-6 bg-slate-800">Retour à l'Inventaire</Button>
        </div>
      </div>
    );
  }

  const handleStartAudit = async (type: 'weekly' | 'monthly' | 'annual' | 'spot') => {
    if (!user) return;
    setIsStarting(true);
    try {
      // Get all products to snapshot their current stock
      const productsSnap = await getDocs(query(collection(db, 'products'), orderBy('name')));
      const items = productsSnap.docs.map(doc => {
        const p = doc.data();
        return {
          productId: doc.id,
          productName: p.name,
          theoreticalStock: p.stockQuantity || 0,
          actualStock: p.stockQuantity || 0,
          unit: p.unit || 'u',
          purchasePrice: p.purchasePrice || 0,
          isCounted: false
        };
      });

      const docRef = await addDoc(collection(db, 'inventory_audits'), {
        userId: user.uid,
        userName: user.displayName || 'Utilisateur',
        type,
        status: 'draft',
        createdAt: serverTimestamp(),
        items: items,
        totalDiscrepancyValue: 0
      });
      navigate(`/inventory/audits/${docRef.id}`);
    } catch (error) {
      console.error("Error starting audit:", error);
      showToast("Erreur lors de l'initialisation de l'inventaire", "error");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-slate-200">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/inventory')}
            className="h-10 w-10 p-0 rounded-full hover:bg-slate-100"
          >
            <ArrowLeft className="text-slate-400" size={20} />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-indigo-600 flex items-center justify-center text-white font-black text-xs">INV</div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-slate-800">Inventaires Physiques</h1>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Réconciliation et Audit de Stock</p>
          </div>
        </div>
      </div>

      {/* New Audit Options */}
      {canPerform && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-indigo-100 bg-indigo-50/30 hover:bg-indigo-50 transition-colors cursor-pointer group" onClick={() => handleStartAudit('weekly')}>
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <History size={24} />
              </div>
              <h3 className="font-black uppercase tracking-tight text-indigo-900 mb-1">Inventaire Hebdomadaire</h3>
              <p className="text-[10px] text-indigo-600/70 font-bold uppercase tracking-widest italic">Contrôle rapide du stock</p>
            </CardContent>
          </Card>

          <Card className="border-blue-100 bg-blue-50/30 hover:bg-blue-50 transition-colors cursor-pointer group" onClick={() => handleStartAudit('monthly')}>
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <Calendar size={24} />
              </div>
              <h3 className="font-black uppercase tracking-tight text-blue-900 mb-1">Inventaire Mensuel</h3>
              <p className="text-[10px] text-blue-600/70 font-bold uppercase tracking-widest italic">Réconciliation fin de mois</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 hover:bg-black transition-colors cursor-pointer group" onClick={() => handleStartAudit('annual')}>
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <ClipboardList size={24} />
              </div>
              <h3 className="font-black uppercase tracking-tight text-white mb-1">Inventaire Annuel</h3>
              <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest italic text-center">Bilan de fin d'exercice</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Spot Audit */}
      {canPerform && (
        <div className="flex justify-center">
           <Button 
             variant="ghost" 
             onClick={() => handleStartAudit('spot')}
             className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600"
           >
             + Démarrer un inventaire ponctuel
           </Button>
        </div>
      )}

      {/* Audit History */}
      <div className="bg-white border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <History size={14} /> Historique des Audits
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="dolisoft-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Statut</th>
                <th>Responsable</th>
                <th>Date de début</th>
                <th className="text-right">Écart Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => navigate(`/inventory/audits/${audit.id}`)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        audit.type === 'annual' ? "bg-slate-900 text-white" : 
                        audit.type === 'monthly' ? "bg-blue-100 text-blue-600" : "bg-indigo-100 text-indigo-600"
                      )}>
                        {audit.type === 'annual' ? <ClipboardList size={16} /> : 
                         audit.type === 'monthly' ? <Calendar size={16} /> : <History size={16} />}
                      </div>
                      <span className="font-black uppercase text-xs tracking-tight">
                        {audit.type === 'annual' ? 'Annuel' : 
                         audit.type === 'monthly' ? 'Mensuel' : 
                         audit.type === 'weekly' ? 'Hebdomadaire' : 'Ponctuel'}
                      </span>
                    </div>
                  </td>
                  <td>
                    {audit.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase border border-emerald-100">
                        <CheckCircle2 size={10} /> Terminé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-black uppercase border border-amber-100">
                        <Clock size={10} /> Brouillon
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                       <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px] font-bold">
                         {audit.userName?.charAt(0)}
                       </div>
                       <span className="text-[11px] font-bold text-slate-600">{audit.userName}</span>
                    </div>
                  </td>
                  <td>
                    <span className="text-[11px] font-medium text-slate-500">
                      {audit.createdAt ? format(audit.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: fr }) : '-'}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className={cn(
                      "font-mono text-xs font-black",
                      audit.totalDiscrepancyValue > 0 ? "text-emerald-600" : 
                      audit.totalDiscrepancyValue < 0 ? "text-rose-600" : "text-slate-400"
                    )}>
                      {audit.totalDiscrepancyValue !== undefined ? formatCurrency(audit.totalDiscrepancyValue) : '-'}
                    </span>
                  </td>
                  <td className="text-slate-300">
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </td>
                </tr>
              ))}
              {audits.length === 0 && !loading && (
                <tr>
                   <td colSpan={6} className="text-center py-12 text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">
                     Aucun inventaire enregistré
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryAudits;
