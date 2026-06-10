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
  HardHat
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
    <div className="flex h-[calc(100vh-64px)] bg-slate-100 overflow-hidden font-sans">
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

      {/* Categories Sidebar */}
      <div className="w-64 bg-slate-200 border-r border-slate-300 flex flex-col hidden lg:flex">
        <div className="p-4 bg-slate-800 text-white flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
            className="h-8 w-8 p-0 rounded-full hover:bg-slate-700 text-white"
          >
            <ArrowLeft size={16} />
          </Button>
          <div className="flex items-center gap-2">
            <Layers size={18} />
            <span className="font-bold uppercase text-xs tracking-widest">Catégories</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "w-full text-left px-4 py-3 text-xs font-bold uppercase transition-colors border-b border-slate-300",
              !selectedCategory ? "bg-white text-blue-600" : "hover:bg-slate-300 text-slate-600"
            )}
          >
            Toutes les catégories
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "w-full text-left px-4 py-3 text-xs font-bold uppercase transition-colors border-b border-slate-300",
                selectedCategory === cat.id ? "bg-white text-blue-600" : "hover:bg-slate-300 text-slate-600"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="p-4 bg-slate-300/50 border-t border-slate-400">
           <div className="flex items-center gap-2 text-slate-500 mb-2">
              <Calendar size={14} />
              <span className="text-[10px] font-bold uppercase">{new Date().toLocaleDateString('fr-FR')}</span>
           </div>
           <div className="text-[10px] text-slate-400 font-bold uppercase">Système POS v1.2</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Products Table Area */}
        <div className="flex-none p-4 bg-white border-b border-slate-300 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher un produit... (Nom, SKU, Code-barre) [F1]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex items-center px-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-[10px] font-black uppercase tracking-tighter">
                <Zap size={14} className="mr-1 text-amber-500 animate-pulse" />
                Scanner Actif
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowPendingModal(true)} 
                className="text-xs h-9 relative border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              >
                <Zap size={16} className="mr-1" /> En attente (F7)
                {pendingSales.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
                    {pendingSales.length}
                  </span>
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSuspendSale} 
                disabled={cart.length === 0 || isSuspending}
                className="text-xs h-9 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                <div className="flex items-center gap-1">
                   {isSuspending ? <RefreshCw size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                   <span>Instance (F6)</span>
                </div>
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/sales-history')} className="text-xs h-9">
                <History size={16} className="mr-1" /> Historique
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCart([])} className="text-xs h-9 text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100">
                <RefreshCw size={16} className="mr-1 text-rose-500" /> Vider (F8)
              </Button>
              {activeSession && (
                <Button 
                  size="sm" 
                  onClick={() => setIsClosingModalOpen(true)} 
                  className="text-xs h-9 bg-slate-900 hover:bg-black text-white px-4 border-none font-black uppercase tracking-widest"
                >
                  <History size={16} className="mr-1" /> Clôturer Ma Session
                </Button>
              )}
            </div>
          </div>

          {/* Bar de Raccourcis Clavier */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-black">F1</span>
              Recherche produit
            </span>
            <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-black">F2 / F9</span>
              Valider la Vente
            </span>
            <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-black">F3</span>
              Espèces (Cash)
            </span>
            <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-black">F4</span>
              Carte / Virement
            </span>
            <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-black">F6</span>
              Mettre en attente (Instance)
            </span>
            <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-black">F7</span>
              Ventes en instance
            </span>
            <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-black">F10</span>
              Saisir montant reçu
            </span>
            <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200 text-rose-600">
              <span className="bg-rose-800 text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-black">F8</span>
              Vider le Panier
            </span>
          </div>
        </div>

        {/* Product Grid Area (The "Top" Table) */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
          <table className="mzsoft-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Désignation</th>
                <th>Prix de vente</th>
                <th>En Stock</th>
                <th className="w-20 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => (
                <tr key={p.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => addToCart(p)}>
                  <td className="font-mono text-[11px] text-slate-500">{p.sku || p.barcode || '-'}</td>
                  <td className="font-bold">{p.name}</td>
                  <td className="font-bold text-blue-600">{formatCurrency(p.sellingPrice)}</td>
                  <td>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      p.stockQuantity <= 5 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                    )}>
                      {p.stockQuantity} {p.unit || 'u'}
                    </span>
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!p.barcode) {
                            showToast('Ce produit n\'a pas de code-barre', 'error');
                            return;
                          }
                          setProductForBarcode(p);
                          setIsBarcodeModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                        title="Imprimer Code-Barre"
                      >
                        <Barcode size={14} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(p);
                        }}
                        className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400 italic">Aucun produit trouvé</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Cart Area ("Bottom") */}
        <div className="h-64 bg-slate-100 border-t border-slate-300 flex flex-col">
          <div className="bg-slate-200 px-4 py-2 border-b border-slate-300 flex justify-between items-center">
            <span className="text-[11px] font-black uppercase text-slate-600 tracking-widest flex items-center gap-2">
              <ShoppingCart size={14} /> Détails de la vente en cours
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              {cart.length} ligne(s) sélectionnée(s)
            </span>
          </div>
          <div className="flex-1 overflow-y-auto font-sans">
            <table className="mzsoft-table">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>Libellé</th>
                  <th className="w-24 text-right">Prix Unitaire</th>
                  <th className="w-32 text-center">Quantité</th>
                  <th className="w-24 text-right">Total</th>
                  <th className="w-16 text-center">Supp.</th>
                </tr>
              </thead>
              <tbody>
                {cart && cart.map(item => (
                  <tr key={`${item.id}-${item.unit}`}>
                    <td className="py-2">
                       <p className="font-bold text-slate-700 leading-tight">{item.name}</p>
                       <p className="text-[9px] text-slate-400 font-bold uppercase">
                         {item.unit === 'ml' ? 'Facturation au Mètre' : 
                          item.unit === 'g' || item.unit === 'kg' ? 'Facturation au Poids' :
                          item.unit === 'm' ? 'Facturation à la Longueur' :
                          item.unit === 'l' ? 'Facturation au Volume' :
                          item.unit === 'ans' ? 'Service (Années)' :
                          'Facturation à l\'unité'}
                       </p>
                    </td>
                    <td className="text-right font-mono text-slate-500">
                      {formatCurrency(item.price)}
                      <span className="text-[9px] ml-1">/{item.unit || 'u'}</span>
                    </td>
                    <td className="text-center px-1">
                      <div className="flex items-center justify-center gap-1 group/qty">
                        <button 
                          onClick={() => updateQuantity(item.id, -1, item.unit)} 
                          className="w-7 h-7 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-500 rounded-lg border border-slate-200 shadow-sm transition-all active:scale-95"
                          title="Retirer 1"
                        >
                          <Minus size={14}/>
                        </button>
                        
                        <input 
                          type="number"
                          step={item.unit === 'm' || item.unit === 'kg' || item.unit === 'ml' ? "0.01" : "1"}
                          value={item.quantity}
                          onChange={(e) => {
                            const isFractional = item.unit === 'm' || item.unit === 'kg' || item.unit === 'l' || item.unit === 'ml';
                            const val = isFractional ? parseFloat(e.target.value) : parseInt(e.target.value);
                            
                            if (!isNaN(val)) {
                              const product = products.find(p => p.id === item.id);
                              const stock = product ? Number(product.stockQuantity) : 0;
                              const stockInUnit = item.unit === 'ml' ? stock * (product?.unitsPerRoll || 1) : stock;
                              const targetVal = Math.max(0, Math.min(val, stockInUnit)); // Allow 0 while typing
                              
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
                                (i.id === item.id && i.unit === item.unit)
                                  ? { ...i, quantity: 0, total: 0 } 
                                  : i
                              ));
                            }
                          }}
                          className="w-16 h-7 text-center font-black text-sm bg-blue-50 border border-blue-200 rounded-md outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => toggleUnit(item.id, item.unit || 'u')}
                          className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-100 transition-colors"
                          title="Changer l'unité (u/ml)"
                        >
                          {item.unit || 'u'}
                        </button>
                        
                        <button 
                          onClick={() => updateQuantity(item.id, 1, item.unit)} 
                          className="w-7 h-7 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-500 rounded-lg border border-slate-200 shadow-sm transition-all active:scale-95"
                          title="Ajouter 1"
                        >
                          <Plus size={14}/>
                        </button>
                      </div>
                    </td>
                    <td className="text-right font-bold text-slate-900">{formatCurrency(item.total)}</td>
                    <td className="text-center">
                      <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-700">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-slate-400 italic">Veuillez sélectionner des produits</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right Side: Totals & Controls */}
      <div className="w-96 bg-white border-l border-slate-300 flex flex-col shadow-lg overflow-y-auto">
        {/* Customer Section */}
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Client</span>
            <div className="flex gap-2">
               {selectedCustomer && (
                 <button onClick={() => { setSelectedCustomer(null); setCustomCustomerName(''); }} className="text-[10px] font-bold text-rose-600 hover:underline">Détacher</button>
               )}
               <button onClick={() => setShowCustomerModal(true)} className="text-[10px] font-bold text-blue-600 hover:underline">
                 {selectedCustomer ? 'Changer' : 'Sélectionner'}
               </button>
            </div>
          </div>
          
          {selectedCustomer ? (
            <div className="flex items-center gap-3 p-2 border border-blue-200 bg-blue-50">
              <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white">
                <User size={16} />
              </div>
              <div className="flex-1 min-w-0">
                 <div className="text-xs font-bold text-slate-900 truncate">
                   {selectedCustomer.name}
                   {selectedCustomer.company && <span className="ml-1 text-[9px] text-blue-600 italic lowercase tracking-tight">({selectedCustomer.company})</span>}
                 </div>
                 <div className="text-[10px] text-slate-500">
                   {selectedCustomer.phone || 'Sans téléphone'} 
                   {selectedCustomer.clientCode && <span className="ml-2 font-mono text-blue-500 bg-blue-50 px-1 rounded-sm text-[9px]">ID: {selectedCustomer.clientCode}</span>}
                 </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text"
                placeholder="Nom du client (Occasionnel)..."
                value={customCustomerName}
                onChange={(e) => setCustomCustomerName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
        </div>

        {/* Project Section */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1">
              <HardHat size={12} className="text-blue-500" /> Chantier / Projet
            </span>
            <div className="flex gap-2">
               {selectedProject && (
                 <button onClick={() => setSelectedProject(null)} className="text-[10px] font-bold text-rose-600 hover:underline">Détacher</button>
               )}
            </div>
          </div>
          
          <select 
            className="w-full text-xs font-bold uppercase p-2 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={selectedProject?.id || ''}
            onChange={(e) => {
              const prj = (projects || []).find(p => p.id === e.target.value);
              setSelectedProject(prj || null);
            }}
          >
            <option value="">-- Aucun Chantier --</option>
            {(projects || []).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Custom Header Info Section */}
        <div className="px-4 py-3 border-b border-slate-200 bg-white">
          <button 
            onClick={() => {
              const el = document.getElementById('pos-custom-header');
              if (el) el.classList.toggle('hidden');
            }}
            className="flex items-center justify-between w-full text-[10px] font-black uppercase text-slate-400 hover:text-blue-600 transition-colors tracking-widest mb-1"
          >
            <span>En-tête personnalisé</span>
            <Printer size={12} />
          </button>
          <div id="pos-custom-header" className="hidden animate-in fade-in slide-in-from-top-1 duration-200">
            <textarea 
              value={customInfoOverride}
              onChange={(e) => setCustomInfoOverride(e.target.value)}
              className="w-full mt-2 p-2 border border-slate-200 text-[10px] font-medium min-h-[60px] bg-slate-50 focus:bg-white outline-none focus:ring-1 focus:ring-blue-500 rounded"
              placeholder="Modifier les coordonnées pour cette vente..."
            />
          </div>
        </div>

        {/* Totals Section */}
        <div className="p-4 bg-slate-800 text-white space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Total HT</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          {settings.useTax && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">TVA ({taxRate * 100}%)</span>
              <span className="font-mono">{formatCurrency(tax)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm border-t border-slate-700 pt-2">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Remise</span>
            <div className="relative">
               <input 
                type="number" 
                value={discount || ''} 
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-24 bg-slate-900 border border-slate-700 text-right px-2 py-1 text-xs rounded focus:ring-1 focus:ring-blue-500 outline-none"
               />
            </div>
          </div>
          <div className="pt-2">
             <div className="text-[10px] font-black uppercase text-blue-400 tracking-widest mb-1">À payer (TTC)</div>
             <div className="text-5xl font-black text-right tracking-tighter text-white tabular-nums">
                {formatCurrency(total)}
             </div>
          </div>
        </div>

        {/* Payment & Change Section */}
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => setPaymentMethod('cash')}
              className={cn(
                "p-3 border-2 flex flex-col items-center gap-1 transition-all",
                paymentMethod === 'cash' ? "bg-blue-50 border-blue-600 text-blue-700 ring-2 ring-blue-100" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              <Banknote size={20} />
              <span className="text-[10px] font-bold uppercase">Espèces</span>
            </button>
            <button 
              onClick={() => setPaymentMethod('card')}
              className={cn(
                "p-3 border-2 flex flex-col items-center gap-1 transition-all",
                paymentMethod === 'card' ? "bg-blue-50 border-blue-600 text-blue-700 ring-2 ring-blue-100" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              <CreditCard size={20} />
              <span className="text-[10px] font-bold uppercase">Carte</span>
            </button>
          </div>

          <div className="space-y-4 bg-slate-50 p-4 border border-slate-200">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[10px] font-bold uppercase text-slate-500">Montant Reçu</span>
                <span className="text-[10px] font-bold text-blue-600">F10</span>
              </div>
              <input 
                ref={receivedAmountInputRef}
                type="number"
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 text-2xl font-black text-right text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0.00"
              />
            </div>
            
            <div className="flex justify-between items-center py-2 border-t border-slate-200">
              <span className="text-[10px] font-black uppercase text-slate-500">Rendu (Monnaie)</span>
              <span className="text-xl font-black text-slate-900">{formatCurrency(change)}</span>
            </div>
          </div>

          {/* Numeric Pad */}
          <div className="grid grid-cols-3 gap-1">
            {['7','8','9','4','5','6','1','2','3','0','.','C'].map(btn => (
              <button 
                key={btn}
                onClick={() => handleNumpadClick(btn)}
                className="h-12 bg-white border border-slate-300 font-bold hover:bg-slate-100 active:bg-slate-200"
              >
                {btn}
              </button>
            ))}
          </div>

          <Button 
            className="w-full py-8 text-xl font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow-lg transition-transform active:scale-95"
            disabled={cart.length === 0 || isProcessing}
            isLoading={isProcessing}
            onClick={handleSale}
          >
            <CheckCircle2 className="mr-3" size={24} /> Valider (F2 / F9)
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
