import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit, doc, runTransaction, increment, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { cleanObject, formatCurrency, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { pdfService } from '../services/pdfService';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { History, Search, Calendar, FileText, Eye, RotateCcw, Printer, Filter, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Modal from '../components/ui/Modal';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import PromptModal from '../components/ui/PromptModal';
import { useNotification } from '../context/NotificationContext';

export default function SalesHistory() {
  const { user, userData, isAdmin, hasPermission } = useAuth();
  const { showToast } = useNotification();
  const [sales, setSales] = useState<any[]>([]);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pos' | 'invoice'>('all');
  const [isReturning, setIsReturning] = useState(false);
  const [returnItemModal, setReturnItemModal] = useState<{ sale: any, item: any } | null>(null);
  const [returnAllModal, setReturnAllModal] = useState<any | null>(null);

  const [showSearchById, setShowSearchById] = useState(false);
  const [ticketIdQuery, setTicketIdQuery] = useState('');

  const canProcessReturns = hasPermission('canProcessReturns');

  const findTicketById = () => {
    if (!ticketIdQuery.trim()) return;
    const sale = sales.find(s => s.id.toLowerCase() === ticketIdQuery.toLowerCase().trim());
    if (sale) {
      setSelectedSale(sale);
      setTicketIdQuery('');
      setShowSearchById(false);
    } else {
      showToast("Vente introuvable avec ce numéro", "error");
    }
  };

  useEffect(() => {
    const currentUid = user?.uid || userData?.id;
    if (!currentUid) return;

    const baseQuery = collection(db, 'sales');
    const q = isAdmin 
      ? query(baseQuery, orderBy('createdAt', 'desc'), limit(200))
      : query(baseQuery, where('userId', '==', currentUid), orderBy('createdAt', 'desc'), limit(200));

    return onSnapshot(
      q, 
      (snapshot) => {
        setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'sales')
    );
  }, [user, userData, isAdmin]);

  useEffect(() => {
    if (selectedSale) {
      const updated = sales.find(s => s.id === selectedSale.id);
      if (updated) setSelectedSale(updated);
    }
  }, [sales]);

  const handleReturnItem = (sale: any, item: any) => {
    const availableToReturn = item.quantity - (item.returnedQuantity || 0);
    if (availableToReturn <= 0) return;
    setReturnItemModal({ sale, item });
  };

  const confirmReturnItem = async (quantityStr: string) => {
    if (!returnItemModal) return;
    const { sale, item } = returnItemModal;
    const availableToReturn = item.quantity - (item.returnedQuantity || 0);
    
    const quantity = parseInt(quantityStr);
    if (isNaN(quantity) || quantity <= 0 || quantity > availableToReturn) {
      showToast("Quantité invalide", "error");
      return;
    }

    setIsReturning(true);
    try {
      await runTransaction(db, async (transaction) => {
        const productId = item.productId || item.id;
        const productRef = doc(db, 'products', productId);
        const saleRef = doc(db, 'sales', sale.id);
        
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) throw new Error("Produit introuvable dans l'inventaire");
        
        const currentStock = productDoc.data().stockQuantity;
        const refundAmount = item.price * quantity;
        
        transaction.update(productRef, {
          stockQuantity: increment(quantity),
          updatedAt: serverTimestamp()
        });

        // Record a negative financial movement in expenses to reflect money given back
        const expenseRef = doc(collection(db, 'expenses'));
        transaction.set(expenseRef, {
          category: 'RETOUR CLIENT',
          reason: `Remboursement: ${item.name} (Qté: ${quantity}) - Vente ${sale.id}`,
          amount: refundAmount,
          userId: user?.uid,
          userName: user?.displayName || 'Système',
          date: serverTimestamp(),
          createdAt: serverTimestamp(),
          saleId: sale.id
        });

        const movementRef = doc(collection(db, 'stock_movements'));
        transaction.set(movementRef, cleanObject({
          productId: productId,
          productName: item.name,
          type: 'return',
          quantity: quantity,
          previousStock: currentStock,
          newStock: currentStock + quantity,
          reason: `Retour d'article - Vente ${sale.id}`,
          referenceId: sale.id,
          userId: user?.uid,
          userName: user?.displayName || 'Système',
          createdAt: serverTimestamp()
        }));

        const updatedItems = sale.items.map((i: any) => {
          const itemId = i.productId || i.id;
          if (itemId === productId) {
            return {
              ...i,
              returnedQuantity: (i.returnedQuantity || 0) + quantity
            };
          }
          return i;
        });

        const allItemsReturned = updatedItems.every((i: any) => (i.returnedQuantity || 0) >= i.quantity);
        
        transaction.update(saleRef, {
          items: updatedItems,
          status: allItemsReturned ? 'returned' : 'partially_returned',
          updatedAt: serverTimestamp()
        });
      });
      showToast("Retour enregistré", "success");
      setReturnItemModal(null);
    } catch (error: any) {
      showToast(error.message || "Erreur lors du retour", "error");
    } finally {
      setIsReturning(false);
    }
  };

  const handleReturnAllItems = (sale: any) => {
    setReturnAllModal(sale);
  };

  const confirmReturnAll = async () => {
    const sale = returnAllModal;
    if (!sale) return;

    setIsReturning(true);
    try {
      await runTransaction(db, async (transaction) => {
        const saleRef = doc(db, 'sales', sale.id);
        const updatedItems = [...sale.items];
        let totalRefundAmount = 0;

        // 1. Collect all product data (READS)
        const itemsToReturn: any[] = [];
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          const availableToReturn = item.quantity - (item.returnedQuantity || 0);
          
          if (availableToReturn > 0) {
            const productId = item.productId || item.id;
            const productRef = doc(db, 'products', productId);
            const productDoc = await transaction.get(productRef);
            
            if (productDoc.exists()) {
              itemsToReturn.push({
                item,
                productRef,
                currentStock: productDoc.data().stockQuantity,
                available: availableToReturn,
                index: i
              });
            }
          }
        }

        // 2. Perform all WRITES
        for (const data of itemsToReturn) {
          const { item, productRef, currentStock, available, index } = data;
          const productId = item.productId || item.id;
          
          totalRefundAmount += item.price * available;
          
          transaction.update(productRef, {
            stockQuantity: increment(available),
            updatedAt: serverTimestamp()
          });

          const movementRef = doc(collection(db, 'stock_movements'));
          transaction.set(movementRef, cleanObject({
            productId: productId,
            productName: item.name,
            type: 'return',
            quantity: available,
            unit: item.unit || 'u',
            previousStock: currentStock,
            newStock: currentStock + available,
            reason: `Retour Global - Vente ${sale.id}`,
            referenceId: sale.id,
            userId: user?.uid,
            userName: user?.displayName || 'Système',
            createdAt: serverTimestamp()
          }));

          updatedItems[index] = {
            ...item,
            returnedQuantity: item.quantity
          };
        }

        // Record total refund as expense
        if (totalRefundAmount > 0) {
          const expenseRef = doc(collection(db, 'expenses'));
          transaction.set(expenseRef, {
            category: 'RETOUR CLIENT',
            reason: `Remboursement Global - Vente ${sale.id}`,
            amount: totalRefundAmount,
            userId: user?.uid,
            userName: user?.displayName || 'Système',
            date: serverTimestamp(),
            createdAt: serverTimestamp(),
            saleId: sale.id
          });
        }

        transaction.update(saleRef, {
          items: updatedItems,
          status: 'returned',
          updatedAt: serverTimestamp()
        });
      });
      showToast("Vente totalement retournée", "success");
      setReturnAllModal(null);
    } catch (error: any) {
      showToast(error.message || "Erreur lors du retour global", "error");
    } finally {
      setIsReturning(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'returned': return <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-rose-50 text-rose-500 border border-rose-100 italic">Annulée</span>;
      case 'partially_returned': return <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-amber-50 text-amber-500 border border-amber-100">Retour Partiel</span>;
      default: return <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-50 text-emerald-500 border border-emerald-100">Validée</span>;
    }
  };

  const filteredSales = (sales || []).filter(s => {
    if (!s) return false;
    const matchesSearch = 
      (s.id || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (s.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.customerName || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (startDate || endDate) {
      const saleDate = s.createdAt?.toDate ? s.createdAt.toDate() : (s.createdAt ? new Date(s.createdAt) : new Date());
      
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (saleDate < start) return false;
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (saleDate > end) return false;
      }
    }

    if (sourceFilter !== 'all') {
      if (sourceFilter === 'pos' && s.source === 'invoice') return false;
      if (sourceFilter === 'invoice' && s.source !== 'invoice') return false;
    }

    return true;
  });

  const getSafeDate = (dateField: any) => {
    if (!dateField) return new Date();
    if (typeof dateField.toDate === 'function') return dateField.toDate();
    const d = new Date(dateField);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const [expandedDays, setExpandedDays] = useState<string[]>([]);

  // Toggle day expansion
  const toggleDay = (day: string) => {
    setExpandedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const groupedSales = filteredSales.reduce((acc: any, sale) => {
    const dateObj = getSafeDate(sale.createdAt);
    const dateKey = format(dateObj, 'yyyy-MM-dd');
    if (!acc[dateKey]) {
      acc[dateKey] = {
        date: dateObj,
        sales: [],
        total: 0,
        count: 0,
        returns: 0,
        partiallyReturned: 0
      };
    }
    acc[dateKey].sales.push(sale);
    acc[dateKey].total += sale.totalAmount;
    acc[dateKey].count += 1;
    if (sale.status === 'returned') acc[dateKey].returns += 1;
    if (sale.status === 'partially_returned') acc[dateKey].partiallyReturned += 1;
    return acc;
  }, {});

  const sortedDays = Object.keys(groupedSales).sort((a, b) => b.localeCompare(a));

  // Initialize first day as expanded if there are sales
  useEffect(() => {
    if (sortedDays.length > 0 && expandedDays.length === 0) {
      setExpandedDays([sortedDays[0]]);
    }
  }, [sortedDays]);

  const handleDownloadInvoice = (sale: any) => {
    const saleData = {
      invoiceNumber: sale.invoiceNumber || sale.id,
      date: getSafeDate(sale.createdAt),
      items: sale.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      customerName: sale.customerName || 'Client de passage',
      customerPhone: sale.customerPhone,
      customerAddress: sale.customerAddress,
      customerEmail: sale.customerEmail,
      totalAmount: sale.totalAmount,
      receivedAmount: sale.receivedAmount || sale.amountPaid,
      change: sale.change,
      paymentMethod: sale.paymentMethod,
      userName: sale.userName || 'Admin'
    };

    if (sale.source === 'invoice') {
      pdfService.generateInvoice(saleData as any);
    } else {
      pdfService.generateReceipt(saleData as any);
    }
  };

  const handleDownloadReturnSlip = (sale: any) => {
    const returnedItems = sale.items.filter((i: any) => (i.returnedQuantity || 0) > 0);
    if (returnedItems.length === 0) {
      showToast("Aucun article retourné pour cette vente", "info");
      return;
    }

    const totalRefund = returnedItems.reduce((sum: number, i: any) => sum + (i.returnedQuantity * i.price), 0);

    pdfService.generateReturnSlip({
      invoiceNumber: sale.id,
      date: new Date(),
      originalSaleDate: getSafeDate(sale.createdAt),
      customerName: sale.customerName || 'Client de passage',
      items: sale.items,
      refundAmount: totalRefund,
      paymentMethod: sale.paymentMethod,
      userName: user?.displayName || 'Admin'
    });
  };

  return (
    <div className="space-y-4">
      {/* ERP Header */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Historique Commercial</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Audit des Ventes & Transactions</p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <Button variant="outline" size="sm" className="h-9 text-xs font-bold uppercase border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={() => setShowSearchById(true)}>
             <RotateCcw size={16} className="mr-2" /> Effectuer un Retour
           </Button>
           <Button variant="outline" size="sm" className="h-9 text-xs font-bold uppercase" onClick={() => window.location.reload()}>
             <History size={16} className="mr-2 text-slate-400" /> Journal
           </Button>
        </div>
      </div>

      {/* Quick Return Search Modal */}
      <Modal isOpen={showSearchById} onClose={() => setShowSearchById(false)} title="Rechercher par Bon / Ticket" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-medium">Saisissez le numéro du bon ou flashez le code-barre du ticket pour effectuer un retour.</p>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">N° de Bon / ID Vente</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={ticketIdQuery}
                onChange={(e) => setTicketIdQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findTicketById()}
                autoFocus
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="Ex: sale-123..."
              />
            </div>
          </div>
          <Button onClick={findTicketById} className="w-full h-12 bg-blue-600 hover:bg-blue-700 font-black uppercase tracking-widest text-xs">
            Rechercher le document
          </Button>
        </div>
      </Modal>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Réf. Commande, Vendeur, Client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-2">
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
                {(startDate || endDate) && (
                  <button 
                    onClick={() => { setStartDate(''); setEndDate(''); }} 
                    className="ml-1 text-slate-400 hover:text-rose-500 transition-colors"
                    title="Réinitialiser les dates"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className={`h-full text-[10px] font-black uppercase ${startDate || endDate ? 'bg-blue-50 border-blue-200 text-blue-600' : ''}`}
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setStartDate(today);
                  setEndDate(today);
                }}
              >
                Aujourd'hui
              </Button>
              <div className="flex gap-1 bg-slate-50 border border-slate-300 p-1">
                <button 
                  onClick={() => setSourceFilter('all')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase transition-colors",
                    sourceFilter === 'all' ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Tous
                </button>
                <button 
                  onClick={() => setSourceFilter('pos')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase transition-colors",
                    sourceFilter === 'pos' ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Caisse
                </button>
                <button 
                  onClick={() => setSourceFilter('invoice')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase transition-colors",
                    sourceFilter === 'invoice' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Facture
                </button>
              </div>
            </div>
          </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ventes Totales</p>
          <p className="text-2xl font-black text-slate-800 tracking-tighter mt-1">{filteredSales.length}</p>
        </div>
        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chiffre d'Affaire</p>
          <p className="text-2xl font-black text-blue-600 tracking-tighter mt-1">
            {formatCurrency(filteredSales.reduce((sum, s) => sum + s.totalAmount, 0))}
          </p>
        </div>
        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Moyenne / Vente</p>
          <p className="text-2xl font-black text-slate-800 tracking-tighter mt-1">
            {filteredSales.length > 0 ? formatCurrency(filteredSales.reduce((sum, s) => sum + s.totalAmount, 0) / filteredSales.length) : '0 DA'}
          </p>
        </div>
        <div className="bg-white border border-rose-100 p-4 shadow-sm bg-rose-50/30">
          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Retours / Annulations</p>
          <p className="text-2xl font-black text-rose-600 tracking-tighter mt-1">
            {filteredSales.filter(s => s.status === 'returned' || s.status === 'partially_returned').length}
          </p>
        </div>
      </div>

      {/* Daily Grouped View */}
      <div className="space-y-6">
        {sortedDays.map((dayKey) => {
          const dayData = groupedSales[dayKey];
          const isExpanded = expandedDays.includes(dayKey);

          return (
            <div key={dayKey} className="bg-white border border-slate-200 overflow-hidden shadow-sm">
              {/* Day Header */}
              <div 
                onClick={() => toggleDay(dayKey)}
                className="bg-slate-50 p-4 flex flex-col md:flex-row justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors border-b border-slate-200"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white p-2">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">
                      {format(dayData.date, 'EEEE dd MMMM yyyy', { locale: fr })}
                    </h3>
                    <div className="flex gap-4 mt-0.5">
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                         <span className="text-blue-600">{dayData.count}</span> Ventes Effectuées
                       </span>
                       {dayData.returns > 0 && (
                         <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">
                           <span className="text-rose-600">{dayData.returns}</span> Annulations
                         </span>
                       )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 mt-4 md:mt-0">
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Journalier</p>
                    <p className="text-xl font-black text-slate-900 tracking-tighter">{formatCurrency(dayData.total)}</p>
                  </div>
                  <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                    <Filter size={16} className="text-slate-400" />
                  </div>
                </div>
              </div>

              {/* Day Sales Table */}
              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="mzsoft-table w-full">
                    <thead>
                      <tr>
                        <th className="pl-6">Heure</th>
                        <th>Type</th>
                        <th>ID Document</th>
                        <th>Opérateur</th>
                        <th>Client</th>
                        <th className="text-center">Statut</th>
                        <th className="text-right">Montant</th>
                        <th className="text-center">Mode</th>
                        <th className="w-20 pr-6 text-center">...</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayData.sales.map((sale: any) => (
                        <tr key={sale.id} className="hover:bg-blue-50/50 transition-colors">
                          <td className="pl-6 text-xs text-slate-400 italic">
                            {format(getSafeDate(sale.createdAt), 'HH:mm')}
                          </td>
                          <td>
                            {sale.source === 'invoice' ? (
                              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 uppercase tracking-tighter w-fit">
                                <FileText size={10} /> Facture
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[9px] font-black text-blue-600 px-1.5 py-0.5 bg-blue-50 border border-blue-100 uppercase tracking-tighter w-fit">
                                <ShoppingCart size={10} /> Caisse
                              </span>
                            )}
                          </td>
                          <td className="font-mono text-[10px] font-bold text-slate-500">{sale.id}</td>
                          <td>
                            <span className="text-[9px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 border border-slate-200 uppercase">
                              {sale.userName || 'Admin'}
                            </span>
                          </td>
                          <td className="text-xs font-bold text-slate-700">
                             {sale.customerName || 'Client de passage'}
                          </td>
                          <td className="text-center">
                            {getStatusBadge(sale.status)}
                          </td>
                          <td className="text-right font-black text-slate-900 text-sm">
                            {formatCurrency(sale.totalAmount)}
                          </td>
                          <td className="text-center uppercase text-[9px] font-black text-slate-400">
                             {sale.paymentMethod || 'Esp'}
                          </td>
                          <td className="pr-6 text-center">
                            <div className="flex justify-center gap-1">
                              <button onClick={() => handleDownloadInvoice(sale)} className="p-1.5 text-slate-400 hover:text-blue-600 border border-transparent hover:border-blue-200 hover:bg-blue-50" title="Imprimer Ticket">
                                <Printer size={14} />
                              </button>
                              <button onClick={() => setSelectedSale(sale)} className="p-1.5 text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200 hover:bg-slate-50" title="Détails / Retour">
                                <Eye size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {sortedDays.length === 0 && (
          <div className="bg-white border border-slate-200 p-20 text-center flex flex-col items-center gap-4">
             <div className="bg-slate-50 p-6 rounded-full">
               <History size={48} className="text-slate-200" />
             </div>
             <div className="space-y-1">
                <p className="text-slate-800 font-black uppercase tracking-tighter">Aucune opération trouvée</p>
                <p className="text-slate-400 text-xs italic">Affinez vos filtres ou effectuez de nouvelles ventes</p>
             </div>
          </div>
        )}
      </div>

      {/* Sale Details Modal */}
      <Modal isOpen={!!selectedSale} onClose={() => setSelectedSale(null)} title="Détail Consultation Document">
        {selectedSale && (
          <div className="space-y-6">
             <div className="flex justify-between items-start pb-4 border-b border-slate-200">
               <div className="flex gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Type</p>
                    {selectedSale.source === 'invoice' ? (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 italic">Facture</span>
                    ) : (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 italic">Vente Caisse</span>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Document N°</p>
                    <p className="font-mono text-sm font-bold">{selectedSale.id}</p>
                  </div>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Date Émission</p>
                  <p className="text-sm font-bold">{format(getSafeDate(selectedSale.createdAt), 'dd/MM/yyyy HH:mm')}</p>
               </div>
            </div>

            <div className="bg-slate-50 border border-slate-200">
               <div className="p-2 border-b border-slate-200 flex justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Liste des Articles</span>
                  {selectedSale.status !== 'returned' && canProcessReturns && (
                    <button 
                      onClick={() => handleReturnAllItems(selectedSale)}
                      disabled={isReturning}
                      className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-700 underline underline-offset-2 px-2"
                    >
                      Tout Retourner
                    </button>
                  )}
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Montant</span>
               </div>
               <div className="divide-y divide-slate-100">
                    {(selectedSale.items || []).map((item: any, i: number) => {
                      const availableToReturn = (item.quantity || 0) - (item.returnedQuantity || 0);
                    return (
                      <div key={i} className="p-3 hover:bg-white transition-colors">
                        <div className="flex justify-between items-center">
                           <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-800">{item.name}</span>
                              <span className="text-[11px] text-slate-400 italic font-medium">{item.quantity} x {formatCurrency(item.price)}</span>
                           </div>
                           <span className="font-black text-slate-900">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                        
                        {item.returnedQuantity > 0 && (
                          <div className="mt-1 inline-flex items-center gap-1.5 text-[9px] font-black uppercase bg-rose-50 text-rose-500 border border-rose-200 px-2 py-0.5">
                            <RotateCcw size={10} /> {item.returnedQuantity} Retourné(s)
                          </div>
                        )}

                        {availableToReturn > 0 && canProcessReturns && (
                          <button 
                            onClick={() => handleReturnItem(selectedSale, item)}
                            disabled={isReturning}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2"
                          >
                            <RotateCcw size={12} /> Retour Article Unique
                          </button>
                        )}
                      </div>
                    );
                  })}
               </div>
               <div className="p-4 bg-slate-100 border-t border-slate-200 space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span className="uppercase tracking-widest">Sous-Total</span>
                    <span>{formatCurrency(selectedSale.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-black text-slate-900 border-t border-slate-200 pt-2 mt-2">
                    <span className="uppercase tracking-tighter">Total Net (DA)</span>
                    <span className="text-blue-700">{formatCurrency(selectedSale.totalAmount)}</span>
                  </div>
                  
                  {selectedSale.items.some((i: any) => i.returnedQuantity > 0) && (
                    <div className="flex justify-between text-lg font-black text-rose-600 bg-rose-50 p-2 mt-4 border border-rose-100 italic">
                      <span className="uppercase tracking-tighter">Total Remboursé</span>
                      <span>{formatCurrency(selectedSale.items.reduce((sum: number, i: any) => sum + ((i.returnedQuantity || 0) * i.price), 0))}</span>
                    </div>
                  )}

                  {selectedSale.paymentMethod === 'cash' && (
                    <div className="pt-2 flex justify-between items-center text-xs">
                       <span className="text-slate-400 font-bold uppercase tracking-widest underline underline-offset-4 decoration-slate-200">Mode: Espèces</span>
                       <div className="text-right">
                          <span className="text-slate-400 mr-2">Reçu: {formatCurrency(selectedSale.receivedAmount)}</span>
                          <span className="text-emerald-600 font-black">Monnaie: {formatCurrency(selectedSale.change)}</span>
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="flex flex-col gap-2 w-full">
                <div className="flex gap-2">
                  <Button onClick={() => handleDownloadInvoice(selectedSale)} className="flex-1 bg-blue-600 hover:bg-blue-700 uppercase font-black tracking-widest text-xs h-12">
                    <Printer size={18} className="mr-2" /> Ré-imprimer Ticket
                  </Button>
                  
                  {selectedSale.items.some((i: any) => i.returnedQuantity > 0) && (
                    <Button onClick={() => handleDownloadReturnSlip(selectedSale)} className="flex-1 bg-rose-600 hover:bg-rose-700 uppercase font-black tracking-widest text-xs h-12">
                      <RotateCcw size={18} className="mr-2" /> Bon de Retour
                    </Button>
                  )}
                </div>
                <Button variant="outline" onClick={() => setSelectedSale(null)} className="w-full uppercase font-black tracking-widest text-xs h-12">Fermer</Button>
            </div>
          </div>
        )}
      </Modal>

      <PromptModal
        isOpen={!!returnItemModal}
        onClose={() => setReturnItemModal(null)}
        onConfirm={confirmReturnItem}
        title="Retour d'article"
        message={`Combien d'unités de "${returnItemModal?.item?.name}" voulez-vous retourner ? (Max: ${(returnItemModal?.item?.quantity || 0) - (returnItemModal?.item?.returnedQuantity || 0)})`}
        defaultValue="1"
        inputType="number"
        isLoading={isReturning}
      />

      <ConfirmationModal
        isOpen={!!returnAllModal}
        onClose={() => setReturnAllModal(null)}
        onConfirm={confirmReturnAll}
        title="Retour Global"
        message="Voulez-vous vraiment retourner TOUS les articles restants de cette vente ?"
        confirmText="Confirmer le retour"
        variant="danger"
        isLoading={isReturning}
      />
    </div>
  );
}
