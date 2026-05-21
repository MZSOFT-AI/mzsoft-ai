import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  onSnapshot,
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  orderBy,
  where,
  writeBatch,
  addDoc
} from 'firebase/firestore';
import { db, createSecondaryAuthUser, updateSecondaryAuthUserPassword } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { UserData, UserPermissions } from '../types';
import { 
  UserPlus, 
  Edit2, 
  Trash2, 
  Shield, 
  User as UserIcon, 
  Mail, 
  Key, 
  Save, 
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  Users as UsersIcon,
  ShieldCheck,
  Lock,
  MoreVertical,
  Ban,
  UserCheck
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { useNotification } from '../context/NotificationContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeStringify, cleanObject } from '../lib/utils';
import { notificationService } from '../services/notificationService';

const DEFAULT_PERMISSIONS: UserPermissions = {
  canManageStock: true,
  canDeleteProducts: true,
  canSell: true,
  canProcessReturns: true,
  canPerformInventory: true,
  canManageExpenses: true,
  canViewReports: true,
  canManageUsers: false
};

const Users: React.FC = () => {
  const { userData: currentUser, isAdmin, isSuperAdmin, hasPermission } = useAuth();
  const { showToast } = useNotification();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Permissions check
  const canManageUsers = true;

  // Form State
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    displayName: '',
    localPassword: '',
    role: 'admin' as UserData['role'],
    isLocalOnly: true,
    status: 'active' as UserData['status'],
    permissions: { ...DEFAULT_PERMISSIONS }
  });

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetchedUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
      setUsers(fetchedUsers);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", safeStringify(error));
      showToast("Erreur lors de la récupération des utilisateurs", "error");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getPresetPermissions = (role: UserData['role']): UserPermissions => {
    switch (role) {
      case 'superadmin':
        return { ...DEFAULT_PERMISSIONS, canManageUsers: true };
      case 'admin':
        return { ...DEFAULT_PERMISSIONS, canManageUsers: false };
      case 'manager':
        return {
          canManageStock: true,
          canDeleteProducts: false,
          canSell: true,
          canProcessReturns: true,
          canPerformInventory: true,
          canManageExpenses: true,
          canViewReports: true,
          canManageUsers: false
        };
      case 'vendeur':
        return {
          canManageStock: false,
          canDeleteProducts: false,
          canSell: true,
          canProcessReturns: false,
          canPerformInventory: false,
          canManageExpenses: false,
          canViewReports: false,
          canManageUsers: false
        };
      default:
        return { ...DEFAULT_PERMISSIONS, canManageUsers: false };
    }
  };

  const handleOpenModal = (user?: UserData) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username || '',
        email: user.email || '',
        displayName: user.displayName,
        localPassword: user.localPassword || '',
        role: user.role,
        isLocalOnly: !!user.isLocalOnly,
        status: user.status || 'active',
        permissions: user.permissions ? { ...user.permissions } : getPresetPermissions(user.role)
      });
    } else {
      setEditingUser(null);
      const initialRole = 'vendeur' as UserData['role'];
      setFormData({
        username: '',
        email: '',
        displayName: '',
        localPassword: '',
        role: initialRole,
        isLocalOnly: true,
        status: 'active',
        permissions: getPresetPermissions(initialRole)
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingUser) {
        const userRef = doc(db, 'users', editingUser.id);
        const updatedData: any = {
          displayName: formData.displayName,
          role: formData.role,
          status: formData.status,
          permissions: formData.permissions,
          updatedAt: serverTimestamp()
        };

        if (formData.isLocalOnly) {
          updatedData.username = formData.username;
          if (formData.localPassword) {
            updatedData.localPassword = formData.localPassword;
          }
        } else {
          updatedData.email = formData.email.toLowerCase().trim();
          if (formData.localPassword) {
            updatedData.localPassword = formData.localPassword;
          }
        }

        // Try to update Firebase Auth password if changed
        if (formData.localPassword && formData.localPassword !== editingUser.localPassword) {
          if (formData.localPassword.length < 6) {
            showToast("Le mot de passe doit contenir au moins 6 caractères", "error");
            setLoading(false);
            return;
          }
          try {
            const userEmail = editingUser.email || `${editingUser.username}@mzsoft.local`;
            await updateSecondaryAuthUserPassword(userEmail, editingUser.localPassword || 'mzsoft123', formData.localPassword);
          } catch (passErr: any) {
            console.warn("Could not sync password update to Firebase Auth:", passErr);
          }
        }

        await updateDoc(userRef, cleanObject(updatedData));
        
        // Notification
        await notificationService.createNotification({
          type: 'security',
          title: 'Utilisateur Mis à Jour',
          message: `Le compte de "${formData.displayName}" a été modifié par ${currentUser?.displayName || 'Admin'}.`,
          priority: 'medium',
          triggeredBy: currentUser?.uid || currentUser?.id,
          triggeredByName: currentUser?.displayName || 'Admin',
          metadata: {
            entityId: editingUser.id,
            entityType: 'user',
            targetUserName: formData.displayName,
            role: formData.role
          }
        });

        // Log update
        await addDoc(collection(db, 'system_logs'), {
          type: 'user_updated',
          userId: currentUser?.uid || currentUser?.id,
          userName: currentUser?.displayName || 'Admin',
          timestamp: serverTimestamp(),
          details: `Utilisateur ${formData.displayName} (${formData.role}) mis à jour`,
          targetUserId: editingUser.id
        });

        showToast("Utilisateur mis à jour", "success");
      } else {
        // Enforce password requirements for new accounts
        if (!formData.localPassword || formData.localPassword.length < 6) {
          showToast("Le mot de passe doit contenir au moins 6 caractères", "error");
          setLoading(false);
          return;
        }

        // Determine login email
        let targetEmail = formData.email ? formData.email.toLowerCase().trim() : '';
        if (formData.isLocalOnly) {
          if (!formData.username) {
            showToast("Veuillez saisir un identifiant", "error");
            setLoading(false);
            return;
          }
          // Check username unique
          const q = query(collection(db, 'users'), where('username', '==', formData.username.trim()));
          const snap = await getDocs(q);
          if (!snap.empty) {
            showToast("Cet identifiant est déjà utilisé", "error");
            setLoading(false);
            return;
          }
          targetEmail = `${formData.username.trim().toLowerCase()}@mzsoft.local`;
        } else {
          if (!targetEmail) {
            showToast("Veuillez saisir une adresse email", "error");
            setLoading(false);
            return;
          }
          // Check email unique
          const q = query(collection(db, 'users'), where('email', '==', targetEmail));
          const snap = await getDocs(q);
          if (!snap.empty) {
            showToast("Cette adresse email est déjà enregistrée", "error");
            setLoading(false);
            return;
          }
        }

        // 1. Create the user in Firebase Auth and recover their authentic uid
        const realPassword = formData.localPassword;
        const authUid = await createSecondaryAuthUser(targetEmail, realPassword);

        // 2. Put their record in the uid-keyed collection path
        const newUser = cleanObject({
          id: authUid,
          uid: authUid,
          email: targetEmail,
          username: formData.isLocalOnly ? formData.username.trim() : null,
          localPassword: realPassword,
          displayName: formData.displayName,
          role: formData.role,
          isLocalOnly: formData.isLocalOnly,
          status: 'active',
          permissions: formData.permissions,
          createdAt: serverTimestamp()
        });

        await setDoc(doc(db, 'users', authUid), newUser);

        // Notification
        await notificationService.createNotification({
          type: 'user',
          title: 'Nouveau Compte Créé',
          message: `Un nouvel utilisateur "${formData.displayName}" (${formData.role}) a été créé par ${currentUser?.displayName || 'Admin'}.`,
          priority: 'medium',
          triggeredBy: currentUser?.uid || currentUser?.id,
          triggeredByName: currentUser?.displayName || 'Admin',
          metadata: {
            entityId: authUid,
            entityType: 'user',
            newUserName: formData.displayName,
            role: formData.role
          }
        });

        // Log creation
        await addDoc(collection(db, 'system_logs'), {
          type: 'user_created',
          userId: currentUser?.uid || currentUser?.id,
          userName: currentUser?.displayName || 'Admin',
          timestamp: serverTimestamp(),
          details: `Nouvel utilisateur créé: ${formData.displayName} (${formData.role})`,
          targetUserId: authUid
        });

        showToast("Utilisateur créé avec succès", "success");
      }
      setIsModalOpen(false);
    } catch (error: any) {
      console.error(safeStringify(error));
      showToast(error.message || "Erreur lors de l'enregistrement", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete || !currentUser) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      
      // 1. Mark as inactive (Primary safety)
      const userRef = doc(db, 'users', userToDelete.id);
      
      // If it's a local user, we can fully delete. 
      // If it's a social user, we mark as inactive to prevent further access 
      // and keep an audit trail of their linked UID if needed.
      if (userToDelete.isLocalOnly) {
        batch.delete(userRef);
      } else {
        batch.update(userRef, { 
          status: 'inactive', 
          updatedAt: serverTimestamp(),
          deletedAt: serverTimestamp(),
          deletedBy: currentUser.uid || currentUser.id
        });
      }

      // 2. Close active sessions for this user
      const qSessions = query(
        collection(db, 'daily_closings'), 
        where('userId', '==', userToDelete.id),
        where('status', '==', 'open')
      );
      const sessionSnap = await getDocs(qSessions);
      sessionSnap.forEach((sesDoc) => {
        batch.update(doc(db, 'daily_closings', sesDoc.id), {
          status: 'closed',
          endTime: serverTimestamp(),
          closingNote: 'Clôturé automatiquement suite à la suppression de l\'utilisateur'
        });
      });

      // 3. Log the action
      const logRef = doc(collection(db, 'system_logs'));
      batch.set(logRef, {
        type: 'user_deleted',
        userId: currentUser.uid || currentUser.id,
        userName: currentUser.displayName,
        timestamp: serverTimestamp(),
        details: `Utilisateur ${userToDelete.displayName} supprimé/désactivé`,
        targetUserId: userToDelete.id
      });

      await batch.commit();
      
      // 4. Notification
      await notificationService.createNotification({
        type: 'deletion',
        title: userToDelete.isLocalOnly ? 'Utilisateur Supprimé' : 'Accès Révoqué',
        message: `Le compte de "${userToDelete.displayName}" a été ${userToDelete.isLocalOnly ? 'définitivement supprimé' : 'désactivé'} par ${currentUser.displayName || 'Admin'}.`,
        priority: 'high',
        triggeredBy: currentUser.uid || currentUser.id,
        triggeredByName: currentUser.displayName || 'Admin',
        metadata: {
          entityId: userToDelete.id,
          entityType: 'user',
          targetUserName: userToDelete.displayName
        }
      });

      showToast("Utilisateur supprimé et sessions clôturées", "success");
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de la suppression", "error");
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-2">
            <ShieldCheck className="text-blue-600" size={28} />
            Gestion des Utilisateurs
          </h1>
          <p className="text-slate-500 text-sm font-medium">Contrôlez les accès et les permissions de votre équipe</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-2 px-6">
          <UserPlus size={18} />
          Nouvel Utilisateur
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
        <input 
          type="text" 
          placeholder="Rechercher par nom, email ou identifiant..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-14 pl-12 pr-4 bg-white border-2 border-slate-100 rounded-xl text-slate-700 font-bold focus:border-blue-500 outline-none transition-all shadow-sm"
        />
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="bg-white border-2 border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 -mr-12 -mt-12 rounded-full transition-transform group-hover:scale-110" />
              
              <div className="relative flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 border-2 border-white shadow-inner">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <UserIcon size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 tracking-tight">{user.displayName}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
                        user.role === 'superadmin' ? "bg-purple-100 text-purple-600" :
                        user.role === 'admin' ? "bg-red-100 text-red-600" :
                        user.role === 'manager' ? "bg-blue-100 text-blue-600" :
                        "bg-slate-100 text-slate-600"
                      )}>
                        {user.role}
                      </span>
                      {user.status === 'inactive' && (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                          <Ban size={8} /> Inactif
                        </span>
                      )}
                      {user.isLocalOnly && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded-md text-[10px] font-black uppercase tracking-wider">
                          Local
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {canManageUsers && (
                    <>
                      <button 
                        onClick={() => handleOpenModal(user)}
                        className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
                        disabled={user.role === 'superadmin' && !isSuperAdmin}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => { setUserToDelete(user); setIsDeleteModalOpen(true); }}
                        className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                        disabled={user.id === currentUser?.id || (user.role === 'superadmin' && !isSuperAdmin)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3 relative">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Mail size={14} className="shrink-0" />
                  <span className="truncate">{user.email || user.username || 'Pas d\'email'}</span>
                </div>
                
                <div className="pt-3 border-t border-slate-50 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <CheckCircle2 size={12} className={user.permissions?.canSell ? "text-emerald-500" : "text-slate-200"} />
                    Ventes
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <CheckCircle2 size={12} className={user.permissions?.canManageStock ? "text-emerald-500" : "text-slate-200"} />
                    Stock
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <CheckCircle2 size={12} className={user.permissions?.canViewReports ? "text-emerald-500" : "text-slate-200"} />
                    Rapports
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      {loading && filteredUsers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Chargement des utilisateurs...</p>
        </div>
      )}

      {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <div 
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-2">
                  {editingUser ? <Edit2 size={20} className="text-blue-600" /> : <UserPlus size={20} className="text-blue-600" />}
                  {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel Utilisateur'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-8">
                {/* General Info Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <UserIcon size={16} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Informations Générales</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Nom Complet</label>
                      <input 
                        type="text" 
                        value={formData.displayName}
                        onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                        className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none transition-all"
                        required
                        placeholder="Ex: Mohamed Amine"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Rôle Système</label>
                      <select 
                        value={formData.role}
                        onChange={(e) => {
                          const newRole = e.target.value as UserData['role'];
                          setFormData({
                            ...formData, 
                            role: newRole,
                            permissions: getPresetPermissions(newRole)
                          });
                        }}
                        className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none transition-all"
                        disabled={!isSuperAdmin && formData.role === 'superadmin'}
                      >
                        <option value="vendeur">Vendeur (Caisse)</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Administrateur</option>
                        {isSuperAdmin && <option value="superadmin">Super Admin</option>}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Statut Compte</label>
                      <select 
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value as UserData['status']})}
                        className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none transition-all"
                      >
                        <option value="active">Actif</option>
                        <option value="inactive">Inactif (Bloqué)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 py-2">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, isLocalOnly: !formData.isLocalOnly})}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        formData.isLocalOnly ? "bg-amber-100 text-amber-600 ring-2 ring-amber-200" : "bg-slate-100 text-slate-400"
                      )}
                    >
                      Connexion Locale
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, isLocalOnly: !formData.isLocalOnly})}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        !formData.isLocalOnly ? "bg-blue-100 text-blue-600 ring-2 ring-blue-200" : "bg-slate-100 text-slate-400"
                      )}
                    >
                      Connexion Google
                    </button>
                  </div>

                  {formData.isLocalOnly ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-amber-700 ml-1">Identifiant</label>
                        <input 
                          type="text" 
                          value={formData.username}
                          onChange={(e) => setFormData({...formData, username: e.target.value})}
                          className="w-full h-11 px-4 bg-white border border-amber-200 rounded-lg text-sm font-bold focus:border-amber-500 outline-none transition-all"
                          required={formData.isLocalOnly}
                          disabled={!!editingUser}
                          placeholder="p.ex. vendeur_01"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-amber-700 ml-1">
                          {editingUser ? 'Nouveau Mot de Passe (Optionnel)' : 'Mot de Passe'}
                        </label>
                        <input 
                          type="password" 
                          value={formData.localPassword}
                          onChange={(e) => setFormData({...formData, localPassword: e.target.value})}
                          className="w-full h-11 px-4 bg-white border border-amber-200 rounded-lg text-sm font-bold focus:border-amber-500 outline-none transition-all"
                          required={!editingUser && formData.isLocalOnly}
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-blue-700 ml-1">Adresse Email</label>
                          <input 
                            type="email" 
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            className="w-full h-11 px-4 bg-white border border-blue-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none transition-all"
                            required={!formData.isLocalOnly}
                            placeholder="exemple@gmail.com"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-blue-700 ml-1">
                            {editingUser ? 'Nouveau Mot de Passe (Optionnel)' : 'Mot de Passe (Optionnel)'}
                          </label>
                          <input 
                            type="password" 
                            value={formData.localPassword}
                            onChange={(e) => setFormData({...formData, localPassword: e.target.value})}
                            className="w-full h-11 px-4 bg-white border border-blue-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none transition-all"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                      <p className="text-[9px] text-blue-400 font-bold uppercase mt-1">L'utilisateur pourra se connecter via son compte Google ou directement avec son email et mot de passe.</p>
                    </div>
                  )}
                </div>

                {/* Permissions Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Shield size={16} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Permissions & Accès</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.keys(DEFAULT_PERMISSIONS).map((key) => (
                      <label 
                        key={key}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer select-none",
                          formData.permissions[key as keyof UserPermissions] 
                            ? "bg-slate-800 border-slate-800 text-white" 
                            : "bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200"
                        )}
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          {key === 'canManageStock' ? 'Gérer Stock' :
                           key === 'canDeleteProducts' ? 'Supprimer Produits' :
                           key === 'canSell' ? 'Effectuer Ventes' :
                           key === 'canProcessReturns' ? 'Gérer Retours' :
                           key === 'canPerformInventory' ? 'Faire Inventaire' :
                           key === 'canManageExpenses' ? 'Gérer Dépenses' :
                           key === 'canManageUsers' ? 'Gérer Utilisateurs' :
                           key === 'canViewReports' ? 'Voir Rapports' : key}
                        </span>
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center transition-all",
                          formData.permissions[key as keyof UserPermissions] ? "bg-blue-500 scale-110" : "bg-slate-200"
                        )}>
                          {formData.permissions[key as keyof UserPermissions] && <CheckCircle2 size={12} />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={formData.permissions[key as keyof UserPermissions]}
                          onChange={() => togglePermission(key as keyof UserPermissions)}
                          disabled={!isSuperAdmin && key === 'canManageUsers'}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Footer sticky within modal scroll */}
                <div className="pt-6 flex gap-3 sticky bottom-0 bg-white">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 h-12 rounded-xl text-slate-600 font-black uppercase text-xs tracking-widest"
                  >
                    Annuler
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-blue-200 transition-all active:scale-95"
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <Save size={18} className="mr-2" />
                        {editingUser ? 'Sauvegarder' : 'Créer l\'Utilisateur'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Désactivation / Suppression"
        message={`Êtes-vous sûr de vouloir supprimer ou désactiver ${userToDelete?.displayName} ? Ses sessions de caisse ouvertes seront automatiquement clôturées.`}
        confirmText="Confirmer la suppression"
        variant="danger"
        isLoading={loading}
      />
    </div>
  );
};

export default Users;
