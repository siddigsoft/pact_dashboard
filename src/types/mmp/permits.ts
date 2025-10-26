
export interface MMPDocument {
  type: string;
  fileName: string;
  uploadedAt: string;
  fileUrl: string;
}

export interface MMPStatePermitDocument {
  id: string;
  fileName: string;
  uploadedAt: string;
  fileUrl?: string;
  validated: boolean;
  description?: string;
  comments?: string;
  issueDate?: string;
  expiryDate?: string;
  status?: 'pending' | 'verified' | 'rejected';
  verificationNotes?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  permitType: 'federal' | 'state' | 'local';
  state?: string; // Only required for state permits
  locality?: string; // Only required for local permits
}

export interface MMPStatePermit {
  stateName: string;
  verified: boolean;
  documents: MMPStatePermitDocument[];
}

export interface MMPPermitsData {
  federal: boolean;
  state: boolean;
  local: boolean;
  lastVerified?: string;
  verifiedBy?: string;
  documents?: MMPDocument[];
  statePermits?: MMPStatePermit[];
  localPermits?: MMPLocalPermit[];
}

export interface MMPLocalPermit {
  localityName: string;
  verified: boolean;
  documents: MMPStatePermitDocument[];
}
