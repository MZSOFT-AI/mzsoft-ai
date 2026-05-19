import React, { useState } from 'react';
import { dbService } from '../firebase/db';
import { Product, Supplier } from '../types';
import { Button } from './ui/Button';
import Modal from './ui/Modal';
import { Package, Search, RotateCcw, Truck } from 'lucide-react';
import { serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase/config';
import { useNotification } from '../context/NotificationContext';

interface PurchaseReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  suppliers: Supplier[];
}

const PurchaseReturnModal: React.FC<PurchaseReturnModalProps> = ({ isOpen, onClose, products, suppliers }) => {
  const { showToast } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [quantityToReturn, setQuantityToReturn] = useState<number>(0);
  const [billNumber, setBillNumber] = useState('');
  const [reason, setReason] = useState('Retour au fournisseur');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = searchTerm.length > 1 
    ? products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSelect = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || quantityToReturn <= 0) return;

    if (quantityToReturn > selectedProduct.stockQuantity) {
      setError(`Stock insuffisant. Stock actuel: ${selectedProduct.stockQuantity}`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const oldStock = selectedProduct.stockQuantity;
    const newStock = oldStock - quantityToReturn;
    
    try {
      // 1. Update Product Stock
      await dbService.updateDocument('products', selectedProduct.id, {
        stockQuantity: newStock,
        updatedAt: serverTimestamp()
      });

      // 2. Create Stock Movement History
      await dbService.addDocument('stock_movements', {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        type: 'out',
        quantity: quantityToReturn,
        unit: selectedProduct.unit || 'u',
        previousStock: oldStock,
        newStock: newStock,
        reason: billNumber ? `Retour Fournisseur (Bon: ${billNumber})` : reason,
        billNumber: billNumber || null,
        supplierId: selectedSupplier || null,
        supplierName: suppliers.find(s => s.id === selectedSupplier)?.name || null,
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid,
        userName: auth.currentUser?.displayName || 'Admin'
      });

      showToast(`Retour fournisseur enregistré pour ${selectedProduct.name} (-${quantityToReturn})`, 'success');
      onClose();
      resetForm();
    } catch (err: any) {
      setError("Erreur lors de l'enregistrement du retour.");
      showToast("Erreur lors du retour de stock", 'error');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProduct(null);
    setSelectedSupplier('');
    setQuantityToReturn(0);
    setBillNumber('');
    setReason('Retour au fournisseur');
    setError(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Retour Fournisseur">
      <form onSubmit={handleSubmit} className="space-y-6">
        {!selectedProduct ? (
          <div className="space-y-4">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400">Rechercher le produit à retourner</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                autoFocus
                type="text"
                placeholder="Nom, SKU ou Scan Code-barre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-bold"
              />
            </div>
            
            <div className="space-y-2">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className="w-full p-4 flex items-center justify-between bg-white border border-slate-100 hover:border-rose-300 hover:bg-rose-50 transition-all rounded-xl text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-rose-500">
                      <Package size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono italic">{p.sku}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-black text-slate-300">Stock Actuel</p>
                    <p className="font-black text-slate-600">{Number(p.stockQuantity || 0).toFixed(2).replace(/\.00$/, '')} <span className="text-[9px] font-normal">{p.unit || 'u'}</span></p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-rose-600 shadow-sm">
                    <Package size={24} />
                 </div>
                 <div className="flex-1">
                    <h3 className="font-black text-slate-800 leading-tight uppercase">{selectedProduct.name}</h3>
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">{selectedProduct.sku}</p>
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
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Fournisseur (Optionnel)</label>
                <div className="relative">
                  <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <select
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-bold text-sm"
                  >
                    <option value="">Sélectionner...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">N° de Bon / Réf</label>
                <input
                  type="text"
                  placeholder="Ex: RET-001"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-bold text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Motif du retour</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-bold text-sm resize-none"
                rows={2}
              />
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Impact sur le Stock</p>
              <p className="text-xl font-black text-rose-600">
                {Number(selectedProduct.stockQuantity || 0).toFixed(2).replace(/\.00$/, '')} {selectedProduct.unit || 'u'} &rarr; {(Number(selectedProduct.stockQuantity) - (Number(quantityToReturn) || 0)).toFixed(2).replace(/\.00$/, '')} {selectedProduct.unit || 'u'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Quantité à retourner ({selectedProduct.unit || 'u'})</label>
              <input
                type="number"
                autoFocus
                step={selectedProduct.unit === 'm' || selectedProduct.unit === 'kg' ? "0.01" : "1"}
                placeholder="Ex: 5"
                value={quantityToReturn || ''}
                onChange={(e) => setQuantityToReturn(Number(e.target.value))}
                className="w-full px-6 py-4 bg-rose-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 text-3xl font-black text-rose-600"
              />
            </div>

            {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}

            <div className="flex gap-3">
               <Button 
                type="submit" 
                isLoading={isSubmitting} 
                disabled={quantityToReturn <= 0 || quantityToReturn > selectedProduct.stockQuantity}
                className="flex-1 h-14 bg-rose-600 hover:bg-rose-700 uppercase font-black tracking-widest text-white"
               >
                  <RotateCcw size={20} className="mr-2" /> Valider le retour
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

export default PurchaseReturnModal;
