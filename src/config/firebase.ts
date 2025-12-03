import type { FirebaseConfig } from '@/types/fcm';

export const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB1VL-A5UCtFCi_EqLCkWUt2CASqWC31cs',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'tpm-workflow.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tpm-workflow',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'tpm-workflow.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '254377984264',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:254377984264:web:258a850c95ebcdf223acbd',
};

export const firebaseVapidPublicKey = import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY as string | undefined;
