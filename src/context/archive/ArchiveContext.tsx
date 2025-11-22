import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  ArchiveMonth, 
  ArchiveFilter, 
  ArchiveStatistics, 
  ArchiveDocument,
  ArchivedMMPFile,
  ArchivedSiteVisit,
  ArchiveContextType
} from '@/types';
import { User } from '@/types/user';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Create the context
const ArchiveContext = createContext<ArchiveContextType | undefined>(undefined);

interface ArchiveProviderProps {
  children: React.ReactNode;
  currentUser?: User;
}

export const ArchiveProvider: React.FC<ArchiveProviderProps> = ({ children, currentUser }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ArchiveFilter>({});
  const [currentArchive, setCurrentArchive] = useState<ArchiveMonth>();
  
  const [archives, setArchives] = useState<ArchiveMonth[]>([]);

  const [archivedMMPs, setArchivedMMPs] = useState<ArchivedMMPFile[]>([]);

  const [archivedSiteVisits, setArchivedSiteVisits] = useState<ArchivedSiteVisit[]>([]);

  const [documents, setDocuments] = useState<ArchiveDocument[]>([]);

  const [statistics, setStatistics] = useState<ArchiveStatistics>({
    totalMmps: 0,
    totalSiteVisits: 0,
    totalDocuments: 0,
    documentsByCategory: {},
    mmpStatusCounts: {},
    monthlyTrends: [],
  });

  // Initial data loading
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        // Fetch MMP files
        const { data: mmpRows, error: mmpErr } = await supabase
          .from('mmp_files')
          .select('*')
          .order('created_at', { ascending: false });

        if (mmpErr) throw mmpErr;

        // Fetch site visits from mmp_site_entries
        const { data: mmpEntriesData, error: svErr } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .order('created_at', { ascending: false });

        if (svErr) {
          console.error('Error fetching site entries for archive:', svErr);
          throw svErr;
        }

        // Transform mmp_site_entries to site_visits format for archive processing
        const svRows = (mmpEntriesData || []).map((entry: any) => {
          const additionalData = entry.additional_data || {};
          return {
            id: entry.id,
            site_name: entry.site_name,
            site_code: entry.site_code,
            status: entry.status || 'pending',
            locality: entry.locality,
            state: entry.state,
            activity: entry.activity_at_site || entry.main_activity,
            main_activity: entry.main_activity || entry.activity_at_site,
            priority: additionalData.priority || 'medium',
            due_date: entry.visit_date,
            assigned_to: additionalData.assigned_to,
            assigned_by: additionalData.assigned_by,
            assigned_at: additionalData.assigned_at,
            notes: entry.comments,
            attachments: additionalData.attachments || [],
            completed_at: additionalData.completed_at,
            rating: additionalData.rating,
            fees: entry.fees || { total: entry.cost || 0, currency: 'SDG' },
            location: additionalData.location || {},
            created_at: entry.created_at,
            updated_at: entry.updated_at,
          };
        });

        let photoRows: any[] = [];
        try {
          const { data: pr, error: perr } = await supabase
            .from('report_photos')
            .select('*')
            .order('created_at', { ascending: false });
          if (!perr && pr) photoRows = pr as any[];
        } catch {}

        const toArchivedMMP = (r: any): ArchivedMMPFile => {
          const uploadedAt = r.uploaded_at || r.created_at;
          const dt = uploadedAt ? new Date(uploadedAt) : new Date();
          const year = dt.getUTCFullYear();
          const month = dt.getUTCMonth() + 1;
          return {
            id: r.id,
            name: r.name || r.original_filename || 'MMP File',
            entries: r.entries ?? 0,
            uploadedAt: uploadedAt,
            uploadedBy: r.uploaded_by || 'Unknown',
            status: r.status || 'approved',
            mmpId: r.mmp_id || '',
            projectName: r.project_name || '',
            fileUrl: r.file_url || '',
            originalFilename: r.original_filename || '',
            version: r.version,
            siteEntries: r.site_entries || [],
            workflow: r.workflow || undefined,
            archiveId: r.id,
            archiveDate: uploadedAt,
            archiveCategory: 'mmp',
            documents: r.file_url
              ? [{
                  id: `mmpdoc-${r.id}`,
                  fileName: r.original_filename || r.name || 'file',
                  fileUrl: r.file_url,
                  fileType: 'application/octet-stream',
                  fileSize: 0,
                  uploadedBy: r.uploaded_by || 'Unknown',
                  uploadedAt: uploadedAt,
                  category: 'mmp',
                  relatedEntityId: r.id,
                  relatedEntityType: 'mmp',
                }]
              : [],
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            year,
            month,
          } as ArchivedMMPFile;
        };

        const toArchivedSiteVisit = (v: any): ArchivedSiteVisit => {
          const completedAt = v.completed_at || v.created_at;
          return {
            id: v.id,
            siteName: v.site_name,
            siteCode: v.site_code,
            status: v.status,
            locality: v.locality,
            state: v.state,
            activity: v.activity,
            priority: v.priority,
            dueDate: v.due_date,
            scheduledDate: v.due_date,
            assignedTo: v.assigned_to,
            assignedBy: v.assigned_by,
            assignedAt: v.assigned_at,
            notes: v.notes,
            attachments: v.attachments || [],
            completedAt: v.completed_at,
            rating: v.rating,
            fees: v.fees || {},
            location: v.location,
            mainActivity: v.main_activity || v.activity,
            archiveId: v.id,
            archiveDate: completedAt,
            archiveCategory: 'siteVisit',
            documents: Array.isArray(v.attachments)
              ? (v.attachments as string[]).map((url, i) => ({
                  id: `svdoc-${v.id}-${i}`,
                  fileName: (url || '').split('/').pop() || 'attachment',
                  fileUrl: url,
                  fileType: 'application/octet-stream',
                  fileSize: 0,
                  uploadedBy: v.assigned_by || 'system',
                  uploadedAt: completedAt || v.created_at,
                  category: 'siteVisit',
                  relatedEntityId: v.id,
                  relatedEntityType: 'siteVisit',
                }))
              : [],
          } as ArchivedSiteVisit;
        };

        const mmpArchivedRows = (mmpRows || []).filter((r: any) => {
          const st = (r.status || '').toLowerCase();
          return st === 'approved' || st === 'archived';
        });
        const svArchivedRows = (svRows || []).filter((v: any) => (v.status || '').toLowerCase() === 'completed');

        const mmp = mmpArchivedRows.map(toArchivedMMP);
        const visits = svArchivedRows.map(toArchivedSiteVisit);

        const docFromMmp: ArchiveDocument[] = mmp.flatMap((x) => x.documents);
        const docFromVisits: ArchiveDocument[] = visits.flatMap((x) => x.documents);
        const docFromPhotos: ArchiveDocument[] = (photoRows || []).map((p: any) => ({
          id: p.id,
          fileName: (p.photo_url || '').split('/').pop() || 'photo',
          fileUrl: p.photo_url,
          fileType: 'image/jpeg',
          fileSize: 0,
          uploadedBy: 'system',
          uploadedAt: p.created_at,
          category: 'report',
          relatedEntityId: p.report_id,
          relatedEntityType: 'siteVisit',
        }));
        const docs = [...docFromMmp, ...docFromVisits, ...docFromPhotos];

        const monthBuckets = new Map<string, { y: number; m: number; mmps: number; svs: number; docs: number }>();
        const bump = (d?: string | null, kind?: 'mmps' | 'svs' | 'docs') => {
          if (!d || !kind) return;
          const date = new Date(d);
          const y = date.getUTCFullYear();
          const m = date.getUTCMonth() + 1;
          const key = `${y}-${m}`;
          if (!monthBuckets.has(key)) monthBuckets.set(key, { y, m, mmps: 0, svs: 0, docs: 0 });
          const bucket = monthBuckets.get(key)!;
          bucket[kind] = bucket[kind] + 1;
        };
        mmp.forEach(x => bump(x.uploadedAt, 'mmps'));
        visits.forEach(x => bump(x.completedAt, 'svs'));
        docs.forEach(x => bump(x.uploadedAt, 'docs'));

        const months: ArchiveMonth[] = [...monthBuckets.values()]
          .sort((a, b) => (b.y - a.y) || (b.m - a.m))
          .map(x => ({
            year: x.y,
            month: x.m,
            label: new Date(Date.UTC(x.y, x.m - 1, 1)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
            mmpsCount: x.mmps,
            siteVisitsCount: x.svs,
            documentsCount: x.docs,
          }));

        const documentsByCategory = docs.reduce<Record<string, number>>((acc, d) => {
          acc[d.category] = (acc[d.category] || 0) + 1;
          return acc;
        }, {});
        const mmpStatusCounts = mmp.reduce<Record<string, number>>((acc, f) => {
          const s = (f.status || 'unknown').toLowerCase();
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        }, {});
        const monthlyTrends = months.map(x => ({
          year: x.year,
          month: x.month,
          mmps: x.mmpsCount,
          siteVisits: x.siteVisitsCount,
          documents: x.documentsCount,
        }));

        setArchivedMMPs(mmp);
        setArchivedSiteVisits(visits);
        setDocuments(docs);
        setArchives(months);
        setCurrentArchive(months[0]);
        setStatistics({
          totalMmps: mmp.length,
          totalSiteVisits: visits.length,
          totalDocuments: docs.length,
          documentsByCategory,
          mmpStatusCounts,
          monthlyTrends,
        });
      } catch (e) {
        console.error('Archive load error:', e);
        toast({
          title: 'Failed to load archive',
          description: 'Please check your internet connection and try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Select a specific month's archive
  const selectMonth = (year: number, month: number) => {
    const selectedArchive = archives.find(
      (archive) => archive.year === year && archive.month === month
    );
    
    if (selectedArchive) {
      setCurrentArchive(selectedArchive);
      toast({
        title: "Archive Selected",
        description: `Viewing archive for ${selectedArchive.label}`,
      });
      
      // In a real app, this would fetch data specific to this month from the API
      // For now, we'll just simulate a loading state
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
      }, 800);
    }
  };

  // Download archive in specified format
  const downloadArchive = async (format: 'excel' | 'csv' | 'pdf', downloadFilters?: ArchiveFilter): Promise<boolean> => {
    try {
      setLoading(true);
      
      // Simulating API call to generate file
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      // In a real implementation, this would handle the actual file download
      // based on the selected format and filters
      
      const formatName = format.toUpperCase();
      
      toast({
        title: `Archive Downloaded`,
        description: `The archive has been downloaded in ${formatName} format.`,
        variant: "success",
      });
      
      setLoading(false);
      return true;
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: "There was an error downloading the archive.",
        variant: "destructive",
      });
      setLoading(false);
      return false;
    }
  };

  // Upload a new document to the archive
  const uploadDocument = async (document: Omit<ArchiveDocument, 'id'>): Promise<string> => {
    try {
      setLoading(true);
      
      // Simulating API call to upload document
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Generate a unique ID for the document
      const newDocId = `doc-${Date.now()}`;
      
      // Create the document with the new ID
      const newDocument: ArchiveDocument = {
        ...document,
        id: newDocId,
      };
      
      // Add to the documents list
      setDocuments((prevDocs) => [...prevDocs, newDocument]);
      
      toast({
        title: "Document Uploaded",
        description: `${document.fileName} has been added to the archive.`,
        variant: "success",
      });
      
      setLoading(false);
      return newDocId;
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: "There was an error uploading the document.",
        variant: "destructive",
      });
      setLoading(false);
      return "";
    }
  };

  // Delete a document from the archive
  const deleteDocument = async (documentId: string): Promise<boolean> => {
    try {
      setLoading(true);
      
      // Simulating API call to delete document
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      // Remove the document from the list
      setDocuments((prevDocs) => prevDocs.filter((doc) => doc.id !== documentId));
      
      const deletedDoc = documents.find((doc) => doc.id === documentId);
      
      toast({
        title: "Document Deleted",
        description: `${deletedDoc?.fileName || 'Document'} has been removed from the archive.`,
        variant: "success",
      });
      
      setLoading(false);
      return true;
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Delete Failed",
        description: "There was an error deleting the document.",
        variant: "destructive",
      });
      setLoading(false);
      return false;
    }
  };

  // Search archives based on query
  const searchArchives = async (query: string): Promise<{
    mmps: ArchivedMMPFile[];
    siteVisits: ArchivedSiteVisit[];
    documents: ArchiveDocument[];
  }> => {
    setLoading(true);
    
    // Simulate API call for search
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    // Simple search implementation for demonstration
    const searchLower = query.toLowerCase();
    
    const filteredMMPs = archivedMMPs.filter(
      (mmp) => 
        mmp.mmpId.toLowerCase().includes(searchLower) || 
        mmp.name.toLowerCase().includes(searchLower) || 
        mmp.description.toLowerCase().includes(searchLower)
    );
    
    const filteredSiteVisits = archivedSiteVisits.filter(
      (visit) => 
        visit.siteName.toLowerCase().includes(searchLower) || 
        visit.description?.toLowerCase().includes(searchLower) ||
        visit.state.toLowerCase().includes(searchLower)
    );
    
    const filteredDocuments = documents.filter(
      (doc) => 
        doc.fileName.toLowerCase().includes(searchLower) || 
        doc.description?.toLowerCase().includes(searchLower)
    );
    
    setLoading(false);
    
    return {
      mmps: filteredMMPs,
      siteVisits: filteredSiteVisits, 
      documents: filteredDocuments
    };
  };

  // Context value
  const contextValue: ArchiveContextType = {
    archives,
    currentArchive,
    archivedMMPs,
    archivedSiteVisits,
    documents,
    statistics,
    filters,
    loading,
    setFilters,
    selectMonth,
    downloadArchive,
    uploadDocument,
    deleteDocument,
    searchArchives,
  };

  return (
    <ArchiveContext.Provider value={contextValue}>
      {children}
    </ArchiveContext.Provider>
  );
};

// Hook for using the archive context
export const useArchive = (): ArchiveContextType => {
  const context = useContext(ArchiveContext);
  
  if (context === undefined) {
    throw new Error('useArchive must be used within an ArchiveProvider');
  }
  
  return context;
};
