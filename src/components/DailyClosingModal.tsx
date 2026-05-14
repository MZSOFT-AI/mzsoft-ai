import React, { useState, useMemo } from 'react';
import { dbService } from '../firebase/db';
import { Button } from './ui/Button';
import Modal from './ui/Modal';
import { 
  Lock, 
  Banknote, 
  CreditCard, 
  ArrowDownRight, 
  Wallet,
  AlertCircle,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase/config';
import { useNotification } from '../context/NotificationContext';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { useSession } from '../context/SessionContext';

interface DailyClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  todaySummary: {
    date: Date;
    startingCash: number;
    cashSales: number;
    transferSales: number;
    totalSales: number;
    expenses: number;
    netFlow: number;
    salesCount: number;
  };
}

const DailyClosingModal: React.FC<DailyClosingModalProps> = ({ isOpen, onClose, todaySummary }) => {
  const { showToast } = useNotification();
  const { closeSession } = useSession();
  const [actualCash, setActualCash] = useState<number | ''>('');
  const [nextSessionCash, setNextSessionCash] = useState<number>(0);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const theoreticalCash = useMemo(() => {
    return todaySummary.startingCash + todaySummary.cashSales - todaySummary.expenses;
  }, [todaySummary]);

  const difference = useMemo(() => {
    if (actualCash === '') return 0;
    return actualCash - theoreticalCash;
  }, [actualCash, theoreticalCash]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await closeSession({
        cashSales: todaySummary.cashSales,
        transferSales: todaySummary.transferSales,
        totalSales: todaySummary.totalSales,
        expenses: todaySummary.expenses,
        netCash: todaySummary.netFlow,
        salesCount: todaySummary.salesCount,
        actualCashInDrawer: actualCash || theoreticalCash,
        nextSessionCash: nextSessionCash,
        difference: difference,
        closingNote: note,
      });

      showToast(`Session clôturée avec succès`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la clôture", 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clôture de Journée">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
             <Lock size={120} />
          </div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-2">Résumé du {format(todaySummary.date, 'dd MMMM yyyy', { locale: fr })}</span>
            <div className="text-4xl font-black mb-1">{formatCurrency(theoreticalCash)}</div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Solde Théorique Caisse (Espèces)</p>
            <div className="mt-1 text-[9px] text-slate-500 font-bold uppercase italic">
              Fond: {formatCurrency(todaySummary.startingCash)} + Ventes: {formatCurrency(todaySummary.cashSales)} - Frais: {formatCurrency(todaySummary.expenses)}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 relative z-10">
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
               <div className="flex items-center gap-2 mb-1 text-blue-400">
                  <Banknote size={14} />
                  <span className="text-[9px] font-black uppercase">Ventes Espèces</span>
               </div>
               <div className="text-xl font-bold">{formatCurrency(todaySummary.cashSales)}</div>
            </div>
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
               <div className="flex items-center gap-2 mb-1 text-purple-400">
                  <CreditCard size={14} />
                  <span className="text-[9px] font-black uppercase">Virements/TPE</span>
               </div>
               <div className="text-xl font-bold">{formatCurrency(todaySummary.transferSales)}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Comptage Réel (Espèces)</label>
            <div className="relative">
              <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="number"
                step="0.01"
                placeholder={theoreticalCash.toString()}
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-black text-2xl text-slate-800"
              />
            </div>
            {actualCash !== '' && (
              <div className={`mt-2 flex items-center gap-2 text-[10px] font-bold uppercase ${difference === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {difference === 0 ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <AlertCircle size={12} />
                )}
                Écart : {formatCurrency(difference)}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Fond Restant (Prochaine session)</label>
            <div className="relative">
              <ArrowDownRight className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" size={20} />
              <input
                type="number"
                step="0.01"
                value={nextSessionCash}
                onChange={(e) => setNextSessionCash(Number(e.target.value))}
                className="w-full pl-12 pr-4 py-4 bg-emerald-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-black text-2xl text-emerald-700"
              />
            </div>
            <p className="mt-2 text-[9px] font-bold text-slate-400 uppercase italic">
              À retirer de la caisse : {formatCurrency((Number(actualCash) || theoreticalCash) - nextSessionCash)}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Note de clôture (Optionnel)</label>
          <div className="relative">
            <FileText className="absolute left-4 top-4 text-slate-400" size={16} />
            <textarea
              placeholder="Observations, incidents, écarts..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm min-h-[80px]"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button 
            type="submit" 
            isLoading={isSubmitting}
            className="flex-1 h-14 bg-slate-900 border-none hover:bg-black uppercase font-black tracking-widest text-white"
          >
            <Lock size={18} className="mr-2" /> Clôturer la Journée
          </Button>
          <Button 
            variant="outline" 
            type="button" 
            onClick={onClose}
            className="h-14 uppercase font-black"
          >
            Sortir
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default DailyClosingModal;
