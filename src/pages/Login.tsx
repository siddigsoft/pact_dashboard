import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppContext } from "@/context/AppContext";
import {
  LucideShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Info,
  Server,
  Shield,
  Database,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Users,
  FolderOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/hooks/use-device";
import { useSiteVisitReminders } from "@/hooks/use-site-visit-reminders";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Database connection status component
const DatabaseStatus = () => {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [stats, setStats] = useState<{ users: number; projects: number } | null>(null);

  useEffect(() => {
    checkConnection();
    // Refresh every 30 seconds
    
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkConnection = async () => {
    try {
      const [usersRes, projectsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('projects').select('id', { count: 'exact', head: true })
      ]);

      if (!usersRes.error && !projectsRes.error) {
        setStatus('connected');
        setStats({
          users: usersRes.count || 0,
          projects: projectsRes.count || 0
        });
      } else {
        setStatus('disconnected');
      }
    } catch (error) {
      setStatus('disconnected');
    }
  };

  return (
    <div className="bg-muted/30 p-3 rounded-lg mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {status === 'connected' ? (
            <Wifi className="h-4 w-4 text-green-500" data-testid="icon-database-connected" />
          ) : status === 'disconnected' ? (
            <WifiOff className="h-4 w-4 text-red-500" data-testid="icon-database-disconnected" />
          ) : (
            <div className="h-4 w-4 animate-pulse bg-yellow-500 rounded-full" data-testid="icon-database-checking" />
          )}
          <span className="text-xs font-medium">
            {status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Disconnected' : 'Checking...'}
          </span>
        </div>
        {stats && (
          <div className="flex items-center space-x-3 text-xs text-muted-foreground">
            <div className="flex items-center space-x-1">
              <Users className="h-3 w-3" />
              <span data-testid="text-users-count">{stats.users}</span>
            </div>
            <div className="flex items-center space-x-1">
              <FolderOpen className="h-3 w-3" />
              <span data-testid="text-projects-count">{stats.projects}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Password strength calculator
const calculatePasswordStrength = (password: string): { 
  strength: number; 
  label: string; 
  color: string;
  feedback: string;
} => {
  let strength = 0;
  const feedback: string[] = [];

  if (password.length >= 8) strength += 20;
  else feedback.push("At least 8 characters");

  if (password.length >= 12) strength += 10;
  
  if (/[a-z]/.test(password)) strength += 20;
  else feedback.push("Lowercase letter");
  
  if (/[A-Z]/.test(password)) strength += 20;
  else feedback.push("Uppercase letter");
  
  if (/[0-9]/.test(password)) strength += 15;
  else feedback.push("Number");
  
  if (/[^a-zA-Z0-9]/.test(password)) strength += 15;
  else feedback.push("Special character");

  let label = "Weak";
  let color = "bg-red-500";

  if (strength >= 80) {
    label = "Strong";
    color = "bg-green-500";
  } else if (strength >= 60) {
    label = "Good";
    color = "bg-blue-500";
  } else if (strength >= 40) {
    label = "Fair";
    color = "bg-yellow-500";
  }

  return { 
    strength, 
    label, 
    color,
    feedback: feedback.length > 0 ? `Add: ${feedback.join(', ')}` : 'Excellent password!'
  };
};

// Email validation
const validateEmail = (email: string): { valid: boolean; message: string } => {
  if (!email) return { valid: false, message: '' };
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, message: 'Invalid email format' };
  }
  
  return { valid: true, message: 'Valid email' };
};

const LoginSystemInfo = () => (
  <div className="mt-4 bg-muted/30 p-4 rounded-lg animate-fade-in">
    <div className="flex items-center space-x-3 mb-3">
      <Shield className="h-5 w-5 text-primary" />
      <h4 className="text-sm font-semibold">Secure Access</h4>
    </div>
    <div className="space-y-2 text-xs text-foreground">
      <div className="flex items-center space-x-2">
        <Server className="h-4 w-4 opacity-80" />
        <p>Encrypted authentication process</p>
      </div>
      <div className="flex items-center space-x-2">
        <Database className="h-4 w-4 opacity-80" />
        <p>Secure data management</p>
      </div>
      <div className="flex items-center space-x-2">
        <Info className="h-4 w-4 opacity-80" />
        <p>Multi-factor authentication available</p>
      </div>
    </div>
  </div>
);

const SystemFeaturesSection = () => (
  <div className="md:w-1/2 hidden md:block p-8 bg-gradient-to-br from-blue-100 to-orange-50 dark:from-blue-950 dark:to-orange-950 rounded-l-lg">
    <div className="space-y-8">
      <div className="flex flex-col items-center mb-8">
        <div className="h-20 w-20 rounded-full bg-blue-400/50 dark:bg-blue-600/50 flex items-center justify-center mb-4 shadow-lg transform hover:scale-105 transition-all duration-300">
          <LucideShieldCheck className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 text-center">
          PACT Consultancy Platform
        </h2>
        <p className="text-gray-700 dark:text-gray-300 text-center mt-2">
          Fully Integrated MMP Management System
        </p>
      </div>

      <div className="space-y-6">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center text-lg">
          <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
          Platform Features
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            "Project Management",
            "MMP File Uploads",
            "Field Operations",
            "Advanced Reporting",
            "Team Management",
            "Secure Communications"
          ].map((feature, idx) => (
            <Badge 
              key={idx}
              className="justify-center py-2 text-sm bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100"
            >
              {feature}
            </Badge>
          ))}
        </div>
      </div>

      <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-6 shadow-sm">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center text-lg">
          <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
          Platform Benefits
        </h3>
        <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          {[
            "Streamlined project planning and activity management",
            "Real-time field operations monitoring",
            "Automated approvals and data validation",
            "Comprehensive reporting and analytics",
          ].map((item, idx) => (
            <li key={idx} className="flex items-start">
              <span className="bg-green-100 dark:bg-green-800/30 rounded-full p-1 mr-2 mt-0.5">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

const LoginEnhanced = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const { login, currentUser } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isNative, deviceInfo } = useDevice();
  const { showDueReminders } = useSiteVisitReminders();

  const emailValidation = validateEmail(email);
  const passwordStrength = password.length > 0 ? calculatePasswordStrength(password) : null;

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate email format
    if (!emailValidation.valid) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    // Check password strength (warn if weak, but allow login)
    if (passwordStrength && passwordStrength.strength < 40) {
      toast({
        title: "Weak Password",
        description: "Your password is weak. Consider changing it after login.",
        variant: "default",
      });
    }

    setIsLoading(true);
    try {
      const success = await login(email, password);
      if (success) {
        toast({
          title: `Welcome${currentUser?.name ? `, ${currentUser.name}` : ""}!`,
          description: "You are now logged into the PACT Platform",
          variant: "success",
        });
        
        // Handle remember me
        if (rememberMe) {
          localStorage.setItem('rememberEmail', email);
        } else {
          localStorage.removeItem('rememberEmail');
        }
        
        showDueReminders();
        navigate("/dashboard");
      } else {
        toast({
          title: "Login Failed",
          description: "Invalid email or password. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Login Error",
        description: error?.message || "An error occurred during login. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load remembered email
  useEffect(() => {
    const rememberedEmail = localStorage.getItem('rememberEmail');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  const MobileBanner = () => (
    <div className="bg-blue-100 dark:bg-blue-800/20 p-3 rounded-lg mb-4 text-center md:hidden">
      <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">
        PACT Consultancy Platform
      </h3>
      <p className="text-xs text-gray-700 dark:text-gray-300">
        Streamlined MMP Management & Field Operations
      </p>
      <div className="flex justify-center gap-1 mt-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px] py-0 px-2">
          Project Planning
        </Badge>
        <Badge variant="secondary" className="text-[10px] py-0 px-2">
          Field Operations
        </Badge>
        <Badge variant="secondary" className="text-[10px] py-0 px-2">
          Reporting
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-orange-50 dark:from-black dark:to-gray-900 p-4">
      <div className="w-full max-w-5xl">
        <Card className="w-full flex flex-col md:flex-row backdrop-blur-sm bg-white/80 dark:bg-gray-900/90 border border-white/20 dark:border-gray-800/50 shadow-xl overflow-hidden">
          <SystemFeaturesSection />
          <div className="md:w-1/2 w-full animate-fade-in">
            <CardHeader className="space-y-2 text-center">
              <MobileBanner />
              
              {/* Database Status */}
              <DatabaseStatus />
              
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-blue-400 dark:bg-blue-600 flex items-center justify-center shadow-lg transform hover:scale-105 transition-all duration-300">
                  <LucideShieldCheck className="h-8 w-8 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                PACT Consultancy
              </CardTitle>
              <CardDescription className="text-gray-700 dark:text-gray-300 flex items-center justify-center">
                Sign in to your account
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2 h-6 w-6"
                  onClick={() => setShowSystemInfo(!showSystemInfo)}
                  aria-label={showSystemInfo ? "Hide system info" : "Show system info"}
                  data-testid="button-toggle-system-info"
                >
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardDescription>
            </CardHeader>

            {showSystemInfo && <LoginSystemInfo />}

            <form onSubmit={handleSubmit} className="animate-fade-in px-6 pb-6">
              <CardContent className="space-y-4">
                {/* Email Input with Validation */}
                <div className="space-y-1">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      required
                      className={`pl-10 pr-10 h-12 bg-white/60 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800 transition-colors text-gray-800 dark:text-gray-100 ${
                        emailTouched && !emailValidation.valid && email.length > 0
                          ? 'border-red-500 focus:border-red-500'
                          : emailTouched && emailValidation.valid
                          ? 'border-green-500 focus:border-green-500'
                          : ''
                      }`}
                      data-testid="input-email"
                    />
                    {emailTouched && email.length > 0 && (
                      <div className="absolute right-3 top-3">
                        {emailValidation.valid ? (
                          <CheckCircle className="h-5 w-5 text-green-500" data-testid="icon-email-valid" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-500" data-testid="icon-email-invalid" />
                        )}
                      </div>
                    )}
                  </div>
                  {emailTouched && !emailValidation.valid && email.length > 0 && (
                    <p className="text-xs text-red-500 flex items-center space-x-1" data-testid="text-email-error">
                      <AlertCircle className="h-3 w-3" />
                      <span>{emailValidation.message}</span>
                    </p>
                  )}
                </div>

                {/* Password Input with Strength Indicator */}
                <div className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setPasswordTouched(true)}
                      required
                      className="pl-10 pr-10 h-12 bg-white/60 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800 transition-colors text-gray-800 dark:text-gray-100"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="absolute right-3 top-3 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  
                  {/* Password Strength Indicator */}
                  {passwordStrength && passwordTouched && (
                    <div className="space-y-1" data-testid="password-strength-indicator">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Password Strength:</span>
                        <span className={`text-xs font-medium ${
                          passwordStrength.strength >= 80 ? 'text-green-500' :
                          passwordStrength.strength >= 60 ? 'text-blue-500' :
                          passwordStrength.strength >= 40 ? 'text-yellow-500' :
                          'text-red-500'
                        }`} data-testid="text-password-strength">
                          {passwordStrength.label}
                        </span>
                      </div>
                      <Progress 
                        value={passwordStrength.strength} 
                        className="h-1.5"
                        data-testid="progress-password-strength"
                      />
                      <p className="text-xs text-muted-foreground" data-testid="text-password-feedback">
                        {passwordStrength.feedback}
                      </p>
                    </div>
                  )}
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="remember-me"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      data-testid="checkbox-remember-me"
                    />
                    <label 
                      htmlFor="remember-me" 
                      className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      Remember me
                    </label>
                  </div>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-4">
                <Button
                  type="submit"
                  className="w-full bg-blue-400 hover:bg-blue-500 dark:bg-blue-700 dark:hover:bg-blue-600 transition-colors h-12 text-base"
                  disabled={isLoading || (emailTouched && !emailValidation.valid)}
                  data-testid="button-sign-in"
                >
                  {isLoading ? (
                    <span className="flex items-center space-x-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </Button>
                <p className="text-center text-sm text-gray-700 dark:text-gray-300">
                  Don't have an account?{" "}
                  <Link
                    to="/register"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                    data-testid="link-register"
                  >
                    Register
                  </Link>
                </p>
              </CardFooter>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LoginEnhanced;
