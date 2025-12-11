/**
 * Document Index Service
 * Unified service for serializing, indexing, and querying all documents across the platform
 */

import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';

export interface IndexedDocument {
  id: string;
  indexNo: number;
  fileName: string;
  fileUrl: string;
  fileSize?: string;
  fileType?: string;
  category: DocumentCategory;
  uploadedAt: string;
  uploadedBy?: string;
  uploadedByName?: string;
  
  // Location/Organization
  projectId?: string;
  projectName?: string;
  hubId?: string;
  hubName?: string;
  state?: string;
  locality?: string;
  
  // Related entities
  mmpId?: string;
  mmpName?: string;
  siteVisitId?: string;
  siteVisitCode?: string;
  costSubmissionId?: string;
  transactionId?: string;
  
  // Dates
  monthBucket?: string; // YYYY-MM format for easy filtering
  issueDate?: string;
  expiryDate?: string;
  
  // Status and verification
  status: DocumentStatus;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  
  // Signature information
  signatureId?: string;
  signedAt?: string;
  signedBy?: string;
  signatureMethod?: string;
  
  // Source tracking
  sourceType: DocumentSourceType;
  sourceTable: string;
  sourceId: string;
  
  // Metadata
  metadata?: Record<string, any>;
  checksum?: string;
  tags?: string[];
}

export type DocumentCategory = 
  | 'mmp_file' 
  | 'federal_permit' 
  | 'state_permit' 
  | 'local_permit' 
  | 'cost_receipt' 
  | 'transaction_receipt'
  | 'site_visit_photo'
  | 'site_visit_document'
  | 'report' 
  | 'approval_document'
  | 'signature_document'
  | 'attachment' 
  | 'other';

export type DocumentStatus = 'pending' | 'verified' | 'approved' | 'rejected' | 'expired';

export type DocumentSourceType = 'mmp' | 'permit' | 'cost' | 'site_visit' | 'transaction' | 'approval' | 'chat' | 'other';

export interface DocumentFilter {
  projectId?: string;
  hubId?: string;
  state?: string;
  locality?: string;
  month?: string; // YYYY-MM format
  startDate?: string;
  endDate?: string;
  category?: DocumentCategory | DocumentCategory[];
  status?: DocumentStatus | DocumentStatus[];
  sourceType?: DocumentSourceType | DocumentSourceType[];
  searchQuery?: string;
  verified?: boolean;
  hasSig?: boolean;
  limit?: number;
  offset?: number;
}

export interface DocumentStats {
  total: number;
  byCategory: Record<DocumentCategory, number>;
  byStatus: Record<DocumentStatus, number>;
  bySourceType: Record<DocumentSourceType, number>;
  byProject: { projectId: string; projectName: string; count: number }[];
  byHub: { hubId: string; hubName: string; count: number }[];
  byMonth: { month: string; count: number }[];
  verifiedCount: number;
  pendingCount: number;
  signedCount: number;
}

