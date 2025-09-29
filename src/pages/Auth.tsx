
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LucideShieldCheck, 
  Server, 
  Shield, 
  Database, 
  Info, 
  CheckCircle,
  FileText,
  Users,
  Calendar,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  BarChart,
  Settings,
  Bell,
  Lock
} from "lucide-react";
import AuthForm from '@/components/auth/AuthForm';
import { useAppContext } from '@/context/AppContext';
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SystemFeaturesSection = () => {
  const features = [
    { name: 'Project Management', color: 'bg-blue-100/70 text-blue-800' },
    { name: 'MMP File Uploads', color: 'bg-purple-100/70 text-purple-800' },
    { name: 'Field Operations', color: 'bg-green-100/70 text-green-800' },
    { name: 'Team Management', color: 'bg-amber-100/70 text-amber-800' },
    { name: 'Site Visits', color: 'bg-rose-100/70 text-rose-800' },
    { name: 'Analytics', color: 'bg-cyan-100/70 text-cyan-800' }
  ];

  const modules = [
    {
      title: 'Project & Activity Planning',
      icon: LayoutDashboard,
      description: 'Define projects, schedule activities, and monitor progress',
      color: 'bg-blue-500/10'
    },
    {
      title: 'MMP Management',
      icon: FileText,
      description: 'Automated data capture and multi-tier approvals',
      color: 'bg-purple-500/10'
    },
    {
      title: 'Field Operations',
      icon: MapPin,
      description: 'GPS-based site visits and task assignments',
      color: 'bg-green-500/10'
    },
    {
      title: 'Team Management',
      icon: Users,
      description: 'Manage team members, roles, and permissions',
      color: 'bg-amber-500/10'
    },
    {
      title: 'Communication',
      icon: MessageSquare,
      description: 'Real-time messaging and notifications',
      color: 'bg-rose-500/10'
    },
    {
      title: 'Analytics & Reports',
      icon: BarChart,
      description: 'Interactive dashboards and data insights',
      color: 'bg-cyan-500/10'
    }
  ];

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
            <Shield className="h-5 w-5 mr-2 text-[#9b87f5]" />
            Core Features
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature) => (
              <Badge 
                key={feature.name}
                variant="secondary" 
                className={`justify-center py-2 text-sm ${feature.color}`}
              >
                {feature.name}
              </Badge>
            ))}
          </div>
        </div>
        
        <div className="space-y-6">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center text-lg">
            <Server className="h-5 w-5 mr-2 text-[#9b87f5]" />
            System Modules
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {modules.map((module) => (
              <div 
                key={module.title}
                className={`${module.color} rounded-lg p-4 transition-all duration-300 hover:shadow-md`}
              >
                <div className="flex items-start">
                  <div className="p-2 rounded-full bg-white/80 mr-3">
                    <module.icon className="h-5 w-5 text-[#9b87f5]" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 dark:text-gray-100">{module.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{module.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/60 dark:bg-gray-800/40 rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center text-lg">
            <Lock className="h-5 w-5 mr-2 text-[#9b87f5]" />
            Security Features
          </h3>
          <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start">
              <span className="bg-green-100 dark:bg-green-900/30 rounded-full p-1 mr-2 mt-0.5">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              </span>
              Role-based access control with multi-factor authentication
            </li>
            <li className="flex items-start">
              <span className="bg-green-100 dark:bg-green-900/30 rounded-full p-1 mr-2 mt-0.5">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              </span>
              End-to-end data encryption and secure file storage
            </li>
            <li className="flex items-start">
              <span className="bg-green-100 dark:bg-green-900/30 rounded-full p-1 mr-2 mt-0.5">
                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              </span>
              Comprehensive audit logging and compliance tracking
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

const LoginSystemInfo = () => {
  return (
    <div className="mt-4 bg-muted/30 p-4 rounded-lg">
      <div className="flex items-center space-x-3 mb-3">
        <Shield className="h-5 w-5 text-primary" />
        <h4 className="text-sm font-semibold">Secure Access</h4>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <Server className="h-4 w-4" />
          <p>Encrypted authentication process</p>
        </div>
        <div className="flex items-center space-x-2">
          <Database className="h-4 w-4" />
          <p>Secure data management</p>
        </div>
      </div>
    </div>
  );
};

const Auth = () => {
  let currentUser = null;
  let navigate = useNavigate();
  let emailVerificationPending = false;
  let verificationEmail: string | undefined = undefined;
  let resendVerificationEmail: (email?: string) => Promise<boolean> = async () => false;
  let clearEmailVerificationNotice: () => void = () => {};
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  // Safely access the AppContext - we're now sure Auth is wrapped inside AppProvider
  try {
    const appContext = useAppContext();
    currentUser = appContext.currentUser;
    emailVerificationPending = appContext.emailVerificationPending;
    verificationEmail = appContext.verificationEmail;
    resendVerificationEmail = appContext.resendVerificationEmail;
    clearEmailVerificationNotice = appContext.clearEmailVerificationNotice;
  } catch (error) {
    console.error("Error accessing AppContext:", error);
  }

  useEffect(() => {
    if (currentUser) {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#9b87f5]/10 via-[#7E69AB]/20 to-[#4361EE]/10 p-4">
      <Card className="w-full max-w-5xl backdrop-blur-sm bg-white/80 dark:bg-gray-900/80 border border-white/20 shadow-xl overflow-hidden flex flex-row">
        <SystemFeaturesSection />
        
        <div className="md:w-1/2 w-full">
          <CardHeader className="space-y-2 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-[#9b87f5] flex items-center justify-center shadow-lg transform hover:scale-105 transition-all duration-300">
                <LucideShieldCheck className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
            <CardDescription className="flex items-center justify-center">
              Sign in to your account
              <button 
                onClick={() => setShowSystemInfo(!showSystemInfo)}
                className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </button>
            </CardDescription>
          </CardHeader>
          
          {showSystemInfo && <LoginSystemInfo />}
          
          <CardContent>
            <Tabs defaultValue="login" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <AuthForm mode="login" />
              </TabsContent>
              <TabsContent value="signup">
                <AuthForm mode="signup" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </div>
      </Card>

      {/* Email not verified modal */}
      <Dialog open={emailVerificationPending} onOpenChange={(open) => { if (!open) clearEmailVerificationNotice(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email verification required</DialogTitle>
            <DialogDescription>
              {verificationEmail ? (
                <>We found an account for <strong>{verificationEmail}</strong>, but the email is not verified yet. Check your inbox and spam folder for a verification email.</>
              ) : (
                <>Your email is not verified yet. Check your inbox and spam folder for a verification email.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            You can request another verification link if needed.
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => clearEmailVerificationNotice()}>Close</Button>
            <Button
              onClick={async () => {
                try {
                  setResendLoading(true);
                  await resendVerificationEmail(verificationEmail);
                } finally {
                  setResendLoading(false);
                }
              }}
              disabled={resendLoading}
            >
              {resendLoading ? 'Sending...' : 'Resend verification link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
