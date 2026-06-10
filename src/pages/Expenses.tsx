import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, serverTimestamp, increment, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { dbService } from '../firebase/db';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Button } from '../components/ui/Button';
import { 
  Plus, Search, Trash2, Edit2, ShieldAlert, DollarSign, Calendar, Eye, 
  FileDown, Paperclip, CheckCircle2, XCircle, AlertCircle, Sparkles,
  ArrowUpDown, Filter, Printer, Download, Building, Users, Briefcase, Car,
  Wrench, Activity, Tag, HelpCircle, Check, X, FileSpreadsheet, ChevronDown, ChevronUp, Image
} from 'lucide-react';
import Modal from '../components/ui/Modal';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { formatCurrency } from '../lib/utils';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNotification } from '../context/NotificationContext';
import { excelService } from '../services/excelService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';

interface Expense {
  id?: string;
  expenseNum?: string; // Number DEP-YYYY-XXXX
  reason: string; // Designation
  category: string; // Custom or standard categories
  categorieId?: string;
  amount: number;
  montant?: number; // DB field symmetry compatibility
  dateDepense: string; // "YYYY-MM-DD"
  createdAt?: any;
  userId: string;
  userName: string;
  actorId?: string;
  
  // Advanced Mandatory Allocation columns 
  chantierId: string; // Project / building site ID
  chantierNom: string;
  employeId: string; // Employee ID
  employeNom: string;
  fournisseurId: string; // Supplier ID
  fournisseurNom: string;
  vehiculeId: string; // Vehicle info (e.g. Plate/Name)
  service: string; // Assigned corporate service / department
  materiel: string; // Material / tool name
  statut: 'payé' | 'en attente' | 'annulé';
  moyenPaiement: string; // Cash, Card, Bank transfer, Check
  justificatif?: string; // base64 image receipt attachment
}

const STATIC_VEHICLES = [
  { id: 'V01', name: 'Fourgon Peugeot Boxer (3120-116)' },
  { id: 'V02', name: 'Camionnette Renault Master (1452-113)' },
  { id: 'V03', name: 'Véhicule de liaison Dacia Duster (9820-116)' },
  { id: 'V04', name: 'Camion benne Mercedes Arocs (0410-113)' },
  { id: 'V05', name: 'Véhicule de fonction Volkswagen Golf (5512-116)' }
];

const STATIC_DEPARTMENTS = [
  { id: 'Exploitation', name: 'Exploitation & Chantiers' },
  { id: 'Technique', name: 'Service Technique' },
  { id: 'Logistique', name: 'Logistique & Transport' },
  { id: 'RH', name: 'Ressources Humaines' },
  { id: 'Finance', name: 'Finances & Comptabilité' },
  { id: 'Direction', name: 'Administration Générale' }
];

const STANDARD_CATEGORIES = [
  'CARBURANT & VEHICULE',
  'ACHAT MATERIELS / OUTILLAGE',
  'SALAIRES & INDEMNITES',
  'LOYERS & CHARGES SOCIAUX',
  'ELECTRICITE & GAZ',
  'INTERNET, TELEPHONIE & CLOUD',
  'MARKETING, REUNIONS & REPRESENTATION',
  'ASSURANCE & TAXES',
  'PRESTATIONS EXTERNES',
  'PROVISION DE CAISSE / PETTY CASH',
  'AUTRE IMPREVU'
];

