import React, { useState, useEffect, useMemo } from 'react';
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
import { excelService } from '../services/excelService';
import { format } from 'date-fns';

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
  photoBase64: z.string().optional(),
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
  
  const { user, userData, isAdmin, isSuperAdmin, hasPermission } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isStockInModalOpen, setIsStockInModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  
  const canViewProducts = hasPermission('canViewProducts');
  const canAddProducts = hasPermission('canAddProducts');
  const canEditProducts = hasPermission('canEditProducts');
  const canDeleteProducts = hasPermission('canDeleteProducts');
  const canManageStock = hasPermission('canManageStock');
  const canManageCategories = hasPermission('canManageCategories');
  const canPerformInventory = hasPermission('canPerformInventory');
  const canExportData = hasPermission('canExportData');
  const canPrint = hasPermission('canPrint');

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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

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
  const photoBase64Value = watch('photoBase64');

  const compressAndSetPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setValue('photoBase64', dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

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
          if (settings?.wooEnabled) {
            showToast("Produit synchronisé sur WordPress WooCommerce", "success");
          }
          
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
            if (settings?.wooEnabled) {
              showToast("Produit créé sur WordPress WooCommerce", "success");
            }
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
      if (settings?.wooEnabled) {
        showToast("Mise à jour poussée vers WooCommerce", "success");
      }
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
      setProductToDelete(null);
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

  const handleExportInventoryExcel = async () => {
    try {
      const data = filteredProducts.map(p => ({
        name: p.name,
        category: categories.find(c => c.id === p.categoryId)?.name || 'N/A',
        sku: p.sku || '-',
        quantity: p.stockQuantity,
        unit: p.unit || 'u',
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        valuationAchat: p.stockQuantity * p.purchasePrice,
        valuationVente: p.stockQuantity * p.sellingPrice,
        status: p.stockQuantity <= 0 ? 'RUPTURE' : (p.stockQuantity <= (p.minStockLevel || 5) ? 'ALERTE' : 'SAIN')
      }));

      await excelService.generateProfessionalReport({
        filename: `Inventaire_Valorise_${format(new Date(), 'yyyyMMdd')}`,
        title: 'RAPPORT DE VALORISATION ET ÉTAT DES STOCKS',
        subtitle: `Inventaire global au ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
        columns: [
          { header: 'Désignation Produit', key: 'name', width: 40 },
          { header: 'Catégorie', key: 'category', width: 20 },
          { header: 'Code SKU', key: 'sku', width: 15 },
          { header: 'Qté', key: 'quantity', width: 10 },
          { header: 'Unité', key: 'unit', width: 8 },
          { header: 'Prix Achat (DA)', key: 'purchasePrice', width: 15 },
          { header: 'Prix Vente (DA)', key: 'sellingPrice', width: 15 },
          { header: 'Val. Achat Total', key: 'valuationAchat', width: 20 },
          { header: 'Val. Vente Total', key: 'valuationVente', width: 20 },
          { header: 'État', key: 'status', width: 15 }
        ],
        data
      });
      showToast("Rapport Excel professionnel généré", "success");
    } catch (error) {
      console.error('Export Error:', error);
      showToast("Erreur lors de l'export Excel", "error");
    }
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

  // Reset page when switching filters
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, stockFilter]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage]);

  const stockStats = useMemo(() => {
    const prodList = products || [];
    let totalProducts = prodList.length;
    let totalQty = 0;
    let totalPurchaseValuation = 0;
    let totalSalesValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    prodList.forEach(p => {
      totalQty += p.stockQuantity || 0;
      totalPurchaseValuation += (p.stockQuantity || 0) * (p.purchasePrice || 0);
      totalSalesValuation += (p.stockQuantity || 0) * (p.sellingPrice || 0);
      if (p.stockQuantity <= 0) {
        outOfStockCount++;
      } else if (p.stockQuantity <= (p.minStockLevel || 5)) {
        lowStockCount++;
      }
    });

    return {
      totalProducts,
      totalQty,
      totalPurchaseValuation,
      totalSalesValuation,
      lowStockCount,
      outOfStockCount
    };
  }, [products]);

  return (
    <div className="space-y-4">
      {/* Premium WooCommerce Styled Header Tag */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white border border-slate-200 shadow-sm rounded-2xl text-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-slate-100 text-[#0066FF] rounded-xl p-2 border border-slate-200">
              <Package size={22} />
            </span>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-850">Gestion de Stock et Inventaires</h1>
          </div>
          <p className="text-slate-450 text-[10px] font-black uppercase tracking-wider mt-1">
            MZ-ERP PRO • Module d'Inventaire et de Valorisation Intégral (PUMP Actif)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPerformInventory && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/inventory/audits')} 
              className="text-xs h-9 font-black uppercase border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-xl"
            >
              <ClipboardList size={16} className="mr-2 text-slate-400" />
              Inventaires (Physique)
            </Button>
          )}
          {canManageStock && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsStockInModalOpen(true)} 
                className="text-xs h-9 font-bold uppercase border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-xl"
              >
                <PlusSquare size={16} className="mr-2 text-slate-400" />
                Charger Stock (Achat)
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsReturnModalOpen(true)} 
                className="text-xs h-9 font-bold uppercase border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-xl"
              >
                <RotateCcw size={16} className="mr-2 text-slate-400" />
                Retour Fournisseur
              </Button>
            </>
          )}
          {canManageCategories && (
            <Button variant="outline" size="sm" onClick={() => setIsCatModalOpen(true)} className="text-xs h-9 font-bold uppercase border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-xl">
              <Tags size={16} className="mr-2" />
              Catégories
            </Button>
          )}
          {canAddProducts && (
            <Button size="sm" onClick={() => { setEditingProduct(null); reset({ minStockLevel: 5 }); setIsModalOpen(true); }} className="text-xs h-9 bg-[#0066FF] hover:bg-[#0055DD] text-white font-extrabold uppercase shadow-sm hover:shadow-md transition-all rounded-xl border-none">
              <Plus size={16} className="mr-2" />
              Ajouter Produit
            </Button>
          )}
        </div>
      </div>

      {/* WooCommerce Stock Manager Top Dashboard Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 shadow-xs p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Désignations Produits</p>
            <h3 className="text-xl font-black text-slate-800 font-mono mt-1">{stockStats.totalProducts} Réf.</h3>
            <span className="text-[9px] text-[#0061ff] font-black uppercase mt-0.5 block">Total Catalogue</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-[#0061ff]">
            <Tags size={18} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 shadow-xs p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quantités Globales</p>
            <h3 className="text-xl font-black text-slate-800 font-mono mt-1">
              {Number(stockStats.totalQty).toFixed(2).replace(/\.00$/, '')} <span className="text-xs font-bold text-slate-400 font-sans">unités</span>
            </h3>
            <span className="text-[9px] text-emerald-600 font-black uppercase mt-0.5 block">Articles Physiques</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Package size={18} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 shadow-xs p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valeur d'Achat (PUMP)</p>
            <h3 className="text-base font-black text-slate-800 font-mono mt-1 text-[#0274be]">
              {formatCurrency(stockStats.totalPurchaseValuation)} DA
            </h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase block mt-0.5">
              Vente Est: <span className="text-[#0061ff] font-black">{formatCurrency(stockStats.totalSalesValuation)} DA</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-[#0274be]">
            <Box size={18} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 shadow-xs p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Alertes de Stock</p>
            <div className="flex gap-1.5 mt-1">
              <span className={cn(
                "text-[9px] font-black px-1.5 py-0.5 rounded",
                stockStats.outOfStockCount > 0 ? "bg-rose-50 text-rose-700 border border-rose-100" : "bg-slate-50 text-slate-400"
              )}>
                {stockStats.outOfStockCount} Rupture{stockStats.outOfStockCount > 1 ? 's' : ''}
              </span>
              <span className={cn(
                "text-[9px] font-black px-1.5 py-0.5 rounded",
                stockStats.lowStockCount > 0 ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-slate-50 text-slate-400"
              )}>
                {stockStats.lowStockCount} Alerte{stockStats.lowStockCount > 1 ? 's' : ''}
              </span>
            </div>
            <span className="text-[9px] text-[#0061ff] font-black uppercase mt-1 block">Seuils RUPTURE / FAIBLE</span>
          </div>
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center",
            (stockStats.outOfStockCount > 0 || stockStats.lowStockCount > 0) ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-slate-50 text-slate-400"
          )}>
            <AlertCircle size={18} />
          </div>
        </div>
      </div>

      {/* Floating Action Button for Mobile */}
      {canAddProducts && (
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
              
              {canExportData && (
                <Button variant="outline" size="sm" onClick={handleExportInventoryExcel} className="hidden sm:flex ml-2 text-xs h-9 uppercase font-bold border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                  <Download size={16} className="mr-2" />
                  Export Excel Pro
                </Button>
              )}
              
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

      <div className="overflow-x-auto border border-slate-200/80 bg-white rounded-2xl">
        <table className="mzsoft-table">
          <thead>
            <tr>
              {canDeleteProducts && (
                <th className="w-10 px-4">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-slate-300 text-[#0061ff] focus:ring-[#0061ff] cursor-pointer"
                    checked={filteredProducts.length > 0 && selectedIds.length === filteredProducts.length}
                    onChange={toggleSelectAll}
                  />
                </th>
              )}
              <th className="w-12">Visuel</th>
              <th>Désignation</th>
              <th>Catégorie</th>
              <th className="text-center w-36">Quantité</th>
              <th>Statut WooCommerce</th>
              <th className="text-right">Prix Vente</th>
              <th className="text-right">Prix Achat</th>
              <th className="w-24 text-center text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.map((product) => {
              const stockStatus = product.stockQuantity <= 0 ? 'out' : 
                                 product.stockQuantity <= (product.minStockLevel || 5) ? 'low' : 'ok';
              
              return (
                <tr key={product.id} className={cn(
                  "hover:bg-[#0061ff]/5 transition-colors border-b border-slate-100",
                  selectedIds.includes(product.id) && "bg-blue-50/40"
                )}>
                  {canDeleteProducts && (
                    <td className="px-4">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-slate-300 text-[#0061ff] focus:ring-[#0061ff] cursor-pointer"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleSelectOne(product.id)}
                      />
                    </td>
                  )}
                  <td>
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-500 font-extrabold shrink-0 shadow-2xs">
                      {product.photoBase64 ? (
                        <img src={product.photoBase64} alt="Produit" className="w-full h-full object-cover" />
                      ) : (
                        <Box size={14} className="text-[#0061ff]" />
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="font-extrabold text-slate-800 text-xs uppercase leading-tight tracking-tight">{product.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                         <span className="text-[9px] font-mono leading-none font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded border border-slate-200">
                           {product.sku || 'N/A'}
                         </span>
                         {product.barcode && (
                           <span className="text-[9px] font-mono leading-none text-slate-500 flex items-center gap-0.5">
                             <Barcode size={10} className="text-slate-400" /> {product.barcode}
                           </span>
                         )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="text-[10px] font-extrabold text-slate-600 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                      {categories.find(c => c.id === product.categoryId)?.name || 'N/A'}
                    </span>
                  </td>
                  <td className="text-center px-1">
                    <div className="flex items-center justify-center gap-1">
                      {canManageStock && (
                        <button 
                          type="button"
                          onClick={() => handleQuickStock(product, -1)}
                          disabled={loading || product.stockQuantity <= 0}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-300 transition-all shadow-xs active:scale-94 disabled:opacity-20 disabled:pointer-events-none"
                          title="Décrémenter stock"
                        >
                          <Minus size={11} className="stroke-[3]" />
                        </button>
                      )}
                      
                      <div className="flex flex-col items-center justify-center min-w-[4rem] px-1 py-0.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className={cn(
                          "font-mono font-black text-xs",
                          stockStatus === 'out' ? "text-rose-600" : stockStatus === 'low' ? "text-amber-500" : "text-emerald-700"
                        )}>
                          {Number(product.stockQuantity || 0).toFixed(2).replace(/\.00$/, '')}
                        </span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase leading-none">
                          {product.unit || 'u'}
                        </span>
                        {product.sellInML && (
                           <p className="text-[8px] text-indigo-600 font-black block leading-none mt-0.5">
                             {(product.stockQuantity * (product.unitsPerRoll || 0)).toFixed(1)}m
                           </p>
                        )}
                      </div>

                      {canManageStock && (
                        <button 
                          type="button"
                          onClick={() => handleQuickStock(product, 1)}
                          disabled={loading}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-all shadow-xs active:scale-94 disabled:opacity-20"
                          title="Incrémenter stock"
                        >
                          <Plus size={11} className="stroke-[3]" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    {stockStatus === 'ok' ? (
                      <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        En Stock
                      </span>
                    ) : stockStatus === 'low' ? (
                      <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                        Stock faible
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                        Rupture
                      </span>
                    )}
                  </td>
                  <td className="text-right font-black text-[#0061ff] text-xs font-mono">
                    {formatCurrency(product.sellingPrice)} DA
                  </td>
                  <td className="text-right font-bold text-slate-500 text-[11px] font-mono">
                    {formatCurrency(product.purchasePrice)} DA
                  </td>
                  <td className="text-center">
                        <div className="flex justify-center gap-2">
                            {canPrint && (
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
                           {canEditProducts && (
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
        
        {filteredProducts.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-50 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Affichage { (currentPage - 1) * itemsPerPage + 1 } à { Math.min(currentPage * itemsPerPage, filteredProducts.length) } sur { filteredProducts.length } produits
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="text-xs uppercase font-black tracking-wider"
              >
                Précédent
              </Button>
              <span className="text-xs font-black text-slate-700 px-3 py-1 bg-white border border-slate-200 rounded-lg">
                Page {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="text-xs uppercase font-black tracking-wider"
              >
                Suivant
              </Button>
            </div>
          </div>
        )}

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
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Visuel du produit</label>
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200">
                <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200 overflow-hidden shrink-0 shadow-sm">
                  {photoBase64Value ? (
                    <img src={photoBase64Value} alt="Visual" className="w-full h-full object-cover" />
                  ) : (
                    <Box size={24} className="text-[#0061ff]" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex gap-2">
                    <label className="px-4 py-2 bg-[#0061ff] text-white hover:bg-[#004ecc] cursor-pointer text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition-all active:scale-95">
                      Choisir une photo
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            compressAndSetPhoto(file);
                          }
                        }} 
                      />
                    </label>
                    {photoBase64Value && (
                      <button 
                        type="button" 
                        onClick={() => setValue('photoBase64', '')}
                        className="px-4 py-2 border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase select-none">Format JPEG/PNG. L'image est automatiquement optimisée pour les performances.</p>
                </div>
              </div>
            </div>

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
