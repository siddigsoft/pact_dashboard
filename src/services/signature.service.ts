/**
 * Signature Service
 * Core service for digital signature generation, verification, and management
 */

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import type {
  TransactionSignature,
  DocumentSignature,
  SignatureMethod,
  SignatureStatus,
  SignableDocumentType,
  SignatureAuditLog,
  HandwritingSignature,
  VerificationRequest,
  SignatureStats,
  DEFAULT_SIGNATURE_CONFIG,
} from '@/types/signature';

/**
 * Generate SHA-256 hash of data for signature integrity
 * Uses Web Crypto API with fallback for non-secure contexts
 */
async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Check if Web Crypto API is available (browser secure context)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('[SignatureService] Web Crypto API failed, using fallback hash');
    }
  }
  
  // Fallback: Simple hash function for non-secure contexts
  // Note: This should only be used as a last resort
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Generate a longer hash by combining multiple iterations
  const iterations = 8;
  let fullHash = '';
  for (let i = 0; i < iterations; i++) {
    const iterData = data + i.toString() + hash.toString();
    let iterHash = 0;
    for (let j = 0; j < iterData.length; j++) {
      const char = iterData.charCodeAt(j);
      iterHash = ((iterHash << 5) - iterHash) + char;
      iterHash = iterHash & iterHash;
    }
    fullHash += Math.abs(iterHash).toString(16).padStart(8, '0');
  }
  return fullHash;
}

/**
 * Generate a cryptographically secure random OTP
 */
function generateOTP(length: number = 6): string {
  const digits = '0123456789';
  const array = new Uint32Array(length);
  
  // Use crypto.getRandomValues for cryptographically secure random numbers
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for environments without crypto (should be rare)
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 4294967296);
    }
  }
  
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[array[i] % digits.length];
  }
  return otp;
}

/**
 * Get device and browser information
 */
function getDeviceInfo(): { userAgent: string; deviceInfo: string } {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  
  let deviceInfo = 'Unknown Device';
  if (typeof navigator !== 'undefined') {
    const platform = (navigator as any).userAgentData?.platform || navigator.platform || 'Unknown';
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
    deviceInfo = `${platform} - ${isMobile ? 'Mobile' : 'Desktop'}`;
  }
  
  return { userAgent, deviceInfo };
}

