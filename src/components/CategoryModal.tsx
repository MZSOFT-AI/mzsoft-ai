import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { dbService } from '../firebase/db';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import Modal from './ui/Modal';
import { Button } from './ui/Button';
import { Trash2, Plus, Tag } from 'lucide-react';

import { useNotification } from '../context/NotificationContext';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CategoryModal: React.FC<CategoryModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useNotification();
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const unsub = onSnapshot(
      query(collection(db, 'categories'), orderBy('name')),
      (snapshot) => {
        setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'categories')
    );

    return () => unsub();
  }, [isOpen]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await dbService.addDocument('categories', {
        name: newCategory.trim(),
        createdAt: new Date()
      });
      showToast('Catégorie ajoutée', 'success');
      setNewCategory('');
    } catch (error) {
      showToast('Erreur lors de l\'ajout', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('Supprimer cette catégorie ? Cela n\'affectera pas les produits déjà créés.')) return;

    try {
      await dbService.deleteDocument('categories', id);
      showToast('Catégorie supprimée', 'success');
    } catch (error) {
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gérer les Catégories" size="md">
      <div className="space-y-6">
        <form onSubmit={handleAddCategory} className="flex gap-2">
          <input
            type="text"
            placeholder="Nouvelle catégorie..."
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
          />
          <Button type="submit" disabled={!newCategory.trim()} isLoading={isSubmitting}>
            <Plus size={18} />
          </Button>
        </form>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-indigo-500">
                  <Tag size={16} />
                </div>
                <span className="font-medium dark:text-white">{cat.name}</span>
              </div>
              <button 
                onClick={() => handleDeleteCategory(cat.id)}
                className="p-2 text-rose-400 hover:text-rose-600 transition-colors border border-transparent hover:border-rose-100 hover:bg-rose-50 rounded-lg"
                title="Supprimer"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-center py-8 text-slate-400 italic text-sm">Aucune catégorie créée</p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default CategoryModal;
