/**
 * ARCHITECTURE ERP PRO
 * -------------------
 * /src
 *   /components
 *     /layout      - Structure de base (Sidebar, Navbar, Layout)
 *     /ui          - Atomes graphiques (Button, Card, Input, Badge)
 *     /pos         - Composants spécifiques au Point de Vente
 *     /charts      - Wrappers Recharts
 *   /context       - États globaux (Auth, Theme, Notification)
 *   /firebase      - Config, Hooks Firebase, Securité, ErrorHandlers
 *   /hooks         - Logique React réutilisable (useStock, useSales)
 *   /pages         - Vues de premier niveau
 *   /services      - Logique métier transverse (PDF, Excel, Reporting)
 *   /types         - Interfaces TS partagées
 *   /utils         - Utilitaires (Formatage date/monnaie, calculs)
 */

import { 
  LayoutDashboard,
  ShoppingCart,
  Box,
  Tags,
  History,
  Users2,
  Truck,
  BarChart2,
  DollarSign,
  Settings,
  Wallet,
  ClipboardList,
  RotateCcw,
  ShieldCheck,
  FileText,
  Info
} from 'lucide-react';

export const APP_CONFIG = {
  name: 'MZSoft',
  currency: 'DA',
  taxRate: 0.19, // TVA standard en Algérie
  lowStockThreshold: 10,
};

export const MENU_ITEMS = [
  { id: 'dashboard', label: 'Tableau de bord', path: '/', icon: LayoutDashboard },
  { id: 'pos', label: 'Vente (POS)', path: '/pos', icon: ShoppingCart },
  { id: 'inventory', label: 'Stock / Produits', path: '/inventory', icon: Box },
  { id: 'inventory-audits', label: 'Inven. Physique', path: '/inventory/audits', icon: ClipboardList },
  { id: 'stock-movements', label: 'Historique Stock', path: '/stock-movements', icon: History },
  { id: 'categories', label: 'Catégories', path: '/categories', icon: Tags },
  { id: 'sales-history', label: 'Historique Ventes', path: '/sales-history', icon: History },
  { id: 'returns', label: 'Retours / Bons', path: '/sales-history?mode=return', icon: RotateCcw },
  { id: 'customers', label: 'Clients', path: '/customers', icon: Users2 },
  { id: 'suppliers', label: 'Fournisseurs', path: '/suppliers', icon: Truck },
  { id: 'expenses', label: 'Dépenses', path: '/expenses', icon: DollarSign },
  { id: 'cash-history', label: 'Historique Caisse', path: '/cash-history', icon: Wallet },
  { id: 'users', label: 'Utilisateurs', path: '/users', icon: ShieldCheck },
  { id: 'quotes', label: 'Devis', path: '/quotes', icon: FileText },
  { id: 'invoices', label: 'Facturation', path: '/invoices', icon: FileText },
  { id: 'reports', label: 'Rapports', path: '/reports', icon: BarChart2 },
  { id: 'settings', label: 'Paramètres', path: '/settings', icon: Settings },
];

export const THEME_COLORS = {
  indigo: '#6366f1',
  slate: {
    800: '#1e293b',
    900: '#0f172a',
  },
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
};
