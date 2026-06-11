import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../firebase/db';
import { collection, runTransaction, doc, serverTimestamp, orderBy, increment, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { useCollection } from '../hooks/useCollection';
import { useSession } from '../context/SessionContext';
import { useSettings } from '../context/SettingsContext';
import { Product, Category, SaleItem, Customer, Project } from '../types';
import { cn, formatCurrency, cleanObject, safeStringify } from '../lib/utils';
import { useNotification } from '../context/NotificationContext';
import { notificationService } from '../services/notificationService';
import { Button } from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import PromptModal from '../components/ui/PromptModal';
import { 
  Plus, 
  Minus, 
  Trash2, 
  Search, 
  User, 
  CreditCard, 
  Banknote, 
  ShoppingCart,
  Barcode,
  X,
  CheckCircle2,
  Package,
  RefreshCw,
  Zap,
  History,
  LayoutGrid,
  ChevronRight,
  Printer,
  Calendar,
  Layers,
  AlertCircle,
  ArrowLeft,
  HardHat,
  Box
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pdfService } from '../services/pdfService';
import { format } from 'date-fns';
import StartSessionModal from '../components/StartSessionModal';
import DailyClosingModal from '../components/DailyClosingModal';
import BarcodePrintModal from '../components/BarcodePrintModal';

const POS: React.FC = () => {
  const { user, userData, hasPermission } = useAuth();
  const { activeSession, loading: sessionLoading, updateSessionTotals } = useSession();
  const { settings } = useSettings();
  const { showToast } = useNotification();
  const navigate = useNavigate();

  const currentUid = user?.uid || (userData && 'id' in userData ? (userData as any).id : null);

  const canSell = hasPermission ? hasPermission('canManageSales') : false;
  const canPrint = hasPermission ? hasPermission('canPrint') : false;
  
  const { data: products, loading: productsLoading } = useCollection<Product>('products', [orderBy('name')]);
  const { data: categories } = useCollection<Category>('categories', [orderBy('name')]);
  const { data: customers } = useCollection<Customer>('customers', [orderBy('name')]);
  const { data: projects } = useCollection<Project>('projects', [orderBy('name')]);

  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [customCustomerName, setCustomCustomerName] = useState('');
  const [customInfoOverride, setCustomInfoOverride] = useState(settings.customCompanyInfo || '');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [mlProductToPrompt, setMlProductToPrompt] = useState<Product | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [lastSale, setLastSale] = useState<any>(null);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [productForBarcode, setProductForBarcode] = useState<Product | null>(null);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  
  const { data: rawPendingSales } = useCollection<any>('pending_sales', currentUid ? [
    where('userId', '==', activeSession?.userId || currentUid)
  ] : []);

  const pendingSales = useMemo(() => {
    if (!rawPendingSales) return [];
    return [...rawPendingSales].sort((a: any, b: any) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return timeB - timeA;
    });
  }, [rawPendingSales]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);
  const taxRate = useMemo(() => (settings.taxRate || 19) / 100, [settings.taxRate]);
  const tax = useMemo(() => settings.useTax ? (subtotal - discount) * taxRate : 0, [subtotal, discount, taxRate, settings.useTax]);
  const total = useMemo(() => Math.max(0, subtotal - discount + tax), [subtotal, discount, tax]);
  const change = useMemo(() => {
    const received = Number(receivedAmount) || 0;
    return received > 0 ? (received - total) : 0;
  }, [receivedAmount, total]);

  const scannerInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const receivedAmountInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    setCustomInfoOverride(settings.customCompanyInfo || '');
  }, [settings.customCompanyInfo]);

  // Refs for auto-save on unmount
  const cartRef = useRef<SaleItem[]>([]);
  const customerRef = useRef<Customer | null>(null);
  const customNameRef = useRef<string>('');
  const discountRef = useRef<number>(0);
  const subtotalRef = useRef<number>(0);
  const totalRef = useRef<number>(0);

  // Redirection logic removed, now we show StartSessionModal
  
  const handleSuspendSale = useCallback(async () => {
    if (cart.length === 0 || isSuspending || !currentUid) return;
    
    setIsSuspending(true);
    try {
      await dbService.addDocument('pending_sales', {
        userId: activeSession?.userId || currentUid,
        userName: activeSession?.userName || user?.displayName || userData?.displayName || 'Vendeur',
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || customCustomerName || 'Client de passage',
        items: cart,
        discount,
        subtotal,
        totalAmount: total,
        createdAt: serverTimestamp(),
      });
      
      setCart([]);
      setDiscount(0);
      setSelectedCustomer(null);
      setReceivedAmount('');
      showToast("Vente mise en instance", "success");
    } catch (error) {
      showToast("Erreur lors de la mise en instance", "error");
    } finally {
      setIsSuspending(false);
    }
  }, [cart, isSuspending, currentUid, activeSession, user, userData, selectedCustomer, customCustomerName, discount, subtotal, total, showToast]);

  const confirmRecall = useCallback(async (pending: any) => {
    if (!pending) return;
    setCart(pending.items || []);
    setDiscount(pending.discount || 0);
    if (pending.customerId) {
      const cust = customers.find(c => c.id === pending.customerId);
      setSelectedCustomer(cust || { id: pending.customerId, name: pending.customerName } as Customer);
      setCustomCustomerName('');
    } else {
      setSelectedCustomer(null);
      setCustomCustomerName(pending.customerName === 'Client de passage' ? '' : pending.customerName);
    }
    
    // Delete from pending after recall
    await dbService.deleteDocument('pending_sales', pending.id);
    setPendingToRecall(null);
    setShowPendingModal(false);
    showToast("Vente récupérée", "success");
  }, [customers, showToast]);

  const recallPendingSale = (pending: any) => {
    if (cart.length > 0) {
      setPendingToRecall(pending);
    } else {
      confirmRecall(pending);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return products.filter(p => {
      const pName = p.name || '';
      const pSku = p.sku || '';
      const pBarcode = p.barcode || '';
      const matchesSearch = pName.toLowerCase().includes(lowerQuery) || 
                           pSku.toLowerCase().includes(lowerQuery) ||
                           pBarcode.includes(searchQuery);
      const matchesCategory = selectedCategory ? p.categoryId === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const addToCart = useCallback((product: Product, quantity: number = 1, isML: boolean = false, mlLength: number = 0) => {
    const stock = Number(product.stockQuantity) || 0;
    
    if (stock <= 0) {
      showToast(`${product.name} est en rupture de stock`, 'error');
      return;
    }

    if (product.sellInML && !isML) {
      setMlProductToPrompt(product);
      return;
    }

    const qtyToAdd = isML ? mlLength : quantity;
    const priceToUse = isML ? (product.pricePerML || product.sellingPrice / (product.unitsPerRoll || 1)) : product.sellingPrice;
    const unitToUse = isML ? 'ml' : (product.unit || 'u');

    // Find existing item in cart to validate stock properly
    const existingItem = cart.find(item => item.id === product.id && item.unit === unitToUse);
    const currentQtyInCart = existingItem ? existingItem.quantity : 0;
    const totalQtyAfterAdd = currentQtyInCart + qtyToAdd;

    // Validation stock
    const totalUnitsNeeded = isML ? totalQtyAfterAdd / (product.unitsPerRoll || 1) : totalQtyAfterAdd;
    if (totalUnitsNeeded > stock) {
      showToast(`Stock limité pour ${product.name}`, 'warning');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.unit === unitToUse);
      if (existing) {
        return prev.map(item => 
          (item.id === product.id && item.unit === unitToUse)
            ? { ...item, quantity: totalQtyAfterAdd, total: totalQtyAfterAdd * item.price } 
            : item
        );
      }
      
      return [...prev, { 
        id: product.id, 
        name: product.name, 
        price: priceToUse, 
        quantity: qtyToAdd, 
        unit: unitToUse,
        total: qtyToAdd * priceToUse
      }];
    });

    if (isML) setMlProductToPrompt(null);
  }, [cart, showToast]);

  const updateQuantity = useCallback((id: string, delta: number, unit: string = 'u') => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const stock = Number(product.stockQuantity) || 0;

    const item = cart.find(i => i.id === id && i.unit === unit);
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) return;

    // Validation stock avec conversion
    const unitsNeeded = unit === 'ml' ? newQty / (product.unitsPerRoll || 1) : newQty;
    if (delta > 0 && unitsNeeded > stock) {
      showToast(`Stock limité pour ${item.name}`, 'warning');
      return;
    }

    setCart(prev => prev.map(i => {
      if (i.id === id && i.unit === unit) {
        return { ...i, quantity: newQty, total: Number((newQty * i.price).toFixed(2)) };
      }
      return i;
    }));
  }, [products, cart, showToast]);

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const [isDeletingPending, setIsDeletingPending] = useState<string | null>(null);
  const [pendingToRecall, setPendingToRecall] = useState<any | null>(null);
  const [pendingToDelete, setPendingToDelete] = useState<any | null>(null);

  const toggleUnit = (id: string, currentUnit: string) => {
    const product = products.find(p => p.id === id);
    if (!product || !product.sellInML) return;

    setCart(prev => prev.map(item => {
      if (item.id === id && item.unit === currentUnit) {
        const isSwitchingToML = currentUnit === 'u';
        const nextUnit = isSwitchingToML ? 'ml' : 'u';
        
        // Conversion de prix et quantité
        let nextPrice = isSwitchingToML 
          ? (product.pricePerML || product.sellingPrice / (product.unitsPerRoll || 1)) 
          : product.sellingPrice;
        
        let nextQty = isSwitchingToML 
          ? item.quantity * (product.unitsPerRoll || 1) 
          : Math.ceil(item.quantity / (product.unitsPerRoll || 1));

        return { 
          ...item, 
          unit: nextUnit, 
          price: nextPrice, 
          quantity: nextQty,
          total: Number((nextQty * nextPrice).toFixed(2))
        };
      }
      return item;
    }));
  };

  const handleSale = useCallback(async () => {
    if (cart.length === 0 || isProcessing || !currentUid) return;

    setIsProcessing(true);
    const saleId = `SALE-${Date.now()}`;
    const lowStockAlerts: any[] = [];

    try {
      await runTransaction(db, async (transaction) => {
        const productSnapshots: Record<string, any> = {};

        for (const item of cart) {
          const productRef = doc(db, 'products', item.id);
          const productSnap = await transaction.get(productRef);
          
          if (!productSnap.exists()) throw new Error(`Le produit ${item.name} n'existe plus.`);
          
          const productData = productSnap.data() as Product;
          const currentStock = Number(productData.stockQuantity) || 0;
          
          let deductionNeeded = item.quantity;
          if (productData.sellInML && item.unit === 'ml') {
            deductionNeeded = item.quantity / (productData.unitsPerRoll || 1);
          }
          
          if (currentStock < deductionNeeded) {
            throw new Error(`Stock insuffisant pour ${item.name}. Disponible: ${currentStock.toFixed(2)} rolls`);
          }
          productSnapshots[item.id] = { currentStock, productData };
          
          // Check for low stock alert
          const nextStock = currentStock - deductionNeeded;
          if (nextStock <= (productData.minStockLevel || 5)) {
            lowStockAlerts.push({
              productId: item.id,
              name: item.name,
              stock: nextStock,
              min: productData.minStockLevel || 5
            });
          }
        }

        const saleRef = doc(collection(db, 'sales'), saleId);
        const invoiceRef = doc(collection(db, 'invoices'), saleId); // Use same ID for consistency
        const finalCustomerName = selectedCustomer ? selectedCustomer.name : (customCustomerName || 'Client de passage');
        const amountReceived = Number(receivedAmount) || total;
        const balanceRemaining = Math.max(0, total - amountReceived);
        
        const saleData = {
          userId: activeSession?.userId || currentUid,
          userName: activeSession?.userName || user?.displayName || userData?.displayName || user?.email?.split('@')[0] || 'Vendeur',
          sessionId: activeSession?.id || null,
          customerId: selectedCustomer?.id || null,
          customerName: finalCustomerName,
          projectId: selectedProject?.id || null,
          projectName: selectedProject?.name || null,
          items: cart.map(item => ({
            productId: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity
          })),
          subtotal,
          taxAmount: tax,
          taxRate: settings.useTax ? taxRate : 0,
          discount,
          totalAmount: total,
          receivedAmount: amountReceived,
          change: change > 0 ? change : 0,
          paymentMethod,
          status: 'completed' as const,
          source: 'pos',
          customCompanyInfo: customInfoOverride || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        transaction.set(saleRef, cleanObject(saleData));

        // Create Invoice Record for history and debt
        const invoiceData = {
          invoiceNumber: saleId,
          sessionId: activeSession?.id || null,
          items: cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price, total: item.price * item.quantity })),
          subtotal,
          taxAmount: tax,
          taxRate: settings.useTax ? taxRate : 0,
          discount,
          totalAmount: total,
          amountPaid: amountReceived - (change > 0 ? change : 0),
          balance: balanceRemaining,
          customerName: finalCustomerName,
          customerId: selectedCustomer?.id || undefined,
          projectId: selectedProject?.id || undefined,
          projectName: selectedProject?.name || undefined,
          userId: currentUid,
          userName: saleData.userName,
          status: balanceRemaining > 0 ? 'pending' : 'paid',
          paymentMethod,
          paymentStatus: balanceRemaining > 0 ? (amountReceived > 0 ? 'partially_paid' : 'pending') : 'paid',
          paymentHistory: amountReceived > 0 ? [{
            amount: amountReceived - (change > 0 ? change : 0),
            date: new Date(),
            method: paymentMethod,
            userId: currentUid,
            userName: saleData.userName
          }] : [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          customCompanyInfo: customInfoOverride || null
        };

        transaction.set(invoiceRef, cleanObject(invoiceData));

        // Direct flux calculation: Update active session totals if it exists
        if (activeSession) {
          const sessionRef = doc(db, 'daily_closings', activeSession.id);
          const isCash = paymentMethod === 'cash';
          const effectivePayment = amountReceived - (change > 0 ? change : 0);
          transaction.update(sessionRef, {
            cashSales: increment(isCash ? effectivePayment : 0),
            transferSales: increment(!isCash ? effectivePayment : 0),
            totalSales: increment(effectivePayment),
            salesCount: increment(1),
            netCash: increment(isCash ? effectivePayment : 0),
            updatedAt: serverTimestamp()
          });
        }

        if (selectedCustomer) {
          const customerRef = doc(db, 'customers', selectedCustomer.id);
          const effectivePayment = amountReceived - (change > 0 ? change : 0);
          transaction.update(customerRef, {
            totalSpent: increment(total),
            totalPaid: increment(effectivePayment),
            totalDebt: increment(total - effectivePayment),
            updatedAt: serverTimestamp()
          });
        }

        for (const item of cart) {
          const productRef = doc(db, 'products', item.id);
          const { currentStock, productData } = productSnapshots[item.id];

          let deduction = item.quantity;
          if (productData.sellInML && item.unit === 'ml') {
            deduction = item.quantity / (productData.unitsPerRoll || 1);
          }

          transaction.update(productRef, {
            stockQuantity: increment(-deduction),
            updatedAt: serverTimestamp()
          });

          const movementRef = doc(collection(db, 'stock_movements'));
          transaction.set(movementRef, cleanObject({
            productId: item.id,
            productName: item.name,
            type: 'sale',
            quantity: item.quantity,
            unit: item.unit || 'u',
            previousStock: currentStock,
            newStock: currentStock - deduction,
            reason: `Vente ${saleId}`,
            referenceId: saleId,
            userId: currentUid,
            userName: user?.displayName || userData?.displayName || 'Vendeur',
            createdAt: serverTimestamp()
          }));
        }
      });
      
      // Trigger notifications
      if (settings.notifyLowStock && lowStockAlerts.length > 0) {
        for (const alert of lowStockAlerts) {
          await notificationService.createNotification({
            type: 'low_stock',
            title: 'Stock Faible',
            message: `Le produit "${alert.name}" est descendu à ${alert.stock.toFixed(2)} (Seuil: ${alert.min})`,
            priority: alert.stock <= 0 ? 'critical' : 'medium',
            metadata: {
               productId: alert.productId,
               entityId: alert.productId,
               entityType: 'product',
               link: `/inventory?id=${alert.productId}`,
               currentStock: alert.stock,
               minLevel: alert.min
            },
            triggeredByName: 'Système Automatique'
          });
        }
      }

      // Create Sale Notification
      await notificationService.createNotification({
        type: 'sale',
        title: 'Nouvelle Vente Enregistrée',
        message: `Une vente de ${formatCurrency(total)} par ${userData?.displayName || user?.displayName || 'Vendeur'} vient d'être effectuée.`,
        priority: 'low',
        triggeredBy: user?.uid,
        triggeredByName: userData?.displayName || user?.displayName || 'Vendeur',
        metadata: {
          link: '/sales-history',
          entityId: saleId,
          entityType: 'sale',
          amount: total
        }
      });
      
      const saleDataForInvoice = {
        invoiceNumber: saleId,
        date: new Date(),
        items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer ? selectedCustomer.name : (customCustomerName || 'Client de passage'),
        subtotal,
        taxAmount: tax,
        taxRate: settings.useTax ? taxRate : 0,
        discount,
        totalAmount: total,
        receivedAmount: Number(receivedAmount) || total,
        change: change > 0 ? change : 0,
        paymentMethod,
        userName: user?.displayName || userData?.displayName || 'Admin',
        customCompanyInfo: customInfoOverride
      };
      
      setLastSale(saleDataForInvoice);
      pdfService.generateReceipt(saleDataForInvoice);
      
      setCart([]);
      setDiscount(0);
      setReceivedAmount('');
      setSelectedCustomer(null);
      setCustomCustomerName('');
      setShowSuccess(true);
      showToast("Vente réussie", "success");
      if (settings?.wooEnabled) {
        showToast("Synchronisation des stocks WooCommerce... OK", "success");
      }
    } catch (error: any) {
      showToast(error.message || "Erreur lors de la vente", "error");
    } finally {
      setIsProcessing(false);
    }
  }, [cart, isProcessing, currentUid, activeSession, user, userData, selectedCustomer, customCustomerName, subtotal, discount, total, receivedAmount, change, paymentMethod, showToast]);

  const handleNumpadClick = (val: string) => {
    if (val === 'C') {
      setReceivedAmount('');
    } else {
      setReceivedAmount(prev => prev + val);
    }
  };

  // Keep refs in sync with state
  useEffect(() => {
    cartRef.current = cart;
    customerRef.current = selectedCustomer;
    customNameRef.current = customCustomerName;
    discountRef.current = discount;
    subtotalRef.current = subtotal;
    totalRef.current = total;
  }, [cart, selectedCustomer, customCustomerName, discount, subtotal, total]);

  const scannerBuffer = useRef<string>('');
  const lastScanTime = useRef<number>(0);

  const handleBarcodeScan = useCallback((barcode: string) => {
    if (!barcode) return;
    
    const product = products.find(p => 
      p.barcode?.toLowerCase() === barcode.toLowerCase() || 
      p.sku?.toLowerCase() === barcode.toLowerCase()
    );

    if (product) {
      addToCart(product);
      showToast(`Produit ajouté: ${product.name}`, 'success');
      return true;
    }
    return false;
  }, [products, addToCart, showToast]);

  // Keyboard accessibility & Barcode Scanner support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shortcut for Focus Search Input (F1)
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Shortcut for Validate Sale (F2 or F9)
      if (e.key === 'F2' || e.key === 'F9') { 
        e.preventDefault();
        handleSale();
        return;
      }
      
      // Shortcut for Pay in Cash (F3)
      if (e.key === 'F3') {
        e.preventDefault();
        setPaymentMethod('cash');
        showToast("Saisie Espèces active", "info");
        return;
      }

      // Shortcut for Pay with Card (F4)
      if (e.key === 'F4') {
        e.preventDefault();
        setPaymentMethod('card');
        showToast("Saisie Carte active", "info");
        return;
      }
      
      // Shortcut for Suspend Sale (F6)
      if (e.key === 'F6') { 
        e.preventDefault();
        handleSuspendSale();
        return;
      }

      // Shortcut for pending sales modal toggle (F7)
      if (e.key === 'F7') {
        e.preventDefault();
        setShowPendingModal(prev => !prev);
        return;
      }

      // Shortcut for clear cart (F8)
      if (e.key === 'F8') { 
        e.preventDefault();
        setCart([]);
        showToast("Panier vidé", "info");
        return;
      }

      // Shortcut for focusing received amount input (F10)
      if (e.key === 'F10') {
        e.preventDefault();
        receivedAmountInputRef.current?.focus();
        receivedAmountInputRef.current?.select();
        return;
      }

      // Barcode Scanner Logic
      // Check if user is typing in an input field (except the main search)
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      
      if (e.key === 'Enter') {
        if (scannerBuffer.current.length > 2) {
          const processed = handleBarcodeScan(scannerBuffer.current);
          if (processed) {
            scannerBuffer.current = '';
            // If the search input was focused, clear it
            if (isInput) {
              (e.target as HTMLInputElement).value = '';
              setSearchQuery('');
            }
            return;
          }
        }
        scannerBuffer.current = '';
        return;
      }

      // Only capture alphanumeric characters if not in an input
      // OR capture everything if it's coming in fast (scanner)
      const now = Date.now();
      const isFast = now - lastScanTime.current < 50; // Scanners are very fast
      lastScanTime.current = now;

      if (!isInput || isFast) {
        if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
          scannerBuffer.current += e.key;
          
          // Optional: clear buffer if it gets too long or too old
          setTimeout(() => {
            if (Date.now() - lastScanTime.current > 500) {
              scannerBuffer.current = '';
            }
          }, 600);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSale, handleSuspendSale, handleBarcodeScan, setPaymentMethod, setShowPendingModal, setCart, showToast]);

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      // If there are items in the cart and we're navigating away (unmounting)
      // we save it automatically to avoid data loss
      if (cartRef.current.length > 0 && currentUid) {
        // Create a copy of values at unmount time
        const cartToSave = [...cartRef.current];
        const customerToSave = customerRef.current;
        const discountToSave = discountRef.current;
        const subtotalToSave = subtotalRef.current;
        const totalToSave = totalRef.current;
        const userId = currentUid;
        const userName = user?.displayName || userData?.displayName || 'Vendeur';

        // Direct call to Firestore without waiting (fire and forget)
        dbService.addDocument('pending_sales', {
          userId,
          userName,
          customerId: customerToSave?.id || null,
          customerName: customerToSave?.name || customNameRef.current || 'Client de passage',
          items: cartToSave,
          discount: discountToSave,
          subtotal: subtotalToSave,
          totalAmount: totalToSave,
          createdAt: new Date(), // Using new Date() for reliability in cleanup
          isAutoSave: true
        }).catch(err => console.error("POS Auto-save failed:", safeStringify(err)));
      }
    };
  }, [currentUid]);

  if (!canSell) {
    return (
      <div className="h-full flex items-center justify-center p-6 w-full">
        <div className="bg-white p-12 text-center border border-slate-200 shadow-sm max-w-md mx-auto my-12">
           <AlertCircle size={48} className="text-rose-500 mx-auto mb-4" />
           <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Accès Refusé</h2>
           <p className="text-sm text-slate-500 mt-2">Vous n'avez pas l'autorisation d'accéder au terminal de vente.</p>
           <Button onClick={() => navigate('/')} className="mt-6 bg-slate-800">Retour au Tableau de Bord</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#F3F4F6] overflow-hidden font-sans">
      <StartSessionModal isOpen={!sessionLoading && !activeSession} />
      
      {activeSession && (
        <DailyClosingModal 
          isOpen={isClosingModalOpen}
          onClose={() => setIsClosingModalOpen(false)}
          todaySummary={{
            date: activeSession.startTime?.toDate ? activeSession.startTime.toDate() : new Date(),
            startingCash: activeSession.startingCash || 0,
            cashSales: activeSession.cashSales || 0,
            transferSales: activeSession.transferSales || 0,
            totalSales: activeSession.totalSales || 0,
            expenses: activeSession.expenses || 0,
            netFlow: activeSession.netCash || 0,
            salesCount: activeSession.salesCount || 0
          }}
        />
      )}

      {/* Categories Sidebar on the left (WordPress Customizer Style) */}
      <div className="w-60 bg-white border-r border-slate-200/80 flex flex-col hidden lg:flex">
        <div className="p-4 bg-slate-950 text-white flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
            className="h-8 w-8 p-0 rounded-full hover:bg-slate-800 text-white border-none shrink-0"
          >
            <ArrowLeft size={16} />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Layers size={16} className="text-[#0066FF]" />
            <span className="font-black uppercase text-[10px] tracking-wider truncate">Mz-ERP PRO POS</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50/55 p-2 space-y-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "w-full text-left px-4 py-2.5 text-xs font-black uppercase rounded-lg transition-all",
              !selectedCategory 
                ? "bg-[#0066FF]/10 text-[#0066FF] border border-[#0066FF]/15 shadow-2xs font-extrabold" 
                : "hover:bg-slate-100 text-slate-650 hover:text-slate-900"
            )}
          >
            Tous les produits
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "w-full text-left px-4 py-2.5 text-xs font-black uppercase rounded-lg transition-all",
                selectedCategory === cat.id 
                  ? "bg-[#0066FF]/10 text-[#0066FF] border border-[#0066FF]/15 shadow-2xs font-extrabold" 
                  : "hover:bg-slate-100 text-slate-650 hover:text-slate-900"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="p-4 bg-white border-t border-slate-150 text-[10px] space-y-1 text-slate-400 font-bold">
           <div className="flex items-center gap-1.5 text-slate-500">
              <Calendar size={13} className="text-slate-400" />
              <span className="uppercase">{new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
           </div>
           <div>MODULE CAISSE ENREGISTREUSE</div>
        </div>
      </div>

      {/* Center-Left Section: Search and Visual Product Cards Grid */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-100/50">
        {/* Search & Actions Bar (Fond blanc, angles arrondis vifs) */}
        <div className="flex-none p-4 bg-white border-b border-slate-200">
          <div className="flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450" size={17} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Scanner Code-barre ou Chercher un Produit... (F1)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 text-sm focus:bg-white focus:border-[#0066FF] outline-none transition-all rounded-xl focus:ring-1 focus:ring-[#0066FF]"
              />
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <div className="flex items-center px-2.5 py-1.5 bg-blue-50 border border-blue-200/60 text-[#0066FF] rounded-xl text-[9px] font-black uppercase tracking-wider">
                <Zap size={12} className="mr-1 text-amber-500 animate-pulse" />
                Auto-Scan
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowPendingModal(true)} 
                className="text-xs h-9 relative border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/50 rounded-xl font-bold uppercase transition-all duration-150"
              >
                <Zap size={14} className="mr-1" /> Attente (F7)
                {pendingSales.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border border-white shadow-2xs">
                    {pendingSales.length}
                  </span>
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSuspendSale} 
                disabled={cart.length === 0 || isSuspending}
                className="text-xs h-9 border-blue-200 bg-blue-50/50 text-blue-800 hover:bg-blue-100/50 rounded-xl font-bold uppercase transition-all duration-150"
              >
                <div className="flex items-center gap-1">
                   {isSuspending ? <RefreshCw size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                   <span>Prendre Instance (F6)</span>
                </div>
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/sales-history')} className="text-xs h-9 rounded-xl font-bold uppercase">
                <History size={14} className="mr-1 text-slate-400" /> Historique
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCart([])} className="text-xs h-9 text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 rounded-xl font-bold uppercase">
                Vider (F8)
              </Button>
              {activeSession && (
                <Button 
                  size="sm" 
                  onClick={() => setIsClosingModalOpen(true)} 
                  className="text-xs h-9 bg-slate-900 hover:bg-black text-white px-3.5 font-bold uppercase tracking-wider rounded-xl border-none"
                >
                  Fermer Session
                </Button>
              )}
            </div>
          </div>

          {/* Quick Shortcuts Rail */}
          <div className="hidden md:flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-500 font-extrabold font-mono hover:bg-slate-100 cursor-default transition-all shadow-3xs"><span className="text-slate-400 font-sans mr-0.5">Rechercher:</span> F1</span>
            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-500 font-extrabold font-mono hover:bg-slate-100 cursor-default transition-all shadow-3xs"><span className="text-slate-400 font-sans mr-0.5">Valider:</span> F2/F9</span>
            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-[#0066FF] border-[#0066FF]/20 bg-blue-50/20 font-extrabold font-mono cursor-default shadow-3xs"><span className="text-slate-400 font-sans mr-0.5">Espèces (F3) / Carte (F4)</span></span>
            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-500 font-extrabold font-mono hover:bg-slate-100 cursor-default transition-all shadow-3xs"><span className="text-slate-400 font-sans mr-0.5">Suspendre:</span> F6</span>
            <span className="bg-slate-55 px-2 py-0.5 rounded border border-slate-200 text-emerald-800 bg-emerald-50 border-emerald-200/60 font-extrabold font-mono cursor-default shadow-3xs"><span className="text-slate-400 font-sans mr-0.5">Saisir Monnaie:</span> F10</span>
          </div>
        </div>

        {/* Dynamic Visual Product Cards Grid (Replaces old visual inventory list) */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredProducts.map(p => {
              const stockStatus = p.stockQuantity <= 0 ? 'out' : 
                                 p.stockQuantity <= (p.minStockLevel || 5) ? 'low' : 'ok';
              return (
                <div 
                  key={p.id} 
                  onClick={() => addToCart(p)}
                  className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-3xs hover:shadow-xs hover:border-[#0066FF] cursor-pointer transition-all duration-200 flex flex-col justify-between group active:scale-[0.98]"
                >
                  <div>
                    {/* Visual box or product picture */}
                    <div className="w-full h-24 bg-slate-50 rounded-xl border border-slate-150 overflow-hidden flex items-center justify-center text-slate-400 font-extrabold relative">
                      {p.photoBase64 ? (
                        <img src={p.photoBase64} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <Box size={24} className="text-slate-300 group-hover:text-[#0066FF] transition-colors" />
                      )}
                      
                      {/* Floating Stock badge */}
                      <span className={cn(
                        "absolute top-2 right-2 px-1.5 py-0.5 text-[8px] font-black uppercase rounded-md tracking-wider border",
                        stockStatus === 'out' ? "bg-rose-55 text-white border-rose-100" :
                        stockStatus === 'low' ? "bg-amber-50 text-amber-700 border-amber-200" :
                        "bg-emerald-50 text-emerald-700 border-emerald-200"
                      )}>
                        {Number(p.stockQuantity || 0).toFixed(2).replace(/\.00$/, '')} {p.unit || 'u'}
                      </span>
                    </div>

                    <h3 className="text-xs font-black text-slate-850 uppercase leading-tight line-clamp-2 tracking-tight group-hover:text-[#0066FF] transition-colors mt-2">
                      {p.name}
                    </h3>
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      {p.sku ? (
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-50 border border-slate-150 px-1 py-0.5 rounded">
                          {p.sku}
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-slate-350 italic">Sans SKU</span>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <span className="text-xs font-black block text-[#0066FF] font-mono">
                        {formatCurrency(p.sellingPrice)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl py-16 text-center text-slate-400 italic">
               <Package size={36} className="mx-auto text-slate-300 mb-2" />
               <p className="text-xs font-black uppercase tracking-wider text-slate-500">Aucun produit ne correspond à vos critères</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDE: Interactive Full Basket & Payment Controls (Panier à droite) */}
      <div className="w-100 bg-white border-l border-slate-250 flex flex-col shadow-lg overflow-hidden shrink-0">
        
        {/* Dynamic Cart Lines */}
        <div className="bg-slate-50/50 p-4 border-b border-slate-150 flex-none flex items-center justify-between">
           <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
             <ShoppingCart size={14} className="text-[#0066FF]" /> Panier ({cart.length} ligne{cart.length > 1 ? 's' : ''})
           </span>
           {cart.length > 0 && (
             <button 
               onClick={() => setCart([])} 
               className="text-[9px] font-bold text-rose-600 uppercase hover:underline transition-all"
             >
               Vider
             </button>
           )}
        </div>

        {/* Scrollable Items Panel */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
           {cart.map(item => (
             <div key={`${item.id}-${item.unit}`} className="p-3.5 hover:bg-slate-50/40 transition-colors flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-slate-800 uppercase leading-snug tracking-tight truncate">{item.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                     {formatCurrency(item.price)} <span className="text-[8px] font-bold">/{item.unit || 'u'}</span>
                  </p>
                </div>
                
                {/* Quantity adjustments */}
                <div className="flex items-center gap-1 shrink-0">
                   <button 
                     onClick={() => updateQuantity(item.id, -1, item.unit)}
                     className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-650 transition-colors scale-95"
                     title="Diminuer"
                   >
                     <Minus size={11} className="stroke-[3]" />
                   </button>
                   
                   <input 
                     type="number"
                     step={item.unit === 'm' || item.unit === 'kg' || item.unit === 'ml' ? "0.01" : "1"}
                     value={item.quantity}
                     onChange={(e) => {
                       const isFrac = item.unit === 'm' || item.unit === 'kg' || item.unit === 'l' || item.unit === 'ml';
                       const val = isFrac ? parseFloat(e.target.value) : parseInt(e.target.value);
                       if (!isNaN(val)) {
                         const product = products.find(p => p.id === item.id);
                         const stock = product ? Number(product.stockQuantity) : 0;
                         const stockInUnit = item.unit === 'ml' ? stock * (product?.unitsPerRoll || 1) : stock;
                         const targetVal = Math.max(0, Math.min(val, stockInUnit));
                         setCart(prev => prev.map(i => 
                           (i.id === item.id && i.unit === item.unit)
                             ? { ...i, quantity: targetVal, total: Number((targetVal * i.price).toFixed(2)) } 
                             : i
                         ));
                         if (val > stockInUnit) {
                           showToast(`Stock maximum: ${stockInUnit} ${item.unit}`, 'warning');
                         }
                       } else if (e.target.value === '') {
                         setCart(prev => prev.map(i => 
                           (i.id === item.id && i.unit === item.unit) ? { ...i, quantity: 0, total: 0 } : i
                         ));
                       }
                     }}
                     className="w-11 h-6 text-center text-xs font-black text-slate-800 bg-slate-50 border border-slate-200 outline-none focus:ring-1 focus:ring-[#0066FF] rounded-md"
                   />

                   <button 
                     onClick={() => updateQuantity(item.id, 1, item.unit)}
                     className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-650 transition-colors scale-95"
                     title="Augmenter"
                   >
                     <Plus size={11} className="stroke-[3]" />
                   </button>
                </div>

                <div className="text-right shrink-0 min-w-[4.2rem]">
                   <p className="text-xs font-black text-slate-800 font-mono">{formatCurrency(item.total)}</p>
                   <button 
                     onClick={() => removeFromCart(item.id)} 
                     className="text-slate-400 hover:text-rose-600 transition-colors mt-1"
                   >
                     <Trash2 size={13} />
                   </button>
                </div>
             </div>
           ))}

           {cart.length === 0 && (
             <div className="py-20 text-center text-slate-400 italic text-xs">
                Panier Vide. Veuillez cliquer sur des produits à gauche.
             </div>
           )}
        </div>

        {/* Customer Select Option */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-150 flex-none">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Client</span>
            <div className="flex gap-2 text-[9px] font-black uppercase tracking-wider">
               {selectedCustomer && (
                 <button onClick={() => { setSelectedCustomer(null); setCustomCustomerName(''); }} className="text-rose-600 hover:underline">Retirer</button>
               )}
               <button onClick={() => setShowCustomerModal(true)} className="text-[#0066FF] hover:underline">
                 {selectedCustomer ? 'Remplacer' : 'Sélectionner (F10)'}
               </button>
            </div>
          </div>
          
          {selectedCustomer ? (
            <div className="p-2.5 border border-slate-200 bg-white rounded-xl flex items-center justify-between">
               <div className="min-w-0">
                  <div className="text-xs font-black text-slate-850 truncate leading-none mb-1">
                    {selectedCustomer.name}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {selectedCustomer.phone || 'Sans Contact'} 
                  </div>
               </div>
               <User size={14} className="text-slate-400" />
            </div>
          ) : (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input 
                type="text"
                placeholder="Client de Passage (Occasionnel)..."
                value={customCustomerName}
                onChange={(e) => setCustomCustomerName(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 bg-white text-xs font-black rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0066FF] focus:border-[#0066FF]"
              />
            </div>
          )}
        </div>

        {/* Project Select Option */}
        <div className="p-3.5 bg-white border-t border-slate-150 flex-none">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
              <HardHat size={12} className="text-[#0066FF]" /> Chantier / Projet affilié
            </span>
            {selectedProject && (
              <button onClick={() => setSelectedProject(null)} className="text-[9px] font-black uppercase text-rose-600 hover:underline">Détacher</button>
            )}
          </div>
          <select 
            className="w-full text-xs font-bold uppercase p-2 border border-slate-250 bg-slate-50 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0066FF]"
            value={selectedProject?.id || ''}
            onChange={(e) => {
              const prj = (projects || []).find(p => p.id === e.target.value);
              setSelectedProject(prj || null);
            }}
          >
            <option value="">-- Aucun affiliation --</option>
            {(projects || []).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Totals section in right Column */}
        <div className="p-4 bg-slate-950 text-white space-y-2 flex-none">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-bold uppercase">Total Brut HT</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          {settings.useTax && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-bold uppercase">TVA ({taxRate * 100}%)</span>
              <span className="font-mono">{formatCurrency(tax)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-xs border-t border-slate-800 pt-2">
            <span className="text-slate-400 font-bold uppercase">Déduire Remise</span>
            <input 
              type="number" 
              value={discount || ''} 
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-20 bg-slate-900 border border-slate-800 text-right px-2 py-0.5 text-xs rounded font-bold font-mono text-white outline-none focus:ring-1 focus:ring-[#0066FF]"
            />
          </div>
          <div className="pt-2 flex justify-between items-baseline border-t border-slate-850">
             <div className="text-[10px] font-black uppercase text-[#0066FF] tracking-wider">NET À PAYER (DA)</div>
             <div className="text-3xl font-black text-right text-white tabular-nums tracking-tighter">
                {formatCurrency(total)}
             </div>
          </div>
        </div>

        {/* Numeric Pad & Payment Methods */}
        <div className="p-4 space-y-3 bg-slate-50 border-t border-slate-200 flex-none">
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => setPaymentMethod('cash')}
              className={cn(
                "py-2.5 px-3 border rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-black uppercase",
                paymentMethod === 'cash' 
                  ? "bg-[#0066FF] border-[#0066FF] text-white shadow-xs" 
                  : "bg-white border-slate-250 text-slate-500 hover:border-slate-350"
              )}
            >
              <Banknote size={15} />
              <span>Espèces</span>
            </button>
            <button 
              onClick={() => setPaymentMethod('card')}
              className={cn(
                "py-2.5 px-3 border rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-black uppercase",
                paymentMethod === 'card' 
                  ? "bg-[#0066FF] border-[#0066FF] text-white shadow-xs" 
                  : "bg-white border-slate-250 text-slate-500 hover:border-slate-350"
              )}
            >
              <CreditCard size={15} />
              <span>Carte / TPE</span>
            </button>
          </div>

          <div className="bg-white p-3 border border-slate-200 rounded-xl space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black uppercase text-slate-400">Espèces Reçues</span>
              <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-50 px-1 py-0.5 rounded border border-amber-100">F10</span>
            </div>
            <input 
              ref={receivedAmountInputRef}
              type="number"
              value={receivedAmount}
              onChange={(e) => setReceivedAmount(e.target.value)}
              className="w-full text-xl font-bold font-mono text-right text-emerald-600 border-none outline-none focus:outline-none focus:ring-0 p-0 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0.00"
            />
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-[10px] text-slate-500">
              <span className="font-extrabold uppercase">Rendre (Monnaie)</span>
              <span className="font-mono font-black text-slate-900">{formatCurrency(change)}</span>
            </div>
          </div>

          {/* Mini Numpad */}
          <div className="grid grid-cols-4 gap-1.5">
            {['7','8','9','C','4','5','6','0','1','2','3','.'].map(btn => (
              <button 
                key={btn}
                onClick={() => handleNumpadClick(btn)}
                className="h-9 rounded-lg bg-white border border-slate-250 font-bold text-xs hover:bg-slate-100 active:scale-95 transition-transform"
              >
                {btn}
              </button>
            ))}
          </div>

          <Button 
            className="w-full py-4 text-sm font-black uppercase tracking-wider bg-[#0066FF] hover:bg-[#0055DD] text-white rounded-xl shadow-md transition-all active:scale-[0.98] border-none mt-1 h-14"
            disabled={cart.length === 0 || isProcessing}
            isLoading={isProcessing}
            onClick={handleSale}
          >
            <CheckCircle2 className="mr-2" size={18} /> Valider la Vente (F2 / F9)
          </Button>
        </div>
      </div>

      {/* Customer Modal */}
      <Modal isOpen={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="Sélectionner un Client">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              autoFocus
              type="text" 
              placeholder="Chercher par Nom, Société ou Carte Fidélité..." 
              value={customerSearchQuery}
              onChange={(e) => {
                const query = e.target.value;
                setCustomerSearchQuery(query);
                
                // Si on scanne un code barre exact et qu'un seul client correspond
                if (query.length >= 4) {
                  const exactMatch = customers.find(c => 
                    c.clientCode?.toLowerCase() === query.toLowerCase()
                  );
                  if (exactMatch) {
                    setSelectedCustomer(exactMatch);
                    setShowCustomerModal(false);
                    setCustomerSearchQuery('');
                  }
                }
              }}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-2 p-1">
            {customers.filter(c => 
              c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || 
              (c.company && c.company.toLowerCase().includes(customerSearchQuery.toLowerCase())) ||
              (c.clientCode && c.clientCode.toLowerCase().includes(customerSearchQuery.toLowerCase())) ||
              (c.phone && c.phone.includes(customerSearchQuery))
            ).map(c => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCustomer(c);
                  setShowCustomerModal(false);
                  setCustomerSearchQuery('');
                }}
                className={cn(
                  "w-full flex items-center justify-between p-4 border transition-all text-left rounded-xl shadow-sm",
                  selectedCustomer?.id === c.id ? "border-blue-500 bg-blue-50" : "border-slate-100 bg-white hover:border-blue-300 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-4">
                   <div className={cn(
                     "w-10 h-10 rounded-lg flex items-center justify-center font-black text-xs",
                     selectedCustomer?.id === c.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                   )}>
                     {c.name[0]}
                   </div>
                   <div>
                     <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                        {c.name}
                        {c.company && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase tracking-wider">{c.company}</span>}
                     </div>
                     <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.phone || 'Sans téléphone'}</span>
                        {c.clientCode && (
                          <span className="text-[10px] font-mono font-bold text-blue-500 bg-blue-50 px-1.5 rounded flex items-center gap-1">
                             <CreditCard size={10} /> {c.clientCode}
                          </span>
                        )}
                     </div>
                   </div>
                </div>
                <div className="text-right">
                   <div className="text-[10px] font-black text-slate-300 uppercase">Total achats</div>
                   <div className="text-xs font-black text-slate-600">{formatCurrency(c.totalSpent || 0)}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/customers')} className="flex-1 uppercase font-black text-[10px] tracking-widest h-11">Nouveau/Gérer clients</Button>
            <Button variant="ghost" onClick={() => setShowCustomerModal(false)} className="flex-1 uppercase font-black text-[10px] tracking-widest h-11">Fermer</Button>
          </div>
        </div>
      </Modal>

      {/* Pending Sales Modal */}
      <Modal isOpen={showPendingModal} onClose={() => setShowPendingModal(false)} title="Ventes en Instance (Attente)">
        <div className="space-y-4">
          <div className="max-h-96 overflow-y-auto border border-slate-200">
             <table className="mzsoft-table">
                <thead>
                   <tr>
                      <th>Date / Heure</th>
                      <th>Client</th>
                      <th className="text-right">Total</th>
                      <th className="w-20 text-center">...</th>
                   </tr>
                </thead>
                <tbody>
                   {pendingSales.map((pending) => (
                      <tr key={pending.id} className="hover:bg-amber-50 group">
                         <td className="text-[11px] font-bold text-slate-500 italic">
                            {pending.createdAt ? format(typeof pending.createdAt.toDate === 'function' ? pending.createdAt.toDate() : new Date(pending.createdAt), 'dd/MM HH:mm') : '-'}
                         </td>
                         <td className="text-xs font-bold text-slate-800">
                            {pending.customerName}
                            {pending.isAutoSave && (
                              <span className="ml-2 px-1 bg-slate-100 text-[9px] text-slate-400 rounded border border-slate-200">AUTO</span>
                            )}
                         </td>
                         <td className="text-right font-black text-slate-900 text-xs">
                            {formatCurrency(pending.totalAmount)}
                         </td>
                         <td className="text-center">
                            <button 
                              onClick={() => recallPendingSale(pending)}
                              className="p-1 text-amber-600 hover:text-amber-800 border border-transparent hover:border-amber-200 hover:bg-white"
                              title="Récupérer la vente"
                            >
                               <RefreshCw size={14} />
                            </button>
                            <button 
                              onClick={() => setPendingToDelete(pending)}
                              disabled={isDeletingPending === pending.id}
                              className={cn(
                                "ml-1 p-1 transition-colors",
                                isDeletingPending === pending.id ? "text-slate-200 cursor-not-allowed" : "text-slate-300 hover:text-rose-600"
                              )}
                              title="Supprimer"
                            >
                               {isDeletingPending === pending.id ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                         </td>
                      </tr>
                   ))}
                   {pendingSales.length === 0 && (
                      <tr>
                         <td colSpan={4} className="py-10 text-center text-slate-400 italic text-sm">
                            Aucune vente en instance
                         </td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase text-center italic tracking-widest">
             Récupérez une vente pour continuer l'encaissement
          </p>
          <Button variant="outline" onClick={() => setShowPendingModal(false)} className="w-full uppercase font-black tracking-widest text-xs h-10">Fermer</Button>
        </div>
      </Modal>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
             <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white max-w-sm w-full p-8 rounded shadow-2xl flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                   <CheckCircle2 size={36} />
                </div>
                <h3 className="text-xl font-black uppercase mb-1">Vente Enregistrée</h3>
                <p className="text-slate-500 text-xs mb-6">L'opération s'est terminée avec succès.</p>
                <div className="grid grid-cols-1 w-full gap-2">
                   {canPrint ? (
                     <Button onClick={() => lastSale && pdfService.generateInvoice(lastSale)} className="bg-blue-600 hover:bg-blue-700">
                       <Printer size={16} className="mr-2" /> Imprimer Ticket
                     </Button>
                   ) : (
                     <p className="text-[10px] text-rose-500 font-bold uppercase py-2">Impression non autorisée</p>
                   )}
                   <Button variant="outline" onClick={() => setShowSuccess(false)}>Terminer</Button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={!!pendingToRecall}
        onClose={() => setPendingToRecall(null)}
        onConfirm={() => confirmRecall(pendingToRecall)}
        title="Récupérer une vente"
        message="Le panier actuel sera remplacé par la vente en instance. Continuer ?"
        confirmText="Remplacer le panier"
        variant="warning"
      />

      <ConfirmationModal
        isOpen={!!pendingToDelete}
        onClose={() => setPendingToDelete(null)}
        onConfirm={async () => {
          if (!pendingToDelete) return;
          try {
            setIsDeletingPending(pendingToDelete.id);
            await dbService.deleteDocument('pending_sales', pendingToDelete.id);
            showToast("Mise en instance supprimée", "success");
          } catch (error) {
            showToast("Erreur lors de la suppression", "error");
          } finally {
            setIsDeletingPending(null);
            setPendingToDelete(null);
          }
        }}
        title="Supprimer mise en instance"
        message="Voulez-vous vraiment supprimer cette vente mise en instance ?"
        confirmText="Supprimer"
        variant="danger"
        isLoading={!!isDeletingPending}
      />

      <PromptModal
        isOpen={!!mlProductToPrompt}
        onClose={() => setMlProductToPrompt(null)}
        onConfirm={(val) => {
          if (mlProductToPrompt) {
            const length = parseFloat(val);
            if (isNaN(length) || length <= 0) {
              showToast("Longueur invalide", "error");
              return;
            }
            addToCart(mlProductToPrompt, 1, true, length);
          }
        }}
        title="Vente au Mètre (ML)"
        message={`Saisir la longueur en ML pour "${mlProductToPrompt?.name}" (Prix: ${mlProductToPrompt?.pricePerML} DA/ML)`}
        defaultValue="1"
        inputType="number"
        inputPlaceholder="Ex: 50.5"
        confirmText="Ajouter au Panier"
      />

      <BarcodePrintModal 
        products={products}
        initialProduct={productForBarcode} 
        isOpen={isBarcodeModalOpen} 
        onClose={() => {
          setIsBarcodeModalOpen(false);
          setProductForBarcode(null);
        }} 
      />
    </div>
  );
};

export default POS;
