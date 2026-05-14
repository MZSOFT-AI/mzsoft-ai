import React, { useState } from 'react';
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
  Info
} from 'lucide-react';

export default function Settings() {
  const { userData, logout, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profil', icon: User },
    ...(isAdmin ? [{ id: 'users', label: 'Utilisateurs', icon: Users }] : []),
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Sécurité', icon: Shield },
    { id: 'system', label: 'Système', icon: Database },
    { id: 'about', label: 'À propos', icon: Info },
  ];

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

          {(activeTab !== 'profile' && activeTab !== 'security') && (
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-20 text-center text-slate-400">
                <SettingsIcon size={48} className="mx-auto mb-4 opacity-10 animate-spin-slow" />
                <p className="italic">Cette section est en cours d'optimisation.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
