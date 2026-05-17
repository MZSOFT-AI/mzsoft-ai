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
  getDocs,
  increment
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { useAuth } from './AuthContext';
import { DailyClosing } from '../types';
import { format } from 'date-fns';
import { cleanObject } from '../lib/utils';

interface SessionContextType {
  activeSession: DailyClosing | null;
  loading: boolean;
  startSession: (startingCash: number, selectedUser?: { uid: string, displayName: string }) => Promise<void>;
  closeSession: (closingData: {
    actualCashInDrawer: number;
    theoreticalCash: number;
    difference: number;
    withdrawnAmount: number;
    nextSessionCash: number;
    closingNote?: string;
  }) => Promise<void>;
  updateSessionTotals: (sessionId: string, updates: { 
    cashSales?: number;
    transferSales?: number;
    expenses?: number;
    salesCount?: number;
  }) => Promise<void>;
  getLastSessionClosingCash: () => Promise<number>;
  reopenSession: (sessionId: string) => Promise<void>;
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

    const currentUid = user?.uid || userData?.id;
    if (!currentUid) {
      setActiveSession(null);
      setLoading(false);
      return;
    }

    // Look for open sessions specifically for this user
    const q = query(
      collection(db, 'daily_closings'),
      where('status', '==', 'open'),
      where('userId', '==', currentUid),
      orderBy('startTime', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // If there are multiple open sessions, we take the most recent one
        // but we might want to log this or handle it if it becomes a problem.
        const doc = snapshot.docs[0];
        const data = doc.data();
        setActiveSession({ id: doc.id, ...data } as DailyClosing);
      } else {
        setActiveSession(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Session fetch error:", error);
      handleFirestoreError(error, OperationType.GET, 'daily_closings');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, userData]);

  const startSession = async (startingCash: number, selectedUser?: { uid: string, displayName: string }) => {
    if (!user && !userData) return;

    // Check if there's already an active session to prevent double-opening
    if (activeSession) {
       throw new Error("Une session est déjà ouverte. Veuillez la clôturer d'abord.");
    }

    const currentUid = user?.uid || userData?.id || 'local_user';
    const currentName = user?.displayName || userData?.displayName || 'Utilisateur';

    const sessionUser = selectedUser || { uid: currentUid, displayName: currentName };
    const today = format(new Date(), 'yyyy-MM-dd');
    const timestamp = serverTimestamp();
    
    const docRef = await addDoc(collection(db, 'daily_closings'), {
      date: today,
      userId: sessionUser.uid,
      userName: sessionUser.displayName,
      openedBy: currentUid, 
      openedByName: currentName,
      status: 'open',
      startTime: timestamp,
      startingCash,
      cashSales: 0,
      transferSales: 0,
      totalSales: 0,
      expenses: 0,
      netCash: startingCash, // Initial net cash is the same as starting cash
      salesCount: 0,
      createdAt: timestamp
    });

    // Log the session opening
    await addDoc(collection(db, 'system_logs'), {
      type: 'session_opened',
      userId: currentUid,
      userName: currentName,
      timestamp: timestamp,
      details: `Nouvelle session de caisse ouverte pour ${sessionUser.displayName} avec un fond de ${startingCash} DA`,
      sessionId: docRef.id
    });
  };

  const getLastSessionClosingCash = async (): Promise<number> => {
    try {
      const q = query(
        collection(db, 'daily_closings'),
        orderBy('endTime', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return snapshot.docs[0].data().nextSessionCash || 0;
      }
    } catch (error) {
      console.warn("Could not fetch last session closing cash:", error);
    }
    return 0;
  };

  const updateSessionTotals = async (sessionId: string, updates: { 
    cashSales?: number;
    transferSales?: number;
    expenses?: number;
    salesCount?: number;
  }) => {
    const sessionRef = doc(db, 'daily_closings', sessionId);
    
    // We use increment for atomicity in concurrent environments
    const firestoreUpdates: any = {};
    if (updates.cashSales) firestoreUpdates.cashSales = increment(updates.cashSales);
    if (updates.transferSales) firestoreUpdates.transferSales = increment(updates.transferSales);
    if (updates.expenses) firestoreUpdates.expenses = increment(updates.expenses);
    if (updates.salesCount) firestoreUpdates.salesCount = increment(updates.salesCount);
    
    // Total sales and net cash are derived but we store them for "direct" access
    // Note: for more precise tracking, we could calculate netCash using after-update getters,
    // but simple increment works if we stay consistent.
    if (updates.cashSales || updates.transferSales) {
      firestoreUpdates.totalSales = increment((updates.cashSales || 0) + (updates.transferSales || 0));
    }
    
    if (updates.cashSales || updates.expenses) {
      firestoreUpdates.netCash = increment((updates.cashSales || 0) - (updates.expenses || 0));
    }

    await updateDoc(sessionRef, {
      ...firestoreUpdates,
      updatedAt: serverTimestamp()
    });
  };

  const reopenSession = async (sessionId: string) => {
     const sessionRef = doc(db, 'daily_closings', sessionId);
     await updateDoc(sessionRef, {
       status: 'open',
       endTime: null,
       closedBy: null,
       closedByName: null,
       updatedAt: serverTimestamp()
     });
  };

  const closeSession = async (closingData: {
    actualCashInDrawer: number;
    theoreticalCash: number;
    difference: number;
    withdrawnAmount: number;
    nextSessionCash: number;
    closingNote?: string;
  }) => {
    // If no active session found in state, try to find any open one just in case
    let sessionToClose = activeSession;
    
    if (!sessionToClose) {
      const q = query(collection(db, 'daily_closings'), where('status', '==', 'open'), limit(1));
      const snaps = await getDocs(q);
      if (!snaps.empty) {
        sessionToClose = { id: snaps.docs[0].id, ...snaps.docs[0].data() } as DailyClosing;
      }
    }

    if (!sessionToClose) return;

    const sessionRef = doc(db, 'daily_closings', sessionToClose.id);
    const timestamp = serverTimestamp();
    
    await updateDoc(sessionRef, cleanObject({
      ...closingData,
      status: 'closed',
      endTime: timestamp,
      closedBy: user?.uid || userData?.uid || userData?.id,
      closedByName: user?.displayName || userData?.displayName,
      updatedAt: timestamp
    }));
    
    // Log the session closure
    await addDoc(collection(db, 'system_logs'), {
      type: 'session_closed',
      userId: user?.uid || userData?.uid || userData?.id,
      userName: user?.displayName || userData?.displayName || 'Utilisateur',
      timestamp: timestamp,
      details: `Session de caisse clôturée pour le ${sessionToClose.date}`,
      sessionId: sessionToClose.id
    });
    
    // Safety check: close ANY other open sessions that might exist for THIS user
    try {
      const qOthers = query(
        collection(db, 'daily_closings'), 
        where('status', '==', 'open'),
        where('userId', '==', user?.uid || userData?.id)
      );
      const othersSnapshot = await getDocs(qOthers);
      
      if (!othersSnapshot.empty) {
        for (const sessionDoc of othersSnapshot.docs) {
          if (sessionDoc.id !== sessionToClose.id) {
             await updateDoc(doc(db, 'daily_closings', sessionDoc.id), {
               status: 'closed',
               endTime: serverTimestamp(),
               closingNote: 'Clôture automatique (doublon détecté)',
               updatedAt: serverTimestamp()
             });
          }
        }
      }
    } catch (err) {
      console.warn("Error cleaning up extra sessions:", err);
    }
  };

  return (
    <SessionContext.Provider value={{ 
      activeSession, 
      loading, 
      startSession, 
      closeSession, 
      updateSessionTotals, 
      getLastSessionClosingCash,
      reopenSession 
    }}>
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
