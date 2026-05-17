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
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const CHART_COLORS = ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'];

import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

export default function Reports() {
  const { user, hasPermission } = useAuth();
  const { settings } = useSettings();
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
    const dateValue = (sale.createdAt as any)?.toDate ? (sale.createdAt as any).toDate() : (sale.createdAt instanceof Date ? sale.createdAt : new Date());
    const date = format(dateValue, 'dd/MM', { locale: fr });
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
      Date: s.createdAt ? ((s.createdAt as any)?.toDate?.() || new Date(s.createdAt)).toLocaleString() : '-',
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

  const handleDownloadReport = () => {
    // Basic summary for the PDF
    const data = {
      totalRevenue,
      avgTicket: Number(avgTicket),
      totalStock: products.reduce((acc, p) => acc + (p.stockQuantity || 0), 0),
      salesCount: sales.length,
      productsCount: products.length,
      generatedAt: new Date(),
      userName: user?.displayName || 'Admin'
    };

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.name || 'RAPPORT D\'ACTIVITÉ', pageWidth / 2, 25, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(settings.slogan || 'Rapport de Gestion Commerciale', pageWidth / 2, 32, { align: 'center' });
    doc.text(`Généré le: ${format(data.generatedAt, 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 37, { align: 'center' });

    // KPI Section
    doc.setFillColor(248, 250, 252);
    doc.rect(20, 45, pageWidth - 40, 40, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('REVENU TOTAL', 30, 55);
    doc.text('PANIER MOYEN', pageWidth / 2, 55, { align: 'center' });
    doc.text('UNITÉS EN STOCK', pageWidth - 30, 55, { align: 'right' });

    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.totalRevenue.toLocaleString()} ${settings.currencySymbol}`, 30, 65);
    doc.text(`${data.avgTicket.toLocaleString()} ${settings.currencySymbol}`, pageWidth / 2, 65, { align: 'center' });
    doc.text(`${data.totalStock.toLocaleString()}`, pageWidth - 30, 65, { align: 'right' });

    // Sales Table
    const tableData = sales.slice(0, 50).map(s => [
      s.id.substring(0, 8),
      s.createdAt ? format((s.createdAt as any)?.toDate ? (s.createdAt as any).toDate() : (s.createdAt instanceof Date ? s.createdAt : new Date()), 'dd/MM HH:mm') : '-',
      s.customerName || 'Passager',
      s.paymentMethod === 'cash' ? 'Espèces' : 'Carte',
      `${(s.totalAmount || 0).toLocaleString()} DA`
    ]);

    doc.setFontSize(12);
    doc.text('Historique Récent (50 dernières ventes)', 20, 100);

    autoTable(doc, {
      startY: 105,
      head: [['ID', 'Date', 'Client', 'Paiement', 'Montant']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 8 }
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Émis par ${settings.name} - Opérateur: ${data.userName}`, pageWidth / 2, 285, { align: 'center' });

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
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
           <Button className="h-10" onClick={handleDownloadReport}>
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
          <CardContent className="relative min-w-0" style={{ height: '350px' }}>
             <ResponsiveContainer width="100%" height="100%">
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
          <CardContent className="relative min-w-0" style={{ height: '350px' }}>
             <ResponsiveContainer width="100%" height="100%">
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
           <CardContent className="relative min-w-0" style={{ height: '350px' }}>
              <ResponsiveContainer width="100%" height="100%">
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

