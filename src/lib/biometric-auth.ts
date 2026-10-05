export interface BiometricConfig {
  type: 'fingerprint' | 'face' | 'iris' | 'none';
  isAvailable: boolean;
  isEnrolled: boolean;
}

export interface BiometricResult {
  success: boolean;
  error?: string;
  type?: string;
}

export async function checkBiometricAvailability(): Promise<BiometricConfig> {
  return { type: 'none', isAvailable: false, isEnrolled: false };
}

export async function authenticateWithBiometric(_reason: string = 'Verify your identity'): Promise<BiometricResult> {
  return { success: false, error: 'Biometric authentication is only available on mobile devices' };
}

// PIN Authentication
const PIN_STORAGE_KEY = 'pact_app_pin_hash';
const PIN_SALT_KEY = 'pact_app_pin_salt';
const PIN_ENABLED_KEY = 'pact_pin_enabled';
const MAX_PIN_ATTEMPTS = 5;
const PIN_ATTEMPTS_KEY = 'pact_pin_attempts';
const PIN_LOCKOUT_KEY = 'pact_pin_lockout';
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

// Generate a random salt
function generateSalt(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash PIN using SHA-256 with PBKDF2-like stretching
async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // Multiple rounds of hashing for added security (simplified PBKDF2-like approach)
  let currentHash = pin + salt;
  
  for (let i = 0; i < 10000; i++) {
    const data = encoder.encode(currentHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    currentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  return currentHash;
}

// Check if PIN is set up
export function isPinSetUp(): boolean {
  return localStorage.getItem(PIN_STORAGE_KEY) !== null;
}

// Check if PIN authentication is enabled
export function isPinEnabled(): boolean {
  return localStorage.getItem(PIN_ENABLED_KEY) === 'true';
}

// Enable/disable PIN authentication
export function setPinEnabled(enabled: boolean): void {
  localStorage.setItem(PIN_ENABLED_KEY, enabled ? 'true' : 'false');
}

// Set up PIN
export async function setupPin(pin: string): Promise<boolean> {
  if (pin.length < 4 || pin.length > 8) {
    return false;
  }
  
  try {
    // Generate a new random salt for this PIN
    const salt = generateSalt();
    const hash = await hashPin(pin, salt);
    
    // Store both salt and hash
    localStorage.setItem(PIN_SALT_KEY, salt);
    localStorage.setItem(PIN_STORAGE_KEY, hash);
    localStorage.setItem(PIN_ENABLED_KEY, 'true');
    localStorage.removeItem(PIN_ATTEMPTS_KEY);
    localStorage.removeItem(PIN_LOCKOUT_KEY);
    return true;
  } catch (err) {
    console.error('[BiometricAuth] Error setting up PIN:', err);
    return false;
  }
}

// Verify PIN
export async function verifyPin(pin: string): Promise<{ success: boolean; attemptsLeft?: number; lockedUntil?: Date }> {
  // Check if locked out
  const lockoutTime = localStorage.getItem(PIN_LOCKOUT_KEY);
  if (lockoutTime) {
    const lockoutDate = new Date(lockoutTime);
    if (lockoutDate > new Date()) {
      return { success: false, lockedUntil: lockoutDate };
    } else {
      // Lockout expired
      localStorage.removeItem(PIN_LOCKOUT_KEY);
      localStorage.removeItem(PIN_ATTEMPTS_KEY);
    }
  }
  
  const storedHash = localStorage.getItem(PIN_STORAGE_KEY);
  const storedSalt = localStorage.getItem(PIN_SALT_KEY);
  
  if (!storedHash || !storedSalt) {
    return { success: false };
  }
  
  try {
    // Hash with the stored salt
    const hash = await hashPin(pin, storedSalt);
    
    if (hash === storedHash) {
      // Success - reset attempts
      localStorage.removeItem(PIN_ATTEMPTS_KEY);
      return { success: true };
    }
    
    // Failed - increment attempts
    const attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0', 10) + 1;
    localStorage.setItem(PIN_ATTEMPTS_KEY, attempts.toString());
    
    if (attempts >= MAX_PIN_ATTEMPTS) {
      // Lock out
      const lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION);
      localStorage.setItem(PIN_LOCKOUT_KEY, lockoutUntil.toISOString());
      return { success: false, lockedUntil: lockoutUntil };
    }
    
    return { success: false, attemptsLeft: MAX_PIN_ATTEMPTS - attempts };
  } catch (err) {
    console.error('[BiometricAuth] Error verifying PIN:', err);
    return { success: false };
  }
}

// Clear PIN
export function clearPin(): void {
  localStorage.removeItem(PIN_STORAGE_KEY);
  localStorage.removeItem(PIN_SALT_KEY);
  localStorage.removeItem(PIN_ENABLED_KEY);
  localStorage.removeItem(PIN_ATTEMPTS_KEY);
  localStorage.removeItem(PIN_LOCKOUT_KEY);
}

// Change PIN
export async function changePin(currentPin: string, newPin: string): Promise<boolean> {
  const verification = await verifyPin(currentPin);
  if (!verification.success) {
    return false;
  }
  
  return setupPin(newPin);
}

// Biometric enrollment state
const BIOMETRIC_ENABLED_KEY = 'pact_biometric_enabled';

export function isBiometricEnabled(): boolean {
  return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true';
}

export function setBiometricEnabled(enabled: boolean): void {
  localStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

// App lock state
const APP_LOCKED_KEY = 'pact_app_locked';
const LAST_ACTIVITY_KEY = 'pact_last_activity';
const AUTO_LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function isAppLocked(): boolean {
  const locked = localStorage.getItem(APP_LOCKED_KEY);
  if (locked === 'true') return true;
  
  // Check auto-lock timeout
  if (isPinEnabled() || isBiometricEnabled()) {
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (lastActivity) {
      const lastActivityTime = new Date(lastActivity).getTime();
      if (Date.now() - lastActivityTime > AUTO_LOCK_TIMEOUT) {
        setAppLocked(true);
        return true;
      }
    }
  }
  
  return false;
}

export function setAppLocked(locked: boolean): void {
  localStorage.setItem(APP_LOCKED_KEY, locked ? 'true' : 'false');
  if (!locked) {
    updateLastActivity();
  }
}

export function updateLastActivity(): void {
  localStorage.setItem(LAST_ACTIVITY_KEY, new Date().toISOString());
}

// Lock screen preference
const REQUIRE_AUTH_ON_START_KEY = 'pact_require_auth_on_start';

export function isAuthRequiredOnStart(): boolean {
  return localStorage.getItem(REQUIRE_AUTH_ON_START_KEY) === 'true';
}

export function setAuthRequiredOnStart(required: boolean): void {
  localStorage.setItem(REQUIRE_AUTH_ON_START_KEY, required ? 'true' : 'false');
}
