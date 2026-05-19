import { Timestamp } from 'firebase/firestore';

export interface BaseEntity {
  id: string;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface UserPermissions {
  canManageStock: boolean;
  canDeleteProducts: boolean;
  canSell: boolean;
  canProcessReturns: boolean;
  canPerformInventory: boolean;
  canManageExpenses: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
}

export interface UserData extends BaseEntity {
  email: string | null;
  username?: string;
  localPassword?: string;
  displayName: string;
  role: 'superadmin' | 'admin' | 'manager' | 'vendeur';
  uid?: string;
  photoURL?: string;
  lastLogoutAt?: any;
  isPreAuthorized?: boolean;
  isLocalOnly?: boolean;
  permissions?: UserPermissions;
  status?: 'active' | 'inactive';
  lastLoginAt?: Timestamp | Date;
}

export interface Category extends BaseEntity {
  name: string;
}

export interface Product extends BaseEntity {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  categoryId: string;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minStockLevel: number;
  unit?: 'u' | 'm' | 'ml' | 'kg' | 'l';
  sellInML?: boolean;
  unitsPerRoll?: number;
  pricePerML?: number;
}

export interface StockMovement extends BaseEntity {
  productId: string;
  productName: string;
  type: 'sale' | 'purchase' | 'adjustment_in' | 'adjustment_out' | 'return' | 'initial' | 'in' | 'out';
  quantity: number;
  unit?: string;
  previousStock: number;
  newStock: number;
  reason?: string;
  userId: string;
  userName?: string;
  referenceId?: string;
}

export interface Customer extends BaseEntity {
  name: string;
  clientCode?: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  nif?: string;
  rc?: string;
  ai?: string;
  totalSpent: number;
  totalPaid: number;
  totalDebt: number;
}

export interface SaleItem {
  id: string;
  name: string;
  quantity: number;
  returnedQuantity?: number;
  unit?: string;
  price: number;
  total: number;
}

export interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  price: number;
  total: number;
  isManual?: boolean;
}

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  price: number;
  total: number;
  isManual?: boolean;
}

export interface Quote extends BaseEntity {
  quoteNumber: string;
  items: QuoteItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  discount: number;
  totalAmount: number;
  customerName?: string;
  customerId?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerNIF?: string;
  customerRC?: string;
  customerAI?: string;
  userId: string;
  userName?: string;
  status: 'draft' | 'sent' | 'accepted' | 'converted' | 'expired';
  expiryDate?: Timestamp | Date;
  notes?: string;
  customCompanyInfo?: string;
}

export interface Invoice extends BaseEntity {
  invoiceNumber: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  discount: number;
  totalAmount: number;
  receivedAmount?: number;
  amountPaid: number;
  balance: number;
  change?: number;
  customerName?: string;
  customerId?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerNIF?: string;
  customerRC?: string;
  customerAI?: string;
  userId: string;
  userName?: string;
  status: 'draft' | 'validated' | 'paid' | 'cancelled' | 'pending';
  paymentMethod?: 'cash' | 'card' | 'transfer';
  paymentStatus: 'pending' | 'partially_paid' | 'paid';
  notes?: string;
  dueDate?: Timestamp | Date;
  referenceQuoteId?: string;
  paymentHistory?: PaymentRecord[];
  customCompanyInfo?: string;
}

export interface PaymentRecord {
  amount: number;
  date: Timestamp | Date;
  method: string;
  note?: string;
  userId: string;
  userName?: string;
}

export interface Sale extends BaseEntity {
  items: SaleItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  customerName?: string;
  userId: string;
  userName?: string;
  status?: 'completed' | 'partially_returned' | 'returned';
  customCompanyInfo?: string;
}

export interface Supplier extends BaseEntity {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Expense extends BaseEntity {
  category: string;
  reason: string;
  amount: number;
  userId: string;
  userName?: string;
  date?: Timestamp | Date;
}

export interface CompanySettings extends BaseEntity {
  name: string;
  logo?: string;
  slogan?: string;
  address?: string;
  phone?: string;
  email?: string;
  nif?: string;
  rc?: string;
  ai?: string;
  nis?: string;
  tva?: string;
  footerText?: string;
  currency: string;
  currencySymbol: string;
  lockSessions?: boolean;
  useTax?: boolean;
  taxRate?: number;
  notifyLowStock?: boolean;
  notifyStockDiscrepancy?: boolean;
  notifyCashDiscrepancy?: boolean;
  notificationSound?: boolean;
  desktopNotifications?: boolean;
  customCompanyInfo?: string;
}

export interface DailyClosing extends BaseEntity {
  date: string; // ISO YYYY-MM-DD
  startTime: any;
  endTime?: any;
  status: 'open' | 'closed';
  userId: string;
  userName: string;
  startingCash: number;
  cashSales: number;
  transferSales: number;
  totalSales: number;
  expenses: number;
  netCash: number;
  salesCount: number;
  closedBy?: string;
  closedByName?: string;
  closingNote?: string;
  actualCashInDrawer?: number; // Total counted cash (Real)
  theoreticalCash?: number;    // StartingCash + CashSales - Expenses
  difference?: number;         // actualCashInDrawer - theoreticalCash
  withdrawnAmount?: number;    // Amount taken out for bank/safe
  nextSessionCash?: number;    // Float left in drawer for next session
}

export interface AppNotification extends BaseEntity {
  type: 'low_stock' | 'stock_discrepancy' | 'cash_discrepancy' | 'system' | 'sale' | 'invoice' | 'quote' | 'user' | 'deletion' | 'payment' | 'security';
  title: string;
  message: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'unread' | 'read' | 'archived';
  metadata?: {
    link?: string;
    entityId?: string;
    entityType?: 'sale' | 'product' | 'invoice' | 'user' | 'quote' | 'stock_movement' | 'expense' | 'category';
    [key: string]: any;
  };
  userId?: string; // Recipient (null for all admins)
  userName?: string;
  triggeredBy?: string;
  triggeredByName?: string;
}
