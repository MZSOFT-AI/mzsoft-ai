import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, collection, where, getDocs, limit, updateDoc, addDoc, Timestamp } from 'firebase/firestore';
import { auth, db, updateSecondaryAuthUserPassword } from '../firebase/config';
import { notificationService } from '../services/notificationService';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { UserData, UserPermissions } from '../types';
import { safeStringify, cleanObject } from '../lib/utils';

const restoreTimestamp = (val: any) => {
  if (!val) return null;
  if (typeof val.toMillis === 'function') return val;
  if (typeof val.seconds === 'number') {
    try {
      return new Timestamp(val.seconds, val.nanoseconds || 0);
    } catch (e) {
      console.error("Error creating Timestamp from seconds:", e);
    }
  }
  if (typeof val === 'string') {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return Timestamp.fromDate(d);
      }
    } catch (e) {
      console.error("Error parsing date string:", e);
    }
  }
  return val;
};

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
        // A permission error here is expected when security rules restrict guest access on protected collections.
        // Since rules exist to block this, we safely assume users exist and keep the default true state.
        console.info("Info: system database secured or user list restricted.");
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

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Sync user with Firestore using uid as document ID
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          let userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            if (firebaseUser.email) {
              const cleanedEmail = firebaseUser.email.toLowerCase().trim();
              
              // 1. Try checking legacy email document (users/email_address)
              const emailDocRef = doc(db, 'users', cleanedEmail);
              const emailDoc = await getDoc(emailDocRef);
              
              if (emailDoc.exists()) {
                const preData = emailDoc.data();
                const newUserData = cleanObject({
                  ...preData,
                  displayName: firebaseUser.displayName || preData.displayName || 'Utilisateur',
                  uid: firebaseUser.uid,
                  photoURL: firebaseUser.photoURL || preData.photoURL || null,
                  email: cleanedEmail,
                  updatedAt: serverTimestamp(),
                  createdAt: preData.createdAt || serverTimestamp()
                });
                await setDoc(userDocRef, newUserData);
                await deleteDoc(emailDocRef);
                userDoc = await getDoc(userDocRef);
              } 
              // 2. Try querying users collection for ANY document matching this email (e.g. key was randomized/custom)
              else {
                const q = query(collection(db, 'users'), where('email', '==', cleanedEmail), limit(1));
                const snap = await getDocs(q);
                if (!snap.empty) {
                  const preDoc = snap.docs[0];
                  const preData = preDoc.data();
                  const newUserData = cleanObject({
                    ...preData,
                    uid: firebaseUser.uid,
                    email: cleanedEmail,
                    updatedAt: serverTimestamp(),
                    createdAt: preData.createdAt || serverTimestamp()
                  });
                  await setDoc(userDocRef, newUserData);
                  if (preDoc.id !== firebaseUser.uid) {
                    await deleteDoc(doc(db, 'users', preDoc.id));
                  }
                  userDoc = await getDoc(userDocRef);
                } 
                // 3. Fallback for the principal super admin
                else if (cleanedEmail === 'djelloulmohamed1990@gmail.com') {
                  const superAdminData = cleanObject({
                    displayName: firebaseUser.displayName || 'Super Admin',
                    email: cleanedEmail,
                    role: 'superadmin',
                    createdAt: serverTimestamp(),
                    photoURL: firebaseUser.photoURL || null,
                    permissions: {
                      canManageStock: true, canDeleteProducts: true, canSell: true, canProcessReturns: true,
                      canPerformInventory: true, canManageExpenses: true, canViewReports: true, canManageUsers: true
                    },
                    status: 'active',
                    uid: firebaseUser.uid
                  });
                  await setDoc(userDocRef, superAdminData);
                  userDoc = await getDoc(userDocRef);
                } 
                // 4. Deny access if unauthorized
                else {
                  console.warn("Utilisateur non trouvé dans Firestore après authentification:", cleanedEmail);
                  await signOut(auth);
                  setUserData(null);
                  setLoading(false);
                  return;
                }
              }
            } else if (firebaseUser.isAnonymous) {
              // This is an anonymous session. Check if we have a pending local login context
              const pendingLocalId = localStorage.getItem('mzsoft_pending_local_id');
              const pendingLocalDataStr = localStorage.getItem('mzsoft_pending_local_data');
              if (pendingLocalId) {
                let localData = null;
                if (pendingLocalDataStr) {
                  try {
                    localData = JSON.parse(pendingLocalDataStr);
                  } catch (e) {
                    console.error("Error parsing pending local user data:", e);
                  }
                }

                if (!localData) {
                  const localDocRef = doc(db, 'users', pendingLocalId);
                  const localDoc = await getDoc(localDocRef);
                  if (localDoc.exists()) {
                    localData = localDoc.data();
                  }
                }

                if (localData) {
                  const restoredCreatedAt = restoreTimestamp(localData.createdAt) || serverTimestamp();
                  await setDoc(userDocRef, cleanObject({
                    ...localData,
                    uid: firebaseUser.uid,
                    createdAt: restoredCreatedAt,
                    updatedAt: serverTimestamp()
                  }));
                  userDoc = await getDoc(userDocRef);
                  localStorage.removeItem('mzsoft_pending_local_id');
                  localStorage.removeItem('mzsoft_pending_local_data');
                }
              }
            } else {
              await signOut(auth);
              setLoading(false);
              return;
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
            localStorage.setItem('mzsoft_local_user', safeStringify({ id: userDoc.id, ...data }));
          }
        } catch (error) {
          console.error("Auth sync error:", safeStringify(error));
        }
      } else {
        setUserData(null);
        localStorage.removeItem('mzsoft_local_user');
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
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      if (user.email) {
        const cleanedEmail = user.email.toLowerCase().trim();
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const emailDocRef = doc(db, 'users', cleanedEmail);
        const emailDoc = await getDoc(emailDocRef);

        const q = query(collection(db, 'users'), where('email', '==', cleanedEmail), limit(1));
        const snap = await getDocs(q);

        if (!userDoc.exists() && !emailDoc.exists() && snap.empty && cleanedEmail !== 'djelloulmohamed1990@gmail.com') {
          await signOut(auth);
          throw new Error('Accès non autorisé : Vous n\'avez pas les permissions nécessaires.');
        }

        await notificationService.createNotification({
          type: 'user',
          title: 'Connexion Google',
          message: `L'utilisateur ${user.displayName || user.email} s'est connecté au système.`,
          priority: 'low',
          triggeredBy: user.uid,
          triggeredByName: user.displayName || user.email,
          metadata: { entityId: user.uid, entityType: 'user' }
        });
      }
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.log('Sign-in popup issue:', error.code);
      } else {
        console.error('Sign-in error:', safeStringify(error));
        throw error;
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const loginLocal = React.useCallback(async (usernameOrEmail: string, password: string) => {
    setIsSigningIn(true);
    try {
      const trimmed = usernameOrEmail.trim();
      let emailToAuth = '';
      let firestoreUserDoc: any = null;
      
      // 1. Try checking if there is a document with this username
      let q = query(collection(db, 'users'), where('username', '==', trimmed), limit(1));
      let snap = await getDocs(q);
      
      // 2. Try checking if there is a document with this email
      if (snap.empty) {
        q = query(collection(db, 'users'), where('email', '==', trimmed.toLowerCase()), limit(1));
        snap = await getDocs(q);
      }
      
      if (snap.empty) {
        // If not found in custom usernames/emails but username input itself is email, fall back to email
        if (trimmed.includes('@')) {
          emailToAuth = trimmed.toLowerCase();
        } else {
          throw new Error('Utilisateur non trouvé. Veuillez vérifier votre identifiant.');
        }
      } else {
        firestoreUserDoc = snap.docs[0];
        const data = firestoreUserDoc.data();
        if (data.status === 'inactive') {
          throw new Error('Votre compte est désactivé. Veuillez contacter un administrateur.');
        }
        
        // Match password against the Firestore-stored localPassword
        if (data.localPassword && data.localPassword !== password) {
          throw new Error('Mot de passe incorrect');
        }
        
        emailToAuth = data.email || `${data.username}@mzsoft.local`;
      }

      // 3. Connect using Firebase Authentication's Email and Password method
      let userCred;
      try {
        userCred = await signInWithEmailAndPassword(auth, emailToAuth, password);
      } catch (authError: any) {
        console.warn("Auth sign in failed, checking if we need to auto-create or sync client:", authError);
        
        // If we matched the firestore user document, they entered the correct password, so we can self-heal/sync
        if (firestoreUserDoc) {
          try {
            // Attempt to create the user in Firebase Auth
            userCred = await createUserWithEmailAndPassword(auth, emailToAuth, password);
            console.log("Successfully auto-created/synced Firebase Auth user.");
          } catch (createError: any) {
            // If user already exists (auth/email-already-in-use), but we couldn't sign in (e.g. out of sync)
            if (createError.code === 'auth/email-already-in-use') {
              try {
                // Out of sync! Let's update their Auth password using the secondary app utility
                await updateSecondaryAuthUserPassword(emailToAuth, 'mzsoft123', password);
                // Now try signing in again!
                userCred = await signInWithEmailAndPassword(auth, emailToAuth, password);
              } catch (syncErr) {
                console.error("Failed to sync out-of-sync password:", syncErr);
                throw new Error("Erreur d'authentification complète. Veuillez contacter votre administrateur.");
              }
            } else {
              throw createError;
            }
          }
        } else {
          throw authError;
        }
      }

      const loggedFirebaseUser = userCred.user;
      
      // If the Firestore document has a different ID other than loggedFirebaseUser.uid (e.g., if it was using a randomized string key)
      // we must sync the document to the uid-keyed path!
      if (firestoreUserDoc && firestoreUserDoc.id !== loggedFirebaseUser.uid) {
        const preData = firestoreUserDoc.data();
        const userDocRef = doc(db, 'users', loggedFirebaseUser.uid);
        const newUserData = cleanObject({
          ...preData,
          id: loggedFirebaseUser.uid,
          uid: loggedFirebaseUser.uid,
          updatedAt: serverTimestamp()
        });
        await setDoc(userDocRef, newUserData);
        await deleteDoc(doc(db, 'users', firestoreUserDoc.id));
        
        // Update local memory
        firestoreUserDoc = await getDoc(userDocRef);
      } else if (!firestoreUserDoc) {
        // If they logged in by typing a direct email that exists in Auth but didn't have a Firestore doc yet
        const userDocRef = doc(db, 'users', loggedFirebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          // Find if there's any document with this email
          const qSec = query(collection(db, 'users'), where('email', '==', emailToAuth), limit(1));
          const snapSec = await getDocs(qSec);
          if (!snapSec.empty) {
            const preDoc = snapSec.docs[0];
            const preData = preDoc.data();
            await setDoc(userDocRef, cleanObject({
              ...preData,
              id: loggedFirebaseUser.uid,
              uid: loggedFirebaseUser.uid,
              updatedAt: serverTimestamp()
            }));
            await deleteDoc(doc(db, 'users', preDoc.id));
          } else {
            // Standalone user creation (fallback)
            const fallbackUserData = {
              id: loggedFirebaseUser.uid,
              uid: loggedFirebaseUser.uid,
              email: emailToAuth,
              displayName: loggedFirebaseUser.displayName || emailToAuth.split('@')[0],
              role: 'vendeur',
              status: 'active',
              createdAt: serverTimestamp(),
              permissions: {
                canManageStock: false, canDeleteProducts: false, canSell: true, canProcessReturns: false,
                canPerformInventory: false, canManageExpenses: false, canViewReports: false, canManageUsers: false
              }
            };
            await setDoc(userDocRef, cleanObject(fallbackUserData));
          }
        }
      }

      const finalUserDocRef = doc(db, 'users', loggedFirebaseUser.uid);
      const finalDoc = await getDoc(finalUserDocRef);
      const loggedUserData = finalDoc.exists() ? (finalDoc.data() as UserData) : null;
      
      await notificationService.createNotification({
        type: 'user',
        title: 'Connexion Réussie',
        message: `L'utilisateur ${loggedUserData?.displayName || loggedFirebaseUser.email} s'est connecté.`,
        priority: 'low',
        triggeredBy: loggedFirebaseUser.uid,
        triggeredByName: loggedUserData?.displayName || loggedFirebaseUser.email || 'Utilisateur',
        metadata: { entityId: loggedFirebaseUser.uid, entityType: 'user' }
      });
      
    } catch (error: any) {
      console.error("Local login failed:", safeStringify(error));
      let friendlyMessage = error.message || "Erreur de connexion";
      if (error.code === 'auth/user-not-found' || error.message?.includes('user-not-found')) {
        friendlyMessage = "Utilisateur non trouvé";
      } else if (error.code === 'auth/wrong-password' || error.message?.includes('wrong-password') || error.message?.includes('invalid-credential')) {
        friendlyMessage = "Mot de passe incorrect";
      } else if (error.message?.includes('permission-denied') || error.message?.includes('permissions')) {
        friendlyMessage = "Accès refusé par les règles de sécurité Firestore de l'application";
      }
      throw new Error(friendlyMessage);
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const registerFirstAdmin = React.useCallback(async (username: string, password: string, displayName: string) => {
    setIsSigningIn(true);
    try {
      const q = query(collection(db, 'users'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        throw new Error('Un administrateur existe déjà dans le système.');
      }

      const email = username.includes('@') ? username.trim().toLowerCase() : `${username.trim().toLowerCase()}@mzsoft.local`;
      
      // 1. Create the user inside Firebase Authentication first
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const adminId = userCred.user.uid;

      // 2. Put their record in the uid-keyed path on Firestore
      const adminData: UserData = {
        id: adminId,
        username: username.trim(),
        localPassword: password,
        displayName: displayName.trim(),
        email: email,
        role: 'superadmin',
        createdAt: new Date(),
        isLocalOnly: false,
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

      setUserData(adminData);
      setUsersExist(true);
      localStorage.setItem('mzsoft_local_user', safeStringify(adminData));
    } catch (error: any) {
      console.error("Failed to register first admin:", safeStringify(error));
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

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
    setUserData(null);
    localStorage.removeItem('mzsoft_local_user');
  };

  const isSuperAdmin = userData?.role === 'superadmin' || 
                      auth.currentUser?.email?.toLowerCase() === 'djelloulmohamed1990@gmail.com' || 
                      userData?.email?.toLowerCase() === 'djelloulmohamed1990@gmail.com';
  
  const isAdminOnly = userData?.role === 'admin';
  const isAdmin = isSuperAdmin || isAdminOnly;

  const hasPermission = (permission: keyof UserPermissions) => {
    if (isSuperAdmin) return true;
    if (isAdminOnly && permission !== 'canManageUsers') return true;
    
    if (!userData?.permissions) {
      return false;
    }
    return !!userData.permissions[permission];
  };

  const authContextValue: AuthContextType = {
    user,
    userData,
    loading,
    signIn,
    loginLocal,
    registerFirstAdmin,
    logout,
    isAdmin,
    isSuperAdmin,
    usersExist,
    isSigningIn,
    hasPermission
  };

  return (
    <AuthContext.Provider value={authContextValue}>
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
