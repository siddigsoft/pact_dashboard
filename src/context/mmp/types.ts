// Types for MMP Context
import { MMPFile } from '@/types/mmp';

export interface SupabaseResponse<T> {
  data: T | null;
  error: {
    message: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
}

export interface SiteEntryCounts {
  dispatched: number;
  accepted: number;
  smartAssigned: number;
  ongoing: number;
  completed: number;
  rejected: number;
  approvedCosted: number;
  total: number;
}

export interface MMPPaymentDetail {
  type: 'advance' | 'cost';
  id: string;
  reference: string;   // site_name (advance) or reference_number (cost)
  amount: number;
  currency: string;
  status: string;      // most meaningful status for finance (admin_status / tier2_status / status)
  date: string;        // requested_at or created_at
  hubName: string;
}

export interface MMPContextType {
  mmpFiles: MMPFile[];
  loading: boolean;
  error: string | null;
  siteEntryCounts: SiteEntryCounts;
  currentMMP: MMPFile | null;
  setCurrentMMP: (mmp: MMPFile | null) => void;
  addMMPFile: (mmp: MMPFile) => void;
  updateMMPFile: (mmp: MMPFile) => void | Promise<void>;
  deleteMMPFile: (id: string) => Promise<boolean>;
  unlinkAndDeleteMMPFile: (id: string) => Promise<{ unlinked: { downPayments: number; costSubmissions: number }; deleted: boolean }>;
  getMMPLinkedCounts: (id: string) => Promise<{ downPayments: number; costSubmissions: number }>;
  getMMPPaymentDetails: (id: string) => Promise<MMPPaymentDetail[]>;
  getMMPById: (id: string) => MMPFile | undefined;
  getMmpById: (id: string) => MMPFile | undefined;
  getPermitsByMmpId: (id: string) => Promise<any | undefined>;
  verifyMMP: (id: string, verifiedBy: string, verifiedByName?: string) => Promise<void>;
  archiveMMP: (id: string, archivedBy: string) => Promise<void>;
  approveMMP: (id: string, approvedBy: string, notes?: string) => Promise<void>;
  rejectMMP: (id: string, rejectionReason: string) => Promise<void>;
  uploadMMP: (
    file: File,
    metadata?: string | { name?: string; hub?: string; month?: string; projectId?: string },
    onProgress?: (progress: { current: number; total: number; stage: string }) => void
  ) => Promise<{ success: boolean; id?: string; mmp?: MMPFile; error?: string }>;
  updateMMP: (id: string, updatedMMP: Partial<MMPFile>) => Promise<boolean>;
  updateMMPVersion: (id: string, changes: string) => Promise<boolean>;
  deleteMMP: (id: string) => Promise<boolean>;
  restoreMMP: (id: string) => Promise<void>;
  resetMMP: (id?: string) => Promise<boolean>;
  attachPermitsToMMP: (id: string, permits: { federal: File | null; state?: File | null; local?: File | null }) => Promise<void>;
  refreshMMPFiles: () => Promise<void>;
  fetchSiteEntriesForMMP: (mmpId: string) => Promise<any[]>;
  loadSiteEntriesForMMPs: (mmpIds: string[]) => Promise<void>;
  refreshSiteEntryCounts: () => Promise<void>;
}
