import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Lock, Eye, EyeOff, User, Phone, Badge } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from '@/context/AppContext';
import AvatarUpload from '@/components/registration/AvatarUpload';
import { hubs, sudanStates, getLocalitiesByState } from '@/data/sudanStates';
import { supabase } from '@/integrations/supabase/client';
import { User as UserType } from '@/types/user';
import { TwoFactorChallenge } from './TwoFactorChallenge';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

const AuthForm = ({ mode }: AuthFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState('dataCollector');
  const [showHubSelection, setShowHubSelection] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const [selectedHub, setSelectedHub] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedLocality, setSelectedLocality] = useState('');
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [localities, setLocalities] = useState<{ id: string; name: string; }[]>([]);

  const [showMFAChallenge, setShowMFAChallenge] = useState(false);
  const [pendingLoginEmail, setPendingLoginEmail] = useState('');
  const [pendingLoginPassword, setPendingLoginPassword] = useState('');

  const { toast } = useToast();
  const navigate = useNavigate();
  
  let login: (email: string, password: string) => Promise<boolean> = async () => false;
  let registerUser: (userData: Partial<UserType>) => Promise<boolean> = async () => false;
  let hydrateCurrentUser: () => Promise<boolean> = async () => false;
  
  try {
    const appContext = useAppContext();
    login = appContext.login;
    registerUser = appContext.registerUser;
    hydrateCurrentUser = appContext.hydrateCurrentUser;
  } catch (error) {
    console.error("Error accessing AppContext:", error);
  }

  useEffect(() => {
    const needsHub = ['dataCollector', 'coordinator', 'supervisor'].includes(role);
    setShowHubSelection(needsHub);
    if (!needsHub) {
      setSelectedHub('');
      setSelectedState('');
      setSelectedLocality('');
    }
  }, [role]);

  useEffect(() => {
    if (!selectedHub) {
      setAvailableStates([]);
      setSelectedState('');
      setLocalities([]);
      setSelectedLocality('');
      return;
    }
    const hubObj = hubs.find(h => h.id === selectedHub);
    setAvailableStates(hubObj ? hubObj.states : []);
    setSelectedState('');
    setLocalities([]);
    setSelectedLocality('');
  }, [selectedHub]);

  useEffect(() => {
    if (!selectedState) {
      setLocalities([]);
      setSelectedLocality('');
      return;
    }
    const locs = getLocalitiesByState(selectedState);
    setLocalities(locs);
    setSelectedLocality('');
  }, [selectedState]);

  const handleAvatarChange = (file: File | null, previewUrl: string | null) => {
    setAvatarFile(file);
    setAvatarPreviewUrl(previewUrl);
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        toast({
          title: "Authentication Error",
          description: error.message,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign in with Google",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        // Upload avatar first if provided
        let uploadedAvatarUrl = "";
        if (avatarFile) {
          try {
            const fileExt = avatarFile.name.split('.').pop();
            const fileName = `avatar-${Date.now()}.${fileExt}`;
            const filePath = fileName;

            const { data, error } = await supabase.storage
              .from('avatars')
              .upload(filePath, avatarFile, {
                cacheControl: '3600',
                upsert: false
              });

            if (!error && data) {
              const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);
              uploadedAvatarUrl = publicUrlData.publicUrl;
            } else if (error) {
              console.error('Avatar upload error:', error);
              toast({
                title: 'Avatar upload failed',
                description: 'Continuing with registration without avatar.',
                variant: 'default',
              });
            }
          } catch (err: any) {
            console.error('Avatar upload error:', err);
          }
        }

        const userData = {
          email,
          password,
          name: fullName,
          phone,
          employeeId,
          role,
          hubId: showHubSelection ? selectedHub : undefined,
          stateId: showHubSelection ? selectedState : undefined,
          localityId: showHubSelection && selectedLocality ? selectedLocality : undefined,
          avatar: uploadedAvatarUrl || undefined,
        };

        const success = await registerUser(userData);

        if (success) {
          toast({
            title: "Registration successful",
            description: "Your account is pending approval by an administrator.",
            variant: "default"
          });
          navigate('/registration-success');
        }
      } else {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          toast({
            title: "Login failed",
            description: authError.message || "Invalid email or password. Please try again.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        if (authData.user) {
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          
          if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
            setPendingLoginEmail(email);
            setPendingLoginPassword(password);
            setShowMFAChallenge(true);
            setIsLoading(false);
            return;
          }

          const success = await login(email, password);
          if (success) {
            toast({
              title: "Welcome back!",
              description: "You have successfully logged in.",
              variant: "default"
            });
            navigate('/dashboard');
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASuccess = async () => {
    try {
      const success = await hydrateCurrentUser();
      if (!success) {
        console.error('Failed to hydrate current user after MFA');
        toast({
          title: "Error",
          description: "Failed to load user profile. Please try again.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.error('Error hydrating user after MFA:', error);
      toast({
        title: "Error",
        description: "An error occurred while loading your profile.",
        variant: "destructive"
      });
      return;
    }
    
    toast({
      title: "Welcome back!",
      description: "You have successfully logged in with two-factor authentication.",
      variant: "default"
    });
    
    setShowMFAChallenge(false);
    setPendingLoginEmail('');
    setPendingLoginPassword('');
    
    navigate('/dashboard');
  };

  const handleMFACancel = async () => {
    await supabase.auth.signOut();
    setShowMFAChallenge(false);
    setPendingLoginEmail('');
    setPendingLoginPassword('');
  };

  if (mode === 'login' && showMFAChallenge) {
    return (
      <div className="py-4">
        <TwoFactorChallenge
          onSuccess={handleMFASuccess}
          onCancel={handleMFACancel}
          onError={(error) => {
            toast({
              title: "Verification Failed",
              description: error,
              variant: "destructive"
            });
          }}
        />
      </div>
    );
  }

  if (mode === 'login') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="pl-10 bg-white/50 focus:bg-white transition-colors"
              data-testid="input-email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pl-10 pr-10 bg-white/50 focus:bg-white transition-colors"
              data-testid="input-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              data-testid="button-toggle-password"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full bg-[#9b87f5] hover:bg-[#8b77e5] transition-colors 
                   transform hover:scale-105 active:scale-95 
                   duration-300 ease-in-out relative
                   animate-fade-in hover:animate-pulse-slow
                   disabled:opacity-70 disabled:cursor-not-allowed
                   disabled:hover:scale-100 disabled:hover:bg-[#9b87f5]"
          disabled={isLoading}
          data-testid="button-login"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Signing In...</span>
            </div>
          ) : (
            'Sign In'
          )}
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">Or continue with</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <AvatarUpload 
        onImageChange={handleAvatarChange}
        previewUrl={avatarPreviewUrl}
      />

      <div className="space-y-4">
        {/* Email (required for signup) */}
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="pl-10 bg-white/50 focus:bg-white transition-colors"
          />
        </div>

        {/* Password (required for signup) */}
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pl-10 pr-10 bg-white/50 focus:bg-white transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        <div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select your role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dataCollector">Data Collector</SelectItem>
              <SelectItem value="coordinator">Coordinator</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="ict">ICT</SelectItem>
              <SelectItem value="fom">FOM</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showHubSelection && (
          <div>
            <Select value={selectedHub} onValueChange={setSelectedHub}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select your hub" />
              </SelectTrigger>
              <SelectContent>
                {hubs.map((hub) => (
                  <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showHubSelection && selectedHub && (
          <div>
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {availableStates.map((stateId) => {
                  const stateObj = sudanStates.find(s => s.id === stateId);
                  return stateObj ? (
                    <SelectItem key={stateObj.id} value={stateObj.id}>{stateObj.name}</SelectItem>
                  ) : null;
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {showHubSelection && selectedState && localities.length > 0 && (
          <div>
            <Select value={selectedLocality} onValueChange={setSelectedLocality}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select locality (optional)" />
              </SelectTrigger>
              <SelectContent>
                {localities.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="pl-10 bg-white/50 focus:bg-white transition-colors"
            />
          </div>

          <div className="relative">
            <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              type="tel"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="pl-10 bg-white/50 focus:bg-white transition-colors"
            />
          </div>

          <div className="relative">
            <Badge className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Employee ID (Optional)"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="pl-10 bg-white/50 focus:bg-white transition-colors"
            />
          </div>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full bg-[#9b87f5] hover:bg-[#8b77e5] transition-colors 
                 transform hover:scale-105 active:scale-95 
                 duration-300 ease-in-out relative
                 animate-fade-in hover:animate-pulse-slow
                 disabled:opacity-70 disabled:cursor-not-allowed
                 disabled:hover:scale-100 disabled:hover:bg-[#9b87f5]"
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>{mode === 'signup' ? 'Creating Account...' : 'Signing In...'}</span>
          </div>
        ) : mode === 'signup' ? (
          'Create Account'
        ) : (
          'Sign In'
        )}
      </Button>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-gray-500">Or continue with</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
      >
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        {mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
      </Button>
    </form>
  );
};

export default AuthForm;