export const SignatureService = {
  /**
   * Generate a transaction signature when money is received
   */
  async generateTransactionSignature(params: {
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
  }): Promise<TransactionSignature> {
    const transactionUuid = uuidv4();
    const timestamp = new Date().toISOString();
    const { userAgent, deviceInfo } = getDeviceInfo();
    
    // Create data string for hashing
    const dataToHash = JSON.stringify({
      transactionId: params.transactionId,
      transactionUuid,
      senderId: params.senderId,
      receiverId: params.receiverId,
      amount: params.amount,
      currency: params.currency,
      transactionType: params.transactionType,
      timestamp,
    });
    
    const signatureHash = await generateHash(dataToHash);
    
    const signature: TransactionSignature = {
      id: uuidv4(),
      transactionId: params.transactionId,
      walletId: params.walletId,
      signatureHash,
      signatureMethod: params.signatureMethod || 'uuid',
      signatureData: params.signatureData,
      senderId: params.senderId,
      senderIdentifier: params.senderIdentifier,
      receiverId: params.receiverId,
      receiverIdentifier: params.receiverIdentifier,
      transactionUuid,
      amount: params.amount,
      currency: params.currency,
      transactionType: params.transactionType,
      status: 'signed',
      verified: true,
      verifiedAt: timestamp,
      createdAt: timestamp,
      signedAt: timestamp,
      userAgent,
      deviceInfo,
    };
    
    // Store signature in database
    const { error } = await supabase
      .from('transaction_signatures')
      .insert({
        id: signature.id,
        transaction_id: signature.transactionId,
        wallet_id: signature.walletId,
        signature_hash: signature.signatureHash,
        signature_method: signature.signatureMethod,
        signature_data: signature.signatureData,
        sender_id: signature.senderId,
        sender_identifier: signature.senderIdentifier,
        receiver_id: signature.receiverId,
        receiver_identifier: signature.receiverIdentifier,
        transaction_uuid: signature.transactionUuid,
        amount: signature.amount,
        currency: signature.currency,
        transaction_type: signature.transactionType,
        status: signature.status,
        verified: signature.verified,
        verified_at: signature.verifiedAt,
        created_at: signature.createdAt,
        signed_at: signature.signedAt,
        user_agent: signature.userAgent,
        device_info: signature.deviceInfo,
      });
    
    if (error) {
      console.error('[SignatureService] Failed to store transaction signature:', error);
      // Continue even if storage fails - signature is still valid
    }
    
    // Create audit log
    await this.createAuditLog({
      action: 'signed',
      signatureId: signature.id,
      signatureType: 'transaction',
      performedBy: params.receiverId,
      newStatus: 'signed',
    });
    
    return signature;
  },

  /**
   * Generate a document signature
   */
  async generateDocumentSignature(params: {
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
  }): Promise<DocumentSignature> {
    const timestamp = new Date().toISOString();
    const { userAgent, deviceInfo } = getDeviceInfo();
    
    // Hash the document content for integrity
    const documentHash = await generateHash(params.documentContent);
    
    // Create signature hash
    const dataToHash = JSON.stringify({
      documentId: params.documentId,
      documentHash,
      signerId: params.signerId,
      signatureMethod: params.signatureMethod,
      timestamp,
    });
    
    const signatureHash = await generateHash(dataToHash);
    
    const signature: DocumentSignature = {
      id: uuidv4(),
      documentId: params.documentId,
      documentType: params.documentType,
      documentTitle: params.documentTitle,
      documentHash,
      signatureHash,
      signatureMethod: params.signatureMethod,
      signatureData: params.signatureData,
      signerId: params.signerId,
      signerName: params.signerName,
      signerEmail: params.signerEmail,
      signerPhone: params.signerPhone,
      signerRole: params.signerRole,
      status: 'signed',
      verified: true,
      verifiedAt: timestamp,
      verificationCode: params.verificationCode,
      createdAt: timestamp,
      signedAt: timestamp,
      userAgent,
      deviceInfo,
      location: params.location,
    };
    
    // Store signature in database
    const { error } = await supabase
      .from('document_signatures')
      .insert({
        id: signature.id,
        document_id: signature.documentId,
        document_type: signature.documentType,
        document_title: signature.documentTitle,
        document_hash: signature.documentHash,
        signature_hash: signature.signatureHash,
        signature_method: signature.signatureMethod,
        signature_data: signature.signatureData,
        signer_id: signature.signerId,
        signer_name: signature.signerName,
        signer_email: signature.signerEmail,
        signer_phone: signature.signerPhone,
        signer_role: signature.signerRole,
        status: signature.status,
        verified: signature.verified,
        verified_at: signature.verifiedAt,
        verification_code: signature.verificationCode,
        created_at: signature.createdAt,
        signed_at: signature.signedAt,
        user_agent: signature.userAgent,
        device_info: signature.deviceInfo,
        location: signature.location,
      });
    
    if (error) {
      console.error('[SignatureService] Failed to store document signature:', error);
    }
    
    // Create audit log
    await this.createAuditLog({
      action: 'signed',
      signatureId: signature.id,
      signatureType: 'document',
      performedBy: params.signerId,
      performedByName: params.signerName,
      performedByRole: params.signerRole,
      newStatus: 'signed',
    });
    
    return signature;
  },

  /**
   * Verify a transaction signature
   */
  async verifyTransactionSignature(signatureId: string, verifierId: string): Promise<{
    valid: boolean;
    signature?: TransactionSignature;
    error?: string;
  }> {
    const { data, error } = await supabase
      .from('transaction_signatures')
      .select('*')
      .eq('id', signatureId)
      .single();
    
    if (error || !data) {
      return { valid: false, error: 'Signature not found' };
    }
    
    // Reconstruct and verify hash
    const dataToHash = JSON.stringify({
      transactionId: data.transaction_id,
      transactionUuid: data.transaction_uuid,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      amount: data.amount,
      currency: data.currency,
      transactionType: data.transaction_type,
      timestamp: data.created_at,
    });
    
    const expectedHash = await generateHash(dataToHash);
    
    if (expectedHash !== data.signature_hash) {
      // Tampering detected
      await this.createAuditLog({
        action: 'failed',
        signatureId,
        signatureType: 'transaction',
        performedBy: verifierId,
        previousStatus: data.status,
        newStatus: 'invalid',
        reason: 'Hash mismatch - possible tampering detected',
      });
      
      return { valid: false, error: 'Signature integrity check failed - possible tampering' };
    }
    
    // Update verification status
    await supabase
      .from('transaction_signatures')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: verifierId,
      })
      .eq('id', signatureId);
    
    await this.createAuditLog({
      action: 'verified',
      signatureId,
      signatureType: 'transaction',
      performedBy: verifierId,
      previousStatus: data.status,
      newStatus: 'verified',
    });
    
    return {
      valid: true,
      signature: this.transformTransactionSignature(data),
    };
  },

  /**
   * Verify a document signature
   */
  async verifyDocumentSignature(signatureId: string, documentContent: string, verifierId: string): Promise<{
    valid: boolean;
    signature?: DocumentSignature;
    error?: string;
  }> {
    const { data, error } = await supabase
      .from('document_signatures')
      .select('*')
      .eq('id', signatureId)
      .single();
    
    if (error || !data) {
      return { valid: false, error: 'Signature not found' };
    }
    
    // Verify document hash
    const documentHash = await generateHash(documentContent);
    if (documentHash !== data.document_hash) {
      await this.createAuditLog({
        action: 'failed',
        signatureId,
        signatureType: 'document',
        performedBy: verifierId,
        previousStatus: data.status,
        newStatus: 'invalid',
        reason: 'Document content has been modified',
      });
      
      return { valid: false, error: 'Document has been modified since signing' };
    }
    
    // Update verification status
    await supabase
      .from('document_signatures')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: verifierId,
      })
      .eq('id', signatureId);
    
    await this.createAuditLog({
      action: 'verified',
      signatureId,
      signatureType: 'document',
      performedBy: verifierId,
      previousStatus: data.status,
      newStatus: 'verified',
    });
    
    return {
      valid: true,
      signature: this.transformDocumentSignature(data),
    };
  },

  /**
   * Save a handwriting signature
   */
  async saveHandwritingSignature(params: {
    userId: string;
    signatureImage: string;
    signatureType: 'drawn' | 'uploaded';
    canvasWidth?: number;
    canvasHeight?: number;
    strokeCount?: number;
    isDefault?: boolean;
  }): Promise<HandwritingSignature> {
    const timestamp = new Date().toISOString();
    
    // If setting as default, unset other defaults
    if (params.isDefault) {
      await supabase
        .from('handwriting_signatures')
        .update({ is_default: false })
        .eq('user_id', params.userId);
    }
    
    const signature: HandwritingSignature = {
      id: uuidv4(),
      userId: params.userId,
      signatureImage: params.signatureImage,
      signatureType: params.signatureType,
      canvasWidth: params.canvasWidth,
      canvasHeight: params.canvasHeight,
      strokeCount: params.strokeCount,
      isDefault: params.isDefault || false,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    
    const { error } = await supabase
      .from('handwriting_signatures')
      .insert({
        id: signature.id,
        user_id: signature.userId,
        signature_image: signature.signatureImage,
        signature_type: signature.signatureType,
        canvas_width: signature.canvasWidth,
        canvas_height: signature.canvasHeight,
        stroke_count: signature.strokeCount,
        is_default: signature.isDefault,
        is_active: signature.isActive,
        created_at: signature.createdAt,
        updated_at: signature.updatedAt,
      });
    
    if (error) {
      console.error('[SignatureService] Failed to save handwriting signature:', error);
      throw error;
    }
    
    return signature;
  },

  /**
   * Get user's handwriting signatures
   */
  async getUserHandwritingSignatures(userId: string): Promise<HandwritingSignature[]> {
    const { data, error } = await supabase
      .from('handwriting_signatures')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error || !data) {
      return [];
    }
    
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      signatureImage: item.signature_image,
      signatureType: item.signature_type,
      canvasWidth: item.canvas_width,
      canvasHeight: item.canvas_height,
      strokeCount: item.stroke_count,
      isDefault: item.is_default,
      isActive: item.is_active,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      lastUsedAt: item.last_used_at,
    }));
  },

  /**
   * Get user's default signature
   */
  async getDefaultSignature(userId: string): Promise<HandwritingSignature | null> {
    const { data, error } = await supabase
      .from('handwriting_signatures')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return {
      id: data.id,
      userId: data.user_id,
      signatureImage: data.signature_image,
      signatureType: data.signature_type,
      canvasWidth: data.canvas_width,
      canvasHeight: data.canvas_height,
      strokeCount: data.stroke_count,
      isDefault: data.is_default,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastUsedAt: data.last_used_at,
    };
  },

  /**
   * Create verification request for phone/email
   */
  async createVerificationRequest(params: {
    userId: string;
    method: 'phone' | 'email';
    destination: string;
    purpose: 'transaction' | 'document' | 'login';
    relatedId?: string;
  }): Promise<{ requestId: string; expiresAt: string }> {
    const otp = generateOTP(6);
    const otpHash = await generateHash(otp);
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    
    const requestId = uuidv4();
    
    const { error } = await supabase
      .from('verification_requests')
      .insert({
        id: requestId,
        user_id: params.userId,
        method: params.method,
        destination: params.destination,
        code_hash: otpHash,
        code_expires_at: expiresAt,
        attempts: 0,
        max_attempts: 3,
        verified: false,
        purpose: params.purpose,
        related_id: params.relatedId,
        created_at: timestamp,
        expires_at: expiresAt,
      });
    
    if (error) {
      console.error('[SignatureService] Failed to create verification request:', error);
      throw error;
    }
    
    // In production, send OTP via SMS/Email service
    // For now, log it (would integrate with Twilio/SendGrid)
    console.log(`[SignatureService] Verification code for ${params.destination}: ${otp}`);
    
    return { requestId, expiresAt };
  },

  /**
   * Verify OTP code
   */
  async verifyCode(requestId: string, code: string): Promise<{
    verified: boolean;
    error?: string;
  }> {
    const { data, error } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    
    if (error || !data) {
      return { verified: false, error: 'Verification request not found' };
    }
    
    if (data.verified) {
      return { verified: false, error: 'Code already verified' };
    }
    
    if (new Date(data.code_expires_at) < new Date()) {
      return { verified: false, error: 'Verification code expired' };
    }
    
    if (data.attempts >= data.max_attempts) {
      return { verified: false, error: 'Maximum attempts exceeded' };
    }
    
    const codeHash = await generateHash(code);
    
    if (codeHash !== data.code_hash) {
      // Increment attempts
      await supabase
        .from('verification_requests')
        .update({ attempts: data.attempts + 1 })
        .eq('id', requestId);
      
      return { verified: false, error: 'Invalid verification code' };
    }
    
    // Mark as verified
    await supabase
      .from('verification_requests')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
      })
      .eq('id', requestId);
    
    return { verified: true };
  },

  /**
   * Create audit log entry
   */
  async createAuditLog(params: {
    action: 'created' | 'signed' | 'verified' | 'revoked' | 'expired' | 'failed';
    signatureId: string;
    signatureType: 'transaction' | 'document';
    performedBy: string;
    performedByName?: string;
    performedByRole?: string;
    previousStatus?: SignatureStatus;
    newStatus: SignatureStatus;
    reason?: string;
  }): Promise<void> {
    const { userAgent } = getDeviceInfo();
    
    const { error } = await supabase
      .from('signature_audit_logs')
      .insert({
        id: uuidv4(),
        action: params.action,
        signature_id: params.signatureId,
        signature_type: params.signatureType,
        performed_by: params.performedBy,
        performed_by_name: params.performedByName,
        performed_by_role: params.performedByRole,
        previous_status: params.previousStatus,
        new_status: params.newStatus,
        reason: params.reason,
        user_agent: userAgent,
        performed_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error('[SignatureService] Failed to create audit log:', error);
    }
  },

  /**
   * Get transaction signatures for a user
   */
  async getUserTransactionSignatures(userId: string, limit: number = 50): Promise<TransactionSignature[]> {
    const { data, error } = await supabase
      .from('transaction_signatures')
      .select('*')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error || !data) {
      return [];
    }
    
    return data.map(this.transformTransactionSignature);
  },

  /**
   * Get document signatures for a user
   */
  async getUserDocumentSignatures(userId: string, limit: number = 50): Promise<DocumentSignature[]> {
    const { data, error } = await supabase
      .from('document_signatures')
      .select('*')
      .eq('signer_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error || !data) {
      return [];
    }
    
    return data.map(this.transformDocumentSignature);
  },

  /**
   * Get signature statistics for a user
   */
  async getSignatureStats(userId: string): Promise<SignatureStats> {
    const [transactionSigs, documentSigs] = await Promise.all([
      this.getUserTransactionSignatures(userId, 1000),
      this.getUserDocumentSignatures(userId, 1000),
    ]);
    
    const allSignatures = [...transactionSigs, ...documentSigs];
    
    const byMethod: Record<SignatureMethod, number> = {
      uuid: 0,
      phone: 0,
      email: 0,
      handwriting: 0,
      biometric: 0,
    };
    
    const byDocumentType: Record<SignableDocumentType, number> = {
      transaction: 0,
      withdrawal_request: 0,
      contract: 0,
      site_visit_report: 0,
      cost_submission: 0,
      down_payment_request: 0,
      mmp_approval: 0,
      compliance_document: 0,
      custom: 0,
    };
    
    transactionSigs.forEach(sig => {
      byMethod[sig.signatureMethod]++;
      byDocumentType.transaction++;
    });
    
    documentSigs.forEach(sig => {
      byMethod[sig.signatureMethod]++;
      byDocumentType[sig.documentType]++;
    });
    
    return {
      totalSignatures: allSignatures.length,
      pendingSignatures: allSignatures.filter(s => s.status === 'pending').length,
      verifiedSignatures: allSignatures.filter(s => s.verified).length,
      expiredSignatures: allSignatures.filter(s => s.status === 'expired').length,
      byMethod,
      byDocumentType,
      lastSignedAt: allSignatures[0]?.signedAt,
    };
  },

  /**
   * Revoke a signature
   */
  async revokeSignature(params: {
    signatureId: string;
    signatureType: 'transaction' | 'document';
    revokedBy: string;
    reason: string;
  }): Promise<boolean> {
    const table = params.signatureType === 'transaction' 
      ? 'transaction_signatures' 
      : 'document_signatures';
    
    const { data, error } = await supabase
      .from(table)
      .update({ status: 'revoked' })
      .eq('id', params.signatureId)
      .select()
      .single();
    
    if (error) {
      console.error('[SignatureService] Failed to revoke signature:', error);
      return false;
    }
    
    await this.createAuditLog({
      action: 'revoked',
      signatureId: params.signatureId,
      signatureType: params.signatureType,
      performedBy: params.revokedBy,
      previousStatus: data.status,
      newStatus: 'revoked',
      reason: params.reason,
    });
    
    return true;
  },

  // Transform functions
  transformTransactionSignature(data: any): TransactionSignature {
    return {
      id: data.id,
      transactionId: data.transaction_id,
      walletId: data.wallet_id,
      signatureHash: data.signature_hash,
      signatureMethod: data.signature_method,
      signatureData: data.signature_data,
      senderId: data.sender_id,
      senderIdentifier: data.sender_identifier,
      receiverId: data.receiver_id,
      receiverIdentifier: data.receiver_identifier,
      transactionUuid: data.transaction_uuid,
      amount: parseFloat(data.amount),
      currency: data.currency,
      transactionType: data.transaction_type,
      status: data.status,
      verified: data.verified,
      verifiedAt: data.verified_at,
      verifiedBy: data.verified_by,
      createdAt: data.created_at,
      signedAt: data.signed_at,
      expiresAt: data.expires_at,
      ipAddress: data.ip_address,
      userAgent: data.user_agent,
      deviceInfo: data.device_info,
      metadata: data.metadata,
    };
  },

  transformDocumentSignature(data: any): DocumentSignature {
    return {
      id: data.id,
      documentId: data.document_id,
      documentType: data.document_type,
      documentTitle: data.document_title,
      documentHash: data.document_hash,
      signatureHash: data.signature_hash,
      signatureMethod: data.signature_method,
      signatureData: data.signature_data,
      signerId: data.signer_id,
      signerName: data.signer_name,
      signerEmail: data.signer_email,
      signerPhone: data.signer_phone,
      signerRole: data.signer_role,
      status: data.status,
      verified: data.verified,
      verifiedAt: data.verified_at,
      verificationCode: data.verification_code,
      createdAt: data.created_at,
      signedAt: data.signed_at,
      expiresAt: data.expires_at,
      ipAddress: data.ip_address,
      userAgent: data.user_agent,
      deviceInfo: data.device_info,
      location: data.location,
      metadata: data.metadata,
    };
  },
};

export default SignatureService;
