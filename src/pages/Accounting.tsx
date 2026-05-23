import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  doc, 
  addDoc,
  limit,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { dbService } from '../firebase/db';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { formatCurrency } from '../lib/utils';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  Scale, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Search, 
  Calendar, 
  FileText, 
  Receipt, 
  Download, 
  Printer, 
  Trash2, 
  Edit, 
  Share2, 
  ShieldAlert, 
  FileSpreadsheet, 
  RefreshCw, 
  Layers, 
  Filter, 
  BookOpen, 
  Check, 
  Clock, 
  User, 
  DollarSign,
  Briefcase,
  AlertTriangle
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  BarChart, 
  Bar 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { pdfService } from '../services/pdfService';
import { excelService } from '../services/excelService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../components/ui/Modal';
import { Button } from '../components/ui/Button';

// Expense and Revenue Interfaces
interface Revenue {
  id: string;
  category: string;
  reason: string;
  amount: number;
  userId: string;
  userName?: string;
  date?: any;
  createdAt?: any;
}

interface Expense {
  id: string;
  category: string;
  reason: string;
  amount: number;
  userId: string;
  userName?: string;
  date?: any;
  createdAt?: any;
}

interface DeletionLog {
  id: string;
  type: string;
  details: string;
  userId: string;
  userName: string;
  timestamp: any;
  amount?: number;
  category?: string;
}

