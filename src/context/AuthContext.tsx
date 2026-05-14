import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, collection, where, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { UserData, UserPermissions } from '../types';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signIn: () => Promise<void>;
  loginLocal: (username: string, password: string) => Promise<void>;
  registerFirstAdmin: (username: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  usersExist: boolean;
  isAdmin: boolean;
  isSigningIn: boolean;
  hasPermission: (permission: keyof UserPermissions) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [localUser, setLocalUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [usersExist, setUsersExist] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    // Check if any users exist in the system
    const checkUsers = async () => {
      try {
        const q = query(collection(db, 'users'), limit(1));
        const snap = await getDocs(q);
        setUsersExist(!snap.empty);
      } catch (e) {
        console.error("Error checking users:", e);
      }
    };
    checkUsers();

    // Check if there's a cached local user
    const cachedLocal = localStorage.getItem('dolisoft_local_user');
    if (cachedLocal) {
      try {
        const parsed = JSON.parse(cachedLocal);
        setLocalUser(parsed);
        setUserData(parsed);
      } catch (e) {
        localStorage.removeItem('dolisoft_local_user');
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Sync user with Firestore
        const userDocRef = doc(db, 'users', user.uid);
        try {
          let userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists() && user.email) {
            // Check if there's a pre-authorized account with this email
            const emailDocRef = doc(db, 'users', user.email.toLowerCase());
            const emailDoc = await getDoc(emailDocRef);
            
            if (emailDoc.exists()) {
              // Migrate pre-authorized doc to UID-based doc
              const preData = emailDoc.data();
              const newUserData = {
                ...preData,
                displayName: user.displayName || preData.displayName || 'Utilisateur',
                uid: user.uid,
                photoURL: user.photoURL,
                updatedAt: serverTimestamp(),
                createdAt: preData.createdAt || serverTimestamp()
              };
              await setDoc(userDocRef, newUserData);
              await deleteDoc(emailDocRef);
              userDoc = await getDoc(userDocRef);
            } else {
              const newUserData = {
                displayName: user.displayName || 'Utilisateur',
                email: user.email,
                role: 'vendeur',
                createdAt: serverTimestamp(),
                photoURL: user.photoURL,
                permissions: {
                  canManageStock: false,
                  canDeleteProducts: false,
                  canSell: true,
                  canProcessReturns: false,
                  canPerformInventory: false,
                  canManageExpenses: false,
                  canViewReports: false
                }
              };
              await setDoc(userDocRef, newUserData);
              userDoc = await getDoc(userDocRef);
            }
          }
          
          if (userDoc.exists()) {
            setUserData({ id: userDoc.id, ...userDoc.data() } as UserData);
            localStorage.removeItem('dolisoft_local_user'); // Google login overrides local login
            setLocalUser(null);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      } else if (!localStorage.getItem('dolisoft_local_user')) {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.log('Sign-in popup issue:', error.code);
      } else {
        console.error('Sign-in error:', error);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const loginLocal = async (username: string, password: string) => {
    setIsSigningIn(true);
    try {
      const q = query(collection(db, 'users'), where('username', '==', username.trim()), limit(1));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        throw new Error('Utilisateur non trouvé');
      }

      const docSnap = snap.docs[0];
      const data = docSnap.data();

      // Simple password check for now
      if (data.localPassword !== password) {
        throw new Error('Mot de passe incorrect');
      }

      const localUserData = { id: docSnap.id, ...data } as UserData;
      setLocalUser(localUserData);
      setUserData(localUserData);
      localStorage.setItem('dolisoft_local_user', JSON.stringify(localUserData));
      
      // Since Google logout might trigger AuthStateChanged, we keep it in localStorage
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const registerFirstAdmin = async (username: string, password: string, displayName: string) => {
    setIsSigningIn(true);
    try {
      // Final security check: ensure no users actually exist
      const q = query(collection(db, 'users'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        throw new Error('Un administrateur existe déjà.');
      }

      const adminId = `admin_${Date.now()}`;
      const adminData: UserData = {
        id: adminId,
        username: username.trim(),
        localPassword: password, // Store password (should be hashed in prod)
        displayName: displayName.trim(),
        email: null,
        role: 'admin',
        createdAt: new Date(), // using Date since serverTimestamp doesn't work with interface easily
        isLocalOnly: true,
        permissions: {
          canManageStock: true,
          canDeleteProducts: true,
          canSell: true,
          canProcessReturns: true,
          canPerformInventory: true,
          canManageExpenses: true,
          canViewReports: true
        }
      };

      await setDoc(doc(db, 'users', adminId), {
        ...adminData,
        createdAt: serverTimestamp() // Proper server timestamp for firestore
      });

      setLocalUser(adminData);
      setUserData(adminData);
      setUsersExist(true);
      localStorage.setItem('dolisoft_local_user', JSON.stringify(adminData));
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setLocalUser(null);
    setUserData(null);
    localStorage.removeItem('dolisoft_local_user');
  };

  const isSuperAdmin = auth.currentUser?.email?.toLowerCase() === 'djelloulmohamed1990@gmail.com' || userData?.email?.toLowerCase() === 'djelloulmohamed1990@gmail.com';
  const isAdmin = isSuperAdmin || userData?.role === 'admin' || userData?.role === 'manager';

  const hasPermission = (permission: keyof UserPermissions) => {
    if (isSuperAdmin || userData?.role === 'admin') return true;
    if (!userData?.permissions) {
      if (userData?.role === 'manager') return true;
      if (permission === 'canSell') return true;
      return false;
    }
    return !!userData.permissions[permission];
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, signIn, loginLocal, registerFirstAdmin, logout, isAdmin, usersExist, isSigningIn, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
