import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Package, ShieldCheck, Globe, Lock } from 'lucide-react';
import { APP_CONFIG } from '../constants';
import { cn } from '../lib/utils';

const Login: React.FC = () => {
  const { signIn, user, loading, isSigningIn } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]">
      <div className="max-w-4xl w-full flex bg-white shadow-2xl border border-slate-300 overflow-hidden min-h-[500px]">
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
                 <div className="w-12 h-12 bg-blue-600 rounded flex items-center justify-center shadow-xl transform -rotate-3 text-white">
                    <Package size={28} />
                 </div>
                 <div>
                    <h2 className="text-3xl font-black text-white leading-none tracking-tighter uppercase">MZ SOFT</h2>
                    <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mt-1">Enterprise Solution</p>
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
        <div className="flex-1 p-12 flex flex-col justify-center bg-white">
           <div className="mb-10">
              <div className="flex items-center gap-2 mb-2">
                 <div className="w-2 h-6 bg-blue-600"></div>
                 <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tighter">Authentification</h3>
              </div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Accès réservé au personnel autorisé</p>
           </div>

           <div className="space-y-6">
              <div className="space-y-4">
                 <div className="p-4 bg-blue-50 border border-blue-100 flex items-start gap-3">
                    <Lock className="text-blue-600 mt-1" size={20} />
                    <div>
                       <p className="text-xs font-black text-blue-800 uppercase tracking-widest mb-1">Connexion Sécurisée</p>
                       <p className="text-xs text-blue-600 font-medium">Veuillez utiliser votre compte professionnel pour accéder au tableau de bord.</p>
                    </div>
                 </div>

                 <button
                   onClick={signIn}
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
                   {isSigningIn ? 'SÉCURISATION...' : 'CONTINUER AVEC GOOGLE'}
                 </button>
              </div>

              <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
                 <div className="flex items-center gap-2 flex-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Connectivité stable</span>
                 </div>
                 <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">© MZSOFT SYSTEMS</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
