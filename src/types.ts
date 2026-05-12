import { Timestamp } from 'firebase/firestore';

export interface BaseEntity {
  id: string;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface UserData extends BaseEntity {
  email: string;
  displayName: string;
  role: 'admin' | 'staff';
  photoURL?: string;
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
}

export interface StockMovement extends BaseEntity {
  productId: string;
  productName: string;
  type: 'sale' | 'purchase' | 'adjustment_in' | 'adjustment_out' | 'return' | 'initial';
  quantity: number;
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
