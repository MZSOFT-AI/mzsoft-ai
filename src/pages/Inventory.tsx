import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../firebase/db';
import { orderBy } from 'firebase/firestore';
import { auth } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import CategoryModal from '../components/CategoryModal';
import { useCollection } from '../hooks/useCollection';
import { Product, Category } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  AlertCircle,
  Package,
  Barcode,
  Box,
  Tags,
  Download,
  X
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(2, 'Le nom doit avoir au moins 2 caractères'),
  categoryId: z.string().min(1, 'Catégorie requise'),
  barcode: z.string().optional(),
  purchasePrice: z.number().min(0, 'Prix d\'achat invalide'),
  sellingPrice: z.number().min(0, 'Prix de vente invalide'),
  stockQuantity: z.number().min(0, 'La quantité ne peut pas être négative'),
  minStockLevel: z.number().min(0, 'Le seuil ne peut pas être négatif'),
  description: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

const Inventory: React.FC = () => {
  const { data: products } = useCollection<Product>('products', [orderBy('createdAt', 'desc')]);
  const { data: categories } = useCollection<Category>('categories', [orderBy('name')]);
  
  const { isAdmin } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success', message: string } | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      minStockLevel: 5
    }
  });

  const onSubmit = async (data: ProductFormData) => {
    try {
      setFeedback(null);
      const productData = {
        ...data,
        sku: editingProduct?.sku || `SKU-${data.name.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
        updatedAt: new Date()
      };

      if (editingProduct) {
        await dbService.updateDocument('products', editingProduct.id, productData);
        
        if (editingProduct.stockQuantity !== data.stockQuantity) {
          await dbService.addDocument('stock_movements', {
            productId: editingProduct.id,
            productName: data.name,
            type: data.stockQuantity > editingProduct.stockQuantity ? 'adjustment_in' : 'adjustment_out',
            quantity: Math.abs(data.stockQuantity - editingProduct.stockQuantity),
            previousStock: editingProduct.stockQuantity,
            newStock: data.stockQuantity,
            reason: 'Correction manuelle du stock',
            createdAt: new Date(),
            userId: auth.currentUser?.uid,
            userName: auth.currentUser?.displayName || 'Admin'
          });
        }
      } else {
        const id = await dbService.addDocument('products', {
          ...productData,
          createdAt: new Date()
        });

        if (id) {
          await dbService.addDocument('stock_movements', {
            productId: id,
            productName: data.name,
            type: 'initial',
            quantity: data.stockQuantity,
            previousStock: 0,
            newStock: data.stockQuantity,
            reason: 'Création du produit',
            createdAt: new Date(),
            userId: auth.currentUser?.uid,
            userName: auth.currentUser?.displayName || 'Admin'
          });
        }
      }
      setFeedback({ type: 'success', message: editingProduct ? 'Produit mis à jour !' : 'Produit créé avec succès !' });
      setTimeout(() => setFeedback(null), 3000);
      setIsModalOpen(false);
      setEditingProduct(null);
      reset();
    } catch (error: any) {
      console.error('Submit error:', error);
      let message = 'Une erreur est survenue lors de l\'enregistrement.';
      if (error.message && error.message.includes('permission-denied')) {
        message = 'Permissions insuffisantes. Vérifiez votre rôle administrateur.';
      }
      setFeedback({ type: 'error', message });
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    reset(product);
    setIsModalOpen(true);
  };

  const handleDelete = async (product: any) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer "${product.name}" ?`)) {
      try {
        setFeedback(null);
        // Record deletion movement first
        await dbService.addDocument('stock_movements', {
          productId: product.id,
          productName: product.name,
          type: 'out',
          quantity: product.stockQuantity,
          previousStock: product.stockQuantity,
          newStock: 0,
          reason: 'Suppression du produit',
          createdAt: new Date(),
          userId: auth.currentUser?.uid,
          userName: auth.currentUser?.displayName || 'Admin'
        });

        await dbService.deleteDocument('products', product.id);
        setFeedback({ type: 'success', message: 'Produit supprimé !' });
        setTimeout(() => setFeedback(null), 3000);
      } catch (error: any) {
        console.error('Delete error:', error);
        let message = 'Une erreur est survenue lors de la suppression.';
        if (error.message && error.message.includes('permission-denied')) {
          message = 'Permissions insuffisantes.';
        }
        setFeedback({ type: 'error', message });
      }
    }
  };

  const exportToCSV = () => {
    const headers = ['Nom', 'Catégorie', 'SKU', 'Code-barre', 'Prix Achat', 'Prix Vente', 'Stock', 'Seuil Alerte'];
    const data = filteredProducts.map(p => [
      p.name,
      categories.find(c => c.id === p.categoryId)?.name || 'Sans catégorie',
      p.sku || '',
      p.barcode || '',
      p.purchasePrice,
      p.sellingPrice,
      p.stockQuantity,
      p.minStockLevel
    ]);

    const csvContent = [headers, ...data].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventaire_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
    
    const isLow = p.stockQuantity <= (p.minStockLevel || 5) && p.stockQuantity > 0;
    const isOut = p.stockQuantity <= 0;
    
    const matchesStock = stockFilter === 'all' || 
                        (stockFilter === 'low' && isLow) || 
                        (stockFilter === 'out' && isOut);

    return matchesSearch && matchesCategory && matchesStock;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Gestion du Stock</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Inventaire Centralisé</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsCatModalOpen(true)} className="text-xs h-9 font-bold uppercase">
                <Tags size={16} className="mr-2" />
                Catégories
              </Button>
              <Button size="sm" onClick={() => { setEditingProduct(null); reset({ minStockLevel: 5 }); setIsModalOpen(true); }} className="text-xs h-9 bg-blue-600 hover:bg-blue-700 font-bold uppercase">
                <Plus size={16} className="mr-2" />
                Ajouter Produit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Floating Action Button for Mobile */}
      {isAdmin && (
        <button
          onClick={() => { setEditingProduct(null); reset({ minStockLevel: 5 }); setIsModalOpen(true); }}
          className="fixed bottom-24 right-6 w-14 h-14 bg-slate-800 text-white rounded-full shadow-2xl flex items-center justify-center lg:hidden z-40 active:scale-90 transition-transform"
        >
          <Plus size={28} />
        </button>
      )}
      
      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-xl flex items-center gap-3 font-bold text-sm",
            feedback.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
          )}
        >
          {feedback.type === 'success' ? <Package size={20} /> : <AlertCircle size={20} />}
          {feedback.message}
        </motion.div>
      )}

      <div className="bg-white border border-slate-200 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Chercher par nom, SKU ou code-barre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-slate-300 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex bg-slate-100 p-1 border border-slate-200 gap-1">
                <button
                  onClick={() => setStockFilter('all')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase transition-all",
                    stockFilter === 'all' 
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200" 
                    : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Tous ({products.length})
                </button>
                <button
                  onClick={() => setStockFilter('low')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase transition-all",
                    stockFilter === 'low' 
                    ? "bg-white text-amber-600 shadow-sm border border-slate-200" 
                    : "text-slate-500 hover:text-amber-600"
                  )}
                >
                  Stock Faible
                </button>
                <button
                  onClick={() => setStockFilter('out')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase transition-all",
                    stockFilter === 'out' 
                    ? "bg-white text-rose-600 shadow-sm border border-slate-200" 
                    : "text-slate-500 hover:text-rose-600"
                  )}
                >
                  Rupture
                </button>
              </div>

              <select 
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 min-w-[160px]"
              >
                <option value="all">Toutes catégories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              
              <Button variant="outline" size="sm" onClick={exportToCSV} className="hidden sm:flex ml-2 text-xs h-9 uppercase font-bold">
                <Download size={16} className="mr-2" />
                Exporter
              </Button>
            </div>
          </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="dolisoft-table">
          <thead>
            <tr>
              <th>Désignation</th>
              <th>Catégorie</th>
              <th>SKU</th>
              <th className="text-center">Quantité</th>
              <th className="text-right">Prix Vente</th>
              <th className="text-right">Prix Achat</th>
              <th className="w-24 text-center text-slate-400">...</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => {
              const stockStatus = product.stockQuantity <= 0 ? 'out' : 
                                 product.stockQuantity <= (product.minStockLevel || 5) ? 'low' : 'ok';
              
              return (
                <tr key={product.id} className="hover:bg-blue-50 transition-colors">
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 flex items-center justify-center border",
                        stockStatus === 'out' ? "bg-rose-50 text-rose-500 border-rose-200" : "bg-slate-50 text-slate-400 border-slate-200"
                      )}>
                        <Package size={14} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm leading-tight">{product.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {product.barcode || '-'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="text-[10px] font-bold text-slate-600">
                      {categories.find(c => c.id === product.categoryId)?.name || 'N/A'}
                    </span>
                  </td>
                  <td>
                    <span className="text-[10px] font-mono text-slate-400">{product.sku}</span>
                  </td>
                  <td className="text-center">
                    <span className={cn(
                      "font-black text-sm",
                      stockStatus === 'out' ? "text-rose-600" : stockStatus === 'low' ? "text-amber-500" : "text-slate-800"
                    )}>
                      {product.stockQuantity}
                    </span>
                  </td>
                  <td className="text-right font-black text-blue-600">
                    {formatCurrency(product.sellingPrice)}
                  </td>
                  <td className="text-right font-bold text-slate-400 italic text-[11px]">
                    {formatCurrency(product.purchasePrice)}
                  </td>
                  <td className="text-center">
                    <div className="flex justify-center gap-1">
                       <button onClick={() => handleEdit(product)} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors hover:bg-blue-50 border border-transparent hover:border-blue-200">
                         <Edit2 size={14} />
                       </button>
                       {isAdmin && (
                         <button onClick={() => handleDelete(product)} className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors hover:bg-rose-50 border border-transparent hover:border-rose-200">
                           <Trash2 size={14} />
                         </button>
                       )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredProducts.length === 0 && (
          <div className="py-24 text-center">
             <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Box className="w-10 h-10 text-slate-200" />
             </div>
             <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Aucun produit trouvé</p>
             <p className="text-xs text-slate-400 mt-1">Essayez d'ajuster vos filtres de recherche.</p>
          </div>
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingProduct ? 'Modifier Produit' : 'Ajouter un Produit'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Nom du produit *</label>
              <input {...register('name')} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-slate-400 dark:text-white font-bold" />
              {errors.name && <p className="text-rose-500 text-[10px] font-bold mt-1 uppercase">{errors.name.message}</p>}
            </div>
            
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Catégorie *</label>
              <select {...register('categoryId')} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-slate-400 dark:text-white font-bold">
                <option value="">Sélectionner</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.categoryId && <p className="text-rose-500 text-[10px] font-bold mt-1 uppercase">{errors.categoryId.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Code-barre / Identifiant</label>
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input {...register('barcode')} className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-slate-400 dark:text-white font-mono" />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Tarification (DA)</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Achat</p>
                  <input type="number" step="0.01" {...register('purchasePrice', { valueAsNumber: true })} className="w-full px-4 py-2 bg-white dark:bg-slate-800 rounded-xl outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-slate-400 dark:text-white font-bold" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Vente</p>
                  <input type="number" step="0.01" {...register('sellingPrice', { valueAsNumber: true })} className="w-full px-4 py-2 bg-white dark:bg-slate-800 rounded-xl outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-slate-400 dark:text-white font-bold" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-black uppercase tracking-widest text-emerald-500 mb-4">Inventaire</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Stock Actuel</p>
                  <input type="number" {...register('stockQuantity', { valueAsNumber: true })} className="w-full px-4 py-2 bg-white dark:bg-slate-800 rounded-xl outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 dark:text-white font-bold" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Seuil Alerte</p>
                  <input type="number" {...register('minStockLevel', { valueAsNumber: true })} className="w-full px-4 py-2 bg-white dark:bg-slate-800 rounded-xl outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 dark:text-white font-bold" />
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Notes / Description</label>
              <textarea {...register('description')} rows={3} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-slate-400 dark:text-white transition-all resize-none" placeholder="Informations complémentaires..." />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Annuler</Button>
            <Button type="submit" size="lg" className="px-10" isLoading={isSubmitting}>
              {editingProduct ? 'Mettre à jour' : 'Créer Produit'}
            </Button>
          </div>
        </form>
      </Modal>

      <CategoryModal isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} />
    </div>
  );
};

export default Inventory;
