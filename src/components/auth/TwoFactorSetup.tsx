import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, ShieldCheck, ShieldOff, Smartphone, Copy, Check, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useMFA, MFAFactor } from '@/hooks/use-mfa';
import { useToast } from '@/hooks/use-toast';

interface TwoFactorSetupProps {
  onSetupComplete?: () => void;
  onDisabled?: () => void;
}

export function TwoFactorSetup({ onSetupComplete, onDisabled }: TwoFactorSetupProps) {
  const { toast } = useToast();
  const {
    isLoading,
    factors,
    enrollmentData,
    enrollTOTP,
    verifyTOTP,
    unenrollFactor,
    listFactors,
    clearEnrollment,
  } = useMFA();

  const [verificationCode, setVerificationCode] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [factorToRemove, setFactorToRemove] = useState<MFAFactor | null>(null);

  useEffect(() => {
    listFactors();
  }, [listFactors]);

  const handleStartEnrollment = async () => {
    setIsEnrolling(true);
    await enrollTOTP('PACT Authenticator');
  };

  const handleCancelEnrollment = () => {
    setIsEnrolling(false);
    setVerificationCode('');
    clearEnrollment();
  };

  const handleVerify = async () => {
    if (!enrollmentData || verificationCode.length !== 6) return;
    
    const success = await verifyTOTP(enrollmentData.id, verificationCode);
    if (success) {
      setIsEnrolling(false);
      setVerificationCode('');
      onSetupComplete?.();
    }
  };

  const handleCopySecret = async () => {
    if (!enrollmentData?.secret) return;
    
    try {
      await navigator.clipboard.writeText(enrollmentData.secret);
      setCopiedSecret(true);
      toast({
        title: 'Secret Copied',
        description: 'The secret key has been copied to your clipboard.',
      });
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveFactor = async () => {
    if (!factorToRemove) return;
    
    const success = await unenrollFactor(factorToRemove.id);
    if (success) {
      setFactorToRemove(null);
      onDisabled?.();
    }
  };

  const verifiedFactors = factors.filter(f => f.status === 'verified');
  const hasVerifiedFactor = verifiedFactors.length > 0;

  return (
    <Card data-testid="card-2fa-setup">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Two-Factor Authentication</CardTitle>
        </div>
        <CardDescription>
          Add an extra layer of security to your account using an authenticator app
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasVerifiedFactor ? (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
              <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Two-factor authentication is enabled. Your account is protected.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Enrolled Authenticators</p>
              {verifiedFactors.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  data-testid={`row-factor-${factor.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {factor.friendly_name || 'Authenticator App'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(factor.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
                      Active
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFactorToRemove(factor)}
                      disabled={isLoading}
                      data-testid={`button-remove-factor-${factor.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={handleStartEnrollment}
              disabled={isLoading || isEnrolling}
              className="w-full"
              data-testid="button-add-backup-authenticator"
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Add Backup Authenticator
            </Button>
          </div>
        ) : isEnrolling && enrollmentData ? (
          <div className="space-y-4">
            <Alert>
              <Smartphone className="h-4 w-4" />
              <AlertDescription>
                Scan the QR code with your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, or 1Password)
              </AlertDescription>
            </Alert>

            <div className="flex justify-center p-4 bg-white rounded-lg">
              <div 
                dangerouslySetInnerHTML={{ __html: enrollmentData.qr_code }}
                className="[&>svg]:w-48 [&>svg]:h-48"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground text-center">
                Cannot scan? Enter this code manually:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-xs font-mono break-all text-center">
                  {enrollmentData.secret}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopySecret}
                  data-testid="button-copy-secret"
                >
                  {copiedSecret ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Enter the 6-digit code from your app:</p>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] font-mono"
                data-testid="input-verification-code"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancelEnrollment}
                disabled={isLoading}
                className="flex-1"
                data-testid="button-cancel-enrollment"
              >
                Cancel
              </Button>
              <Button
                onClick={handleVerify}
                disabled={isLoading || verificationCode.length !== 6}
                className="flex-1"
                data-testid="button-verify-code"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Enable'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
              <ShieldOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                Two-factor authentication is not enabled. Your account may be at risk.
              </AlertDescription>
            </Alert>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>Two-factor authentication adds an extra layer of security by requiring:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Your password (something you know)</li>
                <li>A code from your phone (something you have)</li>
              </ol>
            </div>

            <Button
              onClick={handleStartEnrollment}
              disabled={isLoading}
              className="w-full"
              data-testid="button-enable-2fa"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Enable Two-Factor Authentication
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={!!factorToRemove} onOpenChange={(open) => !open && setFactorToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this authenticator? Your account will be less secure without two-factor authentication.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFactorToRemove(null)}
              disabled={isLoading}
              data-testid="button-cancel-remove"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveFactor}
              disabled={isLoading}
              data-testid="button-confirm-remove"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
