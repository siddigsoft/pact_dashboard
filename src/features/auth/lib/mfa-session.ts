/**
 * MFA Session Management Module
 * 
 * Provides secure handling of Multi-Factor Authentication sessions:
 * - Proper session cleanup on logout
 * - Session timeout management
 * - Secure token storage with expiration
 * - Session state persistence across app restarts
 */

export interface MFASession {
  userId: string;
  verifiedAt: string;
  expiresAt: string;
  method: 'totp' | 'email' | 'sms' | 'biometric';
  deviceId?: string;
  sessionId: string;
}

export interface MFASessionState {
  isVerified: boolean;
  session: MFASession | null;
  requiresVerification: boolean;
  remainingTime: number; // in seconds
}

const MFA_SESSION_KEY = 'pact_mfa_session';
const MFA_PENDING_KEY = 'pact_mfa_pending';
const DEFAULT_SESSION_DURATION_MINUTES = 30;
const EXTENDED_SESSION_DURATION_MINUTES = 480; // 8 hours for "remember this device"

/**
 * Generate a secure session ID
 */
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a new MFA session after successful verification
 */
export function createMFASession(
  userId: string,
  method: MFASession['method'],
  options?: {
    deviceId?: string;
    extendedSession?: boolean;
  }
): MFASession {
  const now = new Date();
  const durationMinutes = options?.extendedSession 
    ? EXTENDED_SESSION_DURATION_MINUTES 
    : DEFAULT_SESSION_DURATION_MINUTES;
  
  const session: MFASession = {
    userId,
    verifiedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString(),
    method,
    deviceId: options?.deviceId,
    sessionId: generateSessionId(),
  };
  
  // Store session securely
  try {
    const encrypted = encryptSession(session);
    sessionStorage.setItem(MFA_SESSION_KEY, encrypted);
    console.log('[MFASession] Session created, expires:', session.expiresAt);
  } catch (error) {
    console.error('[MFASession] Failed to store session:', error);
  }
  
  return session;
}

/**
 * Simple encryption for session data (defense in depth)
 * In production, consider using Web Crypto API with proper key management
 */
function encryptSession(session: MFASession): string {
  const json = JSON.stringify(session);
  // Base64 encode with a simple transform
  const encoded = btoa(json);
  // Reverse the string as a simple obfuscation
  return encoded.split('').reverse().join('');
}

/**
 * Decrypt session data
 */
