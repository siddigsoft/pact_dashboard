import type { FirebaseConfig } from '@/types/fcm';

export const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const firebaseVapidPublicKey = import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY as string | undefined;

// Check if Firebase is properly configured
// Also validates that project ID matches the auth domain pattern
const validateFirebaseConfig = (): boolean => {
  const { apiKey, authDomain, projectId, appId } = firebaseConfig;
  
  // All required fields must be present
  if (!apiKey || !authDomain || !projectId || !appId) {
    console.log('[Firebase] Missing required config fields');
    return false;
  }
  
  // Auth domain should START with the project ID (e.g., "my-project.firebaseapp.com")
  // This catches misconfiguration where project ID doesn't match other settings
  // Extract the subdomain from auth domain (e.g., "tpm-workflow" from "tpm-workflow.firebaseapp.com")
  const authDomainProject = authDomain.split('.')[0];
  
  // Check if the auth domain project matches the project ID
  if (authDomainProject.toLowerCase() !== projectId.toLowerCase()) {
    console.warn('[Firebase] Configuration mismatch detected: projectId does not match authDomain');
    console.warn(`[Firebase] projectId: "${projectId}", authDomain project: "${authDomainProject}"`);
    return false;
  }
  
  return true;
};

export const isFirebaseConfigured = validateFirebaseConfig();
