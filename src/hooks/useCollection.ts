import { useState, useEffect } from 'react';
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

export function useCollection<T = DocumentData>(
  collectionName: string, 
  queryConstraints: QueryConstraint[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
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
  }, [collectionName]);

  return { data: data || [], loading, isInitialLoad, error };
}
