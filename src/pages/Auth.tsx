import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  Server,
  Activity,
  Lock,
  Zap,
  Users,
} from "lucide-react";
import AuthForm from "@/components/auth/AuthForm";
import { useAppContext } from "@/context/AppContext";
import { Badge } from "@/components/ui/badge";
import PactLogo from "@/assets/logo.png";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDevice } from "@/hooks/use-device";
import { MobileAuthScreen } from "@/components/mobile/MobileAuthScreen";

const Auth = () => {
  const { isNative, isMobile: isDeviceMobile, isLoading: isDeviceLoading } = useDevice();
  const [searchParams] = useSearchParams();
  const isMobileView = isNative || isDeviceMobile;
  const forceWebSignup = searchParams.get("view") === "signup";
  const initialTab = forceWebSignup ? "signup" : searchParams.get("tab") ?? "login";
  const showTabs = !forceWebSignup;
  const headingTitle = forceWebSignup ? "Create Account" : "Welcome Back";
  const headingDescription = forceWebSignup
    ? "Create your field operations account"
    : "Sign in to access your field operations dashboard";
  const navigate = useNavigate();
  const [resendLoading, setResendLoading] = useState(false);

  let currentUser = null;
  let authReady = false;
  let emailVerificationPending = false;
  let verificationEmail: string | undefined = undefined;
  let resendVerificationEmail: (email?: string) => Promise<boolean> = async () => false;
  let clearEmailVerificationNotice: () => void = () => {};

  try {
    const appContext = useAppContext();
    currentUser = appContext.currentUser;
    authReady = appContext.authReady;
    emailVerificationPending = appContext.emailVerificationPending;
    verificationEmail = appContext.verificationEmail;
    resendVerificationEmail = appContext.resendVerificationEmail;
    clearEmailVerificationNotice = appContext.clearEmailVerificationNotice;
  } catch (error) {
    console.error("Error accessing AppContext:", error);
  }

  useEffect(() => {
    // Only redirect once auth state has fully settled (authReady) AND a user
    // is confirmed. Without the authReady guard, a stale currentUser value
    // from React 18 batching can fire this redirect right after logout,
    // sending the user back to the dashboard instead of the login page.
    if (authReady && currentUser) {
      const raw = searchParams.get("redirect");
      // Only honour same-origin paths to avoid open-redirect risks.
      const safe = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
      navigate(safe, { replace: true });
    }
  }, [authReady, currentUser, navigate, searchParams]);

  const securityFeatures = [
    {
      icon: Shield,
      label: "Enterprise Security",
      description: "Enterprise Grade Protection",
    },
    {
      icon: Lock,
      label: "Encrypted Data",
      description: "Advanced Encryption",
    },
    {
      icon: Server,
      label: "99.9% Uptime",
      description: "Guaranteed Availability",
    },
    {
      icon: Zap,
      label: "Real-time Sync",
      description: "Instant Data Updates",
    },
  ];

  const platformStats = [
    { label: "Active Users", value: "10K+", icon: Users },
    { label: "Uptime", value: "99.9%", icon: Activity },
    { label: "Protected", value: "Secure", icon: Shield },
  ];

  if (isMobileView && !isDeviceLoading && !forceWebSignup) {
    return <MobileAuthScreen />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-5xl">
        <Card className="overflow-hidden border border-border shadow-sm" data-testid="card-auth-container">
          <div className="grid lg:grid-cols-2">
            {/* Info panel: visible for both Login and Sign Up */}
            <aside className="hidden lg:flex flex-col justify-between p-8 bg-muted/40 border-r border-border">
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={PactLogo}
                      alt="PACT Logo"
                      className="h-12 w-12"
                      data-testid="img-auth-logo"
                    />
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-foreground">
                        PACT Command Center
                      </h2>
                      <p className="text-xs text-foreground/70">
                        Field Operations Command Center
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant="secondary"
                    className="gap-1.5 text-xs"
                    data-testid="badge-system-status"
                  >
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    All Systems Operational
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-3 py-4 border-y border-border">
                  {platformStats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        className="text-center space-y-0.5"
                        data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <Icon className="w-3.5 h-3.5 mx-auto text-foreground/70" />
                        <p className="text-lg font-semibold text-foreground tabular-nums">{stat.value}</p>
                        <p className="text-[10px] text-foreground/65">{stat.label}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Shield className="w-4 h-4" />
                    Enterprise-Grade Security
                  </h3>

                  <div className="grid grid-cols-2 gap-2">
                    {securityFeatures.map((feature) => {
                      const Icon = feature.icon;
                      return (
                        <div
                          key={feature.label}
                          className="p-3 rounded-md border border-border bg-card"
                          data-testid={`feature-${feature.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <div className="flex flex-col items-center text-center gap-1.5">
                            <div className="p-1.5 rounded-md bg-muted text-foreground">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-foreground">{feature.label}</p>
                              <p className="text-[10px] text-foreground/70 leading-tight">
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
            </aside>

            <div className="p-6 md:p-8 flex flex-col justify-center">
              <div className="lg:hidden flex flex-col items-center mb-6 gap-3">
                <img
                  src={PactLogo}
                  alt="PACT Logo"
                  className="h-12 w-12"
                  data-testid="img-auth-logo-mobile"
                />
                <div className="text-center">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    PACT Command Center
                  </h2>
                  <p className="text-xs text-foreground/70 mt-0.5">
                    Field Operations Command Center
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="gap-1.5 text-xs"
                  data-testid="badge-system-status-mobile"
                >
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  All Systems Operational
                </Badge>
              </div>

              <CardHeader className="space-y-1 text-center px-0 pb-4">
                <CardTitle className="text-xl font-semibold tracking-tight" data-testid="heading-auth-title">
                  {headingTitle}
                </CardTitle>
                <CardDescription className="text-sm text-foreground/70" data-testid="text-auth-description">
                  {headingDescription}
                </CardDescription>
              </CardHeader>

              <div className="w-full">
                {showTabs ? (
                  <Tabs
                    key={initialTab}
                    defaultValue={initialTab}
                    className="space-y-4 w-full"
                  >
                    <TabsList
                      className="grid w-full grid-cols-2 h-9"
                      data-testid="tabs-auth"
                    >
                      <TabsTrigger value="login" className="text-sm" data-testid="tab-login">
                        Login
                      </TabsTrigger>
                      <TabsTrigger value="signup" className="text-sm" data-testid="tab-signup">
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
                ) : (
                  <div className="space-y-4" data-testid="content-signup">
                    <AuthForm mode="signup" />
                    <div className="text-center text-sm text-muted-foreground">
                      <span>Already have an account? </span>
                      <button
                        type="button"
                        onClick={() => navigate("/auth")}
                        className="text-primary font-semibold hover:underline"
                        data-testid="link-signin-from-signup"
                      >
                        Sign in
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 text-center text-xs text-foreground/65">
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

        <p className="mt-6 text-center text-sm text-foreground/60" data-testid="text-auth-footer">
          &copy; {new Date().getFullYear()} PACT Consultancy. All rights reserved.
        </p>
      </div>

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
              {resendLoading ? "Sending..." : "Resend verification link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
