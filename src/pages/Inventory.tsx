import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../firebase/db';
import { orderBy } from 'firebase/firestore';
import { auth } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import CategoryModal from '../components/CategoryModal';
import StockInModal from '../components/StockInModal';
import PurchaseReturnModal from '../components/PurchaseReturnModal';
import BarcodePrintModal from '../components/BarcodePrintModal';
import { useCollection } from '../hooks/useCollection';
import { Product, Category, Supplier } from '../types';
import { cn, formatCurrency, safeStringify } from '../lib/utils';
import { motion } from 'motion/react';
import { useNotification } from '../context/NotificationContext';
import { notificationService } from '../services/notificationService';
import { 
  Plus, 
  Minus,
  Search, 
  Edit2, 
  Trash2, 
  AlertCircle,
  Package,
  Barcode,
  Box,
  Tags,
  Download,
  X,
  PlusSquare,
  RotateCcw,
  ClipboardList,
  Printer
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';

const productSchema = z.object({
  name: z.string().min(2, 'Le nom doit avoir au moins 2 caractères'),
  categoryId: z.string().min(1, 'Catégorie requise'),
  barcode: z.string().optional(),
  purchasePrice: z.number().min(0, 'Prix requis'),
  sellingPrice: z.number().min(0, 'Prix requis'),
  stockQuantity: z.number().min(0, 'Stock requis'),
  minStockLevel: z.number().min(0, 'Seuil requis'),
  unit: z.enum(['u', 'm', 'ml', 'kg', 'l', 'g', 'bt', 'pq', 'ans']).optional(),
  description: z.string().optional(),
  sellInML: z.boolean().optional(),
  unitsPerRoll: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  }, z.number().optional()),
  pricePerML: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  }, z.number().optional()),
}) as z.ZodType<any>;

type ProductFormData = z.infer<typeof productSchema>;

import { useSettings } from '../context/SettingsContext';

