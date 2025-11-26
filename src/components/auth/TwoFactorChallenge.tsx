import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, ArrowLeft, RefreshCw } from 'lucide-react';
import { useMFA, MFAFactor } from '@/hooks/use-mfa';

interface TwoFactorChallengeProps {
  onSuccess: () => void;
  onCancel: () => void;
  onError?: (error: string) => void;
}

export function TwoFactorChallenge({ onSuccess, onCancel, onError }: TwoFactorChallengeProps) {
  const {
    isLoading,
    listFactors,
    challengeAndVerify,
  } = useMFA();

  const [verificationCode, setVerificationCode] = useState('');
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [selectedFactor, setSelectedFactor] = useState<MFAFactor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadFactors = async () => {
      const loadedFactors = await listFactors();
      const verifiedFactors = loadedFactors.filter(f => f.status === 'verified');
      setFactors(verifiedFactors);
      if (verifiedFactors.length > 0) {
        setSelectedFactor(verifiedFactors[0]);
      }
    };
    loadFactors();
  }, [listFactors]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedFactor]);

  const handleVerify = async () => {
    if (!selectedFactor || verificationCode.length !== 6) return;
    
    setIsVerifying(true);
    setError(null);
    
    const result = await challengeAndVerify(selectedFactor.id, verificationCode);
    
    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || 'Verification failed. Please try again.');
      setVerificationCode('');
      onError?.(result.error || 'Verification failed');
      inputRef.current?.focus();
    }
    
    setIsVerifying(false);
  };

  const handleCodeChange = (value: string) => {
    const cleanedValue = value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(cleanedValue);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && verificationCode.length === 6) {
      handleVerify();
    }
  };

  if (isLoading && factors.length === 0) {
    return (
      <Card className="w-full max-w-md mx-auto" data-testid="card-2fa-challenge-loading">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (factors.length === 0) {
    return (
      <Card className="w-full max-w-md mx-auto" data-testid="card-2fa-challenge-no-factors">
        <CardHeader>
          <CardTitle>Two-Factor Authentication Required</CardTitle>
          <CardDescription>
            No authenticator apps are configured for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Please contact an administrator to resolve this issue.
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full mt-4"
            data-testid="button-back-to-login"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto" data-testid="card-2fa-challenge">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-primary/10 p-3">
            <Shield className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle>Two-Factor Authentication</CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {factors.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Select authenticator:</p>
            <div className="flex flex-wrap gap-2">
              {factors.map((factor) => (
                <Button
                  key={factor.id}
                  variant={selectedFactor?.id === factor.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedFactor(factor);
                    setVerificationCode('');
                    setError(null);
                  }}
                  data-testid={`button-select-factor-${factor.id}`}
                >
                  {factor.friendly_name || 'Authenticator'}
                </Button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={verificationCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-center text-3xl tracking-[0.75em] font-mono h-14"
            disabled={isVerifying}
            data-testid="input-2fa-code"
          />
          <p className="text-xs text-muted-foreground text-center">
            Using: {selectedFactor?.friendly_name || 'Authenticator App'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isVerifying}
            className="flex-1"
            data-testid="button-cancel-2fa"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={handleVerify}
            disabled={isVerifying || verificationCode.length !== 6}
            className="flex-1"
            data-testid="button-verify-2fa"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify'
            )}
          </Button>
        </div>

        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setVerificationCode('');
              setError(null);
              inputRef.current?.focus();
            }}
            disabled={isVerifying}
            className="text-muted-foreground"
            data-testid="button-clear-code"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Clear code
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
