import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  where 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { 
  History, 
  Search, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet,
  CreditCard,
  Banknote,
  SearchX,
  FileText,
  Lock,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { format, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency, getSafeDate } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import DailyClosingModal from '../components/DailyClosingModal';
import StartSessionModal from '../components/StartSessionModal';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';

interface CashSummary {
  date: Date;
  startingCash: number;
  cashSales: number;
  transferSales: number;
  totalSales: number;
  expenses: number;
  netFlow: number;
  salesCount: number;
  isClosed?: boolean;
  closingData?: any;
}

const CashHistory: React.FC = () => {
  const { activeSession, reopenSession } = useSession();
  const { user, userData, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [closings, setClosings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterIssuesOnly, setFilterIssuesOnly] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    
    const currentUid = user.uid;

    // Filter by user if not admin. If admin, show all for audit/management.
    const salesBaseQuery = collection(db, 'sales');
    const expensesBaseQuery = collection(db, 'expenses');
    const closingsBaseQuery = collection(db, 'daily_closings');

    const salesQ = isAdmin 
      ? query(salesBaseQuery, orderBy('createdAt', 'desc'))
      : query(salesBaseQuery, where('userId', '==', currentUid));

    const expensesQ = isAdmin
      ? query(expensesBaseQuery, orderBy('createdAt', 'desc'))
      : query(expensesBaseQuery, where('userId', '==', currentUid));

    const closingsQ = isAdmin
      ? query(closingsBaseQuery, orderBy('date', 'desc'))
      : query(closingsBaseQuery, where('userId', '==', currentUid));

    // Subscribe to sales
    const salesUnsub = onSnapshot(
      salesQ,
      (snapshot) => {
        let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!isAdmin) {
          docs.sort((a: any, b: any) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeB - timeA;
          });
        }
        setSales(docs);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'sales')
    );

    // Subscribe to expenses
    const expensesUnsub = onSnapshot(
      expensesQ,
      (snapshot) => {
        let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!isAdmin) {
          docs.sort((a: any, b: any) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeB - timeA;
          });
        }
        setExpenses(docs);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'expenses')
    );

    // Subscribe to closings
    const closingsUnsub = onSnapshot(
      closingsQ,
      (snapshot) => {
        let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!isAdmin) {
          docs.sort((a: any, b: any) => {
            const timeA = a.date?.toMillis ? a.date.toMillis() : (a.date ? new Date(a.date).getTime() : 0);
            const timeB = b.date?.toMillis ? b.date.toMillis() : (b.date ? new Date(b.date).getTime() : 0);
            return timeB - timeA;
          });
        }
        setClosings(docs);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'daily_closings')
    );

    return () => {
      salesUnsub();
      expensesUnsub();
      closingsUnsub();
    };
  }, [user, isAdmin]);

  const startingCashValue = useMemo(() => {
    // Find the most recent closing before today
    const today = format(new Date(), 'yyyy-MM-dd');
    const pastClosings = closings.filter(c => c.date < today).sort((a, b) => b.date.localeCompare(a.date));
    return pastClosings.length > 0 ? pastClosings[0].nextSessionCash || 0 : 0;
  }, [closings]);

  const historyData = useMemo(() => {
    const dailySummaries: Record<string, CashSummary> = {};

    // Process Sales
    sales.forEach(sale => {
      const date = getSafeDate(sale.createdAt);
      const dateKey = format(date, 'yyyy-MM-dd');

      if (!dailySummaries[dateKey]) {
        dailySummaries[dateKey] = {
          date: startOfDay(date),
          startingCash: 0,
          cashSales: 0,
          transferSales: 0,
          totalSales: 0,
          expenses: 0,
          netFlow: 0,
          salesCount: 0
        };
      }

      const summary = dailySummaries[dateKey];
      if (sale.status !== 'refunded') {
        const amount = sale.totalAmount || 0;
        if (sale.paymentMethod === 'cash') {
          summary.cashSales += amount;
        } else {
          summary.transferSales += amount;
        }
        summary.totalSales += amount;
        summary.salesCount += 1;
      }
    });

    // Process Expenses
    expenses.forEach(exp => {
      const date = getSafeDate(exp.createdAt);
      const dateKey = format(date, 'yyyy-MM-dd');

      if (!dailySummaries[dateKey]) {
        dailySummaries[dateKey] = {
          date: startOfDay(date),
          startingCash: 0,
          cashSales: 0,
          transferSales: 0,
          totalSales: 0,
          expenses: 0,
          netFlow: 0,
          salesCount: 0
        };
      }

      const summary = dailySummaries[dateKey];
      summary.expenses += (exp.amount || 0);
    });

    // Finalize net flow, closing status and filter
    return Object.values(dailySummaries)
      .flatMap(s => {
        const dateKey = format(s.date, 'yyyy-MM-dd');
        const dayClosings = closings.filter(c => c.date === dateKey);
        
        if (dayClosings.length > 0) {
          return dayClosings.map(closing => ({
            ...s,
            date: getSafeDate(closing.startTime || s.date),
            startingCash: closing.startingCash || 0,
            cashSales: closing.cashSales || 0,
            transferSales: closing.transferSales || 0,
            totalSales: closing.totalSales || 0,
            expenses: closing.expenses || 0,
            netFlow: closing.netCash || 0,
            isClosed: closing.status === 'closed',
            closingData: closing
          }));
        }

        // If no closing doc yet, use the calculated summary for today
        const closing = closings.find(c => c.date === dateKey);
        
        // Find starting cash for this day
        let dayStartingCash = closing?.startingCash;
        if (dayStartingCash === undefined) {
           const prevClosings = closings.filter(c => c.date < dateKey).sort((a, b) => b.date.localeCompare(a.date));
           dayStartingCash = prevClosings.length > 0 ? prevClosings[0].nextSessionCash : 0;
        }

        return [{
          ...s,
          startingCash: dayStartingCash || 0,
          netFlow: (dayStartingCash || 0) + s.cashSales - s.expenses,
          isClosed: !!closing,
          closingData: closing
        }];
      })
      .filter(s => {
        if (startDate) {
          const start = new Date(startDate);
          if (s.date < start) return false;
        }
        if (endDate) {
          const end = endOfDay(new Date(endDate));
          if (s.date > end) return false;
        }
        if (filterIssuesOnly && (!s.closingData || (s.closingData.difference || 0) === 0)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sales, expenses, closings, startDate, endDate, filterIssuesOnly]);

  const todaySummary = useMemo(() => {
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    
    if (activeSession) {
      // Aggregate data from session start time
      const sessionStart = getSafeDate(activeSession.startTime);
      
      const sessionSales = sales.filter(s => {
        const date = getSafeDate(s.createdAt);
        return s.userId === activeSession.userId && date >= sessionStart && s.status !== 'refunded';
      });

      const sessionExpenses = expenses.filter(e => {
        const date = getSafeDate(e.createdAt);
        return e.userId === activeSession.userId && date >= sessionStart;
      });

      const cashSales = sessionSales.reduce((sum, s) => sum + (s.paymentMethod === 'cash' ? (s.totalAmount || 0) : 0), 0);
      const transferSales = sessionSales.reduce((sum, s) => sum + (s.paymentMethod !== 'cash' ? (s.totalAmount || 0) : 0), 0);
      const totalExpenses = sessionExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

      return {
        date: startOfDay(today),
        startingCash: activeSession.startingCash,
        cashSales,
        transferSales,
        totalSales: cashSales + transferSales,
        expenses: totalExpenses,
        netFlow: activeSession.startingCash + cashSales - totalExpenses,
        salesCount: sessionSales.length,
        isClosed: false
      };
    }

    const existing = historyData.find(h => format(h.date, 'yyyy-MM-dd') === todayKey);
    if (existing) return existing;

    return {
      date: startOfDay(today),
      startingCash: startingCashValue,
      cashSales: 0,
      transferSales: 0,
      totalSales: 0,
      expenses: 0,
      netFlow: startingCashValue,
      salesCount: 0,
      isClosed: !!closings.find(c => c.date === todayKey && c.status === 'closed')
    };
  }, [historyData, closings, startingCashValue, activeSession, sales, expenses]);

  const totalDiscrepancies = useMemo(() => {
    return historyData.reduce((sum, day) => sum + (day.closingData?.difference || 0), 0);
  }, [historyData]);

  return (
    <div className="space-y-6">
      {/* Starting Cash Banner */}
      {activeSession && (
        <div className="bg-blue-600 rounded-2xl p-6 text-white overflow-hidden relative shadow-lg shadow-blue-200">
          <div className="absolute top-0 right-0 p-4 opacity-10">
             <Wallet size={100} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 mb-1 block">Session Actuelle : {activeSession.userName}</span>
              <h2 className="text-2xl font-black">Session Ouverte</h2>
              <p className="text-blue-100/70 text-xs font-bold mt-1">Vous travaillez actuellement sur cette session de caisse.</p>
            </div>
            <div className="flex items-center gap-8">
              <div className="text-center md:text-right border-l md:border-l-0 md:border-r border-blue-400/30 md:pr-8 pl-8 md:pl-0">
                <p className="text-[10px] font-black uppercase text-blue-200">Fond de Caisse</p>
                <p className="text-3xl font-black">{formatCurrency(activeSession.startingCash)}</p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-[10px] font-black uppercase text-blue-200">Solde Actuel Estimé</p>
                <p className="text-3xl font-black">{formatCurrency(todaySummary.netFlow)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!activeSession && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-amber-700">
             <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                <History size={24} />
             </div>
             <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Aucune session ouverte</h3>
                <p className="text-xs font-bold opacity-70">Veuillez ouvrir une session pour enregistrer des opérations de caisse.</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost"
              onClick={() => navigate('/')}
              className="text-amber-600 hover:bg-amber-100 font-black uppercase text-[10px] tracking-widest h-12 px-8"
            >
               Retour
            </Button>
            <Button 
              onClick={() => setIsStartModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[10px] tracking-widest h-12 px-8"
            >
               Ouvrir une session
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
            className="h-10 w-10 p-0 rounded-full hover:bg-slate-100"
          >
            <ArrowLeft className="text-slate-400" size={20} />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-blue-600 flex items-center justify-center text-white font-black text-xs">CSH</div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-slate-800">Historique de Caisse</h1>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Suivi des flux financiers journaliers</p>
          </div>
        </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setFilterIssuesOnly(!filterIssuesOnly)}
              className={`h-10 px-4 flex items-center gap-2 font-black uppercase text-[10px] tracking-widest border transition-all ${
                filterIssuesOnly 
                ? 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-200' 
                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
              }`}
            >
              <AlertTriangle size={14} />
              {filterIssuesOnly ? 'Issues Seules' : 'Tous les mouvements'}
            </button>

            {activeSession && (
            <Button 
              onClick={() => setIsClosingModalOpen(true)}
              className="h-10 px-4 font-black uppercase tracking-widest text-xs bg-slate-900 text-white hover:bg-black transition-all"
            >
              <div className="flex items-center gap-2">
                <History size={14} /> Clôturer ma Session
              </div>
            </Button>
          )}
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 shadow-sm">
            <Calendar size={14} className="text-slate-400" />
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-[10px] font-black uppercase outline-none"
            />
            <span className="text-slate-300 font-bold text-[10px]">AU</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-[10px] font-black uppercase outline-none"
            />
          </div>
        </div>
      </div>


      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white border border-slate-200 p-6 shadow-sm">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Flux Net Total</span>
            <p className={`text-2xl font-black mt-1 ${historyData.reduce((sum, d) => sum + d.netFlow, 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatCurrency(historyData.reduce((sum, d) => sum + d.netFlow, 0))}
            </p>
         </div>
         <div className="bg-white border border-slate-200 p-6 shadow-sm">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Dépenses</span>
            <p className="text-2xl font-black mt-1 text-rose-500">
              -{formatCurrency(historyData.reduce((sum, d) => sum + d.expenses, 0))}
            </p>
         </div>
         <div className={`p-6 shadow-sm border ${totalDiscrepancies === 0 ? 'bg-white border-slate-200' : 'bg-rose-50 border-rose-100 animate-pulse'}`}>
            <span className={`text-[10px] font-black uppercase tracking-widest ${totalDiscrepancies === 0 ? 'text-slate-400' : 'text-rose-400'}`}>Total des Écarts</span>
            <p className={`text-2xl font-black mt-1 ${totalDiscrepancies === 0 ? 'text-slate-800' : (totalDiscrepancies > 0 ? 'text-emerald-600' : 'text-rose-600')}`}>
              {totalDiscrepancies === 0 ? '0 DA' : (totalDiscrepancies > 0 ? `+${formatCurrency(totalDiscrepancies)}` : formatCurrency(totalDiscrepancies))}
            </p>
         </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent animate-spin"></div>
            <span className="text-[10px] font-black uppercase text-slate-400">Chargement...</span>
          </div>
        </div>
      ) : historyData.length === 0 ? (
        <div className="bg-white border border-slate-200 p-20 flex flex-col items-center justify-center text-center">
          <SearchX size={48} className="text-slate-200 mb-4" />
          <h3 className="text-lg font-black text-slate-800 uppercase italic">Aucun historique</h3>
          <p className="text-xs text-slate-400 max-w-xs">Aucun mouvement de caisse n'a été enregistré pour cette période.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {historyData.map((day) => (
            <div key={day.date.toISOString()} className="bg-white border border-slate-200 shadow-sm overflow-hidden group hover:border-blue-200 transition-all">
              <div className="flex flex-col md:flex-row">
                {/* Date Side */}
                <div className={`p-6 md:w-56 flex flex-col justify-center items-center md:border-r border-slate-200 border-b md:border-b-0 ${
                  day.isClosed && day.closingData?.difference !== 0 ? 'bg-rose-50' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center gap-1 mb-2">
                    {day.isClosed ? (
                       day.closingData?.difference === 0 ? (
                         <CheckCircle size={14} className="text-emerald-500" />
                       ) : (
                         <AlertTriangle size={14} className="text-rose-500" />
                       )
                    ) : (
                      <Clock size={14} className="text-amber-500" />
                    )}
                    <span className="text-[10px] font-black uppercase text-slate-400">{format(day.date, 'EEEE', { locale: fr })}</span>
                  </div>
                  <span className="text-2xl font-black text-slate-800">{format(day.date, 'dd')}</span>
                  <span className="text-xs font-bold text-slate-500 uppercase">{format(day.date, 'MMMM yyyy', { locale: fr })}</span>
                  
                  {day.isClosed && (
                    <div className="mt-4 text-center">
                      <p className="text-[9px] font-black uppercase text-slate-400 mb-0.5">Opérateur</p>
                      <p className="text-[10px] font-bold text-slate-600 bg-white px-2 py-1 border border-slate-200">
                        {day.closingData?.userName || 'Inconnu'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Data Overview */}
                <div className="flex-1 p-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Sales Column */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                       <Wallet size={10} className="text-emerald-500" /> Fond de Caisse
                    </label>
                    <div className="text-lg font-black text-slate-800">{formatCurrency(day.startingCash)}</div>
                  </div>

                  {/* Sales Column */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                       <Banknote size={10} className="text-blue-500" /> Ventes Espèces
                    </label>
                    <div className="text-lg font-black text-slate-800">{formatCurrency(day.cashSales)}</div>
                  </div>

                  {/* Transfer Column */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      <CreditCard size={10} className="text-purple-500" /> Autres Paiements
                    </label>
                    <div className="text-lg font-black text-slate-800">{formatCurrency(day.transferSales)}</div>
                  </div>

                  {/* Expenses Column */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      <ArrowDownRight size={10} className="text-rose-500" /> Dépenses / Sorties
                    </label>
                    <div className="text-lg font-black text-rose-600">-{formatCurrency(day.expenses)}</div>
                  </div>

                  {/* Net Cash Column */}
                  <div className="lg:border-l border-slate-100 lg:pl-6 bg-slate-50 lg:bg-transparent -m-6 lg:m-0 p-6 lg:p-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 font-black">
                          <Wallet size={10} className="text-emerald-500" /> Solde Net Caisse
                        </label>
                        {day.isClosed && (
                          <div className="flex items-center gap-1 text-[8px] font-black uppercase text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                            <Lock size={8} /> Clôturé
                          </div>
                        )}
                      </div>
                      <div className={`text-xl font-black ${day.netFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(day.netFlow)}
                      </div>
                    </div>
                    
                    {day.isClosed && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <div className="flex items-center justify-between gap-4">
                           <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Heure</p>
                              <p className="text-[10px] font-bold text-slate-600">
                                {day.closingData?.endTime?.toDate ? format(day.closingData.endTime.toDate(), 'HH:mm') : '-'}
                              </p>
                           </div>
                           <div className="text-right flex flex-col items-end">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Par</p>
                              <p className="text-[10px] font-bold text-slate-600 truncate max-w-[80px]">{day.closingData?.closedByName || '-'}</p>
                              {isAdmin && day.isClosed && isSameDay(day.date, new Date()) && !activeSession && (
                                <button 
                                  onClick={() => reopenSession(day.closingData.id)}
                                  className="mt-1 text-[8px] font-black text-blue-600 hover:underline uppercase"
                                >
                                  Réouvrir
                                </button>
                              )}
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cash Réel</p>
                            <p className="text-[11px] font-black text-slate-700">{formatCurrency(day.closingData?.actualCashInDrawer || 0)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Écart</p>
                            <p className={`text-[11px] font-black ${
                              (day.closingData?.difference || 0) === 0 ? 'text-emerald-600' : 
                              (day.closingData?.difference || 0) > 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {(day.closingData?.difference || 0) > 0 ? '+' : ''}{formatCurrency(day.closingData?.difference || 0)}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-1 px-1">
                          <div>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">Retiré</p>
                            <p className="text-[9px] font-bold text-rose-500">{formatCurrency(day.closingData?.withdrawnAmount || 0)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">Laissé (Fonds)</p>
                            <p className="text-[9px] font-bold text-emerald-600">{formatCurrency(day.closingData?.nextSessionCash || 0)}</p>
                          </div>
                        </div>

                        {day.closingData?.closingNote && (
                          <div className="mt-2 p-2 bg-slate-100 border-l-2 border-slate-300">
                             <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5 tracking-tighter">Note de session</p>
                             <p className="text-[10px] font-bold text-slate-600 leading-tight italic">"{day.closingData.closingNote}"</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <DailyClosingModal 
        isOpen={isClosingModalOpen} 
        onClose={() => setIsClosingModalOpen(false)} 
        todaySummary={todaySummary as any} 
      />

      <StartSessionModal isOpen={isStartModalOpen} />

      {/* Legend / Info */}
      <div className="bg-slate-900 border-l-4 border-blue-600 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="text-blue-400" size={20} />
          <div>
            <p className="text-white font-black uppercase tracking-widest text-[10px]">Calcul du flux de caisse</p>
            <p className="text-slate-400 text-[10px] font-bold">Le solde net est calculé comme : (Ventes Spèces) - (Dépenses sortant de la caisse).</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashHistory;