const Inventory: React.FC = () => {
  const { showToast } = useNotification();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { data: products } = useCollection<Product>('products', [orderBy('createdAt', 'desc')]);
  const { data: categories } = useCollection<Category>('categories', [orderBy('name')]);
  const { data: suppliers } = useCollection<Supplier>('suppliers', [orderBy('name')]);
  
  const { user, userData, isAdmin, hasPermission } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isStockInModalOpen, setIsStockInModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  
  const canManageStock = hasPermission('canManageStock');
  const canDeleteProducts = hasPermission('canDeleteProducts');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [productForBarcode, setProductForBarcode] = useState<Product | null>(null);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      minStockLevel: 5,
      unit: 'u',
      sellInML: false
    }
  });

  const unitValue = watch('unit');
  const nameValue = watch('name');

  React.useEffect(() => {
    if (unitValue === 'ml' || (nameValue && nameValue.toLowerCase().includes('cable'))) {
       if (!editingProduct) { // Only auto-check for new products
         setValue('sellInML', true);
       }
    }
  }, [unitValue, nameValue, setValue, editingProduct]);

  const onSubmit = async (data: ProductFormData) => {
    try {
      // Detection de doublon (par code-barre ou nom exact)
      const duplicateProduct = !editingProduct ? products.find(p => 
        (data.barcode && p.barcode && p.barcode.trim() === data.barcode.trim()) || 
        (p.name.toLowerCase().trim() === data.name.toLowerCase().trim())
      ) : null;

      if (duplicateProduct) {
        // Le produit existe déjà -> Recalcul du Prix d'Achat Moyen Pondéré (PUMP)
        const oldStock = duplicateProduct.stockQuantity;
        const newQty = data.stockQuantity;
        const newStock = oldStock + newQty;
        
        const oldPrice = duplicateProduct.purchasePrice || 0;
        const incomingPrice = data.purchasePrice;
        
        // Formule PUMP: ((Stock actuel * Ancien Prix) + (Nouvel Achat * Nouveau Prix)) / Stock Total
        const weightedAveragePrice = newStock > 0 
          ? Math.round(((oldStock * oldPrice) + (newQty * incomingPrice)) / newStock)
          : incomingPrice;

        await dbService.updateDocument('products', duplicateProduct.id, {
          stockQuantity: newStock,
          purchasePrice: weightedAveragePrice,
          sellingPrice: data.sellingPrice, // On garde généralement le dernier prix de vente saisi
          updatedAt: new Date()
        });

        if (newStock <= (duplicateProduct.minStockLevel || 5) && settings.notifyLowStock) {
          notificationService.createNotification({
            type: 'low_stock',
            title: 'Stock Faible',
            message: `Le produit "${duplicateProduct.name}" est à ${newStock} suite à un réapprovisionnement.`,
            priority: newStock <= 0 ? 'critical' : 'medium',
            userId: user?.uid || 'unknown',
            userName: userData?.displayName || 'Admin',
            metadata: { productId: duplicateProduct.id, stock: newStock }
          });
        }

        await dbService.addDocument('stock_movements', {
          productId: duplicateProduct.id,
          productName: duplicateProduct.name,
          type: 'in',
          quantity: newQty,
          unit: duplicateProduct.unit || 'u',
          previousStock: oldStock,
          newStock: newStock,
          previousPrice: oldPrice,
          purchasePrice: incomingPrice,
          calculatedPump: weightedAveragePrice,
          reason: 'Réapprovisionnement automatique (PUMP calculé)',
          createdAt: new Date(),
          userId: auth.currentUser?.uid,
          userName: auth.currentUser?.displayName || 'Admin'
        });

        showToast(`Produit fusionné. Stock augmenté de ${newQty}`, 'success');
      } else {
        const productData = {
          ...data,
          // Safety: ensure ML fields are numbers or undefined, never NaN
          unitsPerRoll: data.sellInML ? (Number(data.unitsPerRoll) || 1) : 0,
          pricePerML: data.sellInML ? (Number(data.pricePerML) || 0) : 0,
          sku: editingProduct?.sku || `SKU-${data.name.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
          updatedAt: new Date()
        };

        if (editingProduct) {
          await dbService.updateDocument('products', editingProduct.id, productData);
          showToast('Produit mis à jour', 'success');
          
          if (editingProduct.stockQuantity !== data.stockQuantity) {
            await dbService.addDocument('stock_movements', {
              productId: editingProduct.id,
              productName: data.name,
              type: data.stockQuantity > editingProduct.stockQuantity ? 'adjustment_in' : 'adjustment_out',
              quantity: Math.abs(data.stockQuantity - editingProduct.stockQuantity),
              unit: editingProduct.unit || 'u',
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
            showToast('Nouveau produit créé', 'success');
            await dbService.addDocument('stock_movements', {
              productId: id,
              productName: data.name,
              type: 'initial',
              quantity: data.stockQuantity,
              unit: data.unit || 'u',
              previousStock: 0,
              newStock: data.stockQuantity,
              reason: 'Création du produit',
              createdAt: new Date(),
              userId: auth.currentUser?.uid,
              userName: auth.currentUser?.displayName || 'Admin'
            });
          }
        }
      }
      
      setIsModalOpen(false);
      setEditingProduct(null);
      reset();
    } catch (error: any) {
      console.error('Inventory submission error:', safeStringify(error));
      let message = 'Erreur lors de l\'enregistrement';
      
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.error.includes('permissions')) {
          message = "Droit d'accès insuffisant pour cette opération.";
        } else {
          message = errorData.error || message;
        }
      } catch (e) {
        if (error.message) message = error.message;
      }
      
      showToast(message, 'error');
    }
  };

  const handleQuickStock = async (product: Product, delta: number) => {
    const newStock = (product.stockQuantity || 0) + delta;
    if (newStock < 0) {
      showToast('Le stock ne peut pas être négatif', 'error');
      return;
    }

    try {
      setLoading(true);
      await dbService.updateDocument('products', product.id, {
        stockQuantity: newStock,
        updatedAt: new Date()
      });

      if (newStock <= (product.minStockLevel || 5) && settings.notifyLowStock) {
        notificationService.createNotification({
          type: 'low_stock',
          title: 'Stock Faible (Ajustement)',
          message: `Le produit "${product.name}" est descendu à ${newStock} lors d'un ajustement manuel.`,
          priority: newStock <= 0 ? 'critical' : 'medium',
          userId: user?.uid || 'unknown',
          userName: userData?.displayName || 'Admin',
          metadata: { productId: product.id, stock: newStock }
        });
      }

      await dbService.addDocument('stock_movements', {
        productId: product.id,
        productName: product.name,
        type: delta > 0 ? 'adjustment_in' : 'adjustment_out',
        quantity: Math.abs(delta),
        unit: product.unit || 'u',
        previousStock: product.stockQuantity,
        newStock: newStock,
        reason: 'Ajustement rapide (Raccourci)',
        createdAt: new Date(),
        userId: auth.currentUser?.uid,
        userName: auth.currentUser?.displayName || 'Admin'
      });

      showToast(`Stock mis à jour (+${delta})`, 'success');
    } catch (error) {
      console.error("Fast update failed:", safeStringify(error));
      showToast('Erreur lors de la mise à jour rapide', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    reset(product);
    setIsModalOpen(true);
  };

  const handleDelete = async (product: any) => {
    if (!product || !product.id) {
      console.error("Invalid product for deletion:", product);
      return;
    }
    setProductToDelete(product);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    try {
      setLoading(true);
      console.log("Starting deletion process for ID:", productToDelete.id);
      showToast('Suppression en cours...', 'info');
      
      // 1. Enregistrer le mouvement de sortie AVANT suppression
      try {
        await dbService.addDocument('stock_movements', {
          productId: productToDelete.id,
          productName: productToDelete.name,
          type: 'adjustment_out',
          quantity: productToDelete.stockQuantity || 0,
          previousStock: productToDelete.stockQuantity || 0,
          newStock: 0,
          reason: 'Suppression définitive du produit',
          createdAt: new Date(),
          userId: user?.uid || auth.currentUser?.uid || 'Unknown',
          userName: user?.displayName || auth.currentUser?.displayName || 'Admin'
        });
        console.log("Audit movement created");
      } catch (auditErr) {
        console.warn("Failed to audit product deletion:", auditErr);
      }

      // 2. Supprimer le produit
      await dbService.deleteDocument('products', productToDelete.id);
      
      // 3. Notification
      await notificationService.createNotification({
        type: 'deletion',
        title: 'Produit Supprimé',
        message: `Le produit "${productToDelete.name}" a été définitivement supprimé par ${userData?.displayName || user?.displayName || 'Admin'}.`,
        priority: 'medium',
        triggeredBy: user?.uid,
        triggeredByName: userData?.displayName || user?.displayName || 'Admin',
        metadata: {
          entityId: productToDelete.id,
          entityType: 'product',
          productName: productToDelete.name
        }
      });

      console.log("Delete successful");
      showToast('Produit supprimé avec succès', 'success');
      setProductToDelete(null);
    } catch (error: any) {
      console.error("Delete failed:", safeStringify(error));
      const message = error.message?.includes('permission') 
        ? "Action refusée : Vous n'avez pas les droits d'administrateur pour supprimer." 
        : error.message || "Erreur lors de la suppression";
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setIsBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    setLoading(true);
    try {
      let successCount = 0;
      let failCount = 0;
      
      for (const id of selectedIds) {
        const product = products.find(p => p.id === id);
        if (product) {
          try {
            // 1. Audit movement
            try {
              await dbService.addDocument('stock_movements', {
                productId: product.id,
                productName: product.name,
                type: 'adjustment_out',
                quantity: product.stockQuantity || 0,
                previousStock: product.stockQuantity || 0,
                newStock: 0,
                reason: 'Suppression groupée définitive',
                createdAt: new Date(),
                userId: user?.uid || auth.currentUser?.uid || 'Unknown',
                userName: user?.displayName || auth.currentUser?.displayName || 'Admin'
              });
            } catch (auditErr) {
              console.warn("Failed to audit bulk deletion for product:", product.id);
            }
            
            // 2. Delete
            await dbService.deleteDocument('products', id);
            
            // 3. Notification for each isn't ideal for bulk, but let's do a consolidated one after loop
            successCount++;
          } catch (err) {
            console.error(`Failed to delete product ${id}:`, safeStringify(err));
            failCount++;
          }
        }
      }

      if (successCount > 0) {
        await notificationService.createNotification({
          type: 'deletion',
          title: 'Suppression Groupée',
          message: `${successCount} produits ont été supprimés par ${userData?.displayName || user?.displayName || 'Admin'}.`,
          priority: 'high',
          triggeredBy: user?.uid,
          triggeredByName: userData?.displayName || user?.displayName || 'Admin',
          metadata: {
            entityType: 'product',
            count: successCount
          }
        });
      }
      
      showToast(`${successCount} produits supprimés avec success. ${failCount > 0 ? failCount + ' échecs' : ''}`, successCount > 0 ? 'success' : 'error');
      setSelectedIds([]);
      setIsBulkDeleteModalOpen(false);
    } catch (error: any) {
      showToast(`Erreur lors de la suppression groupée: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
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

  const filteredProducts = (products || []).filter(p => {
    if (!p) return false;
    const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (p.barcode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (p.sku || '').toLowerCase().includes(searchQuery.toLowerCase());
    
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
          {canManageStock && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/inventory/audits')} 
                className="text-xs h-9 font-black uppercase border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              >
                <ClipboardList size={16} className="mr-2" />
                Inventaires (Physique)
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsStockInModalOpen(true)} 
                className="text-xs h-9 font-bold uppercase border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                <PlusSquare size={16} className="mr-2" />
                Charger Stock (Achat)
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsReturnModalOpen(true)} 
                className="text-xs h-9 font-bold uppercase border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              >
                <RotateCcw size={16} className="mr-2" />
                Retour Fournisseur
              </Button>
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
      {canManageStock && (
        <button
          onClick={() => { setEditingProduct(null); reset({ minStockLevel: 5 }); setIsModalOpen(true); }}
          className="fixed bottom-24 right-6 w-14 h-14 bg-slate-800 text-white rounded-full shadow-2xl flex items-center justify-center lg:hidden z-40 active:scale-90 transition-transform"
        >
          <Plus size={28} />
        </button>
      )}
      
      {/* Categories Modal */}

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
              
              {canDeleteProducts && selectedIds.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleBulkDelete}
                  className="ml-2 text-xs h-9 uppercase font-bold text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100"
                >
                  <Trash2 size={16} className="mr-2" />
                  Supprimer ({selectedIds.length})
                </Button>
              )}
            </div>
          </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="mzsoft-table">
          <thead>
            <tr>
              {canDeleteProducts && (
                <th className="w-10 px-4">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    checked={filteredProducts.length > 0 && selectedIds.length === filteredProducts.length}
                    onChange={toggleSelectAll}
                  />
                </th>
              )}
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
                <tr key={product.id} className={cn(
                  "hover:bg-blue-50 transition-colors",
                  selectedIds.includes(product.id) && "bg-blue-50/50"
                )}>
                  {canDeleteProducts && (
                    <td className="px-4">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleSelectOne(product.id)}
                      />
                    </td>
                  )}
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
                  <td className="text-center px-2">
                    <div className="flex items-center justify-center gap-2 group/qty">
                      {canManageStock && (
                        <button 
                          onClick={() => handleQuickStock(product, -1)}
                          disabled={loading || product.stockQuantity <= 0}
                          className="w-6 h-6 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-all opacity-0 group-hover/qty:opacity-100 disabled:opacity-0"
                        >
                          <Minus size={12} />
                        </button>
                      )}
                      
                      <span className={cn(
                        "font-black text-sm min-w-[2.5rem]",
                        stockStatus === 'out' ? "text-rose-600" : stockStatus === 'low' ? "text-amber-500" : "text-slate-800"
                      )}>
                        {Number(product.stockQuantity || 0).toFixed(2).replace(/\.00$/, '')} <span className="text-[10px] text-slate-400 font-normal">{product.unit || 'u'}</span>
                        {product.sellInML && (
                           <p className="text-[9px] text-indigo-500 font-bold block">
                             ~ {(product.stockQuantity * (product.unitsPerRoll || 0)).toFixed(1)} ml
                           </p>
                        )}
                        {stockStatus === 'out' && (
                          <span className="block text-[8px] font-black bg-rose-600 text-white px-1 mt-1 uppercase tracking-widest text-center rounded-sm">
                            Rupture
                          </span>
                        )}
                      </span>

                      {canManageStock && (
                        <button 
                          onClick={() => handleQuickStock(product, 1)}
                          disabled={loading}
                          className="w-6 h-6 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all opacity-0 group-hover/qty:opacity-100 disabled:opacity-0"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="text-right font-black text-blue-600">
                    {formatCurrency(product.sellingPrice)}
                  </td>
                  <td className="text-right font-bold text-slate-400 italic text-[11px]">
                    {formatCurrency(product.purchasePrice)}
                  </td>
                  <td className="text-center">
                        <div className="flex justify-center gap-2">
                            {canManageStock && (
                             <button 
                               onClick={() => {
                                 if (!product.barcode) {
                                   showToast('Ce produit n\'a pas de code-barre configuré', 'error');
                                   return;
                                 }
                                 setProductForBarcode(product);
                                 setIsBarcodeModalOpen(true);
                               }} 
                               title="Imprimer Code-Barre"
                               className="p-2 text-slate-400 hover:text-indigo-600 transition-colors hover:bg-indigo-50 rounded-lg"
                             >
                               <Printer size={16} />
                             </button>
                           )}
                           {canManageStock && (
                             <button 
                               onClick={() => handleEdit(product)} 
                               title="Modifier"
                               className="p-2 text-slate-400 hover:text-blue-600 transition-colors hover:bg-blue-50 rounded-lg"
                             >
                               <Edit2 size={16} />
                             </button>
                           )}
                           {canDeleteProducts && (
                             <button 
                               onClick={() => {
                                 console.log("Delete button clicked for:", product.name);
                                 handleDelete(product);
                               }} 
                               disabled={loading}
                               title="Supprimer définitivement"
                               className="p-2 text-red-500 hover:text-red-700 transition-colors hover:bg-red-50 rounded-lg disabled:opacity-50 border border-slate-100 hover:border-red-200"
                             >
                               <Trash2 size={18} />
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
              {errors.name && <p className="text-rose-500 text-[10px] font-bold mt-1 uppercase">{(errors.name as any).message}</p>}
            </div>
            
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Catégorie *</label>
              <select {...register('categoryId')} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-slate-400 dark:text-white font-bold">
                <option value="">Sélectionner</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.categoryId && <p className="text-rose-500 text-[10px] font-bold mt-1 uppercase">{(errors.categoryId as any).message}</p>}
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Code-barre / Identifiant</label>
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input {...register('barcode')} className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-slate-400 dark:text-white font-mono" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Unité de mesure</label>
              <select {...register('unit')} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-slate-400 dark:text-white font-bold">
                <option value="u">Pièce (u)</option>
                <option value="ml">Mètre Linéaire (ml)</option>
                <option value="m">Mètre (m)</option>
                <option value="kg">Kilogramme (kg)</option>
                <option value="g">Gramme (g)</option>
                <option value="l">Litre (l)</option>
                <option value="bt">Boîte</option>
                <option value="pq">Paquet</option>
                <option value="ans">Ans (Années)</option>
              </select>
            </div>

            <div className="md:col-span-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-3xl border border-blue-100 flex items-center gap-4">
              <input 
                type="checkbox" 
                id="sellInML" 
                {...register('sellInML')}
                className="w-6 h-6 rounded-lg border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <label htmlFor="sellInML" className="block text-sm font-black text-blue-900 uppercase tracking-tight cursor-pointer">
                  Vendre au Mètre Linéaire (ML)
                </label>
                <p className="text-[10px] font-bold text-blue-600 uppercase">Active la gestion fractionnée pour les câbles, tuyaux, etc.</p>
              </div>
            </div>

            {/* Champs ML */}
            <div className={cn(
              "md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 transition-all overflow-hidden",
              watch('sellInML') ? "max-h-96 opacity-100 mb-2" : "max-h-0 opacity-0"
            )}>
               <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                 <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-2">Conversion (ML par Unité)</label>
                 <div className="flex items-center gap-2">
                   <input 
                     type="number" 
                     step="0.01" 
                     {...register('unitsPerRoll')} 
                     className="w-full px-4 py-2 bg-white rounded-xl border-none outline-none focus:ring-2 focus:ring-indigo-400 font-bold" 
                     placeholder="Ex: 100"
                   />
                   <span className="text-xs font-black text-indigo-400">ML</span>
                 </div>
                 <p className="text-[9px] text-indigo-400 font-bold mt-1 uppercase italic">Combien de ML contient une unité entière ?</p>
               </div>
               <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                 <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-2">Prix de vente au ML (DA)</label>
                 <input 
                   type="number" 
                   step="0.01" 
                   {...register('pricePerML')} 
                   className="w-full px-4 py-2 bg-white rounded-xl border-none outline-none focus:ring-2 focus:ring-indigo-400 font-bold" 
                   placeholder="Ex: 50"
                 />
                  <p className="text-[9px] text-indigo-400 font-bold mt-1 uppercase italic">Prix facturé au client pour 1 ML</p>
               </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Tarification (DA)</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Achat</p>
                  <input type="number" step="0.01" {...register('purchasePrice', { valueAsNumber: true })} className="w-full px-4 py-2 bg-white dark:bg-slate-800 rounded-xl outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-slate-400 dark:text-white font-bold" />
                  {errors.purchasePrice && <p className="text-rose-500 text-[9px] font-bold mt-1 uppercase">{(errors.purchasePrice as any).message}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Vente</p>
                  <input type="number" step="0.01" {...register('sellingPrice', { valueAsNumber: true })} className="w-full px-4 py-2 bg-white dark:bg-slate-800 rounded-xl outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-slate-400 dark:text-white font-bold" />
                  {errors.sellingPrice && <p className="text-rose-500 text-[9px] font-bold mt-1 uppercase">{(errors.sellingPrice as any).message}</p>}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-black uppercase tracking-widest text-emerald-500 mb-4">Inventaire</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Stock Actuel</p>
                  <input type="number" {...register('stockQuantity', { valueAsNumber: true })} className="w-full px-4 py-2 bg-white dark:bg-slate-800 rounded-xl outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 dark:text-white font-bold" />
                  {errors.stockQuantity && <p className="text-rose-500 text-[9px] font-bold mt-1 uppercase">{(errors.stockQuantity as any).message}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Seuil Alerte</p>
                  <input type="number" {...register('minStockLevel', { valueAsNumber: true })} className="w-full px-4 py-2 bg-white dark:bg-slate-800 rounded-xl outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 dark:text-white font-bold" />
                  {errors.minStockLevel && <p className="text-rose-500 text-[9px] font-bold mt-1 uppercase">{(errors.minStockLevel as any).message}</p>}
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Notes / Description</label>
              <textarea {...register('description')} rows={3} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-slate-400 dark:text-white transition-all resize-none" placeholder="Informations complémentaires..." />
            </div>
          </div>

          <div className="pt-4 flex justify-between gap-3">
            <div>
              {editingProduct && editingProduct.barcode && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setProductForBarcode(editingProduct);
                    setIsBarcodeModalOpen(true);
                  }}
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                >
                  <Printer size={18} className="mr-2" />
                  Imprimer Code-Barre
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Annuler</Button>
              <Button type="submit" size="lg" className="px-10" isLoading={isSubmitting}>
                {editingProduct ? 'Mettre à jour' : 'Créer Produit'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <BarcodePrintModal 
        products={products}
        initialProduct={productForBarcode} 
        isOpen={isBarcodeModalOpen} 
        onClose={() => {
          setIsBarcodeModalOpen(false);
          setProductForBarcode(null);
        }} 
      />

      <CategoryModal isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} />
      <StockInModal products={products} isOpen={isStockInModalOpen} onClose={() => setIsStockInModalOpen(false)} />
      <PurchaseReturnModal 
        products={products} 
        suppliers={suppliers} 
        isOpen={isReturnModalOpen} 
        onClose={() => setIsReturnModalOpen(false)} 
      />

      {/* Modal de Confirmation de Suppression */}
      <Modal
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        title="Confirmation de Suppression"
        size="sm"
      >
        <div className="p-4 text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={32} className="text-rose-500" />
          </div>
          <h3 className="text-lg font-black text-slate-800 mb-2">Supprimer définitivement ?</h3>
          <p className="text-sm text-slate-500 mb-6">
            Vous êtes sur le point de supprimer <span className="font-bold text-slate-900">"{productToDelete?.name}"</span>. 
            Cette action est irréversible.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setProductToDelete(null)} disabled={loading}>
              Annuler
            </Button>
            <Button className="flex-1 bg-rose-600 hover:bg-rose-700 text-white" onClick={confirmDelete} isLoading={loading}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmationModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={confirmBulkDelete}
        title="Suppression Groupée"
        message={`Voulez-vous vraiment supprimer définitivement les ${selectedIds.length} produits sélectionnés ? Cette action est irréversible.`}
        confirmText={`Supprimer (${selectedIds.length})`}
        variant="danger"
        isLoading={loading}
      />
    </div>
  );
};

export default Inventory;
