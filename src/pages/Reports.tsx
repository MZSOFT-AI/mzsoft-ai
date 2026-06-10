import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
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
import { 
  Download, 
  FileText, 
  Table as TableIcon, 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  Package, 
  ArrowLeftRight, 
  BarChart3, 
  ShieldCheck, 
  Search,
  ChevronRight,
  User,
  ExternalLink,
  History,
  Activity,
  History as HistoryIcon
} from 'lucide-react';
import { excelService } from '../services/excelService';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const CHART_COLORS = ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'];

import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

type TabType = 'overview' | 'valuation' | 'movements' | 'sales' | 'traceability';

export default function Reports() {
  const { user, hasPermission } = useAuth();
  const canExport = hasPermission('canExportData');
  const canPrint = hasPermission('canPrint');
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [traceSearch, setTraceSearch] = useState('');
  const [traceResults, setTraceResults] = useState<any[]>([]);

  const canView = hasPermission('canViewReports');

  useEffect(() => {
    const unsubSales = onSnapshot(
      query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(1000)), 
      (snapshot) => {
        setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubProducts = onSnapshot(
      collection(db, 'products'), 
      (snapshot) => {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubCategories = onSnapshot(
      collection(db, 'categories'), 
      (snapshot) => {
        setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubMovements = onSnapshot(
      query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'), limit(200)),
      (snapshot) => {
        setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snapshot) => {
        setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }
    );

    return () => {
      unsubSales();
      unsubProducts();
      unsubCategories();
      unsubMovements();
      unsubCustomers();
    };
  }, []);

  // --- CALCULATIONS ---

  const {
    salesByDate,
    totalStockItems,
    totalPurchaseValue,
    totalResaleValue,
    potentialProfit,
    topProducts,
    topCustomers,
    totalRevenue,
    avgTicket
  } = useMemo(() => {
    // Aggregate sales by date
    const sByDate = sales.reduce((acc: any[], sale: any) => {
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

    // Valuation calculations
    const stockItems = products.reduce((acc, p) => acc + (p.stockQuantity || 0), 0);
    const purchaseVal = products.reduce((acc, p) => acc + ((p.stockQuantity || 0) * (p.purchasePrice || 0)), 0);
    const resaleVal = products.reduce((acc, p) => acc + ((p.stockQuantity || 0) * (p.sellingPrice || 0)), 0);
    const latentProfit = resaleVal - purchaseVal;

    // Sales Analysis - O(N + M) implementation using map lookup
    const productSalesMap = new Map<string, number>();
    sales.forEach(s => {
      s.items?.forEach((item: any) => {
        if (item.id) {
          productSalesMap.set(item.id, (productSalesMap.get(item.id) || 0) + (item.quantity || 0));
        }
      });
    });

    const topProds = products
      .map(p => {
        const soldQty = productSalesMap.get(p.id) || 0;
        const revenue = soldQty * p.sellingPrice;
        return { ...p, soldQty, revenue };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Customers Analysis - O(N + M) implementation using map lookup
    const customerSalesMap = new Map<string, { total: number; count: number }>();
    sales.forEach(s => {
      const key = s.customerId || s.customerName || 'unknown';
      const stats = customerSalesMap.get(key) || { total: 0, count: 0 };
      stats.total += (s.totalAmount || 0);
      stats.count += 1;
      customerSalesMap.set(key, stats);
    });

    const topCusts = customers
      .map(c => {
        const stats = customerSalesMap.get(c.id) || customerSalesMap.get(c.name) || { total: 0, count: 0 };
        return { ...c, totalPurchase: stats.total, count: stats.count };
      })
      .sort((a, b) => b.totalPurchase - a.totalPurchase)
      .slice(0, 10);

    const totRev = sales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
    const averageTicket = sales.length > 0 ? (totRev / sales.length).toFixed(2) : 0;

    return {
      salesByDate: sByDate,
      totalStockItems: stockItems,
      totalPurchaseValue: purchaseVal,
      totalResaleValue: resaleVal,
      potentialProfit: latentProfit,
      topProducts: topProds,
      topCustomers: topCusts,
      totalRevenue: totRev,
      avgTicket: averageTicket
    };
  }, [sales, products, customers]);

  // --- ACTIONS ---

  const handleTraceSearch = () => {
    if (!traceSearch.trim()) return;
    const term = traceSearch.toLowerCase();
    const results = movements.filter((m: any) => 
      m.batchNumber?.toLowerCase().includes(term) || 
      m.productName.toLowerCase().includes(term) ||
      m.productId.toLowerCase().includes(term) ||
      m.userName?.toLowerCase().includes(term)
    );
    setTraceResults(results);
  };

  const handleGlobalExport = async () => {
    try {
      // 1. Prepare Overview Data
      const overviewData = [
        { label: "Chiffre d'Affaires Brut", value: totalRevenue, unit: "DA" },
        { label: "Panier Moyen Client", value: avgTicket, unit: "DA" },
        { label: "Volume des Ventes", value: sales.length, unit: "Docs" },
        { label: "Unités en Stock", value: totalStockItems, unit: "u" },
        { label: "Valeur d'Achat Total", value: totalPurchaseValue, unit: "DA" },
        { label: "Valeur de Revente Total", value: totalResaleValue, unit: "DA" },
        { label: "Profit Latent", value: potentialProfit, unit: "DA" }
      ];

      await excelService.generateProfessionalReport({
        filename: `Rapport_Business_ERP_${format(new Date(), 'yyyyMMdd')}`,
        title: 'RAPPORT ANALYTIQUE GLOBAL - BUSINESS INTELLIGENCE',
        subtitle: `Analyse consolidée au ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
        columns: [
          { header: 'Indicateur de Performance', key: 'label', width: 40 },
          { header: 'Valeur Mesurée', key: 'value', width: 25 },
          { header: 'Unité', key: 'unit', width: 10 }
        ],
        data: overviewData
      });
      
      // Optionally could add more sheets or separate files. For now let's make it one robust file or multiple clicks.
      // But user wants "Contenu de la page exemple vue d'ensemble et valorisation..."
      // The current excelService only does one sheet. I should probably expand excelService to handle multi-sheet or just do it manually with ExcelJS if needed.
      // Given the instruction "professionnel", let's make a multi-sheet one manually in Reports.tsx but inspired by excelService.
      
      await generateMultiSheetReport();
      
    } catch (error) {
      console.error('Export Error:', error);
    }
  };

  const generateMultiSheetReport = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const { saveAs } = await import('file-saver');
    const workbook = new ExcelJS.Workbook();
    
    // SHEET 1: OVERVIEW
    const sheet1 = workbook.addWorksheet('Vue d\'ensemble');
    sheet1.addRow(['RÉSUMÉ EXÉCUTIF']).font = { bold: true, size: 14 };
    sheet1.addRow([`Date: ${format(new Date(), 'dd/MM/yyyy')}`]);
    sheet1.addRow([]);
    sheet1.addRow(['Indicateur', 'Valeur', 'Détails']);
    sheet1.addRow(['Chiffre d\'Affaires', totalRevenue, 'Cumul ventes']);
    sheet1.addRow(['Panier Moyen', avgTicket, 'Moyenne/Ticket']);
    sheet1.addRow(['Volume Ventes', sales.length, 'Transactions']);
    sheet1.addRow(['Valorisation Stock (Achat)', totalPurchaseValue, 'Capital immobilisé']);
    sheet1.addRow(['Valorisation Stock (Vente)', totalResaleValue, 'Chiffre d\'affaires potentiel']);
    sheet1.columns = [{ width: 30 }, { width: 25 }, { width: 30 }];

    // SHEET 2: VALORISATION
    const sheet2 = workbook.addWorksheet('Valorisation Stock');
    sheet2.addRow(['DÉTAIL VALORISATION STOCKS']).font = { bold: true };
    sheet2.addRow(['Produit', 'SKU', 'Stock', 'Prix Achat', 'Prix Vente', 'Valeur Achat', 'Valeur Vente', 'Marge']);
    products.forEach(p => {
      sheet2.addRow([
        p.name, p.sku || '-', p.stockQuantity, p.purchasePrice, p.sellingPrice,
        p.stockQuantity * p.purchasePrice, p.stockQuantity * p.sellingPrice,
        (p.stockQuantity * p.sellingPrice) - (p.stockQuantity * p.purchasePrice)
      ]);
    });
    sheet2.columns = [{ width: 30 }, { width: 15 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 20 }, { width: 20 }, { width: 20 }];

    // SHEET 3: VENTES
    const sheet3 = workbook.addWorksheet('Analyse Ventes');
    sheet3.addRow(['PRODUITS LES PLUS VENDUS']).font = { bold: true };
    sheet3.addRow(['Rang', 'Produit', 'Volume Vendu', 'Revenu Généré']);
    topProducts.forEach((p, i) => {
      sheet3.addRow([`#${i+1}`, p.name, p.soldQty, p.revenue]);
    });
    sheet3.columns = [{ width: 10 }, { width: 40 }, { width: 20 }, { width: 25 }];

    // SHEET 4: MOUVEMENTS & TRAÇABILITÉ
    const sheet4 = workbook.addWorksheet('Mouvements & Traçabilité');
    sheet4.addRow(['HISTORIQUE DES MOUVEMENTS']).font = { bold: true };
    sheet4.addRow(['Date', 'Type', 'Produit', 'Delta', 'Batch', 'Utilisateur']);
    movements.forEach(m => {
      sheet4.addRow([
        format(m.createdAt?.toDate ? m.createdAt.toDate() : new Date(), 'dd/MM/yyyy HH:mm'),
        m.type, m.productName, m.quantity, m.batchNumber || '-', m.userName || 'Système'
      ]);
    });
    sheet4.columns = [{ width: 22 }, { width: 15 }, { width: 35 }, { width: 10 }, { width: 20 }, { width: 20 }];

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `RAPPORT_GLOBAL_ERP_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const pieData = useMemo(() => {
    return categories.map(c => {
      const catProducts = products.filter(p => p.categoryId === c.id);
      const totalStock = catProducts.reduce((acc, p) => acc + (p.stockQuantity || 0), 0);
      const lowStockCount = catProducts.filter(p => (p.stockQuantity || 0) <= (p.minStockLevel || 5) && p.stockQuantity > 0).length;
      const outOfStockCount = catProducts.filter(p => (p.stockQuantity || 0) <= 0).length;
      
      let color = '#10b981'; // Sain (emerald-500)
      if (outOfStockCount > 0 && catProducts.length > 0) {
        color = '#e11d48'; // Rupture (rose-600)
      } else if (lowStockCount > 0) {
        color = '#f59e0b'; // Alerte (amber-500)
      }
      
      return { 
        name: c.name, 
        value: totalStock,
        color
      };
    }).filter(c => c.value > 0);
  }, [categories, products]);

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

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            <BarChart3 className="text-blue-600" /> Centre de Reporting & Analyse
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Données temps réel du système</p>
        </div>
        <div className="flex gap-2">
           {canPrint && (
             <Button variant="outline" className="text-xs font-black uppercase h-9 border-slate-200" onClick={() => window.print()}>
               <FileText size={16} className="mr-2" /> Imprimer Page
             </Button>
           )}
           {canExport && (
             <Button className="text-xs font-black uppercase h-9 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200" onClick={handleGlobalExport}>
               <Download size={16} className="mr-2" /> Rapport Excel Pro
             </Button>
           )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
        {[
          { id: 'overview', label: 'Vue d\'ensemble', icon: Activity },
          { id: 'valuation', label: 'Valorisation Stock', icon: DollarSign },
          { id: 'sales', label: 'Analyse Ventes', icon: TrendingUp },
          { id: 'movements', label: 'Mouvements', icon: HistoryIcon },
          { id: 'traceability', label: 'Traçabilité', icon: ShieldCheck },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-md transition-all",
              activeTab === tab.id 
                ? "bg-white text-blue-600 shadow-sm border border-slate-200" 
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-slate-900 border-none shadow-xl">
                <CardContent className="p-6 text-white">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-2 bg-white/10 rounded-xl"><DollarSign size={20} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Revenu Total</p>
                  </div>
                  <h2 className="text-3xl font-black">{totalRevenue.toLocaleString()} DA</h2>
                  <div className="mt-4 flex items-center text-[10px] gap-1 bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded inline-flex font-bold">
                     <TrendingUp size={12} /> {sales.length} transactions cumulées
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><TrendingUp size={20} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Panier Moyen</p>
                  </div>
                  <h2 className="text-3xl font-black text-slate-900">{avgTicket} DA</h2>
                  <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Performance Vente</p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-2 bg-slate-50 text-slate-400 rounded-xl"><Package size={20} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Items en Stock</p>
                  </div>
                  <h2 className="text-3xl font-black text-slate-900">{totalStockItems.toLocaleString()}</h2>
                  <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{products.length} références actives</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Tendance des Revenus (7j)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px] pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesByDate}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff' }} />
                      <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm lg:col-span-1">
                <CardHeader className="pb-0">
                   <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Stock par Catégorie</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="h-[250px] flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff' }}
                          formatter={(value: number) => [`${value} unités`, 'Stock']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <table className="w-full text-left text-[10px]">
                      <thead>
                        <tr className="text-slate-400 uppercase tracking-widest border-b border-slate-50">
                          <th className="pb-2 font-black">Catégorie</th>
                          <th className="pb-2 font-black text-center">Articles</th>
                          <th className="pb-2 font-black text-center">Stock Total</th>
                          <th className="pb-2 font-black text-right">État</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {categories.map(c => {
                          const catProducts = products.filter(p => p.categoryId === c.id);
                          const totalStock = catProducts.reduce((acc, p) => acc + (p.stockQuantity || 0), 0);
                          const lowStockCount = catProducts.filter(p => (p.stockQuantity || 0) <= (p.minStockLevel || 5) && p.stockQuantity > 0).length;
                          const outOfStockCount = catProducts.filter(p => (p.stockQuantity || 0) <= 0).length;
                          
                          let status = 'Sain';
                          let colorClass = 'bg-emerald-100 text-emerald-700';
                          
                          if (outOfStockCount > 0) {
                            status = 'Rupture';
                            colorClass = 'bg-rose-100 text-rose-700';
                          } else if (lowStockCount > 0) {
                            status = 'Alerte';
                            colorClass = 'bg-amber-100 text-amber-700';
                          }

                          return (
                            <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2 font-bold text-slate-700">{c.name}</td>
                              <td className="py-2 text-center text-slate-500 font-medium">{catProducts.length}</td>
                              <td className="py-2 text-center font-black text-slate-900">{totalStock}</td>
                              <td className="py-2 text-right">
                                <span className={cn(
                                  "px-2 py-0.5 rounded-[4px] font-black uppercase tracking-tighter text-[8px]",
                                  colorClass
                                )}>
                                  {status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'valuation' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <Card className="bg-slate-50 border-slate-200">
                  <CardContent className="p-6">
                     <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Valorisation Achat (Coût)</p>
                     <p className="text-2xl font-black text-slate-900">{formatCurrency(totalPurchaseValue)}</p>
                     <p className="text-[10px] font-bold text-slate-500 mt-1 italic">Ce que vous avez payé pour votre stock actuel</p>
                  </CardContent>
               </Card>
               <Card className="bg-blue-50 border-blue-100">
                  <CardContent className="p-6">
                     <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Valorisation Vente (Prix de vente)</p>
                     <p className="text-2xl font-black text-blue-600">{formatCurrency(totalResaleValue)}</p>
                     <p className="text-[10px] font-bold text-blue-500 mt-1 italic">Le revenu potentiel si tout est vendu</p>
                  </CardContent>
               </Card>
               <Card className="bg-emerald-50 border-emerald-100">
                  <CardContent className="p-6">
                     <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2">Marge Brute Potentielle</p>
                     <p className="text-2xl font-black text-emerald-600">{formatCurrency(potentialProfit)}</p>
                     <p className="text-[10px] font-bold text-emerald-500 mt-1 italic">Profit attendu sur l'inventaire complet</p>
                  </CardContent>
               </Card>
            </div>

            <Card className="border-slate-200 overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-white uppercase tracking-widest">
                       <tr>
                         <th className="px-6 py-4 font-black">Produit</th>
                         <th className="px-6 py-4 font-black text-center">Stock</th>
                         <th className="px-6 py-4 font-black text-right">P.A Unit</th>
                         <th className="px-6 py-4 font-black text-right">P.V Unit</th>
                         <th className="px-6 py-4 font-black text-right">Valeur Vente</th>
                         <th className="px-6 py-4 font-black text-right">Marge Est.</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {products.sort((a,b) => (b.stockQuantity * b.sellingPrice) - (a.stockQuantity * a.sellingPrice)).slice(0, 50).map(p => (
                         <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                           <td className="px-6 py-4">
                              <p className="font-bold text-slate-800">{p.name}</p>
                              <p className="text-[9px] text-slate-400 font-mono">{p.sku}</p>
                           </td>
                           <td className="px-6 py-4 text-center font-black text-slate-600">{p.stockQuantity}</td>
                           <td className="px-6 py-4 text-right text-slate-400 italic">{p.purchasePrice.toLocaleString()} DA</td>
                           <td className="px-6 py-4 text-right font-bold text-blue-600">{p.sellingPrice.toLocaleString()} DA</td>
                           <td className="px-6 py-4 text-right font-black text-slate-900">{(p.stockQuantity * p.sellingPrice).toLocaleString()} DA</td>
                           <td className="px-6 py-4 text-right font-bold text-emerald-600">
                              {((p.stockQuantity * p.sellingPrice) - (p.stockQuantity * p.purchasePrice)).toLocaleString()} DA
                           </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
               <div className="p-4 bg-slate-50 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Affichage limité aux 50 produits les plus valorisés</p>
               </div>
            </Card>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             <Card className="border-slate-200 overflow-hidden shadow-sm">
                <CardHeader className="bg-slate-900 py-3">
                   <CardTitle className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                     <TrendingUp size={16} /> Top 10 Produits (Ventes)
                   </CardTitle>
                </CardHeader>
                <div className="divide-y divide-slate-100">
                   {topProducts.map((p, i) => (
                     <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-4">
                           <span className="w-6 font-black text-slate-300">#0{i+1}</span>
                           <div>
                              <p className="text-sm font-black text-slate-800 leading-tight">{p.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{p.soldQty} unités vendues</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-sm font-black text-blue-600">{p.revenue.toLocaleString()} DA</p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase">Revenu</p>
                        </div>
                     </div>
                   ))}
                </div>
             </Card>

             <Card className="border-slate-200 overflow-hidden shadow-sm">
                <CardHeader className="bg-blue-600 py-3">
                   <CardTitle className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                     <User size={16} /> Meilleurs Clients
                   </CardTitle>
                </CardHeader>
                <div className="divide-y divide-slate-100">
                   {topCustomers.map((c, i) => (
                     <div key={c.id} className="p-4 flex items-center justify-between hover:bg-blue-50/50">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                              <User size={20} />
                           </div>
                           <div>
                              <p className="text-sm font-black text-slate-800 leading-tight">{c.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{c.count} commandes</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-sm font-black text-slate-900">{(c.totalPurchase || 0).toLocaleString()} DA</p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase">Dépense Totale</p>
                        </div>
                     </div>
                   ))}
                   {topCustomers.length === 0 && (
                     <div className="p-8 text-center text-slate-400 italic text-xs">
                        Aucune donnée client disponible.
                     </div>
                   )}
                </div>
             </Card>
          </div>
        )}

        {activeTab === 'movements' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
               <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Mouvements de Stock Récents</h3>
               <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-500">200 derniers mouvements</span>
            </div>
            
            <Card className="border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-widest">
                    <tr>
                      <th className="px-6 py-3 font-black">Date & Heure</th>
                      <th className="px-6 py-3 font-black">Type</th>
                      <th className="px-6 py-3 font-black">Produit</th>
                      <th className="px-6 py-3 font-black text-center">Quantité</th>
                      <th className="px-6 py-3 font-black text-center">Avant / Après</th>
                      <th className="px-6 py-3 font-black text-right">Utilisateur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {movements.map((m) => (
                      <tr key={m.id} className="hover:bg-blue-50 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-500 group-hover:text-blue-600 transition-colors">
                          {m.createdAt ? format((m.createdAt as any).toDate ? (m.createdAt as any).toDate() : new Date(), 'dd/MM/yy HH:mm') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                            m.type === 'in' || m.type === 'initial' || m.type === 'adjustment_in' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          )}>
                            {m.type === 'in' ? 'Entrée' : 
                             m.type === 'sale' ? 'Vente' : 
                             m.type === 'initial' ? 'Initial' : 
                             m.type === 'adjustment_in' ? 'Ajust. +' : 'Ajust. -'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-black text-slate-800">
                          {m.productName}
                          {m.batchNumber && <span className="block text-[8px] text-blue-500 font-mono mt-0.5">Lot: {m.batchNumber}</span>}
                        </td>
                        <td className="px-6 py-4 text-center font-black text-base">
                          {m.type === 'in' || m.type === 'initial' || m.type === 'adjustment_in' ? '+' : '-'}{m.quantity}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-400">
                          {m.previousStock} <ChevronRight size={10} className="inline mx-1" /> {m.newStock}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-slate-500 italic">
                          {m.userName || 'Système'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'traceability' && (
          <div className="space-y-6">
            <Card className="bg-slate-900 p-8 shadow-2xl border-none">
                <div className="max-w-2xl mx-auto text-center space-y-4">
                   <ShieldCheck className="mx-auto text-blue-400" size={48} />
                   <div>
                      <h2 className="text-xl font-black text-white uppercase tracking-tight">Outil de Traçabilité Avancée</h2>
                      <p className="text-slate-400 text-xs">Recherchez un numéro de lot, un produit ou un utilisateur pour suivre l'historique complet.</p>
                   </div>
                   
                   <div className="relative mt-6">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                      <input 
                        type="text" 
                        placeholder="Saisissez un N° de Lot, Batch ou Nom de produit..."
                        value={traceSearch}
                        onChange={(e) => setTraceSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTraceSearch()}
                        className="w-full pl-12 pr-24 py-4 bg-white/10 border border-white/20 rounded-2xl outline-none text-white focus:ring-2 focus:ring-blue-500 font-bold transition-all"
                      />
                      <button 
                        onClick={handleTraceSearch}
                        className="absolute right-2 top-2 bottom-2 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-colors"
                      >
                        Scanner
                      </button>
                   </div>
                </div>
            </Card>

            {traceResults.length > 0 && (
              <div className="space-y-4">
                 <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-xs tracking-widest">
                    <History size={16} /> Résultats de l'enquête ({traceResults.length})
                 </div>
                 <div className="grid grid-cols-1 gap-4">
                    {traceResults.map(res => (
                      <div key={res.id} className="bg-white border-2 border-slate-100 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 group hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-4">
                           <div className={cn(
                             "w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl",
                             res.type === 'in' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                           )}>
                             {res.type === 'in' ? '+' : '-'}
                           </div>
                           <div>
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                {res.createdAt ? format((res.createdAt as any).toDate ? (res.createdAt as any).toDate() : new Date(), 'dd MMMM yyyy HH:mm', { locale: fr }) : '-'}
                              </p>
                              <h4 className="text-lg font-black text-slate-900 leading-tight">{res.productName}</h4>
                              <div className="flex gap-4 mt-1">
                                 <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 rounded uppercase">Lot: {res.batchNumber || 'N/A'}</span>
                                 <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 rounded uppercase">Op: {res.userName}</span>
                              </div>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-xs font-bold text-slate-400 uppercase mb-1">Mouvement</p>
                           <p className={cn(
                             "text-2xl font-black",
                             res.type === 'in' ? "text-emerald-600" : "text-rose-600"
                           )}>
                             {res.quantity} {res.unit || 'u'}
                           </p>
                           <p className="text-[10px] font-black text-slate-400 uppercase">{res.reason}</p>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
            )}

            {traceSearch.length > 0 && traceResults.length === 0 && (
              <div className="py-20 text-center space-y-4">
                 <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                    <Search size={32} />
                 </div>
                 <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Aucune correspondance trouvée pour "{traceSearch}"</p>
                 <p className="text-[10px] text-slate-300">Assurez-vous que le lot ou le nom du produit est correctement saisi.</p>
              </div>
            )}

            {!traceSearch && (
              <div className="py-20 text-center space-y-12">
                 <div className="max-w-md mx-auto grid grid-cols-2 gap-8 opacity-20 filter grayscale">
                    <div className="space-y-2">
                       <ShieldCheck className="mx-auto" size={32} />
                       <div className="h-2 bg-slate-200 rounded-full w-24 mx-auto" />
                       <div className="h-2 bg-slate-100 rounded-full w-16 mx-auto" />
                    </div>
                    <div className="space-y-2">
                       <ExternalLink className="mx-auto" size={32} />
                       <div className="h-2 bg-slate-200 rounded-full w-24 mx-auto" />
                       <div className="h-2 bg-slate-100 rounded-full w-16 mx-auto" />
                    </div>
                 </div>
                 <p className="text-slate-300 text-xs font-black uppercase tracking-[0.3em]">En attente de saisie...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


