import { useState, useCallback } from 'react';
import { useToast } from '@/shared/hooks/use-toast';
import { SignatureService } from '@/services/signature.service';
import type { SignatureMethod, SignableDocumentType } from '@/types/signature';

interface UseSignatureRequiredOptions {
  documentType: SignableDocumentType;
  allowedMethods?: SignatureMethod[];
  requireVerification?: boolean;
  onSignatureComplete?: (signatureId: string) => void;
  onSignatureFailed?: (error: string) => void;
}

interface SignatureResult {
  signatureId: string;
  signatureHash: string;
  method: SignatureMethod;
  signedAt: string;
  verified: boolean;
}

export function useSignatureRequired({
  documentType,
  allowedMethods = ['uuid', 'handwriting'],
  requireVerification = true,
  onSignatureComplete,
  onSignatureFailed,
}: UseSignatureRequiredOptions) {
  const { toast } = useToast();
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null);
  const [pendingTransaction, setPendingTransaction] = useState<{
    id: string;
    title: string;
    description?: string;
    amount: number;
    currency: string;
    counterparty?: string;
    date?: string;
    reference?: string;
    type: 'transaction' | 'cost_submission' | 'advance_payment' | 'withdrawal' | 'disbursement';
  } | null>(null);

  const requestSignature = useCallback((transaction: {
    id: string;
    title: string;
    description?: string;
    amount: number;
    currency: string;
    counterparty?: string;
    date?: string;
    reference?: string;
    type?: 'transaction' | 'cost_submission' | 'advance_payment' | 'withdrawal' | 'disbursement';
  }) => {
    setPendingTransaction({
      ...transaction,
      type: transaction.type || 'transaction',
    });
    setIsSignatureModalOpen(true);
  }, []);

  const handleSignatureComplete = useCallback(async (signature: {
    signatureId: string;
    signatureHash: string;
    method: SignatureMethod;
    signedAt: string;
  }) => {
    setIsPending(true);
    try {
      const result: SignatureResult = {
        ...signature,
        verified: true,
      };

      setSignatureResult(result);
      setIsSignatureModalOpen(false);
      setPendingTransaction(null);

      onSignatureComplete?.(signature.signatureId);

      toast({
        title: 'Signature Recorded',
        description: 'Your digital signature has been securely saved.',
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Signature failed';
      onSignatureFailed?.(errorMessage);
      
      toast({
        title: 'Signature Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw error;
    } finally {
      setIsPending(false);
    }
  }, [onSignatureComplete, onSignatureFailed, toast]);

  const handleSignatureCancel = useCallback(() => {
    setIsSignatureModalOpen(false);
    setPendingTransaction(null);
  }, []);

  const clearSignature = useCallback(() => {
    setSignatureResult(null);
  }, []);

  const generateQuickSignature = useCallback(async (params: {
    documentId: string;
    documentTitle: string;
    documentContent: string;
    signerId: string;
    signerName: string;
    signerEmail?: string;
    signerRole?: string;
  }): Promise<SignatureResult> => {
    setIsPending(true);
    try {
      const signature = await SignatureService.generateDocumentSignature({
        ...params,
        documentType,
        signatureMethod: 'uuid',
      });

      const result: SignatureResult = {
        signatureId: signature.id,
        signatureHash: signature.signatureHash,
        method: 'uuid',
        signedAt: signature.signedAt || new Date().toISOString(),
        verified: signature.verified,
      };

      setSignatureResult(result);
      onSignatureComplete?.(signature.id);

      toast({
        title: 'Quick Signature Applied',
        description: 'Your digital signature has been recorded.',
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Signature failed';
      onSignatureFailed?.(errorMessage);
      
      toast({
        title: 'Signature Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw error;
    } finally {
      setIsPending(false);
    }
  }, [documentType, onSignatureComplete, onSignatureFailed, toast]);

  return {
    isSignatureModalOpen,
    setIsSignatureModalOpen,
    isPending,
    signatureResult,
    pendingTransaction,
    allowedMethods,
    requestSignature,
    handleSignatureComplete,
    handleSignatureCancel,
    clearSignature,
    generateQuickSignature,
    hasSignature: !!signatureResult,
  };
}

export default useSignatureRequired;