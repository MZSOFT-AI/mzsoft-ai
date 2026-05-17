import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { dbService } from '../firebase/db';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Button } from '../components/ui/Button';
import { Plus, Search, Phone, Mail, User, Edit2, Trash2, Download, UserCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import Modal from '../components/ui/Modal';
import { format } from 'date-fns';
import { Customer } from '../types';
import { formatCurrency, cn } from '../lib/utils';

import { useNotification } from '../context/NotificationContext';

export default function Customers() {
  const { showToast } = useNotification();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'customers'), orderBy('name')), 
      (snapshot) => {
        setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'customers');
      }
    );
  }, []);

  const onSubmit = async (data: any) => {
    try {
      if (editingCustomer) {
        await dbService.updateDocument('customers', editingCustomer.id, data);
        showToast('Client mis à jour', 'success');
      } else {
        await dbService.addDocument('customers', {
          ...data,
          totalSpent: 0,
          totalPaid: 0,
          totalDebt: 0
        });
        showToast('Client créé', 'success');
      }
      setIsModalOpen(false);
      setEditingCustomer(null);
      reset();
    } catch (error) {
      showToast('Erreur lors de l\'enregistrement', 'error');
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    reset(customer);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Supprimer ce client ?')) {
      try {
        await dbService.deleteDocument('customers', id);
        showToast('Client supprimé', 'success');
      } catch (error) {
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone?.includes(searchQuery) ||
    c.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.clientCode?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const exportToCSV = () => {
    const headers = ['Nom', 'Code Client', 'Téléphone', 'Email', 'Adresse', 'Total Achats'];
    const data = filtered.map(c => [
      c.name,
      c.clientCode || '',
      c.phone || '',
      c.email || '',
      `"${(c.address || '').replace(/"/g, '""')}"`,
      c.totalSpent || 0
    ]);

    const csvContent = [headers, ...data].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `clients_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Répertoire Clients</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Base de données tiers (Clients)</p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <Button variant="outline" size="sm" className="h-9 text-xs font-bold uppercase" onClick={exportToCSV}>
             <Download size={16} className="mr-2 text-slate-400" /> Exporter
           </Button>
           <Button size="sm" className="h-9 text-xs font-bold uppercase bg-blue-600 hover:bg-blue-700" onClick={() => { setEditingCustomer(null); reset({}); setIsModalOpen(true); }}>
             <Plus size={16} className="mr-2" /> Nouveau Client
           </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Rechercher par nom, téléphone ou code client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center justify-center p-2 bg-rose-50 border border-rose-100 rounded">
               <span className="text-[10px] font-black uppercase text-rose-500 tracking-widest mr-2">Dette Globale:</span>
               <span className="text-sm font-black text-rose-600">{formatCurrency(customers.reduce((sum, c) => sum + (c.totalDebt || 0), 0))}</span>
            </div>
          </div>
      </div>

      {/* ERP Table */}
      <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
        <table className="mzsoft-table">
          <thead>
            <tr>
              <th>Désignation Client / Société</th>
              <th>Code Client</th>
              <th>Contact (Mobile/Email)</th>
              <th className="text-right">Total Achats</th>
              <th className="text-right">Dette Actuelle</th>
              <th className="w-20 text-center">...</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={client.id} className="hover:bg-blue-50 transition-colors">
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 font-bold text-[10px]">
                      {client.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm leading-tight">
                        {client.name}
                        {client.company && <span className="ml-2 text-blue-600">({client.company})</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase italic">
                         {client.address || 'Aucune adresse enregistrée'}
                      </p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 px-2 py-0.5 border border-slate-100">
                    {client.clientCode || '-'}
                  </span>
                </td>
                <td>
                   <div className="flex flex-col text-xs">
                      <span className="font-bold flex items-center gap-1"><Phone size={10} className="text-blue-500" /> {client.phone || '-'}</span>
                      <span className="text-slate-400 italic flex items-center gap-1"><Mail size={10} /> {client.email || '-'}</span>
                   </div>
                </td>
                <td className="text-right font-black text-slate-900">
                  {formatCurrency(client.totalSpent || 0)}
                </td>
                <td className={cn("text-right font-black", (client.totalDebt || 0) > 0 ? "text-rose-600" : "text-emerald-600")}>
                  {formatCurrency(client.totalDebt || 0)}
                </td>
                <td className="text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => handleEdit(client)} className="p-1.5 text-slate-400 hover:text-blue-600 border border-transparent hover:border-blue-200 hover:bg-blue-50">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(client.id)} className="p-1.5 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200 hover:bg-rose-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-20 text-slate-400 italic text-sm">Aucun client répertorié</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingCustomer ? "Modification Client" : "Nouvau Compte Client"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Raison Sociale / Société</label>
                <input {...register('company')} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Ex: SARL MZ SOFT" />
             </div>
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Nom Complet du Contact *</label>
                <input {...register('name', { required: true })} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
             <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Identifiant Client</label>
                <input {...register('clientCode')} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-mono text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="CLI-0000" />
             </div>
             <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Mobile</label>
                <input {...register('phone')} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Email de Contact</label>
                <input type="email" {...register('email')} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Adresse de Facturation</label>
                <textarea {...register('address')} rows={3} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 text-sm outline-none focus:ring-1 focus:ring-blue-500 italic resize-none" />
             </div>
          </div>
          <div className="pt-4 flex gap-2">
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 h-12 uppercase font-black tracking-widest text-xs">
              <UserCheck size={18} className="mr-2" /> Enregistrer le client
            </Button>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)} className="h-12 uppercase font-black tracking-widest text-xs">Annuler</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
