import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Fingerprint, Scan, Lock, Eye, EyeOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { 
  verifyPin, 
  authenticateWithBiometric, 
  checkBiometricAvailability,
  isBiometricEnabled,
  isPinEnabled,
  setAppLocked,
  type BiometricConfig
} from '@/lib/biometric-auth';
import { formatDistanceToNow } from 'date-fns';

interface AppLockScreenProps {
  onUnlock: () => void;
  userName?: string;
}

export function AppLockScreen({ onUnlock, userName }: AppLockScreenProps) {
  const [pin, setPin] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [biometricConfig, setBiometricConfig] = useState<BiometricConfig | null>(null);
  const [lockCountdown, setLockCountdown] = useState<string>('');

  // Check biometric availability
  useEffect(() => {
    const checkBiometric = async () => {
      const config = await checkBiometricAvailability();
      setBiometricConfig(config);
      
      // Auto-trigger biometric if enabled and available
      if (isBiometricEnabled() && config.isAvailable) {
        handleBiometricAuth();
      }
    };
    
    checkBiometric();
  }, []);

  // Update lockout countdown
  useEffect(() => {
    if (!lockedUntil) return;
    
    const updateCountdown = () => {
      const now = new Date();
      if (lockedUntil <= now) {
        setLockedUntil(null);
        setLockCountdown('');
        setError(null);
      } else {
        setLockCountdown(formatDistanceToNow(lockedUntil, { addSuffix: false }));
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [lockedUntil]);

  // Handle PIN submission
  const handlePinSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (lockedUntil) return;
    if (!pin || pin.length < 4) {
      setError('Please enter your PIN');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    const result = await verifyPin(pin);
    
    setIsLoading(false);
    
    if (result.success) {
      setAppLocked(false);
      onUnlock();
    } else if (result.lockedUntil) {
      setLockedUntil(result.lockedUntil);
      setError('Too many failed attempts. Please wait.');
    } else {
      setAttemptsLeft(result.attemptsLeft || null);
      setError(`Incorrect PIN${result.attemptsLeft ? `. ${result.attemptsLeft} attempts remaining.` : ''}`);
      setPin('');
    }
  };

  // Handle biometric authentication
  const handleBiometricAuth = async () => {
    setIsLoading(true);
    setError(null);
    
    const result = await authenticateWithBiometric('Unlock PACT');
    
    setIsLoading(false);
    
    if (result.success) {
      setAppLocked(false);
      onUnlock();
    } else if (result.error) {
      setError(result.error);
    }
  };

  // Get biometric icon and label
  const getBiometricInfo = () => {
    if (!biometricConfig) return { icon: Fingerprint, label: 'Biometric' };
    
    switch (biometricConfig.type) {
      case 'face':
        return { icon: Scan, label: 'Face ID' };
      case 'fingerprint':
        return { icon: Fingerprint, label: 'Fingerprint' };
      case 'iris':
        return { icon: Scan, label: 'Iris Scan' };
      default:
        return { icon: Fingerprint, label: 'Biometric' };
    }
  };

  const biometricInfo = getBiometricInfo();
  const BiometricIcon = biometricInfo.icon;
  const showBiometric = isBiometricEnabled() && biometricConfig?.isAvailable;
  const pinEnabled = isPinEnabled();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <Card className="w-full max-w-sm mx-4">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">PACT Locked</CardTitle>
          <CardDescription>
            {userName ? `Welcome back, ${userName}` : 'Please authenticate to continue'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Lockout Warning */}
          {lockedUntil && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Account temporarily locked</p>
                <p>Try again in {lockCountdown}</p>
              </div>
            </div>
          )}

          {/* Biometric Authentication */}
          {showBiometric && !lockedUntil && (
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full h-14 text-base"
                onClick={handleBiometricAuth}
                disabled={isLoading}
                data-testid="button-biometric-auth"
              >
                {isLoading ? (
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <BiometricIcon className="h-5 w-5 mr-2" />
                )}
                Use {biometricInfo.label}
              </Button>
              
              {pinEnabled && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      or use PIN
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PIN Authentication */}
          {pinEnabled && (
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">PIN Code</Label>
                <div className="relative">
                  <Input
                    id="pin"
                    type={showPinInput ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter your PIN"
                    disabled={!!lockedUntil || isLoading}
                    className="pr-10 text-center text-lg tracking-widest"
                    data-testid="input-pin"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowPinInput(!showPinInput)}
                    data-testid="button-toggle-pin-visibility"
                  >
                    {showPinInput ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Error Message */}
              {error && !lockedUntil && (
                <p className="text-sm text-destructive text-center" data-testid="text-pin-error">
                  {error}
                </p>
              )}

              {/* Attempts Warning */}
              {attemptsLeft !== null && attemptsLeft <= 2 && (
                <Badge variant="destructive" className="w-full justify-center">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {attemptsLeft} attempts remaining
                </Badge>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!!lockedUntil || isLoading || pin.length < 4}
                data-testid="button-submit-pin"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Unlock'
                )}
              </Button>
            </form>
          )}

          {/* No auth method configured */}
          {!showBiometric && !pinEnabled && (
            <div className="text-center text-muted-foreground py-4">
              <p className="text-sm">No authentication method configured.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={onUnlock}
                data-testid="button-skip-auth"
              >
                Continue
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AppLockScreen;
