import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import UserManagement from '../components/UserManagement';
import { Badge } from '../components/ui/Badge';
import { 
  User, 
  Users,
  Settings as SettingsIcon, 
  Bell, 
  Shield, 
  Database, 
  Smartphone, 
  LogOut,
  Moon,
  Sun,
  Monitor,
  CheckCircle2,
  Info,
  Trash2,
  AlertTriangle,
  RefreshCcw,
  Check,
  Building2,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Globe,
  Coins,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { collection, getDocs, writeBatch, query, limit, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { toast } from 'react-hot-toast';
import { safeStringify } from '../lib/utils';
import { useSettings } from '../context/SettingsContext';

export default function Settings() {
  const { userData, logout, isAdmin } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState('profile');

  const [businessForm, setBusinessForm] = useState(settings);
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);

  useEffect(() => {
    setBusinessForm(settings);
  }, [settings]);

  const handleUpdateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBusiness(true);
    await updateSettings(businessForm);
    setIsSavingBusiness(false);
  };
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [resetOptions, setResetOptions] = useState({
    transactions: true,
    catalog: false,
    crm: false,
  });

  const tabs = [
    { id: 'profile', label: 'Profil', icon: User },
    ...(isAdmin ? [
      { id: 'business', label: 'Identité Entreprise', icon: Building2 },
      { id: 'users', label: 'Utilisateurs', icon: Users }
    ] : []),
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Sécurité', icon: Shield },
    ...(isAdmin ? [{ id: 'system', label: 'Système', icon: Database }] : []),
    { id: 'about', label: 'À propos', icon: Info },
  ];

  const deleteCollection = async (collectionName: string) => {
    let deletedCount = 0;
    while (true) {
      const q = query(collection(db, collectionName), limit(500));
      const snapshot = await getDocs(q);
      if (snapshot.empty) break;

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      deletedCount += snapshot.size;
      console.log(`Deleted ${snapshot.size} docs from ${collectionName}`);
    }
    return deletedCount;
  };

  const handleSystemReset = async () => {
    if (resetConfirmation !== 'RESET') {
      toast.error('Veuillez saisir "RESET" pour confirmer.');
      return;
    }

    setIsResetting(true);
    try {
      const collectionsToReset = [];
      
      if (resetOptions.transactions) {
        collectionsToReset.push('sales', 'expenses', 'stock_movements', 'daily_closings', 'pending_sales', 'inventory_audits');
      }
      
      if (resetOptions.catalog) {
        collectionsToReset.push('products', 'categories');
      }

      if (resetOptions.crm) {
        collectionsToReset.push('customers', 'suppliers');
      }

      for (const col of collectionsToReset) {
        await deleteCollection(col);
      }

      toast.success('Réinitialisation terminée avec succès.');
      setIsResetModalOpen(false);
      setResetConfirmation('');
      // Reload to clear local states if necessary
      window.location.reload();
    } catch (error) {
      console.error('Error resetting system:', safeStringify(error));
      toast.error('Erreur lors de la réinitialisation.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const collectionsToExport = [
        'products', 'categories', 'suppliers', 'customers', 
        'sales', 'expenses', 'stock_movements', 'daily_closings', 
        'pending_sales', 'inventory_audits'
      ];
      
      const backupData: any = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        collections: {}
      };

      for (const colName of collectionsToExport) {
        const snap = await getDocs(collection(db, colName));
        backupData.collections[colName] = snap.docs.map(doc => ({
           id: doc.id,
           ...doc.data()
        }));
      }

      const blob = new Blob([safeStringify(backupData)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mzsoft_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Sauvegarde exportée avec succès');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Erreur lors de l\'exportation');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportRestore = async (file: File) => {
    setIsImporting(true);
    try {
      const reader = new FileReader();
      const content = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
      });

      const backupData = JSON.parse(content);
      if (!backupData.collections) {
        throw new Error('Format de fichier de sauvegarde invalide');
      }

      const collectionsToRestore = Object.keys(backupData.collections);
      
      // 1. Delete existing data for these collections
      for (const colName of collectionsToRestore) {
        await deleteCollection(colName);
      }

      // 2. Import new data
      for (const colName of collectionsToRestore) {
        const docs = backupData.collections[colName];
        if (!Array.isArray(docs)) continue;

        // Firestore batches can handle up to 500 operations
        for (let i = 0; i < docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 500);
          
          chunk.forEach((docData: any) => {
            const { id, ...data } = docData;
            // Convert strings back to Timestamps if they look like dates
            const processedData = Object.keys(data).reduce((acc: any, key) => {
               const val = data[key];
               if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                  acc[key] = new Date(val);
               } else {
                  acc[key] = val;
               }
               return acc;
            }, {});

            batch.set(doc(db, colName, id), processedData);
          });
          
          await batch.commit();
        }
      }

      toast.success('Base de données restaurée avec succès');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error('Erreur lors de la restauration: ' + error.message);
    } finally {
      setIsImporting(false);
      setIsRestoreModalOpen(false);
      setRestoreFile(null);
    }
  };

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setIsRestoreModalOpen(true);
    event.target.value = '';
  };

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Paramètres</h1>
          <p className="text-slate-500 dark:text-slate-400">Gérez vos préférences et votre compte personnel.</p>
        </div>
        <Button variant="outline" className="text-rose-500 border-rose-200 hover:bg-rose-50 dark:border-rose-900/30 dark:hover:bg-rose-900/20" onClick={logout}>
          <LogOut size={18} className="mr-2" />
          Déconnexion
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Tabs */}
        <div className="w-full lg:w-64 shrink-0">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden sticky top-8">
            <CardContent className="p-2 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === tab.id 
                    ? 'bg-slate-800 text-white shadow-md shadow-slate-200 dark:shadow-none' 
                    : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <tab.icon size={18} />
                  {tab.label}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <Card className="border-slate-200 dark:border-slate-800 h-full">
                <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                  <CardTitle>Informations du compte</CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="flex items-center gap-6 mb-8">
                    <div className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-200 text-3xl font-black border-4 border-slate-50 dark:border-slate-700">
                      {userData?.displayName?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{userData?.displayName}</h2>
                      <p className="text-slate-500 text-sm mb-2">{userData?.email}</p>
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 uppercase tracking-widest text-[10px] font-black">
                        {userData?.role || 'Utilisateur'}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nom complet</label>
                      <p className="font-bold text-slate-900 dark:text-white p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">{userData?.displayName}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Adresse Email</label>
                      <p className="font-bold text-slate-900 dark:text-white p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">{userData?.email}</p>
                    </div>
                    <div className="space-y-1 text-right md:col-span-2 pt-6">
                      <Button variant="outline">Modifier le profil</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader>
                  <CardTitle>Préférences d'affichage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                   <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl">
                     <div className="flex items-center gap-3">
                       <Moon size={20} className="text-slate-600" />
                       <div>
                         <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tighter">Mode Sombre</p>
                         <p className="text-xs text-slate-500">Activer manuellement le thème sombre</p>
                       </div>
                     </div>
                     <div className="w-12 h-6 bg-slate-800 rounded-full relative cursor-pointer shadow-inner shadow-slate-900">
                       <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full transition-all"></div>
                     </div>
                   </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'users' && isAdmin && (
            <UserManagement />
          )}

          {activeTab === 'business' && isAdmin && (
            <Card className="border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Building2 size={20} className="text-blue-600" />
                  </div>
                  <CardTitle>Identité de l'entreprise</CardTitle>
                </div>
                <Button 
                  onClick={handleUpdateBusiness}
                  disabled={isSavingBusiness}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {isSavingBusiness ? <RefreshCcw size={16} className="animate-spin mr-2" /> : <Check size={16} className="mr-2" />}
                  Enregistrer les modifications
                </Button>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleUpdateBusiness} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* General Info */}
                    <div className="space-y-6">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2">Informations Générales</h3>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Nom de l'entreprise</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            type="text"
                            value={businessForm.name}
                            onChange={(e) => setBusinessForm({...businessForm, name: e.target.value})}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                            placeholder="Ex: MZSOFT POS"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Slogan</label>
                        <div className="relative">
                          <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            type="text"
                            value={businessForm.slogan || ''}
                            onChange={(e) => setBusinessForm({...businessForm, slogan: e.target.value})}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
                            placeholder="Votre slogan ici..."
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">URL Logo (Optionnel)</label>
                          <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                              type="text"
                              value={businessForm.logo || ''}
                              onChange={(e) => setBusinessForm({...businessForm, logo: e.target.value})}
                              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
                              placeholder="https://..."
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Devise</label>
                          <div className="relative">
                            <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                              type="text"
                              value={businessForm.currency}
                              onChange={(e) => setBusinessForm({...businessForm, currency: e.target.value})}
                              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                              placeholder="Ex: DZD"
                            />
                          </div>
                        </div>
                        <div className="col-span-2 space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Symbole Devise</label>
                          <input
                            type="text"
                            value={businessForm.currencySymbol}
                            onChange={(e) => setBusinessForm({...businessForm, currencySymbol: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-black text-center text-xl"
                            placeholder="Ex: DA"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-6">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2">Coordonnées & Fiscalité</h3>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Adresse Physique</label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                          <textarea
                            value={businessForm.address || ''}
                            onChange={(e) => setBusinessForm({...businessForm, address: e.target.value})}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-medium min-h-[80px]"
                            placeholder="Adresse complète..."
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Téléphone</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                              type="text"
                              value={businessForm.phone || ''}
                              onChange={(e) => setBusinessForm({...businessForm, phone: e.target.value})}
                              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                              placeholder="0XX XX XX XX"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Email Contact</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                              type="email"
                              value={businessForm.email || ''}
                              onChange={(e) => setBusinessForm({...businessForm, email: e.target.value})}
                              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500"
                              placeholder="contact@entreprise.com"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">NIF (Identif. Fiscale)</label>
                          <input
                            type="text"
                            value={businessForm.nif || ''}
                            onChange={(e) => setBusinessForm({...businessForm, nif: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                            placeholder="Ex: 000101XXXXXXXXX"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">RC (Registre Commerce)</label>
                          <input
                            type="text"
                            value={businessForm.rc || ''}
                            onChange={(e) => setBusinessForm({...businessForm, rc: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                            placeholder="Ex: 16/00-XXXXXXX"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">AI (Article Imposition)</label>
                          <input
                            type="text"
                            value={businessForm.ai || ''}
                            onChange={(e) => setBusinessForm({...businessForm, ai: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                            placeholder="Ex: 1603XXXXXXXX"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">NIS (Statistique)</label>
                          <input
                            type="text"
                            value={businessForm.nis || ''}
                            onChange={(e) => setBusinessForm({...businessForm, nis: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                            placeholder="NIS..."
                          />
                        </div>
                      </div>

                      <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                              <Coins size={18} className="text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tighter">Appliquer la TVA</p>
                              <p className="text-xs text-slate-500">Activer le calcul automatique de la TVA sur les documents.</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBusinessForm({...businessForm, useTax: !businessForm.useTax})}
                            className={`w-12 h-6 rounded-full relative transition-all shadow-inner ${
                              businessForm.useTax ? 'bg-blue-500 shadow-blue-900' : 'bg-slate-300 shadow-slate-400'
                            }`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                              businessForm.useTax ? 'right-1' : 'left-1'
                            }`}></div>
                          </button>
                        </div>
                        
                        {businessForm.useTax && (
                          <div className="flex items-center justify-between pt-2 border-t border-blue-100 dark:border-blue-900/30">
                            <label className="text-xs font-bold text-slate-600 uppercase">Taux de TVA (%)</label>
                            <input 
                              type="number"
                              value={businessForm.taxRate}
                              onChange={(e) => setBusinessForm({...businessForm, taxRate: parseFloat(e.target.value) || 0})}
                              className="w-20 px-3 py-1.5 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg text-center font-black text-blue-600"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Session Management */}
                    <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800 md:col-span-2">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 pb-2">Contrôle des Sessions</h3>
                       <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                         <div className="flex items-center gap-3">
                           <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                             <Shield size={18} className="text-rose-600" />
                           </div>
                           <div>
                             <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tighter">Bloquer l'ouverture/fermeture libre</p>
                             <p className="text-xs text-slate-500">Seul un Manager ou Admin pourra ouvrir ou clôturer une session.</p>
                           </div>
                         </div>
                         <button
                           type="button"
                           onClick={() => setBusinessForm({...businessForm, lockSessions: !businessForm.lockSessions})}
                           className={`w-12 h-6 rounded-full relative transition-all shadow-inner ${
                             businessForm.lockSessions ? 'bg-rose-500 shadow-rose-900' : 'bg-slate-300 shadow-slate-400'
                           }`}
                         >
                           <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                             businessForm.lockSessions ? 'right-1' : 'left-1'
                           }`}></div>
                         </button>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-xs font-bold text-slate-500 uppercase">Texte de pied de page (Tickets / Factures)</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 text-slate-400" size={18} />
                      <textarea
                        value={businessForm.footerText || ''}
                        onChange={(e) => setBusinessForm({...businessForm, footerText: e.target.value})}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-medium min-h-[100px]"
                        placeholder="Texte qui apparaîtra en bas de vos documents..."
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 italic">Ce texte sera affiché sur tous vos tickets de caisse, factures et devis générés.</p>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle>Sécurité & Accès</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                 <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl flex items-center gap-4">
                    <CheckCircle2 className="text-emerald-500 shrink-0" size={24} />
                    <div>
                      <p className="font-bold text-emerald-900 dark:text-emerald-400">Authentification Google active</p>
                      <p className="text-sm text-emerald-700 dark:text-emerald-500/80">Votre compte est sécurisé par votre fournisseur d'identité.</p>
                    </div>
                 </div>
                 
                 <div className="space-y-4">
                   <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Journal de connexion</h4>
                   <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                     {[
                       { device: 'Safari - macOS', location: 'Casablanca, MA', date: 'Aujourd\'hui 11:24', current: true },
                       { device: 'Chrome - Windows', location: 'Rabat, MA', date: 'Hier 18:45', current: false },
                     ].map((session, i) => (
                       <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                         <div className="flex items-center gap-3">
                           <Monitor size={18} className="text-slate-400" />
                           <div>
                             <p className="text-sm font-bold text-slate-900 dark:text-white">{session.device} {session.current && <span className="ml-2 text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">Actuel</span>}</p>
                             <p className="text-xs text-slate-500">{session.location} • {session.date}</p>
                           </div>
                         </div>
                         {!session.current && <button className="text-xs text-rose-500 font-bold hover:underline">Déconnecter</button>}
                       </div>
                     ))}
                   </div>
                 </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'system' && isAdmin && (
            <Card className="border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <Database size={20} className="text-slate-600" />
                  </div>
                  <CardTitle>Maintenance Système</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={18} className="text-slate-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Réinitialisation d'usine</h3>
                  </div>
                  <p className="text-sm text-slate-500 mb-6">
                    Cette action vous permet de vider les données du logiciel pour repartir de zéro. 
                    <span className="block mt-1 font-bold text-rose-500">Attention : Cette action est irréversible.</span>
                  </p>

                  <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 p-6 rounded-2xl">
                    <div className="flex items-start gap-4 mb-6">
                      <AlertTriangle className="text-rose-500 shrink-0 mt-1" size={24} />
                      <div>
                        <h4 className="font-bold text-rose-900 dark:text-rose-400">Zone de danger</h4>
                        <p className="text-sm text-rose-700 dark:text-rose-500/80">
                          La réinitialisation supprimera définitivement les éléments sélectionnés ci-dessous.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 mb-6">
                      <button 
                        onClick={() => setResetOptions({...resetOptions, transactions: !resetOptions.transactions})}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                          resetOptions.transactions 
                          ? 'bg-white border-rose-200 shadow-sm' 
                          : 'bg-rose-50/50 border-transparent text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Trash2 size={18} />
                          <div className="text-left">
                            <p className="text-sm font-bold">Ventes & Transactions</p>
                            <p className="text-[10px] uppercase opacity-60">Ventes, Dépenses, Flux de caisse, Stocks</p>
                          </div>
                        </div>
                        {resetOptions.transactions && <Check size={16} className="text-rose-500" />}
                      </button>

                      <button 
                        onClick={() => setResetOptions({...resetOptions, catalog: !resetOptions.catalog})}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                          resetOptions.catalog 
                          ? 'bg-white border-rose-200 shadow-sm' 
                          : 'bg-rose-50/50 border-transparent text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Database size={18} />
                          <div className="text-left">
                            <p className="text-sm font-bold">Catalogue Produits</p>
                            <p className="text-[10px] uppercase opacity-60">Produits, Catégories, Stock actuel</p>
                          </div>
                        </div>
                        {resetOptions.catalog && <Check size={16} className="text-rose-500" />}
                      </button>

                      <button 
                        onClick={() => setResetOptions({...resetOptions, crm: !resetOptions.crm})}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                          resetOptions.crm 
                          ? 'bg-white border-rose-200 shadow-sm' 
                          : 'bg-rose-50/50 border-transparent text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Users size={18} />
                          <div className="text-left">
                            <p className="text-sm font-bold">Base Clients & Fournisseurs</p>
                            <p className="text-[10px] uppercase opacity-60">Fiches clients, Fournisseurs</p>
                          </div>
                        </div>
                        {resetOptions.crm && <Check size={16} className="text-rose-500" />}
                      </button>
                    </div>

                    <Button 
                      onClick={() => setIsResetModalOpen(true)}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest py-6 h-auto shadow-lg shadow-rose-200"
                    >
                      <RefreshCcw size={18} className="mr-2" />
                      Réinitialiser la sélection
                    </Button>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                   <div className="flex items-center gap-2 mb-2">
                     <RefreshCcw size={18} className="text-blue-500" />
                     <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Sauvegarde & Restauration</h3>
                   </div>
                   <p className="text-sm text-slate-500 mb-6">
                     Exportez vos données pour les conserver en sécurité ou restaurez une sauvegarde précédente.
                   </p>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Button 
                        onClick={handleExportBackup}
                        disabled={isExporting}
                        variant="outline"
                        className="h-16 border-2 border-slate-200 dark:border-slate-800 font-bold"
                      >
                        {isExporting ? (
                          <RefreshCcw className="animate-spin mr-2" />
                        ) : (
                          <Database size={18} className="mr-2 text-blue-500" />
                        )}
                        Exporter la Base de Données (.json)
                      </Button>

                      <div className="relative">
                        <input 
                          type="file" 
                          id="restore-upload" 
                          accept=".json"
                          onChange={onFileSelect}
                          className="hidden"
                          disabled={isImporting}
                        />
                        <Button 
                          onClick={() => document.getElementById('restore-upload')?.click()}
                          disabled={isImporting}
                          variant="outline"
                          className="w-full h-16 border-2 border-slate-200 dark:border-slate-800 font-bold"
                        >
                          {isImporting ? (
                            <RefreshCcw className="animate-spin mr-2" />
                        ) : (
                          <RefreshCcw size={18} className="mr-2 text-emerald-500" />
                        )}
                        Restaurer la Base de Données
                        </Button>
                      </div>
                   </div>
                </div>

                <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                   <div className="flex items-center gap-2 mb-4">
                     <Info size={18} className="text-blue-500" />
                     <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">État du système</h3>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                         <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Base de données</p>
                         <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Firebase Firestore</span>
                            <span className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase">
                               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                               Connecté
                            </span>
                         </div>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                         <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Version Logiciel</p>
                         <p className="font-bold text-slate-700 dark:text-slate-300">MZSOFT POS v2.4.0</p>
                      </div>
                   </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(activeTab !== 'profile' && activeTab !== 'security' && activeTab !== 'users' && activeTab !== 'system') && (
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-20 text-center text-slate-400">
                <SettingsIcon size={48} className="mx-auto mb-4 opacity-10 animate-spin-slow" />
                <p className="italic">Cette section est en cours d'optimisation.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {isRestoreModalOpen && restoreFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-md border-none shadow-2xl animate-in zoom-in-95 duration-200">
            <CardHeader className="bg-emerald-600 text-white p-6 rounded-t-xl">
              <div className="flex items-center gap-3">
                <RefreshCcw size={24} />
                <CardTitle className="text-xl">Restaurer la base</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-sm text-emerald-800 leading-relaxed">
                  Attention : cette action va <strong>écraser</strong> toutes les données actuelles par celles du fichier <strong>{restoreFile.name}</strong>.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={() => handleImportRestore(restoreFile)}
                  disabled={isImporting}
                  className="w-full py-6 h-auto bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest shadow-lg shadow-emerald-100"
                >
                  {isImporting ? (
                    <div className="flex items-center gap-2">
                       <RefreshCcw className="animate-spin mr-2" />
                       Restauration...
                    </div>
                  ) : 'Confirmer la restauration'}
                </Button>
                <button 
                  onClick={() => {
                    setIsRestoreModalOpen(false);
                    setRestoreFile(null);
                  }}
                  className="w-full py-4 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-md border-none shadow-2xl animate-in zoom-in-95 duration-200">
            <CardHeader className="bg-rose-600 text-white p-6 rounded-t-xl">
              <div className="flex items-center gap-3">
                <AlertTriangle size={24} />
                <CardTitle className="text-xl">Confirmation requise</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
                <p className="text-sm text-rose-800 leading-relaxed">
                  Vous êtes sur le point de supprimer les données du système. Cette action est <strong>définitive</strong>.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Veuillez saisir <span className="text-rose-600 font-black">RESET</span> pour confirmer :</p>
                <input
                  type="text"
                  value={resetConfirmation}
                  onChange={(e) => setResetConfirmation(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && resetConfirmation === 'RESET' && !isResetting) {
                      handleSystemReset();
                    }
                  }}
                  className={`w-full h-14 px-4 bg-slate-50 border-2 rounded-xl text-center text-xl font-black tracking-widest text-slate-800 focus:outline-none transition-all ${
                    resetConfirmation === 'RESET' 
                    ? 'border-emerald-500 bg-emerald-50/30' 
                    : resetConfirmation.length >= 5 
                    ? 'border-rose-300' 
                    : 'border-slate-200 focus:border-rose-500'
                  }`}
                  placeholder="---"
                  disabled={isResetting}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={handleSystemReset}
                  disabled={resetConfirmation !== 'RESET' || isResetting}
                  className={`w-full py-6 h-auto font-black uppercase tracking-widest transition-all shadow-lg ${
                    resetConfirmation === 'RESET' && !isResetting
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 scale-[1.02]' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  {isResetting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Suppression en cours...
                    </div>
                  ) : (
                    'Confirmer la suppression'
                  )}
                </Button>
                <button 
                  onClick={() => {
                    setIsResetModalOpen(false);
                    setResetConfirmation('');
                  }}
                  disabled={isResetting}
                  className="w-full py-4 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
