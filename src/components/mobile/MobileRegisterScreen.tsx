import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MapPin, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ChevronLeft,
  Wifi,
  WifiOff,
  AlertCircle,
  Loader2,
  User,
  Phone,
  Camera,
  Building2,
  IdCard,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { hapticPresets } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { hubs, sudanStates, getLocalitiesByState } from '@/data/sudanStates';
import { useAppContext } from '@/context/AppContext';
import { User as UserType } from '@/types/user';
import mapBackground from '@assets/generated_images/minimalist_city_map_background.png';
import PactLogo from '@/assets/logo.png';

interface FormErrors {
  avatar?: string;
  fullName?: string;
  email?: string;
  password?: string;
  phone?: string;
  hub?: string;
  state?: string;
  locality?: string;
}

export function MobileRegisterScreen() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState('dataCollector');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [errors, setErrors] = useState<FormErrors>({});
  const [mapLoaded, setMapLoaded] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const [selectedHub, setSelectedHub] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedLocality, setSelectedLocality] = useState('');
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [localities, setLocalities] = useState<{ id: string; name: string; }[]>([]);

  const showHubSelection = ['dataCollector', 'coordinator', 'supervisor'].includes(role);

  let registerUser: (userData: Partial<UserType>) => Promise<boolean> = async () => false;
  
  try {
    const appContext = useAppContext();
    registerUser = appContext.registerUser;
  } catch (error) {
    console.error("Error accessing AppContext:", error);
  }

  useEffect(() => {
    const img = new Image();
    img.onload = () => setMapLoaded(true);
    img.src = mapBackground;
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

  useEffect(() => {
    if (!showHubSelection) {
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

  const handleAvatarClick = () => {
    hapticPresets.buttonPress();
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    
    if (!file) {
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      hapticPresets.error();
      toast({
        title: "Invalid File",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      hapticPresets.error();
      toast({
        title: "File Too Large",
        description: "Image must be less than 5MB",
        variant: "destructive"
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreviewUrl(objectUrl);
    setErrors(prev => ({ ...prev, avatar: undefined }));
    hapticPresets.success();
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    let hasErrors = false;

    if (!avatarFile) {
      newErrors.avatar = 'Profile picture is required';
      hasErrors = true;
    }

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
      hasErrors = true;
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
      hasErrors = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        newErrors.email = 'Please enter a valid email';
        hasErrors = true;
      }
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required';
      hasErrors = true;
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
      hasErrors = true;
    }

    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
      hasErrors = true;
    }

    if (showHubSelection) {
      if (!selectedHub) {
        newErrors.hub = 'Hub is required';
        hasErrors = true;
      }
      if (!selectedState) {
        newErrors.state = 'State is required';
        hasErrors = true;
      }
      if (!selectedLocality) {
        newErrors.locality = 'Locality is required';
        hasErrors = true;
      }
    }

    setErrors(newErrors);
    return !hasErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
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

    try {
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
        hapticPresets.success();
        toast({
          title: "Registration successful",
          description: "Your account is pending approval by an administrator.",
        });
        navigate('/registration-success');
      }
    } catch (error: any) {
      hapticPresets.error();
      toast({
        title: 'Registration failed',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleLabel = (roleValue: string) => {
    const roleLabels: Record<string, string> = {
      dataCollector: 'Data Collector',
      coordinator: 'Coordinator',
      supervisor: 'Supervisor',
      admin: 'Admin',
      ict: 'ICT',
      fom: 'FOM'
    };
    return roleLabels[roleValue] || roleValue;
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
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
      />

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

      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <div className="flex items-center justify-between px-4 pt-4 pt-safe">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => {
              hapticPresets.buttonPress();
              navigate('/login');
            }}
            data-testid="button-back-login"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          
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

        <div className="flex flex-col items-center px-6 py-4">
          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-3 shadow-xl">
            <img 
              src={PactLogo} 
              alt="PACT" 
              className="w-10 h-10"
            />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Create Account</h1>
          <p className="text-white/50 text-sm">Join PACT Field Operations</p>
        </div>

        <div className="flex-1 bg-white dark:bg-neutral-900 rounded-t-3xl shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.5)]">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5 pb-safe">
              <div className="flex flex-col items-center">
                <div 
                  onClick={handleAvatarClick}
                  className={cn(
                    "relative cursor-pointer group",
                    errors.avatar && "ring-2 ring-destructive ring-offset-2 rounded-full"
                  )}
                  data-testid="button-avatar-upload"
                >
                  <Avatar className="h-24 w-24 border-4 border-white dark:border-neutral-800 shadow-lg">
                    {avatarPreviewUrl ? (
                      <AvatarImage src={avatarPreviewUrl} alt="Profile" />
                    ) : (
                      <AvatarFallback className="bg-gray-100 dark:bg-neutral-800">
                        <User className="h-10 w-10 text-gray-400" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-lg group-active:scale-95 transition-transform">
                    <Camera className="h-4 w-4 text-white dark:text-black" />
                  </div>
                  {avatarPreviewUrl && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-avatar-file"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Tap to upload profile picture <span className="text-destructive">*</span>
                </p>
                {errors.avatar && (
                  <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.avatar}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                  <User className="h-3.5 w-3.5" />
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (errors.fullName) setErrors(prev => ({ ...prev, fullName: undefined }));
                  }}
                  className={cn(
                    "h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40",
                    errors.fullName && "ring-2 ring-destructive/50"
                  )}
                  data-testid="input-mobile-fullname"
                />
                {errors.fullName && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.fullName}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                  <Mail className="h-3.5 w-3.5" />
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  autoComplete="email"
                  className={cn(
                    "h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40",
                    errors.email && "ring-2 ring-destructive/50"
                  )}
                  data-testid="input-mobile-register-email"
                />
                {errors.email && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                  <Lock className="h-3.5 w-3.5" />
                  Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password (min 6 chars)"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
                    }}
                    autoComplete="new-password"
                    className={cn(
                      "h-12 pr-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40",
                      errors.password && "ring-2 ring-destructive/50"
                    )}
                    data-testid="input-mobile-register-password"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      hapticPresets.buttonPress();
                      setShowPassword(!showPassword);
                    }}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 min-h-11 min-w-11 flex items-center justify-center text-black/40 dark:text-white/40"
                    data-testid="button-toggle-register-password"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                  <Phone className="h-3.5 w-3.5" />
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+249 XXX XXX XXX"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined }));
                  }}
                  autoComplete="tel"
                  className={cn(
                    "h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40",
                    errors.phone && "ring-2 ring-destructive/50"
                  )}
                  data-testid="input-mobile-phone"
                />
                {errors.phone && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.phone}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="employeeId" className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                  <IdCard className="h-3.5 w-3.5" />
                  Employee ID <span className="text-muted-foreground">(Optional)</span>
                </Label>
                <Input
                  id="employeeId"
                  type="text"
                  placeholder="Enter employee ID"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40"
                  data-testid="input-mobile-employeeid"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                  <Building2 className="h-3.5 w-3.5" />
                  Role
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger 
                    className="h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white"
                    data-testid="select-mobile-role"
                  >
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
                <>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                      <Building2 className="h-3.5 w-3.5" />
                      Hub <span className="text-destructive">*</span>
                    </Label>
                    <Select value={selectedHub} onValueChange={(value) => {
                      setSelectedHub(value);
                      if (errors.hub) setErrors(prev => ({ ...prev, hub: undefined }));
                    }}>
                      <SelectTrigger 
                        className={cn(
                          "h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white",
                          errors.hub && "ring-2 ring-destructive/50"
                        )}
                        data-testid="select-mobile-hub"
                      >
                        <SelectValue placeholder="Select hub" />
                      </SelectTrigger>
                      <SelectContent>
                        {hubs.map((hub) => (
                          <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.hub && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {errors.hub}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                      <MapPin className="h-3.5 w-3.5" />
                      State <span className="text-destructive">*</span>
                    </Label>
                    <Select 
                      value={selectedState} 
                      onValueChange={(value) => {
                        setSelectedState(value);
                        if (errors.state) setErrors(prev => ({ ...prev, state: undefined }));
                      }}
                      disabled={!selectedHub}
                    >
                      <SelectTrigger 
                        className={cn(
                          "h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white",
                          errors.state && "ring-2 ring-destructive/50"
                        )}
                        data-testid="select-mobile-state"
                      >
                        <SelectValue placeholder={selectedHub ? "Select state" : "Select hub first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStates.map((state) => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.state && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {errors.state}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider">
                      <MapPin className="h-3.5 w-3.5" />
                      Locality <span className="text-destructive">*</span>
                    </Label>
                    <Select 
                      value={selectedLocality} 
                      onValueChange={(value) => {
                        setSelectedLocality(value);
                        if (errors.locality) setErrors(prev => ({ ...prev, locality: undefined }));
                      }}
                      disabled={!selectedState}
                    >
                      <SelectTrigger 
                        className={cn(
                          "h-12 text-sm rounded-xl bg-gray-100 dark:bg-neutral-800 border-0 text-black dark:text-white",
                          errors.locality && "ring-2 ring-destructive/50"
                        )}
                        data-testid="select-mobile-locality"
                      >
                        <SelectValue placeholder={selectedState ? "Select locality" : "Select state first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {localities.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.locality && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {errors.locality}
                      </p>
                    )}
                  </div>
                </>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 text-sm font-bold rounded-full bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 dark:text-black mt-4 touch-manipulation active:scale-[0.98] transition-transform"
                disabled={isLoading || !isOnline}
                data-testid="button-mobile-register"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Account...
                  </span>
                ) : !isOnline ? (
                  'No Connection'
                ) : (
                  'Create Account'
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                By creating an account, you agree to the Terms of Service and Privacy Policy
              </p>

              <div className="text-center pb-4">
                <button
                  type="button"
                  onClick={() => {
                    hapticPresets.buttonPress();
                    navigate('/login');
                  }}
                  className="text-sm text-black/60 dark:text-white/60"
                  data-testid="link-back-login"
                >
                  Already have an account? <span className="font-semibold text-black dark:text-white">Sign In</span>
                </button>
              </div>
            </form>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

export default MobileRegisterScreen;
