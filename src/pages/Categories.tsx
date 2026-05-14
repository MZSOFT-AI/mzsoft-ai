import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { dbService } from '../firebase/db';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { Button } from '../components/ui/Button';
import { Plus, Edit2, Trash2, Tags as TagIcon, PackageCheck } from 'lucide-react';
import Modal from '../components/ui/Modal';
import { useForm } from 'react-hook-form';

import { useNotification } from '../context/NotificationContext';

export default function Categories() {
  const { showToast } = useNotification();
  const [categories, setCategories] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const { register, handleSubmit, reset } = useForm();
  
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'categories'), orderBy('name')), 
      (snapshot) => {
        setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'categories');
      }
    );
  }, []);

  const onSubmit = async (data: any) => {
    try {
      if (editingCategory) {
        await dbService.updateDocument('categories', editingCategory.id, data);
        showToast('Catégorie mise à jour', 'success');
      } else {
        await dbService.addDocument('categories', {
          ...data,
          productCount: 0
        });
        showToast('Catégorie créée', 'success');
      }
      setIsModalOpen(false);
      setEditingCategory(null);
      reset();
    } catch (error) {
      showToast('Erreur lors de l\'enregistrement', 'error');
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    reset(category);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Voulez-vous vraiment supprimer cette catégorie ?')) {
      try {
        await dbService.deleteDocument('categories', id);
        showToast('Catégorie supprimée', 'success');
      } catch (error) {
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Classification Articles</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Gestion des familles de produits</p>
        </div>
        <Button size="sm" className="h-9 text-xs font-bold uppercase bg-blue-600 hover:bg-blue-700" onClick={() => { setEditingCategory(null); reset({}); setIsModalOpen(true); }}>
          <Plus size={16} className="mr-2" /> Nouvelle Famille
        </Button>
      </div>

      {/* ERP Grid of Tables (Simulated as compact list) */}
      <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
        <table className="dolisoft-table">
          <thead>
            <tr>
              <th>Désignation Famille</th>
              <th>Description / Note interne</th>
              <th className="text-center">Volume Articles</th>
              <th className="w-20 text-center">...</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="hover:bg-blue-50 transition-colors">
                <td className="font-bold text-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-100 border border-slate-200 rounded text-slate-400">
                      <TagIcon size={14} />
                    </div>
                    {cat.name}
                  </div>
                </td>
                <td className="text-xs text-slate-400 italic">
                  {cat.description || 'N/A'}
                </td>
                <td className="text-center">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100">
                    {cat.productCount || 0} ITEMS
                  </span>
                </td>
                <td className="text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => handleEdit(cat)} className="p-1.5 text-slate-400 hover:text-blue-600 border border-transparent hover:border-blue-200 hover:bg-blue-50">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200 hover:bg-rose-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-20 text-slate-400 italic text-sm">Aucune famille définie</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingCategory ? "Modification Famille" : "Création Nouvelle Famille"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
             <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Libellé de la Famille *</label>
                <input {...register('name', { required: true })} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Ex: Consommables, Accessoires..." />
             </div>
             <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Description Technique</label>
                <textarea {...register('description')} rows={4} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 text-sm outline-none focus:ring-1 focus:ring-blue-500 italic resize-none" placeholder="Notes additionnelles..." />
             </div>
          </div>
          <div className="pt-4 flex gap-2">
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 h-12 uppercase font-black tracking-widest text-xs">
              <PackageCheck size={18} className="mr-2" /> Enregistrer la Catégorie
            </Button>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)} className="h-12 uppercase font-black tracking-widest text-xs">Annuler</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
