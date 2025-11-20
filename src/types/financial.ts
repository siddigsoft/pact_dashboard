
export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'failed' | 'disputed' | 'approved' | 'paid';
  description: string;
  createdAt: string;
  method?: string;
  reference?: string;
  siteVisitId?: string;
  operationalCosts?: {
    permitFees: number;
    transportationFees: number;
    logisticsFees: number;
    otherFees: number;
    totalCosts: number;
  };
  taskDetails?: {
    baseAmount: number;
    distanceFee: number;
    complexityFee: number;
    urgencyFee: number;
    totalFee: number;
  };
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    branch: string;
  };
}
