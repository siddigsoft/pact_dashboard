
import { MMPFile, SiteVisit } from '@/types';

export type ArchiveMonth = {
  year: number;
  month: number;
  label: string; // e.g. "January 2025"
  mmpsCount: number;
  siteVisitsCount: number;
  documentsCount: number;
};

export type ArchiveDocument = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  category: 'mmp' | 'siteVisit' | 'permit' | 'verification' | 'report' | 'other';
  relatedEntityId: string;
  relatedEntityType: 'mmp' | 'siteVisit';
  description?: string;
  tags?: string[];
  expiryDate?: string;
  title?: string;
  type?: string;
  size?: number;
  status?: string;
};

export type ArchiveFilter = {
  year?: number;
  month?: number;
  quarter?: number;
  documentType?: string;
  status?: string;
  region?: string;
  state?: string;
};

export type ArchiveStatistics = {
  totalMmps: number;
  totalSiteVisits: number;
  totalDocuments: number;
  documentsByCategory: Record<string, number>;
  mmpStatusCounts: Record<string, number>;
  monthlyTrends: Array<{
    year: number;
    month: number;
    mmps: number;
    siteVisits: number;
    documents: number;
  }>;
};

export interface ExtendedMMPFile extends MMPFile {
  state?: string;
  locality?: string;
  region?: string;
  name: string;
  entries: number;
  year: number;
  month: number;
  approvers?: any[];
  sites?: Array<{
    id: string;
    name: string;
    location: {
      latitude: number;
      longitude: number;
      address: string;
    };
  }>;
  description?: string;
}

export type ArchivedMMPFile = ExtendedMMPFile & {
  archiveId: string;
  archiveDate: string;
  archiveCategory: string;
  archiveTags?: string[];
  documents: ArchiveDocument[];
  retentionPeriod?: string;
  archiveNotes?: string;
  createdAt: string;
  updatedAt: string;
  currentStage?: number;
  workflow?: {
    currentStage: string;
    lastUpdated?: string;
    assignedTo?: string;
    comments?: string;
  };
  stages?: any[];
  description?: string;
};

export type ArchivedSiteVisit = SiteVisit & {
  archiveId: string;
  archiveDate: string;
  archiveCategory: string;
  archiveTags?: string[];
  documents: ArchiveDocument[];
  retentionPeriod?: string;
  archiveNotes?: string;
  description?: string;
};

export interface ArchiveContextType {
  archives: ArchiveMonth[];
  currentArchive?: ArchiveMonth;
  archivedMMPs: ArchivedMMPFile[];
  archivedSiteVisits: ArchivedSiteVisit[];
  documents: ArchiveDocument[];
  statistics: ArchiveStatistics;
  filters: ArchiveFilter;
  loading: boolean;
  setFilters: (filters: ArchiveFilter) => void;
  selectMonth: (year: number, month: number) => void;
  downloadArchive: (format: 'excel' | 'csv' | 'pdf', filters?: ArchiveFilter) => Promise<boolean>;
  uploadDocument: (document: Omit<ArchiveDocument, 'id'>) => Promise<string>;
  deleteDocument: (documentId: string) => Promise<boolean>;
  searchArchives: (query: string) => Promise<{
    mmps: ArchivedMMPFile[];
    siteVisits: ArchivedSiteVisit[];
    documents: ArchiveDocument[];
  }>;
}
