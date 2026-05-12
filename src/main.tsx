import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase/config';

// Test connection on boot
const testConnection = async () => {
  try {
    // Try server first to verify online status
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
  } catch (error: any) {
    if (error.message?.includes('failed-precondition') || error.message?.includes('permission-denied')) {
      // These mean we ARE connected, but just don't have access to this test doc (expected)
      console.log("Firebase connection verified.");
    } else if (error.message?.includes('unavailable') || error.message?.includes('offline')) {
      console.error("Firebase is offline. Please check your internet connection.");
    } else {
      // Other errors might also mean we are connected
      console.log("Firebase connection state check completed.");
    }
  }
};

testConnection();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
