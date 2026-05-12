import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Button } from '../components/ui/Button';
import { 
  History, 
  Search, 
  Package,
  ArrowUp,
  ArrowDown,
  Activity
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '../lib/utils';

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
  const [movements, setMovements] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'), limit(100)),
      (snapshot) => {
        setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'stock_movements')
    );
  }, []);

  const filteredMovements = movements.filter(m => {
    const matchesSearch = m.productName?.toLowerCase().includes(searchQuery.toLowerCase());
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
        <table className="dolisoft-table">
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
                <tr key={m.id} className="hover:bg-slate-50 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500">
                  <td className="text-xs font-bold text-slate-400 italic">
                    {m.createdAt ? format(m.createdAt.toDate(), 'dd/MM HH:mm') : '-'}
                  </td>
                  <td className="font-bold text-slate-800 text-xs">
                    {m.productName}
                  </td>
                  <td className="text-center">
                    <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 border", typeInfo.color, typeInfo.text, "border-current opacity-70")}>
                      {typeInfo.label}
                    </span>
                  </td>
                  <td className="text-center font-bold text-slate-400 text-xs">
                    {m.previousStock}
                  </td>
                  <td className="text-center">
                    <div className={cn(
                      "inline-flex items-center gap-1 font-black px-2 py-0.5 rounded text-[11px]",
                      isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {isPositive ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      {Math.abs(m.quantity)}
                    </div>
                  </td>
                  <td className="text-center font-black text-slate-900 text-xs">
                    {m.newStock}
                  </td>
                  <td className="text-[10px] font-black uppercase text-slate-400 truncate max-w-[120px]">
                    {m.userName || 'Admin'}
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
    </div>
  );
}
