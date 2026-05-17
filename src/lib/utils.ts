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
  const cache = new WeakSet();

  const getSerializable = (o: any, depth: number = 0): any => {
    // Handle null, undefined, and non-objects
    if (o === null || typeof o !== 'object') {
      return o;
    }

    // Protection against extremely deep/infinite structures
    if (depth > 8) {
      return '[Max Depth Reached]';
    }

    // Handle circular references
    if (cache.has(o)) {
      return '[Circular]';
    }
    
    // Add to cache before processing properties
    cache.add(o);

    // Handle Firestore Timestamps explicitly
    if (typeof o.toDate === 'function' && typeof o.seconds === 'number') {
      return o.toDate().toISOString();
    }

    // Handle Dates
    if (o instanceof Date) {
      return o.toISOString();
    }

    // Handle Errors (standard JSON.stringify(new Error) returns {})
    if (o instanceof Error) {
      const errorObj: any = {
        name: o.name,
        message: o.message,
        stack: o.stack,
      };
      // Capture custom properties on the error
      Object.getOwnPropertyNames(o).forEach(key => {
        if (!['name', 'message', 'stack'].includes(key)) {
          try {
            const val = (o as any)[key];
            if (typeof val !== 'function' && key !== 'toJSON') {
              errorObj[key] = getSerializable(val, depth + 1);
            }
          } catch (e) {
            errorObj[key] = '[Unreadable Property]';
          }
        }
      });
      return errorObj;
    }

    // Handle Arrays
    if (Array.isArray(o)) {
      return o.map(item => {
        try {
          return getSerializable(item, depth + 1);
        } catch {
          return '[Error in array serialization]';
        }
      });
    }

    // Handle Objects
    // If it's a class instance (not a plain object or array), be more careful
    const constructorName = o.constructor?.name;
    const isPlainObject = !constructorName || constructorName === 'Object';

    if (!isPlainObject) {
      // For complex objects (like Firestore internal classes), don't try to recurse deeply
      // or at all if it's very likely to be circular/complex
      if (depth > 2) {
        return `[Complex Object: ${constructorName || 'Unknown'}]`;
      }
    }

    const result: Record<string, any> = {};
    
    // Instead of for...in (which follows prototype chain), use Object.keys for own properties
    const keys = Object.keys(o);
    
    for (const key of keys) {
      try {
        const val = o[key];
        
        // Skip functions and the special toJSON property
        if (typeof val === 'function' || key === 'toJSON') {
          continue;
        }

        // Skip potentially problematic properties (like DOM nodes if they leak in)
        if (val && typeof val === 'object') {
          if ('nodeType' in val || val.constructor?.name === 'Window') {
            result[key] = '[Complex Browser Object]';
            continue;
          }
        }
        
        result[key] = getSerializable(val, depth + 1);
      } catch (e) {
        result[key] = '[Unreadable Property]';
      }
    }
    
    return result;
  };

  try {
    const serializable = getSerializable(obj, 0);
    return JSON.stringify(serializable, null, 2);
  } catch (err) {
    // Ultimate fallback if JSON.stringify still fails
    try {
      // Try one more time with a super shallow version
      const shallow: any = {};
      Object.keys(obj).forEach(k => {
        const v = obj[k];
        shallow[k] = typeof v === 'object' ? `[Object ${v?.constructor?.name || '?'}]` : v;
      });
      return JSON.stringify(shallow, null, 2);
    } catch {
      return `[Final Stringify Error: ${String(err)}]`;
    }
  }
}
