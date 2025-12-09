/**
 * useSignature Hook
 * React hook for signature operations
 */

import { useState, useCallback, useEffect } from 'react';
import { SignatureService } from '@/services/signature.service';
import type {
  TransactionSignature,
  DocumentSignature,
  HandwritingSignature,
  SignatureMethod,
  SignableDocumentType,
  SignatureStats,
} from '@/types/signature';

interface UseSignatureOptions {
  userId: string;
  autoLoadSavedSignatures?: boolean;
}

export function useSignature({ userId, autoLoadSavedSignatures = true }: UseSignatureOptions) {
  const [loading, setLoading] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState<HandwritingSignature[]>([]);
  const [defaultSignature, setDefaultSignature] = useState<HandwritingSignature | null>(null);
  const [stats, setStats] = useState<SignatureStats | null>(null);

  // Load saved signatures
  const loadSavedSignatures = useCallback(async () => {
    if (!userId) return;
    
    try {
      const [signatures, defSig] = await Promise.all([
        SignatureService.getUserHandwritingSignatures(userId),
        SignatureService.getDefaultSignature(userId),
      ]);
      setSavedSignatures(signatures);
      setDefaultSignature(defSig);
    } catch (error) {
      console.error('[useSignature] Failed to load signatures:', error);
    }
  }, [userId]);

  // Load stats
  const loadStats = useCallback(async () => {
    if (!userId) return;
    
    try {
      const signatureStats = await SignatureService.getSignatureStats(userId);
      setStats(signatureStats);
    } catch (error) {
      console.error('[useSignature] Failed to load stats:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (autoLoadSavedSignatures && userId) {
      loadSavedSignatures();
      loadStats();
    }
  }, [userId, autoLoadSavedSignatures, loadSavedSignatures, loadStats]);

  /**
   * Sign a transaction
   */
  const signTransaction = useCallback(async (params: {
    transactionId: string;
    walletId: string;
    senderId?: string;
    senderIdentifier?: string;
    receiverId: string;
    receiverIdentifier?: string;
    amount: number;
    currency: string;
    transactionType: string;
    signatureMethod?: SignatureMethod;
    signatureData?: string;
  }): Promise<TransactionSignature> => {
    setLoading(true);
    try {
      const signature = await SignatureService.generateTransactionSignature(params);
      return signature;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Sign a document
   */
  const signDocument = useCallback(async (params: {
    documentId: string;
    documentType: SignableDocumentType;
    documentTitle: string;
    documentContent: string;
    signerId: string;
    signerName: string;
    signerEmail?: string;
    signerPhone?: string;
    signerRole?: string;
    signatureMethod: SignatureMethod;
    signatureData?: string;
    verificationCode?: string;
    location?: { latitude: number; longitude: number; accuracy: number };
  }): Promise<DocumentSignature> => {
    setLoading(true);
    try {
      const signature = await SignatureService.generateDocumentSignature(params);
      await loadStats(); // Refresh stats
      return signature;
    } finally {
      setLoading(false);
    }
  }, [loadStats]);

  /**
   * Save a handwriting signature
   */
  const saveHandwritingSignature = useCallback(async (params: {
    signatureImage: string;
    signatureType: 'drawn' | 'uploaded';
    canvasWidth?: number;
    canvasHeight?: number;
    strokeCount?: number;
    isDefault?: boolean;
  }): Promise<HandwritingSignature> => {
    setLoading(true);
    try {
      const signature = await SignatureService.saveHandwritingSignature({
        userId,
        ...params,
      });
      await loadSavedSignatures(); // Refresh saved signatures
      return signature;
    } finally {
      setLoading(false);
    }
  }, [userId, loadSavedSignatures]);

  /**
   * Verify a transaction signature
   */
  const verifyTransactionSignature = useCallback(async (
    signatureId: string,
    verifierId: string
  ) => {
    setLoading(true);
    try {
      return await SignatureService.verifyTransactionSignature(signatureId, verifierId);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Verify a document signature
   */
  const verifyDocumentSignature = useCallback(async (
    signatureId: string,
    documentContent: string,
    verifierId: string
  ) => {
    setLoading(true);
    try {
      return await SignatureService.verifyDocumentSignature(signatureId, documentContent, verifierId);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Request verification code
   */
  const requestVerificationCode = useCallback(async (params: {
    method: 'phone' | 'email';
    destination: string;
    purpose: 'transaction' | 'document' | 'login';
    relatedId?: string;
  }) => {
    setLoading(true);
    try {
      return await SignatureService.createVerificationRequest({
        userId,
        ...params,
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Verify code
   */
  const verifyCode = useCallback(async (requestId: string, code: string) => {
    setLoading(true);
    try {
      return await SignatureService.verifyCode(requestId, code);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Revoke a signature
   */
  const revokeSignature = useCallback(async (params: {
    signatureId: string;
    signatureType: 'transaction' | 'document';
    reason: string;
  }) => {
    setLoading(true);
    try {
      return await SignatureService.revokeSignature({
        ...params,
        revokedBy: userId,
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    loading,
    savedSignatures,
    defaultSignature,
    stats,
    signTransaction,
    signDocument,
    saveHandwritingSignature,
    verifyTransactionSignature,
    verifyDocumentSignature,
    requestVerificationCode,
    verifyCode,
    revokeSignature,
    refreshSavedSignatures: loadSavedSignatures,
    refreshStats: loadStats,
  };
}

export default useSignature;
