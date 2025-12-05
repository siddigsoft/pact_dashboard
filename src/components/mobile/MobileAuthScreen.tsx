import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  Fingerprint,
  ChevronUp,
  Wifi,
  Shield
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
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
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Map Background */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url(${mapBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-slate-900/95" />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Section - Logo & Branding */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-safe">
          {/* Connection Status */}
          <div className="absolute top-4 right-4 pt-safe">
            <Badge 
              variant="outline" 
              className="bg-green-500/20 text-green-400 border-green-500/40 gap-1.5 text-sm py-1 px-2"
            >
              <Wifi className="h-4 w-4" />
              Online
            </Badge>
          </div>

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-28 h-28 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-4 shadow-xl">
              <img 
                src={PactLogo} 
                alt="PACT" 
                className="w-20 h-20"
              />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">PACT</h1>
            <p className="text-slate-400 text-base">Field Operations Platform</p>
          </div>

          {/* Location Pin Animation */}
          <div className="relative mb-8">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <MapPin className="h-10 w-10 text-primary" />
            </div>
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-10 h-1 bg-black/30 rounded-full blur-sm" />
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <Badge variant="secondary" className="bg-white/10 text-white/80 border-0 text-sm py-1.5 px-3">
              <Shield className="h-4 w-4 mr-1.5" />
              Secure
            </Badge>
            <Badge variant="secondary" className="bg-white/10 text-white/80 border-0 text-sm py-1.5 px-3">
              <MapPin className="h-4 w-4 mr-1.5" />
              GPS Tracking
            </Badge>
            <Badge variant="secondary" className="bg-white/10 text-white/80 border-0 text-sm py-1.5 px-3">
              <Wifi className="h-4 w-4 mr-1.5" />
              Offline Ready
            </Badge>
          </div>
        </div>

        {/* Bottom Section - Login Form (Swipe Up) */}
        <div 
          className={`
            relative bg-background rounded-t-3xl shadow-2xl transition-all duration-500 ease-out
            ${isExpanded ? 'min-h-[70vh]' : 'min-h-[45vh]'}
          `}
        >
          {/* Swipe Handle */}
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg"
            data-testid="button-expand-login"
          >
            <ChevronUp 
              className={`h-6 w-6 text-white transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
            />
          </button>

          <div className="pt-8 px-6 pb-8 pb-safe">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold">Welcome Back</h2>
              <p className="text-muted-foreground text-base mt-2">
                Sign in to continue your mission
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-base">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-14 pl-12 text-base rounded-xl bg-muted/50"
                    data-testid="input-mobile-email"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-base">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-14 pl-12 pr-12 text-base rounded-xl bg-muted/50"
                    data-testid="input-mobile-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <Button 
                type="submit" 
                className="w-full h-14 text-lg font-semibold rounded-xl mt-2"
                disabled={isLoading}
                data-testid="button-mobile-signin"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-sm uppercase">
                <span className="bg-background px-3 text-muted-foreground">
                  Quick Access
                </span>
              </div>
            </div>

            {/* Biometric Login */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 text-base rounded-xl gap-3"
              onClick={handleBiometricLogin}
              data-testid="button-biometric-login"
            >
              <Fingerprint className="h-6 w-6" />
              Use Fingerprint / Face ID
            </Button>

            {/* Forgot Password */}
            <button 
              type="button"
              className="w-full text-center text-base text-muted-foreground mt-6 py-3"
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
