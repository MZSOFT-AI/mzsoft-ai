import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for merging tailwind classes safely
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Global currency configuration
 */
let globalCurrencyCode = 'DZD';
let globalCurrencySymbol = 'DA';

export function setGlobalCurrency(code: string, symbol: string) {
  globalCurrencyCode = code;
  globalCurrencySymbol = symbol;
}

/**
 * Format currency using global settings
 */
export function formatCurrency(amount: number): string {
  try {
    return amount.toLocaleString('fr-DZ', {
      style: 'currency',
      currency: globalCurrencyCode || 'DZD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).replace(globalCurrencyCode || 'DZD', globalCurrencySymbol || 'DA');
  } catch (e) {
    return `${amount.toFixed(2)} ${globalCurrencySymbol || 'DA'}`;
  }
}

/**
 * Remove undefined values from an object safely
 */
export function cleanObject(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // If it is a special Firestore object (Timestamp, FieldValue, etc), return as-is
  // These usually have a constructor name that isn't 'Object' or are not plain objects
  if (obj.constructor && obj.constructor.name !== 'Object' && obj.constructor.name !== 'Array') {
    return obj;
  }
  
  try {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (value !== undefined) acc[key] = value;
      return acc;
    }, {} as any);
  } catch (err) {
    return obj;
  }
}

/**
 * Safely stringify objects with circular references
 * Manually traverses the object to avoid circularity issues before JSON.stringify
 */
export function safeStringify(obj: any): string {
  // Use a WeakSet to track visited objects for circularity detection (avoids memory leaks)
  const cache = new WeakSet();
  
  const replacer = (key: string, value: any) => {
    // Handle null/undefined immediately
    if (value === null || value === undefined) return value;
    
    // Only objects and functions can be circular
    if (typeof value === 'object' || typeof value === 'function') {
      if (cache.has(value)) {
        return '[Circular]';
      }
      
      // Handle common circular/complex types that shouldn't be stringified deeply
      if (typeof window !== 'undefined') {
        if (value === window) return '[Window]';
        if (value === document) return '[Document]';
        
        // Handle DOM elements (they are highly circular)
        try {
          if (value instanceof Node || (value.nodeType && typeof value.nodeName === 'string')) {
            return `[HTMLElement: ${value.nodeName || 'Element'}]`;
          }
        } catch (e) {
          // Ignore
        }
      }

      // Handle Errors
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }

      // Handle Firestore and other complex class instances
      try {
        const constructorName = value.constructor?.name;
        if (constructorName && !['Object', 'Array', 'Date', 'Number', 'String', 'Boolean'].includes(constructorName)) {
          // Special handling for Firestore objects
          if (typeof value.toDate === 'function') return value.toDate().toISOString();
          
          // For other complex objects (especially minified ones like Y2, Ka from Firestore), return just the name
          // Minified names are usually very short (1-2 chars) or contain underscores
          if (constructorName.length <= 2 || constructorName.includes('_')) { 
             return `[Internal Object: ${constructorName}]`;
          }
        }
      } catch (e) {
        return '[Uninspectable Object]';
      }

      // Only add to cache if it's an object we might visit again (not converted to primitive yet)
      cache.add(value);
    }
    return value;
  };

  try {
    return JSON.stringify(obj, replacer, 2);
  } catch (err) {
    try {
      // Fallback for extreme cases: use String() which handles circularity by just printing the top level
      return `[Serialization Failure: ${String(err)}]`;
    } catch {
      return '[Total Serialization Failure]';
    }
  }
}

/**
 * Safely parse a firestore error stringified JSON
 */
export function parseFirestoreError(error: any): { error: string, path?: string, operation?: string } {
  const defaultError = { error: error?.message || String(error) || 'Une erreur inconnue est survenue' };
  
  if (!error || !error.message) return defaultError;

  try {
    const data = JSON.parse(error.message);
    return {
      error: data.error || 'Erreur Firestore',
      path: data.path,
      operation: data.operationType
    };
  } catch (e) {
    // Check if it's a standard Firebase permission error
    if (error.message.includes('permission-denied') || error.message.includes('insufficient permissions')) {
      return { error: 'Droit d\'accès insuffisant pour cette opération.' };
    }
    return defaultError;
  }
}
