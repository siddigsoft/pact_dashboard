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
import { 
  Shield, 
  Server, 
  CheckCircle2, 
  Activity,
  Lock,
  Zap,
  Users
} from "lucide-react";
import AuthForm from "@/components/auth/AuthForm";
import { useAppContext } from "@/context/AppContext";
import { Badge } from "@/components/ui/badge";
import { LoadingBadge } from "@/components/ui/loading-badge";
import PactLogo from "@/assets/logo.png";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const Auth = () => {
  const navigate = useNavigate();
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

  const securityFeatures = [
    { 
      icon: Shield, 
      label: "Enterprise Security", 
      description: "Enterprise-Grade Protection",
      color: "text-blue-500 dark:text-blue-400"
    },
    { 
      icon: Lock, 
      label: "Encrypted Data", 
      description: "Advanced Encryption",
      color: "text-orange-500 dark:text-orange-400"
    },
    { 
      icon: Server, 
      label: "99.9% Uptime", 
      description: "Guaranteed Availability",
      color: "text-purple-500 dark:text-purple-400"
    },
    { 
      icon: Zap, 
      label: "Real-time Sync", 
      description: "Instant Data Updates",
      color: "text-green-500 dark:text-green-400"
    }
  ];

  const platformStats = [
    { label: "Active Users", value: "10K+", icon: Users },
    { label: "Uptime", value: "99.9%", icon: Activity },
    { label: "Protected", value: "Secure", icon: Shield }
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated Background Layer */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-orange-500/5 to-purple-500/5 dark:from-blue-600/10 dark:via-orange-600/10 dark:to-purple-600/10" />
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 dark:bg-blue-600/20 rounded-full blur-3xl animate-blob" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-orange-500/20 dark:bg-orange-600/20 rounded-full blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-3xl animate-blob animation-delay-4000" />
      </div>

      {/* Main Auth Container */}
      <div className="relative z-10 w-full max-w-6xl">
        <Card className="overflow-hidden border-2 shadow-2xl" data-testid="card-auth-container">
          <div className="grid lg:grid-cols-2">
            {/* Left Hero Column */}
            <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-muted/50 to-muted/30 border-r">
              <div className="space-y-8">
                {/* Logo & Branding */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <img 
                      src={PactLogo} 
                      alt="PACT Logo" 
                      className="h-16 w-16"
                      data-testid="img-auth-logo"
                    />
                    <div>
                      <h2 className="text-2xl font-bold">PACT Platform</h2>
                      <p className="text-sm text-muted-foreground">
                        Field Operations Command Center
                      </p>
                    </div>
                  </div>
                  
                  <Badge 
                    variant="secondary" 
                    className="gap-2"
                    data-testid="badge-system-status"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    All Systems Operational
                  </Badge>
                </div>

                {/* Platform Stats */}
                <div className="grid grid-cols-3 gap-4 py-6 border-y">
                  {platformStats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                      <div 
                        key={index}
                        className="text-center space-y-1"
                        data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Icon className="w-4 h-4 mx-auto text-muted-foreground" />
                        <p className="text-xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Security Features */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Enterprise-Grade Security
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {securityFeatures.map((feature, index) => {
                      const Icon = feature.icon;
                      return (
                        <div 
                          key={index}
                          className="p-4 rounded-md border bg-card hover-elevate"
                          data-testid={`feature-${feature.label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <div className="flex flex-col items-center text-center gap-2">
                            <div className={`p-2 rounded-md bg-muted ${feature.color}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{feature.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {feature.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>

            {/* Right Auth Form Column */}
            <div className="p-8 md:p-12 flex flex-col justify-center">
              {/* Mobile Logo */}
              <div className="lg:hidden flex flex-col items-center mb-8">
                <img 
                  src={PactLogo} 
                  alt="PACT Logo" 
                  className="h-16 w-16 mb-4"
                  data-testid="img-auth-logo-mobile"
                />
                <Badge 
                  variant="secondary" 
                  className="gap-2"
                  data-testid="badge-system-status-mobile"
                >
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  System Operational
                </Badge>
              </div>

              <CardHeader className="space-y-2 text-center px-0 pb-6">
                <CardTitle className="text-3xl font-bold" data-testid="heading-auth-title">
                  Welcome Back
                </CardTitle>
                <CardDescription className="text-base" data-testid="text-auth-description">
                  Sign in to access your field operations dashboard
                </CardDescription>
              </CardHeader>

              <div className="w-full">
                <Tabs defaultValue="login" className="space-y-6 w-full">
                  <TabsList 
                    className="grid w-full grid-cols-2"
                    data-testid="tabs-auth"
                  >
                    <TabsTrigger value="login" data-testid="tab-login">
                      Login
                    </TabsTrigger>
                    <TabsTrigger value="signup" data-testid="tab-signup">
                      Sign Up
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="login" data-testid="content-login">
                    <AuthForm mode="login" />
                  </TabsContent>
                  
                  <TabsContent value="signup" data-testid="content-signup">
                    <AuthForm mode="signup" />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Help Text */}
              <div className="mt-8 text-center text-sm text-muted-foreground">
                <p>
                  Protected by enterprise-grade security.
                  <br />
                  <a 
                    href="#" 
                    className="text-primary hover:underline"
                    data-testid="link-auth-help"
                  >
                    Need help?
                  </a>
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p data-testid="text-auth-footer">
            &copy; {new Date().getFullYear()} PACT Consultancy. All rights reserved.
          </p>
        </div>
      </div>

      {/* Email Verification Modal - UNCHANGED */}
      <Dialog 
        open={emailVerificationPending} 
        onOpenChange={(open) => { if (!open) clearEmailVerificationNotice(); }}
      >
        <DialogContent data-testid="dialog-verification">
          <DialogHeader>
            <DialogTitle data-testid="heading-verification-title">
              Email verification required
            </DialogTitle>
            <DialogDescription data-testid="text-verification-description">
              {verificationEmail ? (
                <>
                  We found an account for <strong>{verificationEmail}</strong>, but the email is not verified yet. 
                  Check your inbox and spam folder for a verification email.
                </>
              ) : (
                <>
                  Your email is not verified yet. Check your inbox and spam folder for a verification email.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            You can request another verification link if needed.
          </div>
          <DialogFooter>
            <Button 
              variant="secondary" 
              onClick={() => clearEmailVerificationNotice()}
              data-testid="button-verification-close"
            >
              Close
            </Button>
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
              data-testid="button-verification-resend"
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
