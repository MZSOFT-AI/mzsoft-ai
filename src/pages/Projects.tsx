import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { Project, Customer, Sale, Quote, Invoice } from '../types';
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
  DollarSign
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Modal from '../components/ui/Modal';
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    clientId: '',
    status: 'planning' as Project['status'],
    budget: '',
    description: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubProjects = onSnapshot(q, (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
      setLoading(false);
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snap) => {
      setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Quote)));
    });

    const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snap) => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    });

    return () => {
      unsubProjects();
      unsubCustomers();
      unsubSales();
      unsubQuotes();
      unsubInvoices();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      const client = customers.find(c => c.id === formData.clientId);
      const projectData = {
        ...formData,
        clientName: client?.name || '',
        budget: Number(formData.budget) || 0,
        startDate: formData.startDate ? new Date(formData.startDate) : null,
        endDate: formData.endDate ? new Date(formData.endDate) : null,
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
      endDate: ''
    });
    setSelectedProject(null);
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
      endDate: project.endDate?.toDate ? format(project.endDate.toDate(), 'yyyy-MM-dd') : project.endDate ? format(new Date(project.endDate as any), 'yyyy-MM-dd') : ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce chantier ?')) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      toast.success('Chantier supprimé');
    } catch (error) {
      toast.error('Erreur de suppression');
    }
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

  const getProjectStats = (projectId: string) => {
    const projectSales = sales.filter(s => s.projectId === projectId);
    const projectInvoices = invoices.filter(i => i.projectId === projectId);
    const totalSales = projectSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
    const totalInvoices = projectInvoices.reduce((acc, i) => acc + (i.totalAmount || 0), 0);
    return {
      revenue: totalSales + totalInvoices,
      docCount: projectSales.length + projectInvoices.length
    };
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map(project => {
          const stats = getProjectStats(project.id!);
          return (
            <div key={project.id} className="bg-white border-2 border-slate-200 hover:border-blue-500 transition-all group relative overflow-hidden">
               <div className={cn("absolute top-0 right-0 p-1.5 rounded-bl-lg border-b border-l", getStatusColor(project.status))}>
                  <span className="text-[9px] font-black uppercase tracking-wider">{getStatusLabel(project.status)}</span>
               </div>

               <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <HardHat size={24} />
                    </div>
                  </div>

                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-1">{project.name}</h3>
                  
                  <div className="space-y-2 mt-4">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase">
                      <MapPin size={14} className="text-slate-400" />
                      <span>{project.location || 'Lieu non défini'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase">
                      <User size={14} className="text-slate-400" />
                      <span>{project.clientName || 'Client de passage'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase">
                      <Calendar size={14} className="text-slate-400" />
                      <span>
                        {project.startDate ? format(project.startDate.toDate ? project.startDate.toDate() : new Date(project.startDate as any), 'dd/MM/yyyy') : '-'}
                        {' → '}
                        {project.endDate ? format(project.endDate.toDate ? project.endDate.toDate() : new Date(project.endDate as any), 'dd/MM/yyyy') : 'Indéterminé'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                     <div>
                       <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Valeur Ventes/Docs</p>
                       <p className="text-md font-black text-emerald-600">{formatCurrency(stats.revenue)}</p>
                     </div>
                     <div>
                       <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Documents</p>
                       <p className="text-md font-black text-blue-600 text-right">{stats.docCount}</p>
                     </div>
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => handleEdit(project)}>
                      <Edit2 size={14} className="mr-2" /> Modifier
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 w-9 text-rose-500 hover:bg-rose-50 border-slate-200" onClick={() => handleDelete(project.id!)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
               </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedProject ? 'Modifier le Chantier' : 'Nouveau Chantier'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
           <div>
             <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Nom du Chantier *</label>
             <Input 
               required
               value={formData.name}
               onChange={(e) => setFormData({...formData, name: e.target.value})}
               placeholder="Ex: Villa El Biar, Immeuble Hydra..."
             />
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
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Client Associé</label>
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
             <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>Annuler</Button>
             <Button type="submit" className="flex-1 bg-blue-600">Enregistrer</Button>
           </div>
        </form>
      </Modal>
    </div>
  );
};

export default Projects;
