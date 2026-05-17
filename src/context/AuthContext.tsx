import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInAnonymously
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, collection, where, getDocs, limit, updateDoc, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { UserData, UserPermissions } from '../types';
import { safeStringify, cleanObject } from '../lib/utils';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signIn: () => Promise<void>;
  loginLocal: (username: string, password: string) => Promise<void>;
  loginAsSeller: () => Promise<void>;
  registerFirstAdmin: (username: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  usersExist: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
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
        console.error("Error checking users:", safeStringify(e));
      }
    };
    checkUsers();

    // Check if there's a cached local user
    const cachedLocal = localStorage.getItem('mzsoft_local_user');
    if (cachedLocal) {
      try {
        const parsed = JSON.parse(cachedLocal);
        setLocalUser(parsed);
        setUserData(parsed);
      } catch (e) {
        localStorage.removeItem('mzsoft_local_user');
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Sync user with Firestore
        const userDocRef = doc(db, 'users', user.uid);
        try {
          let userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            if (user.isAnonymous) {
              // This is an anonymous session. 
              // Check if we have a pending local login context
              const pendingLocalId = localStorage.getItem('mzsoft_pending_local_id');
              if (pendingLocalId) {
                const localDocRef = doc(db, 'users', pendingLocalId);
                const localDoc = await getDoc(localDocRef);
                if (localDoc.exists()) {
                  // Link this anonymous UID to this local user
                  const localData = localDoc.data();
                  await setDoc(userDocRef, cleanObject({
                    ...localData,
                    uid: user.uid,
                    updatedAt: serverTimestamp()
                  }));
                  // If the ID was different, we might want to delete the old one or just leave it
                  // For now, let's keep it simple.
                  userDoc = await getDoc(userDocRef);
                  localStorage.removeItem('mzsoft_pending_local_id');
                }
              }
            } else if (user.email) {
              // Existing Google Auth logic...
              const emailDocRef = doc(db, 'users', user.email.toLowerCase());
              const emailDoc = await getDoc(emailDocRef);
              
              if (emailDoc.exists()) {
                const preData = emailDoc.data();
                const newUserData = cleanObject({
                  ...preData,
                  displayName: user.displayName || preData.displayName || 'Utilisateur',
                  uid: user.uid,
                  photoURL: user.photoURL,
                  updatedAt: serverTimestamp(),
                  createdAt: preData.createdAt || serverTimestamp()
                });
                await setDoc(userDocRef, newUserData);
                await deleteDoc(emailDocRef);
                userDoc = await getDoc(userDocRef);
              } else {
                const newUserData = cleanObject({
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
                    canViewReports: false,
                    canManageUsers: false
                  },
                  status: 'active'
                });
                await setDoc(userDocRef, newUserData);
                userDoc = await getDoc(userDocRef);
              }
            }
          }
          
          if (userDoc.exists()) {
            const data = userDoc.data() as UserData;
            
            // SECURITY: Check if user is active
            if (data.status === 'inactive') {
              await signOut(auth);
              setUserData(null);
              setLoading(false);
              return;
            }

            setUserData({ id: userDoc.id, ...data });
            if (!user.isAnonymous) {
              localStorage.removeItem('mzsoft_local_user');
              setLocalUser(null);
            }
          }
        } catch (error) {
          console.error("Auth sync error:", safeStringify(error));
          // Don't call handleFirestoreError here to avoid loop on login
        }
      } else {
        const cachedLocal = localStorage.getItem('mzsoft_local_user');
        if (cachedLocal) {
          try {
            const parsed = JSON.parse(cachedLocal);
            // If we have a cached local user but no Firebase user, 
            // we should probably try to re-authenticate anonymously
            // but we'll wait for the user to explicitly login for now
            setUserData(parsed);
          } catch (e) {
            setUserData(null);
          }
        } else {
          setUserData(null);
        }
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
        console.error('Sign-in error:', safeStringify(error));
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

      if (data.localPassword !== password) {
        throw new Error('Mot de passe incorrect');
      }

      // We have a valid local user. Now provide them with a Firebase identity.
      localStorage.setItem('mzsoft_pending_local_id', docSnap.id);
      await signInAnonymously(auth);
      
      const localUserData = { id: docSnap.id, ...data } as UserData;
      setLocalUser(localUserData);
      setUserData(localUserData);
      localStorage.setItem('mzsoft_local_user', safeStringify(localUserData));
    } catch (error) {
      console.error(safeStringify(error));
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const loginAsSeller = async () => {
    setIsSigningIn(true);
    try {
      const userCred = await signInAnonymously(auth);
      const sellerId = userCred.user.uid;
      
      // Check if user record already exists
      const userDocRef = doc(db, 'users', sellerId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        const sellerData: UserData = {
          id: sellerId,
          displayName: `Vendeur ${sellerId.substring(0, 4)}`,
          email: null,
          role: 'vendeur',
          createdAt: new Date(),
          uid: sellerId,
          permissions: {
            canManageStock: false,
            canDeleteProducts: false,
            canSell: true,
            canProcessReturns: false,
            canPerformInventory: false,
            canManageExpenses: false,
            canViewReports: false,
            canManageUsers: false
          },
          status: 'active'
        };

        await setDoc(userDocRef, cleanObject({
          ...sellerData,
          createdAt: serverTimestamp()
        }));
        
        setUserData(sellerData);
      } else {
        setUserData({ id: userDoc.id, ...userDoc.data() } as UserData);
      }
    } catch (error) {
      console.error('Seller login error:', safeStringify(error));
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const registerFirstAdmin = async (username: string, password: string, displayName: string) => {
    setIsSigningIn(true);
    try {
      const q = query(collection(db, 'users'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        throw new Error('Un administrateur existe déjà.');
      }

      // 1. Sign in anonymously first to get a real UID
      const userCred = await signInAnonymously(auth);
      const adminId = userCred.user.uid;

      const adminData: UserData = {
        id: adminId,
        username: username.trim(),
        localPassword: password,
        displayName: displayName.trim(),
        email: null,
        role: 'superadmin',
        createdAt: new Date(),
        isLocalOnly: true,
        uid: adminId,
        status: 'active',
        permissions: {
          canManageStock: true,
          canDeleteProducts: true,
          canSell: true,
          canProcessReturns: true,
          canPerformInventory: true,
          canManageExpenses: true,
          canViewReports: true,
          canManageUsers: true
        }
      };

      await setDoc(doc(db, 'users', adminId), cleanObject({
        ...adminData,
        createdAt: serverTimestamp()
      }));

      setLocalUser(adminData);
      setUserData(adminData);
      setUsersExist(true);
      localStorage.setItem('mzsoft_local_user', safeStringify(adminData));
    } catch (error) {
      console.error(safeStringify(error));
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    try {
      const currentUid = user?.uid || userData?.uid || userData?.id;
      if (currentUid) {
        const timestamp = serverTimestamp();
        
        // 1. Update user record
        await updateDoc(doc(db, 'users', currentUid), {
          lastLogoutAt: timestamp
        });
        
        // 2. Log the event
        await addDoc(collection(db, 'system_logs'), {
          type: 'logout',
          userId: currentUid,
          userName: userData?.displayName || user?.displayName || 'Utilisateur',
          timestamp: timestamp,
          details: 'Utilisateur a quitté le logiciel'
        });
      }
    } catch (e) {
      console.warn("Error during logout tracking:", safeStringify(e));
    }
    
    await signOut(auth);
    setLocalUser(null);
    setUserData(null);
    localStorage.removeItem('mzsoft_local_user');
  };

  const isSuperAdmin = userData?.role === 'superadmin' || 
                      auth.currentUser?.email?.toLowerCase() === 'djelloulmohamed1990@gmail.com' || 
                      userData?.email?.toLowerCase() === 'djelloulmohamed1990@gmail.com';
  
  const isAdminOnly = userData?.role === 'admin';
  const isManager = userData?.role === 'manager';
  const isAdmin = isSuperAdmin || isAdminOnly || isManager;

  const hasPermission = (permission: keyof UserPermissions) => {
    if (isSuperAdmin) return true;
    if (isAdminOnly && permission !== 'canManageUsers') return true;
    
    if (!userData?.permissions) {
      if (isManager && permission !== 'canManageUsers') return true;
      if (permission === 'canSell') return true;
      return false;
    }
    return !!userData.permissions[permission];
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, signIn, loginLocal, loginAsSeller, registerFirstAdmin, logout, isAdmin, isSuperAdmin, usersExist, isSigningIn, hasPermission }}>
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
