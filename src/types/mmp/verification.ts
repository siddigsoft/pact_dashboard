export type VerificationMethod = 'phone' | 'email' | 'in-person' | 'other';
export type VerificationStatus = 'pending' | 'in-progress' | 'complete';
export type DocumentCategory = 'contact' | 'distribution' | 'activity' | 'other';

export interface MMPContact {
  name: string;
  phone: string;
  email: string;
  activityType?: string;
  siteId?: string;
  isVerified: boolean;
  position?: string;
  organizationName?: string;
  verified?: boolean;
  verificationMethod?: VerificationMethod;
  verificationDate?: string;
  verificationNotes?: string;
}

export interface MMPDistributionInfo {
  distributionDate?: string;
  distributionPeriod?: string;
  hasDistributionDate?: boolean;
  siteIncludedInPlan?: boolean;
  willBeDistributed?: boolean;
  notes?: string;
}

export interface MMPActivityVerification {
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
  contactsVerified: number;
  totalContacts: number;
}

export interface MMPSiteVerification {
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
}

export interface MMPVerificationDocument {
  type: string;
  fileName: string;
  uploadedAt: string;
  fileUrl: string;
  category: DocumentCategory;
  siteId?: string;
  activityType?: string;
}

export interface MMPFinalVerification {
  isComplete: boolean;
  completedBy?: string;
  completedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  comments?: string;
}

export interface MMPPermit {
  id: string;
  permitType: string;
  permitNumber: string;
  issuedDate?: string;
  expirationDate?: string;
  status?: 'verified' | 'rejected' | null;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
}

export type MMPPermits = MMPPermit[];

export interface MMPCooperatingPartnerVerification {
  contacts?: MMPContact[];
  activityStatus?: Record<string, boolean>;
  verifiedBy?: string;
  verifiedAt?: string;
  distributionInfo?: MMPDistributionInfo;
  verificationStatus: VerificationStatus;
  completionPercentage?: number;
  activityVerification?: Record<string, MMPActivityVerification>;
  siteVerification?: Record<string, MMPSiteVerification>;
  verificationDocuments?: MMPVerificationDocument[];
  finalVerification?: MMPFinalVerification;
  overallVerified?: boolean;
}

export interface MMPComprehensiveVerification {
  cpVerification?: MMPCooperatingPartnerVerification;
  permitVerification?: {
    status: VerificationStatus;
    verifiedBy?: string;
    verifiedAt?: string;
    completionPercentage?: number;
    permits: Array<{
      id: string;
      status: 'verified' | 'rejected' | null;
      verifiedAt?: string;
      verifiedBy?: string;
      notes?: string;
    }>;
  };
  contentVerification?: {
    status: VerificationStatus;
    verifiedBy?: string;
    verifiedAt?: string;
    fileReviewed: boolean;
    contentValidated: boolean;
    notes?: string;
  };
  systemValidation?: {
    status: VerificationStatus;
    fileIntegrity: boolean;
    noDuplicates: boolean;
    compliantWithRequirements: boolean;
    entryProcessingComplete: boolean;
  };
  overallStatus: VerificationStatus;
  canProceedToApproval: boolean;
  lastUpdated?: string;
  updatedBy?: string;
}

export interface MMPCPVerification extends MMPCooperatingPartnerVerification {}
