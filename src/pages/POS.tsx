import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../firebase/db';
import { collection, runTransaction, doc, serverTimestamp, orderBy, increment, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { useCollection } from '../hooks/useCollection';
import { useSession } from '../context/SessionContext';
import { Product, Category, SaleItem, Customer } from '../types';
import { cn, formatCurrency, cleanObject } from '../lib/utils';
import { useNotification } from '../context/NotificationContext';
import { Button } from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { 
  Plus, 
  Minus, 
  Trash2, 
  Search, 
  User, 
  CreditCard, 
  Banknote, 
  ShoppingCart,
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
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pdfService } from '../services/pdfService';
import { format } from 'date-fns';
import StartSessionModal from '../components/StartSessionModal';

const POS: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { activeSession, loading: sessionLoading } = useSession();
  const { showToast } = useNotification();
  const navigate = useNavigate();

  const canSell = hasPermission('canSell');

  if (!canSell) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white p-12 text-center border border-slate-200">
           <AlertCircle size={48} className="text-rose-500 mx-auto mb-4" />
           <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Accès Refusé</h2>
           <p className="text-sm text-slate-500 mt-2">Vous n'avez pas l'autorisation d'accéder au terminal de vente.</p>
           <Button onClick={() => navigate('/')} className="mt-6 bg-slate-800">Retour au Tableau de Bord</Button>
        </div>
      </div>
    );
  }
  
  const { data: products, loading: productsLoading } = useCollection<Product>('products', [orderBy('name')]);
  const { data: categories } = useCollection<Category>('categories', [orderBy('name')]);
  const { data: customers } = useCollection<Customer>('customers', [orderBy('name')]);

  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customCustomerName, setCustomCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [lastSale, setLastSale] = useState<any>(null);
  
  const { data: pendingSales } = useCollection<any>('pending_sales', user ? [
    where('userId', '==', activeSession?.userId || user.uid),
    orderBy('createdAt', 'desc')
  ] : []);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);
  const tax = useMemo(() => subtotal * 0, [subtotal]); // Custom tax if needed
  const total = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount]);
  const change = useMemo(() => {
    const received = Number(receivedAmount) || 0;
    return received > 0 ? (received - total) : 0;
  }, [receivedAmount, total]);

  const scannerInputRef = useRef<HTMLInputElement>(null);
  
  // Refs for auto-save on unmount
  const cartRef = useRef<SaleItem[]>([]);
  const customerRef = useRef<Customer | null>(null);
  const customNameRef = useRef<string>('');
  const discountRef = useRef<number>(0);
  const subtotalRef = useRef<number>(0);
  const totalRef = useRef<number>(0);

  // Redirection logic removed, now we show StartSessionModal
  
  const handleSuspendSale = async () => {
    if (cart.length === 0 || isSuspending || !user) return;
    
    setIsSuspending(true);
    try {
      await dbService.addDocument('pending_sales', {
        userId: activeSession?.userId || user.uid,
        userName: activeSession?.userName || user.displayName || 'Vendeur',
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
  };

  const recallPendingSale = async (pending: any) => {
    if (cart.length > 0 && !window.confirm("Le panier actuel sera remplacé par la vente en instance. Continuer ?")) {
      return;
    }
    
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
    setShowPendingModal(false);
    showToast("Vente récupérée", "success");
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const pName = p.name || '';
      const pSku = p.sku || '';
      const pBarcode = p.barcode || '';
      const matchesSearch = pName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           pSku.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           pBarcode.includes(searchQuery);
      const matchesCategory = selectedCategory ? p.categoryId === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const addToCart = (product: Product) => {
    const stock = Number(product.stockQuantity) || 0;
    if (stock <= 0) {
      showToast(`${product.name} est en rupture de stock`, 'error');
      return;
    }

    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem && existingItem.quantity >= stock) {
      showToast(`Stock limité à ${stock} pour ${product.name}`, 'warning');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price } 
            : item
        );
      }
      return [...prev, { 
        id: product.id, 
        name: product.name, 
        price: product.sellingPrice, 
        quantity: 1, 
        unit: product.unit || 'u',
        total: product.sellingPrice
      }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const stock = Number(product.stockQuantity) || 0;

    const item = cart.find(i => i.id === id);
    if (item && delta > 0 && item.quantity + delta > stock) {
      showToast(`Stock limité pour ${item.name}`, 'warning');
      return;
    }

    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        return { ...item, quantity: newQty, total: newQty * item.price };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const [isDeletingPending, setIsDeletingPending] = useState<string | null>(null);

  const toggleUnit = (id: string) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const nextUnit = item.unit === 'u' ? 'ml' : item.unit === 'ml' ? 'u' : item.unit;
        return { ...item, unit: nextUnit };
      }
      return item;
    }));
  };

  const handleSale = async () => {
    if (cart.length === 0 || isProcessing || !user) return;

    setIsProcessing(true);
    const saleId = `SALE-${Date.now()}`;

    try {
      await runTransaction(db, async (transaction) => {
        const productSnapshots: Record<string, any> = {};

        for (const item of cart) {
          const productRef = doc(db, 'products', item.id);
          const productSnap = await transaction.get(productRef);
          
          if (!productSnap.exists()) throw new Error(`Le produit ${item.name} n'existe plus.`);
          
          const currentStock = Number(productSnap.data().stockQuantity) || 0;
          if (currentStock < item.quantity) {
            throw new Error(`Stock insuffisant pour ${item.name}. Disponible: ${currentStock}`);
          }
          productSnapshots[item.id] = currentStock;
        }

        const saleRef = doc(collection(db, 'sales'), saleId);
        const finalCustomerName = selectedCustomer ? selectedCustomer.name : (customCustomerName || 'Client de passage');
        
        const saleData = {
          userId: activeSession?.userId || user.uid,
          userName: activeSession?.userName || user.displayName || user.email?.split('@')[0] || 'Vendeur',
          customerId: selectedCustomer?.id || null,
          customerName: finalCustomerName,
          items: cart.map(item => ({
            productId: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity
          })),
          subtotal,
          discount,
          totalAmount: total,
          receivedAmount: Number(receivedAmount) || total,
          change: change > 0 ? change : 0,
          paymentMethod,
          status: 'completed' as const,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        transaction.set(saleRef, cleanObject(saleData));

        if (selectedCustomer) {
          const customerRef = doc(db, 'customers', selectedCustomer.id);
          transaction.update(customerRef, {
            totalSpent: increment(total),
            updatedAt: serverTimestamp()
          });
        }

        for (const item of cart) {
          const productRef = doc(db, 'products', item.id);
          const currentStock = productSnapshots[item.id];

          transaction.update(productRef, {
            stockQuantity: increment(-item.quantity),
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
            newStock: currentStock - item.quantity,
            reason: `Vente ${saleId}`,
            referenceId: saleId,
            userId: user.uid,
            userName: user.displayName || 'Vendeur',
            createdAt: serverTimestamp()
          }));
        }
      });
      
      const saleDataForInvoice = {
        invoiceNumber: saleId,
        date: new Date(),
        items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer ? selectedCustomer.name : (customCustomerName || 'Client de passage'),
        totalAmount: total,
        receivedAmount: Number(receivedAmount) || total,
        change: change > 0 ? change : 0,
        paymentMethod,
        userName: user.displayName || 'Admin'
      };
      
      setLastSale(saleDataForInvoice);
      pdfService.generateInvoice(saleDataForInvoice);
      
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
  };

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

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') { // Shortcut for sale
        handleSale();
      }
      if (e.key === 'F2') { // Shortcut for clear
        setCart([]);
      }
      if (e.key === 'F4') { // Shortcut for Pending
        handleSuspendSale();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, isProcessing, selectedCustomer, customCustomerName, discount, subtotal, total, handleSale, handleSuspendSale]); // Added dependencies for safety

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      // If there are items in the cart and we're navigating away (unmounting)
      // we save it automatically to avoid data loss
      if (cartRef.current.length > 0 && user?.uid) {
        // Create a copy of values at unmount time
        const cartToSave = [...cartRef.current];
        const customerToSave = customerRef.current;
        const discountToSave = discountRef.current;
        const subtotalToSave = subtotalRef.current;
        const totalToSave = totalRef.current;
        const userId = user.uid;
        const userName = user.displayName || 'Vendeur';

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
        }).catch(err => console.error("POS Auto-save failed:", err));
      }
    };
  }, [user?.uid]);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-100 overflow-hidden font-sans">
      <StartSessionModal isOpen={!sessionLoading && !activeSession} />
      {/* Categories Sidebar */}
      <div className="w-64 bg-slate-200 border-r border-slate-300 flex flex-col hidden lg:flex">
        <div className="p-4 bg-slate-800 text-white flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/dashboard')}
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
                type="text"
                placeholder="Rechercher un produit... (Nom, SKU, Code-barre)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowPendingModal(true)} 
                className="text-xs h-9 relative border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              >
                <Zap size={16} className="mr-1" /> En attente
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
                   <span>Instance (F4)</span>
                </div>
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/sales-history')} className="text-xs h-9">
                <History size={16} className="mr-1" /> Historique
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCart([])} className="text-xs h-9">
                <RefreshCw size={16} className="mr-1" /> Vider
              </Button>
            </div>
          </div>
        </div>

        {/* Product Grid Area (The "Top" Table) */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
          <table className="dolisoft-table">
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
                    <button className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">
                      <Plus size={14} />
                    </button>
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
            <table className="dolisoft-table">
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
                {cart.map(item => (
                  <tr key={item.id}>
                    <td className="font-bold text-slate-700">{item.name}</td>
                    <td className="text-right font-mono text-slate-500">{formatCurrency(item.price)}</td>
                    <td className="text-center px-1">
                      <div className="flex items-center justify-center gap-1 group/qty">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)} 
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
                              const targetVal = Math.max(0, Math.min(val, stock)); // Allow 0 while typing
                              
                              setCart(prev => prev.map(i => 
                                i.id === item.id 
                                  ? { ...i, quantity: targetVal, total: Number((targetVal * i.price).toFixed(2)) } 
                                  : i
                              ));

                              if (val > stock) {
                                showToast(`Stock maximum: ${stock}`, 'warning');
                              }
                            } else if (e.target.value === '') {
                               setCart(prev => prev.map(i => 
                                i.id === item.id 
                                  ? { ...i, quantity: 0, total: 0 } 
                                  : i
                              ));
                            }
                          }}
                          className="w-16 h-7 text-center font-black text-sm bg-blue-50 border border-blue-200 rounded-md outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => toggleUnit(item.id)}
                          className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-100 transition-colors"
                          title="Changer l'unité (u/ml)"
                        >
                          {item.unit || 'u'}
                        </button>
                        
                        <button 
                          onClick={() => updateQuantity(item.id, 1)} 
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

        {/* Totals Section */}
        <div className="p-4 bg-slate-800 text-white space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Total HT</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
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
            <CheckCircle2 className="mr-3" size={24} /> Valider (F9)
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
             <table className="dolisoft-table">
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
                            {pending.createdAt ? format(pending.createdAt.toDate(), 'dd/MM HH:mm') : '-'}
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
                              onClick={async () => {
                                if(window.confirm("Supprimer cette mise en instance ?")) {
                                  try {
                                    setIsDeletingPending(pending.id);
                                    await dbService.deleteDocument('pending_sales', pending.id);
                                    showToast("Mise en instance supprimée", "success");
                                  } catch (error) {
                                    showToast("Erreur lors de la suppression", "error");
                                  } finally {
                                    setIsDeletingPending(null);
                                  }
                                }
                              }}
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
                   <Button onClick={() => lastSale && pdfService.generateInvoice(lastSale)} className="bg-blue-600 hover:bg-blue-700">
                     <Printer size={16} className="mr-2" /> Imprimer Ticket
                   </Button>
                   <Button variant="outline" onClick={() => setShowSuccess(false)}>Terminer</Button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default POS;