function decryptSession(encrypted: string): MFASession | null {
  try {
    // Reverse the string
    const encoded = encrypted.split('').reverse().join('');
    const json = atob(encoded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Get the current MFA session if valid
 */
export function getMFASession(): MFASession | null {
  try {
    const encrypted = sessionStorage.getItem(MFA_SESSION_KEY);
    if (!encrypted) return null;
    
    const session = decryptSession(encrypted);
    if (!session) {
      // Invalid session data, clean up
      clearMFASession();
      return null;
    }
    
    // Check expiration
    if (new Date(session.expiresAt) <= new Date()) {
      console.log('[MFASession] Session expired');
      clearMFASession();
      return null;
    }
    
    return session;
  } catch {
    clearMFASession();
    return null;
  }
}

/**
 * Get current MFA session state
 */
export function getMFASessionState(userId: string): MFASessionState {
  const session = getMFASession();
  
  if (!session || session.userId !== userId) {
    return {
      isVerified: false,
      session: null,
      requiresVerification: true,
      remainingTime: 0,
    };
  }
  
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  const remainingTime = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  
  return {
    isVerified: remainingTime > 0,
    session,
    requiresVerification: remainingTime <= 0,
    remainingTime,
  };
}

/**
 * Extend the current MFA session
 */
export function extendMFASession(additionalMinutes: number = DEFAULT_SESSION_DURATION_MINUTES): boolean {
  const session = getMFASession();
  if (!session) return false;
  
  const newExpiry = new Date(new Date().getTime() + additionalMinutes * 60 * 1000);
  session.expiresAt = newExpiry.toISOString();
  
  try {
    const encrypted = encryptSession(session);
    sessionStorage.setItem(MFA_SESSION_KEY, encrypted);
    console.log('[MFASession] Session extended to:', session.expiresAt);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the MFA session (logout or security event)
 */
export function clearMFASession(): void {
  sessionStorage.removeItem(MFA_SESSION_KEY);
  sessionStorage.removeItem(MFA_PENDING_KEY);
  console.log('[MFASession] Session cleared');
}

/**
 * Clear all MFA-related data for a user
 */
export function clearAllMFAData(): void {
  // Clear session storage
  sessionStorage.removeItem(MFA_SESSION_KEY);
  sessionStorage.removeItem(MFA_PENDING_KEY);
  
  // Clear any local storage MFA data
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('pact_mfa_') || key.startsWith('pact_totp_'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  console.log('[MFASession] All MFA data cleared');
}

/**
 * Store pending MFA verification state (for resuming after app restart)
 */
export function setPendingMFAVerification(userId: string, method: MFASession['method']): void {
  const pending = {
    userId,
    method,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minute timeout
  };
  sessionStorage.setItem(MFA_PENDING_KEY, JSON.stringify(pending));
}

/**
 * Get pending MFA verification if still valid
 */
export function getPendingMFAVerification(): { userId: string; method: MFASession['method'] } | null {
  try {
    const stored = sessionStorage.getItem(MFA_PENDING_KEY);
    if (!stored) return null;
    
    const pending = JSON.parse(stored);
    if (new Date(pending.expiresAt) <= new Date()) {
      sessionStorage.removeItem(MFA_PENDING_KEY);
      return null;
    }
    
    return {
      userId: pending.userId,
      method: pending.method,
    };
  } catch {
    sessionStorage.removeItem(MFA_PENDING_KEY);
    return null;
  }
}

/**
 * Clear pending MFA verification
 */
export function clearPendingMFAVerification(): void {
  sessionStorage.removeItem(MFA_PENDING_KEY);
}

/**
 * Check if MFA is required for a user action
 */
export function requiresMFAForAction(action: string, userId: string): boolean {
  const sensitiveActions = [
    'change_password',
    'change_email',
    'enable_2fa',
    'disable_2fa',
    'delete_account',
    'export_data',
    'wallet_withdrawal',
    'approve_payment',
  ];
  
  if (!sensitiveActions.includes(action)) {
    return false;
  }
  
  const state = getMFASessionState(userId);
  return state.requiresVerification;
}

/**
 * Perform comprehensive session cleanup on logout
 */
export async function performSecureLogout(userId: string): Promise<void> {
  // Clear MFA session
  clearMFASession();
  clearPendingMFAVerification();
  
  // Clear device trust if requested
  try {
    const { revokeDeviceTrust } = await import('./device-trust');
    // Only revoke trust on explicit logout, not on session timeout
    // revokeDeviceTrust(userId);
  } catch {
    // Device trust module not available
  }
  
  // Clear any cached authentication tokens from session storage
  const sessionKeysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (
      key.includes('supabase') ||
      key.includes('auth') ||
      key.includes('token') ||
      key.includes('mfa')
    )) {
      sessionKeysToRemove.push(key);
    }
  }
  sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
  
  console.log('[MFASession] Secure logout completed for user:', userId);
}

/**
 * Session activity monitor - call on user activity to extend session
 */
let lastActivityTime = Date.now();
let activityTimer: ReturnType<typeof setTimeout> | null = null;

export function recordUserActivity(): void {
  lastActivityTime = Date.now();
}

export function startSessionActivityMonitor(
  userId: string,
  onSessionExpiring?: () => void,
  onSessionExpired?: () => void
): () => void {
  const checkInterval = 60 * 1000; // Check every minute
  const warningTime = 5 * 60 * 1000; // Warn 5 minutes before expiry
  
  const checkSession = () => {
    const state = getMFASessionState(userId);
    
    if (!state.isVerified) {
      if (onSessionExpired) {
        onSessionExpired();
      }
      return;
    }
    
    if (state.remainingTime * 1000 <= warningTime) {
      if (onSessionExpiring) {
        onSessionExpiring();
      }
    }
    
    // Auto-extend session if user was recently active
    const inactiveTime = Date.now() - lastActivityTime;
    if (inactiveTime < 5 * 60 * 1000 && state.remainingTime < 10 * 60) {
      extendMFASession(15); // Extend by 15 minutes
    }
  };
  
  activityTimer = setInterval(checkSession, checkInterval);
  
  // Return cleanup function
  return () => {
    if (activityTimer) {
      clearInterval(activityTimer);
      activityTimer = null;
    }
  };
}
