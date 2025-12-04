/**
 * Signature & Transaction Module Types
 * Comprehensive digital signature system for PACT Platform
 */

// Signature methods supported by the system
export type SignatureMethod = 
  | 'uuid'           // System-generated UUID signature
  | 'phone'          // Phone number verification
  | 'email'          // Email verification  
  | 'handwriting'    // Drawn or uploaded signature
  | 'biometric';     // Future: fingerprint/face ID

// Signature status
export type SignatureStatus = 
  | 'pending'        // Awaiting signature
  | 'signed'         // Successfully signed
  | 'verified'       // Signature verified
  | 'expired'        // Signature request expired
  | 'revoked'        // Signature revoked
  | 'invalid';       // Signature validation failed

// Document types that can be signed
export type SignableDocumentType = 
  | 'transaction'           // Wallet transaction
  | 'withdrawal_request'    // Withdrawal confirmation
  | 'contract'              // Employment/service contract
  | 'site_visit_report'     // Field visit documentation
  | 'cost_submission'       // Cost/expense submission
  | 'down_payment_request'  // Down payment request
  | 'mmp_approval'          // MMP approval document
  | 'compliance_document'   // Compliance/audit document
  | 'custom';               // Custom document

/**
 * Transaction Signature
 * Generated automatically when money is received or transactions occur
 */
export interface TransactionSignature {
  id: string;
  transactionId: string;
  walletId: string;
  
  // Signature details
  signatureHash: string;        // SHA-256 hash of transaction data
  signatureMethod: SignatureMethod;
  signatureData?: string;       // Base64 encoded handwriting signature
  
  // Parties involved
  senderId?: string;            // Sender user ID, phone, or email
  senderIdentifier?: string;    // Human-readable sender identifier
  receiverId: string;           // Receiver user ID
  receiverIdentifier?: string;  // Human-readable receiver identifier
  
  // Transaction reference
  transactionUuid: string;      // Unique transaction reference
  amount: number;
  currency: string;
  transactionType: string;
  
  // Verification
  status: SignatureStatus;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  
  // Timestamps (ISO 8601)
  createdAt: string;
  signedAt?: string;
  expiresAt?: string;
  
  // Metadata
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
  metadata?: Record<string, any>;
}

/**
 * Document Signature
 * For signing contracts, reports, and other documents
 */
export interface DocumentSignature {
  id: string;
  documentId: string;
  documentType: SignableDocumentType;
  documentTitle: string;
  documentHash: string;         // Hash of document content for integrity
  
  // Signature details
  signatureHash: string;
  signatureMethod: SignatureMethod;
  signatureData?: string;       // Base64 encoded handwriting signature
  
  // Signer information
  signerId: string;
  signerName: string;
  signerEmail?: string;
  signerPhone?: string;
  signerRole?: string;
  
  // Verification
  status: SignatureStatus;
  verified: boolean;
  verifiedAt?: string;
  verificationCode?: string;    // OTP or verification code used
  
  // Timestamps
  createdAt: string;
  signedAt?: string;
  expiresAt?: string;
  
  // Metadata
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Signature Request
 * For requesting signatures from users
 */
export interface SignatureRequest {
  id: string;
  requestType: 'transaction' | 'document';
  documentId?: string;
  transactionId?: string;
  
  // Request details
  title: string;
  description: string;
  requiredMethods: SignatureMethod[];
  
  // Requestee
  requestedFrom: string;        // User ID
  requestedBy: string;          // Requester user ID
  
  // Status
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  
  // Timestamps
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  
  // Result
  signatureId?: string;         // Reference to completed signature
  metadata?: Record<string, any>;
}

/**
 * Signature Audit Log Entry
 * Immutable audit trail for all signature operations
 */
export interface SignatureAuditLog {
  id: string;
  action: 'created' | 'signed' | 'verified' | 'revoked' | 'expired' | 'failed';
  signatureId: string;
  signatureType: 'transaction' | 'document';
  
  // Actor
  performedBy: string;
  performedByName?: string;
  performedByRole?: string;
  
  // Details
  previousStatus?: SignatureStatus;
  newStatus: SignatureStatus;
  reason?: string;
  
  // Security
  ipAddress?: string;
  userAgent?: string;
  
  // Timestamp
  performedAt: string;
  
  // Additional data
  metadata?: Record<string, any>;
}

/**
 * Handwriting Signature Data
 * For storing drawn or uploaded signatures
 */
export interface HandwritingSignature {
  id: string;
  userId: string;
  
  // Signature image
  signatureImage: string;       // Base64 encoded PNG
  signatureType: 'drawn' | 'uploaded';
  
  // Canvas metadata (for drawn signatures)
  canvasWidth?: number;
  canvasHeight?: number;
  strokeCount?: number;
  
  // Status
  isDefault: boolean;           // User's default signature
  isActive: boolean;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

/**
 * Verification Request
 * For phone/email verification signatures
 */
export interface VerificationRequest {
  id: string;
  userId: string;
  method: 'phone' | 'email';
  destination: string;          // Phone number or email address
  
  // Verification code
  code: string;                 // Hashed OTP
  codeExpiresAt: string;
  attempts: number;
  maxAttempts: number;
  
  // Status
  verified: boolean;
  verifiedAt?: string;
  
  // Context
  purpose: 'transaction' | 'document' | 'login';
  relatedId?: string;           // Transaction or document ID
  
  // Timestamps
  createdAt: string;
  expiresAt: string;
}

/**
 * Signature Configuration
 * System-wide signature settings
 */
export interface SignatureConfig {
  // Expiration settings
  transactionSignatureExpiryHours: number;
  documentSignatureExpiryDays: number;
  verificationCodeExpiryMinutes: number;
  
  // Security settings
  requireSignatureForTransactions: boolean;
  requireSignatureForWithdrawals: boolean;
  requireSignatureForDocuments: boolean;
  
  // Allowed methods by document type
  allowedMethods: Record<SignableDocumentType, SignatureMethod[]>;
  
  // Verification settings
  maxVerificationAttempts: number;
  otpLength: number;
}

// Default configuration
export const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  transactionSignatureExpiryHours: 24,
  documentSignatureExpiryDays: 7,
  verificationCodeExpiryMinutes: 10,
  
  requireSignatureForTransactions: true,
  requireSignatureForWithdrawals: true,
  requireSignatureForDocuments: true,
  
  allowedMethods: {
    transaction: ['uuid', 'handwriting'],
    withdrawal_request: ['uuid', 'phone', 'email', 'handwriting'],
    contract: ['handwriting', 'email'],
    site_visit_report: ['uuid', 'handwriting'],
    cost_submission: ['uuid', 'handwriting'],
    down_payment_request: ['uuid', 'phone', 'handwriting'],
    mmp_approval: ['uuid', 'email', 'handwriting'],
    compliance_document: ['handwriting', 'email'],
    custom: ['uuid', 'phone', 'email', 'handwriting'],
  },
  
  maxVerificationAttempts: 3,
  otpLength: 6,
};

/**
 * Signature Summary Stats
 */
export interface SignatureStats {
  totalSignatures: number;
  pendingSignatures: number;
  verifiedSignatures: number;
  expiredSignatures: number;
  
  byMethod: Record<SignatureMethod, number>;
  byDocumentType: Record<SignableDocumentType, number>;
  
  lastSignedAt?: string;
  averageSigningTimeSeconds?: number;
}
