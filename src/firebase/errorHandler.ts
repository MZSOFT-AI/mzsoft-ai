
import { auth } from './config';
import { safeStringify } from '../lib/utils';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  timestamp: string;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  let errorMessage = 'Unknown error';
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    try {
      errorMessage = safeStringify(error);
    } catch {
      errorMessage = String(error);
    }
  }

  const errInfo: any = {
    error: errorMessage,
    operationType,
    path,
    timestamp: new Date().toISOString(),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
    }
  };
  
  const jsonStr = safeStringify(errInfo);
  console.error('Firestore Error:', jsonStr);
  throw new Error(jsonStr);
}