export default function Accounting() {
  const { showToast } = useNotification();
  const { user, userData, isAdmin, isSuperAdmin, hasPermission } = useAuth();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'revenues' | 'expenses' | 'invoices' | 'reports' | 'logs'>('dashboard');

  // Firebase Real-time State
  const [sales, setSales] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [deletionLogs, setDeletionLogs] = useState<DeletionLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & State Query
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modals state
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  // CRUD references
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'revenue' | 'expense' | 'invoice'; label: string; amount?: number; category?: string } | null>(null);

  // Form states
  const [amountValue, setAmountValue] = useState('');
  const [reasonValue, setReasonValue] = useState('');
  const [categoryValue, setCategoryValue] = useState('');
  const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Invoice creation state
  const [invoiceCustomer, setInvoiceCustomer] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<{ name: string; quantity: number; price: number }[]>([{ name: '', quantity: 1, price: 0 }]);
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Predefined Categories
  const revenueCategories = ['Prestation de service', 'Contrat Chantiers', 'Sous-traitance', 'Avis conseil', 'Vente exceptionnelle', 'Autre'];
  const expenseCategories = ['Matériaux & Fournitures', 'Salaires & Primes', 'Loyer & Charges', 'Carburant & Déplacement', 'Communication', 'Repas & Réception', 'Divers'];

  const showDeletionTab = isAdmin || isSuperAdmin;
  const canDelete = isAdmin || isSuperAdmin;

  // Real-time listener for Sales, Invoices, Expenses, Revenues, Deletion Logs
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const qSales = query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(300));
    const qInvoices = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(300));
    const qExpenses = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(300));
    const qRevenues = query(collection(db, 'revenues'), orderBy('createdAt', 'desc'), limit(300));
    const qLogs = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(300));

    const unsubscribeSales = onSnapshot(qSales, (snap) => {
      setSales(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeInvoices = onSnapshot(qInvoices, (snap) => {
      setInvoices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeExpenses = onSnapshot(qExpenses, (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Expense[]);
    });

    const unsubscribeRevenues = onSnapshot(qRevenues, (snap) => {
      setRevenues(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Revenue[]);
    });

    const unsubscribeLogs = onSnapshot(qLogs, (snap) => {
      const logsDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      // Filter logs for deletion types
      const filteredLogs = logsDocs.filter(l => l.type === 'deletion' || l.details?.toLowerCase().includes('supprimé') || l.details?.toLowerCase().includes('suppression'));
      setDeletionLogs(filteredLogs);
      setLoading(false);
    });

    return () => {
      unsubscribeSales();
      unsubscribeInvoices();
      unsubscribeExpenses();
      unsubscribeRevenues();
      unsubscribeLogs();
    };
  }, [user]);

  // Convert Firestore Timestamp / raw date to Date Object
  const toDateObj = (dateField: any): Date => {
    if (!dateField) return new Date();
    if (dateField.toDate && typeof dateField.toDate === 'function') {
      return dateField.toDate();
    }
    if (dateField.seconds) {
      return new Date(dateField.seconds * 1000);
    }
    return new Date(dateField);
  };

  // Check if item lies in selected range
  const matchesPeriod = (date: Date): boolean => {
    const today = new Date();
    if (periodFilter === 'all') return true;
    
    if (periodFilter === 'today') {
      return isWithinInterval(date, { start: startOfDay(today), end: endOfDay(today) });
    }
    if (periodFilter === 'week') {
      return isWithinInterval(date, { start: startOfWeek(today), end: endOfWeek(today) });
    }
    if (periodFilter === 'month') {
      return isWithinInterval(date, { start: startOfMonth(today), end: endOfMonth(today) });
    }
    if (periodFilter === 'year') {
      return isWithinInterval(date, { start: startOfYear(today), end: endOfYear(today) });
    }
    if (periodFilter === 'custom') {
      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));
      return isWithinInterval(date, { start, end });
    }
    return true;
  };

  // 1. Dashboard calculations
  // Direct POS sales count as revenue
  const directSalesRevenue = sales
    .filter(s => s.status !== 'returned' && s.status !== 'refunded')
    .map(s => ({ id: s.id, amount: s.totalAmount || 0, date: toDateObj(s.createdAt), type: 'Vente direct POS', label: 'Vente de produits' }));

  // Paid Invoices count as revenue or raw revenue depending on their amountPaid
  const invoicesRevenue = invoices
    .filter(i => i.status !== 'cancelled' && (i.amountPaid || i.receivedAmount))
    .map(i => ({ id: i.id, amount: i.amountPaid || i.receivedAmount || 0, date: toDateObj(i.createdAt), type: 'Facture Client', label: `Facture N° ${i.invoiceNumber}` }));

  // Manual accounting revenues
  const manualRevenuesParsed = revenues.map(r => ({ id: r.id, amount: r.amount, date: toDateObj(r.createdAt), type: r.category, label: r.reason }));

  // Aggregate all revenues
  const allRevenues = [...directSalesRevenue, ...invoicesRevenue, ...manualRevenuesParsed];

  // Aggregate all expenses (including manual ones)
  const allExpenses = expenses.map(e => ({ id: e.id, amount: e.amount, date: toDateObj(e.createdAt), type: e.category, label: e.reason }));

  // Filter based on selected period
  const activeRevenues = allRevenues.filter(r => matchesPeriod(r.date));
  const activeExpenses = allExpenses.filter(e => matchesPeriod(e.date));

  // Totals
  const totalCA = activeRevenues.reduce((sum, item) => sum + item.amount, 0);
  const totalExpensesSum = activeExpenses.reduce((sum, item) => sum + item.amount, 0);
  const netProfit = totalCA - totalExpensesSum;
  
  // Solde actuel (Total all-time revenues minus all-time expenses)
  const allTimeRevenuesSum = allRevenues.reduce((sum, r) => sum + r.amount, 0);
  const allTimeExpensesSum = allExpenses.reduce((sum, e) => sum + e.amount, 0);
  const currentBalance = allTimeRevenuesSum - allTimeExpensesSum;

  // Chart Data Generation (Grouping by day for last 7 days/30 days or month depending on range)
  const generateChartData = () => {
    // Let's group by date over the filtered values or past 10 days
    const grouped: { [key: string]: { date: string, revenus: number, depenses: number } } = {};
    
    // Default range for visual chart: either today/week/month/year
    const itemsCount = periodFilter === 'year' ? 12 : 10;
    
    if (periodFilter === 'year') {
      // Group by month
      const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
      months.forEach((m, idx) => {
        grouped[idx] = { date: m, revenus: 0, depenses: 0 };
      });
      activeRevenues.forEach(r => {
        const mIdx = r.date.getMonth();
        if (grouped[mIdx]) grouped[mIdx].revenus += r.amount;
      });
      activeExpenses.forEach(e => {
        const mIdx = e.date.getMonth();
        if (grouped[mIdx]) grouped[mIdx].depenses += e.amount;
      });
      return Object.values(grouped);
    } else {
      // Group by Day (YYYY-MM-DD or simple string)
      // Take the past 10 distinct days or the period's days
      const daysList: string[] = [];
      const now = new Date();
      for (let i = itemsCount - 1; i >= 0; i--) {
        const d = subDays(now, i);
        const dayStr = format(d, 'yyyy-MM-dd');
        const displayStr = format(d, 'dd MMM', { locale: fr });
        daysList.push(dayStr);
        grouped[dayStr] = { date: displayStr, revenus: 0, depenses: 0 };
      }

      activeRevenues.forEach(r => {
        const dayStr = format(r.date, 'yyyy-MM-dd');
        if (grouped[dayStr]) {
          grouped[dayStr].revenus += r.amount;
        }
      });

      activeExpenses.forEach(e => {
        const dayStr = format(e.date, 'yyyy-MM-dd');
        if (grouped[dayStr]) {
          grouped[dayStr].depenses += e.amount;
        }
      });

      return daysList.map(dKey => grouped[dKey]);
    }
  };

  const chartData = generateChartData();

  // Create or update manual Revenue
  const handleSaveRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountValue || !reasonValue || !categoryValue) {
      showToast('Veuillez remplir tous les champs requis', 'error');
      return;
    }

    try {
      const parsedAmount = parseFloat(amountValue);
      const revenueData = {
        category: categoryValue,
        reason: reasonValue,
        amount: parsedAmount,
        userId: user?.uid || 'unknown',
        userName: userData?.displayName || user?.displayName || 'Admin',
        createdAt: new Date(customDate),
      };

      if (editingItem) {
        await dbService.updateDocument('revenues', editingItem.id, revenueData);
        showToast('Revenue modifié avec succès', 'success');
      } else {
        await dbService.addDocument('revenues', revenueData);
        showToast('Nouveau revenu enregistré', 'success');
      }

      // Reset form
      setIsRevenueModalOpen(false);
      setEditingItem(null);
      setAmountValue('');
      setReasonValue('');
      setCategoryValue('');
    } catch (err) {
      showToast('Erreur durant la transaction', 'error');
    }
  };

  // Create or update manual Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountValue || !reasonValue || !categoryValue) {
      showToast('Veuillez remplir tous les champs requis', 'error');
      return;
    }

    try {
      const parsedAmount = parseFloat(amountValue);
      const expenseData = {
        category: categoryValue,
        reason: reasonValue,
        amount: parsedAmount,
        userId: user?.uid || 'unknown',
        userName: userData?.displayName || user?.displayName || 'Admin',
        createdAt: new Date(customDate),
      };

      if (editingItem) {
        await dbService.updateDocument('expenses', editingItem.id, expenseData);
        showToast('Dépense modifiée avec succès', 'success');
      } else {
        await dbService.addDocument('expenses', expenseData);
        showToast('Nouvelle dépense enregistrée', 'success');
      }

      // Reset form
      setIsExpenseModalOpen(false);
      setEditingItem(null);
      setAmountValue('');
      setReasonValue('');
      setCategoryValue('');
    } catch (err) {
      showToast("Erreur durant l'enregistrement", 'error');
    }
  };

  // Initiate confirmation modal for deletion
  const triggerDelete = (id: string, type: 'revenue' | 'expense' | 'invoice', label: string, amount: number, category: string) => {
    if (!canDelete) {
      showToast("Action refusée : Seuls les administrateurs ont l'autorisation de supprimer des documents.", 'error');
      return;
    }
    setItemToDelete({ id, type, label, amount, category });
    setIsDeleteConfirmOpen(true);
  };

  // Confirm delete transaction
  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const table = itemToDelete.type === 'revenue' ? 'revenues' : (itemToDelete.type === 'expense' ? 'expenses' : 'invoices');
      await dbService.deleteDocument(table, itemToDelete.id);

      // Write deletion activity to system logs
      await dbService.addDocument('system_logs', {
        type: 'deletion',
        details: `Suppression définitive d'un élément comptable (${itemToDelete.type === 'revenue' ? 'Revenu' : 'Dépense'} : ${itemToDelete.label}) d'un montant de ${formatCurrency(itemToDelete.amount || 0)} DA enregistré dans ${itemToDelete.category || 'Général'}.`,
        userId: user?.uid || 'unknown',
        userName: userData?.displayName || user?.displayName || 'Admin',
        timestamp: new Date()
      });

      showToast(`${itemToDelete.type === 'revenue' ? 'Revenu' : 'Dépense'} supprimé et action logguée.`, 'success');
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
    } catch (err) {
      showToast('Une erreur est survenue lors de la suppression', 'error');
    }
  };

  // Quick automated creation of Invoices
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceCustomer) {
      showToast('Veuillez spécifier le nom du client', 'error');
      return;
    }

    try {
      // Calculate subtotals
      const subtotal = invoiceItems.reduce((acc, current) => acc + (current.quantity * current.price), 0);
      const taxRate = 0.19; // standard ALgerian TVA
      const taxAmount = subtotal * taxRate;
      const totalAmount = subtotal + taxAmount;

      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const randomInvoiceNumber = `FACT-${format(new Date(), 'yyMM')}-${randomNum}`;

      const newInvoice = {
        invoiceNumber: randomInvoiceNumber,
        customerName: invoiceCustomer,
        items: invoiceItems.map((item, idx) => ({
          id: String(idx + 1),
          name: item.name || 'Prestation/Article',
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price
        })),
        subtotal,
        taxAmount,
        taxRate,
        discount: 0,
        totalAmount,
        amountPaid: totalAmount,
        status: 'validated',
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        notes: invoiceNotes,
        userId: user?.uid || 'unknown',
        userName: userData?.displayName || user?.displayName || 'Admin',
        createdAt: new Date(),
      };

      await dbService.addDocument('invoices', newInvoice);
      showToast(`Facture ${randomInvoiceNumber} générée avec succès !`, 'success');
      setIsInvoiceModalOpen(false);
      setInvoiceCustomer('');
      setInvoiceItems([{ name: '', quantity: 1, price: 0 }]);
      setInvoiceNotes('');
    } catch (err) {
      showToast('Impossible de générer le document de facturation', 'error');
    }
  };

  // Add Item Line to Invoice Form
  const addInvoiceItemLine = () => {
    setInvoiceItems([...invoiceItems, { name: '', quantity: 1, price: 0 }]);
  };

  // Export Financial PDF Report
  const handleExportPDFReport = () => {
    const docPdf = new jsPDF();
    const formattedPeriod = periodFilter === 'all' ? 'Indéterminée (Toutes les dates)' : format(new Date(), 'dd MMMM yyyy', { locale: fr });

    // Page 1: Bilan Financier & Graphiques de Flux
    // Draw Header Card with Astra deep blue theme
    docPdf.setFillColor(2, 116, 190); // Astra Blue (#0274be)
    docPdf.rect(0, 0, 210, 36, 'F');
    
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(18);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text('RAPPORT FINANCIER CONSOLIDE & RATIOS', 15, 22);
    docPdf.setFontSize(9);
    docPdf.setTextColor(220, 235, 255);
    docPdf.text(`Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Période: ${periodFilter.toUpperCase()}`, 15, 29);

    // Section 1: Synthèse Comptable
    docPdf.setTextColor(25, 30, 35);
    docPdf.setFontSize(11);
    docPdf.text('1. RAPPORT GENERAL D\'ACTIVITE', 15, 48);

    autoTable(docPdf, {
      startY: 51,
      head: [['Indicateur clé', 'Valeur (DA)', 'Interprétation comptable']],
      body: [
        ['Chiffre d\'Affaires Global', `${formatCurrency(totalCA)} DA`, 'Ventes Directes POS + Factures validées + Revenus Complémentaires'],
        ['Total des Charges actives', `${formatCurrency(totalExpensesSum)} DA`, 'Ensemble des décaissements généraux (salaires, équipement, loyer)'],
        ['Bénéfice Opérationnel Net', `${formatCurrency(netProfit)} DA`, netProfit >= 0 ? 'Activité Rentable (Excédent)' : 'Activité Déficitaire (Déficit général)'],
        ['Balance de Trésorerie Actuelle', `${formatCurrency(currentBalance)} DA`, 'Fonds réels cumulés all-time disponibles sur la plateforme']
      ],
      headStyles: { fillColor: [2, 116, 190] }, // Astra code
      theme: 'grid',
      styles: { fontSize: 8.5, fontStyle: 'bold' }
    });

    let currentY = (docPdf as any).lastAutoTable.finalY + 10;

    // Section 2: Analyse de Marge & Performance Ratios
    docPdf.setTextColor(25, 30, 35);
    docPdf.setFontSize(11);
    docPdf.text('2. RATIOS DE MARGE ET D\'EXPLOITATION', 15, currentY);

    const netMargin = totalCA > 0 ? (netProfit / totalCA) * 100 : 0;
    const expenseRatio = totalCA > 0 ? (totalExpensesSum / totalCA) * 100 : 0;
    const investmentMultiplier = totalExpensesSum > 0 ? (totalCA / totalExpensesSum) : 0;

    autoTable(docPdf, {
      startY: currentY + 3,
      head: [['Nom du Ratio', 'Taux (%) / Multiplicateur', 'Observation administrative']],
      body: [
        [
          'Marge Bénéficiaire Nette', 
          `${netMargin.toFixed(2)} %`, 
          netMargin > 40 ? 'Rentabilité très élevée.' : (netMargin > 15 ? 'Rentabilité saine & stable.' : 'A surveiller d\'urgence.')
        ],
        [
          'Taux d\'Absorption des Charges', 
          `${expenseRatio.toFixed(2)} %`, 
          'Pourcentage du CA consommé directement par les charges structurelles.'
        ],
        [
          'Indice de Rentabilité Globale (ROI)', 
          `${investmentMultiplier.toFixed(2)}x`, 
          investmentMultiplier >= 1.5 ? 'Excellent ratio de rentabilité des investissements.' : 'Performance d\'utilisation du capital moyenne.'
        ]
      ],
      headStyles: { fillColor: [71, 85, 105] },
      theme: 'grid',
      styles: { fontSize: 8.5 }
    });

    currentY = (docPdf as any).lastAutoTable.finalY + 10;

    // Section 3: Visual Bar Chart inside PDF
    docPdf.setTextColor(25, 30, 35);
    docPdf.setFontSize(11);
    docPdf.text('3. ANALYSE GRAPHIQUE CHRONOLOGIQUE REVENUS VS DEPENSES', 15, currentY);

    // Draw the chart container box
    docPdf.setFillColor(245, 247, 250);
    docPdf.rect(15, currentY + 4, 180, 52, 'F');

    // Draw border
    docPdf.setDrawColor(220, 225, 230);
    docPdf.setLineWidth(0.4);
    docPdf.rect(15, currentY + 4, 180, 52);

    // Grid coordinates
    const chartBaseY = currentY + 48;
    
    // Axes lines
    docPdf.setDrawColor(180, 190, 200);
    docPdf.line(26, currentY + 7, 26, chartBaseY); // Vertical Axis
    docPdf.line(26, chartBaseY, 190, chartBaseY); // Horizontal Axis

    // Soft backdrop lines for reference levels
    docPdf.setDrawColor(230, 235, 240);
    docPdf.line(26, currentY + 17, 190, currentY + 17);
    docPdf.line(26, currentY + 27, 190, currentY + 27);
    docPdf.line(26, currentY + 37, 190, currentY + 37);

    // Scale calculation
    const maxVal = Math.max(...chartData.map(d => Math.max(d.revenus, d.depenses)), 1000);

    // Add Legend inside PDF chart indicator
    docPdf.setFillColor(16, 185, 129); // emerald green
    docPdf.rect(125, currentY + 1.2, 3.5, 3.5, 'F');
    docPdf.setFontSize(7.5);
    docPdf.setTextColor(30, 41, 59);
    docPdf.text('Revenus', 130, currentY + 3.9);

    docPdf.setFillColor(244, 63, 94); // rose pink
    docPdf.rect(155, currentY + 1.2, 3.5, 3.5, 'F');
    docPdf.text('Dépenses', 160, currentY + 3.9);

    // Draw bars
    if (chartData && chartData.length > 0) {
      const barSpan = 155 / chartData.length;
      chartData.forEach((dayData, index) => {
        const xPos = 29 + index * barSpan;
        const revHeight = (dayData.revenus / maxVal) * 36; // max height 36mm
        const expHeight = (dayData.depenses / maxVal) * 36;

        // Draw Revenue bar
        if (revHeight > 0.5) {
          docPdf.setFillColor(16, 185, 129);
          docPdf.rect(xPos, chartBaseY - revHeight, barSpan * 0.35, revHeight, 'F');
        }

        // Draw Expense bar
        if (expHeight > 0.5) {
          docPdf.setFillColor(244, 63, 94);
          docPdf.rect(xPos + barSpan * 0.4, chartBaseY - expHeight, barSpan * 0.35, expHeight, 'F');
        }

        // Draw day text label
        docPdf.setFontSize(6.5);
        docPdf.setTextColor(100, 116, 139);
        docPdf.text(dayData.date, xPos + barSpan * 0.05, chartBaseY + 3.5);
      });
    }

    // Footnote page 1
    docPdf.setFontSize(7);
    docPdf.setTextColor(140, 150, 160);
    docPdf.text('Page 1 sur 2 - Rapport Financier Certifié par le système ERP Astra', 15, 287);

    // Page 2: Detailed Chronicle journal
    docPdf.addPage();
    docPdf.setFillColor(2, 116, 190); 
    docPdf.rect(0, 0, 210, 18, 'F');
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(10);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text('REGISTRE ANALYTIQUE DETAILLE DES FLUX DE TRESORERIE', 15, 12);

    docPdf.setTextColor(25, 30, 35);
    docPdf.setFontSize(11);
    docPdf.text('4. RELEVE EXHAUSTIF DES MUTATIONS BUDGETAIRES', 15, 30);

    const mappedFlows = [
      ...activeRevenues.map(r => [format(r.date, 'dd/MM/yyyy'), 'Entrée', r.type, r.label, `+${formatCurrency(r.amount)} DA`]),
      ...activeExpenses.map(e => [format(e.date, 'dd/MM/yyyy'), 'Sortie', e.type, e.label, `-${formatCurrency(e.amount)} DA`])
    ].sort((a, b) => new Date(b[0] || '').getTime() - new Date(a[0] || '').getTime());

    autoTable(docPdf, {
      startY: 35,
      head: [['Date', 'Sens de Flux', 'Type de Service / Rubrique', 'Libellé description', 'Montant comptabilisé']],
      body: mappedFlows.length > 0 ? mappedFlows : [['-', 'Aucun transfert enregistré', '-', '-', '0.00 DA']],
      headStyles: { fillColor: [2, 116, 190] },
      theme: 'striped',
      styles: { fontSize: 8 }
    });

    // Footnote page 2
    docPdf.setFontSize(7);
    docPdf.setTextColor(140, 150, 160);
    docPdf.text('Page 2 sur 2 - Document généré à usage interne uniquement.', 15, 287);

    docPdf.save(`Rapport_Financier_Complet_${periodFilter}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    showToast('Bilan Financier complet PDF téléchargé !', 'success');
  };

  // Export Financial Excel report
  const handleExportExcelReport = async () => {
    try {
      const rows = [
        ...activeRevenues.map(r => ({
          date: format(r.date, 'dd/MM/yyyy'),
          type: 'Entrée (Revenu)',
          category: r.type,
          label: r.label,
          amount: r.amount
        })),
        ...activeExpenses.map(e => ({
          date: format(e.date, 'dd/MM/yyyy'),
          type: 'Sortie (Dépense)',
          category: e.type,
          label: e.label,
          amount: e.amount
        }))
      ];

      await excelService.generateProfessionalReport({
        filename: `Comptabilite_${periodFilter}`,
        title: "Bilan des Flux de Comptabilité",
        subtitle: `Rapport généré automatiquement pour la période : ${periodFilter.toUpperCase()}`,
        columns: [
          { header: 'Date', key: 'date', width: 15 },
          { header: 'Type de Flux', key: 'type', width: 22 },
          { header: 'Catégorie', key: 'category', width: 25 },
          { header: 'Description / Motif', key: 'label', width: 35 },
          { header: 'Montant (DA)', key: 'amount', width: 18 }
        ],
        data: rows
      });

      showToast('Exportation Excel complétée !', 'success');
    } catch (err) {
      showToast('Une erreur est survenue lors de l\'exportation Excel', 'error');
    }
  };

  // Filter lists based on search and period
  const filteredRevenuesList = revenues
    .filter(r => matchesPeriod(toDateObj(r.createdAt || r.date)))
    .filter(r => 
      r.reason?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      r.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const filteredExpensesList = expenses
    .filter(e => matchesPeriod(toDateObj(e.createdAt || e.date)))
    .filter(e => 
      e.reason?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const filteredInvoicesList = invoices
    .filter(i => matchesPeriod(toDateObj(i.createdAt)))
    .filter(i => 
      i.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      i.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto bg-[#f6f8fb] min-h-screen">
      
      {/* Module Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-widest uppercase flex items-center gap-3">
            <Scale className="text-[#0274be] animate-pulse" size={32} /> COMPTABILITE GENERALE
          </h1>
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mt-1">
            Tableau de bord, registres financiers, facturation et balance de trésorerie en temps réel.
          </p>
        </div>
        
        {/* Real-time sync badge indicator */}
        <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest px-4 py-2 border border-emerald-500/20 rounded-xl">
          <RefreshCw size={12} className="animate-spin" /> SYNCHRONISATION TEMPS RÉEL
        </div>
      </div>

      {/* Global Quick Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Trésorerie Actuelle</span>
            <h3 className="text-2xl font-black font-mono mt-1 text-slate-900">{formatCurrency(currentBalance)} DA</h3>
            <span className="text-[9px] font-bold text-slate-500 mt-1 block uppercase">Solde all-time global</span>
          </div>
          <div className="p-3 bg-[#0274be]/10 text-[#0274be] rounded-xl">
            <Briefcase size={22} />
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Chiffre d'Affaires</span>
            <h3 className="text-2xl font-black font-mono mt-1 text-emerald-600">+{formatCurrency(totalCA)} DA</h3>
            <span className="text-[9px] font-bold text-slate-500 mt-1 block uppercase">Revenus de la période</span>
          </div>
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
            <TrendingUp size={22} />
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dépenses & Charges</span>
            <h3 className="text-2xl font-black font-mono mt-1 text-rose-600">-{formatCurrency(totalExpensesSum)} DA</h3>
            <span className="text-[9px] font-bold text-slate-500 mt-1 block uppercase">Total des frais du filtre</span>
          </div>
          <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
            <TrendingDown size={22} />
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between border-l-4 border-l-slate-700"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bénéfice Net</span>
            <h3 className={`text-2xl font-black font-mono mt-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)} DA
            </h3>
            <span className="text-[9px] font-bold text-slate-500 mt-1 block uppercase">Résultat intermédiaire</span>
          </div>
          <div className={`p-3 rounded-xl ${netProfit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
            <Scale size={20} />
          </div>
        </motion.div>
      </div>

      {/* Main Tab Controls & Quick Date filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center shadow-xs">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Layers },
            { id: 'revenues', label: 'Revenus', icon: TrendingUp },
            { id: 'expenses', label: 'Dépenses', icon: TrendingDown },
            { id: 'invoices', label: 'Factures', icon: FileText },
            { id: 'reports', label: 'Rapports', icon: BookOpen },
            ...(showDeletionTab ? [{ id: 'logs', label: 'Journal Sup.', icon: AlertTriangle }] : [])
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all text-xs font-black uppercase tracking-wider ${
                activeTab === tab.id 
                  ? 'bg-[#0274be] text-white shadow-xs' 
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <tab.icon size={14} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Global Period Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <Filter size={14} className="text-slate-400" />
          <select 
            value={periodFilter} 
            onChange={(e) => setPeriodFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 text-xs font-black uppercase tracking-widest px-3 py-2 rounded-xl text-slate-700 focus:outline-hidden"
          >
            <option value="all">SANS FILTRE DATE</option>
            <option value="today">AUJOURD'HUI</option>
            <option value="week">CETTE SEMAINE</option>
            <option value="month">CE MOIS</option>
            <option value="year">CETTE ANNEE</option>
            <option value="custom">PERIODE PERSONNALISEE</option>
          </select>

          {periodFilter === 'custom' && (
            <div className="flex items-center gap-2 mt-2 md:mt-0">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-black p-2 rounded-xl text-slate-700"
              />
              <span className="text-xs font-bold text-slate-400">à</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-black p-2 rounded-xl text-slate-700"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Module Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="min-h-[400px]"
        >
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Quick Report Download Banner */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-center gap-4 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0274be]/5 to-transparent pointer-events-none" />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-[#0274be]/10 text-[#0274be] flex items-center justify-center shrink-0">
                    <FileText size={22} className="animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      Rapport Comptable & Analyse des Marges
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">
                      Générez et téléchargez le rapport consolidé PDF incluant l'évaluation des flux et les ratios structurels de rentabilité
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={handleExportPDFReport}
                  className="bg-[#0274be] hover:bg-[#015a94] text-white text-xs font-black uppercase tracking-widest py-3 px-6 rounded-xl border border-[#0274be] flex items-center gap-2 shadow-xs transition-transform hover:-translate-y-0.5 relative z-10"
                >
                  <Download size={14} /> Exporter Rapport PDF Complet
                </Button>
              </div>

              {/* Graphic container */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Evolution de la Balance</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Distribution chronologique revenus vs dépenses</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 block" />
                      <span className="text-[10px] font-black uppercase text-slate-500">Revenus</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-rose-500 block" />
                      <span className="text-[10px] font-black uppercase text-slate-500">Dépenses</span>
                    </div>
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} style={{ fontSize: '10px', fontWeight: 'bold' }} />
                      <YAxis tickLine={false} style={{ fontSize: '10px', fontWeight: 'bold' }} />
                      <Tooltip formatter={(value) => `${formatCurrency(value as number)} DA`} />
                      <Area type="monotone" dataKey="revenus" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                      <Area type="monotone" dataKey="depenses" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grid of recent ledger actions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Micro-table: Recent Revenues */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <TrendingUp className="text-emerald-500" size={16} /> REVENUS LES PLUS RECENTS
                    </h3>
                    <button 
                      onClick={() => { setEditingItem(null); setIsRevenueModalOpen(true); }}
                      className="text-[10px] font-black text-[#0274be] uppercase tracking-wider flex items-center gap-1 hover:underline"
                    >
                      <Plus size={12} /> Nouveau Revenu
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[290px] overflow-y-auto custom-scrollbar">
                    {activeRevenues.slice(0, 5).map((rev, idx) => (
                      <div key={idx} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-extrabold text-slate-800 uppercase">{rev.label}</p>
                          <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{rev.type}</span>
                            <span>•</span>
                            <span>{format(rev.date, 'dd MMMM yyyy HH:mm', { locale: fr })}</span>
                          </div>
                        </div>
                        <span className="font-bold text-emerald-600 font-mono text-sm">+{formatCurrency(rev.amount)} DA</span>
                      </div>
                    ))}
                    {activeRevenues.length === 0 && (
                      <p className="py-8 text-center text-slate-400 font-bold uppercase text-[10px]">Aucune transaction enregistrée</p>
                    )}
                  </div>
                </div>

                {/* Micro-table: Recent Expenses */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <TrendingDown className="text-rose-500" size={16} /> CHARGES ET DEPENSES RECENTES
                    </h3>
                    <button 
                      onClick={() => { setEditingItem(null); setIsExpenseModalOpen(true); }}
                      className="text-[10px] font-black text-[#0274be] uppercase tracking-wider flex items-center gap-1 hover:underline"
                    >
                      <Plus size={12} /> Nouvelle Dépense
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[290px] overflow-y-auto custom-scrollbar">
                    {activeExpenses.slice(0, 5).map((exp, idx) => (
                      <div key={idx} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-extrabold text-slate-800 uppercase">{exp.label}</p>
                          <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                            <span className="bg-rose-50 px-1.5 py-0.5 rounded text-rose-600">{exp.type}</span>
                            <span>•</span>
                            <span>{format(exp.date, 'dd MMMM yyyy HH:mm', { locale: fr })}</span>
                          </div>
                        </div>
                        <span className="font-bold text-rose-600 font-mono text-sm">-{formatCurrency(exp.amount)} DA</span>
                      </div>
                    ))}
                    {activeExpenses.length === 0 && (
                      <p className="py-8 text-center text-slate-400 font-bold uppercase text-[10px]">Aucun décaissement repéré</p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: REVENUES */}
          {activeTab === 'revenues' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Rechercher par motif..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 text-xs font-bold text-slate-800"
                  />
                </div>
                <Button 
                  onClick={() => { setEditingItem(null); setIsRevenueModalOpen(true); }}
                  className="bg-[#0274be] hover:bg-[#015a94] text-white text-xs font-black uppercase tracking-widest py-2 rounded-xl border border-[#0274be]"
                >
                  <Plus size={16} className="mr-1" /> Ajouter un revenu
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-black">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-400 tracking-widest">
                      <th className="p-4 rounded-l-xl">Dénomination / Catégorie</th>
                      <th className="p-4">Motif</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Auteur</th>
                      <th className="p-4 text-right">Montant</th>
                      <th className="p-4 text-center rounded-r-xl">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredRevenuesList.map((rev) => {
                      const finalDate = toDateObj(rev.createdAt || rev.date);
                      return (
                        <tr key={rev.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <span className="bg-emerald-50/80 text-emerald-800 text-[9px] uppercase font-black px-2 py-1 rounded-sm border border-emerald-200/50">
                              {rev.category}
                            </span>
                          </td>
                          <td className="p-4 uppercase text-slate-600 font-bold">{rev.reason}</td>
                          <td className="p-4 text-slate-500 font-bold">{format(finalDate, 'dd/MM/yyyy HH:mm')}</td>
                          <td className="p-4 text-slate-500 font-medium">
                            <span className="inline-flex items-center gap-1"><User size={12} /> {rev.userName || 'Admin'}</span>
                          </td>
                          <td className="p-4 text-right font-bold text-emerald-600 text-sm font-mono">{formatCurrency(rev.amount)} DA</td>
                          <td className="p-4 flex gap-1 justify-center">
                            <button
                              onClick={() => {
                                setEditingItem(rev);
                                setAmountValue(String(rev.amount));
                                setReasonValue(rev.reason);
                                setCategoryValue(rev.category);
                                setCustomDate(format(finalDate, 'yyyy-MM-dd'));
                                setIsRevenueModalOpen(true);
                              }}
                              className="p-2 border border-slate-200 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Edit size={14} />
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => triggerDelete(rev.id, 'revenue', rev.reason, rev.amount, rev.category)}
                                className="p-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRevenuesList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 font-semibold uppercase tracking-widest text-[10px]">
                          Aucun revenu ne correspond aux paramètres de recherche
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: EXPENSES */}
          {activeTab === 'expenses' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Rechercher par motif ou catégorie..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 text-xs font-bold text-slate-800"
                  />
                </div>
                <Button 
                  onClick={() => { setEditingItem(null); setIsExpenseModalOpen(true); }}
                  className="bg-[#0274be] hover:bg-[#015a94] text-white text-xs font-black uppercase tracking-widest py-2 rounded-xl border border-[#0274be]"
                >
                  <Plus size={16} className="mr-1" /> Ajouter une dépense
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-black">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-400 tracking-widest">
                      <th className="p-4 rounded-l-xl">Désignation / Rubrique</th>
                      <th className="p-4">Motif décaissement</th>
                      <th className="p-4">Date de saisie</th>
                      <th className="p-4">Manager responsable</th>
                      <th className="p-4 text-right">Montant</th>
                      <th className="p-4 text-center rounded-r-xl">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredExpensesList.map((exp) => {
                      const finalDate = toDateObj(exp.createdAt || exp.date);
                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <span className="bg-rose-50 text-rose-800 text-[9px] uppercase font-black px-2 py-1 rounded-sm border border-rose-200/50">
                              {exp.category}
                            </span>
                          </td>
                          <td className="p-4 uppercase text-slate-600 font-bold">{exp.reason}</td>
                          <td className="p-4 text-slate-500 font-bold">{format(finalDate, 'dd/MM/yyyy HH:mm')}</td>
                          <td className="p-4 text-slate-500 font-medium">
                            <span className="inline-flex items-center gap-1"><User size={12} /> {exp.userName || 'Admin'}</span>
                          </td>
                          <td className="p-4 text-right font-bold text-rose-600 text-sm font-mono">-{formatCurrency(exp.amount)} DA</td>
                          <td className="p-4 flex gap-1 justify-center">
                            <button
                              onClick={() => {
                                setEditingItem(exp);
                                setAmountValue(String(exp.amount));
                                setReasonValue(exp.reason);
                                setCategoryValue(exp.category);
                                setCustomDate(format(finalDate, 'yyyy-MM-dd'));
                                setIsExpenseModalOpen(true);
                              }}
                              className="p-2 border border-slate-200 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Edit size={14} />
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => triggerDelete(exp.id, 'expense', exp.reason, exp.amount, exp.category)}
                                className="p-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredExpensesList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 font-semibold uppercase tracking-widest text-[10px]">
                          Aucun décaissement ne correspond au filtre
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: INVOICES */}
          {activeTab === 'invoices' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Chercher client ou N° facture..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 text-xs font-bold text-slate-800"
                  />
                </div>
                <Button 
                  onClick={() => setIsInvoiceModalOpen(true)}
                  className="bg-[#0274be] hover:bg-[#015a94] text-white text-xs font-black uppercase tracking-widest py-2 rounded-xl border border-[#0274be]"
                >
                  <Plus size={16} className="mr-1" /> Générer Facture
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-black">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-400 tracking-widest">
                      <th className="p-4 rounded-l-xl">Numéro</th>
                      <th className="p-4">Dénomination Client</th>
                      <th className="p-4">Règlement</th>
                      <th className="p-4">Statut</th>
                      <th className="p-4 text-right">Montant Total</th>
                      <th className="p-4 text-center rounded-r-xl">Services PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredInvoicesList.map((inv) => {
                      const finalDate = toDateObj(inv.createdAt);
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 font-extrabold text-[#0274be]">{inv.invoiceNumber}</td>
                          <td className="p-4 uppercase font-bold text-slate-700">{inv.customerName || 'Client standard'}</td>
                          <td className="p-4">
                            <span className="bg-slate-100 text-slate-600 text-[9.5px] font-black uppercase px-2 py-0.5 rounded">
                              {inv.paymentMethod || 'Espèces'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`text-[8.5px] font-black uppercase px-2 py-1 rounded border ${
                              inv.status === 'validated' || inv.status === 'paid' 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                              {inv.status || 'Validé'}
                            </span>
                          </td>
                          <td className="p-4 text-right font-black text-slate-900 text-sm font-mono">{formatCurrency(inv.totalAmount)} DA</td>
                          <td className="p-4 flex gap-1 justify-center">
                            <button
                              onClick={() => {
                                pdfService.generateInvoice({
                                  ...inv,
                                  date: finalDate,
                                  items: inv.items.map((i: any) => ({ name: i.name, quantity: i.quantity, price: i.price, total: i.total }))
                                });
                                showToast('PDF téléchargé', 'success');
                              }}
                              className="p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1 text-[10px] font-bold uppercase transition-all"
                              title="Imprimer / Télécharger"
                            >
                              <Download size={14} /> ID
                            </button>
                            
                            {/* Send options: WhatsApp or Email */}
                            <a 
                              href={`https://api.whatsapp.com/send?phone=${inv.customerPhone || ''}&text=Bonjour, voici votre facture N° ${inv.invoiceNumber} d'un montant de ${formatCurrency(inv.totalAmount)} DA.`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 border border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-1"
                              title="Partager sur WhatsApp"
                            >
                              <Share2 size={14} />
                            </a>
                            {canDelete && (
                              <button
                                onClick={() => triggerDelete(inv.id, 'invoice', inv.invoiceNumber, inv.totalAmount, 'Factures')}
                                className="p-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg"
                                title="Supprimer"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredInvoicesList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 font-semibold uppercase tracking-widest text-[10px]">
                          Aucun document de facturation à afficher
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: REPORTS */}
          {activeTab === 'reports' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
              <div className="mb-6">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Exportation de Rapports de Synthèse</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Téléchargez l'intégralité du bilan financier au format standard PDF ou XLSX (Excel)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* PDF generation box */}
                <div className="border border-slate-150 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-300 transition-colors bg-slate-50/50">
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center mb-4">
                      <FileText size={24} />
                    </div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Compte Rendu Bilan PDF</h4>
                    <p className="text-xs text-slate-500 mt-1">Génère un document PDF complet contenant le total de la balance générale, de la trésorerie et la table analytique des flux d'entrées et de sorties d'argent.</p>
                  </div>
                  <Button 
                    onClick={handleExportPDFReport}
                    className="bg-slate-800 hover:bg-slate-900 uppercase font-black tracking-widest text-xs py-3 rounded-xl mt-6 flex items-center justify-center gap-2"
                  >
                    <Download size={16} /> Exporter Rapport PDF
                  </Button>
                </div>

                {/* Excel generation box */}
                <div className="border border-slate-150 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-300 transition-colors bg-emerald-50/20">
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-4">
                      <FileSpreadsheet size={24} />
                    </div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Bilan XLSX (Microsoft Excel)</h4>
                    <p className="text-xs text-slate-500 mt-1">Préparez un classeur structuré pour votre comptable comprenant l'intégralité des transactions, des catégories et des calculs financiers automatisés.</p>
                  </div>
                  <Button 
                    onClick={handleExportExcelReport}
                    className="bg-emerald-600 hover:bg-emerald-700 uppercase font-black tracking-widest text-xs py-3 rounded-xl mt-6 flex items-center justify-center gap-2 border border-emerald-600/10"
                  >
                    <FileSpreadsheet size={16} /> Générer Classeur Excel
                  </Button>
                </div>

              </div>
            </div>
          )}

          {/* TAB 6: SYSTEM LOGS OF DELETIONS */}
          {activeTab === 'logs' && showDeletionTab && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
              <div className="mb-6 flex items-center gap-3">
                <AlertTriangle className="text-amber-500" size={24} />
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Journal d'Audit des Suppressions</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Registre de sécurité inaltérable listant les actions de purge de base de données à des fins fiscales ou réglementaires</p>
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto custom-scrollbar">
                {deletionLogs.map((log) => {
                  const logDate = toDateObj(log.timestamp);
                  return (
                    <div key={log.id} className="py-4 flex gap-4 text-xs">
                      <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl h-fit">
                        <Trash2 size={16} />
                      </div>
                      <div className="flex-1">
                        <p className="font-extrabold text-slate-800 uppercase">{log.details}</p>
                        <div className="flex items-center gap-2 text-[9.5px] font-black text-slate-400 uppercase mt-1">
                          <span className="flex items-center gap-1"><User size={10} /> {log.userName || 'Admin'}</span>
                          <span>•</span>
                          <span><Clock size={10} /> {format(logDate, 'dd MMMM yyyy HH:mm:ss', { locale: fr })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {deletionLogs.length === 0 && (
                  <p className="py-12 text-center text-slate-400 font-bold uppercase text-[11px] tracking-widest">Aucun purge comptable consignée dans l'historique</p>
                )}
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* REVENUE MODAL */}
      <Modal isOpen={isRevenueModalOpen} onClose={() => setIsRevenueModalOpen(false)} title={editingItem ? 'Modifier le revenu' : 'Enregistrer une entrée de fonds'}>
        <form onSubmit={handleSaveRevenue} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Libellé / Description *</label>
            <input
              type="text"
              required
              value={reasonValue}
              onChange={(e) => setReasonValue(e.target.value)}
              placeholder="Ex: Facturation Chantier Bab Ezzouar"
              className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Montant (DA) *</label>
              <input
                type="number"
                required
                value={amountValue}
                onChange={(e) => setAmountValue(e.target.value)}
                placeholder="Ex: 45000"
                className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Date *</label>
              <input
                type="date"
                required
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Rubrique de catégorie *</label>
            <select
              value={categoryValue}
              required
              onChange={(e) => setCategoryValue(e.target.value)}
              className="w-full mt-1 p-3 border border-slate-200 bg-white rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 focus:outline-hidden"
            >
              <option value="">Sélectionner une catégorie</option>
              {revenueCategories.map((c, i) => <option key={i} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" type="button" onClick={() => setIsRevenueModalOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* EXPENSE MODAL */}
      <Modal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} title={editingItem ? 'Modifier la charge' : 'Enregistrer une sortie de fonds'}>
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Désignation de la dépense *</label>
            <input
              type="text"
              required
              value={reasonValue}
              onChange={(e) => setReasonValue(e.target.value)}
              placeholder="Ex: Achat d'outillage ou carburant"
              className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Montant décaissé (DA) *</label>
              <input
                type="number"
                required
                value={amountValue}
                onChange={(e) => setAmountValue(e.target.value)}
                placeholder="Ex: 12000"
                className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Date *</label>
              <input
                type="date"
                required
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Catégorie de Charge *</label>
            <select
              value={categoryValue}
              required
              onChange={(e) => setCategoryValue(e.target.value)}
              className="w-full mt-1 p-3 border border-slate-200 bg-white rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 focus:outline-hidden"
            >
              <option value="">Sélectionner une catégorie</option>
              {expenseCategories.map((c, i) => <option key={i} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" type="button" onClick={() => setIsExpenseModalOpen(false)}>Annuler</Button>
            <Button type="submit">Valider</Button>
          </div>
        </form>
      </Modal>

      {/* QUICK INVOICE CREATOR */}
      <Modal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} title="Confection de Facture Automatique">
        <form onSubmit={handleSaveInvoice} className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar p-1">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Nom du Client / Raison Sociale *</label>
            <input
              type="text"
              required
              value={invoiceCustomer}
              onChange={(e) => setInvoiceCustomer(e.target.value)}
              placeholder="Ex: SONELGAZ Spa"
              className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs font-extrabold uppercase text-slate-800 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Lignes de la Facture</span>
              <button 
                type="button" 
                onClick={addInvoiceItemLine}
                className="text-[9px] font-black text-[#0274be] uppercase tracking-widest hover:underline"
              >
                + Ajouter une ligne
              </button>
            </div>

            {invoiceItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 border border-slate-100 p-2 rounded-xl">
                <input
                  type="text"
                  placeholder="Prestation"
                  value={item.name}
                  onChange={(e) => {
                    const copy = [...invoiceItems];
                    copy[idx].name = e.target.value;
                    setInvoiceItems(copy);
                  }}
                  className="p-2 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-800"
                />
                <input
                  type="number"
                  placeholder="Qté"
                  value={item.quantity}
                  onChange={(e) => {
                    const copy = [...invoiceItems];
                    copy[idx].quantity = Number(e.target.value);
                    setInvoiceItems(copy);
                  }}
                  className="p-2 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-800"
                />
                <input
                  type="number"
                  placeholder="Prix unitaire (DA)"
                  value={item.price}
                  onChange={(e) => {
                    const copy = [...invoiceItems];
                    copy[idx].price = Number(e.target.value);
                    setInvoiceItems(copy);
                  }}
                  className="p-2 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-800"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Notes / Conditions de Paiement</label>
            <textarea
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              placeholder="Conditions ou coordonnées CCP"
              rows={2}
              className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" type="button" onClick={() => setIsInvoiceModalOpen(false)}>Annuler</Button>
            <Button type="submit">Confectionner</Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRMATION DELETION MODAL */}
      <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Confirmation de Suppression">
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-rose-800 flex items-start gap-3">
            <AlertTriangle className="shrink-0 text-rose-600" size={24} />
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider">Alerte de Sécurité</h4>
              <p className="text-xs font-semibold mt-1">Vous vous apprêtez à supprimer définitivement cet enregistrement de la base de données. Cette action entraînera un écart comptable et sera journalisée.</p>
            </div>
          </div>

          {itemToDelete && (
            <div className="bg-slate-50 p-4 rounded-xl text-xs">
              <p className="font-extrabold text-slate-700 uppercase">Élément : {itemToDelete.label}</p>
              <p className="font-bold text-slate-400 uppercase mt-1">Montant impacté : {formatCurrency(itemToDelete.amount || 0)} DA</p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Annuler et garder</Button>
            <Button onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700 text-xs font-black uppercase">Confirmer suppression</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
