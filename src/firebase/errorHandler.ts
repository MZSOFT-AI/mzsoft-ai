
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
  
  // Extract a readable message first
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

  // Create minimal errInfo for logging
  const errInfo = {
    error: errorMessage,
    operationType,
    path,
    timestamp: new Date().toISOString(),
    auth: {
      uid: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
    }
  };
  
  try {
    const jsonStr = safeStringify(errInfo);
    console.error('Firestore Error Details:', jsonStr);
  } catch (e) {
    console.error('Firestore Error (Raw):', errorMessage);
  }

  // Throw a standard error with just the message
  // This prevents global handlers from choking on massive JSON strings if they try to stringify
  const finalError = new Error(errorMessage);
  (finalError as any).operationType = operationType;
  (finalError as any).path = path;
  
  throw finalError;
}
