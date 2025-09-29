
// Basic MMP types
export type MMPStatus = 'pending' | 'approved' | 'rejected' | 'archived' | 'deleted';
export type MMPStage = 'notStarted' | 'draft' | 'verified' | 'implementation' | 'completed';

export interface MMPVersion {
  major: number;
  minor: number;
  updatedAt?: string;
}

export interface MMPModificationEntry {
  timestamp: string;
  modifiedBy: string;
  changes: string;
  previousVersion: string;
  newVersion: string;
}

export interface MMPLocation {
  coordinates?: { lat: number; lng: number };
  address?: string;
  region?: string;
  state?: string;
}

// Core MMP interface with basic properties
export interface MMPBase {
  id: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
  status: MMPStatus;
  entries: number;
  processedEntries?: number;
  mmpId?: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  archivedAt?: string;
  archivedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
  expiryDate?: string;
  region?: string;
  month?: number;
  year?: number;
  version?: MMPVersion;
  modificationHistory?: MMPModificationEntry[];
  modifiedAt?: string;
  description?: string;
  projectName?: string;
  type?: string;
  // File-related properties
  filePath?: string;
  originalFilename?: string;
  fileUrl?: string;
  projectId?: string;
}
