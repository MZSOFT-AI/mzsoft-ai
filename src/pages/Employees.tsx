import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { Employee, Project, ProjectPayment, Sale, Quote, Invoice } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  Briefcase, 
  DollarSign, 
  Calendar, 
  Trash2, 
  Edit2, 
  CreditCard, 
  History,
  HardHat,
  FileText,
  Wallet,
  TrendingDown
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Modal from '../components/ui/Modal';
import { toast } from 'react-hot-toast';
import { cn, formatCurrency } from '../lib/utils';
import { excelService } from '../services/excelService';

const Employees: React.FC = () => {
  const { isAdmin, user, userData } = useAuth();
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<ProjectPayment[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'roster' | 'payments' | 'stats'>('roster');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    role: '',
    phone: '',
    salaryBasis: 'daily' as Employee['salaryBasis'],
    rate: '',
    isActive: true
  });

  const [paymentForm, setPaymentForm] = useState({
    employeeId: '',
    projectId: '',
    amount: '',
    docId: '', // Link to N° de bon, etc.
    type: 'salary' as ProjectPayment['type'],
    paymentMethod: 'cash' as ProjectPayment['paymentMethod'],
    notes: '',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const unsubEmployees = onSnapshot(query(collection(db, 'employees'), orderBy('name')), (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    });

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
    });

    const unsubPayments = onSnapshot(query(collection(db, 'employeePayments'), orderBy('date', 'desc')), (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectPayment)));
      setLoading(false);
    });

    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snap) => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    });

    return () => {
      unsubEmployees();
      unsubProjects();
      unsubPayments();
      unsubSales();
      unsubInvoices();
    };
  }, []);

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeForm.name) return;

    try {
      const data = {
        ...employeeForm,
        rate: Number(employeeForm.rate) || 0,
        updatedAt: serverTimestamp()
      };

      if (selectedEmployee) {
        await updateDoc(doc(db, 'employees', selectedEmployee.id!), data);
        toast.success('Employé mis à jour');
      } else {
        await addDoc(collection(db, 'employees'), {
          ...data,
          createdAt: serverTimestamp()
        });
        toast.success('Employé ajouté');
      }
      setIsEmployeeModalOpen(false);
      resetEmployeeForm();
    } catch (error) {
      toast.error('Erreur d\'enregistrement');
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.employeeId || !paymentForm.amount) return;

    try {
      const emp = employees.find(e => e.id === paymentForm.employeeId);
      const prj = projects.find(p => p.id === paymentForm.projectId);

      const paymentData = {
        ...paymentForm,
        employeeName: emp?.name || 'Inconnu',
        projectName: prj?.name || 'Libre',
        amount: Number(paymentForm.amount),
        date: new Date(paymentForm.date),
        createdBy: user?.uid || '',
        createdByName: userData?.displayName || user?.displayName || 'Admin',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'employeePayments'), paymentData);
      
      // Also register as expense if desired, but we'll focus on direct payment tracking for now
      toast.success('Paiement enregistré');
      setIsPaymentModalOpen(false);
      setPaymentForm({
        ...paymentForm,
        amount: '',
        notes: '',
        docId: ''
      });
    } catch (error) {
      toast.error('Erreur lors du paiement');
    }
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      name: '',
      role: '',
      phone: '',
      salaryBasis: 'daily',
      rate: '',
      isActive: true
    });
    setSelectedEmployee(null);
  };

  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDocSuggestions = () => {
    // Collect all unique document IDs (Bons/Factures/Devis)
    const allDocs = [
      ...sales.map(s => ({ id: s.id, type: 'Vente', ref: s.id?.slice(-6).toUpperCase() })),
      ...invoices.map(i => ({ id: i.id, type: 'Facture', ref: i.invoiceNumber }))
    ];
    return allDocs;
  };

  const handleExportEmployees = async () => {
    try {
      if (activeTab === 'roster') {
        const data = employees.map(e => ({
          name: e.name,
          role: e.role,
          phone: e.phone || '-',
          salaryBasis: e.salaryBasis,
          rate: e.rate,
          status: e.isActive ? 'ACTIF' : 'INACTIF'
        }));

        await excelService.generateProfessionalReport({
          filename: `Effectif_RH_${format(new Date(), 'yyyyMMdd')}`,
          title: 'LISTE DU PERSONNEL ET RÉMUNÉRATIONS',
          subtitle: `État de l'effectif au ${format(new Date(), 'dd/MM/yyyy')}`,
          columns: [
            { header: 'Nom Complet', key: 'name', width: 30 },
            { header: 'Poste', key: 'role', width: 25 },
            { header: 'Téléphone', key: 'phone', width: 15 },
            { header: 'Base Salaire', key: 'salaryBasis', width: 15 },
            { header: 'Taux (DA)', key: 'rate', width: 15 },
            { header: 'Statut', key: 'status', width: 12 }
          ],
          data
        });
      } else if (activeTab === 'payments') {
        const data = payments.map(p => ({
          date: format(p.date?.toDate ? p.date.toDate() : new Date(p.date as any), 'dd/MM/yyyy'),
          employee: p.employeeName,
          project: p.projectName,
          doc: p.docId || '-',
          amount: p.amount,
          method: p.paymentMethod,
          type: p.type
        }));

        await excelService.generateProfessionalReport({
          filename: `Paiements_Salaires_${format(new Date(), 'yyyyMMdd')}`,
          title: 'JOURNAL DES PAIEMENTS ET AVANCES',
          subtitle: `Historique des règlements au ${format(new Date(), 'dd/MM/yyyy')}`,
          columns: [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Employé', key: 'employee', width: 30 },
            { header: 'Chantier', key: 'project', width: 30 },
            { header: 'Ref. Doc', key: 'doc', width: 15 },
            { header: 'Montant (DA)', key: 'amount', width: 15 },
            { header: 'Méthode', key: 'method', width: 15 },
            { header: 'Nature', key: 'type', width: 15 }
          ],
          data
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Ressources Humaines & Paie</h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Gestion du personnel et paiements par chantier</p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <Button variant="outline" onClick={handleExportEmployees} className="h-11 border-emerald-200 bg-emerald-50 text-emerald-700 font-black uppercase text-xs">
             <TrendingDown size={18} className="mr-2" /> Rapports Excel
           </Button>
           <Button variant="outline" onClick={() => { setIsEmployeeModalOpen(true); resetEmployeeForm(); }} className="h-11 border-slate-200 font-black uppercase text-xs">
             <Plus size={18} className="mr-2" /> Ajouter Employé
           </Button>
           <Button onClick={() => setIsPaymentModalOpen(true)} className="h-11 bg-slate-900 font-black uppercase text-xs">
             <DollarSign size={18} className="mr-2" /> Effectuer un Paiement
           </Button>
        </div>
      </div>

      <div className="flex border-b border-slate-200 gap-8 mb-6">
         {[
           { id: 'roster', label: 'Effectif', icon: Users },
           { id: 'payments', label: 'Journal des Paiements', icon: Wallet },
           { id: 'stats', label: 'Analyse & Coûts', icon: TrendingDown }
         ].map(tab => (
           <button
             key={tab.id}
             onClick={() => setActiveTab(tab.id as any)}
             className={cn(
               "pb-4 text-xs font-black uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all",
               activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
             )}
           >
             <tab.icon size={16} />
             {tab.label}
           </button>
         ))}
      </div>

      {activeTab === 'roster' && (
        <div className="space-y-6">
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
             <Input 
               placeholder="Rechercher un employé..." 
               className="pl-10 h-11"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filteredEmployees.map(emp => (
               <div key={emp.id} className="bg-white border-2 border-slate-200 p-6 flex flex-col relative group">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-black text-lg">
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-md font-black text-slate-800 uppercase leading-tight">{emp.name}</h3>
                      <p className="text-[10px] font-black uppercase text-blue-600 tracking-wider">ID: #{emp.id?.slice(-4).toUpperCase()}</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-bold uppercase tracking-tight">Poste:</span>
                      <span className="font-black text-slate-700 uppercase">{emp.role}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-bold uppercase tracking-tight">Téléphone:</span>
                      <span className={cn("font-black", emp.phone ? "text-slate-700" : "text-slate-300")}>{emp.phone || 'Non renseigné'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs border-t border-slate-50 pt-2">
                       <span className="text-slate-400 font-bold uppercase tracking-tight">Taux ({emp.salaryBasis}):</span>
                       <span className="font-black text-emerald-600">{formatCurrency(emp.rate)}</span>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => { setSelectedEmployee(emp); setEmployeeForm({ ...emp, rate: emp.rate.toString() } as any); setIsEmployeeModalOpen(true); }}>
                      <Edit2 size={14} className="mr-2" /> Gérer
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 w-9 text-rose-500" onClick={async () => { if(window.confirm('Supprimer ?')) await deleteDoc(doc(db, 'employees', emp.id!)); }}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="bg-white border border-slate-200">
           <table className="mzsoft-table">
             <thead>
               <tr>
                 <th>Date</th>
                 <th>Employé</th>
                 <th>Chantier / Nature</th>
                 <th>Document Réf.</th>
                 <th className="text-right">Montant</th>
                 <th>Méthode</th>
                 <th className="text-center">Action</th>
               </tr>
             </thead>
             <tbody>
               {payments.map(pay => (
                 <tr key={pay.id}>
                   <td className="text-[10px] font-black text-slate-500 uppercase">
                     {pay.date ? format(pay.date.toDate ? pay.date.toDate() : new Date(pay.date as any), 'dd MMM yyyy', { locale: fr }) : '-'}
                   </td>
                   <td className="font-black text-slate-800 text-xs">{pay.employeeName}</td>
                   <td>
                     <div className="flex flex-col">
                       <span className="text-xs font-bold text-slate-600 uppercase">{pay.projectName}</span>
                       <span className="text-[9px] font-black uppercase text-blue-500 tracking-tighter">{pay.type}</span>
                     </div>
                   </td>
                   <td>
                     <span className="text-[10px] font-black bg-slate-100 px-2 py-1 border border-slate-200">
                       {pay.docId || '-'}
                     </span>
                   </td>
                   <td className="text-right font-black text-rose-600 text-xs">
                     -{formatCurrency(pay.amount)}
                   </td>
                   <td className="text-[10px] font-black uppercase text-slate-500">{pay.paymentMethod}</td>
                   <td className="text-center">
                     <button className="text-slate-300 hover:text-rose-500" onClick={async () => { if(window.confirm('Annuler ce paiement ?')) await deleteDoc(doc(db, 'employeePayments', pay.id!)); }}>
                       <Trash2 size={14} />
                     </button>
                   </td>
                 </tr>
               ))}
               {payments.length === 0 && (
                 <tr>
                   <td colSpan={7} className="text-center py-12 text-slate-400 italic text-xs uppercase font-bold tracking-widest">Aucun paiement enregistré</td>
                 </tr>
               )}
             </tbody>
           </table>
        </div>
      )}

      {/* Employee Modal */}
      <Modal isOpen={isEmployeeModalOpen} onClose={() => setIsEmployeeModalOpen(false)} title={selectedEmployee ? 'Modifier Employé' : 'Nouvel Employé'}>
        <form onSubmit={handleEmployeeSubmit} className="space-y-4">
           <div>
             <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Nom Complet *</label>
             <Input required value={employeeForm.name} onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})} />
           </div>
           <div className="grid grid-cols-2 gap-4">
             <div>
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Rôle / Poste</label>
               <Input value={employeeForm.role} onChange={e => setEmployeeForm({...employeeForm, role: e.target.value})} placeholder="Ex: Chef de Chantier" />
             </div>
             <div>
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Téléphone</label>
               <Input value={employeeForm.phone} onChange={e => setEmployeeForm({...employeeForm, phone: e.target.value})} />
             </div>
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Base de Salaire</label>
                <select className="erp-select" value={employeeForm.salaryBasis} onChange={e => setEmployeeForm({...employeeForm, salaryBasis: e.target.value as any})}>
                  <option value="daily">Journalier</option>
                  <option value="monthly">Mensuel</option>
                  <option value="fixed">Forfait / Fixe</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Taux / Montant (DA)</label>
                <Input type="number" value={employeeForm.rate} onChange={e => setEmployeeForm({...employeeForm, rate: e.target.value})} />
              </div>
           </div>
           <div className="flex gap-3 pt-4">
             <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEmployeeModalOpen(false)}>Annuler</Button>
             <Button type="submit" className="flex-1 bg-blue-600">Enregistrer</Button>
           </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Enregistrer un Paiement">
         <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Employé *</label>
              <select required className="erp-select" value={paymentForm.employeeId} onChange={e => setPaymentForm({...paymentForm, employeeId: e.target.value})}>
                <option value="">Sélectionner un employé</option>
                {employees.filter(e => e.isActive).map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Assigner Chantier</label>
                <select className="erp-select" value={paymentForm.projectId} onChange={e => setPaymentForm({...paymentForm, projectId: e.target.value})}>
                  <option value="">Hors Chantier (Libre)</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">N° Bon / Document</label>
                <Input value={paymentForm.docId} onChange={e => setPaymentForm({...paymentForm, docId: e.target.value})} placeholder="Fac/Bon réf." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Montant Versé (DA) *</label>
                <Input required type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Date du Paiement</label>
                <Input type="date" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Nature</label>
                <select className="erp-select" value={paymentForm.type} onChange={e => setPaymentForm({...paymentForm, type: e.target.value as any})}>
                  <option value="salary">Salaire / Quinzaine</option>
                  <option value="advance">Avance / Acompte</option>
                  <option value="bonus">Prime / Bonus</option>
                  <option value="expense">Frais / Déplacement</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Mode Paiement</label>
                <select className="erp-select" value={paymentForm.paymentMethod} onChange={e => setPaymentForm({...paymentForm, paymentMethod: e.target.value as any})}>
                  <option value="cash">Espèces</option>
                  <option value="transfer">Virement</option>
                  <option value="card">Carte</option>
                  <option value="other">Autre</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Observations</label>
              <textarea className="w-full erp-select min-h-[60px]" value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1 font-black uppercase text-xs" onClick={() => setIsPaymentModalOpen(false)}>Annuler</Button>
              <Button type="submit" className="flex-1 bg-slate-900 font-black uppercase text-xs">Vérifier & Valider</Button>
            </div>
         </form>
      </Modal>
    </div>
  );
};

export default Employees;
