// Basic MMP types
export type MMPStatus = 'pending' | 'verified' | 'approved' | 'rejected' | 'archived' | 'deleted';
export type MMPStage = 'notStarted' | 'draft' | 'verified' | 'implementation' | 'completed';

// MMP Classification Types for versioning and tracking
export type MMPClassification = 'original' | 'revised' | 'additional' | 'supplementary';

// MMP Version Status for tracking active vs superseded versions
export type MMPVersionStatus = 'active' | 'superseded' | 'draft' | 'archived';

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

// Relationship tracking for revised/additional MMPs
export interface MMPRelationship {
  parentMmpId?: string;        // For revisions: links to original MMP
  parentMmpName?: string;      // Parent MMP display name
  childMmpIds?: string[];      // For originals: list of revision IDs
  supersededBy?: string;       // MMP ID that supersedes this one
  supersedes?: string;         // MMP ID that this one supersedes
  relatedMmpIds?: string[];    // For additional MMPs: related MMPs in same period
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
  verifiedBy?: string;
  verifiedAt?: string;
  archivedAt?: string;
  archivedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
  expiryDate?: string;
  region?: string;
  hub?: string;
  month?: string;
  year?: number;
  version?: MMPVersion;
  modificationHistory?: MMPModificationEntry[];
  modifiedAt?: string;
  description?: string;
  type?: string;
  // File-related properties
  filePath?: string;
  originalFilename?: string;
  fileUrl?: string;
  projectId?: string;
  projectName?: string;
  
  // Classification and versioning fields
  classification?: MMPClassification;
  versionStatus?: MMPVersionStatus;
  relationship?: MMPRelationship;
  
  // Period tracking for grouping MMPs
  periodKey?: string;  // Format: YYYY-MM for monthly grouping
  fiscalQuarter?: string;  // Q1, Q2, Q3, Q4
  fiscalYear?: number;
}
