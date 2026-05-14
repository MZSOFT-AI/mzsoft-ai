import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { dbService } from '../firebase/db';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Button } from '../components/ui/Button';
import { Plus, Search, Trash2, ShieldAlert } from 'lucide-react';
import Modal from '../components/ui/Modal';
import { useForm } from 'react-hook-form';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';

import { useNotification } from '../context/NotificationContext';

export default function Expenses() {
  const { showToast } = useNotification();
  const { user, hasPermission } = useAuth();
  const { activeSession } = useSession();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const canManage = hasPermission('canManageExpenses');

  if (!canManage) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white p-12 text-center border border-slate-200">
           <ShieldAlert size={48} className="text-rose-500 mx-auto mb-4" />
           <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Accès Refusé</h2>
           <p className="text-sm text-slate-500 mt-2">Vous n'avez pas l'autorisation de gérer ou visualiser les dépenses.</p>
           <Button onClick={() => window.history.back()} className="mt-6 bg-slate-800">Retour</Button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'expenses'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'expenses')
    );
  }, []);

  const onSubmit = async (data: any) => {
    try {
      await dbService.addDocument('expenses', {
        ...data,
        amount: Number(data.amount),
        userId: activeSession?.userId || user?.uid,
        userName: activeSession?.userName || user?.displayName || 'Admin',
        actorId: user?.uid,
        createdAt: serverTimestamp(),
      });
      showToast('Dépense enregistrée', 'success');
      setIsModalOpen(false);
      reset();
    } catch (error) {
      showToast('Erreur lors de l\'enregistrement', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Supprimer cette dépense ?')) {
      try {
        await dbService.deleteDocument('expenses', id);
        showToast('Dépense supprimée', 'success');
      } catch (error) {
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  };

  const filtered = expenses.filter(e => 
    e.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalExpenses = filtered.reduce((acc, e) => acc + (e.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-500 flex flex-col items-center justify-center border border-rose-100">
             <span className="text-[10px] font-black leading-none">TOTAL</span>
             <span className="text-sm font-black"> {formatCurrency(totalExpenses).split(' ')[0]}</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Journal des Dépenses</h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Gestion des frais fixes & variables</p>
          </div>
        </div>
        <Button size="sm" className="h-9 text-xs font-bold uppercase bg-rose-600 hover:bg-rose-700" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} className="mr-2" /> Déclarer un Frais
        </Button>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher par raison, catégorie..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
      </div>

      {/* ERP Table */}
      <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
        <table className="dolisoft-table">
          <thead>
            <tr>
              <th>Date de Saisie</th>
              <th>Catégorie de Charge</th>
              <th>Motif / Libellé de la Dépense</th>
              <th>Opérateur</th>
              <th className="text-right">Montant (DA)</th>
              <th className="w-20 text-center">...</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((expense) => (
              <tr key={expense.id} className="hover:bg-rose-50 transition-colors">
                <td className="text-xs font-bold text-slate-500">
                  {expense.createdAt ? format(expense.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : '-'}
                </td>
                <td>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200">
                    {expense.category}
                  </span>
                </td>
                <td className="text-xs font-black text-slate-800">
                  {expense.reason}
                </td>
                <td className="text-[10px] font-bold text-slate-400 uppercase italic">
                  {expense.userName || 'Admin'}
                </td>
                <td className="text-right font-black text-rose-600 text-sm">
                  {formatCurrency(expense.amount)}
                </td>
                <td className="text-center">
                  <button onClick={() => handleDelete(expense.id)} className="p-1.5 text-slate-300 hover:text-rose-600 border border-transparent hover:border-rose-100 hover:bg-rose-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-20 text-slate-400 italic text-sm">Aucune dépense enregistrée</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Saisie de Nouvelle Charge">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Catégorie de Frais</label>
                <select {...register('category', { required: true })} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="LOYER">LOYER</option>
                  <option value="ÉLECTRICITÉ">ÉLECTRICITÉ</option>
                  <option value="INTERNET/TÉLÉPHONE">INTERNET/TÉLÉPHONE</option>
                  <option value="SALAIRES">SALAIRES</option>
                  <option value="TRANSPORT">TRANSPORT</option>
                  <option value="MARKETING/PUB">MARKETING/PUB</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="FOURNITURES">FOURNITURES</option>
                  <option value="AUTRE">AUTRE</option>
                </select>
             </div>
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Motif Détaillé *</label>
                <input {...register('reason', { required: true })} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Ex: Facture Sonelgaz Mars 2024" />
             </div>
             <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Montant Décaissé (DA) *</label>
                <input type="number" {...register('amount', { required: true })} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-black text-xl outline-none focus:ring-1 focus:ring-rose-500 text-rose-600" defaultValue={0} />
             </div>
          </div>
          <div className="pt-4 flex gap-2">
            <Button type="submit" isLoading={isSubmitting} className="flex-1 bg-rose-600 hover:bg-rose-700 h-12 uppercase font-black tracking-widest text-xs">
              <ShieldAlert size={18} className="mr-2" /> Valider le Décaissement
            </Button>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)} className="h-12 uppercase font-black tracking-widest text-xs">Annuler</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
