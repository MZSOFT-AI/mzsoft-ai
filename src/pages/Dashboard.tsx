import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { collection, onSnapshot, query, orderBy, limit, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Sale, Product, AppNotification } from '../types';
import { formatCurrency, cn, getSafeDate } from '../lib/utils';
import { excelService } from '../services/excelService';
import { 
  TrendingUp, 
  ShoppingCart, 
  Plus,
  RefreshCw,
  Users,
  Calendar,
  Package,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '../components/ui/Button';

const getMillis = (val: any): number => {
  if (!val) return 0;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin, hasPermission } = useAuth();
  const { markAsRead, markAllAsRead } = useNotification();
  
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);

  const canViewFinancials = hasPermission('canViewReports');
  const canManageStock = hasPermission('canManageStock');

  React.useEffect(() => {
    if (isAdmin) {
      const q = query(
        collection(db, 'notifications'),
        where('isRead', '==', false),
        limit(100)
      );
      const unsub = onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
        docs.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setNotifications(docs.slice(0, 20));
      });
      return unsub;
    }
  }, [isAdmin]);

  React.useEffect(() => {
    if (!user) return;
    const currentUid = user.uid;

    const salesBaseQuery = collection(db, 'sales');
    const salesQ = (isAdmin || canViewFinancials)
      ? query(salesBaseQuery, orderBy('createdAt', 'desc'), limit(500))
      : query(salesBaseQuery, where('userId', '==', currentUid), limit(500));

    const salesUnsub = onSnapshot(salesQ, (snap) => {
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale));
      if (!isAdmin && !canViewFinancials) {
        docs.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
      }
      setSales(docs);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sales'));

    getDocs(query(collection(db, 'products'))).then((snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }).catch(err => console.error("Error loading products:", err));

    getDocs(query(collection(db, 'customers'))).then((snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(err => console.error("Error loading customers:", err));

    return () => {
      salesUnsub();
    };
  }, [user, isAdmin, canViewFinancials]);

  const statsData = useMemo(() => {
    const totalRevenue = sales.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0);
    const lowStockItems = products.filter(p => p.stockQuantity <= (p.minStockLevel || 5));
    
    return {
      monthlyRevenue: totalRevenue,
      totalSales: sales.length,
      totalProducts: products.length,
      totalCustomers: customers.length,
      lowStock: lowStockItems.length,
      lowStockItems: lowStockItems.slice(0, 5)
    };
  }, [sales, products, customers]);

  const topProducts = useMemo(() => {
    const productSales: Record<string, { name: string, quantity: number, total: number }> = {};
    sales.forEach(sale => {
      sale.items?.forEach(item => {
        if (!productSales[item.name]) {
          productSales[item.name] = { name: item.name, quantity: 0, total: 0 };
        }
        productSales[item.name].quantity += (item.quantity || 0);
        productSales[item.name].total += (item.total || 0);
      });
    });

    return Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [sales]);

  const chartData = useMemo(() => {
    const dailyData: Record<string, number> = {};
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(today.getDate() - i);
      return format(d, 'eee', { locale: fr });
    }).reverse();

    last7Days.forEach(day => dailyData[day] = 0);

    sales.forEach(sale => {
      if (sale.createdAt) {
        const date = getSafeDate(sale.createdAt);
        const dayName = format(date, 'eee', { locale: fr });
        if (dailyData[dayName] !== undefined) {
          dailyData[dayName] += (sale.totalAmount || 0);
        }
      }
    });

    return last7Days.map(day => ({ name: day, sales: dailyData[day] }));
  }, [sales]);

  const monthlyChartData = useMemo(() => {
    const monthlyData: Record<string, number> = {};
    const today = new Date();
    
    const last12Months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      return format(d, 'MMM yy', { locale: fr });
    }).reverse();

    last12Months.forEach(month => monthlyData[month] = 0);

    sales.forEach(sale => {
      if (sale.createdAt) {
        const date = getSafeDate(sale.createdAt);
        const monthLabel = format(date, 'MMM yy', { locale: fr });
        if (monthlyData[monthLabel] !== undefined) {
          monthlyData[monthLabel] += (sale.totalAmount || 0);
        }
      }
    });

    return last12Months.map(month => ({ name: month, amount: monthlyData[month] }));
  }, [sales]);

  const handleExportDashboard = async () => {
    try {
      const data = [
        { label: "Chiffre d'Affaires", value: statsData.monthlyRevenue, unit: "DA" },
        { label: "Total Ventes", value: statsData.totalSales, unit: "Docs" },
        { label: "Total Produits", value: statsData.totalProducts, unit: "u" },
        { label: "Total Clients", value: statsData.totalCustomers, unit: "pers." },
        { label: "Alertes Stock", value: statsData.lowStock, unit: "items" }
      ];

      await excelService.generateProfessionalReport({
        filename: `Dashboard_Report_${format(new Date(), 'yyyyMMdd')}`,
        title: 'RAPPORT DE PERFORMANCE - TABLEAU DE BORD',
        subtitle: `Résumé opérationnel au ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
        columns: [
          { header: 'Indicateur', key: 'label', width: 40 },
          { header: 'Valeur', key: 'value', width: 25 },
          { header: 'Unité', key: 'unit', width: 10 }
        ],
        data
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6 px-4 md:px-6 py-6 font-sans bg-[#F9FAFB]">
      {/* ERP Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight leading-tight">Tableau de Bord Principal</h1>
          <div className="flex items-center gap-2 text-slate-500 mt-1.5">
             <Calendar size={14} className="text-[#0066FF]" />
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</span>
          </div>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto">
           <Button variant="outline" size="sm" className="h-10 text-xs font-bold uppercase transition-all duration-200 border-[#0066FF]/20 bg-blue-50/20 text-[#0066FF] flex-1 sm:flex-initial justify-center rounded-xl hover:bg-slate-50 hover:shadow-xs" onClick={handleExportDashboard}>
             <TrendingUp size={16} className="mr-2 shrink-0" /> Rapport Excel Pro
           </Button>
           <Button variant="outline" size="sm" className="h-10 text-xs font-bold uppercase transition-all duration-200 border-slate-200 bg-white text-slate-700 flex-1 sm:flex-initial justify-center rounded-xl hover:bg-slate-50 hover:shadow-xs" onClick={() => window.location.reload()}>
             <RefreshCw size={16} className="mr-2 text-slate-400 shrink-0" /> Rafraîchir
           </Button>
           <Button size="sm" className="h-10 text-xs font-bold uppercase transition-all duration-200 bg-[#0066FF] hover:bg-[#0055DD] text-white flex-1 sm:flex-initial justify-center rounded-xl shadow-sm hover:shadow-md" onClick={() => navigate('/pos')}>
             <Plus className="mr-2 shrink-0" /> Caisse POS
           </Button>
        </div>
      </div>

      {/* Notifications Section - Premium Alert Design */}
      {isAdmin && notifications.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50/20 shadow-xs">
          <div className="flex flex-col md:flex-row justify-between items-center px-6 py-4 gap-4 border-b border-rose-100">
            <div className="flex items-center gap-3">
               <AlertCircle className="text-rose-600 animate-pulse" size={20} />
               <h2 className="text-sm font-black text-rose-900 uppercase tracking-tight">
                 Alertes de Stock Critique ({notifications.length})
               </h2>
            </div>
            <button 
              onClick={() => markAllAsRead()} 
              className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-800 underline underline-offset-4 tracking-widest transition-colors"
            >
              Tout marquer comme lu
            </button>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-white/60">
             {(notifications || []).map(notif => (
                <div key={notif.id} className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between min-h-[135px] group">
                   <div>
                     <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                          notif.priority === 'critical' ? "bg-rose-50 text-rose-700 border border-rose-100" : 
                          notif.priority === 'high' ? "bg-orange-50 text-orange-700 border border-orange-100" :
                          "bg-blue-50 text-blue-700 border border-blue-100"
                        )}>
                          {notif.priority === 'critical' ? 'CRITIQUE' : 
                           notif.priority === 'high' ? 'MOYEN' : 'FAIBLE'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">
                          {notif.createdAt ? format(getSafeDate(notif.createdAt), 'dd/MM HH:mm') : '-'}
                        </span>
                     </div>
                     <p className="text-xs font-extrabold text-slate-900 mb-0.5 leading-tight">{notif.title}</p>
                     <p className="text-[11px] text-slate-500 leading-tight mb-2 line-clamp-2">{notif.message}</p>
                   </div>
                   <div className="flex justify-end pt-2 border-t border-slate-50">
                     <button 
                       onClick={() => markAsRead(notif.id!)}
                       className="text-[10px] font-black uppercase text-[#0066FF] hover:text-[#0055DD] tracking-wider"
                     >
                       ACQUITTER
                     </button>
                   </div>
                </div>
             ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Chiffre d\'Affaires', value: formatCurrency(statsData.monthlyRevenue), icon: TrendingUp, color: 'text-[#0066FF]', bg: 'bg-blue-50/60 border-blue-100/50', show: canViewFinancials },
          { title: 'Commandes Total', value: statsData.totalSales, icon: ShoppingCart, color: 'text-[#0066FF]', bg: 'bg-blue-50/60 border-blue-100/50', show: canViewFinancials },
          { title: 'Base Clients', value: statsData.totalCustomers, icon: Users, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200/60', show: true },
          { title: 'Alertes Stock', value: statsData.lowStock, icon: Package, color: 'text-rose-600', bg: 'bg-rose-50/60 border-rose-100', show: canManageStock },
        ].filter(s => s.show).map((stat, idx) => (
          <div key={idx} className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center justify-between group hover:border-[#0066FF] hover:shadow-xs transition-all duration-200">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{stat.title}</p>
              <p className="text-2xl font-black text-slate-900 tabular-nums mt-1">{stat.value}</p>
            </div>
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border", stat.bg, stat.color)}>
              <stat.icon size={22} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Sales Bar Chart */}
        {canViewFinancials && (
          <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-2xl shadow-xs flex flex-col overflow-hidden">
            <div className="p-4 px-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-[#0066FF]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Ventes Mensuelles (12 Mois)</span>
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Total 12m: <span className="text-slate-950 font-black">{formatCurrency(monthlyChartData.reduce((acc, d) => acc + d.amount, 0))}</span>
              </div>
            </div>
            <div className="p-6 relative" style={{ height: '360px' }}>
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(value) => `${value > 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(value: number) => [formatCurrency(value), 'Ventes']}
                    />
                    <Bar dataKey="amount" radius={[5, 5, 0, 0]} barSize={36}>
                      {monthlyChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === monthlyChartData.length - 1 ? '#0066FF' : '#3b82f6'} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
               </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Sales Chart */}
        {canViewFinancials && (
          <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl shadow-xs flex flex-col overflow-hidden">
            <div className="p-4 px-5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <TrendingUp size={16} className="text-[#0066FF]" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Courbe des Ventes (7 Jours)</span>
            </div>
            <div className="p-6 relative" style={{ height: '360px' }}>
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0066FF" stopOpacity={0.12}/>
                        <stop offset="95%" stopColor="#0066FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none', fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#0066FF" strokeWidth={3} fill="url(#chartGradient)" />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent Items */}
        <div className={cn("bg-white border border-slate-200/80 rounded-2xl shadow-xs flex flex-col overflow-hidden", !canViewFinancials && "lg:col-span-3")}>
          <div className="p-4 px-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-[#0066FF]" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Activités Récentes</span>
            </div>
            <Button variant="ghost" size="sm" className="text-[9px] uppercase h-7 tracking-wider text-[#0066FF] font-black hover:bg-slate-100 rounded-lg px-2" onClick={() => navigate('/sales-history')}>Détails</Button>
          </div>
          <div className="flex-1 overflow-y-auto">
             {(sales || []).slice(0, 10).map((sale) => (
               <div key={sale.id} className="p-4 px-5 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-extrabold text-xs">
                      {sale.customerName?.charAt(0).toUpperCase() || 'C'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 truncate leading-none mb-1.5">{sale.customerName || 'Client de passage'}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase leading-none">{sale.createdAt ? format(getSafeDate(sale.createdAt), 'HH:mm', { locale: fr }) : '-'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-emerald-600">+{formatCurrency(sale.totalAmount)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{sale.paymentMethod || 'Espèces'}</p>
                  </div>
               </div>
             ))}
             {sales.length === 0 && (
               <div className="py-20 text-center text-slate-450 italic text-xs">Aucune vente enregistrée</div>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
        {/* Top Products Table */}
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
           <div className="p-4 px-5 border-b border-slate-100 bg-slate-50">
             <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
               <TrendingUp size={14} className="text-[#0066FF]" /> Tops des Ventes
             </span>
           </div>
           <table className="mzsoft-table">
              <thead>
                <tr>
                  <th className="px-5">Produit</th>
                  <th className="text-center">Ventes</th>
                  <th className="text-right px-5">Total</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50/30">
                    <td className="font-extrabold text-slate-800 text-xs px-5 py-3">{p.name}</td>
                    <td className="text-center font-black text-[#0066FF] text-xs">{p.quantity}</td>
                    <td className="text-right font-black text-slate-800 text-xs px-5 font-mono">{formatCurrency(p.total)}</td>
                  </tr>
                ))}
                {topProducts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-slate-450 italic text-xs">Aucune donnée</td>
                  </tr>
                )}
              </tbody>
           </table>
        </div>

        {/* Stock Alerts Table */}
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
           <div className="p-4 px-5 border-b border-slate-100 bg-slate-50">
             <span className="text-[11px] font-black uppercase tracking-widest text-rose-600 flex items-center gap-2">
               <AlertTriangle size={14} /> Alertes Stock Critique
             </span>
           </div>
           <table className="mzsoft-table">
              <thead>
                <tr>
                  <th className="px-5">Produit Désignation</th>
                  <th className="text-center">Actuel</th>
                  <th className="text-center px-5">Statut</th>
                </tr>
              </thead>
              <tbody>
                {statsData.lowStockItems.map((p, i) => (
                  <tr key={i} className={cn("hover:bg-slate-50/30", p.stockQuantity <= 0 ? "bg-rose-50/20" : "")}>
                    <td className="font-extrabold text-slate-800 text-xs px-5 py-3">
                        <div className="flex items-center gap-2">
                           {p.stockQuantity <= 0 && <AlertCircle size={12} className="text-rose-600" />}
                           {p.name}
                        </div>
                    </td>
                    <td className={cn(
                      "text-center font-black text-xs font-mono",
                      p.stockQuantity <= 0 ? "text-rose-600" : "text-amber-500"
                    )}>
                      {p.stockQuantity}
                    </td>
                    <td className="text-center px-5">
                       <span className={cn(
                         "text-[9px] font-black uppercase px-2 py-0.5 border rounded-md",
                         p.stockQuantity <= 0 
                           ? "bg-rose-50 text-rose-700 border-rose-200" 
                           : "bg-amber-50 text-amber-700 border-amber-200"
                       )}>
                         {p.stockQuantity <= 0 ? 'RUPTURE' : 'Stock Faible'}
                       </span>
                    </td>
                  </tr>
                ))}
                {statsData.lowStockItems.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-10 text-emerald-600 font-bold text-xs uppercase">✓ Stock Optimisé</td>
                  </tr>
                )}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
