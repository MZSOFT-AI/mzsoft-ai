import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { Project, Customer, Sale, Quote, Invoice, Employee, Product, ProjectPayment } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { 
  HardHat, 
  Plus, 
  Search, 
  MapPin, 
  Calendar, 
  User, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  DollarSign,
  Wrench,
  Database,
  X,
  Boxes,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Activity
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Modal from '../components/ui/Modal';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { toast } from 'react-hot-toast';
import { cn, formatCurrency } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

const Projects: React.FC = () => {
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employeePayments, setEmployeePayments] = useState<ProjectPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTrackingProjectId, setActiveTrackingProjectId] = useState<string | null>(null);
  const [trackingTab, setTrackingTab] = useState<'summary' | 'quotes' | 'invoices' | 'payments'>('summary');
  const [viewMode, setViewMode] = useState<'list' | 'tracking'>('list');
  
  // Custom states for interactive additions in the Modal
  const [clientType, setClientType] = useState<'database' | 'manual'>('database');
  const [clientNameManual, setClientNameManual] = useState('');
  
  // Equipment list builder
  const [projectEquipments, setProjectEquipments] = useState<Array<{ id?: string; name: string; quantity: number; isManual: boolean; unit?: string }>>([]);
  
  // States for adding equipment
  const [equipmentType, setEquipmentType] = useState<'stock' | 'manual' | 'document'>('stock');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [manualEquipmentName, setManualEquipmentName] = useState('');
  const [equipmentQuantity, setEquipmentQuantity] = useState(1);

  // States for adding from document (bon de livraison / vente, devis ou facture)
  const [equipmentDocType, setEquipmentDocType] = useState<'sale' | 'quote' | 'invoice'>('sale');
  const [selectedEquipmentDocId, setSelectedEquipmentDocId] = useState('');

  // States for linking documents
  const [referenceType, setReferenceType] = useState<'none' | 'sale' | 'quote' | 'invoice' | 'manual'>('none');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [manualReferenceNumber, setManualReferenceNumber] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    clientId: '',
    status: 'planning' as Project['status'],
    budget: '',
    description: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: '',
    assignedTo: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubProjects = onSnapshot(q, (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
      setLoading(false);
    });

    getDocs(collection(db, 'customers')).then((snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    }).catch(err => console.error("Error fetching customers: ", err));

    getDocs(collection(db, 'sales')).then((snap) => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    }).catch(err => console.error("Error fetching sales: ", err));

    getDocs(collection(db, 'quotes')).then((snap) => {
      setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Quote)));
    }).catch(err => console.error("Error fetching quotes: ", err));

    getDocs(collection(db, 'invoices')).then((snap) => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    }).catch(err => console.error("Error fetching invoices: ", err));

    getDocs(collection(db, 'employees')).then((snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    }).catch(err => console.error("Error fetching employees: ", err));

    getDocs(collection(db, 'products')).then((snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }).catch(err => console.error("Error fetching products: ", err));

    getDocs(collection(db, 'employeePayments')).then((snap) => {
      setEmployeePayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectPayment)));
    }).catch(err => console.error("Error fetching employeePayments: ", err));

    return () => {
      unsubProjects();
    };
  }, []);

  const handleAddEquipmentItem = (name: string, quantity: number, prodId?: string, unit?: string, isManualItem?: boolean) => {
    const cleanName = name.trim();
    if (!cleanName) return;

    // Check if item already exists by ID or by Name (case insensitive)
    const existingIdx = projectEquipments.findIndex(
      i => (prodId && i.id === prodId) || i.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (existingIdx > -1) {
      const updated = [...projectEquipments];
      updated[existingIdx].quantity += Number(quantity);
      setProjectEquipments(updated);
    } else {
      setProjectEquipments(prev => [
        ...prev,
        {
          id: prodId || undefined,
          name: cleanName,
          quantity: Number(quantity),
          isManual: isManualItem === undefined ? !prodId : isManualItem,
          unit: unit || 'u'
        }
      ]);
    }
  };

  const handleAddEquipment = () => {
    if (equipmentType === 'stock') {
      if (!selectedProductId) {
        toast.error('Veuillez sélectionner un produit du stock');
        return;
      }
      const prod = products.find(p => p.id === selectedProductId);
      if (!prod) return;
      handleAddEquipmentItem(prod.name, equipmentQuantity, prod.id, prod.unit || 'u', false);
    } else {
      if (!manualEquipmentName.trim()) {
        toast.error('Veuillez saisir le nom de l\'équipement');
        return;
      }
      handleAddEquipmentItem(manualEquipmentName, equipmentQuantity, undefined, 'u', true);
      setManualEquipmentName('');
    }
    setEquipmentQuantity(1);
  };

  const handleRemoveEquipment = (index: number) => {
    const updated = [...projectEquipments];
    updated.splice(index, 1);
    setProjectEquipments(updated);
  };

  const handleImportSingleItemFromDoc = (name: string, quantity: number) => {
    const foundProduct = products.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
    handleAddEquipmentItem(
      name, 
      quantity, 
      foundProduct?.id, 
      foundProduct?.unit || 'u', 
      !foundProduct
    );
    toast.success(`Ajouté : ${name}`);
  };

  const handleImportAllItemsFromDoc = (items: Array<{ name: string; quantity: number }>) => {
    if (!items || items.length === 0) {
      toast.error('Aucun article trouvé dans ce document');
      return;
    }
    let count = 0;
    items.forEach(item => {
      const foundProduct = products.find(p => p.name.toLowerCase() === item.name.trim().toLowerCase());
      handleAddEquipmentItem(
        item.name, 
        item.quantity, 
        foundProduct?.id, 
        foundProduct?.unit || 'u', 
        !foundProduct
      );
      count++;
    });
    toast.success(`${count} article(s) importé(s) avec succès`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      let resolvedClientName = '';
      let resolvedClientId = '';
      if (clientType === 'database') {
        resolvedClientId = formData.clientId;
        const client = customers.find(c => c.id === formData.clientId);
        resolvedClientName = client ? client.name : '';
      } else {
        resolvedClientId = '';
        resolvedClientName = clientNameManual.trim();
      }

      let resolvedRefNo = '';
      if (referenceType === 'sale') {
        const found = sales.find(s => s.id === selectedDocId);
        resolvedRefNo = found ? `Vente du ${format(found.createdAt instanceof Date ? found.createdAt : (found.createdAt as any).toDate ? (found.createdAt as any).toDate() : new Date(found.createdAt as any), 'dd/MM/yyyy')}` : '';
      } else if (referenceType === 'quote') {
        const found = quotes.find(q => q.id === selectedDocId);
        resolvedRefNo = found ? `Devis ${found.quoteNumber}` : '';
      } else if (referenceType === 'invoice') {
        const found = invoices.find(i => i.id === selectedDocId);
        resolvedRefNo = found ? `Facture ${found.invoiceNumber}` : '';
      } else if (referenceType === 'manual') {
        resolvedRefNo = manualReferenceNumber.trim();
      }

      const projectData = {
        ...formData,
        clientId: resolvedClientId,
        clientName: resolvedClientName,
        clientType: clientType,
        clientNameManual: clientType === 'manual' ? clientNameManual.trim() : '',
        budget: Number(formData.budget) || 0,
        startDate: formData.startDate ? new Date(formData.startDate) : null,
        endDate: formData.endDate ? new Date(formData.endDate) : null,
        equipments: projectEquipments,
        referenceType: referenceType,
        referenceId: referenceType !== 'none' && referenceType !== 'manual' ? selectedDocId : '',
        referenceNumber: resolvedRefNo,
        updatedAt: serverTimestamp()
      };

      if (selectedProject) {
        await updateDoc(doc(db, 'projects', selectedProject.id!), projectData);
        toast.success('Chantier mis à jour');
      } else {
        await addDoc(collection(db, 'projects'), {
          ...projectData,
          createdAt: serverTimestamp()
        });
        toast.success('Chantier créé');
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      location: '',
      clientId: '',
      status: 'planning',
      budget: '',
      description: '',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: '',
      assignedTo: ''
    });
    setClientType('database');
    setClientNameManual('');
    setProjectEquipments([]);
    setReferenceType('none');
    setSelectedDocId('');
    setManualReferenceNumber('');
    setSelectedProject(null);
    setEquipmentType('stock');
    setSelectedProductId('');
    setManualEquipmentName('');
    setEquipmentQuantity(1);
    setEquipmentDocType('sale');
    setSelectedEquipmentDocId('');
  };

  const handleEdit = (project: Project) => {
    setSelectedProject(project);
    setFormData({
      name: project.name,
      location: project.location || '',
      clientId: project.clientId || '',
      status: project.status,
      budget: project.budget?.toString() || '',
      description: project.description || '',
      //@ts-ignore
      startDate: project.startDate?.toDate ? format(project.startDate.toDate(), 'yyyy-MM-dd') : project.startDate ? format(new Date(project.startDate as any), 'yyyy-MM-dd') : '',
      //@ts-ignore
      endDate: project.endDate?.toDate ? format(project.endDate.toDate(), 'yyyy-MM-dd') : project.endDate ? format(new Date(project.endDate as any), 'yyyy-MM-dd') : '',
      assignedTo: project.assignedTo || ''
    });
    setClientType(project.clientId ? 'database' : project.clientNameManual ? 'manual' : 'database');
    setClientNameManual(project.clientNameManual || '');
    setProjectEquipments(project.equipments || []);
    setReferenceType(project.referenceType || 'none');
    setSelectedDocId(project.referenceId || '');
    setManualReferenceNumber(project.referenceNumber || '');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setProjectToDelete(id);
    setIsModalOpen(false);
  };

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'planning': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'completed': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'suspended': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'cancelled': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusLabel = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'En cours';
      case 'planning': return 'Planification';
      case 'completed': return 'Terminé';
      case 'suspended': return 'Suspendu';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.clientName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProjectComprehensiveStats = (projectId: string) => {
    const projectSales = sales.filter(s => s.projectId === projectId);
    const projectInvoices = invoices.filter(i => i.projectId === projectId && i.status !== 'draft');
    const projectQuotes = quotes.filter(q => q.projectId === projectId);
    const projectPayments = employeePayments.filter(p => p.projectId === projectId);

    // Avoid double counting of sales that are references to invoices
    const directSales = projectSales.filter(s => !s.invoiceId);

    // Filter quotes that are validated or paid ('accepted', 'validated', 'completed', 'paid')
    // and not yet converted to avoid double counting with invoices/sales
    const validatedQuotes = projectQuotes.filter(q => 
      ['accepted', 'validated', 'completed', 'paid'].includes(q.status)
    );

    // Helper to find a product's purchase price
    const findProductPurchasePrice = (itemId: string, itemName: string) => {
      let prod = products.find(p => p.id === itemId);
      if (!prod && itemName) {
        prod = products.find(p => p.name.toLowerCase() === itemName.trim().toLowerCase());
      }
      return prod ? (prod.purchasePrice || 0) : 0;
    };

    let totalSalesHT = 0;
    let totalPurchaseCost = 0;
    let totalEncaisseHT = 0;

    projectInvoices.forEach(i => {
      const invHT = (i.subtotal !== undefined && i.subtotal !== null && i.subtotal > 0) ? (i.subtotal - (i.discount || 0)) : ((i.totalAmount || 0) - (i.taxAmount || 0));
      totalSalesHT += invHT;
      
      const totTTC = i.totalAmount || 1;
      const ratio = invHT / totTTC;
      totalEncaisseHT += (i.amountPaid || 0) * ratio;

      if (i.items) {
        i.items.forEach(item => {
          const pPrice = findProductPurchasePrice(item.id, item.name);
          totalPurchaseCost += (item.quantity || 0) * pPrice;
        });
      }
    });

    directSales.forEach(s => {
      const saleHT = s.items ? s.items.reduce((sum, item) => sum + (item.total || 0), 0) : (s.totalAmount || 0);
      totalSalesHT += saleHT;
      totalEncaisseHT += saleHT; // direct sales are fully paid cash or card instantly

      if (s.items) {
        s.items.forEach(item => {
          const pPrice = findProductPurchasePrice(item.id, item.name);
          totalPurchaseCost += (item.quantity || 0) * pPrice;
        });
      }
    });

    validatedQuotes.forEach(q => {
      const qHT = (q.subtotal !== undefined && q.subtotal !== null && q.subtotal > 0) ? (q.subtotal - (q.discount || 0)) : ((q.totalAmount || 0) - (q.taxAmount || 0));
      totalSalesHT += qHT;
      totalEncaisseHT += qHT; // for project metrics, validated quote counts as pre-invoiced revenue

      if (q.items) {
        q.items.forEach(item => {
          const pPrice = findProductPurchasePrice(item.id, item.name);
          totalPurchaseCost += (item.quantity || 0) * pPrice;
        });
      }
    });

    const totalEmployeePaid = projectPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Marge nette basée sur l'encaissé réel HT (Revenu encaissé HT - Coût d'achat HT - Salaires)
    const exactNetResult = totalEncaisseHT - totalPurchaseCost - totalEmployeePaid;

    // Marge nette théorique basée sur le facturé total HT (Revenu facturé HT - Coût d'achat HT - Salaires)
    const theoreticalNetResult = totalSalesHT - totalPurchaseCost - totalEmployeePaid;

    // Marge Matériels pure HT
    const materialMargin = totalSalesHT - totalPurchaseCost;
    const materialMarginPercentage = totalSalesHT > 0 ? (materialMargin / totalSalesHT) * 100 : 0;

    const totalFacturePlusEmployee = totalSalesHT + totalEmployeePaid;

    // Total quotes metrics (HT as well)
    const totalQuotesGenerated = projectQuotes.reduce((sum, q) => {
      const qHT = (q.subtotal !== undefined && q.subtotal !== null && q.subtotal > 0) ? (q.subtotal - (q.discount || 0)) : ((q.totalAmount || 0) - (q.taxAmount || 0));
      return sum + qHT;
    }, 0);
    const totalQuotesValidated = projectQuotes
      .filter(q => ['accepted', 'converted', 'completed', 'validated'].includes(q.status))
      .reduce((sum, q) => {
        const qHT = (q.subtotal !== undefined && q.subtotal !== null && q.subtotal > 0) ? (q.subtotal - (q.discount || 0)) : ((q.totalAmount || 0) - (q.taxAmount || 0));
        return sum + qHT;
      }, 0);

    return {
      totalFacture: totalSalesHT,
      totalEncaisse: totalEncaisseHT,
      totalPurchaseCost,
      totalEmployeePaid,
      exactNetResult,
      theoreticalNetResult,
      materialMargin,
      materialMarginPercentage,
      totalFacturePlusEmployee,
      totalQuotesGenerated,
      totalQuotesValidated,
      docCount: projectSales.length + projectInvoices.length + projectQuotes.length,
      projectSales,
      projectInvoices,
      projectQuotes,
      projectPayments
    };
  };

  const getProjectStats = (projectId: string) => {
    const stats = getProjectComprehensiveStats(projectId);
    return {
      revenue: stats.totalEncaisse,
      totalFacture: stats.totalFacture,
      docCount: stats.docCount
    };
  };

  // Find selected equipment document and items
  const getSelectedEquipmentDoc = () => {
    if (!selectedEquipmentDocId) return null;
    if (equipmentDocType === 'sale') {
      return sales.find(s => s.id === selectedEquipmentDocId);
    } else if (equipmentDocType === 'quote') {
      return quotes.find(q => q.id === selectedEquipmentDocId);
    } else if (equipmentDocType === 'invoice') {
      return invoices.find(i => i.id === selectedEquipmentDocId);
    }
    return null;
  };

  const selectedEquipmentDoc = getSelectedEquipmentDoc();
  // @ts-ignore
  const selectedEquipmentDocItems = selectedEquipmentDoc ? (selectedEquipmentDoc.items || []) : [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Gestion des Chantiers</h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Suivi des travaux et documents liés</p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <Button onClick={() => { resetForm(); setIsModalOpen(true); }} className="h-11 bg-slate-900">
             <Plus size={18} className="mr-2" /> Nouveau Chantier
           </Button>
        </div>
      </div>

      {/* Navigation premium entre Liste des Chantiers et Suivi Financier */}
      <div className="flex border-2 border-slate-200 bg-white p-1">
        <button
          onClick={() => setViewMode('list')}
          className={cn(
            "flex-1 py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
            viewMode === 'list' 
              ? "bg-slate-900 text-white shadow font-extrabold" 
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )}
        >
          <HardHat size={16} />
          Chantier ({projects.length})
        </button>
        <button
          onClick={() => {
            setViewMode('tracking');
            if (!activeTrackingProjectId && projects.length > 0) {
              setActiveTrackingProjectId(projects[0].id!);
            }
          }}
          className={cn(
            "flex-1 py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
            viewMode === 'tracking' 
              ? "bg-blue-600 text-white shadow font-extrabold" 
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )}
        >
          <Activity size={16} />
          Suivi Chantier
        </button>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input 
                placeholder="Rechercher un chantier, lieu ou client..." 
                className="pl-10 h-11"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="block w-full overflow-x-auto bg-white border border-slate-200 shadow-xs rounded-2xl">
            {filteredProjects.length === 0 ? (
              <div className="bg-white p-16 text-center">
                <HardHat size={48} className="mx-auto text-slate-400 mb-4 animate-bounce" />
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Aucun chantier enregistré dans le système</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase">Cliquez sur "Nouveau Chantier" pour en ajouter un</p>
              </div>
            ) : (
              <table className="mzsoft-table min-w-[1100px] xl:min-w-full">
                <thead>
                  <tr>
                    <th className="min-w-[180px] whitespace-nowrap">Intitulé du Chantier</th>
                    <th className="min-w-[130px] whitespace-nowrap">Localisation</th>
                    <th className="min-w-[130px] whitespace-nowrap">Client Associé</th>
                    <th className="min-w-[100px] whitespace-nowrap">Chef Réf.</th>
                    <th className="min-w-[130px] whitespace-nowrap">Période d'Exécution</th>
                    <th className="min-w-[110px] whitespace-nowrap">Budget Initial</th>
                    <th className="min-w-[105px] text-right whitespace-nowrap">Facturé HT</th>
                    <th className="min-w-[105px] text-right whitespace-nowrap">Encaissé HT</th>
                    <th className="min-w-[90px] whitespace-nowrap">Statut</th>
                    <th className="min-w-[120px] text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map(project => {
                    const stats = getProjectComprehensiveStats(project.id!);
                    const dtStart = project.startDate ? format((project.startDate as any).toDate ? (project.startDate as any).toDate() : new Date(project.startDate as any), 'dd/MM/yyyy') : '-';
                    const dtEnd = project.endDate ? format((project.endDate as any).toDate ? (project.endDate as any).toDate() : new Date(project.endDate as any), 'dd/MM/yyyy') : 'Indéterminé';

                    return (
                      <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                        <td className="whitespace-normal">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-slate-800 uppercase text-xs">{project.name}</span>
                            <span className="text-[9px] text-[#0066FF] font-black tracking-wider uppercase mt-0.5 flex items-center gap-1">
                              {stats.docCount} DOCS {project.description && `• ${project.description}`}
                            </span>
                          </div>
                        </td>
                        <td className="text-xs text-slate-600 font-medium whitespace-nowrap">
                          <span className="flex items-center gap-1 leading-snug">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate max-w-[180px]">{project.location || '-'}</span>
                          </span>
                        </td>
                        <td className="text-xs text-slate-750 font-bold whitespace-nowrap">
                          <span className="truncate max-w-[150px]">{project.clientName || 'De passage'}</span>
                        </td>
                        <td className="text-xs text-slate-600 font-medium whitespace-nowrap">
                          {project.assignedTo || '-'}
                        </td>
                        <td className="text-[10px] font-mono text-slate-500 font-bold whitespace-nowrap">
                          {dtStart} → {dtEnd}
                        </td>
                        <td className="font-extrabold text-[#0066FF] font-mono text-xs whitespace-nowrap">
                          {project.budget ? `${formatCurrency(Number(project.budget))}` : '-'}
                        </td>
                        <td className="text-right font-black text-slate-700 font-mono text-xs whitespace-nowrap">
                          {formatCurrency(stats.totalFacture)}
                        </td>
                        <td className="text-right font-black text-emerald-600 font-mono text-xs whitespace-nowrap">
                          {formatCurrency(stats.totalEncaisse)}
                        </td>
                        <td className="whitespace-nowrap">
                          <span className={cn("px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider rounded border", getStatusColor(project.status))}>
                            {getStatusLabel(project.status)}
                          </span>
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <div className="flex gap-1.5 justify-end">
                            <Button 
                              onClick={() => {
                                setActiveTrackingProjectId(project.id!);
                                setViewMode('tracking');
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-wider h-8 px-2.5 rounded-lg flex items-center gap-1 shadow-xs"
                            >
                              <Activity size={11} />
                              Suivi
                            </Button>
                            <Button 
                              variant="outline" 
                              onClick={() => handleEdit(project)} 
                              className="h-8 w-8 p-0 bg-white border-slate-200 hover:border-slate-300"
                              title="Modifier"
                            >
                              <Edit2 size={11} />
                            </Button>
                            <Button 
                              variant="outline" 
                              onClick={() => handleDelete(project.id!)} 
                              className="h-8 w-8 p-0 bg-white border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-200"
                              title="Supprimer"
                            >
                              <Trash2 size={11} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* Section Suivi de Chantier incorporée en direct */
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white border-2 border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
            <div>
              <h2 className="text-lg font-black text-slate-850 uppercase tracking-tight flex items-center gap-2">
                <Activity size={18} className="text-blue-600" /> Suivi Financier & Matériels de Chantier
              </h2>
              <p className="text-slate-450 text-[10px] font-black uppercase tracking-widest mt-1">Choisissez un chantier pour afficher ses indicateurs financiers en temps réel</p>
            </div>
            <div className="w-full md:w-80">
              <select
                className="w-full h-11 border-2 border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-tight focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
                value={activeTrackingProjectId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveTrackingProjectId(val || null);
                  setTrackingTab('summary');
                }}
              >
                <option value="">-- SÉLECTIONNER UN CHANTIER --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} [{getStatusLabel(p.status)}]</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const trackingProject = projects.find(p => p.id === activeTrackingProjectId);
            if (!trackingProject) {
              return (
                <div className="bg-white border-2 border-dashed border-slate-300 p-16 text-center">
                  <Activity size={48} className="mx-auto text-indigo-500 animate-pulse mb-4" />
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Aucun chantier en cours d'analyse</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase">Veuillez sélectionner un chantier dans la liste déroulante ci-dessus</p>
                </div>
              );
            }
            const trackingStats = getProjectComprehensiveStats(trackingProject.id!);
            return (
              <div className="bg-white border-2 border-slate-200 p-6 space-y-6">
                {/* Status Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 p-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Localisation du Chantier</p>
                    <p className="text-sm font-bold text-slate-800 uppercase flex items-center gap-1 mt-0.5">
                      <MapPin size={14} className="text-slate-400" /> {trackingProject.location || 'Non définie'}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className={cn("px-3 py-1 text-xs font-black uppercase tracking-wider rounded border", getStatusColor(trackingProject.status))}>
                      {getStatusLabel(trackingProject.status)}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-rose-500 hover:bg-rose-50 border-slate-200 font-bold text-xs uppercase px-2 flex items-center gap-1"
                      onClick={() => {
                        handleDelete(trackingProject.id!);
                        setViewMode('list');
                      }}
                    >
                      <Trash2 size={12} /> Supprimer ce Chantier
                    </Button>
                  </div>
                </div>

                {/* Résumé Financier du Chantier */}
                <div className="bg-gradient-to-r from-slate-50 to-indigo-50 border-2 border-indigo-100 p-5 rounded-lg">
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-indigo-100 pb-2">
                    <TrendingUp size={16} className="text-indigo-600" /> Suivi de Rentabilité Commerciale & Financière (TVA Exclue)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    {/* Bilan Facturation HT */}
                    <div className="bg-white p-3.5 border border-indigo-100/50 shadow-sm flex flex-col justify-between rounded">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-extrabold text-xs">Chiffre d'Affaires HT</p>
                        <p className="text-lg font-black text-slate-800 mt-1">{formatCurrency(trackingStats.totalFacture)}</p>
                      </div>
                      <p className="text-[8.5px] text-emerald-600 font-extrabold uppercase mt-2">
                        Encaissé HT : {formatCurrency(trackingStats.totalEncaisse)}
                      </p>
                    </div>

                    {/* Coût d'Achat Matériels HT */}
                    <div className="bg-white p-3.5 border border-indigo-100/50 shadow-sm flex flex-col justify-between rounded">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-extrabold text-xs">Coût Achat Matériels HT</p>
                        <p className="text-lg font-black text-slate-800 mt-1">{formatCurrency(trackingStats.totalPurchaseCost)}</p>
                      </div>
                      <p className="text-[8.5px] text-indigo-650 font-extrabold uppercase mt-2">
                        Marge Matériels : {formatCurrency(trackingStats.materialMargin)} ({trackingStats.materialMarginPercentage.toFixed(1)}%)
                      </p>
                    </div>

                    {/* Main d'œuvre */}
                    <div className="bg-white p-3.5 border border-indigo-100/50 shadow-sm flex flex-col justify-between rounded">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-extrabold text-xs">Main d'œuvre (Salaires)</p>
                        <p className="text-lg font-black text-rose-600 mt-1">-{formatCurrency(trackingStats.totalEmployeePaid)}</p>
                      </div>
                      <p className="text-[8.5px] text-slate-500 font-bold uppercase mt-2 border-t pt-1 border-slate-100">
                        Coût d'œuvre direct
                      </p>
                    </div>

                    {/* Marge Nette de Trésorerie HT */}
                    <div className={cn("p-3.5 border shadow-sm flex flex-col justify-between rounded", trackingStats.exactNetResult >= 0 ? "bg-emerald-50 border-emerald-250" : "bg-rose-50 border-rose-250")}>
                      <div>
                        <p className={cn("text-[9px] font-black uppercase tracking-wider font-extrabold text-xs", trackingStats.exactNetResult >= 0 ? "text-emerald-850" : "text-rose-850")}>Marge Réelle Trésorerie HT</p>
                        <p className={cn("text-lg font-black mt-1", trackingStats.exactNetResult >= 0 ? "text-emerald-700" : "text-rose-700")}>
                          {formatCurrency(trackingStats.exactNetResult)}
                        </p>
                      </div>
                      <span className="text-[8.5px] text-slate-500 font-black uppercase mt-2">
                        {trackingStats.exactNetResult >= 0 ? "✅ Rentable" : "⚠️ CA insuffisant"}
                      </span>
                    </div>
                  </div>

                  {/* Dashboard Analytique : Jauge Radial & Graphique à Barres de Marge Réelle */}
                  <div className="mt-5 pt-5 border-t border-indigo-100/50 grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                    {/* Indicateur de Jauge Circulaire / Performance */}
                    <div className="md:col-span-4 bg-white p-4 rounded-xl border border-indigo-50/80 shadow-sm flex flex-col justify-between items-center text-center h-full min-h-[200px]">
                      <div className="w-full">
                        <span className="text-[10px] font-black uppercase text-indigo-950/40 tracking-widest block mb-0.5">
                          Taux de Marge Réelle
                        </span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Marge Réelle de Trésorerie</p>
                      </div>

                      <div className="relative w-40 h-24 my-3 flex items-center justify-center">
                        <svg width="100%" height="100%" viewBox="0 0 200 110" className="overflow-visible">
                          {/* Track Background Arc: semi-circle radius 75, stroke width 14 */}
                          <path 
                            d="M 25 90 A 75 75 0 0 1 175 90" 
                            fill="none" 
                            stroke="#f1f5f9" 
                            strokeWidth="15" 
                            strokeLinecap="round" 
                          />
                          {/* Progress Stroke Arc */}
                          {trackingStats.totalEncaisse ? (
                            <path 
                              d="M 25 90 A 75 75 0 0 1 175 90" 
                              fill="none" 
                              stroke={trackingStats.exactNetResult >= 0 ? "#10b981" : "#f43f5e"} 
                              strokeWidth="15" 
                              strokeLinecap="round" 
                              strokeDasharray="235.62" 
                              strokeDashoffset={235.62 - (Math.min(100, Math.max(0, Math.abs((trackingStats.exactNetResult / (trackingStats.totalEncaisse || 1)) * 100))) / 100) * 235.62}
                              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
                            />
                          ) : null}
                        </svg>
                        {/* Inner Data Widget */}
                        <div className="absolute inset-x-0 bottom-2.5 text-center flex flex-col items-center">
                          <span className={cn(
                            "text-xl font-extrabold tracking-tight", 
                            trackingStats.exactNetResult >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {trackingStats.totalEncaisse && trackingStats.totalEncaisse > 0 
                              ? `${trackingStats.exactNetResult >= 0 ? "+" : ""}${((trackingStats.exactNetResult / trackingStats.totalEncaisse) * 100).toFixed(1)}%`
                              : "Encaissé requis"}
                          </span>
                          <span className="text-[8px] font-black text-slate-450 uppercase tracking-widest mt-0.5">
                            Rendement / Encaissé
                          </span>
                        </div>
                      </div>

                      <div className="w-full flex justify-between px-3 text-[8.5px] font-black text-slate-400 border-t pt-2 border-slate-50 uppercase tracking-widest">
                        <span>Perte</span>
                        <span>Seuil</span>
                        <span>Bénéfice</span>
                      </div>
                    </div>

                    {/* Graphique à Barres : Modèle de Modélisation du Capital HT */}
                    <div className="md:col-span-8 bg-white p-4 rounded-xl border border-indigo-50/80 shadow-sm flex flex-col justify-between space-y-4">
                      <div>
                        <span className="text-[10px] font-black uppercase text-indigo-950/40 tracking-widest block mb-0.5">
                          Comparatif & Structure de Trésorerie (HT)
                        </span>
                        <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">Répartition des charges et bénéfices face au Chiffre d'Affaires</p>
                      </div>

                      <div className="space-y-3 flex-1 flex flex-col justify-center">
                        {/* Bar 1: CA Facturé global HT qui sert de 100% de base */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-baseline text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-slate-400" /> Chiffre d'Affaires Facturé HT
                            </span>
                            <span className="text-slate-700">{formatCurrency(trackingStats.totalFacture)}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-400 rounded-full w-full" />
                          </div>
                        </div>

                        {/* Bar 2: CA Encaissé Réel HT */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-baseline text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-indigo-500" /> CA Encaissé Réel HT
                            </span>
                            <span className="text-indigo-655 font-extrabold">
                              {formatCurrency(trackingStats.totalEncaisse)} 
                              {trackingStats.totalFacture && trackingStats.totalFacture > 0 
                                ? ` (${((trackingStats.totalEncaisse / trackingStats.totalFacture) * 100).toFixed(0)}%)` 
                                : ''}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                              style={{ width: `${Math.min(100, trackingStats.totalFacture ? (trackingStats.totalEncaisse / trackingStats.totalFacture) * 100 : 0)}%` }}
                            />
                          </div>
                        </div>

                        {/* Bar 3: Coûts Globaux (Matériaux + Employés) */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-baseline text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500" /> Total Dépenses (Achats Matériels + Salaires)
                            </span>
                            <span className="text-amber-655 font-extrabold">
                              {formatCurrency(trackingStats.totalPurchaseCost + trackingStats.totalEmployeePaid)} 
                              {trackingStats.totalFacture && trackingStats.totalFacture > 0 
                                ? ` (${(((trackingStats.totalPurchaseCost + trackingStats.totalEmployeePaid) / trackingStats.totalFacture) * 100).toFixed(0)}%)` 
                                : ''}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-amber-500 rounded-full transition-all duration-1000" 
                              style={{ width: `${Math.min(100, trackingStats.totalFacture ? ((trackingStats.totalPurchaseCost + trackingStats.totalEmployeePaid) / trackingStats.totalFacture) * 100 : 0)}%` }}
                            />
                          </div>
                        </div>

                        {/* Bar 4: Marge Trésorerie Réelle HT */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-baseline text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <span className={cn("w-2 h-2 rounded-full", trackingStats.exactNetResult >= 0 ? "bg-emerald-500" : "bg-rose-500")} /> Marge Réelle Trésorerie HT
                            </span>
                            <span className={cn("font-extrabold", trackingStats.exactNetResult >= 0 ? "text-emerald-700" : "text-rose-700")}>
                              {formatCurrency(trackingStats.exactNetResult)}
                              {trackingStats.totalFacture && trackingStats.totalFacture > 0 
                                ? ` (${((trackingStats.exactNetResult / trackingStats.totalFacture) * 100).toFixed(1)}%)` 
                                : ''}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full rounded-full transition-all duration-1000", trackingStats.exactNetResult >= 0 ? "bg-emerald-500" : "bg-rose-500")} 
                              style={{ width: `${Math.min(100, Math.max(0, trackingStats.totalFacture ? (trackingStats.exactNetResult / trackingStats.totalFacture) * 100 : 0))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TAB SELECTOR */}
                <div className="flex border-b border-slate-200 gap-4 pt-6">
                  <button 
                    type="button" 
                    onClick={() => setTrackingTab('summary')}
                    className={cn("pb-2 px-1 text-[11px] font-black uppercase tracking-wider border-b-2 transition-all", trackingTab === 'summary' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600")}
                  >
                    📊 Bilan Financier
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setTrackingTab('quotes')}
                    className={cn("pb-2 px-1 text-[11px] font-black uppercase tracking-wider border-b-2 transition-all", trackingTab === 'quotes' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600")}
                  >
                    📝 Devis liés ({trackingStats.projectQuotes.length})
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setTrackingTab('invoices')}
                    className={cn("pb-2 px-1 text-[11px] font-black uppercase tracking-wider border-b-2 transition-all", trackingTab === 'invoices' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600")}
                  >
                    🧾 Factures & Bons ({trackingStats.projectInvoices.length + trackingStats.projectSales.length})
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setTrackingTab('payments')}
                    className={cn("pb-2 px-1 text-[11px] font-black uppercase tracking-wider border-b-2 transition-all", trackingTab === 'payments' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600")}
                  >
                    👷 Rémunérations Employés ({trackingStats.projectPayments.length})
                  </button>
                </div>

                {/* TAB CONTENT */}
                
                {/* 1. Summary tab */}
                {trackingTab === 'summary' && (
                  <div className="space-y-4 animate-fade-in pt-4">
                    <div className="bg-slate-50 border border-slate-200 p-4 space-y-4">
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <Database size={14} className="text-blue-500" /> Synthèse Financière du Chantier
                      </h4>
                      
                      {/* Metric 2: Total Factures/Ventes */}
                      <div className="flex justify-between items-center py-2">
                        <div>
                          <p className="text-xs font-bold text-slate-705 uppercase">Chiffre d'Affaires Facturé HT (TVA Exclue)</p>
                          <p className="text-[10px] text-slate-400 uppercase font-medium">Somme des factures, ventes directes et devis validés (hors taxes)</p>
                        </div>
                        <span className="text-sm font-black text-slate-700">{formatCurrency(trackingStats.totalFacture)}</span>
                      </div>

                      {/* Metric 2.5: Revenus Réels Encaissés */}
                      <div className="flex justify-between items-center py-2 border-t border-dashed border-slate-200">
                        <div>
                          <p className="text-xs font-bold text-slate-705 uppercase">Revenus Encaissés HT (TVA Exclue)</p>
                          <p className="text-[10px] text-slate-400 uppercase font-medium">Somme réelle perçue sur les factures client (hors taxes)</p>
                        </div>
                        <span className="text-sm font-black text-emerald-655">{formatCurrency(trackingStats.totalEncaisse)}</span>
                      </div>

                      {/* Metric 2.6: Coûts d'Achat des Matériaux */}
                      <div className="flex justify-between items-center py-2 border-t border-dashed border-slate-200">
                        <div>
                          <p className="text-xs font-bold text-slate-705 uppercase">Coût d'Achat des Matériaux HT</p>
                          <p className="text-[10px] text-slate-400 uppercase font-medium">Quantité unitaire × prix d'achat initial des produits pour ce chantier</p>
                        </div>
                        <span className="text-sm font-black text-slate-600">-{formatCurrency(trackingStats.totalPurchaseCost)}</span>
                      </div>

                      {/* Metric 2.7: Marge brute sur les Equipements */}
                      <div className="flex justify-between items-center py-2 border-t border-dashed border-slate-200">
                        <div>
                          <p className="text-xs font-bold text-slate-705 uppercase">Marge Brute sur Équipements HT</p>
                          <p className="text-[10px] text-slate-400 uppercase font-medium">Gain brut dégagé sur les matériaux (Vente HT - Achat HT)</p>
                        </div>
                        <span className="text-sm font-black text-indigo-700">{formatCurrency(trackingStats.materialMargin)} ({trackingStats.materialMarginPercentage.toFixed(1)}%)</span>
                      </div>

                      {/* Metric 3: Paiements Employés */}
                      <div className="flex justify-between items-center py-2 border-t border-dashed border-slate-200">
                        <div>
                          <p className="text-xs font-bold text-slate-705 uppercase">Paiements Effectués aux Employés</p>
                          <p className="text-[10px] text-slate-400 uppercase font-medium">Total des salaires, acomptes et primes affectés à ce chantier</p>
                        </div>
                        <span className="text-sm font-black text-rose-600">-{formatCurrency(trackingStats.totalEmployeePaid)}</span>
                      </div>

                      {/* Metric 4: Marge Nette Réelle */}
                      <div className="flex justify-between items-center py-2 border-t border-dashed border-slate-200 bg-emerald-50/50 px-2.5">
                        <div>
                          <p className="text-xs font-black text-emerald-800 uppercase">Marge Réelle de Trésorerie HT (Encaissé HT - Achats HT - Salaires)</p>
                          <p className="text-[10px] text-slate-500 font-medium">Marge nette encaissée (Bénéfice encaissé direct du chantier)</p>
                        </div>
                        <span className={cn("text-base font-black px-2", trackingStats.exactNetResult >= 0 ? "text-emerald-700" : "text-rose-700")}>
                          {formatCurrency(trackingStats.exactNetResult)}
                        </span>
                      </div>

                      {/* Metric 5: Marge Nette Prévisionnelle */}
                      <div className="flex justify-between items-center py-2 border-t border-dashed border-slate-200 bg-blue-50/50 px-2.5">
                        <div>
                          <p className="text-xs font-black text-blue-800 uppercase">Marge Projet Prévisionnelle HT (Facturé HT - Achats HT - Salaires)</p>
                          <p className="text-[10px] text-slate-505 font-medium">Bénéfice total estimé une fois le solde du chantier entièrement payé</p>
                        </div>
                        <span className={cn("text-base font-black px-2", trackingStats.theoreticalNetResult >= 0 ? "text-blue-700" : "text-rose-700")}>
                          {formatCurrency(trackingStats.theoreticalNetResult)}
                        </span>
                      </div>

                      {/* Progress indicator */}
                      <div className="pt-2 border-t border-slate-200">
                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 mb-1">
                          <span>Poids des Charges (Achat + Salaires) / Chiffre d'Affaires HT</span>
                          <span>
                            {trackingStats.totalFacture > 0 
                              ? `${(((trackingStats.totalEmployeePaid + trackingStats.totalPurchaseCost) / trackingStats.totalFacture) * 100).toFixed(1)}%` 
                              : '0.0%'}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-2">
                          <div 
                            className={cn("h-full", trackingStats.totalFacture > 0 && ((trackingStats.totalEmployeePaid + trackingStats.totalPurchaseCost) / trackingStats.totalFacture) > 0.7 ? "bg-amber-500" : "bg-blue-600")}
                            style={{ width: `${Math.min(100, trackingStats.totalFacture > 0 ? ((trackingStats.totalEmployeePaid + trackingStats.totalPurchaseCost) / trackingStats.totalFacture) * 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Info block */}
                    <div className="border border-dashed border-blue-200 p-3 bg-blue-50/30 flex items-start gap-2.5">
                      <CheckCircle2 size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h5 className="text-[10px] font-black uppercase text-blue-700">Actualisation Directe Intégrée</h5>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-0.5">
                          Dès qu'un devis/facture/paiement est modifié ou payé, le suivi de ce chantier est recalculé instantanément.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Quotes tab */}
                {trackingTab === 'quotes' && (
                  <div className="space-y-3 pt-4 animate-fade-in">
                    <div className="flex justify-between items-center mb-1 bg-slate-50 p-2.5 border">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Montant total des devis validés</span>
                      <span className="text-xs font-black text-emerald-600">{formatCurrency(trackingStats.totalQuotesValidated)}</span>
                    </div>
                    {trackingStats.projectQuotes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic font-bold text-center py-6">Aucun devis lié à ce chantier.</p>
                    ) : (
                      <div className="border border-slate-200 divide-y divide-slate-100 bg-white animate-fade-in">
                        {trackingStats.projectQuotes.map((q) => {
                          const isValidated = ['accepted', 'converted', 'completed', 'validated'].includes(q.status);
                          return (
                            <div key={q.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-black text-slate-800 uppercase">Devis N° {q.quoteNumber}</span>
                                  <span className={cn(
                                    "text-[8px] font-black px-1.5 py-0.5 uppercase tracking-wide border",
                                    q.status === 'converted' ? "bg-purple-50 text-purple-600 border-purple-200" :
                                    q.status === 'accepted' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                    q.status === 'draft' ? "bg-slate-50 text-slate-500 border-slate-200" :
                                    "bg-blue-50 text-blue-600 border-blue-200"
                                  )}>
                                    {q.status === 'converted' ? 'Converti' : q.status === 'accepted' ? 'Accepté' : q.status === 'draft' ? 'Brouillon' : q.status}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold mt-1">
                                  Client: {q.customerName || 'Inconnu'} • Date: {q.createdAt ? format((q.createdAt as any).toDate ? (q.createdAt as any).toDate() : new Date(q.createdAt as any), 'dd/MM/yyyy') : '-'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-slate-900">{formatCurrency(q.totalAmount)}</p>
                                <span className="text-[8px] font-black uppercase text-slate-400">
                                  {isValidated ? '🟢 Validé & Actualisé' : '⚪ En attente'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Invoices & Sales tab */}
                {trackingTab === 'invoices' && (
                  <div className="space-y-4 pt-4 animate-fade-in">
                    {/* Invoices sub-section */}
                    <div>
                      <h4 className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">Factures liées</h4>
                      {trackingStats.projectInvoices.length === 0 ? (
                        <p className="text-xs text-slate-400 italic font-bold text-center py-3">Aucune facture liée.</p>
                      ) : (
                        <div className="border border-slate-200 divide-y divide-slate-100 bg-white animate-fade-in">
                          {trackingStats.projectInvoices.map((inv) => (
                            <div key={inv.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-black text-slate-800 uppercase">Facture N° {inv.invoiceNumber}</span>
                                  <span className={cn(
                                    "text-[8px] font-black px-1.5 py-0.5 uppercase tracking-wide border",
                                    inv.status === 'paid' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                    inv.status === 'draft' ? "bg-slate-50 text-slate-500 border-slate-200" :
                                    "bg-blue-50 text-blue-600 border-blue-200"
                                  )}>
                                    {inv.status === 'paid' ? 'Payée' : inv.status === 'draft' ? 'Brouillon' : 'En attente'}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold mt-1">
                                  Client: {inv.customerName} • Reçu: {formatCurrency(inv.amountPaid || 0)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-slate-900">{formatCurrency(inv.totalAmount)}</p>
                                <span className="text-[8px] text-rose-500 font-bold tracking-tight">Reste: {formatCurrency(inv.balance)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Direct Sales (Bons POS) sub-section */}
                    <div>
                      <h4 className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">Bons de livraison & Ventes directes (POS)</h4>
                      {trackingStats.projectSales.length === 0 ? (
                        <p className="text-xs text-slate-400 italic font-bold text-center py-3">Aucun bon direct.</p>
                      ) : (
                        <div className="border border-slate-200 divide-y divide-slate-100 bg-white animate-fade-in">
                          {trackingStats.projectSales.map((sale) => (
                            <div key={sale.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                              <div>
                                <span className="text-xs font-black text-slate-800 uppercase">
                                  Bon {sale.invoiceNumber ? `flié à Fac ${sale.invoiceNumber}` : 'Direct POS'}
                                </span>
                                <p className="text-[10px] text-slate-400 font-bold mt-1">
                                  Client: {sale.customerName || 'Passage'} • Date: {sale.createdAt ? format((sale.createdAt as any).toDate ? (sale.createdAt as any).toDate() : new Date(sale.createdAt as any), 'dd/MM/yyyy') : '-'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-emerald-650">{formatCurrency(sale.totalAmount)}</p>
                                <span className="text-[8px] bg-slate-100 text-slate-600 font-black px-1.5 py-0.5 uppercase tracking-wide border border-slate-200">
                                  {sale.paymentMethod}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. Employees Payments tab */}
                {trackingTab === 'payments' && (
                  <div className="space-y-3 pt-4 animate-fade-in">
                    <div className="flex justify-between items-center mb-1 bg-slate-50 p-2.5 border">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Frais de Main d'œuvre</span>
                      <span className="text-xs font-black text-rose-600">Total : {formatCurrency(trackingStats.totalEmployeePaid)}</span>
                    </div>
                    {trackingStats.projectPayments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic font-bold text-center py-6">Aucun paiement d'employé enregistré pour ce chantier.</p>
                    ) : (
                      <div className="border border-slate-200 divide-y divide-slate-100 bg-white animate-fade-in">
                        {trackingStats.projectPayments.map((p) => (
                          <div key={p.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-slate-800 uppercase">{p.employeeName}</span>
                                <span className="text-[8px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 border border-slate-200 uppercase rounded">
                                  {p.type === 'salary' ? 'Salaire' : p.type === 'advance' ? 'Avance' : p.type === 'bonus' ? 'Prime' : p.type}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-bold mt-1">
                                Date: {p.date ? format((p.date as any).toDate ? (p.date as any).toDate() : new Date(p.date as any), 'dd MMM yyyy', { locale: fr }) : '-'} 
                                {p.notes && ` • Obs: ${p.notes}`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-rose-600">-{formatCurrency(p.amount)}</p>
                              <span className="text-[8px] font-black uppercase text-slate-400 leading-none">{p.paymentMethod}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedProject ? 'Modifier le Chantier' : 'Nouveau Chantier'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Nom du Chantier *</label>
              <Input 
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Ex: Villa El Biar, Immeuble Hydra..."
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Assigné à (Équipe, Installateurs, Personnel)</label>
              <Input 
                value={formData.assignedTo}
                onChange={(e) => setFormData({...formData, assignedTo: e.target.value})}
                placeholder="Ex: Équipe Alpha, Mohamed Benchikha..."
              />
              {employees.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="text-[10px] text-slate-400 font-bold self-center mr-1 uppercase">Suggérer:</span>
                  {employees.filter(emp => emp.isActive !== false).map(emp => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        const current = formData.assignedTo ? formData.assignedTo.trim() : '';
                        if (current.includes(emp.name)) return;
                        const updated = current ? `${current}, ${emp.name}` : emp.name;
                        setFormData({...formData, assignedTo: updated});
                      }}
                      className="text-[9px] bg-slate-100 hover:bg-blue-50 hover:text-blue-600 font-bold px-2 py-0.5 border border-slate-200 transition-all uppercase"
                    >
                      + {emp.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-slate-200 p-3 bg-slate-50/50 rounded-none">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Client Associé</label>
              <div className="flex gap-2 mb-3">
                <button 
                  type="button" 
                  onClick={() => setClientType('database')} 
                  className={cn("px-3 py-1 text-[10px] font-black uppercase border", clientType === 'database' ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200")}
                >
                  Sélectionner dans la Base
                </button>
                <button 
                  type="button" 
                  onClick={() => setClientType('manual')} 
                  className={cn("px-3 py-1 text-[10px] font-black uppercase border", clientType === 'manual' ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200")}
                >
                  Saisie Manuelle Directe
                </button>
              </div>
              
              {clientType === 'database' ? (
                <select 
                  className="w-full flex h-11 rounded-none border border-slate-200 bg-white px-3 py-2 text-sm font-bold uppercase tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  value={formData.clientId}
                  onChange={(e) => setFormData({...formData, clientId: e.target.value})}
                >
                  <option value="">Sélectionner un client</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <Input 
                  value={clientNameManual}
                  onChange={(e) => setClientNameManual(e.target.value)}
                  placeholder="Écrire le nom du client manuellement..."
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Lieu / Adresse</label>
                <Input 
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  placeholder="Adresse complète"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Budget Estimé (DA)</label>
                <Input 
                  type="number"
                  value={formData.budget}
                  onChange={(e) => setFormData({...formData, budget: e.target.value})}
                  placeholder="Montant total"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Statut</label>
                <select 
                  className="w-full flex h-11 rounded-none border border-slate-200 bg-white px-3 py-2 text-sm font-bold uppercase tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                >
                  <option value="planning">Planification</option>
                  <option value="active">En cours</option>
                  <option value="suspended">Suspendu</option>
                  <option value="completed">Terminé</option>
                  <option value="cancelled">Annulé</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Date Début</label>
                  <Input 
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Date Fin Estimée</label>
                  <Input 
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Matériel / Equipement builder */}
            <div className="border border-slate-200 p-3 bg-slate-50/50 space-y-3 rounded-none">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">📦 Matériel & Équipements Requis (Besoins)</label>
              
              <div className="flex flex-wrap gap-1.5">
                <button 
                  type="button" 
                  onClick={() => setEquipmentType('stock')} 
                  className={cn("px-2 py-1 text-[10px] font-bold uppercase border transition-colors", equipmentType === 'stock' ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}
                >
                  Depuis mon Stock
                </button>
                <button 
                  type="button" 
                  onClick={() => setEquipmentType('manual')} 
                  className={cn("px-2 py-1 text-[10px] font-bold uppercase border transition-colors", equipmentType === 'manual' ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}
                >
                  Écrire Manuellement
                </button>
                <button 
                  type="button" 
                  onClick={() => setEquipmentType('document')} 
                  className={cn("px-2 py-1 text-[10px] font-bold uppercase border transition-colors", equipmentType === 'document' ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}
                >
                  🔍 Chercher depuis Document
                </button>
              </div>

              {equipmentType === 'document' ? (
                <div className="border border-dashed border-slate-200 p-2.5 bg-white space-y-2">
                  <div className="flex gap-1.5 items-center">
                    <span className="text-[9px] font-black uppercase text-slate-400 mr-1">Type Doc:</span>
                    <button 
                      type="button" 
                      onClick={() => { setEquipmentDocType('sale'); setSelectedEquipmentDocId(''); }} 
                      className={cn("px-2 py-0.5 text-[9px] font-black uppercase border", equipmentDocType === 'sale' ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                    >
                      Bons (Sales)
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setEquipmentDocType('quote'); setSelectedEquipmentDocId(''); }} 
                      className={cn("px-2 py-0.5 text-[9px] font-black uppercase border", equipmentDocType === 'quote' ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                    >
                      Devis
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setEquipmentDocType('invoice'); setSelectedEquipmentDocId(''); }} 
                      className={cn("px-2 py-0.5 text-[9px] font-black uppercase border", equipmentDocType === 'invoice' ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                    >
                      Factures
                    </button>
                  </div>

                  <div>
                    <select 
                      className="w-full text-xs font-bold uppercase h-9 rounded-none border border-slate-200 bg-white px-2 py-1 tracking-tight focus:outline-none"
                      value={selectedEquipmentDocId}
                      onChange={(e) => setSelectedEquipmentDocId(e.target.value)}
                    >
                      <option value="">-- Sélectionner un document --</option>
                      {equipmentDocType === 'sale' && sales.map(s => {
                        const dt = s.createdAt ? format(s.createdAt instanceof Date ? s.createdAt : (s.createdAt as any).toDate ? (s.createdAt as any).toDate() : new Date(s.createdAt as any), 'dd/MM/yyyy') : s.id;
                        return (
                          <option key={s.id} value={s.id}>
                            Bon du {dt} - {formatCurrency(s.totalAmount)} ({s.customerName || 'Client'})
                          </option>
                        );
                      })}
                      {equipmentDocType === 'quote' && quotes.map(q => (
                        <option key={q.id} value={q.id}>
                          Devis N° {q.quoteNumber} - {formatCurrency(q.totalAmount)} ({q.customerName || 'Client'})
                        </option>
                      ))}
                      {equipmentDocType === 'invoice' && invoices.map(i => (
                        <option key={i.id} value={i.id}>
                          Facture N° {i.invoiceNumber} - {formatCurrency(i.totalAmount)} ({i.customerName || 'Client'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedEquipmentDocId && (
                    <div className="p-2 border border-slate-100 bg-slate-50 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-blue-600 uppercase">Articles de ce document :</span>
                        {selectedEquipmentDocItems.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleImportAllItemsFromDoc(selectedEquipmentDocItems)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[9px] px-2 py-0.5 uppercase font-black tracking-wider transition-colors"
                          >
                            📥 Tout Importer ({selectedEquipmentDocItems.length})
                          </button>
                        )}
                      </div>

                      {selectedEquipmentDocItems.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic font-bold">Aucun article trouvé dans ce document.</p>
                      ) : (
                        <div className="max-h-24 overflow-y-auto divide-y divide-slate-200 bg-white border border-slate-100">
                          {selectedEquipmentDocItems.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center p-1.5 text-[10px] font-bold uppercase text-slate-700">
                              <span className="truncate pr-1">{item.name} <span className="text-slate-400 font-normal">(Qté: {item.quantity})</span></span>
                              <button
                                type="button"
                                onClick={() => handleImportSingleItemFromDoc(item.name, item.quantity)}
                                className="bg-slate-900 text-white px-2 py-0.5 text-[8px] font-extrabold tracking-wider uppercase hover:bg-blue-600 transition-colors"
                              >
                                + Ajouter
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-2 items-end">
                  {equipmentType === 'stock' ? (
                    <div className="flex-1">
                      <select 
                        className="w-full flex h-10 rounded-none border border-slate-200 bg-white px-2 py-1 text-xs font-bold uppercase tracking-tight focus:outline-none"
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                      >
                        <option value="">Sélectionner un produit...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.stockQuantity} {p.unit || 'u'})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <Input 
                        className="h-10 text-xs"
                        placeholder="Ex: Escabeau, Câble 2.5mm, Vis..."
                        value={manualEquipmentName}
                        onChange={(e) => setManualEquipmentName(e.target.value)}
                      />
                    </div>
                  )}
                  
                  <div className="w-20">
                    <Input 
                      type="number"
                      min="1"
                      className="h-10 text-xs"
                      value={equipmentQuantity}
                      onChange={(e) => setEquipmentQuantity(Number(e.target.value) || 1)}
                      placeholder="Qté"
                    />
                  </div>

                  <Button type="button" onClick={handleAddEquipment} className="h-10 bg-slate-900 px-3 flex-shrink-0 text-white font-bold text-xs uppercase hover:bg-slate-850">
                    + Ajouter
                  </Button>
                </div>
              )}

              {/* Added equipment list */}
              {projectEquipments.length > 0 && (
                <div className="mt-2 border border-slate-200 bg-white p-2 divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {projectEquipments.map((eq, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1.5 text-xs font-bold text-slate-700 uppercase">
                      <span className="truncate pr-2">
                        {eq.name} {eq.isManual && <span className="text-[7px] bg-slate-100 text-slate-500 px-1 py-0.5 font-normal rounded ml-1 tracking-tight">Manuel</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-xs whitespace-nowrap">x{eq.quantity} {eq.unit || 'u'}</span>
                        <button type="button" onClick={() => handleRemoveEquipment(idx)} className="text-rose-500 hover:text-rose-700 p-1">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document link / Paper reference relation */}
            <div className="border border-slate-200 p-3 bg-slate-50/50 space-y-2 rounded-none">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">📄 Lier à un Document / Papier de Référence (Bon, Devis, Facture)</label>
              <select 
                className="w-full flex h-11 rounded-none border border-slate-200 bg-white px-3 py-2 text-sm font-bold uppercase tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                value={referenceType}
                onChange={(e) => {
                  setReferenceType(e.target.value as any);
                  setSelectedDocId('');
                  setManualReferenceNumber('');
                }}
              >
                <option value="none">Aucun document relié</option>
                <option value="sale">Bon de Vente / POS</option>
                <option value="quote">Devis / Proforma</option>
                <option value="invoice">Facture</option>
                <option value="manual">Saisie Libre du Numéro de Document (Manuel)</option>
              </select>

              {referenceType === 'sale' && (
                <select 
                  className="w-full h-11 rounded-none border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-tight focus:ring-2 focus:ring-blue-600/20"
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                >
                  <option value="">Sélectionner une Vente dans le Système...</option>
                  {sales.map(s => {
                    const dt = s.createdAt ? format(s.createdAt instanceof Date ? s.createdAt : (s.createdAt as any).toDate ? (s.createdAt as any).toDate() : new Date(s.createdAt as any), 'dd/MM/yyyy') : s.id;
                    return (
                      <option key={s.id} value={s.id}>
                        Vente du {dt} - {formatCurrency(s.totalAmount)} ({s.customerName || 'Client Passage'})
                      </option>
                    );
                  })}
                </select>
              )}

              {referenceType === 'quote' && (
                <select 
                  className="w-full h-11 rounded-none border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-tight focus:ring-2 focus:ring-blue-600/20"
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                >
                  <option value="">Sélectionner un Devis dans le Système...</option>
                  {quotes.map(q => (
                    <option key={q.id} value={q.id}>
                      Devis N° {q.quoteNumber} - {formatCurrency(q.totalAmount)} ({q.customerName || 'Client'})
                    </option>
                  ))}
                </select>
              )}

              {referenceType === 'invoice' && (
                <select 
                  className="w-full h-11 rounded-none border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-tight focus:ring-2 focus:ring-blue-600/20"
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                >
                  <option value="">Sélectionner une Facture dans le Système...</option>
                  {invoices.map(i => (
                    <option key={i.id} value={i.id}>
                      Facture N° {i.invoiceNumber} - {formatCurrency(i.totalAmount)} ({i.customerName || 'Client'})
                    </option>
                  ))}
                </select>
              )}

              {referenceType === 'manual' && (
                <Input 
                  value={manualReferenceNumber}
                  onChange={(e) => setManualReferenceNumber(e.target.value)}
                  placeholder="Écrire manuellement le numéro (Ex: Bon N° 4580, Devis #A210...)"
                />
              )}
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Description / Notes</label>
              <textarea 
                className="w-full rounded-none border border-slate-200 px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="pt-4 flex gap-3">
              {selectedProject && (
                <Button 
                  type="button" 
                  variant="outline" 
                  className="text-rose-500 hover:bg-rose-50 border-rose-200 font-bold"
                  onClick={() => {
                    handleDelete(selectedProject.id!);
                    setIsModalOpen(false);
                  }}
                >
                  <Trash2 size={14} className="mr-1.5" /> Supprimer
                </Button>
              )}
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>Annuler</Button>
              <Button type="submit" className="flex-1 bg-blue-600 text-white font-bold hover:bg-blue-700">Enregistrer</Button>
            </div>
        </form>
      </Modal>

      <ConfirmationModal
        isOpen={projectToDelete !== null}
        onClose={() => setProjectToDelete(null)}
        onConfirm={async () => {
          if (!projectToDelete) return;
          try {
            setIsDeleting(true);
            await deleteDoc(doc(db, 'projects', projectToDelete));
            toast.success('Chantier supprimé');
            if (activeTrackingProjectId === projectToDelete) {
              setActiveTrackingProjectId(null);
            }
          } catch (error: any) {
            toast.error('Erreur de suppression: ' + (error.message || 'Permissions insuffisantes'));
          } finally {
            setIsDeleting(false);
            setProjectToDelete(null);
          }
        }}
        title="Confirmation de Suppression"
        message="Voulez-vous vraiment supprimer ce chantier ? Cette action est irréversible."
        confirmText="Supprimer"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default Projects;
