/**
 * Receipt Extraction Types
 * 
 * Types for AI-powered receipt scanning and data extraction from bank transfer receipts.
 */

export interface ExtractedReceiptData {
  transactionNumber: string | null;
  accountName: string | null;
  accountNumber: string | null;
  bankName: string | null;
  amount: number | null;
  currency: string | null;
  transferDate: string | null;
  referenceNumber: string | null;
  senderName: string | null;
  senderAccount: string | null;
  comments: string | null;
  validationStatus: ReceiptValidationStatus;
  validationMessage: string | null;
  confidence: number;
  rawText: string | null;
  extractedAt: string;
}

export type ReceiptValidationStatus = 
  | 'valid'
  | 'partial'
  | 'invalid'
  | 'unreadable'
  | 'not_a_receipt';

export interface ReceiptScanResult {
  success: boolean;
  data: ExtractedReceiptData | null;
  error: string | null;
  processingTimeMs: number;
}

export interface ReceiptConfirmation {
  confirmed: boolean;
  confirmedBy: string;
  confirmedAt: string;
  originalData: ExtractedReceiptData;
  correctedData?: Partial<ExtractedReceiptData>;
  notes?: string;
}

export interface ReceiptWithExtraction {
  documentUrl: string;
  filename: string;
  uploadedAt: string;
  extraction: ExtractedReceiptData | null;
  confirmation: ReceiptConfirmation | null;
}
