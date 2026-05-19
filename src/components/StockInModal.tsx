import React, { useState } from 'react';
import { dbService } from '../firebase/db';
import { Product } from '../types';
import { Button } from './ui/Button';
import Modal from './ui/Modal';
import { Package, Search, PlusCircle, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase/config';
import { useNotification } from '../context/NotificationContext';

interface StockInModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
}

const StockInModal: React.FC<StockInModalProps> = ({ isOpen, onClose, products }) => {
  const { showToast } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(0);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const filteredProducts = searchTerm.length > 1 
    ? products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSelect = (product: Product) => {
    setSelectedProduct(product);
    setPurchasePrice(product.purchasePrice || 0);
    setSellingPrice(product.sellingPrice || 0);
    setSearchTerm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || quantityToAdd <= 0) return;

    setIsSubmitting(true);
    setError(null);

    const oldStock = selectedProduct.stockQuantity;
    const newStock = oldStock + quantityToAdd;
    
    const oldPrice = selectedProduct.purchasePrice || 0;
    // Calcul PUMP
    const weightedAveragePrice = newStock > 0 
      ? Math.round(((oldStock * oldPrice) + (quantityToAdd * purchasePrice)) / newStock)
      : purchasePrice;

    try {
      // 1. Update Product
      await dbService.updateDocument('products', selectedProduct.id, {
        stockQuantity: newStock,
        purchasePrice: weightedAveragePrice,
        sellingPrice: sellingPrice,
        updatedAt: serverTimestamp()
      });

        // 2. Create Stock Movement History
        await dbService.addDocument('stock_movements', {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          type: 'in',
          quantity: quantityToAdd,
          unit: selectedProduct.unit || 'u',
          previousStock: oldStock,
          newStock: newStock,
          purchasePrice: purchasePrice,
          previousPrice: oldPrice,
          calculatedPump: weightedAveragePrice,
          reason: 'Approvisionnement (Achat avec PUMP)',
          billNumber: billNumber || null,
          batchNumber: batchNumber || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          createdAt: serverTimestamp(),
          userId: auth.currentUser?.uid,
          userName: auth.currentUser?.displayName || 'Admin'
        });

      showToast(`Stock mis à jour pour ${selectedProduct.name} (+${quantityToAdd})`, 'success');
      onClose();
      setSelectedProduct(null);
      setQuantityToAdd(0);
    } catch (err: any) {
      setError("Erreur lors de la mise à jour du stock.");
      showToast("Erreur lors de l'entrée de stock", 'error');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Entrée de Stock (Réapprovisionnement)">
      <form onSubmit={handleSubmit} className="space-y-6">
        {!selectedProduct ? (
          <div className="space-y-4">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400">Rechercher le produit à recharger</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                autoFocus
                type="text"
                placeholder="Nom, SKU ou Scan Code-barre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              />
            </div>
            
            <div className="space-y-2">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className="w-full p-4 flex items-center justify-between bg-white border border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all rounded-xl text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-blue-500">
                      <Package size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono italic">{p.sku}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-black text-slate-300">Stock Actuel</p>
                    <p className="font-black text-slate-600">{Number(p.stockQuantity || 0).toFixed(2).replace(/\.00$/, '')} <span className="text-[9px] font-normal">{p.sellInML ? 'u' : (p.unit || 'u')}</span></p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                    <Package size={24} />
                 </div>
                 <div className="flex-1">
                    <h3 className="font-black text-slate-800 leading-tight uppercase">{selectedProduct.name}</h3>
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">{selectedProduct.sku}</p>
                 </div>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedProduct(null)}
                className="text-[10px] font-black underline text-slate-400 uppercase hover:text-slate-600"
              >
                Changer
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">N° de Bon / Référence d'Achat (Optionnel)</label>
                <input
                  type="text"
                  placeholder="Ex: BON-2024-001"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">N° de Lot / Batch (Traçabilité)</label>
                <input
                  type="text"
                  placeholder="Ex: LOT-XYZ-123"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Date d'Expiration (Optionnel)</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">P.A ACTUEL</label>
                  <div className="px-4 py-3 bg-slate-100 rounded-xl font-bold text-slate-500">
                     {formatCurrency(selectedProduct.purchasePrice || 0)}
                  </div>
               </div>
               <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-blue-500 mb-2">NOUVEAU P.A (HT)</label>
                  <input
                    type="number"
                    value={purchasePrice || ''}
                    onChange={(e) => setPurchasePrice(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-black text-blue-600"
                  />
               </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">NOUVEAU PRIX DE VENTE (DA)</label>
              <input
                type="number"
                value={sellingPrice || ''}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-black text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nouveau Stock</p>
                  <p className="text-xl font-black text-slate-900">
                    {(Number(selectedProduct.stockQuantity) + (Number(quantityToAdd) || 0)).toFixed(2).replace(/\.00$/, '')} {selectedProduct.sellInML ? 'u' : (selectedProduct.unit || 'u')}
                  </p>
                </div>
               <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">PUMP Calculé</p>
                  <p className="text-xl font-black text-emerald-600">
                    {formatCurrency(
                      Math.round(((selectedProduct.stockQuantity * (selectedProduct.purchasePrice || 0)) + (quantityToAdd * purchasePrice)) / (selectedProduct.stockQuantity + quantityToAdd || 1))
                    )}
                  </p>
               </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Quantité à ajouter ({selectedProduct.unit || 'u'})</label>
              <input
                type="number"
                autoFocus
                step={selectedProduct.unit === 'm' || selectedProduct.unit === 'kg' ? "0.01" : "1"}
                placeholder="Ex: 50"
                value={quantityToAdd || ''}
                onChange={(e) => setQuantityToAdd(Number(e.target.value))}
                className="w-full px-6 py-4 bg-blue-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-3xl font-black text-blue-600"
              />
            </div>

            {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}

            <div className="flex gap-3">
               <Button 
                type="submit" 
                isLoading={isSubmitting} 
                disabled={quantityToAdd <= 0}
                className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 uppercase font-black tracking-widest"
               >
                  <PlusCircle size={20} className="mr-2" /> Valider l'entrée
               </Button>
               <Button 
                variant="outline" 
                type="button" 
                onClick={() => setSelectedProduct(null)}
                className="h-14 uppercase font-black"
               >
                  Annuler
               </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};

export default StockInModal;
