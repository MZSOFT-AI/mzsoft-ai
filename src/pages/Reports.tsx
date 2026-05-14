import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { Download, FileText, Table as TableIcon, Calendar, TrendingUp, DollarSign, Package } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const CHART_COLORS = ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'];

import { useAuth } from '../context/AuthContext';

export default function Reports() {
  const { user, hasPermission } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const canView = hasPermission('canViewReports');

  if (!canView) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="bg-white p-12 border border-slate-200">
           <TrendingUp size={48} className="text-slate-200 mx-auto mb-4" />
           <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Accès Restreint</h2>
           <p className="text-sm text-slate-500 mt-2">Vous n'avez pas l'autorisation de consulter les analyses financières.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const unsubSales = onSnapshot(
      query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(500)), 
      (snapshot) => {
        setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'sales')
    );

    const unsubProducts = onSnapshot(
      collection(db, 'products'), 
      (snapshot) => {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'products')
    );

    const unsubCategories = onSnapshot(
      collection(db, 'categories'), 
      (snapshot) => {
        setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'categories')
    );

    return () => {
      unsubSales();
      unsubProducts();
      unsubCategories();
    };
  }, []);

  // Aggregate sales by date
  const salesByDate = sales.reduce((acc: any[], sale: any) => {
    if (!sale.createdAt) return acc;
    const date = format(sale.createdAt.toDate(), 'dd/MM', { locale: fr });
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.revenue += (sale.totalAmount || 0);
      existing.count += 1;
    } else {
      acc.push({ date, revenue: sale.totalAmount || 0, count: 1 });
    }
    return acc;
  }, []).reverse().slice(-7);

  // Aggregate categories with real names
  const categoryData = products.reduce((acc: any[], current: any) => {
    const categoryDoc = categories.find(c => c.id === current.categoryId);
    const categoryName = categoryDoc?.name || 'Inconnue';
    const existing = acc.find(item => item.name === categoryName);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: categoryName, value: 1 });
    }
    return acc;
  }, []);

  const exportToExcel = () => {
    const wsData = sales.map(s => ({
      ID: s.id,
      Date: s.createdAt?.toDate().toLocaleString(),
      Client: s.customerName || 'Passager',
      Utilisateur: s.userName,
      Montant: s.totalAmount,
      Paiement: s.paymentMethod
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventes");
    XLSX.writeFile(wb, `Rapport_Ventes_${new Date().toLocaleDateString()}.xlsx`);
  };

  const totalRevenue = sales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  const avgTicket = sales.length > 0 ? (totalRevenue / sales.length).toFixed(2) : 0;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Analytique</h1>
          <p className="text-slate-500 dark:text-slate-400">Rapports détaillés et insights de performance.</p>
        </div>
        <div className="flex gap-3">
           <Button variant="outline" onClick={exportToExcel} className="h-10 border-slate-200 dark:border-slate-800">
             <TableIcon size={18} className="mr-2" />
             Exporter Excel
           </Button>
           <Button className="h-10">
             <FileText size={18} className="mr-2" />
             Rapport PDF
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-700 border-none">
          <CardContent className="p-6 text-white">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-2 bg-white/20 rounded-xl"><DollarSign size={20} /></div>
              <p className="text-sm font-bold uppercase tracking-widest opacity-80">Revenu Total</p>
            </div>
            <h2 className="text-3xl font-black">{totalRevenue.toLocaleString()} DA</h2>
            <div className="mt-4 flex items-center text-xs gap-1 opacity-80 font-bold">
               <TrendingUp size={14} /> +8.4% ce mois
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-none">
          <CardContent className="p-6 text-white">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-2 bg-white/10 rounded-xl"><TrendingUp size={20} /></div>
              <p className="text-sm font-bold uppercase tracking-widest opacity-60">Panier Moyen</p>
            </div>
            <h2 className="text-3xl font-black">{avgTicket} DA</h2>
            <p className="mt-4 text-xs opacity-60 font-medium">Basé sur {sales.length} transactions</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4 text-slate-500">
              <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-xl"><Package size={20} /></div>
              <p className="text-sm font-bold uppercase tracking-widest opacity-80 text-slate-400">Total Stock</p>
            </div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white">
              {products.reduce((acc, p) => acc + (p.stockQuantity || 0), 0).toLocaleString()}
            </h2>
            <p className="mt-4 text-xs text-slate-500 font-medium">{products.length} références distinctes</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle>Revenus par Jour</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] w-full min-h-[350px] relative min-w-0">
             <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
               <AreaChart data={salesByDate.length > 0 ? salesByDate : [
                 {date: '01/05', revenue: 4000}, {date: '02/05', revenue: 3000}, {date: '03/05', revenue: 5000}
               ]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                 <defs>
                   <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                     <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                 <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                 <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                 <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                 <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
               </AreaChart>
             </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle>Inventaire par Catégorie</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] w-full min-h-[350px] relative min-w-0">
             <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
               <PieChart>
                 <Pie
                   data={categoryData.length > 0 ? categoryData : [{name: 'Stock', value: 100}]}
                   cx="50%"
                   cy="50%"
                   innerRadius={80}
                   outerRadius={120}
                   paddingAngle={5}
                   dataKey="value"
                 >
                   {(categoryData.length > 0 ? categoryData : [{name: 'Stock', value: 100}]).map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="rgba(255,255,255,0.1)" />
                   ))}
                 </Pie>
                 <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
               </PieChart>
             </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800 shadow-sm">
           <CardHeader>
             <CardTitle>Top Produits par Quantité Stockée</CardTitle>
           </CardHeader>
           <CardContent className="h-[350px] w-full min-h-[350px] relative min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
                <BarChart data={products.sort((a,b) => (b.stockQuantity || 0) - (a.stockQuantity || 0)).slice(0, 10)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                  <Bar dataKey="stockQuantity" fill="#64748b" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
           </CardContent>
        </Card>
      </div>
    </div>
  );
}

