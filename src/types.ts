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
}

export interface UserData extends BaseEntity {
  email: string | null;
  username?: string;
  localPassword?: string;
  displayName: string;
  role: 'admin' | 'vendeur' | 'manager' | 'staff';
  photoURL?: string;
  isPreAuthorized?: boolean;
  isLocalOnly?: boolean;
  permissions?: UserPermissions;
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
  totalSpent: number;
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

export interface Sale extends BaseEntity {
  items: SaleItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  customerName?: string;
  userId: string;
  userName?: string;
  status?: 'completed' | 'partially_returned' | 'returned';
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
  actualCashInDrawer?: number;
  nextSessionCash?: number;
  difference?: number;
}
