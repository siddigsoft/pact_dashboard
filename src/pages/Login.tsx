
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppContext } from "@/context/AppContext";
import { Link } from "react-router-dom";
import { LucideShieldCheck, Mail, Lock, Eye, EyeOff, Info, Server, Shield, Database, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/hooks/use-device";
import { useSiteVisitReminders } from "@/hooks/use-site-visit-reminders";
import { Badge } from "@/components/ui/badge";

const LoginSystemInfo = () => {
  return (
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
};

const SystemFeaturesSection = () => {
  return (
    <div className="md:w-1/2 hidden md:block p-8 bg-gradient-to-br from-[#7E69AB]/40 to-[#9b87f5]/20 rounded-l-lg">
      <div className="space-y-8">
        <div className="flex flex-col items-center mb-8">
          <div className="h-20 w-20 rounded-full bg-[#9b87f5]/50 flex items-center justify-center mb-4 shadow-lg transform hover:scale-105 transition-all duration-300">
            <LucideShieldCheck className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 text-center">Our PACT Consultancy Platform</h2>
          <p className="text-gray-700 dark:text-gray-300 text-center mt-2">Fully Integrated MMP Management System</p>
        </div>
        
        <div className="space-y-6">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center text-lg">
            <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
            Platform Features
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Badge variant="secondary" className="justify-center py-2 text-sm bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100">Project Management</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100">MMP File Uploads</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100">Field Operations</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100">Advanced Reporting</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100">Team Management</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100">Secure Communications</Badge>
          </div>
        </div>
        
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center text-lg">
            <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
            Platform Benefits
          </h3>
          <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start">
              <span className="bg-green-100 dark:bg-green-800/30 rounded-full p-1 mr-2 mt-0.5">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              </span>
              Streamlined project planning and activity management
            </li>
            <li className="flex items-start">
              <span className="bg-green-100 dark:bg-green-800/30 rounded-full p-1 mr-2 mt-0.5">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              </span>
              Real-time field operations monitoring
            </li>
            <li className="flex items-start">
              <span className="bg-green-100 dark:bg-green-800/30 rounded-full p-1 mr-2 mt-0.5">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              </span>
              Automated approvals and data validation
            </li>
            <li className="flex items-start">
              <span className="bg-green-100 dark:bg-green-800/30 rounded-full p-1 mr-2 mt-0.5">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              </span>
              Comprehensive reporting and analytics
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  
  // Try to access contexts safely
  let appContext;
  try {
    appContext = useAppContext();
  } catch (error) {
    appContext = { login: async () => false, currentUser: null };
  }
  
  const { login, currentUser } = appContext;
  const navigate = useNavigate();
  const { toast } = useToast();
  
  let deviceInfo = { isNative: false, deviceInfo: { platform: 'web' } };
  try {
    deviceInfo = useDevice();
  } catch (error) {
    // Ignore device errors
  }
  
  const { isNative, deviceInfo: deviceData } = deviceInfo;
  
  // Use site visit reminders safely
  const reminderHook = useSiteVisitReminders();
  const { showDueReminders } = reminderHook;

  useEffect(() => {
    if (isNative) {
      document.body.classList.add('native-app');
      
      if (deviceData.platform === 'ios') {
        document.body.classList.add('ios-app');
      } else if (deviceData.platform === 'android') {
        document.body.classList.add('android-app');
      }
    }
    
    return () => {
      document.body.classList.remove('native-app', 'ios-app', 'android-app');
    };
  }, [isNative, deviceData]);

  const getTimeBasedGreeting = (name?: string) => {
    const hour = new Date().getHours();
    const baseName = name ? `, ${name}` : '';
    
    if (hour >= 5 && hour < 12) return `Good morning${baseName}!`;
    if (hour >= 12 && hour < 18) return `Good afternoon${baseName}!`;
    return `Good evening${baseName}!`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const success = await login(email, password);
      if (success) {
        toast({
          title: getTimeBasedGreeting(currentUser?.name),
          description: "Welcome to Our PACT Consultancy Platform",
          variant: "default",
        });

        setTimeout(() => {
          showDueReminders();
        }, 1000);

        navigate("/dashboard");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const MobileBanner = () => (
    <div className="bg-[#9b87f5]/10 dark:bg-[#9b87f5]/20 p-3 rounded-lg mb-4">
      <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100 text-center">Our PACT Consultancy Platform</h3>
      <p className="text-xs text-gray-700 dark:text-gray-300 text-center">Streamlined MMP Management & Field Operations</p>
      
      <div className="flex justify-center gap-1 mt-2">
        <Badge variant="info" className="text-[10px] py-0 px-2">Project Planning</Badge>
        <Badge variant="success" className="text-[10px] py-0 px-2">Field Operations</Badge>
        <Badge variant="secondary" className="text-[10px] py-0 px-2 bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100">Reporting</Badge>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-[#7E69AB]/10 to-[#9b87f5]/10 dark:from-[#7E69AB]/5 dark:to-[#9b87f5]/5 p-4
      ${isNative && deviceData.platform === 'ios' ? 'pt-10' : ''}
    `}>
      <div className="w-full max-w-5xl">
        <Card className="w-full backdrop-blur-sm bg-white/80 dark:bg-gray-900/90 border border-white/20 dark:border-gray-800/50 shadow-xl overflow-hidden flex flex-col md:flex-row">
          <SystemFeaturesSection />
          
          <div className={`${isNative ? 'w-full' : 'md:w-1/2 w-full'} animate-fade-in`}>
            <CardHeader className="space-y-2 text-center">
              {isNative && <MobileBanner />}
              
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-[#9b87f5] flex items-center justify-center shadow-lg transform hover:scale-105 transition-all duration-300">
                  <LucideShieldCheck className="h-8 w-8 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-gray-800 dark:text-gray-100">PACT Consultancy</CardTitle>
              <CardDescription className="text-gray-700 dark:text-gray-300 flex items-center justify-center">
                {isNative ? "Mobile App Login" : "Sign in to your account to continue"}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="ml-2 h-6 w-6"
                  onClick={() => setShowSystemInfo(!showSystemInfo)}
                  aria-label={showSystemInfo ? "Hide system information" : "Show system information"}
                >
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardDescription>
            </CardHeader>

            {showSystemInfo && <LoginSystemInfo />}

            <form onSubmit={handleSubmit} className="animate-fade-in px-6 pb-6">
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      aria-label="Email address"
                      className={`pl-10 ${isNative ? "h-12" : ""} bg-white/60 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800 transition-colors text-gray-800 dark:text-gray-100`}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      aria-label="Password"
                      className={`pl-10 pr-10 ${isNative ? "h-12" : ""} bg-white/60 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800 transition-colors text-gray-800 dark:text-gray-100`}
                    />
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="absolute right-3 top-3 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <Link to="/forgot-password" className="text-sm text-[#9b87f5] dark:text-[#a798f7] hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button 
                  type="submit" 
                  className={`w-full bg-[#9b87f5] hover:bg-[#8b77e5] dark:bg-[#7E69AB] dark:hover:bg-[#6E59A5] transition-colors ${
                    isNative ? "h-12 text-base" : ""
                  }`}
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
                <p className="text-center text-sm text-gray-700 dark:text-gray-300">
                  Don't have an account?{" "}
                  <Link to="/register" className="text-[#9b87f5] dark:text-[#a798f7] hover:underline">
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

export default Login;
