import { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  QueryConstraint,
  DocumentData 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { safeStringify } from '../lib/utils';

// Helper to serialize query constraints safely into a stable string key
function getConstraintsKey(constraints: any[]): string {
  try {
    return constraints.map(c => {
      if (!c) return '';
      if (typeof c === 'object') {
        const type = c.type || c.constraintType || c.constructor?.name || '';
        const obj: any = { type };
        
        // Safely extract primitive properties to detect physical shifts in filters/order
        for (const k of Object.keys(c)) {
          const val = c[k];
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            obj[k] = val;
          } else if (val && typeof val === 'object') {
            if (typeof val.toMillis === 'function') {
              obj[k] = val.toMillis();
            } else if (val.segments && Array.isArray(val.segments)) {
              obj[k] = val.segments.join('.');
            } else if (typeof val.toString === 'function' && k === 'op') {
              obj[k] = val.toString();
            }
          }
        }
        return JSON.stringify(obj);
      }
      return String(c);
    }).join('|');
  } catch (e) {
    return String(constraints.length);
  }
}

export function useCollection<T = DocumentData>(
  collectionName: string, 
  queryConstraints: QueryConstraint[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Derive stable constraints serialization key
  const constraintsKey = useMemo(() => getConstraintsKey(queryConstraints), [queryConstraints]);

  useEffect(() => {
    let isMounted = true;
    
    // Initialize query
    const q = query(collection(db, collectionName), ...queryConstraints);
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isMounted) return;
        const items = snapshot.docs.map(doc => {
          try {
            return {
              id: doc.id,
              ...doc.data()
            } as T;
          } catch (e) {
            console.error(`Error mapping doc ${doc.id} in ${collectionName}:`, e);
            return null;
          }
        }).filter(Boolean) as T[];
        
        setData(items);
        setLoading(false);
        setIsInitialLoad(false);
        setError(null);
      },
      (err) => {
        if (!isMounted) return;
        console.error(`Error fetching collection ${collectionName}:`, safeStringify(err));
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        setIsInitialLoad(false);
        try {
          // Only handle error if it's a real permission issue
          if (err.message?.includes('permission')) {
             handleFirestoreError(err, OperationType.LIST, collectionName);
          }
        } catch (e) {
          console.error("Secondary error in handler:", safeStringify(e));
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [collectionName, constraintsKey]);

  return { data: data || [], loading, isInitialLoad, error };
}
