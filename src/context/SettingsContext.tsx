import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CompanySettings } from '../types';
import { useNotification } from './NotificationContext';
import { useAuth } from './AuthContext';
import { setGlobalCurrency } from '../lib/utils';
import { setPdfSettings } from '../services/pdfService';

interface SettingsContextType {
  settings: CompanySettings;
  loading: boolean;
  updateSettings: (newSettings: Partial<CompanySettings>) => Promise<void>;
}

const DEFAULT_SETTINGS: CompanySettings = {
  id: 'company',
  name: 'Ma Boutique',
  currency: 'DZD',
  currencySymbol: 'DA',
  slogan: 'Votre satisfaction est notre priorité',
  address: '',
  phone: '',
  email: '',
  nif: '',
  rc: '',
  tva: '',
  footerText: 'Merci de votre confiance !',
  lockSessions: false,
  useTax: false,
  taxRate: 19,
  notifyLowStock: true,
  notifyStockDiscrepancy: true,
  notifyCashDiscrepancy: true,
  customCompanyInfo: '',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const { showToast } = useNotification();
  const { isAdmin } = useAuth();

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'company'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as CompanySettings;
        setSettings(data);
        // Sync global dynamic values
        setGlobalCurrency(data.currency, data.currencySymbol);
        setPdfSettings(data);
        document.title = data.name;
        setLoading(false);
      } else {
        // Only admin should initialize settings
        if (isAdmin) {
          setDoc(doc(db, 'settings', 'company'), {
            ...DEFAULT_SETTINGS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } as any)
            .then(() => setLoading(false))
            .catch(err => {
              console.warn("Failed to initialize settings (expected if not admin):", err);
              setLoading(false);
            });
          setGlobalCurrency(DEFAULT_SETTINGS.currency, DEFAULT_SETTINGS.currencySymbol);
          setPdfSettings(DEFAULT_SETTINGS);
          document.title = DEFAULT_SETTINGS.name;
        } else {
          // Just stop loading if not admin and settings don't exist yet
          // (They should exist in a real production environment)
          setLoading(false);
        }
      }
    }, (error) => {
      // If we get a permission error, it might be because auth isn't ready yet or public read is propagating
      console.warn("Error loading settings:", error);
      // Don't keep loading forever on error
      setLoading(false);
    });

    return () => unsub();
  }, [isAdmin]);

  const updateSettings = async (newSettings: Partial<CompanySettings>) => {
    try {
      await setDoc(doc(db, 'settings', 'company'), {
        ...settings,
        ...newSettings,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast('Paramètres mis à jour avec succès', 'success');
    } catch (error) {
      console.error("Error updating settings:", error);
      showToast('Erreur lors de la mise à jour des paramètres', 'error');
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
