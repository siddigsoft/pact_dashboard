import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuthForm from "@/components/auth/AuthForm";
import { useAppContext } from "@/context/AppContext";
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
  const headingTitle = forceWebSignup ? "Create Account" : "Sign in";
  const headingDescription = forceWebSignup
    ? "Create your PACT account"
    : "Use your work email to continue";
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

  if (isMobileView && !isDeviceLoading && !forceWebSignup) {
    return <MobileAuthScreen />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <img
            src={PactLogo}
            alt="PACT"
            className="h-12 w-12 mb-3"
            data-testid="img-auth-logo"
          />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            PACT
          </h1>
          <p className="text-sm text-foreground/70 mt-1 max-w-xs">
            Programme operations console for field and finance work
          </p>
        </div>

        <Card className="border border-border shadow-sm" data-testid="card-auth-container">
          <div className="p-6 sm:p-8">
            <CardHeader className="space-y-1 text-center px-0 pb-5">
              <CardTitle className="text-lg font-semibold tracking-tight" data-testid="heading-auth-title">
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
          </div>
        </Card>

        <p className="mt-6 text-center text-sm text-foreground/60" data-testid="text-auth-footer">
          &copy; {new Date().getFullYear()} PACT Consultancy
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
              {resendLoading ? 'Sending...' : 'Resend verification link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
