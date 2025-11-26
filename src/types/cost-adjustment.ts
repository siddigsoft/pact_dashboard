// Cost Adjustment Audit Types

export type AdjustmentType = 'increase' | 'decrease' | 'correction';

export interface CostAdjustmentAudit {
  id: string;
  
  // Cost record being adjusted
  siteVisitCostId?: string;
  siteVisitId?: string;
  mmpSiteEntryId?: string;
  siteName?: string;
  
  // Previous values (before adjustment)
  previousTransportationCost?: number;
  previousAccommodationCost?: number;
  previousMealAllowance?: number;
  previousOtherCosts?: number;
  previousTotalCost?: number;
  
  // New values (after adjustment)
  newTransportationCost?: number;
  newAccommodationCost?: number;
  newMealAllowance?: number;
  newOtherCosts?: number;
  newTotalCost?: number;
  
  // Adjustment details
  adjustmentType: AdjustmentType;
  adjustmentReason: string; // MANDATORY
  supportingDocuments: { fileName: string; fileUrl: string; uploadedAt: string }[];
  
  // Who made the adjustment
  adjustedBy: string;
  adjustedByRole: string;
  adjustedByName?: string;
  adjustedAt: string;
  
  // Additional payment processing
  additionalPaymentNeeded: number;
  additionalPaymentTransactionId?: string;
  additionalPaymentProcessed: boolean;
  additionalPaymentProcessedAt?: string;
  
  // Audit
  createdAt: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

export interface CreateCostAdjustment {
  siteVisitCostId?: string;
  siteVisitId?: string;
  mmpSiteEntryId?: string;
  siteName?: string;
  
  // Previous values
  previousTransportationCost?: number;
  previousAccommodationCost?: number;
  previousMealAllowance?: number;
  previousOtherCosts?: number;
  previousTotalCost?: number;
  
  // New values
  newTransportationCost?: number;
  newAccommodationCost?: number;
  newMealAllowance?: number;
  newOtherCosts?: number;
  newTotalCost?: number;
  
  // Adjustment details
  adjustmentType: AdjustmentType;
  adjustmentReason: string; // MANDATORY - cannot be empty
  supportingDocuments?: { fileName: string; fileUrl: string }[];
  
  // Who is making the adjustment
  adjustedBy: string;
  adjustedByRole: string;
  adjustedByName?: string;
}

export interface CostAdjustmentSummary {
  totalAdjustments: number;
  totalIncreases: number;
  totalDecreases: number;
  totalAdditionalPayments: number;
  adjustmentsByMonth: {
    month: string;
    count: number;
    totalAmount: number;
  }[];
}
