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
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, collectionName), ...queryConstraints);
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as T));
        setData(items);
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching collection ${collectionName}:`, safeStringify(err));
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, collectionName);
        } catch (e) {
          console.error("Secondary error in handler:", safeStringify(e));
        }
      }
    );

    return () => unsubscribe();
  }, [collectionName]);

  return { data, loading, error };
}
