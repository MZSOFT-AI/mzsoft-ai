import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { Invoice, Product, Customer, InvoiceItem, Quote, PaymentRecord } from '../types';
import { dbService } from '../firebase/db';
import { orderBy, serverTimestamp, addDoc, collection, doc, writeBatch, increment, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';
import { useSession } from '../context/SessionContext';
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
  FilePlus,
  MoreVertical,
  ChevronRight,
  Filter,
  CreditCard,
  Ban,
  Printer
} from 'lucide-react';
import { formatCurrency, cn, cleanObject } from '../lib/utils';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { notificationService } from '../services/notificationService';

const Invoices: React.FC = () => {
  const { user, userData } = useAuth();
  const { showToast } = useNotification();
  const { settings } = useSettings();
  const { activeSession } = useSession();
  
  const { data: invoices, loading: invoicesLoading } = useCollection<Invoice>('invoices', [orderBy('createdAt', 'desc')]);
  const { data: products } = useCollection<Product>('products', [orderBy('name')]);
  const { data: customers } = useCollection<Customer>('customers', [orderBy('name')]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  React.useEffect(() => {
    setCustomInfoOverride(settings.customCompanyInfo || '');
  }, [settings.customCompanyInfo]);

  // New Invoice State
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
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
  const [dueDate, setDueDate] = useState<string>('');
  const [amountPaidNow, setAmountPaidNow] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [taxRate, setTaxRate] = useState((settings.taxRate || 19) / 100);
  
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);
  const taxAmount = useMemo(() => settings.useTax ? (subtotal - discount) * taxRate : 0, [subtotal, discount, taxRate, settings.useTax]);
  const totalAmount = useMemo(() => subtotal - discount + taxAmount, [subtotal, discount, taxAmount]);
  const balance = useMemo(() => Math.max(0, totalAmount - amountPaidNow), [totalAmount, amountPaidNow]);

  const filteredInvoices = invoices.filter(i => 
    i.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [paymentRecordAmount, setPaymentRecordAmount] = useState<number>(0);
  const [paymentRecordMethod, setPaymentRecordMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [isAddingPayment, setIsAddingPayment] = useState(false);

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
  };

  const handleAddManualItem = () => {
    const name = window.prompt("Nom de l'article:");
    if (!name) return;
    const priceStr = window.prompt("Prix unitaire (DZD):");
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
    setDueDate('');
    setPaymentMethod('cash');
    setIsPreview(false);
    setEditingInvoiceId(null);
  };

  const handleSaveInvoice = async (status: 'draft' | 'pending' | 'paid' = 'paid') => {
    if (cart.length === 0) {
      showToast("La facture est vide", "error");
      return;
    }

    setIsSaving(true);
    let finalInvoiceNumber = "";
    try {
      const finalStatus = status === 'paid' && amountPaidNow < totalAmount ? 'pending' : status;
      const paymentStatus = amountPaidNow >= totalAmount ? 'paid' : (amountPaidNow > 0 ? 'partially_paid' : 'pending');
      const customerName = selectedCustomer?.name || customClientInfo.name || 'Client de passage';
      
      await runTransaction(db, async (transaction) => {
        let invoiceRef;
        let invoiceNumber;
        const currentInvoiceId = editingInvoiceId;
        let wasDraft = true;

        if (currentInvoiceId) {
          invoiceRef = doc(db, 'invoices', currentInvoiceId);
          const existingInv = invoices.find(i => i.id === currentInvoiceId);
          invoiceNumber = existingInv?.invoiceNumber || `FAC-${Date.now().toString().slice(-6)}`;
          wasDraft = existingInv?.status === 'draft';
        } else {
          const newDocRef = doc(collection(db, 'invoices'));
          invoiceRef = newDocRef;
          invoiceNumber = `FAC-${Date.now().toString().slice(-6)}`;
        }
        
        finalInvoiceNumber = invoiceNumber;

        // 1. READS MUST COME BEFORE WRITES
        const productSnapshots: Record<string, Product> = {};
        if (finalStatus !== 'draft' && wasDraft) {
          for (const item of cart) {
            if (!item.isManual) {
              const productRef = doc(db, 'products', item.id);
              const pSnap = await transaction.get(productRef);
              if (!pSnap.exists()) throw new Error(`Produit ${item.name} introuvable`);
              productSnapshots[item.id] = pSnap.data() as Product;
            }
          }
        }

        // Now we can do all writes
        const paymentRecord = amountPaidNow > 0 ? [{
          amount: amountPaidNow,
          date: new Date(),
          method: paymentMethod,
          userId: user?.uid || '',
          userName: userData?.displayName || 'Vendeur'
        }] : [];
        
        const invoiceData: Omit<Invoice, 'id'> = {
          invoiceNumber,
          items: cart,
          subtotal,
          taxAmount,
          taxRate,
          discount,
          totalAmount,
          amountPaid: amountPaidNow,
          balance: totalAmount - amountPaidNow,
          customerName,
          customerId: selectedCustomer?.id || undefined,
          customerPhone: selectedCustomer?.phone || customClientInfo.phone,
          customerAddress: selectedCustomer?.address || customClientInfo.address,
          customerEmail: selectedCustomer?.email || customClientInfo.email,
          customerNIF: customClientInfo.nif, 
          customerRC: customClientInfo.rc,
          customerAI: customClientInfo.ai,
          userId: user?.uid || userData?.uid || userData?.id || '',
          userName: userData?.displayName || user?.displayName || 'Admin',
          status: finalStatus as any,
          paymentMethod,
          paymentStatus: paymentStatus as any,
          notes,
          customCompanyInfo: customInfoOverride,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          paymentHistory: paymentRecord,
          createdAt: editingInvoiceId ? (invoices.find(i => i.id === editingInvoiceId)?.createdAt || serverTimestamp()) as any : serverTimestamp() as any,
          updatedAt: serverTimestamp() as any
        };

        // WRITE 1: Invoice
        transaction.set(invoiceRef, cleanObject(invoiceData), { merge: true });

        // If transitioning from draft to a validated state, update stock & totals
        if (finalStatus !== 'draft' && wasDraft) {
          // 2. Update Stock & Record Movements (WRITES)
          for (const item of cart) {
            if (!item.isManual) {
              const productRef = doc(db, 'products', item.id);
              const pData = productSnapshots[item.id];

              transaction.update(productRef, {
                stockQuantity: increment(-item.quantity),
                updatedAt: serverTimestamp()
              });

              // Stock movement (WRITE)
              const movementRef = doc(collection(db, 'stock_movements'));
              transaction.set(movementRef, {
                productId: item.id,
                productName: item.name,
                type: 'sale',
                quantity: item.quantity,
                previousStock: pData.stockQuantity,
                newStock: pData.stockQuantity - item.quantity,
                userId: user?.uid || '',
                userName: userData?.displayName || 'Vendeur',
                referenceId: invoiceRef.id,
                createdAt: serverTimestamp()
              });
            }
          }

          // 3. Update Customer Debt/Totals (WRITE)
          if (selectedCustomer) {
            const customerRef = doc(db, 'customers', selectedCustomer.id);
            transaction.update(customerRef, {
              totalSpent: increment(totalAmount),
              totalPaid: increment(amountPaidNow),
              totalDebt: increment(totalAmount - amountPaidNow),
              updatedAt: serverTimestamp()
            });
          }

          // 4. Add Sale Record if paid/partially paid (WRITE)
          if (amountPaidNow > 0) {
            const saleRef = doc(collection(db, 'sales'));
            transaction.set(saleRef, cleanObject({
              invoiceId: invoiceRef.id,
              invoiceNumber: invoiceNumber,
              items: cart.map(i => ({ productId: i.id, name: i.name, quantity: i.quantity, price: i.price, total: i.total })),
              totalAmount: amountPaidNow,
              paymentMethod,
              customerName,
              userId: invoiceData.userId,
              userName: invoiceData.userName,
              status: 'completed',
              source: 'invoice',
              createdAt: serverTimestamp()
            }));

            // 5. Update Cash Session (Daily Closing) (WRITE)
            if (activeSession) {
              const sessionRef = doc(db, 'daily_closings', activeSession.id);
              const isCash = paymentMethod === 'cash';
              transaction.update(sessionRef, {
                cashSales: increment(isCash ? amountPaidNow : 0),
                transferSales: increment(!isCash ? amountPaidNow : 0),
                totalSales: increment(amountPaidNow),
                salesCount: increment(1),
                netCash: increment(isCash ? amountPaidNow : 0),
                updatedAt: serverTimestamp()
              });
            }
          }
        }
      });

      showToast(status === 'draft' ? "Brouillon enregistré" : "Facture validée avec succès", "success");
      
      if (status !== 'draft') {
        await notificationService.createNotification({
          type: 'invoice',
          title: editingInvoiceId ? 'Facture Mise à Jour' : 'Nouvelle Facture Validée',
          message: `Facture ${finalInvoiceNumber} d'un montant de ${formatCurrency(totalAmount)} pour ${customerName}.`,
          priority: 'medium',
          triggeredBy: user?.uid,
          triggeredByName: userData?.displayName || user?.displayName || 'Admin',
          metadata: {
            link: `/invoices`,
            entityId: editingInvoiceId || 'new', // We don't have the new ID easily here, but that's fine for now
            entityType: 'invoice',
            invoiceNumber: finalInvoiceNumber,
            totalAmount
          }
        });
      }

      if (status !== 'draft') {
          const fullInvoiceData = { 
            invoiceNumber: finalInvoiceNumber,
            items: cart,
            subtotal,
            taxAmount,
            taxRate,
            discount,
            totalAmount,
            receivedAmount: amountPaidNow,
            balance: totalAmount - amountPaidNow,
            customerName: selectedCustomer?.name || customClientInfo.name || 'Client de passage',
            customerPhone: selectedCustomer?.phone || customClientInfo.phone,
            customerAddress: selectedCustomer?.address || customClientInfo.address,
            customerEmail: selectedCustomer?.email || customClientInfo.email,
            customerNIF: customClientInfo.nif,
            customerRC: customClientInfo.rc,
            customerAI: customClientInfo.ai,
            date: new Date(),
            dueDate: dueDate ? new Date(dueDate) : undefined,
            paymentMethod,
            userName: userData?.displayName || user?.displayName || 'Admin',
            notes,
            customCompanyInfo: customInfoOverride
          };
          pdfService.generateInvoice(fullInvoiceData as any);
        }
      
      setIsModalOpen(false);
      resetForm();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Erreur lors de l'enregistrement", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPayment = async () => {
    if (!selectedInvoice || paymentRecordAmount <= 0) return;
    setIsAddingPayment(true);
    try {
      await runTransaction(db, async (transaction) => {
        const invRef = doc(db, 'invoices', selectedInvoice.id);
        const invSnap = await transaction.get(invRef);
        if (!invSnap.exists()) throw new Error("Facture introuvable");
        const invData = invSnap.data() as Invoice;

        const newAmountPaid = (invData.amountPaid || 0) + paymentRecordAmount;
        const newBalance = invData.totalAmount - newAmountPaid;
        const newPaymentStatus = newAmountPaid >= invData.totalAmount ? 'paid' : 'partially_paid';
        const newStatus = newAmountPaid >= invData.totalAmount ? 'paid' : 'pending';

        const payment: PaymentRecord = {
          amount: paymentRecordAmount,
          date: new Date(),
          method: paymentRecordMethod,
          userId: user?.uid || '',
          userName: userData?.displayName || 'Vendeur'
        };

        const updatedHistory = [...(invData.paymentHistory || []), payment];

        transaction.update(invRef, {
          amountPaid: newAmountPaid,
          balance: newBalance,
          paymentStatus: newPaymentStatus,
          status: newStatus,
          paymentHistory: updatedHistory,
          updatedAt: serverTimestamp()
        });

        // Update Customer
        if (invData.customerId) {
          const custRef = doc(db, 'customers', invData.customerId);
          transaction.update(custRef, {
            totalPaid: increment(paymentRecordAmount),
            totalDebt: increment(-paymentRecordAmount),
            updatedAt: serverTimestamp()
          });
        }

        // Add Sale Record for this payment
        const saleRef = doc(collection(db, 'sales'));
        transaction.set(saleRef, cleanObject({
          invoiceId: selectedInvoice.id,
          invoiceNumber: invData.invoiceNumber,
          items: invData.items.map(i => ({ productId: i.id, name: i.name, quantity: i.quantity, price: i.price, total: i.total })),
          totalAmount: paymentRecordAmount,
          paymentMethod: paymentRecordMethod,
          customerName: invData.customerName,
          userId: user?.uid || '',
          userName: userData?.displayName || 'Vendeur',
          status: 'completed',
          source: 'invoice',
          createdAt: serverTimestamp(),
          note: `Paiement pour facture ${invData.invoiceNumber}`
        }));

        // Update Cash Session
        if (activeSession) {
          const sessionRef = doc(db, 'daily_closings', activeSession.id);
          const isCash = paymentRecordMethod === 'cash';
          transaction.update(sessionRef, {
             cashSales: increment(isCash ? paymentRecordAmount : 0),
             transferSales: increment(!isCash ? paymentRecordAmount : 0),
             totalSales: increment(paymentRecordAmount),
             netCash: increment(isCash ? paymentRecordAmount : 0),
             updatedAt: serverTimestamp()
          });
        }
      });

      showToast("Paiement enregistré", "success");
      setPaymentRecordAmount(0);
      setIsViewModalOpen(false);
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Erreur lors du paiement", "error");
    } finally {
      setIsAddingPayment(false);
    }
  };

  const handlePrint = (invoice: Invoice) => {
    pdfService.generateInvoice({
      invoiceNumber: invoice.invoiceNumber,
      date: (invoice.createdAt as any)?.toDate ? (invoice.createdAt as any).toDate() : (invoice.createdAt instanceof Date ? invoice.createdAt : new Date()),
      dueDate: invoice.dueDate ? ((invoice.dueDate as any)?.toDate ? (invoice.dueDate as any).toDate() : new Date(invoice.dueDate as any)) : undefined,
      customerName: invoice.customerName || 'Client',
      customerPhone: invoice.customerPhone,
      customerAddress: invoice.customerAddress,
      customerEmail: invoice.customerEmail,
      customerNIF: invoice.customerNIF,
      customerRC: invoice.customerRC,
      customerAI: invoice.customerAI,
      items: invoice.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, total: i.total })),
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      taxRate: invoice.taxRate,
      discount: invoice.discount,
      totalAmount: invoice.totalAmount,
      receivedAmount: invoice.amountPaid || invoice.receivedAmount,
      change: invoice.change,
      paymentMethod: invoice.paymentMethod || 'cash',
      userName: invoice.userName || 'Admin',
      notes: invoice.notes,
      customCompanyInfo: invoice.customCompanyInfo
    });
  };

  const handleDelete = async () => {
    if (!selectedInvoice) return;
    try {
      await dbService.deleteDocument('invoices', selectedInvoice.id);
      showToast("Facture supprimée", "success");
      setIsDeleteModalOpen(false);
    } catch (err) {
      showToast("Erreur lors de la suppression", "error");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto bg-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <FileText className="text-blue-600" size={32} /> Facturation
          </h1>
          <p className="text-slate-500 font-medium mt-1">Gérez vos factures et encaissements en temps réel.</p>
        </div>
        <Button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 uppercase font-black tracking-widest px-8"
        >
          <Plus size={18} className="mr-2" /> Créer Facture
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par numéro ou client..."
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 transition-all font-bold"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {invoicesLoading ? (
          Array(6).fill(0).map((_, i) => <div key={i} className="h-40 bg-slate-50 animate-pulse rounded-2xl" />)
        ) : (filteredInvoices || []).length === 0 ? (
          <div className="col-span-full py-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
             <FilePlus size={48} className="mx-auto text-slate-300 mb-3" />
             <p className="text-slate-500 font-bold">Aucune facture enregistrée.</p>
          </div>
        ) : (filteredInvoices || []).map((invoice) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={invoice.id}
            onClick={() => { setSelectedInvoice(invoice); setIsViewModalOpen(true); }}
            className="bg-white border border-slate-200 p-6 rounded-2xl hover:border-blue-500 hover:shadow-xl transition-all cursor-pointer group"
          >
            <div className="flex justify-between items-start mb-4">
              <span className={cn(
                "px-3 py-1 text-[10px] font-black uppercase rounded-full",
                invoice.status === 'paid' ? "bg-emerald-50 text-emerald-600" : 
                invoice.status === 'draft' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
              )}>
                {invoice.status === 'draft' ? 'Brouillon' : invoice.status === 'paid' ? 'Payée' : invoice.status}
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {invoice.createdAt ? format(new Date((invoice.createdAt as any).toDate()), 'dd/MM/yyyy') : '-'}
              </span>
            </div>
            
            <h3 className="font-black text-lg text-slate-800">{invoice.invoiceNumber}</h3>
            <p className="text-sm text-slate-500 font-bold mb-4">{invoice.customerName || 'Client anonyme'}</p>
            
            <div className="flex items-end justify-between border-t border-slate-50 pt-4">
              <div>
                <p className="text-[10px] uppercase font-black text-slate-400">Total</p>
                <p className="text-xl font-black text-blue-600 tracking-tighter">{formatCurrency(invoice.totalAmount)}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); handlePrint(invoice); }}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-blue-600 transition-colors"
                >
                  <Printer size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Creation Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isPreview ? "Aperçu de la Facture" : "Nouvelle Facture"} size={isPreview ? "lg" : "2xl"}>
        {isPreview ? (
          <div className="p-8 space-y-6">
             <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
               <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Client</h3>
               <p className="text-xl font-black text-slate-900">{selectedCustomer?.name || customClientInfo.name || 'Client de passage'}</p>
               { (customClientInfo.phone || customClientInfo.address) && (
                 <div className="mt-2 text-xs text-slate-500 font-bold space-y-1">
                   {customClientInfo.phone && <p>Tél: {customClientInfo.phone}</p>}
                   {customClientInfo.address && <p>{customClientInfo.address}</p>}
                 </div>
               )}
             </div>

             <div className="space-y-3">
               <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Articles ({cart.length})</h3>
               <div className="border border-slate-100 rounded-xl overflow-hidden">
                 {cart.map((item, idx) => (
                   <div key={idx} className="p-3 border-b border-slate-50 flex justify-between bg-white last:border-0">
                     <div>
                       <p className="text-xs font-black uppercase">{item.name}</p>
                       <p className="text-[10px] text-slate-400 font-bold">{item.quantity} x {formatCurrency(item.price)}</p>
                     </div>
                     <p className="text-sm font-black text-slate-900">{formatCurrency(item.total)}</p>
                   </div>
                 ))}
               </div>
             </div>

             <div className="flex flex-col items-end gap-2 pt-4 border-t border-slate-100">
                <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-slate-400">
                  <span>SOUS-TOTAL</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-rose-500">
                    <span>REMISE</span>
                    <span>-{formatCurrency(discount)}</span>
                  </div>
                )}
                {settings.useTax && (
                  <div className="flex justify-between w-full max-w-[200px] text-xs font-bold text-slate-400">
                    <span>TVA ({taxRate * 100}%)</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between w-full max-w-[250px] pt-4 mt-2 border-t border-slate-200">
                  <span className="text-sm font-black text-slate-800">TOTAL</span>
                  <span className="text-3xl font-black text-blue-600 tracking-tighter">{formatCurrency(totalAmount)}</span>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <Button variant="outline" onClick={() => setIsPreview(false)} className="h-14 font-black uppercase tracking-widest col-span-2">
                  Modifier la Facture
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    handlePrint({
                        invoiceNumber: "PROFORMA",
                        items: cart,
                        subtotal,
                        taxAmount,
                        taxRate,
                        discount,
                        totalAmount,
                        customerName: selectedCustomer?.name || customClientInfo.name || 'Client de passage',
                        customerPhone: selectedCustomer?.phone || customClientInfo.phone,
                        customerAddress: selectedCustomer?.address || customClientInfo.address,
                        customerEmail: selectedCustomer?.email || customClientInfo.email,
                        customerNIF: customClientInfo.nif,
                        customerRC: customClientInfo.rc,
                        customerAI: customClientInfo.ai,
                        userName: userData?.displayName || user?.displayName || 'Admin',
                        notes: notes + " (PROFORMA)",
                        createdAt: new Date()
                    } as any);
                  }} 
                  className="h-14 border-slate-200 text-slate-600 uppercase font-black tracking-widest text-xs"
                >
                  <Printer size={16} className="mr-2" /> Imprimer Proforma
                </Button>
                <Button onClick={() => handleSaveInvoice('paid')} isLoading={isSaving} className="h-14 bg-emerald-600 hover:bg-emerald-700 uppercase font-black tracking-widest text-lg shadow-xl shadow-emerald-50 text-white">
                  <CheckCircle2 size={18} className="mr-2" /> Valider & Encaisser
                </Button>
             </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:h-[80vh] h-auto bg-white overflow-y-auto lg:overflow-hidden">
            <div className="lg:col-span-7 flex flex-col lg:overflow-hidden p-4 lg:p-6 overflow-visible h-auto lg:h-full border-b lg:border-b-0">
              <div className="mb-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Rechercher un produit..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={handleAddManualItem} className="w-full border-dashed rounded-xl py-6 border-slate-300">
                  <Plus size={16} className="mr-2" /> Article Personnalisé
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 gap-3 grid grid-cols-1 sm:grid-cols-2 pb-4 content-start">
                {products
                  .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .slice(0, 15)
                  .map(p => (
                    <div key={p.id} onClick={() => handleAddItem(p)} className="p-4 border border-slate-200 rounded-xl hover:border-blue-500 cursor-pointer transition-colors bg-white shadow-sm flex flex-col justify-between">
                      <div>
                         <p className="text-sm font-black uppercase text-slate-800 line-clamp-1">{p.name}</p>
                         <p className="text-[10px] text-slate-400 font-bold">{p.sku}</p>
                      </div>
                      <div className="flex justify-between items-center mt-3">
                        <span className="text-sm font-black text-blue-600">{formatCurrency(p.sellingPrice)}</span>
                        <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full", p.stockQuantity > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                          {Math.floor(p.stockQuantity)} en stock
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col bg-slate-50 border-l border-slate-200 lg:overflow-hidden h-full">
               {/* Scrollable Content Area */}
               <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 scrollbar-hide min-h-[400px]">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Client</label>
                      <select 
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold shadow-sm text-sm"
                        onChange={(e) => {
                          const cx = customers.find(c => c.id === e.target.value);
                          setSelectedCustomer(cx || null);
                          if (cx) {
                            setCustomClientInfo({
                              name: cx.name,
                              phone: cx.phone || '',
                              address: cx.address || '',
                              email: cx.email || '',
                              nif: cx.nif || '',
                              rc: cx.rc || '',
                              ai: cx.ai || ''
                            });
                          }
                        }}
                      >
                        <option value="">Client de passage</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <AnimatePresence>
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="space-y-2 overflow-hidden"
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
                         <div>
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest pl-1">Mon En-tête (Coordonnées)</label>
                            <textarea 
                              placeholder="Modifier vos coordonnées pour cette facture..." 
                              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold shadow-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[60px]"
                              value={customInfoOverride}
                              onChange={(e) => setCustomInfoOverride(e.target.value)}
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

                    <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                      <div className="space-y-1">
                         <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Date d'échéance</label>
                         <input 
                           type="date"
                           className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold shadow-sm text-xs"
                           value={dueDate}
                           onChange={(e) => setDueDate(e.target.value)}
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Mode Paiement</label>
                         <div className="grid grid-cols-3 gap-1">
                            <button 
                              onClick={() => setPaymentMethod('cash')}
                              className={cn("p-1.5 rounded-lg border flex flex-col items-center justify-center transition-all", paymentMethod === 'cash' ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-600 border-slate-200")}
                              title="Espèces"
                            >
                              <CreditCard size={12} />
                            </button>
                            <button 
                              onClick={() => setPaymentMethod('card')}
                              className={cn("p-1.5 rounded-lg border flex flex-col items-center justify-center transition-all", paymentMethod === 'card' ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-600 border-slate-200")}
                              title="Carte"
                            >
                              <CreditCard size={12} />
                            </button>
                            <button 
                              onClick={() => setPaymentMethod('transfer')}
                              className={cn("p-1.5 rounded-lg border flex flex-col items-center justify-center transition-all", paymentMethod === 'transfer' ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-600 border-slate-200")}
                              title="Virement"
                            >
                              <CreditCard size={12} />
                            </button>
                         </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest block">Articles dans la facture</label>
                    {cart.map(item => (
                      <div key={item.id} className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-sm">
                        <div className="min-w-0 flex-1">
                           <p className="text-xs font-black uppercase truncate text-slate-800">{item.name}</p>
                           <p className="text-[10px] text-slate-400 font-bold">{item.quantity} x {formatCurrency(item.price)}</p>
                        </div>
                        <div className="flex items-center gap-4">
                           <span className="text-sm font-black text-slate-900">{formatCurrency(item.total)}</span>
                           <button onClick={() => handleRemoveItem(item.id)} className="text-rose-400 hover:text-rose-600">
                             <X size={16} />
                           </button>
                        </div>
                      </div>
                    ))}
                    {cart.length === 0 && (
                      <p className="text-[10px] text-center text-slate-400 italic py-4">Aucun article sélectionné</p>
                    )}
                  </div>
               </div>

               {/* Static Footer Area */}
               <div className="bg-white p-4 lg:p-6 border-t border-slate-200 shadow-2xl space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <span>Sous-total</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <span>Remise</span>
                       <div className="relative">
                          <input 
                            type="number"
                            className="w-20 p-1 text-right border-b border-slate-200 font-black text-slate-800 outline-none focus:border-blue-500 text-xs"
                            value={discount || ''}
                            onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                          />
                          <span className="absolute left-0 bottom-1 text-[7px]">DA</span>
                       </div>
                    </div>
                    {settings.useTax && (
                       <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <span>TVA ({taxRate * 100}%)</span>
                        <span>{formatCurrency(taxAmount)}</span>
                      </div>
                    )}
                    
                    <div className="pt-2 border-t border-slate-100 space-y-1">
                       <div className="flex justify-between items-center leading-none">
                          <span className="text-[10px] font-black uppercase text-slate-800">Total Facture</span>
                          <span className="text-2xl font-black text-blue-600 tracking-tighter">{formatCurrency(totalAmount)}</span>
                       </div>
                       <div className="flex justify-between items-center leading-none">
                          <span className="text-[10px] font-black uppercase text-rose-500">Reste à payer</span>
                          <span className="text-lg font-black text-rose-500 tracking-tighter">{formatCurrency(balance)}</span>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-center">
                       <span className="text-[9px] font-black uppercase text-slate-400">Versé (Maintenant)</span>
                       <div className="flex gap-2">
                          <button onClick={() => setAmountPaidNow(totalAmount)} className="text-[8px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-bold uppercase hover:bg-blue-50 hover:text-blue-600">Tout payé</button>
                          <button onClick={() => setAmountPaidNow(0)} className="text-[8px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-bold uppercase hover:bg-rose-50 hover:text-rose-600">0 DA</button>
                       </div>
                    </div>
                    <input 
                      type="number"
                      className="w-full text-center py-2 bg-white border-b-2 border-emerald-500 rounded-none text-2xl font-black text-emerald-600 outline-none"
                      value={amountPaidNow || ''}
                      onChange={(e) => setAmountPaidNow(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button 
                      onClick={() => handleSaveInvoice('draft')} 
                      isLoading={isSaving} 
                      variant="outline"
                      className="flex-1 h-12 border-slate-200 text-slate-600 uppercase font-black tracking-widest text-[10px]"
                    >
                      Brouillon
                    </Button>
                    <Button 
                      onClick={() => {
                          if (cart.length > 0) setIsPreview(true);
                          else showToast("La facture est vide", "error");
                      }} 
                      className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 uppercase font-black tracking-widest text-sm shadow-xl shadow-blue-50 text-white"
                    >
                      Aperçu & Valider
                    </Button>
                  </div>
               </div>
            </div>
          </div>
        )}
      </Modal>

      {/* View Modal */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Détails de la Facture" size="lg">
        {selectedInvoice && (
          <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-6">
               <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Facture N°</p>
                  <p className="text-2xl font-black text-slate-900">{selectedInvoice.invoiceNumber}</p>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Date</p>
                  <p className="text-sm font-bold text-slate-600">
                    {selectedInvoice.createdAt ? format(new Date((selectedInvoice.createdAt as any).toDate ? (selectedInvoice.createdAt as any).toDate() : selectedInvoice.createdAt), 'dd/MM/yyyy HH:mm') : '-'}
                  </p>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
               <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Client / Partenaire</p>
                  <p className="text-lg font-black text-slate-800 uppercase">{selectedInvoice.customerName}</p>
                  <div className="mt-2 space-y-1">
                     {selectedInvoice.customerPhone && <p className="text-xs font-bold text-slate-500">Tél: {selectedInvoice.customerPhone}</p>}
                     {selectedInvoice.customerAddress && <p className="text-[10px] font-medium text-slate-500 leading-tight">{selectedInvoice.customerAddress}</p>}
                     
                     <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-200">
                        {selectedInvoice.customerNIF && <p className="text-[9px] font-mono text-slate-400"><span className="font-bold">NIF:</span> {selectedInvoice.customerNIF}</p>}
                        {selectedInvoice.customerRC && <p className="text-[9px] font-mono text-slate-400"><span className="font-bold">RC:</span> {selectedInvoice.customerRC}</p>}
                        {selectedInvoice.customerAI && <p className="text-[9px] font-mono text-slate-400"><span className="font-bold">AI:</span> {selectedInvoice.customerAI}</p>}
                     </div>
                  </div>
               </div>
               <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Règlement</p>
                  <p className="text-lg font-black text-slate-800 uppercase">{selectedInvoice.paymentMethod}</p>
                  <div className={cn(
                    "mt-2 p-2 rounded-lg inline-block text-[10px] font-black uppercase tracking-widest",
                    selectedInvoice.paymentStatus === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    {selectedInvoice.paymentStatus === 'paid' ? 'Facture Acquittée' : `Reste: ${formatCurrency(selectedInvoice.balance || 0)}`}
                  </div>
                </div>
            </div>

            {/* Payment History & Add Payment Section */}
            {selectedInvoice.status !== 'draft' && (
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                 <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Historique des paiements</h4>
                 <div className="space-y-2">
                    {selectedInvoice.paymentHistory && selectedInvoice.paymentHistory.map((p, i) => (
                      <div key={i} className="flex justify-between items-center text-xs p-2 bg-white rounded-lg border border-slate-100">
                        <span className="text-slate-500 font-medium">#{i+1} - {p.date ? format(new Date((p.date as any).toDate ? (p.date as any).toDate() : p.date), 'dd/MM/yyyy') : '-'}</span>
                        <span className="font-bold text-slate-700">{p.method}</span>
                        <span className="font-black text-blue-600">{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                    {(!selectedInvoice.paymentHistory || selectedInvoice.paymentHistory.length === 0) && (
                      <p className="text-xs text-slate-400 italic">Aucun versement enregistré</p>
                    )}
                 </div>

                 {selectedInvoice.paymentStatus !== 'paid' && (
                   <div className="pt-4 mt-4 border-t border-slate-200">
                      <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Ajouter un versement</p>
                      <div className="flex gap-2">
                         <input 
                           type="number"
                           className="flex-1 p-3 bg-white border border-slate-200 rounded-xl text-lg font-black text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500"
                           placeholder="Montant du versement"
                           value={paymentRecordAmount || ''}
                           onChange={(e) => setPaymentRecordAmount(parseFloat(e.target.value) || 0)}
                         />
                         <select 
                           value={paymentRecordMethod}
                           onChange={(e) => setPaymentRecordMethod(e.target.value as any)}
                           className="p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs"
                         >
                            <option value="cash">ESPECES</option>
                            <option value="card">CARTE</option>
                            <option value="transfer">VIREMENT</option>
                         </select>
                         <Button 
                           onClick={handleAddPayment} 
                           isLoading={isAddingPayment}
                           className="bg-blue-600 h-12 uppercase font-black text-[10px]"
                         >
                           Verser
                         </Button>
                      </div>
                   </div>
                 )}
              </div>
            )}

            <table className="w-full text-sm">
               <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <th className="text-left pb-4">Article</th>
                    <th className="text-center pb-4">Quantité</th>
                    <th className="text-right pb-4">Total</th>
                  </tr>
               </thead>
               <tbody className="font-bold">
                  {selectedInvoice.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-50">
                       <td className="py-4 text-slate-800 uppercase">{item.name}</td>
                       <td className="py-4 text-center text-slate-500">{item.quantity} {item.unit || 'U'}</td>
                       <td className="py-4 text-right text-slate-900">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
               </tbody>
            </table>

            <div className="flex flex-col items-end gap-3 pt-6">
                <div className="flex justify-between w-full max-w-[250px] text-xs font-black text-slate-400 uppercase tracking-widest">
                   <span>Sous-total</span>
                   <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                </div>
                {selectedInvoice.discount > 0 && (
                  <div className="flex justify-between w-full max-w-[250px] text-xs font-black text-rose-400 uppercase tracking-widest">
                    <span>Remise</span>
                    <span>-{formatCurrency(selectedInvoice.discount)}</span>
                  </div>
                )}
                {selectedInvoice.taxAmount > 0 && (
                  <div className="flex justify-between w-full max-w-[250px] text-xs font-black text-slate-400 uppercase tracking-widest">
                    <span>TVA ({selectedInvoice.taxRate * 100}%)</span>
                    <span>{formatCurrency(selectedInvoice.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between w-full max-w-[300px] pt-6 border-t border-slate-100 items-baseline">
                   <span className="text-xs font-black uppercase text-slate-800">Total Net</span>
                   <span className="text-4xl font-black text-blue-600 tracking-tighter">{formatCurrency(selectedInvoice.totalAmount)}</span>
                </div>
                <div className="flex justify-between w-full max-w-[300px] border-t border-dotted border-slate-200 mt-2 pt-2 items-baseline text-emerald-600">
                   <span className="text-[10px] font-black uppercase tracking-widest">Total Payé</span>
                   <span className="text-2xl font-black">{formatCurrency(selectedInvoice.amountPaid || 0)}</span>
                </div>
                {selectedInvoice.balance > 0 && (
                  <div className="flex justify-between w-full max-w-[300px] mt-1 pt-1 items-baseline text-rose-500">
                    <span className="text-[10px] font-black uppercase tracking-widest">Reste à payer</span>
                    <span className="text-2xl font-black">{formatCurrency(selectedInvoice.balance)}</span>
                  </div>
                )}
            </div>

            <div className="flex gap-4 pt-8">
               {selectedInvoice.status === 'draft' ? (
                 <div className="flex gap-4 w-full">
                   <Button 
                    onClick={() => handlePrint({ ...selectedInvoice, invoiceNumber: selectedInvoice.invoiceNumber + " (BROUILLON)" })} 
                    variant="outline" 
                    className="h-14 bg-white text-slate-600 uppercase font-black tracking-widest border-slate-200"
                   >
                     <Printer size={18} className="mr-2" /> Proforma
                   </Button>
                   <Button 
                     onClick={() => {
                       // Load into creation modal
                       setCart(selectedInvoice.items);
                       setSelectedCustomer(customers.find(c => c.id === selectedInvoice.customerId) || null);
                       setCustomClientInfo({
                         name: selectedInvoice.customerName || '',
                         phone: selectedInvoice.customerPhone || '',
                         address: selectedInvoice.customerAddress || '',
                         email: selectedInvoice.customerEmail || '',
                         nif: selectedInvoice.customerNIF || '',
                         rc: selectedInvoice.customerRC || '',
                         ai: selectedInvoice.customerAI || ''
                       });
                       setNotes(selectedInvoice.notes || '');
                       setDiscount(selectedInvoice.discount);
                       setPaymentMethod(selectedInvoice.paymentMethod || 'cash');
                       setEditingInvoiceId(selectedInvoice.id);
                       setIsViewModalOpen(false);
                       setIsModalOpen(true);
                       setIsPreview(true); // Go straight to preview to finalize
                     }}
                     className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 uppercase font-black tracking-widest text-white shadow-lg shadow-emerald-100"
                   >
                     <CheckCircle2 size={18} className="mr-2" /> Finaliser & Encaisser
                   </Button>
                 </div>
               ) : (
                 <Button onClick={() => handlePrint(selectedInvoice)} className="flex-1 h-14 bg-slate-900 uppercase font-black tracking-widest text-white">
                   <Printer size={18} className="mr-2" /> Imprimer / PDF
                 </Button>
               )}
               
               {userData?.role === 'admin' && (
                 <Button onClick={() => setIsDeleteModalOpen(true)} className="bg-rose-50 text-rose-500 hover:bg-rose-100 border-none shadow-none h-14 w-14 p-0">
                   <Trash2 size={20} />
                 </Button>
               )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer la Facture"
        message="Êtes-vous sûr de vouloir supprimer cette facture ? Cela n'annulera pas les mouvements de stock déjà effectués."
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  );
};

export default Invoices;