export const DocumentIndexService = {
  /**
   * Fetch and index all documents from various sources
   */
  async fetchAllDocuments(filter?: DocumentFilter): Promise<IndexedDocument[]> {
    const docs: IndexedDocument[] = [];
    let indexCounter = 1;

    try {
      // Fetch projects and hubs for reference
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, project_code');
      
      const projectMap = new Map(projects?.map(p => [p.id, p]) || []);

      // 1. Fetch MMP Files with permits
      const { data: mmpFiles, error: mmpError } = await supabase
        .from('mmp_files')
        .select('id, filename, file_url, created_at, updated_at, permits, project_id, status, uploaded_by, projects(name)')
        .order('created_at', { ascending: false });

      if (!mmpError && mmpFiles) {
        for (const mmp of mmpFiles) {
          const projectName = (mmp as any).projects?.name || projectMap.get(mmp.project_id)?.name || 'Unknown Project';
          const monthBucket = mmp.created_at ? format(parseISO(mmp.created_at), 'yyyy-MM') : undefined;

          // Add the MMP file itself
          docs.push({
            id: `mmp-${mmp.id}`,
            indexNo: indexCounter++,
            fileName: mmp.filename || 'Untitled MMP',
            fileUrl: mmp.file_url || '',
            category: 'mmp_file',
            uploadedAt: mmp.created_at || new Date().toISOString(),
            uploadedBy: mmp.uploaded_by,
            projectId: mmp.project_id,
            projectName,
            mmpId: mmp.id,
            mmpName: mmp.filename,
            monthBucket,
            status: mmp.status === 'approved' ? 'approved' : mmp.status === 'rejected' ? 'rejected' : 'pending',
            verified: mmp.status === 'approved',
            sourceType: 'mmp',
            sourceTable: 'mmp_files',
            sourceId: mmp.id
          });

          // Extract permit documents
          const permits = mmp.permits as any || {};
          
          // Federal permits
          if (permits.documents) {
            for (const doc of permits.documents) {
              docs.push({
                id: `fed-${mmp.id}-${docs.length}`,
                indexNo: indexCounter++,
                fileName: doc.fileName || 'Federal Permit',
                fileUrl: doc.fileUrl || '',
                category: 'federal_permit',
                uploadedAt: doc.uploadedAt || mmp.created_at,
                projectId: mmp.project_id,
                projectName,
                mmpId: mmp.id,
                mmpName: mmp.filename,
                monthBucket,
                status: doc.validated ? 'verified' : 'pending',
                verified: doc.validated || false,
                sourceType: 'permit',
                sourceTable: 'mmp_files',
                sourceId: mmp.id
              });
            }
          }

          // State permits
          if (permits.statePermits) {
            for (const sp of permits.statePermits) {
              for (const doc of sp.documents || []) {
                docs.push({
                  id: `state-${mmp.id}-${sp.stateName}-${docs.length}`,
                  indexNo: indexCounter++,
                  fileName: doc.fileName || `State Permit - ${sp.stateName}`,
                  fileUrl: doc.fileUrl || '',
                  category: 'state_permit',
                  uploadedAt: doc.uploadedAt || mmp.created_at,
                  projectId: mmp.project_id,
                  projectName,
                  state: sp.stateName,
                  mmpId: mmp.id,
                  mmpName: mmp.filename,
                  monthBucket,
                  issueDate: doc.issueDate,
                  expiryDate: doc.expiryDate,
                  status: doc.validated || sp.verified ? 'verified' : 'pending',
                  verified: doc.validated || sp.verified || false,
                  sourceType: 'permit',
                  sourceTable: 'mmp_files',
                  sourceId: mmp.id
                });
              }
            }
          }

          // Local permits
          if (permits.localPermits) {
            for (const lp of permits.localPermits) {
              for (const doc of lp.documents || []) {
                docs.push({
                  id: `local-${mmp.id}-${lp.localityName}-${docs.length}`,
                  indexNo: indexCounter++,
                  fileName: doc.fileName || `Local Permit - ${lp.localityName}`,
                  fileUrl: doc.fileUrl || '',
                  category: 'local_permit',
                  uploadedAt: doc.uploadedAt || mmp.created_at,
                  projectId: mmp.project_id,
                  projectName,
                  state: lp.state,
                  locality: lp.localityName,
                  mmpId: mmp.id,
                  mmpName: mmp.filename,
                  monthBucket,
                  issueDate: doc.issueDate,
                  expiryDate: doc.expiryDate,
                  status: doc.validated || lp.verified ? 'verified' : 'pending',
                  verified: doc.validated || lp.verified || false,
                  sourceType: 'permit',
                  sourceTable: 'mmp_files',
                  sourceId: mmp.id
                });
              }
            }
          }
        }
      }

      // 2. Fetch Cost Submission Receipts
      const { data: costSubmissions, error: costError } = await supabase
        .from('cost_submissions')
        .select('id, receipt_url, receipt_filename, amount, created_at, status, site_visit_id, documents, submitted_by, project_id')
        .order('created_at', { ascending: false });

      if (!costError && costSubmissions) {
        for (const cost of costSubmissions) {
          const projectName = projectMap.get(cost.project_id)?.name;
          const monthBucket = cost.created_at ? format(parseISO(cost.created_at), 'yyyy-MM') : undefined;

          if (cost.receipt_url) {
            docs.push({
              id: `cost-${cost.id}`,
              indexNo: indexCounter++,
              fileName: cost.receipt_filename || `Receipt - ${cost.amount ? `SDG ${cost.amount}` : 'Cost Submission'}`,
              fileUrl: cost.receipt_url,
              category: 'cost_receipt',
              uploadedAt: cost.created_at,
              uploadedBy: cost.submitted_by,
              projectId: cost.project_id,
              projectName,
              siteVisitId: cost.site_visit_id,
              costSubmissionId: cost.id,
              monthBucket,
              status: cost.status === 'approved' ? 'approved' : cost.status === 'rejected' ? 'rejected' : 'pending',
              verified: cost.status === 'approved',
              sourceType: 'cost',
              sourceTable: 'cost_submissions',
              sourceId: cost.id
            });
          }

          // Additional documents
          const costDocs = cost.documents as any[];
          if (costDocs && Array.isArray(costDocs)) {
            for (const doc of costDocs) {
              if (doc.fileUrl || doc.url) {
                docs.push({
                  id: `cost-doc-${cost.id}-${docs.length}`,
                  indexNo: indexCounter++,
                  fileName: doc.fileName || doc.name || 'Cost Document',
                  fileUrl: doc.fileUrl || doc.url,
                  category: 'cost_receipt',
                  uploadedAt: doc.uploadedAt || cost.created_at,
                  projectId: cost.project_id,
                  projectName,
                  siteVisitId: cost.site_visit_id,
                  costSubmissionId: cost.id,
                  monthBucket,
                  status: cost.status === 'approved' ? 'approved' : cost.status === 'rejected' ? 'rejected' : 'pending',
                  verified: cost.status === 'approved',
                  sourceType: 'cost',
                  sourceTable: 'cost_submissions',
                  sourceId: cost.id
                });
              }
            }
          }
        }
      }

      // 3. Fetch Wallet Transaction Receipts
      const { data: walletTransactions, error: walletError } = await supabase
        .from('wallet_transactions')
        .select('id, transaction_type, amount, created_at, metadata, wallet_id, wallets(user_id, project_id)')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!walletError && walletTransactions) {
        for (const tx of walletTransactions) {
          const metadata = tx.metadata as any;
          if (metadata?.receipt_url || metadata?.receiptUrl) {
            const projectId = (tx as any).wallets?.project_id;
            const projectName = projectId ? projectMap.get(projectId)?.name : undefined;
            const monthBucket = tx.created_at ? format(parseISO(tx.created_at), 'yyyy-MM') : undefined;

            docs.push({
              id: `tx-${tx.id}`,
              indexNo: indexCounter++,
              fileName: metadata.receipt_filename || `Transaction Receipt - ${tx.transaction_type}`,
              fileUrl: metadata.receipt_url || metadata.receiptUrl,
              category: 'transaction_receipt',
              uploadedAt: tx.created_at,
              projectId,
              projectName,
              transactionId: tx.id,
              monthBucket,
              status: 'approved',
              verified: true,
              signatureId: metadata.signature_id,
              signedAt: metadata.signed_at,
              sourceType: 'transaction',
              sourceTable: 'wallet_transactions',
              sourceId: tx.id
            });
          }
        }
      }

      // 4. Fetch Report Photos (site visit attachments)
      try {
        const { data: reportPhotos, error: photoError } = await supabase
          .from('report_photos')
          .select('id, photo_url, caption, created_at, site_visit_id')
          .order('created_at', { ascending: false });

        if (!photoError && reportPhotos) {
          for (const photo of reportPhotos) {
            if (photo.photo_url) {
              const monthBucket = photo.created_at ? format(parseISO(photo.created_at), 'yyyy-MM') : undefined;
              
              docs.push({
                id: `photo-${photo.id}`,
                indexNo: indexCounter++,
                fileName: photo.caption || 'Site Visit Photo',
                fileUrl: photo.photo_url,
                category: 'site_visit_photo',
                uploadedAt: photo.created_at,
                siteVisitId: photo.site_visit_id,
                monthBucket,
                status: 'verified',
                verified: true,
                sourceType: 'site_visit',
                sourceTable: 'report_photos',
                sourceId: photo.id
              });
            }
          }
        }
      } catch (err) {
        console.log('[DocumentIndex] Report photos table may not exist:', err);
      }

      // Sort by upload date (newest first) and reassign index numbers
      docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      docs.forEach((doc, idx) => {
        doc.indexNo = idx + 1;
      });

      // Apply filters
      return this.applyFilters(docs, filter);
    } catch (error) {
      console.error('[DocumentIndex] Error fetching documents:', error);
      return [];
    }
  },

  /**
   * Apply filters to documents
   */
  applyFilters(docs: IndexedDocument[], filter?: DocumentFilter): IndexedDocument[] {
    if (!filter) return docs;

    let filtered = [...docs];

    if (filter.projectId) {
      filtered = filtered.filter(d => d.projectId === filter.projectId);
    }

    if (filter.hubId) {
      filtered = filtered.filter(d => d.hubId === filter.hubId);
    }

    if (filter.state) {
      filtered = filtered.filter(d => d.state === filter.state);
    }

    if (filter.locality) {
      filtered = filtered.filter(d => d.locality === filter.locality);
    }

    if (filter.month) {
      filtered = filtered.filter(d => d.monthBucket === filter.month);
    }

    if (filter.startDate) {
      const start = new Date(filter.startDate);
      filtered = filtered.filter(d => new Date(d.uploadedAt) >= start);
    }

    if (filter.endDate) {
      const end = new Date(filter.endDate);
      filtered = filtered.filter(d => new Date(d.uploadedAt) <= end);
    }

    if (filter.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
      filtered = filtered.filter(d => categories.includes(d.category));
    }

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filtered = filtered.filter(d => statuses.includes(d.status));
    }

    if (filter.sourceType) {
      const types = Array.isArray(filter.sourceType) ? filter.sourceType : [filter.sourceType];
      filtered = filtered.filter(d => types.includes(d.sourceType));
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.fileName.toLowerCase().includes(query) ||
        d.projectName?.toLowerCase().includes(query) ||
        d.state?.toLowerCase().includes(query) ||
        d.locality?.toLowerCase().includes(query) ||
        d.mmpName?.toLowerCase().includes(query) ||
        d.indexNo.toString().includes(query)
      );
    }

    if (filter.verified !== undefined) {
      filtered = filtered.filter(d => d.verified === filter.verified);
    }

    if (filter.hasSig !== undefined) {
      filtered = filtered.filter(d => filter.hasSig ? !!d.signatureId : !d.signatureId);
    }

    if (filter.offset) {
      filtered = filtered.slice(filter.offset);
    }

    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  },

  /**
   * Get document statistics
   */
  async getDocumentStats(filter?: DocumentFilter): Promise<DocumentStats> {
    const docs = await this.fetchAllDocuments(filter);

    const byCategory: Record<DocumentCategory, number> = {} as any;
    const byStatus: Record<DocumentStatus, number> = {} as any;
    const bySourceType: Record<DocumentSourceType, number> = {} as any;
    const projectCounts: Record<string, { name: string; count: number }> = {};
    const hubCounts: Record<string, { name: string; count: number }> = {};
    const monthCounts: Record<string, number> = {};
    
    let verifiedCount = 0;
    let pendingCount = 0;
    let signedCount = 0;

    for (const doc of docs) {
      byCategory[doc.category] = (byCategory[doc.category] || 0) + 1;
      byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;
      bySourceType[doc.sourceType] = (bySourceType[doc.sourceType] || 0) + 1;

      if (doc.projectId && doc.projectName) {
        if (!projectCounts[doc.projectId]) {
          projectCounts[doc.projectId] = { name: doc.projectName, count: 0 };
        }
        projectCounts[doc.projectId].count++;
      }

      if (doc.hubId && doc.hubName) {
        if (!hubCounts[doc.hubId]) {
          hubCounts[doc.hubId] = { name: doc.hubName, count: 0 };
        }
        hubCounts[doc.hubId].count++;
      }

      if (doc.monthBucket) {
        monthCounts[doc.monthBucket] = (monthCounts[doc.monthBucket] || 0) + 1;
      }

      if (doc.verified) verifiedCount++;
      if (doc.status === 'pending') pendingCount++;
      if (doc.signatureId) signedCount++;
    }

    return {
      total: docs.length,
      byCategory,
      byStatus,
      bySourceType,
      byProject: Object.entries(projectCounts)
        .map(([projectId, data]) => ({ projectId, projectName: data.name, count: data.count }))
        .sort((a, b) => b.count - a.count),
      byHub: Object.entries(hubCounts)
        .map(([hubId, data]) => ({ hubId, hubName: data.name, count: data.count }))
        .sort((a, b) => b.count - a.count),
      byMonth: Object.entries(monthCounts)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => b.month.localeCompare(a.month)),
      verifiedCount,
      pendingCount,
      signedCount
    };
  },

  /**
   * Get available projects for filtering
   */
  async getAvailableProjects(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .order('name');
    
    return data || [];
  },

  /**
   * Get available months from documents
   */
  async getAvailableMonths(): Promise<string[]> {
    const docs = await this.fetchAllDocuments();
    const months = new Set<string>();
    
    for (const doc of docs) {
      if (doc.monthBucket) {
        months.add(doc.monthBucket);
      }
    }
    
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  },

  /**
   * Get available states from documents
   */
  async getAvailableStates(): Promise<string[]> {
    const docs = await this.fetchAllDocuments();
    const states = new Set<string>();
    
    for (const doc of docs) {
      if (doc.state) {
        states.add(doc.state);
      }
    }
    
    return Array.from(states).sort();
  }
};
