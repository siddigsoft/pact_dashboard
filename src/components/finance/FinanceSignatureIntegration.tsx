import { useState, useCallback } from 'react';
import { Shield, CheckCircle, Clock, Edit, Banknote, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  SignatureConfirmationModal, 
  SignatureVerificationBadge,
  SignatureHistory,
} from '@/components/signatures';
import { SignatureService } from '@/services/signature.service';
import type { TransactionSignature, DocumentSignature, SignatureStatus as SigStatus, SignatureMethod } from '@/types/signature';
import { useToast } from '@/hooks/use-toast';

interface WithdrawalRequest {
  id: string;
  userId: string;
  walletId?: string;
  userName?: string;
  amount: number;
  currency?: string;
  status: string;
  reason?: string;
  createdAt: string;
  processedAt?: string;
  transactionRef?: string;
  signatureStatus?: SigStatus;
}

interface FinanceApprovalSignatureProps {
  request: WithdrawalRequest;
  approverId: string;
  approverName: string;
  approverEmail?: string;
  approverRole?: string;
  onSignatureComplete?: (signature: TransactionSignature) => void;
  onApprovalWithSignature?: (request: WithdrawalRequest, signature: TransactionSignature) => Promise<void>;
}

export function FinanceApprovalSignature({
  request,
  approverId,
  approverName,
  approverEmail,
  approverRole,
  onSignatureComplete,
  onApprovalWithSignature,
}: FinanceApprovalSignatureProps) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isPending = request.status === 'pending' || request.status === 'supervisor_approved';
  const isProcessed = request.status === 'approved' || request.status === 'processed';

  const handleSignAndApprove = useCallback(async (
    method: SignatureMethod,
    signatureData?: string,
    otpCode?: string
  ) => {
    setIsLoading(true);
    try {
      // Create signature for the approval
      const signature = await SignatureService.generateTransactionSignature({
        transactionId: request.id,
        walletId: request.walletId || request.userId,
        amount: request.amount,
        currency: request.currency || 'SDG',
        transactionType: 'withdrawal_approval',
        receiverId: request.userId,
        senderId: approverId,
        signatureMethod: method,
        signatureData,
      });

      // Call the approval handler with signature
      if (onApprovalWithSignature) {
        await onApprovalWithSignature(request, signature);
      }

      toast({
        title: 'Approval Signed',
        description: 'Withdrawal has been approved with your digital signature.',
      });
      
      onSignatureComplete?.(signature);
      setIsModalOpen(false);

      return {
        signatureId: signature.id,
        signatureHash: signature.signatureHash,
        method,
        signedAt: new Date(),
      };
    } catch (error) {
      console.error('Signature error:', error);
      toast({
        title: 'Signature Failed',
        description: error instanceof Error ? error.message : 'Unable to complete signature',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [request, approverId, toast, onSignatureComplete, onApprovalWithSignature]);

  if (!isPending) {
    if (isProcessed && request.signatureStatus) {
      return (
        <div className="flex items-center gap-2">
          <SignatureVerificationBadge
            status={request.signatureStatus}
            size="sm"
            showDetails
          />
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => setIsModalOpen(true)}
        disabled={isLoading}
        className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
        data-testid="button-sign-approve-withdrawal"
      >
        <Shield className="w-3 h-3 mr-1" />
        Sign & Approve
      </Button>

      <SignatureConfirmationModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        transaction={{
          id: request.id,
          type: 'withdrawal',
          title: `Approve Withdrawal for ${request.userName || 'User'}`,
          description: request.reason || 'Withdrawal request approval',
          amount: request.amount,
          currency: request.currency || 'SDG',
          counterparty: request.userName,
          date: request.createdAt,
          reference: request.transactionRef,
        }}
        userId={approverId}
        userName={approverName}
        userEmail={approverEmail}
        userRole={approverRole}
        walletId={request.walletId}
        allowedMethods={['uuid', 'handwriting']}
        onSignatureComplete={handleSignAndApprove}
      />
    </div>
  );
}

// Batch approval with signature
interface BatchApprovalSignatureProps {
  requests: WithdrawalRequest[];
  approverId: string;
  approverName: string;
  approverEmail?: string;
  approverRole?: string;
  onBatchApprovalWithSignature?: (requests: WithdrawalRequest[], signature: TransactionSignature) => Promise<void>;
}

export function BatchApprovalSignature({
  requests,
  approverId,
  approverName,
  approverEmail,
  approverRole,
  onBatchApprovalWithSignature,
}: BatchApprovalSignatureProps) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const totalAmount = requests.reduce((sum, r) => sum + r.amount, 0);

  const handleSignAndApproveBatch = useCallback(async (
    method: SignatureMethod,
    signatureData?: string,
    otpCode?: string
  ) => {
    setIsLoading(true);
    try {
      // Create a batch signature document
      const signature = await SignatureService.generateTransactionSignature({
        transactionId: `batch-${Date.now()}`,
        walletId: approverId,
        amount: totalAmount,
        currency: 'SDG',
        transactionType: 'batch_withdrawal_approval',
        receiverId: 'batch',
        senderId: approverId,
        signatureMethod: method,
        signatureData,
      });

      // Process batch approval
      if (onBatchApprovalWithSignature) {
        await onBatchApprovalWithSignature(requests, signature);
      }

      toast({
        title: 'Batch Approval Signed',
        description: `${requests.length} withdrawal(s) approved with your digital signature.`,
      });
      
      setIsModalOpen(false);

      return {
        signatureId: signature.id,
        signatureHash: signature.signatureHash,
        method,
        signedAt: new Date(),
      };
    } catch (error) {
      console.error('Batch signature error:', error);
      toast({
        title: 'Signature Failed',
        description: error instanceof Error ? error.message : 'Unable to complete batch signature',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [requests, totalAmount, approverId, toast, onBatchApprovalWithSignature]);

  if (requests.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => setIsModalOpen(true)}
        disabled={isLoading}
        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        data-testid="button-batch-sign-approve"
      >
        <Shield className="w-4 h-4 mr-2" />
        Sign & Approve All ({requests.length})
      </Button>

      <SignatureConfirmationModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        transaction={{
          id: `batch-${Date.now()}`,
          type: 'withdrawal',
          title: `Approve ${requests.length} Withdrawal Request(s)`,
          description: `You are approving ${requests.length} withdrawal requests with a single signature.`,
          amount: totalAmount,
          currency: 'SDG',
          date: new Date().toISOString(),
        }}
        userId={approverId}
        userName={approverName}
        userEmail={approverEmail}
        userRole={approverRole}
        allowedMethods={['uuid', 'handwriting']}
        onSignatureComplete={handleSignAndApproveBatch}
      />
    </div>
  );
}

// Finance signature requirements alert
interface SignatureRequirementAlertProps {
  pendingCount: number;
  requiresSignature?: boolean;
}

export function SignatureRequirementAlert({ pendingCount, requiresSignature = true }: SignatureRequirementAlertProps) {
  if (!requiresSignature || pendingCount === 0) return null;

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-800 dark:text-amber-200">
        <span className="font-medium">{pendingCount} withdrawal request(s)</span> require your digital signature for approval.
        All financial approvals must be signed for audit compliance.
      </AlertDescription>
    </Alert>
  );
}

export default FinanceApprovalSignature;