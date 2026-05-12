import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../firebase/db';
import { collection, runTransaction, doc, serverTimestamp, orderBy, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { useCollection } from '../hooks/useCollection';
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
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pdfService } from '../services/pdfService';
import { format } from 'date-fns';

const POS: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useNotification();
  const navigate = useNavigate();
  
  const { data: products, loading: productsLoading } = useCollection<Product>('products', [orderBy('name')]);
  const { data: categories } = useCollection<Category>('categories', [orderBy('name')]);
  const { data: customers } = useCollection<Customer>('customers', [orderBy('name')]);

  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [lastSale, setLastSale] = useState<any>(null);
  
  const { data: pendingSales } = useCollection<any>('pending_sales', [orderBy('createdAt', 'desc')]);

  const scannerInputRef = useRef<HTMLInputElement>(null);

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
  }, [cart, isProcessing, selectedCustomer, discount]);

  const handleSuspendSale = async () => {
    if (cart.length === 0 || isSuspending || !user) return;
    
    setIsSuspending(true);
    try {
      await dbService.addDocument('pending_sales', {
        userId: user.uid,
        userName: user.displayName || 'Vendeur',
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || 'Client de passage',
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

  const recallPendingSale = (pending: any) => {
    if (cart.length > 0 && !window.confirm("Le panier actuel sera remplacé par la vente en instance. Continuer ?")) {
      return;
    }
    
    setCart(pending.items || []);
    setDiscount(pending.discount || 0);
    if (pending.customerId) {
      const cust = customers.find(c => c.id === pending.customerId);
      setSelectedCustomer(cust || { id: pending.customerId, name: pending.customerName } as Customer);
    } else {
      setSelectedCustomer(null);
    }
    
    // Delete from pending after recall
    dbService.deleteDocument('pending_sales', pending.id);
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

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= stock) {
          showToast(`Stock limité à ${stock} pour ${product.name}`, 'warning');
          return prev;
        }
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
        total: product.sellingPrice
      }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const stock = Number(product.stockQuantity) || 0;

    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        if (newQty > stock) {
          showToast(`Stock limité pour ${item.name}`, 'warning');
          return item;
        }
        return { ...item, quantity: newQty, total: newQty * item.price };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);
  const tax = useMemo(() => subtotal * 0, [subtotal]); // Custom tax if needed
  const total = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount]);
  const change = useMemo(() => {
    const received = Number(receivedAmount) || 0;
    return received > 0 ? (received - total) : 0;
  }, [receivedAmount, total]);

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
        const saleData = {
          userId: user.uid,
          userName: user.displayName || user.email?.split('@')[0] || 'Vendeur',
          customerId: selectedCustomer?.id || null,
          customerName: selectedCustomer?.name || 'Client de passage',
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
        customerName: selectedCustomer?.name || 'Client de passage',
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

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-100 overflow-hidden font-sans">
      {/* Categories Sidebar */}
      <div className="w-64 bg-slate-200 border-r border-slate-300 flex flex-col hidden lg:flex">
        <div className="p-4 bg-slate-800 text-white flex items-center gap-2">
          <Layers size={18} />
          <span className="font-bold uppercase text-xs tracking-widest">Catégories</span>
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
                      {p.stockQuantity} {p.stockQuantity <= 1 ? 'unité' : 'unités'}
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
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-slate-200 rounded border border-slate-300"><Minus size={12}/></button>
                        <span className="w-10 font-bold text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-slate-200 rounded border border-slate-300"><Plus size={12}/></button>
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
            <button onClick={() => setShowCustomerModal(true)} className="text-[10px] font-bold text-blue-600 hover:underline">Modifier</button>
          </div>
          <div className="flex items-center gap-3 p-2 border border-slate-300 bg-white">
            <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-slate-500">
              <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
               <div className="text-xs font-bold text-slate-900 truncate">{selectedCustomer?.name || 'Client de passage'}</div>
               <div className="text-[10px] text-slate-500">{selectedCustomer?.phone || '-'}</div>
            </div>
          </div>
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
              type="text" 
              placeholder="Chercher client..." 
              value={customerSearchQuery}
              onChange={(e) => setCustomerSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {customers.filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase())).map(c => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCustomer(c);
                  setShowCustomerModal(false);
                }}
                className="w-full flex items-center justify-between p-3 border border-slate-200 hover:bg-blue-50 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-slate-500"><User size={16}/></div>
                   <div>
                     <div className="text-sm font-bold">{c.name}</div>
                     <div className="text-[10px] text-slate-500">{c.phone || 'Sans téléphone'}</div>
                   </div>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setShowCustomerModal(false)} className="w-full">Annuler</Button>
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
                              onClick={() => {
                                if(window.confirm("Supprimer cette mise en instance ?")) {
                                  dbService.deleteDocument('pending_sales', pending.id);
                                }
                              }}
                              className="ml-1 p-1 text-slate-300 hover:text-rose-600 transition-colors"
                              title="Supprimer"
                            >
                               <Trash2 size={14} />
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
