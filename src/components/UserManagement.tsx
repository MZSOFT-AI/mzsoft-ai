import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc, 
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { UserData, UserPermissions } from '../types';
import { cn } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { 
  User as UserIcon, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Trash2, 
  Search,
  MoreVertical,
  Mail,
  Calendar
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'vendeur' | 'manager'>('vendeur');
  const [isInviting, setIsInviting] = useState(false);
  
  const [permissions, setPermissions] = useState<UserData['permissions']>({
    canManageStock: false,
    canDeleteProducts: false,
    canSell: true,
    canProcessReturns: false,
    canPerformInventory: false,
    canManageExpenses: false,
    canViewReports: false
  });

  const { showToast } = useNotification();

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserData[];
      setUsers(usersData);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsubscribe();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName) return;

    if (editingUser) {
      handleUpdateUser();
      return;
    }

    setIsInviting(true);
    try {
      const emailId = inviteEmail ? inviteEmail.toLowerCase().trim() : `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      const userData: any = {
        email: inviteEmail || null,
        username: inviteUsername || null,
        displayName: inviteName,
        role: inviteRole,
        createdAt: serverTimestamp(),
        isPreAuthorized: !!inviteEmail,
        isLocalOnly: !inviteEmail,
        permissions: permissions
      };

      if (!inviteEmail && invitePassword) {
        userData.localPassword = invitePassword; 
      }

      await setDoc(doc(db, 'users', emailId), userData);
      
      showToast(inviteEmail ? 'Utilisateur pré-autorisé avec succès' : 'Utilisateur créé avec succès', 'success');
      resetForm();
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de la création', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const resetForm = () => {
    setInviteEmail('');
    setInviteName('');
    setInviteUsername('');
    setInvitePassword('');
    setInviteRole('vendeur');
    setPermissions({
      canManageStock: false,
      canDeleteProducts: false,
      canSell: true,
      canProcessReturns: false,
      canPerformInventory: false,
      canManageExpenses: false,
      canViewReports: false
    });
    setShowInviteForm(false);
    setEditingUser(null);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      await updateDoc(doc(db, 'users', editingUser.id), {
        role: inviteRole,
        permissions: permissions,
        displayName: inviteName,
        username: inviteUsername,
        updatedAt: serverTimestamp()
      });
      showToast('Utilisateur mis à jour', 'success');
      resetForm();
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de la mise à jour', 'error');
    }
  };

  const startEdit = (user: UserData) => {
    setEditingUser(user);
    setInviteName(user.displayName);
    setInviteEmail(user.email || '');
    setInviteUsername(user.username || '');
    setInviteRole(user.role as any);
    setPermissions(user.permissions || {
      canManageStock: user.role === 'admin' || user.role === 'manager',
      canDeleteProducts: user.role === 'admin',
      canSell: true,
      canProcessReturns: user.role === 'admin' || user.role === 'manager',
      canPerformInventory: user.role === 'admin' || user.role === 'manager',
      canManageExpenses: user.role === 'admin' || user.role === 'manager',
      canViewReports: user.role === 'admin' || user.role === 'manager'
    });
    setShowInviteForm(true);
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setPermissions(prev => prev ? ({
      ...prev,
      [key]: !prev[key]
    }) : {
      canManageStock: false,
      canDeleteProducts: false,
      canSell: true,
      canProcessReturns: false,
      canPerformInventory: false,
      canManageExpenses: false,
      [key]: true
    });
  };

  const handleUpdateRole = async (userId: string, newRole: 'admin' | 'vendeur' | 'manager') => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
        updatedAt: new Date()
      });
      showToast('Rôle mis à jour avec succès', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de la mise à jour du rôle', 'error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;

    try {
      await deleteDoc(doc(db, 'users', userId));
      showToast('Utilisateur supprimé', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  const filteredUsers = users.filter(user => 
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-rose-100 text-rose-600 border-rose-200 uppercase tracking-widest text-[10px] items-center gap-1 font-black">
          <ShieldAlert size={10} /> Administrateur
        </Badge>;
      case 'manager':
        return <Badge className="bg-amber-100 text-amber-600 border-amber-200 uppercase tracking-widest text-[10px] items-center gap-1 font-black">
          <ShieldCheck size={10} /> Manager
        </Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-600 border-blue-200 uppercase tracking-widest text-[10px] items-center gap-1 font-black">
          <UserIcon size={10} /> Vendeur
        </Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button 
          onClick={() => {
            if (showInviteForm) resetForm();
            else setShowInviteForm(true);
          }} 
          className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] tracking-widest h-12 px-8"
        >
          {showInviteForm ? 'Annuler' : 'Ajouter un utilisateur'}
        </Button>
      </div>

      {showInviteForm && (
        <Card className="border-blue-200 bg-blue-50/30 overflow-hidden shadow-2xl">
          <CardHeader className="border-b border-blue-100 flex flex-row justify-between items-center bg-white p-4">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-blue-600 italic">
              {editingUser ? 'Modifier le Profil' : 'Créer un Compte'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 bg-blue-50/10">
            <form onSubmit={handleInvite} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Nom & Prénom</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Jean Dupont"
                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Identifiant (Username)</label>
                  <input
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="jdupont"
                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                  />
                </div>
                {!editingUser && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Email Google (Optionnel)</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="exemple@gmail.com"
                      className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Rôle</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                  >
                    <option value="vendeur">Vendeur</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
                {!inviteEmail && !editingUser && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Mot de passe initial</label>
                    <input
                      type="password"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                      placeholder="••••••••"
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-blue-100 pt-6">
                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Autorisations Spécifiques</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { key: 'canManageStock', label: 'Gérer le Stock (Achat)' },
                    { key: 'canDeleteProducts', label: 'Supprimer des Produits' },
                    { key: 'canSell', label: 'Vendre (POS)' },
                    { key: 'canProcessReturns', label: 'Effectuer des Retours' },
                    { key: 'canPerformInventory', label: 'Faire des Inventaires' },
                    { key: 'canManageExpenses', label: 'Gérer les Dépenses' },
                    { key: 'canViewReports', label: 'Études Complètes' }
                  ].map((perm) => (
                    <label key={perm.key} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-blue-500 transition-colors">
                      <input
                        type="checkbox"
                        checked={(permissions as any)?.[perm.key]}
                        onChange={() => togglePermission(perm.key as any)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={resetForm}
                  className="h-11 font-black uppercase text-xs tracking-widest border-slate-200"
                  disabled={isInviting}
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={isInviting} 
                  className="bg-blue-600 hover:bg-blue-700 h-11 font-black uppercase text-xs tracking-widest px-10"
                >
                  {isInviting ? 'Enregistrement...' : editingUser ? 'Actualiser' : 'Créer l\'utilisateur'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-6">
          <CardTitle className="flex items-center gap-2">
            <UserIcon size={20} className="text-blue-600" />
            Gestion des Utilisateurs
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Utilisateur</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Accès / Droits</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rôle</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 animate-pulse font-black uppercase tracking-widest text-xs">
                      Chargement des utilisateurs...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium italic">Aucun utilisateur trouvé</td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-slate-700 dark:text-white uppercase overflow-hidden border",
                             user.role === 'admin' ? "bg-rose-50 border-rose-100" : "bg-slate-100 border-slate-200"
                          )}>
                            {user.photoURL ? (
                              <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                            ) : (
                              <span>{user.displayName?.charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white leading-none mb-1 flex items-center gap-2">
                              {user.displayName}
                              {user.isLocalOnly && (
                                <span className="text-[8px] bg-amber-50 text-amber-500 px-1 py-0.5 rounded font-black border border-amber-100 uppercase tracking-tighter">LOCAL</span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                              {user.username ? `@${user.username}` : (user.email ? user.email : 'Sans identifiant')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                           {(user.permissions?.canManageStock || user.role === 'admin') && <Badge className="bg-slate-100 text-slate-500 text-[8px] font-black uppercase tracking-tighter px-1">STOCK</Badge>}
                           {(user.permissions?.canSell || user.role === 'admin') && <Badge className="bg-blue-50 text-blue-500 text-[8px] font-black uppercase tracking-tighter px-1">VENTE</Badge>}
                           {(user.permissions?.canProcessReturns || user.role === 'admin') && <Badge className="bg-orange-50 text-orange-500 text-[8px] font-black uppercase tracking-tighter px-1">RETOUR</Badge>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getRoleBadge(user.role || 'vendeur')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-100 group-hover:opacity-100 transition-opacity">
                           <Button 
                             variant="outline" 
                             size="sm" 
                             onClick={() => startEdit(user)}
                             className="text-[10px] font-black uppercase h-8 border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                           >
                             Modifier
                           </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 h-8 w-8"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      <div className="bg-blue-600 rounded-2xl p-6 text-white overflow-hidden relative shadow-lg shadow-blue-200">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Shield size={100} />
        </div>
        <div className="relative z-10">
          <h3 className="text-lg font-black uppercase tracking-tight mb-2 italic">Note sur la création de comptes</h3>
          <p className="text-sm text-blue-100 leading-relaxed font-medium">
            Dans ce système, les comptes sont créés automatiquement lorsqu'un utilisateur se connecte pour la première fois via son compte Google. 
            Une fois connecté, vous pourrez voir le nouvel utilisateur dans cette liste et lui assigner le rôle approprié (Administrateur, Manager ou Vendeur).
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
