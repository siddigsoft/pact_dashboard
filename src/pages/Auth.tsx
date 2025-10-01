import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Server, MapPin, MessageSquare, BarChart, FileText, Info } from "lucide-react";
import AuthForm from "@/components/auth/AuthForm";
import { useAppContext } from "@/context/AppContext";
import { Badge } from "@/components/ui/badge";
import PactLogo from "@/assets/logo.png";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const features = [
  { name: "Project Management", color: "bg-blue-600 text-white" },
  { name: "MMP File Uploads", color: "bg-orange-500 text-white" },
  { name: "Field Operations", color: "bg-gray-800 text-white" },
  { name: "Team Management", color: "bg-blue-500 text-white" },
  { name: "Site Visits", color: "bg-orange-400 text-white" },
  { name: "Analytics", color: "bg-gray-700 text-white" },
];

const modules = [
  { title: "Project & Activity Planning", icon: FileText, description: "Define projects, schedule activities, and monitor progress", color: "bg-blue-50 dark:bg-blue-900" },
  { title: "MMP Management", icon: FileText, description: "Automated data capture and multi-tier approvals", color: "bg-orange-50 dark:bg-orange-900" },
  { title: "Field Operations", icon: MapPin, description: "GPS-based site visits and task assignments", color: "bg-gray-50 dark:bg-gray-800" },
  { title: "Communication", icon: MessageSquare, description: "Real-time messaging and notifications", color: "bg-orange-50 dark:bg-orange-900" },
  { title: "Analytics & Reports", icon: BarChart, description: "Interactive dashboards and data insights", color: "bg-gray-50 dark:bg-gray-800" },
];

const LoginSystemInfo = () => (
  <div className="mt-4 bg-white/40 dark:bg-gray-900/40 p-4 rounded-lg shadow-md animate-fade-in">
    <div className="flex items-center space-x-3 mb-3">
      <Shield className="h-5 w-5 text-blue-600 dark:text-orange-400" />
      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Secure Access</h4>
    </div>
    <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
      <div className="flex items-center space-x-2">
        <Server className="h-4 w-4" />
        <p>Encrypted authentication process</p>
      </div>
      <div className="flex items-center space-x-2">
        <BarChart className="h-4 w-4" />
        <p>Secure data management</p>
      </div>
    </div>
  </div>
);

const Auth = () => {
  const navigate = useNavigate();
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  let currentUser = null;
  let emailVerificationPending = false;
  let verificationEmail: string | undefined = undefined;
  let resendVerificationEmail: (email?: string) => Promise<boolean> = async () => false;
  let clearEmailVerificationNotice: () => void = () => {};

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
    if (currentUser) navigate("/dashboard");
  }, [currentUser, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50/20 via-orange-50/20 to-gray-100 dark:from-black dark:via-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-5xl backdrop-blur-lg bg-white/30 dark:bg-gray-900/30 border border-white/20 shadow-xl overflow-hidden flex flex-col md:flex-row rounded-3xl">
        
        {/* Left Hero Column */}
        <div className="hidden md:flex md:w-1/2 flex-col p-8 space-y-6 bg-gradient-to-br from-blue-50/50 via-orange-50/20 to-gray-100 rounded-l-3xl">
          <div className="flex flex-col items-center text-center">
            <img src={PactLogo} alt="PACT Logo" className="h-20 w-20 object-contain mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">PACT Consultancy Platform</h2>
            <p className="text-gray-700 dark:text-gray-300 mt-1">Fully Integrated MMP Management System</p>
          </div>

          {/* Features */}
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center text-lg mb-4">
              <Shield className="h-5 w-5 mr-2 text-blue-600 dark:text-orange-400" />
              Core Features
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {features.map((feature) => (
                <Badge
                  key={feature.name}
                  className={`justify-center py-2 px-3 text-sm font-medium rounded-lg ${feature.color} shadow-md transition-transform duration-300 hover:scale-105 hover:shadow-lg`}
                >
                  {feature.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Modules */}
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center text-lg mb-4">
              <Server className="h-5 w-5 mr-2 text-blue-600 dark:text-orange-400" />
              System Modules
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {modules.map((module) => (
                <div key={module.title} className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 transition-all duration-300 hover:border-blue-400 dark:hover:border-orange-400">
                  <div className="flex items-start">
                    <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 mr-3">
                      <module.icon className="h-5 w-5 text-blue-600 dark:text-orange-400" />
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
        </div>

        {/* Right Auth Column */}
        <div className="md:w-1/2 w-full p-6 md:p-10 flex flex-col items-center justify-center text-center">
          <CardHeader className="space-y-2 text-center mb-4">
            <div className="text-right mb-3">
              <select className="border border-gray-300 rounded-md p-1 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                <option>English</option>
                <option>Français</option>
                <option>Español</option>
              </select>
            </div>
            <CardTitle className="text-2xl font-bold">Welcome To Pact</CardTitle>
            <CardDescription className="flex items-center justify-center text-sm text-gray-600 dark:text-gray-300">
              Sign in to your account
              <button
                onClick={() => setShowSystemInfo(!showSystemInfo)}
                className="ml-2 p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-full transition"
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </button>
            </CardDescription>
            
          </CardHeader>

          {showSystemInfo && <LoginSystemInfo />}

          <div className="w-full mt-4">
            <Tabs defaultValue="login" className="space-y-4 w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <TabsTrigger value="login" className="hover:bg-blue-100 dark:hover:bg-orange-500/20">Login</TabsTrigger>
                <TabsTrigger value="signup" className="hover:bg-blue-100 dark:hover:bg-orange-500/20">Sign Up</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <AuthForm mode="login" />
              </TabsContent>
              <TabsContent value="signup">
                <AuthForm mode="signup" />
              </TabsContent>
            </Tabs>
          </div>
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