export default function Expenses() {
  const { showToast } = useNotification();
  const { user, userData, hasPermission, isAdmin, isSuperAdmin } = useAuth();
  const { activeSession } = useSession();

  // Firestore collections loads 
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Layout Sections
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewJustificatif, setPreviewJustificatif] = useState<string | null>(null);
  
  // Dashboard & Visual Analytics Toggle 
  const [showDashboard, setShowDashboard] = useState(true);

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChantier, setFilterChantier] = useState('all');
  const [filterEmploye, setFilterEmploye] = useState('all');
  const [filterFournisseur, setFilterFournisseur] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPaiement, setFilterPaiement] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all'); // all, today, week, month, year, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  
  // Sort Controls
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'reason'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Allocation Forms States 
  const [formReason, setFormReason] = useState('');
  const [formCategory, setFormCategory] = useState('ACHAT MATERIELS / OUTILLAGE');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formMoyen, setFormMoyen] = useState('Espèces');
  const [formStatut, setFormStatut] = useState<'payé' | 'en attente' | 'annulé'>('payé');
  const [formJustificatif, setFormJustificatif] = useState('');
  
  // Dynamic Selector Fields
  const [formChantierId, setFormChantierId] = useState('');
  const [formEmployeId, setFormEmployeId] = useState('');
  const [formFournisseurId, setFormFournisseurId] = useState('');
  const [formVehiculeId, setFormVehiculeId] = useState('');
  const [formService, setFormService] = useState('');
  const [formMateriel, setFormMateriel] = useState('');

  // Primary Allocation constraint selection 
  // Chantier, Employé, Véhicule, Fournisseur, Service, Matériel, Autre
  const [primaryAllocationType, setPrimaryAllocationType] = useState<string>('Chantier');

  const canManage = hasPermission('canManageExpenses') || isAdmin || isSuperAdmin;

  // Fetch collections
  useEffect(() => {
    if (!user) return;
    const currentUid = user.uid;

    const baseQuery = collection(db, 'expenses');
    const q = hasPermission('canViewReports')
      ? query(baseQuery, orderBy('createdAt', 'desc'))
      : query(baseQuery, where('userId', '==', currentUid));

    const unsubExpenses = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
      setLoading(false);
    });

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      setProjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubExpenses();
      unsubProjects();
      unsubEmployees();
      unsubSuppliers();
    };
  }, [user, hasPermission]);

  // Handle unique custom receipt numbers auto generator
  const getNextExpenseNumber = (list: Expense[]) => {
    const year = new Date().getFullYear();
    const count = list.length + 1;
    const padded = String(count).padStart(4, '0');
    return `DEP-${year}-${padded}`;
  };

  // Convert File input to Base64 image
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast("La taille de la pièce jointe dépasse la limite de 2 Mo.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const b64 = uploadEvent.target?.result as string;
      setFormJustificatif(b64);
      showToast("Pièce justificative ajoutée avec succès", "success");
    };
    reader.readAsDataURL(file);
  };

  // Form setup helper
  const openAddModal = () => {
    setEditingExpense(null);
    setFormReason('');
    setFormCategory('ACHAT MATERIELS / OUTILLAGE');
    setFormAmount('');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormMoyen('Espèces');
    setFormStatut('payé');
    setFormJustificatif('');
    setFormChantierId('');
    setFormEmployeId('');
    setFormFournisseurId('');
    setFormVehiculeId('');
    setFormService('');
    setFormMateriel('');
    setPrimaryAllocationType('Chantier');
    setIsModalOpen(true);
  };

  const openEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setFormReason(exp.reason || '');
    setFormCategory(exp.category || 'AUTRE');
    setFormAmount(String(exp.amount || 0));
    setFormDate(exp.dateDepense || format(new Date(), 'yyyy-MM-dd'));
    setFormMoyen(exp.moyenPaiement || 'Espèces');
    setFormStatut(exp.statut || 'payé');
    setFormJustificatif(exp.justificatif || '');
    setFormChantierId(exp.chantierId || '');
    setFormEmployeId(exp.employeId || '');
    setFormFournisseurId(exp.fournisseurId || '');
    setFormVehiculeId(exp.vehiculeId || '');
    setFormService(exp.service || '');
    setFormMateriel(exp.materiel || '');
    
    // Auto detect active allocation mode for editing
    if (exp.chantierId) setPrimaryAllocationType('Chantier');
    else if (exp.employeId) setPrimaryAllocationType('Employé');
    else if (exp.fournisseurId) setPrimaryAllocationType('Fournisseur');
    else if (exp.vehiculeId) setPrimaryAllocationType('Véhicule');
    else if (exp.service) setPrimaryAllocationType('Service');
    else if (exp.materiel) setPrimaryAllocationType('Matériel');
    else setPrimaryAllocationType('Autre');

    setIsModalOpen(true);
  };

  // Submit Handler with Strict validations
  const handleExpenseFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formReason) {
       showToast("Désignation / Motif requis", "error");
       return;
    }
    const amt = Number(formAmount);
    if (!amt || amt <= 0) {
       showToast("Le montant décaissé doit être supérieur à 0 DA", "error");
       return;
    }

    // Allocation constraints mapping & mandatory validations
    let chantierNom = '';
    let employeNom = '';
    let fournisseurNom = '';

    if (primaryAllocationType === 'Chantier') {
      if (!formChantierId) return showToast("Veuillez sélectionner le chantier affecté obligatoirement", "error");
      const matched = projects.find(p => p.id === formChantierId);
      chantierNom = matched?.name || matched?.title || 'Inconnu';
    } else if (primaryAllocationType === 'Employé') {
      if (!formEmployeId) return showToast("Veuillez sélectionner le collaborateur affecté obligatoirement", "error");
      const matched = employees.find(em => em.id === formEmployeId);
      employeNom = matched?.name || 'Inconnu';
    } else if (primaryAllocationType === 'Fournisseur') {
      if (!formFournisseurId) return showToast("Veuillez sélectionner le fournisseur affecté obligatoirement", "error");
      const matched = suppliers.find(s => s.id === formFournisseurId);
      fournisseurNom = matched?.name || 'Inconnu';
    } else if (primaryAllocationType === 'Véhicule') {
      if (!formVehiculeId) return showToast("Veuillez sélectionner ou nommer le véhicule affecté", "error");
    } else if (primaryAllocationType === 'Service') {
      if (!formService) return showToast("Veuillez spécifier le service assigné", "error");
    } else if (primaryAllocationType === 'Matériel') {
      if (!formMateriel) return showToast("Veuillez nommer la pièce de matériel ou outillage concernée", "error");
    }

    try {
      const projectData = projects.find(p => p.id === formChantierId);
      const employeeData = employees.find(em => em.id === formEmployeId);
      const supplierData = suppliers.find(s => s.id === formFournisseurId);

      const dbPayload: Omit<Expense, 'id'> = {
        expenseNum: editingExpense?.expenseNum || getNextExpenseNumber(expenses),
        reason: formReason,
        category: formCategory,
        categorieId: formCategory,
        amount: amt,
        montant: amt,
        dateDepense: formDate,
        userId: activeSession?.userId || user?.uid || 'Admin',
        userName: activeSession?.userName || user?.displayName || 'Admin',
        actorId: user?.uid,
        
        // Target Allocations
        chantierId: formChantierId || '',
        chantierNom: chantierNom || (projectData?.name || projectData?.title || ''),
        employeId: formEmployeId || '',
        employeNom: employeNom || (employeeData?.name || ''),
        fournisseurId: formFournisseurId || '',
        fournisseurNom: fournisseurNom || (supplierData?.name || ''),
        vehiculeId: formVehiculeId || '',
        service: formService || '',
        materiel: formMateriel || '',
        statut: formStatut,
        moyenPaiement: formMoyen,
        justificatif: formJustificatif || ''
      };

      if (editingExpense?.id) {
        // Edit document
        await updateDoc(doc(db, 'expenses', editingExpense.id), dbPayload as any);
        
        // Re-adjust session budgets if active session changed
        if (activeSession) {
          const delta = amt - (editingExpense.amount || 0);
          await dbService.updateDocument('daily_closings', activeSession.id, {
            expenses: increment(delta),
            netCash: increment(-delta),
            updatedAt: serverTimestamp()
          });
        }
        showToast("Dépense modifiée avec succès", "success");
      } else {
        // Create document
        await addDoc(collection(db, 'expenses'), {
          ...dbPayload,
          createdAt: serverTimestamp()
        });

        // Track budget reduction if active session is on
        if (activeSession) {
          await dbService.updateDocument('daily_closings', activeSession.id, {
            expenses: increment(amt),
            netCash: increment(-amt),
            updatedAt: serverTimestamp()
          });
        }
        showToast("Dépense enregistrée et allouée avec succès", "success");
      }

      setIsModalOpen(false);
    } catch (error) {
       console.error(error);
       showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  const handleDelete = async (exp: Expense) => {
    if (!exp.id) return;
    setExpenseToDelete(exp);
  };

  // Multicriteria Frontend Filter Algorithms
  const getFilteredExpenses = () => {
    return expenses.filter(exp => {
      // 1. Text Query matches
      const term = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        exp.reason?.toLowerCase().includes(term) ||
        exp.expenseNum?.toLowerCase().includes(term) ||
        exp.category?.toLowerCase().includes(term) ||
        exp.chantierNom?.toLowerCase().includes(term) ||
        exp.employeNom?.toLowerCase().includes(term) ||
        exp.fournisseurNom?.toLowerCase().includes(term) ||
        exp.moyenPaiement?.toLowerCase().includes(term) ||
        exp.vehiculeId?.toLowerCase().includes(term) ||
        exp.service?.toLowerCase().includes(term) ||
        exp.materiel?.toLowerCase().includes(term);

      // 2. Select columns matches
      const matchesChantier = filterChantier === 'all' || exp.chantierId === filterChantier;
      const matchesEmploye = filterEmploye === 'all' || exp.employeId === filterEmploye;
      const matchesFournisseur = filterFournisseur === 'all' || exp.fournisseurId === filterFournisseur;
      const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || exp.statut === filterStatus;
      const matchesPaiement = filterPaiement === 'all' || exp.moyenPaiement === filterPaiement;

      // 3. Amount boundaries
      const expenseAmt = exp.amount || 0;
      const minVal = minAmount ? Number(minAmount) : 0;
      const maxVal = maxAmount ? Number(maxAmount) : Infinity;
      const matchesAmount = expenseAmt >= minVal && expenseAmt <= maxVal;

      // 4. Period filters
      let matchesPeriod = true;
      if (filterPeriod !== 'all') {
        const today = new Date();
        const expDate = exp.dateDepense ? parseISO(exp.dateDepense) : new Date();

        if (filterPeriod === 'today') {
          matchesPeriod = isWithinInterval(expDate, { start: startOfDay(today), end: endOfDay(today) });
        } else if (filterPeriod === 'week') {
          matchesPeriod = isWithinInterval(expDate, { start: startOfWeek(today), end: endOfWeek(today) });
        } else if (filterPeriod === 'month') {
          matchesPeriod = isWithinInterval(expDate, { start: startOfMonth(today), end: endOfMonth(today) });
        } else if (filterPeriod === 'year') {
          matchesPeriod = isWithinInterval(expDate, { start: startOfYear(today), end: endOfYear(today) });
        } else if (filterPeriod === 'custom') {
          const startBound = customStartDate ? startOfDay(parseISO(customStartDate)) : new Date(0);
          const endBound = customEndDate ? endOfDay(parseISO(customEndDate)) : new Date(3000, 1, 1);
          matchesPeriod = isWithinInterval(expDate, { start: startBound, end: endBound });
        }
      }

      return matchesSearch && matchesChantier && matchesEmploye && matchesFournisseur && matchesCategory && matchesStatus && matchesPaiement && matchesAmount && matchesPeriod;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = (a.dateDepense || '').localeCompare(b.dateDepense || '');
      } else if (sortBy === 'amount') {
        comparison = (a.amount || 0) - (b.amount || 0);
      } else if (sortBy === 'reason') {
        comparison = (a.reason || '').localeCompare(b.reason || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const filteredExpensesList = getFilteredExpenses();

  // Automatic Totals & Allocations Math
  const totalAmountSum = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const filteredAmountSum = filteredExpensesList.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Grouping Helpers (for stats layout)
  const getTotalsByProject = () => {
    const map: { [key: string]: { name: string; total: number; count: number } } = {};
    expenses.forEach(e => {
      if (e.chantierId) {
        const key = e.chantierId;
        if (!map[key]) map[key] = { name: e.chantierNom || 'Projet Sans Nom', total: 0, count: 0 };
        map[key].total += e.amount;
        map[key].count += 1;
      }
    });
    return Object.values(map).sort((a,b) => b.total - a.total);
  };

  const getTotalsByEmployee = () => {
    const map: { [key: string]: { name: string; total: number; count: number } } = {};
    expenses.forEach(e => {
      if (e.employeId) {
        const key = e.employeId;
        if (!map[key]) map[key] = { name: e.employeNom || 'Collaborateur', total: 0, count: 0 };
        map[key].total += e.amount;
        map[key].count += 1;
      }
    });
    return Object.values(map).sort((a,b) => b.total - a.total);
  };

  const getTotalsBySupplier = () => {
    const map: { [key: string]: { name: string; total: number; count: number } } = {};
    expenses.forEach(e => {
      if (e.fournisseurId) {
        const key = e.fournisseurId;
        if (!map[key]) map[key] = { name: e.fournisseurNom || 'Fournisseur', total: 0, count: 0 };
        map[key].total += e.amount;
        map[key].count += 1;
      }
    });
    return Object.values(map).sort((a,b) => b.total - a.total);
  };

  const getTotalsByCategory = () => {
    const map: { [key: string]: { name: string; total: number; count: number } } = {};
    expenses.forEach(e => {
      const key = e.category || 'AUTRE';
      if (!map[key]) map[key] = { name: key, total: 0, count: 0 };
      map[key].total += e.amount;
      map[key].count += 1;
    });
    return Object.values(map).sort((a,b) => b.total - a.total);
  };

  // Multi-format Reports Exports
  const handleExportPDF = () => {
    const docPdf = new jsPDF();
    
    // Astra Header frame
    docPdf.setFillColor(2, 116, 190);
    docPdf.rect(0, 0, 210, 36, 'F');
    
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(20);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text('RAPPORT DES DÉPENSES & CHARGES', 15, 22);

    docPdf.setFontSize(10);
    docPdf.setTextColor(220, 235, 255);
    docPdf.text(`Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Filtre actif : ${filterPeriod.toUpperCase()}`, 15, 29);

    // Filter status metadata box
    docPdf.setFontSize(10);
    docPdf.setTextColor(30, 41, 59);
    docPdf.text(`Total cumulé : ${formatCurrency(filteredAmountSum)} DA (${filteredExpensesList.length} fiches)`, 15, 48);

    const rows = filteredExpensesList.map(e => [
      e.dateDepense || '-',
      e.expenseNum || '-',
      e.category || '-',
      e.reason || '-',
      e.chantierNom || e.employeNom || e.fournisseurNom || e.vehiculeId || e.service || 'Général',
      e.moyenPaiement || 'Espèces',
      e.statut?.toUpperCase() || 'PAYÉ',
      `${formatCurrency(e.amount)} DA`
    ]);

    autoTable(docPdf, {
      startY: 55,
      head: [['Date', 'N° Réf', 'Catégorie', 'Désignation', 'Affectation Principale', 'Paiement', 'Statut', 'Montant']],
      body: rows,
      headStyles: { fillColor: [2, 116, 190] },
      theme: 'grid',
      styles: { fontSize: 8 }
    });

    docPdf.save(`Rapport_Depenses_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    showToast("Rapport PDF généré avec succès !", "success");
  };

  const handleExportExcel = async () => {
    const columns = [
      { header: 'Date Dépense', key: 'dateDepense', width: 12 },
      { header: 'ID Facture', key: 'expenseNum', width: 15 },
      { header: 'Catégorie', key: 'category', width: 22 },
      { header: 'Motif / Désignation', key: 'reason', width: 35 },
      { header: 'Chantier Affecté', key: 'chantierNom', width: 22 },
      { header: 'Employé Affecté', key: 'employeNom', width: 22 },
      { header: 'Fournisseur', key: 'fournisseurNom', width: 22 },
      { header: 'Véhicule', key: 'vehiculeId', width: 15 },
      { header: 'Moyen Paiement', key: 'moyenPaiement', width: 15 },
      { header: 'Statut', key: 'statut', width: 12 },
      { header: 'Montant (DA)', key: 'amount', width: 18 }
    ];

    const data = filteredExpensesList.map(e => ({
      ...e,
      amount: e.amount
    }));

    await excelService.generateProfessionalReport({
      filename: 'Journal_Consolide_Depenses_Astra',
      title: 'Astra ERP - Journal des Dépenses',
      subtitle: `Export automatique incluant ${filteredExpensesList.length} dépenses pour un montant global de ${filteredAmountSum} DA.`,
      columns,
      data
    });

    showToast("Journal exporté au format Excel !", "success");
  };

  const handleExcelByProject = async () => {
    const projs = getTotalsByProject();
    const columns = [
      { header: 'Nom du Chantier / Projet', key: 'name', width: 45 },
      { header: 'Fréquence des Décaissements', key: 'count', width: 22 },
      { header: 'Total Cumulé Dépensé (DA)', key: 'total', width: 30 }
    ];
    await excelService.generateProfessionalReport({
      filename: 'Synthese_Depenses_Chantiers',
      title: 'Synthèse des Charges Financières par Chantiers',
      subtitle: `Total général investi : ${formatCurrency(expenses.reduce((s,x)=>s+(x.chantierId?x.amount:0),0))} DA`,
      columns,
      data: projs
    });
    showToast("Synthèse chantiers exportée !", "success");
  };

  const handleExcelByEmployee = async () => {
    const emps = getTotalsByEmployee();
    const columns = [
      { header: 'Collaborateur affecté', key: 'name', width: 45 },
      { header: 'Nombre Frais', key: 'count', width: 20 },
      { header: 'Montant Total Alloué (DA)', key: 'total', width: 30 }
    ];
    await excelService.generateProfessionalReport({
      filename: 'Synthese_Charges_Employes',
      title: 'Synthèse des Frais Rattachés par Collaborateurs',
      subtitle: `Total général : ${formatCurrency(expenses.reduce((s,x)=>s+(x.employeId?x.amount:0),0))} DA`,
      columns,
      data: emps
    });
    showToast("Synthèse collaborateurs exportée !", "success");
  };

  const CARDS_PIE_COLORS = ['#0274be', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899', '#14b8a6', '#06b6d4', '#f97316'];

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 pb-20">
      
      {/* 1. Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden shadow-xs">
        <div className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-br from-[#0274be]/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center">
            <DollarSign size={28} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
              Registre Stratégique des Dépenses
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">
              Plateforme d'imputation financière rigoureuse multicritères avec fiches de preuve
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 relative z-10">
          <Button 
            variant="outline"
            onClick={() => setShowDashboard(!showDashboard)}
            className="border-slate-200 text-slate-700 font-extrabold uppercase text-[10px] tracking-widest h-11 px-4"
          >
            <Activity size={14} className="mr-1.5" /> 
            {showDashboard ? "Masquer Analyses" : "Afficher Analyses"}
          </Button>
          
          {canManage && (
            <Button 
              onClick={openAddModal}
              className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold uppercase text-[10px] tracking-widest h-11 px-5 transition-transform hover:-translate-y-0.5"
            >
              <Plus size={16} className="mr-1.5" /> Enregistrer un Décaissement
            </Button>
          )}
        </div>
      </div>

      {/* 2. Dashboard Analytics Panels */}
      {showDashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
          {/* Main KPI Cards Block */}
          <div className="lg:col-span-1 space-y-4 flex flex-col justify-between">
            <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-xs relative overflow-hidden flex-1 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">MONTANT FILTRÉ</span>
                <span className="text-3xl font-black text-rose-600 font-mono mt-1 block">
                  {formatCurrency(filteredAmountSum)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 mt-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">
                  Sur un total brut de {formatCurrency(totalAmountSum)} DA ({expenses.length} dépenses au total)
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-xs relative overflow-hidden flex-1 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">DÉPENSES VALIDÉES</span>
                <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">
                  {expenses.filter(e => e.statut === 'payé').length} Fiches
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 mt-2 flex justify-between text-[9.5px] font-bold text-slate-500 uppercase">
                <span>En attente : {expenses.filter(e => e.statut === 'en attente').length}</span>
                <span className="text-rose-500">Annulées : {expenses.filter(e => e.statut === 'annulé').length}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-xs relative overflow-hidden flex-1 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">CHAMP DE VISIBILITÉ</span>
                <span className="text-sm font-black text-slate-700 uppercase block mt-1">
                  {hasPermission('canViewReports') ? "Visionnaire Global ERP" : "Personnel unilatéral"}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 mt-2">
                <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wide block">
                  Opérateur : {userData?.displayName || user?.displayName || 'Inconnu'}
                </span>
              </div>
            </div>
          </div>

          {/* Graphical Distributions (Category PieChart + Chantier rank bar chart) */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">
                Pondération Financière par Catégorie
              </h3>
              <div className="h-52 flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={getTotalsByCategory().map(c => ({ name: c.name, value: c.total }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {getTotalsByCategory().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CARDS_PIE_COLORS[index % CARDS_PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${formatCurrency(Number(v))} DA`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-3 max-h-16 overflow-y-auto">
                {getTotalsByCategory().slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1 text-[8.5px] font-bold uppercase text-slate-500">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CARDS_PIE_COLORS[idx % CARDS_PIE_COLORS.length] }} />
                    <span className="truncate max-w-[90px]">{item.name}</span>
                    <span className="text-slate-800 font-mono">({((item.total / (totalAmountSum || 1)) * 100).toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">
                Classement d'imputation Chantiers (DA)
              </h3>
              {getTotalsByProject().length > 0 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getTotalsByProject().slice(0, 5)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 'bold' }} />
                      <YAxis tick={{ fontSize: 8, fontWeight: 'bold' }} />
                      <Tooltip formatter={(v) => `${formatCurrency(Number(v))} DA`} />
                      <Bar dataKey="total" fill="#0274be" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-xs italic">
                  Aucun investissement spécifique affecté à un chantier.
                </div>
              )}
              <div className="text-[10px] text-center text-slate-400 font-bold uppercase mt-3">
                Top 5 des Projets / Chantiers les plus budgétivores
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Automatic Aggregation Table block */}
      {showDashboard && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-fadeIn">
          {/* Totals by Project card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
            <h4 className="text-[10px] font-black uppercase text-[#0274be] tracking-widest border-b border-slate-100 pb-2 mb-3">Imputation par Chantier</h4>
            <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-none">
              {getTotalsByProject().map((proj, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <div className="truncate max-w-[140px] font-black text-slate-700 uppercase">{proj.name}</div>
                  <div className="text-right">
                    <span className="font-mono font-black text-slate-800 block">{formatCurrency(proj.total)} DA</span>
                    <span className="text-[8px] font-bold text-slate-400 block">{proj.count} fiches | {((proj.total / (totalAmountSum || 1)) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
              {getTotalsByProject().length === 0 && (
                <div className="text-slate-400 italic text-xs text-center py-6">Aucun chantier affecté</div>
              )}
            </div>
          </div>

          {/* Totals by Employee card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
            <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-widest border-b border-slate-100 pb-2 mb-3">Charges par Employé</h4>
            <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-none">
              {getTotalsByEmployee().map((emp, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <div className="truncate max-w-[140px] font-black text-slate-700 uppercase">{emp.name}</div>
                  <div className="text-right">
                    <span className="font-mono font-black text-slate-800 block">{formatCurrency(emp.total)} DA</span>
                    <span className="text-[8px] font-bold text-slate-400 block">{emp.count} fiches | {((emp.total / (totalAmountSum || 1)) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
              {getTotalsByEmployee().length === 0 && (
                <div className="text-slate-400 italic text-xs text-center py-6">Aucun employé affecté</div>
              )}
            </div>
          </div>

          {/* Totals by Supplier card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
            <h4 className="text-[10px] font-black uppercase text-amber-600 tracking-widest border-b border-slate-100 pb-2 mb-3">Flux par Fournisseur</h4>
            <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-none">
              {getTotalsBySupplier().map((sup, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <div className="truncate max-w-[140px] font-black text-slate-700 uppercase">{sup.name}</div>
                  <div className="text-right">
                    <span className="font-mono font-black text-slate-800 block">{formatCurrency(sup.total)} DA</span>
                    <span className="text-[8px] font-bold text-slate-400 block">{sup.count} fiches | {((sup.total / (totalAmountSum || 1)) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
              {getTotalsBySupplier().length === 0 && (
                <div className="text-slate-400 italic text-xs text-center py-6">Aucun fournisseur enregistré</div>
              )}
            </div>
          </div>

          {/* Totals by Category card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
            <h4 className="text-[10px] font-black uppercase text-purple-600 tracking-widest border-b border-slate-100 pb-2 mb-3">Ventilation par Nature</h4>
            <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-none">
              {getTotalsByCategory().map((cat, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <div className="truncate max-w-[140px] font-black text-slate-700 uppercase">{cat.name}</div>
                  <div className="text-right">
                    <span className="font-mono font-black text-slate-800 block">{formatCurrency(cat.total)} DA</span>
                    <span className="text-[8px] font-bold text-slate-400 block">{cat.count} fiches | {((cat.total / (totalAmountSum || 1)) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Advanced Multicriteria Search Engine */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
          <Filter size={16} className="text-[#0274be]" />
          Moteur de recherche multicritères & Filtres Intelligents
        </h3>
        
        {/* Simple keyword Instant search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Recherche instantanée (Motif, ID, Chantier, Collaborateur, Fournisseur, Service, Matériels...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold focus:ring-1 focus:ring-[#0274be] outline-none"
          />
        </div>

        {/* Multi-tier Filter Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 pt-2">
          
          {/* Chantier Filter */}
          <div>
            <label className="block text-[8.5px] font-black text-slate-400 uppercase tracking-wider mb-1">Chantier / Projet</label>
            <select
              value={filterChantier}
              onChange={(e) => setFilterChantier(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase outline-none focus:ring-1 focus:ring-[#0274be]"
            >
              <option value="all">Tous les Chantiers</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.title}</option>
              ))}
            </select>
          </div>

          {/* Collaborateur Filter */}
          <div>
            <label className="block text-[8.5px] font-black text-slate-400 uppercase tracking-wider mb-1">Employé / Salarié</label>
            <select
              value={filterEmploye}
              onChange={(e) => setFilterEmploye(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase outline-none focus:ring-1 focus:ring-[#0274be]"
            >
              <option value="all">Tous les Collaborateurs</option>
              {employees.map(em => (
                <option key={em.id} value={em.id}>{em.name}</option>
              ))}
            </select>
          </div>

          {/* Fournisseur Filter */}
          <div>
            <label className="block text-[8.5px] font-black text-slate-400 uppercase tracking-wider mb-1">Fournisseur</label>
            <select
              value={filterFournisseur}
              onChange={(e) => setFilterFournisseur(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase outline-none focus:ring-1 focus:ring-[#0274be]"
            >
              <option value="all">Tous les Fournisseurs</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>{sup.name}</option>
              ))}
            </select>
          </div>

          {/* Catégories Filter */}
          <div>
            <label className="block text-[8.5px] font-black text-slate-400 uppercase tracking-wider mb-1">Catégorie</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase outline-none focus:ring-1 focus:ring-[#0274be]"
            >
              <option value="all">Toutes natures</option>
              {STANDARD_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Période Filter */}
          <div>
            <label className="block text-[8.5px] font-black text-slate-400 uppercase tracking-wider mb-1">Période Temporelle</label>
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase outline-none focus:ring-1 focus:ring-[#0274be]"
            >
              <option value="all">Toutes dates</option>
              <option value="today">Aujourd'hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois-ci</option>
              <option value="year">Cette année</option>
              <option value="custom">Plage personnalisée...</option>
            </select>
          </div>

          {/* Statut Filter */}
          <div>
            <label className="block text-[8.5px] font-black text-slate-400 uppercase tracking-wider mb-1">Statut</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase outline-none focus:ring-1 focus:ring-[#0274be]"
            >
              <option value="all">Tous statuts</option>
              <option value="payé">Payé (Validé)</option>
              <option value="en attente">En attente de signature</option>
              <option value="annulé">Annulé</option>
            </select>
          </div>

        </div>

        {/* Custom period start & end dates + Min/Max amount ranges */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
          
          {filterPeriod === 'custom' && (
            <div className="md:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Date Début Plage</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
                />
              </div>
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Date Fin Plage</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
                />
              </div>
            </div>
          )}

          <div className={`${filterPeriod === 'custom' ? 'md:col-span-2' : 'md:col-span-4'} grid grid-cols-2 gap-3`}>
            <div>
              <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Montant Min (DA)</label>
              <input
                type="number"
                placeholder="Ex. 5000"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
              />
            </div>
            <div>
              <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Montant Max (DA)</label>
              <input
                type="number"
                placeholder="Ex. 150000"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
              />
            </div>
          </div>

        </div>

        {/* Sort mechanisms and Exports */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400">Trier par :</span>
            <button
              onClick={() => {
                if (sortBy === 'date') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortBy('date'); setSortOrder('desc'); }
              }}
              className={`px-3 py-1.5 text-xs font-black uppercase border rounded-xl flex items-center gap-1 transition-colors ${sortBy === 'date' ? 'bg-[#0274be] text-white border-[#0274be]' : 'border-slate-200 text-slate-600'}`}
            >
              Date {sortBy === 'date' && (sortOrder === 'asc' ? <ArrowUpDown size={12} /> : <ArrowUpDown size={12} className="rotate-180" />)}
            </button>
            <button
              onClick={() => {
                if (sortBy === 'amount') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortBy('amount'); setSortOrder('desc'); }
              }}
              className={`px-3 py-1.5 text-xs font-black uppercase border rounded-xl flex items-center gap-1 transition-colors ${sortBy === 'amount' ? 'bg-[#0274be] text-white border-[#0274be]' : 'border-slate-200 text-slate-600'}`}
            >
              Montant {sortBy === 'amount' && (sortOrder === 'asc' ? <ArrowUpDown size={12} /> : <ArrowUpDown size={12} className="rotate-180" />)}
            </button>
            <button
              onClick={() => {
                if (sortBy === 'reason') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortBy('reason'); setSortOrder('desc'); }
              }}
              className={`px-3 py-1.5 text-xs font-black uppercase border rounded-xl flex items-center gap-1 transition-colors ${sortBy === 'reason' ? 'bg-[#0274be] text-white border-[#0274be]' : 'border-slate-200 text-slate-600'}`}
            >
              Désignation {sortBy === 'reason' && (sortOrder === 'asc' ? <ArrowUpDown size={12} /> : <ArrowUpDown size={12} className="rotate-180" />)}
            </button>
          </div>

          {/* Quick Reports download lineup */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              className="border-slate-200 hover:bg-slate-50 text-[10px] uppercase font-black tracking-widest h-9"
            >
              <FileDown size={14} className="mr-1" /> PDF Filtré
            </Button>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="border-slate-200 hover:bg-slate-50 text-[10px] uppercase font-black tracking-widest h-9 text-emerald-600"
            >
              <FileSpreadsheet size={14} className="mr-1" /> Excel Filtré
            </Button>
            <Button
              variant="outline"
              onClick={handleExcelByProject}
              className="border-[#0274be]/20 hover:bg-slate-50 text-[9px] uppercase font-black tracking-wider h-9 text-[#0274be]"
            >
              Investissements Chantiers Excel
            </Button>
            <Button
              variant="outline"
              onClick={handleExcelByEmployee}
              className="border-amber-200 hover:bg-slate-50 text-[9px] uppercase font-black tracking-wider h-9 text-amber-700"
            >
              Frais Employés Excel
            </Button>
          </div>
        </div>

      </div>

      {/* 5. Main Structured Desktop Table & Grid */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Résultats de recherche ({filteredExpensesList.length} fiches répertoriées)
          </span>
          <span className="text-[10px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1 rounded-full">
            Total partiel : {formatCurrency(filteredAmountSum)} DA
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="mzsoft-table">
            <thead>
              <tr>
                <th className="w-32">Date & N° Réf</th>
                <th className="w-48">Nature de Dépense</th>
                <th>Désignation / Motif</th>
                <th>Target Affectation (Obligatoire)</th>
                <th>Acheteur & Opérateur</th>
                <th>Paiement & Statut</th>
                <th className="w-20 text-center">Preuve</th>
                <th className="text-right w-40">Montant (DA)</th>
                <th className="w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpensesList.map((exp) => (
                <tr key={exp.id} className="hover:bg-rose-50/20 transition-colors">
                  
                  {/* Date & Ref */}
                  <td className="text-xs">
                    <span className="font-bold text-slate-500 block">
                      {exp.dateDepense ? format(parseISO(exp.dateDepense), 'dd MMMM yyyy', { locale: fr }) : '-'}
                    </span>
                    <span className="font-mono text-[9px] font-black text-[#0274be] block mt-0.5">
                      #{exp.expenseNum || 'TEMP-ID'}
                    </span>
                  </td>

                  {/* Category Nature */}
                  <td>
                    <span className="text-[8px] font-black uppercase tracking-wider px-2 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded">
                      {exp.category || 'AUTRE'}
                    </span>
                  </td>

                  {/* Designation */}
                  <td>
                    <div className="text-xs font-black text-slate-800 line-clamp-2">
                      {exp.reason}
                    </div>
                  </td>

                  {/* Allocation Target indicators */}
                  <td>
                    <div className="space-y-1">
                      {exp.chantierId && (
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded w-max">
                          <Building size={10} /> {exp.chantierNom}
                        </div>
                      )}
                      {exp.employeId && (
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded w-max">
                          <Users size={10} /> {exp.employeNom}
                        </div>
                      )}
                      {exp.fournisseurId && (
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded w-max">
                          <Briefcase size={10} /> {exp.fournisseurNom}
                        </div>
                      )}
                      {exp.vehiculeId && (
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded w-max">
                          <Car size={10} /> {exp.vehiculeId}
                        </div>
                      )}
                      {exp.service && (
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-neutral-700 bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded w-max">
                          <Activity size={10} /> Dept: {exp.service}
                        </div>
                      )}
                      {exp.materiel && (
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded w-max">
                          <Wrench size={10} /> Matériel: {exp.materiel}
                        </div>
                      )}
                      {!exp.chantierId && !exp.employeId && !exp.fournisseurId && !exp.vehiculeId && !exp.service && !exp.materiel && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase italic">Générale / Non affectée</span>
                      )}
                    </div>
                  </td>

                  {/* Operator */}
                  <td className="text-[10px] font-bold text-slate-400 uppercase italic">
                    <span>{exp.userName || 'Admin'}</span>
                  </td>

                  {/* Payment Mode & Status badge */}
                  <td>
                    <div className="space-y-1">
                      <span className="text-[8.5px] font-bold text-slate-500 uppercase block">
                        💳 {exp.moyenPaiement || 'Espèces'}
                      </span>
                      {exp.statut === 'payé' ? (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full">
                          <CheckCircle2 size={10} /> Validé
                        </span>
                      ) : exp.statut === 'annulé' ? (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded-full">
                          <XCircle size={10} /> Annulé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full">
                          <AlertCircle size={10} /> Attente Signature
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Attachment Thumb preview */}
                  <td className="text-center">
                    {exp.justificatif ? (
                      <button 
                        onClick={() => setPreviewJustificatif(exp.justificatif || '')}
                        className="w-8 h-8 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 overflow-hidden flex items-center justify-center mx-auto transition-transform hover:scale-110"
                        title="Afficher la pièce justificative"
                      >
                        <Image size={15} className="text-slate-500" />
                      </button>
                    ) : (
                      <span className="text-[8.5px] font-bold text-slate-300 uppercase block">Aucun</span>
                    )}
                  </td>

                  {/* Price */}
                  <td className="text-right font-black text-rose-600 text-sm font-mono">
                    {formatCurrency(exp.amount)} DA
                  </td>

                  {/* Operations */}
                  <td className="text-center">
                    <div className="flex justify-center gap-1.5">
                      {canManage && (
                        <button 
                          onClick={() => openEditModal(exp)}
                          className="p-1.5 text-slate-400 hover:text-[#0274be] border border-slate-200 rounded hover:bg-blue-50 transition-colors"
                          title="Modifier"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {canManage && (
                        <button 
                          onClick={() => handleDelete(exp)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 border border-slate-200 rounded hover:bg-rose-50 transition-colors"
                          title="Supprimer définitivement"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>

                </tr>
              ))}
              
              {filteredExpensesList.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-20 text-slate-400 italic text-sm">
                    {loading ? "Chargement du registre en temps réel..." : "Aucune imputation financière ne correspond aux filtres de recherche."}
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Form Adding/Editing Modal Drawer */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingExpense ? `Ajustement de l'Imputation #${editingExpense.expenseNum}` : "Saisie de Charge Financière avec Imputation"}
      >
        <form onSubmit={handleExpenseFormSubmit} className="space-y-5">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Value Reason */}
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                Désignation / Motif précis du Décaissement *
              </label>
              <input 
                type="text" 
                required
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Ex. Facture béton toupie centrale Lafarge coffrage chantier Hydra" 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm outline-none focus:ring-1 focus:ring-[#0274be]"
              />
            </div>

            {/* Category selection */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                Nature / Catégorie de Charge *
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm outline-none focus:ring-1 focus:ring-[#0274be]"
              >
                {STANDARD_CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Date Pick */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                Date effective de la Dépense *
              </label>
              <input 
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm outline-none focus:ring-1 focus:ring-[#0274be]"
              />
            </div>

            {/* Financial Value Amount */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                Montant Décaissé (DA) *
              </label>
              <input 
                type="number"
                required
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-2 bg-rose-50 border border-rose-300 rounded-xl font-black text-lg text-rose-600 outline-none focus:ring-1 focus:ring-rose-500 font-mono"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                Moyen de Paiement *
              </label>
              <select
                value={formMoyen}
                onChange={(e) => setFormMoyen(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm outline-none focus:ring-1 focus:ring-[#0274be]"
              >
                <option value="Espèces">Espèces (Petit Fond)</option>
                <option value="Chèque">Chèque d'Entreprise</option>
                <option value="Virement">Virement Bancaire (CCP/BNA)</option>
                <option value="Carte">Carte Bancaire Corporate</option>
              </select>
            </div>

            {/* Allocation Enforcer selection Block */}
            <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Affectation & Imputation Obligatoire
                </span>
                <span className="text-[8px] bg-[#0274be]/10 text-[#0274be] px-2 py-0.5 rounded font-black uppercase">
                  Conformité RH & Projets
                </span>
              </div>

              {/* Grid Selector */}
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                {['Chantier', 'Employé', 'Fournisseur', 'Véhicule', 'Service', 'Matériel', 'Autre'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPrimaryAllocationType(type)}
                    className={`py-2 px-1 rounded-xl text-[9.5px] font-black uppercase border tracking-tight text-center transition-colors ${primaryAllocationType === type ? 'bg-[#0274be] text-white border-[#0274be]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Dynamic Subforms selectors depending on Choice */}
              <div className="pt-2">
                
                {primaryAllocationType === 'Chantier' && (
                  <div className="animate-fadeIn">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Sélectionner le chantier / projet de destination *</label>
                    <select
                      value={formChantierId}
                      onChange={(e) => setFormChantierId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
                    >
                      <option value="">-- Choisir un chantier --</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name || p.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                {primaryAllocationType === 'Employé' && (
                  <div className="animate-fadeIn">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Rattacher au collaborateur / salarié *</label>
                    <select
                      value={formEmployeId}
                      onChange={(e) => setFormEmployeId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
                    >
                      <option value="">-- Choisir un employé --</option>
                      {employees.map(em => (
                        <option key={em.id} value={em.id}>{em.name} (Ref: {em.matricule || 'Sans Ref'})</option>
                      ))}
                    </select>
                  </div>
                )}

                {primaryAllocationType === 'Fournisseur' && (
                  <div className="animate-fadeIn">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Rattacher à la facture fournisseur *</label>
                    <select
                      value={formFournisseurId}
                      onChange={(e) => setFormFournisseurId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
                    >
                      <option value="">-- Choisir un fournisseur --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {primaryAllocationType === 'Véhicule' && (
                  <div className="animate-fadeIn">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Sélectionner ou saisir le véhicule concerné *</label>
                    <input
                      type="text"
                      list="vehicles-list"
                      placeholder="Saisir ou choisir un véhicule (ex: Renault Master)"
                      value={formVehiculeId}
                      onChange={(e) => setFormVehiculeId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
                    />
                    <datalist id="vehicles-list">
                      {STATIC_VEHICLES.map(v => (
                        <option key={v.id} value={v.name} />
                      ))}
                    </datalist>
                  </div>
                )}

                {primaryAllocationType === 'Service' && (
                  <div className="animate-fadeIn">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Service de rattachement administratif *</label>
                    <select
                      value={formService}
                      onChange={(e) => setFormService(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
                    >
                      <option value="">-- Choisir un service --</option>
                      {STATIC_DEPARTMENTS.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {primaryAllocationType === 'Matériel' && (
                  <div className="animate-fadeIn animate-duration-150">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Nom ou Désignation du matériel amorti *</label>
                    <input
                      type="text"
                      placeholder="Ex: Générateur 20Kva ou Meuleuse Bosch 1200w"
                      value={formMateriel}
                      onChange={(e) => setFormMateriel(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#0274be]"
                    />
                  </div>
                )}

                {primaryAllocationType === 'Autre' && (
                  <div className="animate-fadeIn text-slate-500 text-[10px] font-bold uppercase tracking-wider py-1 select-none">
                    L'imputation sera classée comme Frais Généraux administratifs inter-chantiers.
                  </div>
                )}

              </div>
            </div>

            {/* Document proof attach module */}
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                Pièce justificative (Facture scannée, Bon de caisse, Reçu photo / max 2Mo)
              </label>
              <div className="flex items-center gap-3">
                <input 
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="justificatif-file"
                />
                <label 
                  htmlFor="justificatif-file"
                  className="flex-1 border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center cursor-pointer hover:border-[#0274be] hover:bg-slate-50 transition-colors block"
                >
                  <Paperclip size={20} className="mx-auto mb-1 text-slate-400" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
                    {formJustificatif ? "Remplacer la pièce justificative scannée" : "Parcourir pour importer la preuve"}
                  </span>
                  <span className="text-[8px] text-slate-400 font-bold uppercase mt-0.5 block">
                    Format IMAGE ou JPEG supporté
                  </span>
                </label>
                {formJustificatif && (
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200">
                    <img src={formJustificatif} alt="Justificatif" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setFormJustificatif('')}
                      className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Form status option */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                Statut de Validation *
              </label>
              <select
                value={formStatut}
                onChange={(e) => setFormStatut(e.target.value as any)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm outline-none focus:ring-1 focus:ring-[#0274be]"
              >
                <option value="payé">Payé (Imputation validée)</option>
                <option value="en attente">En attente (Non signé)</option>
                <option value="annulé">Fiche Annulée</option>
              </select>
            </div>

            {/* General notes or Obs */}
            <div className="md:col-span-2 text-xs text-slate-400 select-none border-t border-slate-100 pt-2 font-bold uppercase">
              ⚠️ Note : L'enregistrement d'une dépense impacte directement la caisse opérationnelle et modifie les balances budgétaires chantiers.
            </div>

          </div>

          <div className="flex gap-2.5 pt-4">
            <Button 
              type="submit" 
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl"
            >
              🚀 {editingExpense ? "Actualiser l'écriture" : "Valider l'Imputation Financière"}
            </Button>
            <Button 
              variant="outline" 
              type="button" 
              onClick={() => setIsModalOpen(false)}
              className="h-12 text-xs font-black uppercase tracking-widest rounded-xl border-slate-200 text-slate-600"
            >
              Annuler
            </Button>
          </div>

        </form>
      </Modal>

      {/* 7. Justificatif Zoom Preview Modal */}
      {previewJustificatif && (
        <Modal 
          isOpen={!!previewJustificatif} 
          onClose={() => setPreviewJustificatif(null)} 
          title="Consulter la pièce de preuve justificative"
        >
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[70vh] flex items-center justify-center bg-slate-900">
              <img src={previewJustificatif} alt="Justificatif grand format" className="max-w-full max-h-[60vh] object-contain" />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const printWin = window.open('about:blank', '_blank');
                  if (printWin) {
                    printWin.document.write(`<img src="${previewJustificatif}" style="max-width:100%; border-radius:12px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);" />`);
                    printWin.document.title = "Impression Justificatif";
                    printWin.print();
                  }
                }}
                className="font-extrabold uppercase text-[10px]"
              >
                <Printer size={13} className="mr-1" /> Imprimer le justificatif
              </Button>
              <Button
                variant="outline"
                onClick={() => setPreviewJustificatif(null)}
                className="border-slate-200 text-slate-600 font-extrabold uppercase text-[10px]"
              >
                Fermer
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmationModal
        isOpen={expenseToDelete !== null}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={async () => {
          if (!expenseToDelete || !expenseToDelete.id) return;
          try {
            setIsDeleting(true);
            await deleteDoc(doc(db, 'expenses', expenseToDelete.id));
            
            // Re-adjust active session budget
            if (activeSession) {
              await dbService.updateDocument('daily_closings', activeSession.id, {
                expenses: increment(-expenseToDelete.amount),
                netCash: increment(expenseToDelete.amount),
                updatedAt: serverTimestamp()
              });
            }
            showToast("Dépense supprimée définitivement", "success");
          } catch (error: any) {
            showToast(`Erreur lors de la suppression: ${error.message || 'Permissions insuffisantes'}`, "error");
          } finally {
            setIsDeleting(false);
            setExpenseToDelete(null);
          }
        }}
        title="Confirmation de Suppression"
        message={`Voulez-vous vraiment supprimer définitivement la dépense ${expenseToDelete?.expenseNum || ''} d'un montant de ${formatCurrency(expenseToDelete?.amount || 0)} ?`}
        confirmText="Supprimer"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
