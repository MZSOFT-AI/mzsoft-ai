import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Package, ShieldCheck, Globe, Lock, User as UserIcon, LogIn } from 'lucide-react';
import { APP_CONFIG } from '../constants';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { useNotification } from '../context/NotificationContext';

const Login: React.FC = () => {
  const auth = useAuth();
  const { signIn, loginLocal, registerFirstAdmin, user, userData, loading, isSigningIn, usersExist } = auth;
  
  const { settings } = useSettings();
  const { showToast } = useNotification();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  if (loading) return null;
  if (user && userData) return <Navigate to="/" replace />;

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    if (typeof loginLocal !== 'function') {
      showToast("Erreur système : fonction de connexion non disponible. Veuillez actualiser.", "error");
      return;
    }

    try {
      await loginLocal(username, password);
      showToast("Connexion réussie", "success");
    } catch (error: any) {
      showToast(error.message || "Erreur de connexion", "error");
    }
  };

  const handleRegisterAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !displayName) return;

    if (typeof registerFirstAdmin !== 'function') {
      showToast("Erreur système : fonction d'initialisation non disponible. Veuillez actualiser la page.", "error");
      return;
    }

    try {
      await registerFirstAdmin(username, password, displayName);
      showToast("Compte Administrateur créé avec succès", "success");
    } catch (error: any) {
      showToast(error.message || "Erreur lors de la création", "error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]">
      <div className="max-w-4xl w-full flex flex-col lg:flex-row bg-white shadow-2xl border border-slate-300 overflow-hidden min-h-[500px]">
        {/* Left Side: Brand/Visual */}
        <div className="hidden lg:flex w-1/2 bg-slate-800 p-12 flex-col justify-between relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="grid grid-cols-10 gap-2 p-4">
                 {Array.from({ length: 100 }).map((_, i) => (
                    <div key={i} className="w-2 h-2 bg-white rounded-full"></div>
                 ))}
              </div>
           </div>
           
           <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                 <div className="w-12 h-12 bg-blue-600 rounded flex items-center justify-center shadow-xl transform -rotate-3 text-white overflow-hidden">
                    {settings.logo ? (
                       <img src={settings.logo} alt="Logo" className="w-full h-full object-contain p-0.5" referrerPolicy="no-referrer" />
                    ) : (
                       <Package size={28} />
                    )}
                 </div>
                 <div>
                    <h2 className="text-3xl font-black text-white leading-none tracking-tighter uppercase">{settings.name}</h2>
                    <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mt-1">{settings.slogan || 'Enterprise Solution'}</p>
                 </div>
              </div>
              <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-tight mb-6">
                 Logiciel de Gestion <br />
                 <span className="text-blue-500">Commerciale & POS</span>
              </h1>
              <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-sm">
                 Optimisez votre point de vente avec notre solution ERP certifiée. Performance, sécurité et traçabilité en temps réel.
              </p>
           </div>

           <div className="relative z-10 border-t border-slate-700 pt-8 mt-12 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">v1.2 build 2026</span>
              <div className="flex gap-4 text-slate-500">
                 <ShieldCheck size={18} />
                 <Globe size={18} />
              </div>
           </div>
        </div>

        {/* Right Side: Auth */}
        <div className="flex-1 p-8 md:p-12 flex flex-col justify-center bg-white">
            {/* Mobile/Tablet Brand Logo - Hidden on desktop screens */}
            <div className="lg:hidden flex items-center gap-3 mb-8 pb-6 border-b border-slate-100">
               <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center shadow-lg transform -rotate-3 text-white overflow-hidden shrink-0">
                  {settings.logo ? (
                     <img src={settings.logo} alt="Logo" className="w-full h-full object-contain p-0.5" referrerPolicy="no-referrer" />
                  ) : (
                     <Package size={22} />
                  )}
               </div>
               <div className="min-w-0">
                  <h2 className="text-xl font-black text-slate-800 leading-none tracking-tighter uppercase truncate">{settings.name}</h2>
                  <p className="text-[9px] text-blue-600 font-black uppercase tracking-wider mt-0.5 truncate">{settings.slogan || 'Enterprise Solution'}</p>
               </div>
            </div>

            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                 <div className="w-2 h-6 bg-blue-600"></div>
                 <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tighter">
                    {!usersExist ? 'Configuration Initiale' : 'Authentification'}
                 </h3>
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                 {!usersExist ? 'Création du premier compte administrateur' : 'Accès réservé au personnel autorisé'}
              </p>
           </div>

           <div className="space-y-6">
              {!usersExist ? (
                <form onSubmit={handleRegisterAdmin} className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-100 flex items-start gap-3 mb-2">
                    <ShieldCheck className="text-emerald-600 mt-1" size={20} />
                    <div>
                        <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-1">Première Installation</p>
                        <p className="text-[11px] text-emerald-600 font-medium">Veuillez configurer votre compte administrateur principal pour commencer.</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nom Complet</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="text" 
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Ex: Administrateur Système"
                        className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Identifiant de connexion</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Ex: admin"
                        className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Mot de passe</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white transition-all"
                        required
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSigningIn}
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center justify-center gap-3 font-black uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95 mt-4"
                  >
                    {isSigningIn ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <Package size={18} />
                    )}
                    Initialiser le Système
                  </Button>
                </form>
              ) : (
                <div className="space-y-6">
                  {/* Google Login button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof signIn === 'function') {
                        signIn();
                      } else {
                        showToast("Erreur système : connexion Google non disponible", "error");
                      }
                    }}
                    disabled={isSigningIn}
                    className={cn(
                      "w-full flex items-center justify-center gap-4 py-4 px-6 bg-white border border-slate-300 hover:border-slate-800 text-slate-800 font-black uppercase text-xs tracking-widest transition-all active:translate-y-0.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]",
                      isSigningIn && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isSigningIn ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-800"></div>
                    ) : (
                      <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 grayscale" />
                    )}
                    {isSigningIn ? 'VÉRIFICATION...' : 'CONTINUER AVEC GOOGLE'}
                  </button>

                  {/* Elegant Separator */}
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-slate-100" />
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap">OU CONNEXION PAR EMAIL & MOT DE PASSE</span>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>

                  {/* Email & Password login form */}
                  <form onSubmit={handleLocalLogin} className="space-y-4 row">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Email ou Identifiant</label>
                      <div className="relative">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input 
                          type="text" 
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Ex: mohamed@gmail.com ou ali_vendeur"
                          className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded text-sm font-bold outline-none focus:border-blue-500 focus:bg-white transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Mot de passe</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input 
                          type="password" 
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded text-sm font-bold outline-none focus:border-blue-500 focus:bg-white transition-all"
                          required
                        />
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      disabled={isSigningIn}
                      className="w-full h-12 bg-slate-800 hover:bg-slate-900 text-white rounded flex items-center justify-center gap-3 font-black uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95"
                    >
                      {isSigningIn ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <LogIn size={18} />
                      )}
                      Connexion
                    </Button>
                  </form>
                </div>
              )}

              <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
                 <div className="flex items-center gap-2 flex-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Connectivité stable</span>
                 </div>
                 <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">© {settings.name} {new Date().getFullYear()}</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
