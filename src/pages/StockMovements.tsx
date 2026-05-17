import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit, doc, runTransaction, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { 
  History, 
  Search, 
  Package,
  ArrowUp,
  ArrowDown,
  Activity,
  RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn, cleanObject } from '../lib/utils';
import PromptModal from '../components/ui/PromptModal';
import ConfirmationModal from '../components/ui/ConfirmationModal';

const STOCK_TYPES: Record<string, { label: string, color: string, text: string }> = {
  initial: { label: 'Stock Initial', color: 'bg-blue-50', text: 'text-blue-600' },
  sale: { label: 'Vente', color: 'bg-rose-50', text: 'text-rose-600' },
  return: { label: 'Retour Client', color: 'bg-emerald-50', text: 'text-emerald-600' },
  adjustment_in: { label: 'Ajustement (+)', color: 'bg-amber-50', text: 'text-amber-600' },
  adjustment_out: { label: 'Ajustement (-)', color: 'bg-amber-50', text: 'text-amber-600' },
  in: { label: 'Entrée Stock', color: 'bg-emerald-50', text: 'text-emerald-600' },
  out: { label: 'Sortie Stock', color: 'bg-rose-50', text: 'text-rose-600' },
};

export default function StockMovements() {
  const { user } = useAuth();
  const { showToast } = useNotification();
  const [movements, setMovements] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [returnModal, setReturnModal] = useState<any | null>(null);
  const [confirmReturnModal, setConfirmReturnModal] = useState<{ movement: any, quantity: number } | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'), limit(100)),
      (snapshot) => {
        setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'stock_movements')
    );
  }, []);

  const handleReturnEntry = (movement: any) => {
    if (movement.type !== 'in') return;
    setReturnModal(movement);
  };

  const handlePromptConfirm = (qtyStr: string) => {
    if (!returnModal) return;
    const quantity = parseFloat(qtyStr);
    if (isNaN(quantity) || quantity <= 0 || quantity > returnModal.quantity) {
      showToast("Quantité invalide", "error");
      return;
    }
    setConfirmReturnModal({ movement: returnModal, quantity });
    setReturnModal(null);
  };

  const confirmReturnToSupplier = async () => {
    if (!confirmReturnModal) return;
    const { movement, quantity } = confirmReturnModal;

    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', movement.productId);
        const productDoc = await transaction.get(productRef);
        
        if (!productDoc.exists()) throw new Error("Produit introuvable");
        
        const currentProductStock = productDoc.data().stockQuantity;
        if (currentProductStock < quantity) {
          throw new Error("Stock insuffisant pour effectuer ce retour");
        }

        // 1. Décrémenter le stock
        transaction.update(productRef, {
          stockQuantity: increment(-quantity),
          updatedAt: serverTimestamp()
        });

        // 2. Créer le mouvement de sortie (retour fournisseur)
        const movementRef = doc(collection(db, 'stock_movements'));
        transaction.set(movementRef, cleanObject({
          productId: movement.productId,
          productName: movement.productName,
          type: 'out',
          quantity: quantity,
          unit: movement.unit || 'u',
          previousStock: currentProductStock,
          newStock: currentProductStock - quantity,
          reason: `Retour Fournisseur - (Réf Entrée: ${movement.id})`,
          referenceId: movement.id,
          userId: user?.uid,
          userName: user?.displayName || 'Admin',
          createdAt: serverTimestamp()
        }));

        // 3. Marquer le mouvement original comme (partiellement) retourné
        const originalMovementRef = doc(db, 'stock_movements', movement.id);
        transaction.update(originalMovementRef, {
          returnedQuantity: increment(quantity)
        });
      });

      showToast("Retour fournisseur enregistré avec succès", "success");
      setConfirmReturnModal(null);
    } catch (error: any) {
      showToast(error.message || "Erreur lors du retour", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredMovements = movements.filter(m => {
    const searchLow = searchQuery.toLowerCase();
    const matchesSearch = 
      m.productName?.toLowerCase().includes(searchLow) || 
      m.billNumber?.toLowerCase().includes(searchLow);
    const matchesType = typeFilter === 'all' || m.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Flux des Stocks</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Audit logistique & traçabilité</p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <Button variant="outline" size="sm" className="h-9 text-xs font-bold uppercase" onClick={() => window.location.reload()}>
             <History size={16} className="mr-2 text-slate-400" /> Historique
           </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Chercher une référence article..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 text-sm outline-none focus:ring-1 focus:ring-blue-500 font-bold bg-white"
          >
            <option value="all">TOUS LES FLUX</option>
            {Object.entries(STOCK_TYPES).map(([key, value]) => (
              <option key={key} value={key}>{value.label.toUpperCase()}</option>
            ))}
          </select>
      </div>

      {/* ERP Table */}
      <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
        <table className="mzsoft-table">
          <thead>
            <tr>
              <th>Date & Heure</th>
              <th>Désignation Article</th>
              <th className="text-center">Nature du Flux</th>
              <th className="text-center w-24">Initial</th>
              <th className="text-center w-24">Mouvement</th>
              <th className="text-center w-24">Final</th>
              <th>Opérateur</th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.map((m) => {
              const typeInfo = STOCK_TYPES[m.type] || { label: m.type, color: 'bg-slate-50', text: 'text-slate-500' };
              const isPositive = m.newStock > m.previousStock;

              return (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500 group">
                  <td className="text-xs font-bold text-slate-400 italic">
                    {m.createdAt ? format((m.createdAt as any)?.toDate ? (m.createdAt as any).toDate() : (m.createdAt instanceof Date ? m.createdAt : new Date()), 'dd/MM HH:mm') : '-'}
                  </td>
                  <td className="font-bold text-slate-800 text-xs">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                         {m.productName}
                         {(m.returnedQuantity || 0) > 0 && (
                           <span className="text-[8px] bg-rose-100 text-rose-600 px-1 rounded uppercase font-black">Retourné</span>
                         )}
                      </div>
                      {m.billNumber && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[8px] font-black uppercase text-slate-400">Bon:</span>
                          <span className="text-[9px] font-mono text-blue-600 font-black">{m.billNumber}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="text-center">
                    <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 border", typeInfo.color, typeInfo.text, "border-current opacity-70")}>
                      {typeInfo.label}
                    </span>
                  </td>
                  <td className="text-center font-bold text-slate-400 text-xs">
                    {Number(m.previousStock || 0).toFixed(2).replace(/\.00$/, '')} <span className="text-[9px] font-normal">u</span>
                  </td>
                  <td className="text-center">
                    <div className={cn(
                      "inline-flex items-center gap-1 font-black px-2 py-0.5 rounded text-[11px]",
                      isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {isPositive ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      {Number(Math.abs(m.quantity || 0)).toFixed(2).replace(/\.00$/, '')} <span className="text-[9px] font-normal opacity-70 ml-0.5">{m.unit || 'u'}</span>
                    </div>
                  </td>
                  <td className="text-center font-black text-slate-900 text-xs">
                    {Number(m.newStock || 0).toFixed(2).replace(/\.00$/, '')} <span className="text-[9px] font-normal">u</span>
                  </td>
                  <td className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-400 truncate max-w-[80px]">
                      {m.userName || 'Admin'}
                    </span>
                    {m.type === 'in' && (m.returnedQuantity || 0) < m.quantity && (
                      <button 
                        onClick={() => handleReturnEntry(m)}
                        disabled={isProcessing}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 transition-all"
                        title="Retourner au fournisseur"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredMovements.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-20 text-slate-400 italic text-sm">Aucun mouvement logistique enregistré</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PromptModal
        isOpen={!!returnModal}
        onClose={() => setReturnModal(null)}
        onConfirm={handlePromptConfirm}
        title="Retour au fournisseur"
        message={`Quantité à retourner pour "${returnModal?.productName}" ? (Max: ${returnModal?.quantity})`}
        defaultValue={returnModal?.quantity?.toString()}
        inputType="number"
        isLoading={isProcessing}
      />

      <ConfirmationModal
        isOpen={!!confirmReturnModal}
        onClose={() => setConfirmReturnModal(null)}
        onConfirm={confirmReturnToSupplier}
        title="Confirmer le retour"
        message={`Confirmer le retour de ${confirmReturnModal?.quantity} ${confirmReturnModal?.movement?.unit || 'u'} de "${confirmReturnModal?.movement?.productName}" au fournisseur ?`}
        confirmText="Confirmer le retour"
        variant="warning"
        isLoading={isProcessing}
      />
    </div>
  );
}
