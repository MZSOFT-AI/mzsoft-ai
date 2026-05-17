import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { dbService } from '../firebase/db';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Button } from '../components/ui/Button';
import { Plus, Search, Phone, Mail, User, Edit2, Trash2, Truck, UserCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import Modal from '../components/ui/Modal';

import { useNotification } from '../context/NotificationContext';

export default function Suppliers() {
  const { showToast } = useNotification();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'suppliers'), orderBy('name')), 
      (snapshot) => {
        setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      }
    );
  }, []);

  const onSubmit = async (data: any) => {
    try {
      if (editingSupplier) {
        await dbService.updateDocument('suppliers', editingSupplier.id, data);
        showToast('Fournisseur mis à jour', 'success');
      } else {
        await dbService.addDocument('suppliers', data);
        showToast('Fournisseur ajouté', 'success');
      }
      setIsModalOpen(false);
      setEditingSupplier(null);
      reset();
    } catch (error) {
      showToast('Erreur lors de l\'enregistrement', 'error');
    }
  };

  const handleEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    reset(supplier);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Voulez-vous vraiment supprimer ce fournisseur ?')) {
      try {
        await dbService.deleteDocument('suppliers', id);
        showToast('Fournisseur supprimé', 'success');
      } catch (error) {
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  };

  const filtered = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.contactName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Répertoire Fournisseurs</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Base de données tiers (Fournisseurs)</p>
        </div>
        <Button size="sm" className="h-9 text-xs font-bold uppercase bg-blue-600 hover:bg-blue-700" onClick={() => { setEditingSupplier(null); reset({}); setIsModalOpen(true); }}>
          <Plus size={16} className="mr-2" /> Nouveau Fournisseur
        </Button>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher par nom de société ou contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
      </div>

      {/* ERP Table */}
      <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
        <table className="mzsoft-table">
          <thead>
            <tr>
              <th>Raison Sociale</th>
              <th>Contact Privilégié</th>
              <th>Mobile / Fixe</th>
              <th>Email de Contact</th>
              <th className="w-20 text-center">...</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((supplier) => (
              <tr key={supplier.id} className="hover:bg-blue-50 transition-colors">
                <td className="font-bold text-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-100 border border-slate-200 text-slate-400 rounded">
                       <Truck size={14} />
                    </div>
                    {supplier.name}
                  </div>
                </td>
                <td className="text-xs font-bold text-slate-600">
                  <div className="flex items-center gap-2">
                    <User size={12} className="text-slate-400" /> {supplier.contactName || '-'}
                  </div>
                </td>
                <td className="text-xs font-bold text-blue-600">
                  {supplier.phone || '-'}
                </td>
                <td className="text-xs text-slate-400 italic font-medium">
                  {supplier.email || '-'}
                </td>
                <td className="text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => handleEdit(supplier)} className="p-1.5 text-slate-400 hover:text-blue-600 border border-transparent hover:border-blue-200 hover:bg-blue-50">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(supplier.id)} className="p-1.5 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200 hover:bg-rose-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-20 text-slate-400 italic text-sm">Aucun fournisseur répertorié</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingSupplier ? "Modification Fournisseur" : "Nouvau Compte Fournisseur"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Raison Sociale / Société *</label>
                <input {...register('name', { required: true })} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Contact Principal</label>
                <input {...register('contactName')} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
             <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Téléphone</label>
                <input {...register('phone')} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
             <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Email</label>
                <input type="email" {...register('email')} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Siège Social / Adresse</label>
                <textarea {...register('address')} rows={3} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 text-sm outline-none focus:ring-1 focus:ring-blue-500 italic resize-none" />
             </div>
          </div>
          <div className="pt-4 flex gap-2">
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 h-12 uppercase font-black tracking-widest text-xs">
              <UserCheck size={18} className="mr-2" /> Enregistrer Fournisseur
            </Button>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)} className="h-12 uppercase font-black tracking-widest text-xs">Annuler</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
