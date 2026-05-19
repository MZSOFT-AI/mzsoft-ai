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
  FileText,
  Shield,
  LogOut
} from 'lucide-react';
import { serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { formatCurrency, safeStringify } from '../lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { useSession } from '../context/SessionContext';
import { notificationService } from '../services/notificationService';

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
  const { activeSession, closeSession } = useSession();
  const { user, userData, isAdmin, logout } = useAuth();
  const { settings } = useSettings();
  const [actualCash, setActualCash] = useState<number | ''>('');
  const [withdrawnAmount, setWithdrawnAmount] = useState<number | ''>('');
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

  // If real cash or remaining cash changes, auto-calc withdrawn
  const computedWithdrawn = useMemo(() => {
    if (actualCash === '') return 0;
    return Math.max(0, actualCash - nextSessionCash);
  }, [actualCash, nextSessionCash]);
  
  const canClose = useMemo(() => {
    if (isAdmin) return true;
    if (!settings.lockSessions) return true;
    // Allow user to close their own session
    return activeSession?.userId === (user?.uid || userData?.id);
  }, [isAdmin, settings.lockSessions, activeSession, user, userData]);

  const handleSubmit = async (e: React.FormEvent, shouldLogout: boolean = false) => {
    e.preventDefault();
    if (!canClose) return;
    setIsSubmitting(true);

    const realCashCounted = actualCash === '' ? theoreticalCash : actualCash;
    const finalWithdrawn = withdrawnAmount === '' ? computedWithdrawn : withdrawnAmount;

    try {
      await closeSession({
        actualCashInDrawer: realCashCounted,
        theoreticalCash: theoreticalCash,
        difference: difference,
        withdrawnAmount: finalWithdrawn,
        nextSessionCash: nextSessionCash,
        closingNote: note,
      });

      // Trigger notification if there is a discrepancy and settings allow it
      if (Math.abs(difference) > 0.01 && settings.notifyCashDiscrepancy) {
        await notificationService.createNotification({
          type: 'cash_discrepancy',
          title: 'Écart de Caisse Détecté',
          message: `Un écart de ${formatCurrency(difference)} a été enregistré par ${userData?.displayName || 'Utilisateur'}.`,
          priority: Math.abs(difference) > 100 ? 'critical' : 'high',
          userId: user?.uid || userData?.id || 'unknown',
          userName: userData?.displayName || 'Inconnu',
          metadata: {
            difference,
            theoreticalCash,
            actualCash: realCashCounted,
            sessionId: activeSession?.id
          }
        });
      }

      showToast(`Session clôturée avec succès`, 'success');
      
      if (shouldLogout) {
        onClose();
        setTimeout(() => {
          logout();
        }, 500);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(safeStringify(err));
      showToast("Erreur lors de la clôture", 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clôture de Journée">
      <form onSubmit={handleSubmit} className="space-y-6">
        {!canClose && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 mb-6">
            <Shield size={20} className="shrink-0" />
            <p className="text-[10px] font-black uppercase leading-tight">
              La clôture des sessions est verrouillée. Veuillez contacter un gestionnaire.
            </p>
          </div>
        )}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">1. Comptage Réel (Espèces)</label>
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
                <div className={`mt-2 flex items-center justify-between px-1`}>
                  <div className={`flex items-center gap-2 text-[10px] font-bold uppercase ${difference >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {difference > 0 ? (
                      <CheckCircle2 size={12} />
                    ) : difference < 0 ? (
                      <AlertCircle size={12} />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    {difference > 0 ? 'Surplus' : difference < 0 ? 'Manquant' : 'Conform'} : {formatCurrency(Math.abs(difference))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Note de clôture (Optionnel)</label>
              <div className="relative">
                <FileText className="absolute left-4 top-4 text-slate-400" size={16} />
                <textarea
                  placeholder="Observations sur l'écart, incidents..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm min-h-[120px]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6 bg-slate-50 p-6 rounded-3xl border border-slate-100 italic">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">Mouvements de Caisse</h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">A. Montant Retiré (Prélèvement)</label>
                <div className="relative">
                  <ArrowDownRight className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-500" size={16} />
                  <input
                    type="number"
                    step="0.01"
                    placeholder={computedWithdrawn.toString()}
                    value={withdrawnAmount}
                    onChange={(e) => setWithdrawnAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-bold text-lg text-rose-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">B. Fond Laissé (Prochaine session)</label>
                <div className="relative">
                  <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" size={16} />
                  <input
                    type="number"
                    step="0.01"
                    value={nextSessionCash}
                    onChange={(e) => setNextSessionCash(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg text-emerald-700"
                  />
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-dashed border-slate-300">
                 <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
                    <span>Total (A + B)</span>
                    <span className={Math.abs((Number(withdrawnAmount || computedWithdrawn) + nextSessionCash) - (Number(actualCash) || theoreticalCash)) > 0.01 ? 'text-rose-600' : 'text-slate-800'}>
                      {formatCurrency(Number(withdrawnAmount || computedWithdrawn) + nextSessionCash)}
                    </span>
                 </div>
                 {Math.abs((Number(withdrawnAmount || computedWithdrawn) + nextSessionCash) - (Number(actualCash) || theoreticalCash)) > 0.01 && (
                   <p className="text-[8px] text-rose-500 mt-1 font-black uppercase">Attention: La ventilation ne correspond pas au réel!</p>
                 )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Button 
              type="submit" 
              isLoading={isSubmitting}
              disabled={!canClose}
              className="flex-1 h-14 bg-slate-900 border-none hover:bg-black uppercase font-black tracking-widest text-white shadow-lg"
            >
              <Lock size={18} className="mr-2" /> Clôturer la Journée
            </Button>

            <Button 
              onClick={(e) => handleSubmit(e as any, true)}
              isLoading={isSubmitting}
              disabled={!canClose}
              className="flex-1 h-14 bg-rose-600 border-none hover:bg-rose-700 uppercase font-black tracking-widest text-white shadow-lg shadow-rose-100"
            >
              <LogOut size={18} className="mr-2" /> Clôturer et Quitter
            </Button>
          </div>

          <Button 
            variant="ghost" 
            type="button" 
            onClick={onClose}
            className="h-10 uppercase font-black text-[10px] tracking-widest text-slate-400 hover:text-slate-600"
          >
            Annuler
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default DailyClosingModal;
