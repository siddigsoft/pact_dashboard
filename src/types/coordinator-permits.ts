export interface CoordinatorLocalityPermit {
  id: string;
  coordinatorId: string;
  stateId: string;
  localityId: string;
  permitFileName: string;
  permitFileUrl: string;
  uploadedAt: string;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalityPermitStatus {
  state: string;
  locality: string;
  stateId: string;
  localityId: string;
  hasPermit: boolean;
  permit?: CoordinatorLocalityPermit;
  siteCount: number;
  sites: any[]; // SiteVisit[] or similar
}

export interface CoordinatorPermitUploadRequest {
  stateId: string;
  localityId: string;
  file: File;
}