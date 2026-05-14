import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { orderBy, limit } from 'firebase/firestore';
import { useCollection } from '../hooks/useCollection';
import { Sale, Product } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  TrendingUp, 
  Box, 
  ShoppingCart, 
  Plus,
  RefreshCw,
  Users,
  LayoutGrid,
  Calendar,
  Package,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'motion/react';
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

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { data: sales } = useCollection<Sale>('sales', [orderBy('createdAt', 'desc'), limit(500)]);
  const { data: products } = useCollection<Product>('products');
  const { data: customers } = useCollection('customers');

  const canViewFinancials = hasPermission('canViewReports');
  const canManageStock = hasPermission('canManageStock');
  const canSell = hasPermission('canSell');

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
        const date = (sale.createdAt as any).toDate ? (sale.createdAt as any).toDate() : new Date(sale.createdAt as any);
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
    
    // Generate last 12 months labels
    const last12Months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      return format(d, 'MMM yy', { locale: fr });
    }).reverse();

    last12Months.forEach(month => monthlyData[month] = 0);

    sales.forEach(sale => {
      if (sale.createdAt) {
        const date = (sale.createdAt as any).toDate ? (sale.createdAt as any).toDate() : new Date(sale.createdAt as any);
        const monthLabel = format(date, 'MMM yy', { locale: fr });
        if (monthlyData[monthLabel] !== undefined) {
          monthlyData[monthLabel] += (sale.totalAmount || 0);
        }
      }
    });

    return last12Months.map(month => ({ name: month, amount: monthlyData[month] }));
  }, [sales]);

  return (
    <div className="space-y-6">
      {/* ERP Header */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Tableau de Bord Administratif</h1>
          <div className="flex items-center gap-2 text-slate-500 mt-1">
             <Calendar size={14} className="text-blue-500" />
             <span className="text-[10px] font-black uppercase tracking-widest">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</span>
          </div>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <Button variant="outline" size="sm" className="h-10 text-xs font-bold uppercase" onClick={() => window.location.reload()}>
             <RefreshCw size={16} className="mr-2 text-slate-400" /> Rafraîchir
           </Button>
           <Button size="sm" className="h-10 text-xs font-bold uppercase bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate('/pos')}>
             <Plus size={16} className="mr-2" /> Nouvelle Vente
           </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Chiffre d\'Affaires', value: formatCurrency(statsData.monthlyRevenue), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', show: canViewFinancials },
          { title: 'Commandes Total', value: statsData.totalSales, icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-50', show: canViewFinancials },
          { title: 'Base Clients', value: statsData.totalCustomers, icon: Users, color: 'text-teal-600', bg: 'bg-teal-50', show: true },
          { title: 'Alertes Stock', value: statsData.lowStock, icon: Package, color: 'text-red-600', bg: 'bg-red-50', show: canManageStock },
        ].filter(s => s.show).map((stat, idx) => (
          <div key={idx} className="bg-white border border-slate-200 p-5 flex items-center gap-4 group hover:border-blue-300 transition-colors">
            <div className={cn("w-12 h-12 rounded flex items-center justify-center shrink-0", stat.bg, stat.color)}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.title}</p>
              <p className="text-xl font-black text-slate-800 tabular-nums">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Sales Bar Chart */}
        {canViewFinancials && (
          <div className="lg:col-span-3 bg-white border border-slate-200 shadow-sm flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-emerald-500" />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">Ventes Mensuelles (12 Mois)</span>
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Total 12m: <span className="text-slate-900">{formatCurrency(monthlyChartData.reduce((acc, d) => acc + d.amount, 0))}</span>
              </div>
            </div>
            <div className="p-6 h-[400px] w-full relative min-h-[400px]">
               <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={monthlyChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickFormatter={(value) => `${value > 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '0', border: '1px solid #e2e8f0', boxShadow: 'none', fontSize: '12px', fontWeight: 'bold' }}
                      formatter={(value: number) => [formatCurrency(value), 'Ventes']}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={40}>
                      {monthlyChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === monthlyChartData.length - 1 ? '#059669' : '#10b981'} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
               </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Sales Chart */}
        {canViewFinancials && (
          <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">Courbe des Ventes (7 Jours)</span>
            </div>
            <div className="p-6 h-[400px] w-full relative min-h-[400px]">
               <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '0', border: '1px solid #e2e8f0', boxShadow: 'none', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={3} fill="url(#chartGradient)" />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent Items */}
        <div className={cn("bg-white border border-slate-200 shadow-sm flex flex-col", !canViewFinancials && "lg:col-span-3")}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="text-blue-500" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">Activités Récentes</span>
            </div>
            <Button variant="ghost" size="sm" className="text-[10px] uppercase h-7" onClick={() => navigate('/sales-history')}>Détails</Button>
          </div>
          <div className="flex-1 overflow-y-auto">
             {sales.slice(0, 10).map((sale) => (
               <div key={sale.id} className="p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors flex items-start gap-3">
                  <div className="w-8 h-8 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 font-bold text-xs">
                    {sale.customerName?.charAt(0) || 'C'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{sale.customerName || 'Client de passage'}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{sale.createdAt ? format((sale.createdAt as any).toDate(), 'HH:mm', { locale: fr }) : '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-emerald-600">+{formatCurrency(sale.totalAmount)}</p>
                    <p className="text-[9px] font-bold text-slate-300 uppercase">{sale.paymentMethod}</p>
                  </div>
               </div>
             ))}
             {sales.length === 0 && (
               <div className="py-20 text-center text-slate-300 italic text-xs">Aucune donnée</div>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
        {/* Top Products Table */}
        <div className="bg-white border border-slate-200 shadow-sm">
           <div className="p-4 border-b border-slate-100 bg-slate-50">
             <span className="text-[11px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
               <TrendingUp size={14} className="text-blue-500" /> Tops des Ventes
             </span>
           </div>
           <table className="dolisoft-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="text-center">Ventes</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i}>
                    <td className="font-bold text-slate-700 text-xs">{p.name}</td>
                    <td className="text-center font-bold text-blue-600 text-xs">{p.quantity}</td>
                    <td className="text-right font-black text-slate-800 text-xs">{formatCurrency(p.total)}</td>
                  </tr>
                ))}
              </tbody>
           </table>
        </div>

        {/* Stock Alerts Table */}
        <div className="bg-white border border-slate-200 shadow-sm">
           <div className="p-4 border-b border-slate-100 bg-slate-50">
             <span className="text-[11px] font-black uppercase tracking-widest text-rose-600 flex items-center gap-2">
               <AlertTriangle size={14} /> Alertes Stock Critique
             </span>
           </div>
           <table className="dolisoft-table">
              <thead>
                <tr>
                  <th>Produit Désignation</th>
                  <th className="text-center">Actuel</th>
                  <th className="text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {statsData.lowStockItems.map((p, i) => (
                  <tr key={i}>
                    <td className="font-bold text-slate-700 text-xs">{p.name}</td>
                    <td className="text-center font-black text-rose-600 text-xs">{p.stockQuantity}</td>
                    <td className="text-center">
                       <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-rose-50 text-rose-500 border border-rose-100">Action Requise</span>
                    </td>
                  </tr>
                ))}
                {statsData.lowStockItems.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-4 text-emerald-500 font-bold text-xs uppercase">✓ Stock Optimisé</td>
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
