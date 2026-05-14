import React, { useState, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Wallet, LogIn, ArrowRight, ArrowLeft, Users } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { UserData } from '../types';

interface StartSessionModalProps {
  isOpen: boolean;
}

const StartSessionModal: React.FC<StartSessionModalProps> = ({ isOpen }) => {
  const { startSession } = useSession();
  const { user, userData, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [startingCash, setStartingCash] = useState<number>(0);
  const [estimatedStartingCash, setEstimatedStartingCash] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [availableUsers, setAvailableUsers] = useState<UserData[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  useEffect(() => {
    if (user) {
      setSelectedUserId(user.uid);
    } else if (userData) {
      setSelectedUserId(userData.id);
    }
  }, [user, userData]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch last closing for cash suggestion
        const closingsQuery = query(
          collection(db, 'daily_closings'),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        const closingsSnapshot = await getDocs(closingsQuery);
        if (!closingsSnapshot.empty) {
          const lastClosing = closingsSnapshot.docs[0].data();
          const value = lastClosing.nextSessionCash || 0;
          setEstimatedStartingCash(value);
          setStartingCash(value);
        }

        // Fetch users if admin
        if (isAdmin) {
          const usersSnapshot = await getDocs(query(collection(db, 'users'), orderBy('displayName', 'asc')));
          setAvailableUsers(usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
        }
      } catch (error) {
        console.error("Error fetching start session data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchData();
    }
  }, [isOpen, isAdmin]);

  if (!isOpen) return null;

  const handleStart = () => {
    const selectedUser = availableUsers.find(u => u.id === selectedUserId);
    startSession(startingCash, selectedUser ? { uid: selectedUser.id, displayName: selectedUser.displayName || 'Vendeur' } : undefined);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="p-8 text-center bg-slate-50 border-b border-slate-100">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-200 mb-6">
            <Wallet size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Ouverture de Session</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">Démarrer une nouvelle vacation de caisse</p>
        </div>

        <div className="p-8 space-y-6">
          {isAdmin && availableUsers.length > 0 && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 flex items-center gap-2">
                <Users size={12} /> Responsable de la Session
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
              >
                {availableUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} {u.id === (user?.uid || userData?.id) ? '(Moi)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Fond de Caisse Initial (Dinar)</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-2xl text-slate-400">DA</span>
              <input
                type="number"
                value={startingCash}
                onChange={(e) => setStartingCash(Number(e.target.value))}
                className="w-full pl-16 pr-6 py-5 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-black text-3xl text-slate-800"
                autoFocus
              />
            </div>
            <div className="mt-3 flex items-center gap-2 px-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
              <p className="text-[10px] font-bold text-slate-400 uppercase italic">
                Suggéré par la dernière clôture: {formatCurrency(estimatedStartingCash)}
              </p>
            </div>
          </div>

          <div className="bg-blue-50/50 p-4 border border-blue-100 rounded-2xl">
            <p className="text-[10px] font-bold text-blue-600 leading-relaxed italic">
              "En ouvrant cette session, vous devenez responsable des flux financiers enregistrés jusqu'à la clôture."
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleStart}
              disabled={loading}
              className="w-full h-16 bg-slate-900 hover:bg-black text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-slate-200 group"
            >
              Démarrer la Session <LogIn size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            
            <Button
              variant="ghost"
              onClick={() => navigate('/dashboard')}
              className="w-full h-12 text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest text-[10px]"
            >
              <ArrowLeft size={14} className="mr-2" /> Retour au Tableau de Bord
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartSessionModal;
