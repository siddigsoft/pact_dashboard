import { useState, useCallback, useEffect } from 'react';
import { Shield, CheckCircle, Clock, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  SignatureConfirmationModal, 
  SignatureVerificationBadge, 
  SignatureHistory,
} from '@/components/signatures';
import { SignatureService } from '@/services/signature.service';
import type { TransactionSignature, SignatureStatus as SigStatus, SignatureMethod } from '@/types/signature';
import { useToast } from '@/hooks/use-toast';

interface WalletTransaction {
  id: string;
  walletId?: string;
  type: string;
  amount: number;
  currency: string;
  description?: string;
  createdAt: string;
  signatureStatus?: SigStatus;
  signatureId?: string;
}

interface WalletSignatureIntegrationProps {
  transaction: WalletTransaction;
  userId: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  userRole?: string;
  onSignatureComplete?: (signature: TransactionSignature) => void;
  showBadgeOnly?: boolean;
}

// Map transaction types to allowed modal types
const mapTransactionType = (type: string): 'transaction' | 'withdrawal' | 'disbursement' => {
  if (type === 'withdrawal') return 'withdrawal';
  if (type === 'disbursement' || type === 'advance_payment') return 'disbursement';
  return 'transaction';
};

export function WalletSignatureIntegration({
  transaction,
  userId,
  userName,
  userEmail,
  userPhone,
  userRole,
  onSignatureComplete,
  showBadgeOnly = false,
}: WalletSignatureIntegrationProps) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<SigStatus | undefined>(
    transaction.signatureStatus
  );

  const requiresSignature = ['withdrawal', 'disbursement', 'advance_payment'].includes(transaction.type);
  const hasSigned = signatureStatus === 'signed' || signatureStatus === 'verified';


  // Badge only mode for transaction lists
  if (showBadgeOnly) {
    if (!requiresSignature) return null;
    
    return (
      <SignatureVerificationBadge
        status={signatureStatus || 'pending'}
        method={undefined}
        size="sm"
        showDetails={false}
      />
    );
  }

  // Don't show for transactions that don't require signature
  if (!requiresSignature) return null;

  return (
    <div className="flex items-center gap-2">
      {hasSigned ? (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Signed
        </Badge>
      ) : (
        <>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
            <Clock className="w-3 h-3 mr-1" />
            Awaiting Signature
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsModalOpen(true)}
            disabled={false}
            data-testid="button-sign-transaction"
          >
            <Edit className="w-3 h-3 mr-1" />
            Sign Now
          </Button>
        </>
      )}

      <SignatureConfirmationModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        transaction={{
          id: transaction.id,
          type: mapTransactionType(transaction.type),
          title: transaction.description || `${transaction.type} Transaction`,
          amount: transaction.amount,
          currency: transaction.currency,
          date: transaction.createdAt,
        }}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        userPhone={userPhone}
        userRole={userRole}
        walletId={transaction.walletId}
        allowedMethods={['uuid', 'handwriting', 'email']}
        onSignatureComplete={(result) => {
          setSignatureStatus('signed');
          toast({
            title: 'Transaction Signed',
            description: 'Your signature has been recorded successfully.',
          });
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}

// Wallet Signature History Panel Component
interface WalletSignatureHistoryProps {
  userId: string;
  maxItems?: number;
}

export function WalletSignatureHistory({ userId, maxItems = 10 }: WalletSignatureHistoryProps) {
  const [signatures, setSignatures] = useState<TransactionSignature[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSignatures = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await SignatureService.getUserTransactionSignatures(userId, maxItems);
      setSignatures(data);
    } catch (error) {
      console.error('Error loading signatures:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, maxItems]);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  const historyItems = signatures.map(sig => ({
    id: sig.id,
    type: 'transaction' as const,
    title: sig.transactionType,
    description: `Transaction ${sig.transactionUuid}`,
    signatureMethod: sig.signatureMethod,
    status: sig.status,
    signedAt: sig.signedAt,
    verifiedAt: sig.verifiedAt,
    amount: sig.amount,
    currency: sig.currency,
  }));

  return (
    <SignatureHistory
      title="Wallet Signatures"
      description="Digital signatures for wallet transactions"
      signatures={historyItems}
      isLoading={isLoading}
      maxHeight="350px"
    />
  );
}

export default WalletSignatureIntegration;