
export interface MMPFeeBreakdown {
  baseFee?: number;
  distanceSurcharge?: number;
  complexitySurcharge?: number;
  urgencySurcharge?: number;
  transportationAllowance?: number;
}

export interface MMPSiteAllocation {
  siteId: string;
  allocation: number;
  transportationFee: number;
}

export interface MMPFinancial {
  budgetAllocation?: number;
  currency?: string;
  feeBreakdown?: MMPFeeBreakdown;
  perSiteAllocation?: MMPSiteAllocation[];
  approvalStatus?: string;
  approvedBy?: string;
  approvedDate?: string;
  paymentMethod?: string;
  processingTime?: string;
}
