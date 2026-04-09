import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PROTECTED_OWNER_EMAIL } from '@/lib/protected-accounts';
import { EmailNotificationService } from '@/services/email-notification.service';

interface AdminRoleConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
  targetUserName: string;
  targetRole: string;
  currentUserName: string;
}

const emailService = new EmailNotificationService();

export function AdminRoleConfirmDialog({
  open,
  onClose,
  onConfirmed,
  targetUserName,
  targetRole,
  currentUserName,
}: AdminRoleConfirmDialogProps) {
  const { toast } = useToast();
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpExpiry, setOtpExpiry] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setOtpInput('');
      setGeneratedOtp('');
      setOtpExpiry(null);
      setCodeSent(false);
      sendOtp();
    }
  }, [open]);

  const sendOtp = async () => {
    setSending(true);
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = new Date(Date.now() + 5 * 60 * 1000);

      await emailService.sendEmail({
        to: PROTECTED_OWNER_EMAIL,
        subject: '🔐 Admin Role Assignment Confirmation',
        recipientName: currentUserName || 'Platform Owner',
        priority: 'urgent',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#0F2041;padding:24px;border-radius:8px 8px 0 0">
              <h2 style="color:white;margin:0">Admin Role Assignment</h2>
            </div>
            <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0">
              <p>A request has been made to assign the <strong>${targetRole}</strong> role to <strong>${targetUserName}</strong>.</p>
              <p style="margin-top:16px">Your confirmation code is:</p>
              <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:16px;background:white;border:2px solid #0F2041;border-radius:8px;margin:12px 0">${code}</div>
              <p style="color:#666;font-size:13px">This code expires in <strong>5 minutes</strong>. If you did not initiate this action, please review your security settings immediately.</p>
            </div>
          </div>
        `,
      });

      setGeneratedOtp(code);
      setOtpExpiry(expiry);
      setCodeSent(true);
      toast({ title: 'Code Sent', description: `Confirmation code sent to ${PROTECTED_OWNER_EMAIL}` });
    } catch (err: any) {
      toast({ title: 'Failed to Send Code', description: err.message || 'Could not send confirmation email', variant: 'destructive' });
      onClose();
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (!otpExpiry || new Date() > otpExpiry) {
      toast({ title: 'Code Expired', description: 'The confirmation code has expired. Please try again.', variant: 'destructive' });
      onClose();
      return;
    }
    if (otpInput.trim() !== generatedOtp) {
      toast({ title: 'Incorrect Code', description: 'The code you entered does not match. Please check your email.', variant: 'destructive' });
      return;
    }
    setConfirming(true);
    await onConfirmed();
    setConfirming(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="dialog-admin-role-confirm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            Email Confirmation Required
          </DialogTitle>
        </DialogHeader>

        {sending ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Sending confirmation code…</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-4 rounded-md flex gap-3">
              <Mail className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Check your email</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  A 6-digit code was sent to <strong>{PROTECTED_OWNER_EMAIL}</strong> to confirm assigning the <strong>{targetRole}</strong> role to <strong>{targetUserName}</strong>.
                </p>
                {otpExpiry && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Expires at {otpExpiry.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="admin-otp-input">Confirmation Code</Label>
              <Input
                id="admin-otp-input"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="text-center text-2xl tracking-[0.5em] font-mono h-14 mt-1"
                maxLength={6}
                autoFocus
                data-testid="input-admin-role-otp"
                onKeyDown={(e) => { if (e.key === 'Enter' && otpInput.length === 6) handleVerify(); }}
              />
            </div>

            <button
              className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
              onClick={sendOtp}
              disabled={sending}
            >
              Resend code
            </button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-admin-otp">
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={confirming || otpInput.length !== 6 || sending}
            data-testid="button-confirm-admin-otp"
          >
            {confirming
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Confirming…</>
              : <><ShieldCheck className="h-4 w-4 mr-2" />Confirm & Save</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
