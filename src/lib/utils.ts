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
 * Safely clone objects with circular references to prevent stringify failures
 */
export function safeClone(val: any, depth = 0, visited = new WeakSet()): any {
  if (val === null || val === undefined) {
    return val;
  }

  const type = typeof val;
  if (type !== 'object' && type !== 'function') {
    return val;
  }

  // Handle circular references right at the entry point of object/function type
  if (visited.has(val)) {
    return '[Circular]';
  }

  // Prevent infinite depth
  if (depth > 6) {
    return '[Max Depth Reached]';
  }

  // Add to visited before recursing
  visited.add(val);

  // Handle common circular/complex browser types
  if (typeof window !== 'undefined') {
    if (val === window) return '[Window]';
    if (val === document) return '[Document]';
    try {
      if (val instanceof Node || (val.nodeType && typeof val.nodeName === 'string')) {
        return `[HTMLElement: ${val.nodeName || 'Element'}]`;
      }
    } catch {
      return '[HTMLElement]';
    }
  }

  // Handle Errors (even across iframe boundary, check name and message)
  if (val instanceof Error || (val && typeof val === 'object' && ('name' in val || 'message' in val || 'stack' in val))) {
    return {
      name: val.name || 'Error',
      message: val.message || String(val),
      stack: val.stack
    };
  }

  // Handle Dates
  if (val instanceof Date) {
    return val.toISOString();
  }

  // Handle Firestore Timestamp specifically
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      // ignore
    }
  }

  // Handle Functions
  if (type === 'function') {
    return `[Function: ${val.name || 'anonymous'}]`;
  }

  // Handle Array
  if (Array.isArray(val)) {
    const arrClone: any[] = [];
    for (let i = 0; i < val.length; i++) {
      try {
        arrClone.push(safeClone(val[i], depth + 1, visited));
      } catch (e) {
        arrClone.push('[Unreadable Item]');
      }
    }
    return arrClone;
  }

  // Handle Object
  const constructorName = val.constructor?.name;

  // Let's check for standard types we shouldn't fully serialize if they are internal engines
  if (constructorName && !['Object', 'Array'].includes(constructorName)) {
    // If it's a minified Firestore or complex SDK class name, or starts with uppercase and is not a plain Object,
    // let's avoid traversing it deeply to prevent crashing on native fields / internal pointers.
    if (constructorName.length <= 2 || constructorName.includes('_') || ['Firestore', 'DocumentReference', 'CollectionReference', 'Query', 'QuerySnapshot', 'DocumentSnapshot'].includes(constructorName)) {
      return `[Internal Class: ${constructorName}]`;
    }
  }

  const objClone: any = {};
  
  // Get all keys safely
  let keys: string[] = [];
  try {
    keys = Object.keys(val);
  } catch {
    try {
      keys = [];
      for (const k in val) {
        keys.push(k);
      }
    } catch {
      return `[Uninspectable Object: ${constructorName || 'Unknown'}]`;
    }
  }

  for (const key of keys) {
    try {
      // Safely access properties - some getters can throw exceptions
      const propValue = val[key];
      objClone[key] = safeClone(propValue, depth + 1, visited);
    } catch (err: any) {
      objClone[key] = `[Unreadable Property: ${err?.message || 'Error'}]`;
    }
  }

  return objClone;
}

/**
 * Safely stringify objects with circular references
 * Manually traverses the object to avoid circularity issues before JSON.stringify
 */
export function safeStringify(obj: any): string {
  try {
    const cleanObj = safeClone(obj);
    return JSON.stringify(cleanObj, null, 2);
  } catch (err) {
    try {
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

/**
 * Safely parse any date value (Timestamp, Date, strings, DD/MM/YYYY) without throwing RangeError
 */
export function getSafeDate(dateField: any): Date {
  if (!dateField) return new Date();
  
  // If it's a Firestore Timestamp or has .toDate method
  if (typeof dateField === 'object' && dateField !== null) {
    if (typeof dateField.toDate === 'function') {
      try {
        const d = dateField.toDate();
        if (d && !isNaN(d.getTime())) return d;
      } catch {}
    }
    if (typeof dateField.seconds === 'number') {
      const d = new Date(dateField.seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // If it's already a Date
  if (dateField instanceof Date) {
    return isNaN(dateField.getTime()) ? new Date() : dateField;
  }

  // If it's a string, try parsing it
  if (typeof dateField === 'string') {
    const trimmed = dateField.trim();
    if (!trimmed) return new Date();

    // Check for DD/MM/YYYY or DD/MM/YYYY HH:mm
    const dmYRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
    const match = trimmed.match(dmYRegex);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 0-based month
      const year = parseInt(match[3], 10);
      const hours = match[4] ? parseInt(match[4], 10) : 0;
      const minutes = match[5] ? parseInt(match[5], 10) : 0;
      const seconds = match[6] ? parseInt(match[6], 10) : 0;
      const d = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(d.getTime())) return d;
    }
    
    // Check if it's formatted as 'YYYY-MM-DD' or similar
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback for numbers (timestamps in milliseconds) or anything else
  const d = new Date(dateField);
  return isNaN(d.getTime()) ? new Date() : d;
}

