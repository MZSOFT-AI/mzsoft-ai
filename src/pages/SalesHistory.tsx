import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit, doc, runTransaction, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { cleanObject, formatCurrency } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { pdfService } from '../services/pdfService';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { History, Search, Calendar, FileText, Eye, RotateCcw, Printer, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Modal from '../components/ui/Modal';
import { useNotification } from '../context/NotificationContext';

export default function SalesHistory() {
  const { user } = useAuth();
  const { showToast } = useNotification();
  const [sales, setSales] = useState<any[]>([]);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(50)), 
      (snapshot) => {
        setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'sales')
    );
  }, []);

  useEffect(() => {
    if (selectedSale) {
      const updated = sales.find(s => s.id === selectedSale.id);
      if (updated) setSelectedSale(updated);
    }
  }, [sales]);

  const handleReturnItem = async (sale: any, item: any) => {
    const availableToReturn = item.quantity - (item.returnedQuantity || 0);
    if (availableToReturn <= 0) return;

    const qtyToReturn = prompt(`Combien d'unités de "${item.name}" voulez-vous retourner ? (Max: ${availableToReturn})`, "1");
    if (!qtyToReturn) return;
    
    const quantity = parseInt(qtyToReturn);

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
        
        transaction.update(productRef, {
          stockQuantity: increment(quantity),
          updatedAt: serverTimestamp()
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
    } catch (error: any) {
      showToast(error.message || "Erreur lors du retour", "error");
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

  const filteredSales = sales.filter(s => 
    s.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDownloadInvoice = (sale: any) => {
    pdfService.generateInvoice({
      invoiceNumber: sale.id,
      date: sale.createdAt?.toDate() || new Date(),
      items: sale.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      customerName: sale.customerName || 'Client de passage',
      totalAmount: sale.totalAmount,
      receivedAmount: sale.receivedAmount,
      change: sale.change,
      paymentMethod: sale.paymentMethod,
      userName: sale.userName || 'Admin'
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
           <Button variant="outline" size="sm" className="h-9 text-xs font-bold uppercase" onClick={() => window.location.reload()}>
             <History size={16} className="mr-2 text-slate-400" /> Journal
           </Button>
        </div>
      </div>

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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9 text-[10px] font-black uppercase">
                <Filter size={16} className="mr-2" /> Période
              </Button>
            </div>
          </div>
      </div>

      {/* Main ERP Table */}
      <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
        <table className="dolisoft-table">
          <thead>
            <tr>
              <th>ID Document</th>
              <th>Date & Heure</th>
              <th>Opérateur</th>
              <th>Client / Partenaire</th>
              <th className="text-center">Statut</th>
              <th className="text-right">Montant Total</th>
              <th className="text-center">Mode</th>
              <th className="w-20 text-center">...</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map((sale) => (
              <tr key={sale.id} className="hover:bg-blue-50 transition-colors">
                <td className="font-mono text-[10px] font-bold text-slate-500">{sale.id}</td>
                <td className="text-xs">
                  <span className="font-bold">{format(sale.createdAt?.toDate() || new Date(), 'dd/MM/yyyy')}</span>
                  <span className="text-slate-400 ml-2 italic">{format(sale.createdAt?.toDate() || new Date(), 'HH:mm')}</span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 border border-slate-200">{sale.userName || 'Admin'}</span>
                  </div>
                </td>
                <td className="text-xs font-bold text-slate-700">
                   {sale.customerName || 'Client Anonyme'}
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
                <td className="text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => handleDownloadInvoice(sale)} className="p-1.5 text-slate-400 hover:text-blue-600 border border-transparent hover:border-blue-200 hover:bg-blue-50" title="Imprimer Ticket">
                      <Printer size={14} />
                    </button>
                    <button onClick={() => setSelectedSale(sale)} className="p-1.5 text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200 hover:bg-slate-50">
                      <Eye size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredSales.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-20 text-slate-400 italic text-sm">Aucune archive disponible</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sale Details Modal */}
      <Modal isOpen={!!selectedSale} onClose={() => setSelectedSale(null)} title="Détail Consultation Document">
        {selectedSale && (
          <div className="space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-200">
               <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Document N°</p>
                  <p className="font-mono text-sm font-bold">{selectedSale.id}</p>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Date Émission</p>
                  <p className="text-sm font-bold">{format(selectedSale.createdAt?.toDate() || new Date(), 'dd/MM/yyyy HH:mm')}</p>
               </div>
            </div>

            <div className="bg-slate-50 border border-slate-200">
               <div className="p-2 border-b border-slate-200 flex justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Liste des Articles</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Montant</span>
               </div>
               <div className="divide-y divide-slate-100">
                  {selectedSale.items.map((item: any, i: number) => {
                    const availableToReturn = item.quantity - (item.returnedQuantity || 0);
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

                        {availableToReturn > 0 && (
                          <button 
                            onClick={() => handleReturnItem(selectedSale, item)}
                            disabled={isReturning}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2"
                          >
                            <RotateCcw size={12} /> Effectuer Retour
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

            <div className="flex gap-2">
               <Button onClick={() => handleDownloadInvoice(selectedSale)} className="flex-1 bg-blue-600 hover:bg-blue-700 uppercase font-black tracking-widest text-xs h-12">
                  <Printer size={18} className="mr-2" /> Ré-imprimer Ticket
               </Button>
               <Button variant="outline" onClick={() => setSelectedSale(null)} className="flex-1 uppercase font-black tracking-widest text-xs h-12">Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
