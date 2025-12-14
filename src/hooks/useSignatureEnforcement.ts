/**
 * Signature Enforcement Hook
 * Ensures signatures are captured before financial approvals and transactions
 */

import { useState, useCallback } from 'react';
import { SignatureService } from '@/services/signature.service';
import { useAuditOptional } from '@/context/audit/AuditContext';
import { useToast } from '@/hooks/use-toast';
import type { SignatureMethod, SignableDocumentType } from '@/types/signature';

interface SignatureRequirement {
  type: 'transaction' | 'document';
  entityId: string;
  entityType: string;
  amount?: number;
  currency?: string;
  description?: string;
}

interface SignatureResult {
  success: boolean;
  signatureId?: string;
  signatureHash?: string;
  error?: string;
}

export function useSignatureEnforcement() {
  const [isCollecting, setIsCollecting] = useState(false);
  const [pendingSignature, setPendingSignature] = useState<SignatureRequirement | null>(null);
  const audit = useAuditOptional();
  const { toast } = useToast();

  const requireSignatureForTransaction = useCallback(async (params: {
    transactionId: string;
    walletId: string;
    senderId?: string;
    senderName?: string;
    receiverId: string;
    receiverName?: string;
    amount: number;
    currency: string;
    transactionType: string;
    signatureMethod?: SignatureMethod;
    signatureData?: string;
  }): Promise<SignatureResult> => {
    setIsCollecting(true);
    
    try {
      const signature = await SignatureService.generateTransactionSignature({
        transactionId: params.transactionId,
        walletId: params.walletId,
        senderId: params.senderId,
        senderIdentifier: params.senderName,
        receiverId: params.receiverId,
        receiverIdentifier: params.receiverName,
        amount: params.amount,
        currency: params.currency,
        transactionType: params.transactionType,
        signatureMethod: params.signatureMethod || 'uuid',
        signatureData: params.signatureData,
      });

      if (audit) {
        await audit.logAuditEvent({
          module: 'wallet',
          action: 'create',
          entityType: 'transaction_signature',
          entityId: signature.id,
          description: `Transaction signature created for ${params.transactionType}`,
          metadata: {
            transactionId: params.transactionId,
            transactionType: params.transactionType,
            amount: params.amount,
            currency: params.currency,
            signatureMethod: signature.signatureMethod,
            signatureHashPrefix: signature.signatureHash?.substring(0, 16),
          },
        });
      }

      return {
        success: true,
        signatureId: signature.id,
        signatureHash: signature.signatureHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to capture signature';
      
      if (audit) {
        await audit.logAuditEvent({
          module: 'wallet',
          action: 'update',
          entityType: 'transaction_signature',
          entityId: params.transactionId,
          description: `Transaction signature failed: ${errorMessage}`,
          severity: 'warning',
          metadata: {
            transactionType: params.transactionType,
            status: 'signature_failed',
          },
          success: false,
          errorMessage,
        });
      }

      toast({
        title: 'Signature Required',
        description: errorMessage,
        variant: 'destructive',
      });

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsCollecting(false);
    }
  }, [audit, toast]);

  const requireSignatureForApproval = useCallback(async (params: {
    documentId: string;
    documentType: SignableDocumentType;
    documentTitle: string;
    documentContent: string;
    signerId: string;
    signerName: string;
    signerEmail?: string;
    signerRole?: string;
    signatureMethod?: SignatureMethod;
    signatureData?: string;
  }): Promise<SignatureResult> => {
    setIsCollecting(true);

    try {
      const signature = await SignatureService.generateDocumentSignature({
        documentId: params.documentId,
        documentType: params.documentType,
        documentTitle: params.documentTitle,
        documentContent: params.documentContent,
        signerId: params.signerId,
        signerName: params.signerName,
        signerEmail: params.signerEmail,
        signerRole: params.signerRole,
        signatureMethod: params.signatureMethod || 'uuid',
        signatureData: params.signatureData,
      });

      if (audit) {
        await audit.logAuditEvent({
          module: 'approval',
          action: 'create',
          entityType: 'document_signature',
          entityId: signature.id,
          description: `Approval signature created by ${params.signerName}`,
          metadata: {
            documentId: params.documentId,
            documentType: params.documentType,
            signerName: params.signerName,
            signerRole: params.signerRole,
            signatureMethod: signature.signatureMethod,
            signatureHashPrefix: signature.signatureHash?.substring(0, 16),
          },
        });
      }

      return {
        success: true,
        signatureId: signature.id,
        signatureHash: signature.signatureHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to capture approval signature';
      
      if (audit) {
        await audit.logAuditEvent({
          module: 'approval',
          action: 'update',
          entityType: 'document_signature',
          entityId: params.documentId,
          description: `Approval signature failed: ${errorMessage}`,
          severity: 'warning',
          metadata: {
            documentType: params.documentType,
            status: 'signature_failed',
          },
          success: false,
          errorMessage,
        });
      }

      toast({
        title: 'Approval Signature Required',
        description: errorMessage,
        variant: 'destructive',
      });

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsCollecting(false);
    }
  }, [audit, toast]);

  const verifyExistingSignature = useCallback(async (
    signatureId: string,
    signatureType: 'transaction' | 'document',
    verifierId: string,
    documentContent?: string
  ): Promise<{ valid: boolean; error?: string }> => {
    try {
      if (signatureType === 'transaction') {
        const result = await SignatureService.verifyTransactionSignature(signatureId, verifierId);
        
        if (audit) {
          await audit.logAuditEvent({
            module: 'wallet',
            action: 'view',
            entityType: 'transaction_signature',
            entityId: signatureId,
            description: `Transaction signature verification: ${result.valid ? 'valid' : 'invalid'}`,
            metadata: {
              verifierId,
              verificationResult: result.valid ? 'valid' : 'invalid',
            },
          });
        }
        
        return { valid: result.valid, error: result.error };
      } else {
        if (!documentContent) {
          return { valid: false, error: 'Document content required for verification' };
        }
        
        const result = await SignatureService.verifyDocumentSignature(signatureId, documentContent, verifierId);
        
        if (audit) {
          await audit.logAuditEvent({
            module: 'approval',
            action: 'view',
            entityType: 'document_signature',
            entityId: signatureId,
            description: `Document signature verification: ${result.valid ? 'valid' : 'invalid'}`,
            metadata: {
              verifierId,
              verificationResult: result.valid ? 'valid' : 'invalid',
            },
          });
        }
        
        return { valid: result.valid, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      return { valid: false, error: errorMessage };
    }
  }, [audit]);

  return {
    isCollecting,
    pendingSignature,
    setPendingSignature,
    requireSignatureForTransaction,
    requireSignatureForApproval,
    verifyExistingSignature,
  };
}
