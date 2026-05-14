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
  ArrowLeft
} from 'lucide-react';
import { format, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import DailyClosingModal from '../components/DailyClosingModal';
import StartSessionModal from '../components/StartSessionModal';
import { useSession } from '../context/SessionContext';

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
  const { activeSession } = useSession();
  const navigate = useNavigate();
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [closings, setClosings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    
    // Subscribe to sales
    const salesUnsub = onSnapshot(
      query(collection(db, 'sales'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'sales')
    );

    // Subscribe to expenses
    const expensesUnsub = onSnapshot(
      query(collection(db, 'expenses'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'expenses')
    );

    // Subscribe to closings
    const closingsUnsub = onSnapshot(
      query(collection(db, 'daily_closings'), orderBy('date', 'desc')),
      (snapshot) => {
        setClosings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'daily_closings')
    );

    return () => {
      salesUnsub();
      expensesUnsub();
      closingsUnsub();
    };
  }, []);

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
      const date = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt || Date.now());
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
      const date = exp.createdAt?.toDate ? exp.createdAt.toDate() : new Date(exp.createdAt || Date.now());
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
      .map(s => {
        const dateKey = format(s.date, 'yyyy-MM-dd');
        const closing = closings.find(c => c.date === dateKey);
        
        // Find starting cash for this day
        // It's either explicitly in closing data, or from the previous available closing
        let dayStartingCash = closing?.startingCash;
        if (dayStartingCash === undefined) {
           const prevClosings = closings.filter(c => c.date < dateKey).sort((a, b) => b.date.localeCompare(a.date));
           dayStartingCash = prevClosings.length > 0 ? prevClosings[0].nextSessionCash : 0;
        }

        return {
          ...s,
          startingCash: dayStartingCash || 0,
          netFlow: (dayStartingCash || 0) + s.cashSales - s.expenses,
          isClosed: !!closing,
          closingData: closing
        };
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
        return true;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sales, expenses, closings, startDate, endDate]);

  const todaySummary = useMemo(() => {
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    
    if (activeSession) {
      // Aggregate data from session start time
      const sessionStart = activeSession.startTime?.toDate ? activeSession.startTime.toDate() : new Date(activeSession.startTime || Date.now());
      
      const sessionSales = sales.filter(s => {
        const date = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt || Date.now());
        return s.userId === activeSession.userId && date >= sessionStart && s.status !== 'refunded';
      });

      const sessionExpenses = expenses.filter(e => {
        const date = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || Date.now());
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
              onClick={() => navigate('/dashboard')}
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
            onClick={() => navigate('/dashboard')}
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
                <div className="p-6 bg-slate-50 md:w-48 flex flex-col justify-center items-center md:border-r border-slate-200 border-b md:border-b-0">
                  <span className="text-[10px] font-black uppercase text-slate-400 mb-1">{format(day.date, 'EEEE', { locale: fr })}</span>
                  <span className="text-2xl font-black text-slate-800">{format(day.date, 'dd')}</span>
                  <span className="text-xs font-bold text-slate-500 uppercase">{format(day.date, 'MMMM yyyy', { locale: fr })}</span>
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
                        <p className="text-[8px] font-black text-slate-400 uppercase">Clôturé par : <span className="text-slate-600">{day.closingData?.closedByName}</span></p>
                        {day.closingData?.actualCashInDrawer !== undefined && (
                          <p className="text-[9px] font-bold text-slate-500 mt-0.5">Réel: {formatCurrency(day.closingData.actualCashInDrawer)}</p>
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
