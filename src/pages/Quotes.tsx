import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { Quote, Product, Customer, QuoteItem, Project } from '../types';
import { dbService } from '../firebase/db';
import { orderBy, serverTimestamp, addDoc, collection, doc, updateDoc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';
import { pdfService } from '../services/pdfService';
import { Button } from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { 
  Plus, 
  Search, 
  FileText, 
  Download, 
  Trash2, 
  ShoppingCart, 
  User, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  X,
  Eye,
  ArrowRightLeft,
  FilePlus,
  MoreVertical,
  ChevronRight,
  Filter,
  Printer
} from 'lucide-react';
import { formatCurrency, cn, cleanObject } from '../lib/utils';
import { format, addDays } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

const Quotes: React.FC = () => {
  const { user, userData, isAdmin } = useAuth();
  const { showToast } = useNotification();
  const { settings } = useSettings();
  
  const { data: quotes, loading: quotesLoading } = useCollection<Quote>('quotes', [orderBy('createdAt', 'desc')]);
  const { data: products } = useCollection<Product>('products', [orderBy('name')]);
  const { data: customers } = useCollection<Customer>('customers', [orderBy('name')]);
  const { data: projects } = useCollection<Project>('projects', [orderBy('name')]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isConvertToInvoiceModalOpen, setIsConvertToInvoiceModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    setCustomInfoOverride(settings.customCompanyInfo || '');
  }, [settings.customCompanyInfo]);

  // New Quote State
  const [cart, setCart] = useState<QuoteItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [customClientInfo, setCustomClientInfo] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
    nif: '',
    rc: '',
    ai: ''
  });
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [customInfoOverride, setCustomInfoOverride] = useState(settings.customCompanyInfo || '');
  const [taxRate, setTaxRate] = useState((settings.taxRate || 19) / 100);
  
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);
  const taxAmount = useMemo(() => settings.useTax ? (subtotal - discount) * taxRate : 0, [subtotal, discount, taxRate, settings.useTax]);
  const totalAmount = useMemo(() => subtotal - discount + taxAmount, [subtotal, discount, taxAmount]);

  const filteredQuotes = quotes.filter(q => 
    q.quoteNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddItem = (product: Product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.id === product.id 
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
          : item
      ));
    } else {
      setCart([...cart, {
        id: product.id,
        name: product.name,
        quantity: 1,
        price: product.sellingPrice,
        unit: product.unit,
        total: product.sellingPrice,
        isManual: false
      }]);
    }
    showToast(`${product.name} ajouté`, 'success');
  };

  const handleAddManualItem = () => {
    const name = window.prompt("Nom de l'article:");
    if (!name) return;
    const priceStr = window.prompt("Prix unitaire:");
    const price = parseFloat(priceStr || '0');
    if (isNaN(price) || price <= 0) return;
    const qtyStr = window.prompt("Quantité:");
    const quantity = parseFloat(qtyStr || '1');
    if (isNaN(quantity) || quantity <= 0) return;

    setCart([...cart, {
      id: `manual-${Date.now()}`,
      name,
      quantity,
      price,
      total: quantity * price,
      isManual: true
    }]);
  };

  const handleRemoveItem = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const resetForm = () => {
    setCart([]);
    setSelectedCustomer(null);
    setCustomClientInfo({
      name: '',
      phone: '',
      address: '',
      email: '',
      nif: '',
      rc: '',
      ai: ''
    });
    setNotes('');
    setDiscount(0);
    setSelectedProject(null);
  };

  const handleSaveQuote = async () => {
    if (cart.length === 0) {
      showToast("Le devis est vide", "error");
      return;
    }

    setIsSaving(true);
    try {
      const quoteNumber = `DEV-${Date.now().toString().slice(-6)}`;
      const customerName = selectedCustomer?.name || customClientInfo.name || 'Client de passage';
      
      const quoteData: Omit<Quote, 'id'> = {
        quoteNumber,
        items: cart,
        subtotal,
        taxAmount,
        taxRate,
        discount,
        totalAmount,
        customerName,
        customerId: selectedCustomer?.id || undefined,
        customerPhone: selectedCustomer?.phone || customClientInfo.phone,
        customerAddress: selectedCustomer?.address || customClientInfo.address,
        customerEmail: selectedCustomer?.email || customClientInfo.email,
        customerNIF: customClientInfo.nif,
        customerRC: customClientInfo.rc,
        customerAI: customClientInfo.ai,
        projectId: selectedProject?.id || undefined,
        projectName: selectedProject?.name || undefined,
        userId: user?.uid || userData?.id || '',
        userName: userData?.displayName || user?.displayName || 'Admin',
        status: 'draft',
        expiryDate: addDays(new Date(), 30),
        notes,
        customCompanyInfo: customInfoOverride,
        createdAt: serverTimestamp() as any
      };

      await addDoc(collection(db, 'quotes'), cleanObject(quoteData));
      showToast("Devis enregistré avec succès", "success");
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'enregistrement", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConvertToInvoice = async () => {
    if (!selectedQuote) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Create the invoice
      const invoiceRef = doc(collection(db, 'invoices'));
      const invoiceNumber = `FAC-${Date.now().toString().slice(-6)}`;
      const invoiceData = {
        invoiceNumber,
        items: selectedQuote.items,
        subtotal: selectedQuote.subtotal,
        taxAmount: selectedQuote.taxAmount,
        taxRate: selectedQuote.taxRate,
        discount: selectedQuote.discount,
        totalAmount: selectedQuote.totalAmount,
        customerName: selectedQuote.customerName,
        customerId: selectedQuote.customerId,
        customerPhone: selectedQuote.customerPhone,
        customerAddress: selectedQuote.customerAddress,
        customerEmail: selectedQuote.customerEmail,
        customerNIF: selectedQuote.customerNIF,
        customerRC: selectedQuote.customerRC,
        customerAI: selectedQuote.customerAI,
        projectId: selectedQuote.projectId || null,
        projectName: selectedQuote.projectName || null,
        userId: user?.uid || userData?.uid || userData?.id,
        userName: userData?.displayName || user?.displayName,
        status: 'validated',
        paymentMethod: 'cash',
        paymentStatus: 'pending',
        customCompanyInfo: selectedQuote.customCompanyInfo,
        createdAt: serverTimestamp(),
        referenceQuoteId: selectedQuote.id
      };
      batch.set(invoiceRef, cleanObject(invoiceData));

      // 2. Update quote status
      const quoteRef = doc(db, 'quotes', selectedQuote.id);
      batch.update(quoteRef, { status: 'converted', updatedAt: serverTimestamp() });

      // 3. Update stocks (only for non-manual items)
      for (const item of selectedQuote.items) {
        if (!item.isManual) {
          const productRef = doc(db, 'products', item.id);
          batch.update(productRef, {
            stockQuantity: increment(-item.quantity),
            updatedAt: serverTimestamp()
          });

          // Stock movement
          const movementRef = doc(collection(db, 'stock_movements'));
          batch.set(movementRef, {
            productId: item.id,
            productName: item.name,
            type: 'sale',
            quantity: item.quantity,
            userId: user?.uid || userData?.id,
            userName: userData?.displayName || user?.displayName,
            referenceId: invoiceRef.id,
            createdAt: serverTimestamp()
          });
        }
      }

      await batch.commit();
      showToast("Devis converti en Facture avec succès", "success");
      setIsConvertToInvoiceModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la conversion", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = (quote: Quote) => {
    pdfService.generateQuote({
      quoteNumber: quote.quoteNumber,
      date: (quote.createdAt as any)?.toDate ? (quote.createdAt as any).toDate() : (quote.createdAt instanceof Date ? quote.createdAt : new Date()),
      expiryDate: (quote.expiryDate as any)?.toDate ? (quote.expiryDate as any).toDate() : (quote.expiryDate instanceof Date ? quote.expiryDate : new Date()),
      customerName: quote.customerName || 'Client',
      customerPhone: quote.customerPhone,
      customerAddress: quote.customerAddress,
      customerEmail: quote.customerEmail,
      customerNIF: quote.customerNIF,
      customerRC: quote.customerRC,
      customerAI: quote.customerAI,
      items: quote.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      taxRate: quote.taxRate,
      discount: quote.discount,
      totalAmount: quote.totalAmount,
      userName: quote.userName || 'Admin',
      notes: quote.notes,
      customCompanyInfo: quote.customCompanyInfo
    });
  };

  const handleDelete = async () => {
    if (!selectedQuote) return;
    try {
      await dbService.deleteDocument('quotes', selectedQuote.id);
      showToast("Devis supprimé", "success");
      setIsDeleteModalOpen(false);
    } catch (err) {
      showToast("Erreur lors de la suppression", "error");
    }
  };

  const handleConvertToSale = async () => {
    if (!selectedQuote) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Create the sale
      const saleRef = doc(collection(db, 'sales'));
      const saleData = {
        items: selectedQuote.items.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          unit: i.unit,
          total: i.total
        })),
        totalAmount: selectedQuote.totalAmount,
        subtotal: selectedQuote.subtotal,
        discount: selectedQuote.discount,
        customerName: selectedQuote.customerName,
        customerId: selectedQuote.customerId,
        projectId: selectedQuote.projectId || null,
        projectName: selectedQuote.projectName || null,
        userId: user?.uid || userData?.uid || userData?.id,
        userName: userData?.displayName || user?.displayName,
        status: 'completed',
        paymentMethod: 'cash',
        source: 'quote',
        customCompanyInfo: selectedQuote.customCompanyInfo,
        createdAt: serverTimestamp(),
        referenceQuoteId: selectedQuote.id
      };
      batch.set(saleRef, cleanObject(saleData));

      // 2. Update quote status
      const quoteRef = doc(db, 'quotes', selectedQuote.id);
      batch.update(quoteRef, { status: 'converted', updatedAt: serverTimestamp() });

      // 3. Update stocks (only for non-manual items)
      for (const item of selectedQuote.items) {
        if (!item.isManual) {
          const productRef = doc(db, 'products', item.id);
          batch.update(productRef, {
            stockQuantity: increment(-item.quantity),
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();
      showToast("Devis converti en vente avec succès", "success");
      setIsConvertModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la conversion", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (newState: string) => {
    if (!selectedQuote) return;
    setIsSaving(true);
    try {
      const quoteRef = doc(db, 'quotes', selectedQuote.id);
      await updateDoc(quoteRef, { status: newState, updatedAt: serverTimestamp() });
      showToast("Statut mis à jour", "success");
      setIsViewModalOpen(false);
    } catch (err) {
      showToast("Erreur lors de la mise à jour", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <FileText className="text-blue-600" size={32} /> Devis & Estimations
          </h1>
          <p className="text-slate-500 font-medium mt-1">Gérez vos propositions commerciales et convertissez-les en ventes.</p>
        </div>
        <Button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 uppercase font-black tracking-widest px-8"
        >
          <Plus size={18} className="mr-2" /> Nouveau Devis
        </Button>
      </div>

      {/* Search & Stats */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
          <input
            type="text"
            placeholder="Rechercher par Numéro ou Client..."
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-none focus:ring-4 focus:ring-blue-50 focus:border-blue-500 transition-all font-bold text-slate-800"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quotesLoading ? (
           Array(6).fill(0).map((_, i) => (
             <div key={i} className="h-48 bg-white border border-slate-100 animate-pulse" />
           ))
        ) : (filteredQuotes || []).length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white border-2 border-dashed border-slate-200">
            <FilePlus size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-bold">Aucun devis trouvé.</p>
          </div>
        ) : (filteredQuotes || []).map((quote) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={quote.id}
            className="bg-white border border-slate-200 p-5 hover:border-blue-400 transition-all group relative cursor-pointer"
            onClick={() => { setSelectedQuote(quote); setIsViewModalOpen(true); }}
          >
            <div className="flex justify-between items-start mb-4">
              <span className={cn(
                "px-2 py-1 text-[9px] font-black uppercase tracking-widest border",
                quote.status === 'draft' ? "bg-slate-100 text-slate-600 border-slate-200" :
                quote.status === 'sent' ? "bg-blue-50 text-blue-600 border-blue-100" :
                quote.status === 'accepted' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                quote.status === 'converted' ? "bg-purple-50 text-purple-600 border-purple-100" :
                "bg-rose-50 text-rose-600 border-rose-100"
              )}>
                {quote.status}
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {quote.createdAt ? format((quote.createdAt as any)?.toDate ? (quote.createdAt as any).toDate() : (quote.createdAt instanceof Date ? quote.createdAt : new Date()), 'dd/MM/yyyy') : '-'}
              </span>
            </div>

            <h3 className="font-black text-lg text-slate-800 tracking-tight mb-1">{quote.quoteNumber}</h3>
            <p className="text-sm font-bold text-slate-500 truncate mb-4 flex items-center gap-2">
              <User size={14} className="text-slate-300" /> {quote.customerName || 'Client de passage'}
            </p>

            <div className="flex items-end justify-between border-t border-slate-50 pt-4">
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Total Devis</p>
                <p className="text-xl font-black text-slate-900">{formatCurrency(quote.totalAmount)}</p>
              </div>
              <div className="flex gap-1">
                 <button 
                  onClick={(e) => { e.stopPropagation(); handlePrint(quote); }}
                  className="p-2 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition-colors"
                  title="Imprimer PDF"
                 >
                   <Printer size={18} />
                 </button>
                 {quote.status !== 'converted' && (
                   <div className="flex gap-1">
                     <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedQuote(quote); setIsConvertModalOpen(true); }}
                      className="p-2 hover:bg-emerald-50 rounded text-emerald-500 hover:text-emerald-600 transition-colors"
                      title="Vente Directe"
                     >
                       <ShoppingCart size={18} />
                     </button>
                     <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedQuote(quote); setIsConvertToInvoiceModalOpen(true); }}
                      className="p-2 hover:bg-blue-50 rounded text-blue-500 hover:text-blue-600 transition-colors"
                      title="Facturer"
                     >
                       <FilePlus size={18} />
                     </button>
                   </div>
                 )}
                 <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedQuote(quote); setIsDeleteModalOpen(true); }}
                  className="p-2 hover:bg-rose-50 rounded text-rose-500 hover:text-rose-600 transition-colors"
                  title="Supprimer"
                 >
                   <Trash2 size={18} />
                 </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Creation Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Créer un nouveau Devis"
        size="2xl"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:h-[80vh] h-auto bg-white overflow-y-auto lg:overflow-hidden">
          {/* Left: Product Selection */}
          <div className="lg:col-span-7 flex flex-col lg:overflow-hidden p-4 lg:p-6 overflow-visible h-auto lg:h-full border-b lg:border-b-0">
            <div className="mb-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Articles en stock..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-100 border-none focus:ring-2 focus:ring-blue-500 font-bold"
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button 
                variant="outline" 
                onClick={handleAddManualItem}
                className="w-full border-slate-300 border-dashed hover:bg-slate-50"
              >
                <Plus size={16} className="mr-2" /> Ajouter un article manuel
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 min-h-[300px]">
              {products
                .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 20)
                .map(product => (
                  <div 
                    key={product.id}
                    onClick={() => handleAddItem(product)}
                    className="p-3 bg-white border border-slate-200 hover:border-blue-400 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <p className="text-xs font-black uppercase text-slate-800 line-clamp-1">{product.name}</p>
                      <p className="text-[10px] text-slate-400">{product.sku}</p>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-sm font-black text-blue-600">{formatCurrency(product.sellingPrice)}</span>
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                        product.stockQuantity > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        Stock: {Math.floor(product.stockQuantity)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Right: Cart & Totals */}
          <div className="lg:col-span-5 flex flex-col bg-slate-50 border-l border-slate-200 lg:overflow-hidden h-full">
               {/* Scrollable Content Area */}
               <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 scrollbar-hide min-h-[400px]">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Client</label>
                      <select 
                        className="w-full p-3 bg-white border border-slate-200 rounded font-bold"
                        onChange={(e) => {
                          const c = customers.find(x => x.id === e.target.value);
                          setSelectedCustomer(c || null);
                          if (c) {
                            setCustomClientInfo({
                              name: c.name,
                              phone: c.phone || '',
                              address: c.address || '',
                              email: c.email || '',
                              nif: c.nif || '',
                              rc: c.rc || '',
                              ai: c.ai || ''
                            });
                          }
                        }}
                      >
                        <option value="">Sélectionner un client...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>

                      <AnimatePresence>
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          className="space-y-2 overflow-hidden mt-2"
                        >
                           <div className="grid grid-cols-2 gap-2">
                              <input 
                                placeholder="Nom/Raison Sociale" 
                                className="p-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={customClientInfo.name}
                                onChange={(e) => setCustomClientInfo({...customClientInfo, name: e.target.value})}
                              />
                              <input 
                                placeholder="Téléphone" 
                                className="p-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={customClientInfo.phone}
                                onChange={(e) => setCustomClientInfo({...customClientInfo, phone: e.target.value})}
                              />
                           </div>
                           <input 
                            placeholder="Adresse Complète client" 
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={customClientInfo.address}
                            onChange={(e) => setCustomClientInfo({...customClientInfo, address: e.target.value})}
                          />
                           <div className="grid grid-cols-3 gap-2">
                              <input 
                                placeholder="NIF" 
                                className="p-2 bg-white border border-slate-200 rounded-lg text-[9px] font-mono shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={customClientInfo.nif}
                                onChange={(e) => setCustomClientInfo({...customClientInfo, nif: e.target.value})}
                              />
                              <input 
                                placeholder="RC" 
                                className="p-2 bg-white border border-slate-200 rounded-lg text-[9px] font-mono shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={customClientInfo.rc}
                                onChange={(e) => setCustomClientInfo({...customClientInfo, rc: e.target.value})}
                              />
                              <input 
                                placeholder="AI" 
                                className="p-2 bg-white border border-slate-200 rounded-lg text-[9px] font-mono shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={customClientInfo.ai}
                                onChange={(e) => setCustomClientInfo({...customClientInfo, ai: e.target.value})}
                              />
                           </div>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Rattachement Chantier</label>
                      <select 
                        className="w-full p-3 bg-white border border-slate-200 rounded font-bold"
                        value={selectedProject?.id || ''}
                        onChange={(e) => {
                          const p = projects.find(x => x.id === e.target.value);
                          setSelectedProject(p || null);
                        }}
                      >
                        <option value="">Aucun Chantier associé</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">En-tête de l'entreprise personnalisé</label>
                      <textarea 
                        className="w-full p-3 bg-white border border-slate-200 rounded font-medium text-xs min-h-[80px]"
                        placeholder="Coordonnées personnalisées pour ce devis..."
                        value={customInfoOverride}
                        onChange={(e) => setCustomInfoOverride(e.target.value)}
                      />
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Sélection ({cart.length})</p>
                      {cart.map(item => (
                        <div key={item.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black uppercase truncate text-slate-800">{item.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-500">{item.quantity} {item.unit || 'U'}</span>
                              <span className="text-[10px] text-slate-400">x {formatCurrency(item.price)}</span>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                            <p className="text-sm font-black text-slate-900">{formatCurrency(item.total)}</p>
                            <button onClick={() => handleRemoveItem(item.id)} className="p-1 hover:bg-rose-50 rounded-full text-rose-500 transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {cart.length === 0 && (
                        <div className="py-10 text-center text-slate-300 text-xs italic font-bold">
                          Aucun article sélectionné
                        </div>
                      )}
                    </div>
                  </div>
               </div>

               {/* Static Footer Area */}
               <div className="bg-white p-4 lg:p-6 border-t border-slate-200 shadow-2xl space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm font-bold text-slate-500">
                      <span>Sous-total</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="font-bold text-slate-500">Remise</span>
                      <div className="relative">
                        <input 
                          type="number" 
                          step="100"
                          className="w-32 p-2 text-right bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                          value={discount || ''}
                          onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        />
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">DA</span>
                      </div>
                    </div>
                    {settings.useTax && (
                      <div className="flex justify-between text-sm font-bold text-slate-500">
                        <span>TVA ({taxRate * 100}%)</span>
                        <span>{formatCurrency(taxAmount)}</span>
                      </div>
                    )}
                    <div className="pt-4 border-t border-slate-100 flex justify-between items-baseline">
                      <span className="text-sm font-black uppercase tracking-widest text-slate-800">Total Devis</span>
                      <span className="text-3xl font-black text-blue-600">{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>

                  <Button 
                    onClick={handleSaveQuote}
                    isLoading={isSaving}
                    className="w-full h-14 bg-blue-600 hover:bg-blue-700 uppercase font-black tracking-widest text-white shadow-xl shadow-blue-100"
                  >
                    Enregistrer le Devis
                  </Button>
               </div>
          </div>
        </div>
      </Modal>

      {/* View Detail Modal */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Détail du Devis" size="xl">
        {selectedQuote && (
          <div className="flex flex-col max-h-[85vh]">
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6">
              <div className="flex justify-between border-b pb-4">
                <div>
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Numéro Devis</p>
                  <p className="text-xl font-black text-slate-900">{selectedQuote.quoteNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Date</p>
                  <p className="text-md font-bold text-slate-600">
                     {selectedQuote.createdAt ? format((selectedQuote.createdAt as any)?.toDate ? (selectedQuote.createdAt as any).toDate() : (selectedQuote.createdAt instanceof Date ? selectedQuote.createdAt : new Date()), 'dd/MM/yyyy HH:mm') : '-'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded border border-slate-100">
                 <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1 leading-none">Client</p>
                 <p className="text-lg font-black text-slate-800 flex items-center gap-2">
                   <User size={18} className="text-blue-500" /> {selectedQuote.customerName}
                 </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      <th className="py-2">Articles</th>
                      <th className="py-2 text-center">Qté</th>
                      <th className="py-2 text-right">P.U</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="font-bold">
                    {selectedQuote.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-50">
                        <td className="py-3 uppercase flex flex-col">
                          <span>{item.name}</span>
                          {item.isManual && <span className="text-[8px] text-rose-500 font-black">SAISIE MANUELLE</span>}
                        </td>
                        <td className="py-3 text-center">{item.quantity}</td>
                        <td className="py-3 text-right">{formatCurrency(item.price)}</td>
                        <td className="py-3 text-right text-slate-900">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col items-end space-y-2 pt-4">
                <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-slate-500">
                  <span>Sous-total</span>
                  <span>{formatCurrency(selectedQuote.subtotal)}</span>
                </div>
                <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-slate-500">
                  <span>Remise</span>
                  <span>-{formatCurrency(selectedQuote.discount)}</span>
                </div>
                {selectedQuote.taxAmount > 0 && (
                  <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-slate-500">
                    <span>TVA ({selectedQuote.taxRate * 100}%)</span>
                    <span>{formatCurrency(selectedQuote.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between w-full max-w-[200px] pt-3 border-t text-lg font-black text-blue-600">
                  <span>TOTAL</span>
                  <span>{formatCurrency(selectedQuote.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t flex flex-col sm:flex-row gap-3 font-black">
              <Button 
                onClick={() => handlePrint(selectedQuote)}
                className="flex-1 bg-slate-800 hover:bg-slate-900 text-white uppercase tracking-widest h-12"
              >
                <Printer size={18} className="mr-2" /> Imprimer le Devis
              </Button>
              {selectedQuote.status !== 'converted' && (
                <div className="flex-1 flex flex-col gap-3">
                   {selectedQuote.status === 'draft' && (
                     <Button 
                        onClick={() => handleUpdateStatus('sent')}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white uppercase tracking-widest h-10 text-[10px]"
                     >
                       <Clock size={14} className="mr-2" /> Marquer comme Envoyé
                     </Button>
                   )}
                   {['draft', 'sent'].includes(selectedQuote.status) && (
                     <Button 
                        onClick={() => handleUpdateStatus('accepted')}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white uppercase tracking-widest h-10 text-[10px]"
                     >
                       <CheckCircle2 size={14} className="mr-2" /> Confirmer / Accepter
                     </Button>
                   )}
                   <div className="flex gap-3">
                      <Button 
                        onClick={() => setIsConvertModalOpen(true)}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 uppercase tracking-widest h-12 text-[10px] text-white"
                      >
                        <ShoppingCart size={14} className="mr-2" /> Vente Directe
                      </Button>
                      <Button 
                        onClick={() => setIsConvertToInvoiceModalOpen(true)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 uppercase tracking-widest h-12 text-[10px] text-white"
                      >
                        <FilePlus size={14} className="mr-2" /> Facturer
                      </Button>
                   </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer le Devis"
        message="Êtes-vous sûr de vouloir supprimer ce devis ? Cette action est irréversible."
        confirmText="Supprimer"
        variant="danger"
      />

      <ConfirmationModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        onConfirm={handleConvertToSale}
        title="Vente Directe"
        message={`Voulez-vous convertir le devis ${selectedQuote?.quoteNumber} en vente finale ? Le stock sera automatiquement déduit.`}
        confirmText="Confirmer la Vente"
        variant="success"
        isLoading={isSaving}
      />

      <ConfirmationModal
        isOpen={isConvertToInvoiceModalOpen}
        onClose={() => setIsConvertToInvoiceModalOpen(false)}
        onConfirm={handleConvertToInvoice}
        title="Convertir en Facture"
        message={`Voulez-vous générer une facture officielle à partir du devis ${selectedQuote?.quoteNumber} ?`}
        confirmText="Générer Facture"
        variant="info"
        isLoading={isSaving}
      />
    </div>
  );
};

export default Quotes;
