import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for merging tailwind classes safely
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency in Dinar Algérien
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).replace('DZD', 'DA');
}

/**
 * Remove undefined values from an object
 */
export function cleanObject(obj: any): any {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== undefined) acc[key] = value;
    return acc;
  }, {} as any);
}
