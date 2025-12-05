import { useState } from 'react';
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
  Shield,
  Car
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import mapBackground from '@assets/generated_images/minimalist_city_map_background.png';
import PactLogo from '@/assets/logo.png';

interface MobileAuthScreenProps {
  onAuthSuccess?: () => void;
}

export function MobileAuthScreen({ onAuthSuccess }: MobileAuthScreenProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: 'Missing fields',
        description: 'Please enter both email and password',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      toast({
        title: 'Welcome back!',
        description: 'Successfully signed in',
      });

      onAuthSuccess?.();
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Sign in failed',
        description: error.message || 'Invalid email or password',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    toast({
      title: 'Biometric Login',
      description: 'Checking saved credentials...',
    });
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Map Background - Uber style monochrome */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url(${mapBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: 'grayscale(100%)',
        }}
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
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-white/80">
              <Wifi className="h-3.5 w-3.5" />
              Online
            </span>
          </div>

          {/* Logo - Uber style black circle with white icon */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center mb-5 shadow-2xl">
              <img 
                src={PactLogo} 
                alt="PACT" 
                className="w-16 h-16"
              />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">PACT</h1>
            <p className="text-white/50 text-base font-medium">Field Operations Platform</p>
          </div>

          {/* Car Marker Animation - Uber style */}
          <div className="relative mb-8">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg">
                <Car className="h-7 w-7 text-black" />
              </div>
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping" />
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full blur-sm" />
          </div>

          {/* Feature Pills - Uber style */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-white/10 text-white/80">
              <Shield className="h-4 w-4" />
              Secure
            </span>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-white/10 text-white/80">
              <MapPin className="h-4 w-4" />
              GPS Tracking
            </span>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-white/10 text-white/80">
              <Wifi className="h-4 w-4" />
              Offline Ready
            </span>
          </div>
        </div>

        {/* Bottom Section - Login Form */}
        <div 
          className={`
            relative bg-white dark:bg-neutral-900 rounded-t-3xl shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.5)] transition-all duration-500 ease-out
            ${isExpanded ? 'min-h-[75vh]' : 'min-h-[50vh]'}
          `}
        >
          {/* Swipe Handle - Uber style black circle */}
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="absolute -top-5 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-xl"
            data-testid="button-expand-login"
          >
            <ChevronUp 
              className={`h-6 w-6 text-white dark:text-black transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
            />
          </button>

          <div className="pt-10 px-6 pb-8 pb-safe">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-black dark:text-white">Welcome Back</h2>
              <p className="text-black/50 dark:text-white/50 text-base mt-2">
                Sign in to continue your mission
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-black dark:text-white uppercase tracking-wider">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black/40 dark:text-white/40" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-14 pl-12 text-base rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40"
                    data-testid="input-mobile-email"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-black dark:text-white uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black/40 dark:text-white/40" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-14 pl-12 pr-12 text-base rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40"
                    data-testid="input-mobile-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-black/40 dark:text-white/40"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Sign In Button - Uber style black pill */}
              <Button 
                type="submit" 
                className="w-full h-14 text-base font-bold rounded-full bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 dark:text-black mt-4"
                disabled={isLoading}
                data-testid="button-mobile-signin"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-black/10 dark:border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-white dark:bg-neutral-900 px-4 text-black/40 dark:text-white/40 font-medium">
                  Quick Access
                </span>
              </div>
            </div>

            {/* Biometric Login - Uber style outline pill */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 text-base font-semibold rounded-full gap-3 border-black/20 dark:border-white/20"
              onClick={handleBiometricLogin}
              data-testid="button-biometric-login"
            >
              <Fingerprint className="h-6 w-6" />
              Use Fingerprint / Face ID
            </Button>

            {/* Forgot Password */}
            <button 
              type="button"
              className="w-full text-center text-sm text-black/40 dark:text-white/40 mt-6 py-3 font-medium"
            >
              Forgot your password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MobileAuthScreen;
