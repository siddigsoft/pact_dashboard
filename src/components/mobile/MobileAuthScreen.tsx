import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  MapPin, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  Fingerprint,
  ChevronUp,
  Wifi,
  WifiOff,
  Shield,
  AlertCircle,
  Loader2,
  ScanFace
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { hapticPresets } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useBiometric, saveCredentials } from '@/hooks/use-biometric';
import { BiometricPrompt } from '@/components/mobile/BiometricPrompt';
import { TwoFactorChallenge } from '@/components/auth/TwoFactorChallenge';
import mapBackground from '@assets/generated_images/minimalist_city_map_background.png';
import PactLogo from '@/assets/logo.png';

const LOGIN_TIMEOUT_MS = 30000; // 30 seconds timeout for login

interface MobileAuthScreenProps {
  onAuthSuccess?: () => void;
}

interface FormErrors {
  email?: string;
  password?: string;
}

export function MobileAuthScreen({ onAuthSuccess }: MobileAuthScreenProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const biometric = useBiometric();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<{email?: boolean; password?: boolean}>({});
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [showMFAChallenge, setShowMFAChallenge] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<{email: string; password: string} | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const loginTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const biometricAvailable = biometric.status.isAvailable || 
    localStorage.getItem('pact_biometric_token') !== null;

  // Lazy load map background
  useEffect(() => {
    const img = new Image();
    img.onload = () => setMapLoaded(true);
    img.src = mapBackground;
  }, []);

  // Cleanup login timeout on unmount
  useEffect(() => {
    return () => {
      if (loginTimeoutRef.current) {
        clearTimeout(loginTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const validateEmail = (value: string): string | undefined => {
    if (!value) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return 'Please enter a valid email';
    return undefined;
  };

  const validatePassword = (value: string): string | undefined => {
    if (!value) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return undefined;
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (touched.email) {
      setErrors(prev => ({ ...prev, email: validateEmail(value) }));
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (touched.password) {
      setErrors(prev => ({ ...prev, password: validatePassword(value) }));
    }
  };

  const handleBlur = (field: 'email' | 'password') => {
    setTouched(prev => ({ ...prev, [field]: true }));
    if (field === 'email') {
      setErrors(prev => ({ ...prev, email: validateEmail(email) }));
    } else {
      setErrors(prev => ({ ...prev, password: validatePassword(password) }));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    
    setTouched({ email: true, password: true });
    setErrors({ email: emailError, password: passwordError });
    
    if (emailError || passwordError) {
      hapticPresets.error();
      return;
    }

    if (!isOnline) {
      hapticPresets.warning();
      toast({
        title: 'No connection',
        description: 'Please check your internet connection',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    hapticPresets.buttonPress();

    // Set login timeout
    loginTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      hapticPresets.error();
      toast({
        title: 'Sign in timed out',
        description: 'The request took too long. Please try again.',
        variant: 'destructive',
      });
    }, LOGIN_TIMEOUT_MS);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      // Clear timeout on response
      if (loginTimeoutRef.current) {
        clearTimeout(loginTimeoutRef.current);
        loginTimeoutRef.current = null;
      }

      if (error) throw error;

      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
        setPendingCredentials({ email: email.trim(), password });
        setShowMFAChallenge(true);
        setIsLoading(false);
        return;
      }

      hapticPresets.success();
      toast({
        title: t('notifications.auth.loginSuccess'),
        description: t('notifications.auth.loginSuccessDesc'),
      });

      if (data.session?.refresh_token) {
        localStorage.setItem('pact_biometric_email', email.trim());
        localStorage.setItem('pact_biometric_token', data.session.refresh_token);
        
        if (biometric.status.isAvailable) {
          await biometric.storeCredentials({
            username: email.trim(),
            password: password,
          });
          await biometric.refreshStatus();
        }
      }

      onAuthSuccess?.();
      navigate('/dashboard');
    } catch (error: any) {
      // Clear timeout on error
      if (loginTimeoutRef.current) {
        clearTimeout(loginTimeoutRef.current);
        loginTimeoutRef.current = null;
      }
      hapticPresets.error();
      toast({
        title: 'Sign in failed',
        description: error.message || 'Invalid email or password',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASuccess = async () => {
    hapticPresets.success();
    toast({
      title: t('notifications.auth.loginSuccess'),
      description: t('notifications.auth.loginSuccessDesc'),
    });

    const { data: sessionData } = await supabase.auth.getSession();
    
    if (sessionData.session?.refresh_token && pendingCredentials) {
      localStorage.setItem('pact_biometric_email', pendingCredentials.email);
      localStorage.setItem('pact_biometric_token', sessionData.session.refresh_token);
      
      if (biometric.status.isAvailable) {
        await biometric.storeCredentials({
          username: pendingCredentials.email,
          password: pendingCredentials.password,
        });
        await biometric.refreshStatus();
      }
    }

    setShowMFAChallenge(false);
    setPendingCredentials(null);
    onAuthSuccess?.();
    navigate('/dashboard');
  };

  const handleMFACancel = async () => {
    await supabase.auth.signOut();
    setShowMFAChallenge(false);
    setPendingCredentials(null);
    hapticPresets.buttonPress();
  };

  const handleMFAError = (error: string) => {
    hapticPresets.error();
    toast({
      title: 'Verification failed',
      description: error,
      variant: 'destructive',
    });
  };

  const handleBiometricLogin = async () => {
    hapticPresets.buttonPress();
    
    const savedEmail = localStorage.getItem('pact_biometric_email');
    if (!savedEmail) {
      toast({
        title: 'No saved credentials',
        description: 'Please sign in with email first to enable biometric login',
        variant: 'destructive',
      });
      return;
    }
    
    setShowBiometricPrompt(true);
  };

  const handleBiometricSuccess = async () => {
    setShowBiometricPrompt(false);
    setIsLoading(true);
    
    try {
      await biometric.refreshStatus();
      
      if (biometric.status.isAvailable) {
        const result = await biometric.authenticateAndGetCredentials();
        
        if (result.success && result.credentials) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: result.credentials.username,
            password: result.credentials.password,
          });

          if (error) throw error;

          if (data.session?.refresh_token) {
            localStorage.setItem('pact_biometric_email', result.credentials.username);
            localStorage.setItem('pact_biometric_token', data.session.refresh_token);
          }

          hapticPresets.success();
          toast({
            title: t('notifications.auth.loginSuccess'),
            description: t('notifications.auth.loginSuccessDesc'),
          });
          onAuthSuccess?.();
          navigate('/dashboard');
          return;
        } else if (result.error) {
          console.log('[Biometric] Auth failed:', result.error);
        }
      }
      
      const savedToken = localStorage.getItem('pact_biometric_token');
      
      if (!savedToken) {
        throw new Error('No saved credentials');
      }

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: savedToken,
      });

      if (error) {
        localStorage.removeItem('pact_biometric_email');
        localStorage.removeItem('pact_biometric_token');
        throw error;
      }

      if (data.session?.refresh_token) {
        localStorage.setItem('pact_biometric_token', data.session.refresh_token);
      }

      hapticPresets.success();
      toast({
        title: t('notifications.auth.loginSuccess'),
        description: t('notifications.auth.loginSuccessDesc'),
      });
      onAuthSuccess?.();
      navigate('/dashboard');
    } catch (error: any) {
      hapticPresets.error();
      toast({
        title: 'Biometric sign in failed',
        description: 'Please sign in with email and password',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricError = (error: string) => {
    toast({
      title: 'Authentication failed',
      description: error,
      variant: 'destructive',
    });
  };

  const handleBiometricFallback = () => {
    setShowBiometricPrompt(false);
    setIsExpanded(true);
  };

  const handleExpandToggle = () => {
    hapticPresets.toggle();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black" role="main" aria-label="Sign in page">
      {/* Live Region for Screen Reader Announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isLoading && 'Signing in, please wait...'}
        {!isOnline && 'You are currently offline. Please check your internet connection.'}
      </div>
      {/* Map Background - Uber style monochrome (lazy loaded) */}
      <div 
        className={cn(
          "absolute inset-0 transition-opacity duration-500",
          mapLoaded ? "opacity-20" : "opacity-0"
        )}
        style={{
          backgroundImage: mapLoaded ? `url(${mapBackground})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: 'grayscale(100%)',
        }}
        aria-hidden="true"
      />

      {/* Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px'
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black" />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Section - Logo & Branding */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-safe">
          {/* Connection Status - Uber style pill */}
          <div className="absolute top-4 right-4 pt-safe">
            <span 
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
                isOnline ? "bg-white/10 text-white/80" : "bg-white/20 text-white"
              )}
              data-testid="status-connection"
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  Offline
                </>
              )}
            </span>
          </div>

          {/* Logo - Uber style black circle with white icon */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-4 shadow-2xl">
              <img 
                src={PactLogo} 
                alt="PACT" 
                className="w-14 h-14"
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">PACT</h1>
            <p className="text-white/50 text-sm font-medium">Field Operations Platform</p>
          </div>

          {/* PACT Marker Animation - Uber style */}
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
              <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-lg">
                <img 
                  src={PactLogo} 
                  alt="PACT" 
                  className="w-7 h-7 object-contain"
                />
              </div>
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping" />
            <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-white/20 rounded-full blur-sm" />
          </div>

          {/* Feature Pills - Uber style */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-6">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 text-white/80">
              <Shield className="h-3 w-3" />
              Secure
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 text-white/80">
              <MapPin className="h-3 w-3" />
              GPS Tracking
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 text-white/80">
              <Wifi className="h-3 w-3" />
              Offline Ready
            </span>
          </div>
        </div>

        {/* Bottom Section - Login Form */}
        <div 
          className={`
            relative bg-white dark:bg-neutral-900 rounded-t-3xl shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.5)] transition-all duration-500 ease-out
            ${isExpanded ? 'min-h-[70vh]' : 'min-h-[45vh]'}
          `}
        >
          {/* Swipe Handle - Uber style black circle */}
          <button 
            onClick={handleExpandToggle}
            className="absolute -top-5 left-1/2 transform -translate-x-1/2 w-11 h-11 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-xl touch-manipulation active:scale-95 transition-transform"
            data-testid="button-expand-login"
            aria-label={isExpanded ? 'Collapse login form' : 'Expand login form'}
          >
            <ChevronUp 
              className={`h-5 w-5 text-white dark:text-black transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
            />
          </button>

          <div className="pt-8 px-6 pb-6 pb-safe">
            <header className="text-center mb-6">
              <h2 className="text-xl font-bold text-black dark:text-white">Welcome Back</h2>
              <p className="text-black/50 dark:text-white/50 text-sm mt-1" id="form-description">
                Sign in to continue your mission
              </p>
            </header>

            <form onSubmit={handleLogin} className="space-y-4" aria-describedby="form-description" aria-label="Sign in form">
              {/* Email Field */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  autoComplete="email"
                  aria-invalid={!!errors.email && touched.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={cn(
                    "h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 transition-all",
                    errors.email && touched.email && "ring-2 ring-destructive/50"
                  )}
                  data-testid="input-mobile-email"
                />
                {errors.email && touched.email && (
                  <p id="email-error" className="flex items-center gap-1 text-xs text-destructive" role="alert">
                    <AlertCircle className="h-3 w-3" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                  <Lock className="h-3.5 w-3.5" />
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    onBlur={() => handleBlur('password')}
                    autoComplete="current-password"
                    aria-invalid={!!errors.password && touched.password}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    className={cn(
                      "h-12 pr-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 transition-all",
                      errors.password && touched.password && "ring-2 ring-destructive/50"
                    )}
                    data-testid="input-mobile-password"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      hapticPresets.buttonPress();
                      setShowPassword(!showPassword);
                    }}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 min-h-11 min-w-11 flex items-center justify-center text-black/40 dark:text-white/40 touch-manipulation"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && touched.password && (
                  <p id="password-error" className="flex items-center gap-1 text-xs text-destructive" role="alert">
                    <AlertCircle className="h-3 w-3" />
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Sign In Button - Uber style black pill */}
              <Button 
                type="submit" 
                className="w-full h-12 text-sm font-bold rounded-full bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 dark:text-black mt-3 touch-manipulation active:scale-[0.98] transition-transform"
                disabled={isLoading || !isOnline}
                data-testid="button-mobile-signin"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </span>
                ) : !isOnline ? (
                  'No Connection'
                ) : (
                  'Sign In'
                )}
              </Button>

              {/* Sign Up Button - Right below Sign In */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 text-sm font-semibold rounded-full gap-2 border-black/20 dark:border-white/20 mt-3"
                onClick={() => {
                  hapticPresets.buttonPress();
                  navigate('/register');
                }}
                data-testid="button-mobile-signup"
              >
                Create Account
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-black/10 dark:border-white/10" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                <span className="bg-white dark:bg-neutral-900 px-3 text-black/40 dark:text-white/40 font-semibold">
                  Quick Access
                </span>
              </div>
            </div>

            {/* Biometric Login - Uber style outline pill */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 text-sm font-semibold rounded-full gap-2 border-black/20 dark:border-white/20"
              onClick={handleBiometricLogin}
              data-testid="button-biometric-login"
            >
              <Fingerprint className="h-4 w-4" />
              Use Fingerprint / Face ID
            </Button>

            {/* Forgot Password */}
            <button 
              type="button"
              className="w-full text-center text-xs text-black/40 dark:text-white/40 mt-3 py-2 font-medium touch-manipulation"
              data-testid="button-forgot-password"
              onClick={() => {
                hapticPresets.buttonPress();
                navigate('/forgot-password');
              }}
            >
              Forgot your password?
            </button>
          </div>
        </div>
      </div>

      <BiometricPrompt
        isOpen={showBiometricPrompt}
        onClose={() => setShowBiometricPrompt(false)}
        onSuccess={handleBiometricSuccess}
        onError={handleBiometricError}
        onFallback={handleBiometricFallback}
        title="Sign In"
        subtitle="Verify your identity to continue"
        fallbackLabel="Use Email & Password"
      />

      {showMFAChallenge && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <TwoFactorChallenge
              onSuccess={handleMFASuccess}
              onCancel={handleMFACancel}
              onError={handleMFAError}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileAuthScreen;
