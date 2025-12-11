/**
 * Receipt Details Types
 * 
 * Types for manual entry and validation of bank transfer receipt details.
 * Supports Bank of Khartoum (BoK) and other Sudanese banks.
 */

export interface TransferReceiptDetails {
  transactionNumber: string;
  recipientAccountName: string;
  recipientAccountNumber?: string;
  bankName: string;
  transferAmount: number;
  currency: string;
  transferDate: string;
  referenceNumber?: string;
  senderName?: string;
  senderAccountNumber?: string;
  comments?: string;
  receiptImageUrl: string;
  validatedAt: string;
  validatedBy: string;
}

export interface ReceiptValidation {
  isValid: boolean;
  errors: ReceiptValidationError[];
  warnings: ReceiptValidationWarning[];
}

export interface ReceiptValidationError {
  field: keyof TransferReceiptDetails;
  message: string;
}

export interface ReceiptValidationWarning {
  field: keyof TransferReceiptDetails;
  message: string;
}

export const SUDANESE_BANKS = [
  { code: 'BOK', name: 'Bank of Khartoum' },
  { code: 'OMDURMAN', name: 'Omdurman National Bank' },
  { code: 'FAISAL', name: 'Faisal Islamic Bank' },
  { code: 'TADAMON', name: 'Tadamon Islamic Bank' },
  { code: 'SUDAN_FRENCH', name: 'Sudan French Bank' },
  { code: 'BLUE_NILE', name: 'Blue Nile Mashreq Bank' },
  { code: 'FARMER', name: 'Farmer Commercial Bank' },
  { code: 'ANIMAL', name: 'Animal Resources Bank' },
  { code: 'SAVINGS', name: 'Savings & Social Development Bank' },
  { code: 'INDUSTRIAL', name: 'Industrial Development Bank' },
  { code: 'NILEIN', name: 'El Nilein Bank' },
  { code: 'SAUDI', name: 'Saudi Sudanese Bank' },
  { code: 'OTHER', name: 'Other Bank' },
] as const;

export type SudaneseBank = typeof SUDANESE_BANKS[number]['code'];

export const CURRENCIES = [
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'SDG' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
] as const;

export type Currency = typeof CURRENCIES[number]['code'];

export function validateReceiptDetails(details: Partial<TransferReceiptDetails>): ReceiptValidation {
  const errors: ReceiptValidationError[] = [];
  const warnings: ReceiptValidationWarning[] = [];

  if (!details.transactionNumber?.trim()) {
    errors.push({ field: 'transactionNumber', message: 'Transaction number is required' });
  }

  if (!details.recipientAccountName?.trim()) {
    errors.push({ field: 'recipientAccountName', message: 'Recipient account name is required' });
  }

  if (!details.bankName?.trim()) {
    errors.push({ field: 'bankName', message: 'Bank name is required' });
  }

  if (!details.transferAmount || details.transferAmount <= 0) {
    errors.push({ field: 'transferAmount', message: 'Transfer amount must be greater than 0' });
  }

  if (!details.transferDate) {
    errors.push({ field: 'transferDate', message: 'Transfer date is required' });
  } else {
    const date = new Date(details.transferDate);
    const now = new Date();
    if (date > now) {
      warnings.push({ field: 'transferDate', message: 'Transfer date is in the future' });
    }
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (date < thirtyDaysAgo) {
      warnings.push({ field: 'transferDate', message: 'Transfer date is more than 30 days ago' });
    }
  }

  if (!details.currency) {
    errors.push({ field: 'currency', message: 'Currency is required' });
  }

  if (!details.receiptImageUrl) {
    errors.push({ field: 'receiptImageUrl', message: 'Receipt image is required' });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
