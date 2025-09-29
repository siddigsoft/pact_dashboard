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

  const { toast } = useToast();
  const navigate = useNavigate();
  
  let login: (email: string, password: string) => Promise<boolean> = async () => false;
  let registerUser: (userData: Partial<UserType>) => Promise<boolean> = async () => false;
  
  try {
    const appContext = useAppContext();
    login = appContext.login;
    registerUser = appContext.registerUser;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let uploadedAvatarUrl = "";

      if (mode === 'signup') {
        const userData = {
          email,
          password,
          name: fullName,
          phone,
          employeeId,
          role,
          hubId: showHubSelection ? selectedHub : undefined,
          stateId: showHubSelection ? selectedState : undefined,
          localityId: showHubSelection && selectedLocality ? selectedLocality : undefined
        };

        const success = await registerUser(userData);

        if (success) {
          // After successful signup, attempt avatar upload only if we have a session
          const { data: sessionData } = await supabase.auth.getSession();
          const session = sessionData?.session;

          if (session && avatarFile) {
            try {
              const fileExt = avatarFile.name.split('.').pop();
              const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
              const filePath = fileName;

              const { data, error } = await supabase.storage
                .from('avatars')
                .upload(filePath, avatarFile);

              if (!error && data) {
                const { data: publicUrlData } = supabase.storage
                  .from('avatars')
                  .getPublicUrl(filePath);
                uploadedAvatarUrl = publicUrlData.publicUrl;
                setAvatarUrl(uploadedAvatarUrl);

                // Save avatar URL to profile
                const { error: updateError } = await supabase
                  .from('profiles')
                  .update({ avatar_url: uploadedAvatarUrl })
                  .eq('id', session.user.id);

                if (updateError) {
                  // Non-blocking: show info toast, continue
                  toast({
                    title: 'Avatar saved, but profile update failed',
                    description: 'You can set your avatar later in Settings.',
                  });
                }
              } else if (error) {
                toast({
                  title: 'Avatar upload failed',
                  description: error.message,
                  variant: 'destructive',
                });
              }
            } catch (err: any) {
              toast({
                title: 'Avatar upload failed',
                description: err?.message || 'Unexpected error during avatar upload',
                variant: 'destructive',
              });
            }
          } else if (avatarFile) {
            // No session (email confirm likely enabled) — inform user to set avatar later
            toast({
              title: 'Check your email',
              description: 'Verify your email, then set your avatar from Settings after first login.',
            });
          }

          toast({
            title: "Registration successful",
            description: "Your account is pending approval by an administrator.",
            variant: "default"
          });
          navigate('/registration-success');
        }
      } else {
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
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
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
    </form>
  );
};

export default AuthForm;
