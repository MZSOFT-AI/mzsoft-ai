import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Creates a standard user in Firebase Authentication without logging out the currently signed-in user.
 * It initializes a secondary Firebase App instance, registers the user, signs out, and cleans up.
 */
export const createSecondaryAuthUser = async (email: string, password: string): Promise<string> => {
  const secondaryAppName = `SecondaryApp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    try {
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = userCred.user.uid;
      await signOut(secondaryAuth);
      return uid;
    } catch (createErr: any) {
      if (createErr.code === 'auth/email-already-in-use' || createErr.message?.includes('already-in-use') || createErr.message?.includes('already-exists')) {
        try {
          const loginCred = await signInWithEmailAndPassword(secondaryAuth, email, password);
          const uid = loginCred.user.uid;
          await signOut(secondaryAuth);
          return uid;
        } catch (loginErr: any) {
          throw new Error("L'adresse email '" + email + "' est déjà associée à un compte existant avec un mot de passe différent dans Firebase. Veuillez utiliser un autre identifiant/email ou contacter votre administrateur.");
        }
      } else {
        throw createErr;
      }
    }
  } finally {
    await deleteApp(secondaryApp);
  }
};

/**
 * Updates a standard user's password in Firebase Authentication without logging out the currently signed-in user.
 * It signs in as the user in a secondary Firebase App, updates the password, and cleans up.
 */
export const updateSecondaryAuthUserPassword = async (email: string, oldPassword: string, newPassword: string): Promise<void> => {
  const secondaryAppName = `SecondaryApp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const userCred = await signInWithEmailAndPassword(secondaryAuth, email, oldPassword);
    if (userCred.user) {
      await updatePassword(userCred.user, newPassword);
    }
    await signOut(secondaryAuth);
  } finally {
    await deleteApp(secondaryApp);
  }
};

export default app;
