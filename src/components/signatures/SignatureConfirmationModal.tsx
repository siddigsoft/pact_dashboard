import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { SignaturePad } from './SignaturePad';
import { 
  Shield, 
  PenLine, 
  Mail, 
  Phone, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  DollarSign,
  FileText,
  User,
  Calendar
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SignatureService } from '@/services/signature.service';
import type { SignatureMethod, SignableDocumentType } from '@/types/signature';
import { cn } from '@/lib/utils';

interface TransactionDetails {
  id: string;
  type: 'transaction' | 'cost_submission' | 'advance_payment' | 'withdrawal' | 'disbursement';
  title: string;
  description?: string;
  amount: number;
  currency: string;
  counterparty?: string;
  date?: string;
  reference?: string;
}

interface SignatureConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionDetails;
  userId: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  userRole?: string;
  walletId?: string;
  allowedMethods?: SignatureMethod[];
  onSignatureComplete: (signature: {
    signatureId: string;
    signatureHash: string;
    method: SignatureMethod;
    signedAt: string;
  }) => void;
  onCancel?: () => void;
}

export function SignatureConfirmationModal({
  open,
  onOpenChange,
  transaction,
  userId,
  userName,
  userEmail,
  userPhone,
  userRole,
  walletId,
  allowedMethods = ['uuid', 'handwriting'],
  onSignatureComplete,
  onCancel,
}: SignatureConfirmationModalProps) {
  const { toast } = useToast();
  const [selectedMethod, setSelectedMethod] = useState<SignatureMethod>(allowedMethods[0] || 'uuid');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verificationRequestId, setVerificationRequestId] = useState<string | null>(null);

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + ' ' + currency;
  };

  const handleSignatureCapture = useCallback((data: string, strokeCount: number) => {
    setSignatureData(data);
    toast({
      title: 'Signature Captured',
      description: `Your signature has been captured with ${strokeCount} strokes.`,
    });
  }, [toast]);

  const handleSendOTP = async () => {
    if (!userEmail && selectedMethod === 'email') {
      toast({
        title: 'Email Required',
        description: 'No email address found for OTP verification.',
        variant: 'destructive',
      });
      return;
    }

    if (!userPhone && selectedMethod === 'phone') {
      toast({
        title: 'Phone Required',
        description: 'No phone number found for OTP verification.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const destination = selectedMethod === 'email' ? userEmail! : userPhone!;
      const result = await SignatureService.createVerificationRequest({
        userId,
        method: selectedMethod as 'phone' | 'email',
        destination,
        purpose: 'transaction',
        relatedId: transaction.id,
        recipientName: userName,
      });

      setVerificationRequestId(result.requestId);
      setOtpSent(true);
      toast({
        title: 'Verification Code Sent',
        description: `A 6-digit code has been sent to your ${selectedMethod}.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to Send Code',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitSignature = async () => {
    if (selectedMethod === 'handwriting' && !signatureData) {
      toast({
        title: 'Signature Required',
        description: 'Please draw your signature before confirming.',
        variant: 'destructive',
      });
      return;
    }

    if ((selectedMethod === 'email' || selectedMethod === 'phone') && !otpCode) {
      toast({
        title: 'Verification Code Required',
        description: 'Please enter the verification code sent to you.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (verificationRequestId && otpCode) {
        const verifyResult = await SignatureService.verifyCode(verificationRequestId, otpCode);
        if (!verifyResult.verified) {
          toast({
            title: 'Verification Failed',
            description: verifyResult.error || 'Invalid verification code.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }
      }

      const documentType: SignableDocumentType = 
        transaction.type === 'cost_submission' ? 'cost_submission' :
        transaction.type === 'advance_payment' ? 'down_payment_request' :
        transaction.type === 'withdrawal' ? 'withdrawal_request' :
        'transaction';

      const signature = await SignatureService.generateDocumentSignature({
        documentId: transaction.id,
        documentType,
        documentTitle: transaction.title,
        documentContent: JSON.stringify({
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          currency: transaction.currency,
          counterparty: transaction.counterparty,
          date: transaction.date,
        }),
        signerId: userId,
        signerName: userName,
        signerEmail: userEmail,
        signerPhone: userPhone,
        signerRole: userRole,
        signatureMethod: selectedMethod,
        signatureData: signatureData || undefined,
        verificationCode: otpCode || undefined,
      });

      onSignatureComplete({
        signatureId: signature.id,
        signatureHash: signature.signatureHash,
        method: selectedMethod,
        signedAt: signature.signedAt || new Date().toISOString(),
      });

      toast({
        title: 'Signature Complete',
        description: 'Your signature has been recorded and verified.',
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Signature Failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setSignatureData(null);
    setOtpSent(false);
    setOtpCode('');
    setVerificationRequestId(null);
    onCancel?.();
    onOpenChange(false);
  };

  const methodTabs = [
    { value: 'uuid', label: 'Quick Sign', icon: Shield, available: allowedMethods.includes('uuid') },
    { value: 'handwriting', label: 'Draw Signature', icon: PenLine, available: allowedMethods.includes('handwriting') },
    { value: 'email', label: 'Email OTP', icon: Mail, available: allowedMethods.includes('email') && !!userEmail },
    { value: 'phone', label: 'Phone OTP', icon: Phone, available: allowedMethods.includes('phone') && !!userPhone },
  ].filter(m => m.available);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Confirm Receipt with Signature
          </DialogTitle>
          <DialogDescription>
            Please review and sign to confirm this transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {transaction.title}
                </div>
                <Badge variant="secondary">{transaction.type.replace('_', ' ')}</Badge>
              </div>
              
              <Separator />
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="font-semibold text-lg">
                    {formatAmount(transaction.amount, transaction.currency)}
                  </span>
                </div>
                {transaction.counterparty && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{transaction.counterparty}</span>
                  </div>
                )}
                {transaction.date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{new Date(transaction.date).toLocaleDateString()}</span>
                  </div>
                )}
                {transaction.reference && (
                  <div className="text-muted-foreground">
                    Ref: {transaction.reference}
                  </div>
                )}
              </div>

              {transaction.description && (
                <>
                  <Separator />
                  <p className="text-sm text-muted-foreground">{transaction.description}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Tabs value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as SignatureMethod)}>
            <TabsList className="w-full">
              {methodTabs.map((method) => (
                <TabsTrigger key={method.value} value={method.value} className="flex-1 gap-1">
                  <method.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{method.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="uuid" className="mt-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Click "Sign & Confirm" to instantly sign with your secure account credentials.
                  This generates a cryptographic signature linked to your account.
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent value="handwriting" className="mt-4">
              <SignaturePad
                onSignatureCapture={handleSignatureCapture}
                onClear={() => setSignatureData(null)}
                width={400}
                height={150}
                disabled={isSubmitting}
              />
            </TabsContent>

            <TabsContent value="email" className="mt-4 space-y-3">
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  We'll send a 6-digit verification code to: <strong>{userEmail}</strong>
                </AlertDescription>
              </Alert>
              
              {!otpSent ? (
                <Button onClick={handleSendOTP} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send Verification Code
                </Button>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="otp-email">Enter Verification Code</Label>
                  <Input
                    id="otp-email"
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-2xl tracking-widest"
                    data-testid="input-otp-email"
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="phone" className="mt-4 space-y-3">
              <Alert>
                <Phone className="h-4 w-4" />
                <AlertDescription>
                  We'll send a 6-digit verification code to: <strong>{userPhone}</strong>
                </AlertDescription>
              </Alert>
              
              {!otpSent ? (
                <Button onClick={handleSendOTP} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
                  Send Verification Code
                </Button>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="otp-phone">Enter Verification Code</Label>
                  <Input
                    id="otp-phone"
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-2xl tracking-widest"
                    data-testid="input-otp-phone"
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              By signing, you confirm receipt of funds and agree this transaction is valid and accurate.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmitSignature} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Sign & Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SignatureConfirmationModal;