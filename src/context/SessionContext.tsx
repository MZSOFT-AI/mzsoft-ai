import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { useAuth } from './AuthContext';
import { DailyClosing } from '../types';
import { format } from 'date-fns';

interface SessionContextType {
  activeSession: DailyClosing | null;
  loading: boolean;
  startSession: (startingCash: number, selectedUser?: { uid: string, displayName: string }) => Promise<void>;
  closeSession: (closingData: Partial<DailyClosing>) => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userData } = useAuth();
  const [activeSession, setActiveSession] = useState<DailyClosing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user && !userData) {
      setActiveSession(null);
      setLoading(false);
      return;
    }

    // Look for an open session for this user OR ANY open session if authorized?
    // Actually, usually POS sessions are tied to the PERSON at the desk.
    // If the Admin opens a session for Vendeur X, Vendeur X is the owner.
    
    const q = query(
      collection(db, 'daily_closings'),
      where('status', '==', 'open'),
      orderBy('startTime', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data();
        // Only show if it belongs to current user or if current user is admin/manager
        // For simplicity, we show the most recent open session if it exists.
        setActiveSession({ id: doc.id, ...data } as DailyClosing);
      } else {
        setActiveSession(null);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'daily_closings'));

    return () => unsubscribe();
  }, [user, userData]);

  const startSession = async (startingCash: number, selectedUser?: { uid: string, displayName: string }) => {
    if (!user && !userData) return;

    const currentUid = user?.uid || userData?.id || 'local_user';
    const currentName = user?.displayName || userData?.displayName || 'Utilisateur';

    const sessionUser = selectedUser || { uid: currentUid, displayName: currentName };
    const today = format(new Date(), 'yyyy-MM-dd');
    
    await addDoc(collection(db, 'daily_closings'), {
      date: today,
      userId: sessionUser.uid,
      userName: sessionUser.displayName,
      openedBy: currentUid, // Track who actually opened it
      openedByName: currentName,
      status: 'open',
      startTime: serverTimestamp(),
      startingCash,
      cashSales: 0,
      transferSales: 0,
      totalSales: 0,
      expenses: 0,
      netCash: 0,
      salesCount: 0,
      createdAt: serverTimestamp()
    });
  };

  const closeSession = async (closingData: Partial<DailyClosing>) => {
    if (!activeSession) return;

    const sessionRef = doc(db, 'daily_closings', activeSession.id);
    await updateDoc(sessionRef, {
      ...closingData,
      status: 'closed',
      endTime: serverTimestamp(),
      closedBy: user?.uid || userData?.id,
      closedByName: user?.displayName || userData?.displayName,
      updatedAt: serverTimestamp()
    });
  };

  return (
    <SessionContext.Provider value={{ activeSession, loading, startSession, closeSession }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};
