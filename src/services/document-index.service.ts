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
  },

  /**
   * Record a new document to the persistent document_index table
   */
  async recordDocument(doc: Omit<IndexedDocument, 'id' | 'indexNo'>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const monthBucket = doc.uploadedAt ? format(parseISO(doc.uploadedAt), 'yyyy-MM') : format(new Date(), 'yyyy-MM');
      
      const { data, error } = await supabase
        .from('document_index')
        .insert({
          file_name: doc.fileName,
          file_url: doc.fileUrl,
          file_size: doc.fileSize ? parseInt(doc.fileSize) : null,
          file_type: doc.fileType,
          category: doc.category,
          uploaded_at: doc.uploadedAt || new Date().toISOString(),
          uploaded_by: doc.uploadedBy,
          uploaded_by_name: doc.uploadedByName,
          project_id: doc.projectId,
          project_name: doc.projectName,
          hub_id: doc.hubId,
          hub_name: doc.hubName,
          state: doc.state,
          locality: doc.locality,
          mmp_id: doc.mmpId,
          mmp_name: doc.mmpName,
          site_visit_id: doc.siteVisitId,
          site_visit_code: doc.siteVisitCode,
          cost_submission_id: doc.costSubmissionId,
          transaction_id: doc.transactionId,
          month_bucket: monthBucket,
          issue_date: doc.issueDate,
          expiry_date: doc.expiryDate,
          status: doc.status || 'pending',
          verified: doc.verified || false,
          verified_at: doc.verifiedAt,
          verified_by: doc.verifiedBy,
          signature_id: doc.signatureId,
          signed_at: doc.signedAt,
          signed_by: doc.signedBy,
          signature_method: doc.signatureMethod,
          source_type: doc.sourceType,
          source_table: doc.sourceTable,
          source_id: doc.sourceId,
          metadata: doc.metadata || {},
          checksum: doc.checksum,
          tags: doc.tags
        })
        .select('id')
        .single();

      if (error) {
        console.error('[DocumentIndexService] Error recording document:', error);
        return { success: false, error: error.message };
      }

      console.log('[DocumentIndexService] Document recorded successfully:', data?.id);
      return { success: true, id: data?.id };
    } catch (err: any) {
      console.error('[DocumentIndexService] Exception recording document:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Update an existing document in the index
   */
  async updateDocument(id: string, updates: Partial<IndexedDocument>): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      
      if (updates.fileName) updateData.file_name = updates.fileName;
      if (updates.fileUrl) updateData.file_url = updates.fileUrl;
      if (updates.status) updateData.status = updates.status;
      if (updates.verified !== undefined) updateData.verified = updates.verified;
      if (updates.verifiedAt) updateData.verified_at = updates.verifiedAt;
      if (updates.verifiedBy) updateData.verified_by = updates.verifiedBy;
      if (updates.metadata) updateData.metadata = updates.metadata;
      if (updates.tags) updateData.tags = updates.tags;

      const { error } = await supabase
        .from('document_index')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('[DocumentIndexService] Error updating document:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      console.error('[DocumentIndexService] Exception updating document:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Fetch documents from the persistent document_index table
   */
  async fetchFromIndex(filter?: DocumentFilter): Promise<IndexedDocument[]> {
    try {
      let query = supabase
        .from('document_index')
        .select('*')
        .order('uploaded_at', { ascending: false });

      // Apply filters
      if (filter?.projectId) query = query.eq('project_id', filter.projectId);
      if (filter?.hubId) query = query.eq('hub_id', filter.hubId);
      if (filter?.state) query = query.eq('state', filter.state);
      if (filter?.locality) query = query.eq('locality', filter.locality);
      if (filter?.month) query = query.eq('month_bucket', filter.month);
      if (filter?.verified !== undefined) query = query.eq('verified', filter.verified);
      if (filter?.limit) query = query.limit(filter.limit);
      if (filter?.offset) query = query.range(filter.offset, filter.offset + (filter.limit || 50) - 1);
      
      if (filter?.category) {
        const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
        query = query.in('category', categories);
      }
      
      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        query = query.in('status', statuses);
      }
      
      if (filter?.sourceType) {
        const sourceTypes = Array.isArray(filter.sourceType) ? filter.sourceType : [filter.sourceType];
        query = query.in('source_type', sourceTypes);
      }
      
      if (filter?.searchQuery) {
        query = query.or(`file_name.ilike.%${filter.searchQuery}%,mmp_name.ilike.%${filter.searchQuery}%,project_name.ilike.%${filter.searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[DocumentIndexService] Error fetching from index:', error);
        return [];
      }

      // Map database rows to IndexedDocument format
      return (data || []).map((row: any, index: number) => ({
        id: row.id,
        indexNo: index + 1,
        fileName: row.file_name,
        fileUrl: row.file_url,
        fileSize: row.file_size?.toString(),
        fileType: row.file_type,
        category: row.category,
        uploadedAt: row.uploaded_at,
        uploadedBy: row.uploaded_by,
        uploadedByName: row.uploaded_by_name,
        projectId: row.project_id,
        projectName: row.project_name,
        hubId: row.hub_id,
        hubName: row.hub_name,
        state: row.state,
        locality: row.locality,
        mmpId: row.mmp_id,
        mmpName: row.mmp_name,
        siteVisitId: row.site_visit_id,
        siteVisitCode: row.site_visit_code,
        costSubmissionId: row.cost_submission_id,
        transactionId: row.transaction_id,
        monthBucket: row.month_bucket,
        issueDate: row.issue_date,
        expiryDate: row.expiry_date,
        status: row.status,
        verified: row.verified,
        verifiedAt: row.verified_at,
        verifiedBy: row.verified_by,
        signatureId: row.signature_id,
        signedAt: row.signed_at,
        signedBy: row.signed_by,
        signatureMethod: row.signature_method,
        sourceType: row.source_type,
        sourceTable: row.source_table,
        sourceId: row.source_id,
        metadata: row.metadata,
        checksum: row.checksum,
        tags: row.tags
      }));
    } catch (err) {
      console.error('[DocumentIndexService] Exception fetching from index:', err);
      return [];
    }
  },

  /**
   * Check if a document already exists in the index by source or file URL
   */
  async documentExists(sourceTable: string, sourceId: string, fileUrl?: string): Promise<boolean> {
    try {
      // If sourceId is missing or empty, skip the check
      if (!sourceId || sourceId.trim() === '') {
        // Try file URL as fallback if provided
        if (fileUrl) {
          const { data, error } = await supabase
            .from('document_index')
            .select('id')
            .eq('file_url', fileUrl)
            .maybeSingle();
          return !error && data !== null;
        }
        return false;
      }

      const { data, error } = await supabase
        .from('document_index')
        .select('id')
        .eq('source_table', sourceTable)
        .eq('source_id', sourceId)
        .maybeSingle();

      return !error && data !== null;
    } catch {
      return false;
    }
  }
};
