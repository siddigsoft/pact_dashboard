/**
 * SignatureConfirmationDialog
 * Multi-method signature confirmation for transactions and documents
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignaturePad } from './SignaturePad';
import { 
  Fingerprint, 
  Phone, 
  Mail, 
  Pen, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SignatureMethod, SignableDocumentType, HandwritingSignature } from '@/types/signature';
import { SignatureService } from '@/services/signature.service';

interface SignatureConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: {
    method: SignatureMethod;
    signatureData?: string;
    verificationCode?: string;
  }) => void;
  documentType: SignableDocumentType;
  documentTitle: string;
  amount?: number;
  currency?: string;
  allowedMethods?: SignatureMethod[];
  userPhone?: string;
  userEmail?: string;
  userId: string;
  savedSignatures?: HandwritingSignature[];
}

export function SignatureConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  documentType,
  documentTitle,
  amount,
  currency,
  allowedMethods = ['uuid', 'handwriting'],
  userPhone,
  userEmail,
  userId,
  savedSignatures = [],
}: SignatureConfirmationDialogProps) {
  const [activeMethod, setActiveMethod] = useState<SignatureMethod>(allowedMethods[0] || 'uuid');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Handwriting state
  const [signatureData, setSignatureData] = useState<string | null>(null);
  
  // Verification state
  const [verificationRequestId, setVerificationRequestId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState<Date | null>(null);

  const handleSendVerificationCode = async (method: 'phone' | 'email') => {
    setLoading(true);
    setError(null);
    
    try {
      const destination = method === 'phone' ? userPhone : userEmail;
      if (!destination) {
        throw new Error(`No ${method} available for verification`);
      }
      
      const result = await SignatureService.createVerificationRequest({
        userId,
        method,
        destination,
        purpose: 'transaction',
      });
      
      setVerificationRequestId(result.requestId);
      setCodeExpiry(new Date(result.expiresAt));
      setCodeSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationRequestId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await SignatureService.verifyCode(verificationRequestId, verificationCode);
      
      if (!result.verified) {
        throw new Error(result.error || 'Verification failed');
      }
      
      setSuccess(true);
      setTimeout(() => {
        onConfirm({
          method: activeMethod,
          verificationCode,
        });
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUUIDConfirm = () => {
    setSuccess(true);
    setTimeout(() => {
      onConfirm({ method: 'uuid' });
    }, 500);
  };

  const handleSignatureComplete = (data: string) => {
    setSignatureData(data);
  };

  const handleHandwritingConfirm = () => {
    if (!signatureData) return;
    
    setSuccess(true);
    setTimeout(() => {
      onConfirm({
        method: 'handwriting',
        signatureData,
      });
    }, 500);
  };

  const resetState = () => {
    setSignatureData(null);
    setVerificationRequestId(null);
    setVerificationCode('');
    setCodeSent(false);
    setCodeExpiry(null);
    setError(null);
    setSuccess(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const getMethodIcon = (method: SignatureMethod) => {
    switch (method) {
      case 'uuid': return <Fingerprint className="h-4 w-4" />;
      case 'phone': return <Phone className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'handwriting': return <Pen className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getMethodLabel = (method: SignatureMethod) => {
    switch (method) {
      case 'uuid': return 'Digital ID';
      case 'phone': return 'Phone';
      case 'email': return 'Email';
      case 'handwriting': return 'Handwriting';
      case 'biometric': return 'Biometric';
      default: return method;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-signature-confirmation">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Confirm with Signature
          </DialogTitle>
          <DialogDescription>
            Sign to confirm: <strong>{documentTitle}</strong>
            {amount !== undefined && (
              <span className="block mt-1 text-base font-semibold text-foreground">
                Amount: {currency} {amount.toLocaleString()}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Signature Confirmed</p>
            <p className="text-sm text-muted-foreground">Your signature has been recorded</p>
          </div>
        ) : (
          <>
            <Tabs value={activeMethod} onValueChange={(v) => {
              setActiveMethod(v as SignatureMethod);
              resetState();
            }}>
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${allowedMethods.length}, 1fr)` }}>
                {allowedMethods.map((method) => (
                  <TabsTrigger 
                    key={method} 
                    value={method}
                    className="flex items-center gap-1"
                    data-testid={`tab-method-${method}`}
                  >
                    {getMethodIcon(method)}
                    <span className="hidden sm:inline">{getMethodLabel(method)}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="uuid" className="mt-4 space-y-4">
                <Alert>
                  <Fingerprint className="h-4 w-4" />
                  <AlertDescription>
                    A unique digital signature will be generated using your account ID and timestamp.
                    This provides a secure, tamper-proof record of your confirmation.
                  </AlertDescription>
                </Alert>
                <Button 
                  onClick={handleUUIDConfirm}
                  className="w-full"
                  disabled={loading}
                  data-testid="button-confirm-uuid"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Confirm with Digital Signature
                </Button>
              </TabsContent>

              <TabsContent value="phone" className="mt-4 space-y-4">
                {!userPhone ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No phone number is associated with your account.
                      Please add a phone number in your profile settings.
                    </AlertDescription>
                  </Alert>
                ) : !codeSent ? (
                  <div className="space-y-4">
                    <Alert>
                      <Phone className="h-4 w-4" />
                      <AlertDescription>
                        A verification code will be sent to: <strong>{userPhone}</strong>
                      </AlertDescription>
                    </Alert>
                    <Button 
                      onClick={() => handleSendVerificationCode('phone')}
                      className="w-full"
                      disabled={loading}
                      data-testid="button-send-phone-code"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Send Verification Code
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Label htmlFor="phone-code">Enter the 6-digit code sent to your phone</Label>
                    <Input
                      id="phone-code"
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="text-center text-2xl tracking-widest"
                      data-testid="input-phone-code"
                    />
                    {codeExpiry && (
                      <p className="text-xs text-muted-foreground text-center">
                        Code expires at {codeExpiry.toLocaleTimeString()}
                      </p>
                    )}
                    <Button 
                      onClick={handleVerifyCode}
                      className="w-full"
                      disabled={loading || verificationCode.length !== 6}
                      data-testid="button-verify-phone"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Verify & Sign
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="email" className="mt-4 space-y-4">
                {!userEmail ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No email is associated with your account.
                    </AlertDescription>
                  </Alert>
                ) : !codeSent ? (
                  <div className="space-y-4">
                    <Alert>
                      <Mail className="h-4 w-4" />
                      <AlertDescription>
                        A verification code will be sent to: <strong>{userEmail}</strong>
                      </AlertDescription>
                    </Alert>
                    <Button 
                      onClick={() => handleSendVerificationCode('email')}
                      className="w-full"
                      disabled={loading}
                      data-testid="button-send-email-code"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Send Verification Code
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Label htmlFor="email-code">Enter the 6-digit code sent to your email</Label>
                    <Input
                      id="email-code"
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="text-center text-2xl tracking-widest"
                      data-testid="input-email-code"
                    />
                    <Button 
                      onClick={handleVerifyCode}
                      className="w-full"
                      disabled={loading || verificationCode.length !== 6}
                      data-testid="button-verify-email"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Verify & Sign
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="handwriting" className="mt-4">
                {signatureData ? (
                  <div className="space-y-4">
                    <div className="border rounded-md p-4 bg-white dark:bg-gray-900">
                      <img 
                        src={signatureData} 
                        alt="Your signature" 
                        className="max-h-[150px] mx-auto object-contain"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => setSignatureData(null)}
                        className="flex-1"
                        data-testid="button-redo-signature"
                      >
                        Redo Signature
                      </Button>
                      <Button 
                        onClick={handleHandwritingConfirm}
                        className="flex-1"
                        disabled={loading}
                        data-testid="button-confirm-handwriting"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Confirm Signature
                      </Button>
                    </div>
                  </div>
                ) : (
                  <SignaturePad
                    onSignatureComplete={handleSignatureComplete}
                    savedSignatures={savedSignatures}
                    showSavedSignatures={savedSignatures.length > 0}
                    title="Draw Your Signature"
                    description="Use your finger or mouse to sign"
                  />
                )}
              </TabsContent>
            </Tabs>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SignatureConfirmationDialog;
