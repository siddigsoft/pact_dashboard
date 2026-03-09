import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FileText, Search, Download, Eye, Calendar, MapPin, Building2, 
  FolderOpen, RefreshCw, FileSpreadsheet, Receipt, Shield, Hash,
  ArrowUpDown, ChevronDown, ChevronUp, File, Image, Folder,
  ExternalLink, History, Clock, Wallet, Filter, X, PenLine,
  Briefcase, Home, ChevronLeft, ChevronRight, Loader2, Database
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO, isValid } from 'date-fns';

// Cache configuration
const CACHE_KEY = 'pact_documents_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes cache

interface CachedData {
  documents: Document[];
  timestamp: number;
  availableMonths: string[];
  availableStates: string[];
  availableLocalities: string[];
}

const getFromCache = (): CachedData | null => {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as CachedData;
    if (Date.now() - data.timestamp > CACHE_EXPIRY_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const saveToCache = (documents: Document[], availableMonths: string[], availableStates: string[], availableLocalities: string[]) => {
  try {
    const data: CachedData = { documents, timestamp: Date.now(), availableMonths, availableStates, availableLocalities };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to cache documents:', e);
  }
};

const clearCache = () => {
  sessionStorage.removeItem(CACHE_KEY);
};

// Safe date parsing helper
const safeFormatDate = (dateStr: string | null | undefined, formatStr: string, fallback?: string): string | undefined => {
  if (!dateStr || typeof dateStr !== 'string') return fallback;
  try {
    const parsed = parseISO(dateStr);
    if (!isValid(parsed)) return fallback;
    return format(parsed, formatStr);
  } catch {
    return fallback;
  }
};
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { DocumentIndexService } from '@/services/document-index.service';

interface Document {
  id: string;
  indexNo: number;
  fileName: string;
  fileUrl: string;
  fileSize?: string;
  fileType?: string;
  category: 'mmp_file' | 'federal_permit' | 'state_permit' | 'local_permit' | 'cost_receipt' | 'transaction_receipt' | 'site_visit_photo' | 'report' | 'attachment' | 'other';
  uploadedAt: string;
  uploadedBy?: string;
  state?: string;
  locality?: string;
  projectId?: string;
  projectName?: string;
  hubId?: string;
  hubName?: string;
  mmpName?: string;
  mmpId?: string;
  siteName?: string;
  siteVisitId?: string;
  issueDate?: string;
  expiryDate?: string;
  monthBucket?: string;
  status?: 'pending' | 'verified' | 'rejected' | 'approved';
  verified?: boolean;
  signatureId?: string;
  signedAt?: string;
  sourceType: 'mmp' | 'permit' | 'cost' | 'transaction' | 'site_visit' | 'chat' | 'other';
}

interface Project {
  id: string;
  name: string;
}

interface Hub {
  id: string;
  name: string;
}

const categoryLabels: Record<string, string> = {
  mmp_file: 'MMP File',
  federal_permit: 'Federal Permit',
  state_permit: 'State Permit',
  local_permit: 'Local Permit',
  cost_receipt: 'Cost Receipt',
  transaction_receipt: 'Transaction Receipt',
  site_visit_photo: 'Site Visit Photo',
  report: 'Report',
  attachment: 'Attachment',
  other: 'Other'
};

const categoryIcons: Record<string, typeof FileText> = {
  mmp_file: FileSpreadsheet,
  federal_permit: Shield,
  state_permit: Shield,
  local_permit: Shield,
  cost_receipt: Receipt,
  transaction_receipt: Wallet,
  site_visit_photo: Image,
  report: FileText,
  attachment: File,
  other: File
};

const categoryColors: Record<string, string> = {
  mmp_file: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  federal_permit: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  state_permit: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  local_permit: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  cost_receipt: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  transaction_receipt: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  site_visit_photo: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  report: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  attachment: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  other: 'bg-gray-500/10 text-gray-600 dark:text-gray-400'
};

type SortField = 'indexNo' | 'fileName' | 'uploadedAt' | 'category';
type SortDirection = 'asc' | 'desc';

// Page size options
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

const DocumentsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('uploadedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [activeTab, setActiveTab] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [useLazyLoad, setUseLazyLoad] = useState(false);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_PAGE_SIZE);
  
  // New advanced filters
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [hubFilter, setHubFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [localityFilter, setLocalityFilter] = useState<string>('all');
  const [hasSignatureFilter, setHasSignatureFilter] = useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // New MMP + permit-type filters
  const [mmpFilter, setMmpFilter] = useState<string>('all');
  const [permitTypeFilter, setPermitTypeFilter] = useState<string>('all');
  
  // Filter options data
  const [projects, setProjects] = useState<Project[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableLocalities, setAvailableLocalities] = useState<string[]>([]);
  const [availableMmps, setAvailableMmps] = useState<{ id: string; name: string }[]>([]);
  const [availableSiteNames, setAvailableSiteNames] = useState<string[]>([]);

  // Site photos specific filters
  const [sitePhotosMmpFilter, setSitePhotosMmpFilter] = useState<string>('all');
  const [sitePhotosSiteFilter, setSitePhotosSiteFilter] = useState<string>('all');
  
  // Cache status
  const [fromCache, setFromCache] = useState(false);
  
  // Sync/rebuild index state
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');

  // Sync/rebuild document index
  const handleSyncDocuments = async () => {
    setSyncing(true);
    setSyncProgress(0);
    setSyncMessage('Starting sync...');
    
    try {
      const result = await DocumentIndexService.rebuildIndex((current, total, message) => {
        setSyncProgress(current);
        setSyncMessage(message);
      });
      
      if (result.success) {
        toast({
          title: 'Documents Synced',
          description: result.message,
        });
        // Refresh documents after sync
        clearCache();
        await fetchDocuments(true);
      } else {
        toast({
          title: 'Sync Error',
          description: result.message,
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Unknown error occurred',
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
      setSyncProgress(0);
      setSyncMessage('');
    }
  };

  // Fetch filter options (projects, hubs, etc.) - parallelized for speed
  const fetchFilterOptions = async () => {
    try {
      const [projectsRes, hubsRes] = await Promise.all([
        supabase.from('projects').select('id, name').order('name'),
        supabase.from('hubs').select('id, name').order('name')
      ]);
      
      setProjects(projectsRes.data || []);
      setHubs(hubsRes.data || []);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const fetchDocuments = async (forceRefresh = false) => {
    setLoading(true);
    setFromCache(false);
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getFromCache();
      if (cached) {
        setDocuments(cached.documents);
        setAvailableMonths(cached.availableMonths);
        setAvailableStates(cached.availableStates);
        setAvailableLocalities(cached.availableLocalities || []);
        setFromCache(true);
        setLoading(false);
        return;
      }
    }
    
    try {
      const docs: Document[] = [];
      let indexCounter = 1;
      const monthsSet = new Set<string>();
      const statesSet = new Set<string>();
      const localitiesSet = new Set<string>();
      const seenIds = new Set<string>();

      // Fetch all documents without date filter to ensure nothing is missed
      // Parallel fetch all document sources with limits for improved speed
      // Wrap each query in try-catch to handle missing tables gracefully
      const [mmpResult, costResult, photoResult, indexedDocsResult] = await Promise.all([
        supabase
          .from('mmp_files')
          .select('id, name, original_filename, file_url, created_at, uploaded_at, updated_at, permits, project_id, status, uploaded_by, projects(name)')
          .order('created_at', { ascending: false })
          .limit(500),
        (async () => {
          try {
            return await supabase
              .from('site_visit_cost_submissions')
              .select('id, supporting_documents, submitted_at, created_at, status, site_visit_id, project_id, projects(name)')
              .order('created_at', { ascending: false })
              .limit(500);
          } catch {
            return { data: null, error: { message: 'site_visit_cost_submissions table may not exist' } };
          }
        })(),
        (async () => {
          try {
            return await supabase
              .from('report_photos')
              .select('id, photo_url, created_at, report_id, reports(site_visit_id, notes)')
              .order('created_at', { ascending: false })
              .limit(200);
          } catch {
            return { data: null, error: { message: 'report_photos table may not exist' } };
          }
        })(),
        (async () => {
          try {
            return await supabase
              .from('document_index')
              .select('*')
              .order('uploaded_at', { ascending: false })
              .limit(500);
          } catch {
            return { data: null, error: { message: 'document_index table may not exist' } };
          }
        })()
      ]);

      const mmpFiles = mmpResult.data;
      const mmpError = mmpResult.error;
      const costSubmissions = costResult.data;
      const costError = costResult.error;
      const reportPhotos = photoResult.data;
      const photoError = photoResult.error;
      const indexedDocs = indexedDocsResult.data;
      const indexedError = indexedDocsResult.error;

      // Debug logging
      console.log('Documents fetch results:', {
        mmpFiles: mmpFiles?.length || 0,
        mmpError,
        costSubmissions: costSubmissions?.length || 0,
        costError,
        reportPhotos: reportPhotos?.length || 0,
        photoError,
        indexedDocs: indexedDocs?.length || 0,
        indexedError
      });

      // Process indexed documents first (persistent index takes priority for deduplication)
      // Track indexed source IDs to prevent duplicates from legacy sources
      const indexedSourceIds = new Set<string>();
      
      // Track permits by MMP ID to avoid duplicates from standalone tables
      const federalPermitsByMmp = new Set<string>();
      const statePermitsByMmp = new Set<string>();
      const localPermitsByMmp = new Set<string>();
      
      // Track individual permit files to prevent any duplicates (same file in multiple sources)
      const seenPermitFiles = new Set<string>();
      
      (mmpFiles || []).forEach((mmp: any) => {
        if (mmp?.permits?.documents && Array.isArray(mmp.permits.documents) && mmp.permits.documents.length > 0) {
          federalPermitsByMmp.add(mmp.id);
        }
        if (mmp?.permits?.statePermits && Array.isArray(mmp.permits.statePermits) && mmp.permits.statePermits.length > 0) {
          statePermitsByMmp.add(mmp.id);
        }
        if (mmp?.permits?.localPermits && Array.isArray(mmp.permits.localPermits) && mmp.permits.localPermits.length > 0) {
          localPermitsByMmp.add(mmp.id);
        }
        if (mmp?.permits?.localityPermits && Array.isArray(mmp.permits.localityPermits) && mmp.permits.localityPermits.length > 0) {
          localPermitsByMmp.add(mmp.id);
        }
      });

      try {
        if (indexedError) {
          console.warn('Document index fetch error:', indexedError);
        }

        (indexedDocs || []).forEach((doc: any) => {
          if (!doc) return;
          const docId = `indexed-${doc.id}`;
          if (seenIds.has(docId)) return;
          seenIds.add(docId);
          
          // Track source IDs to deduplicate legacy sources
          if (doc.source_table && doc.source_id) {
            indexedSourceIds.add(`${doc.source_table}:${doc.source_id}`);
          }
          
          const monthBucket = safeFormatDate(doc.uploaded_at, 'yyyy-MM');
          if (monthBucket) monthsSet.add(monthBucket);
          if (doc.state) statesSet.add(doc.state);

          docs.push({
            id: docId,
            indexNo: indexCounter++,
            fileName: doc.file_name || 'Unknown Document',
            fileUrl: doc.file_url || '',
            fileSize: doc.file_size?.toString(),
            fileType: doc.file_type,
            category: doc.category || 'other',
            uploadedAt: doc.uploaded_at || new Date().toISOString(),
            uploadedBy: doc.uploaded_by_name || doc.uploaded_by,
            projectId: doc.project_id,
            projectName: doc.project_name,
            hubId: doc.hub_id,
            hubName: doc.hub_name,
            state: doc.state,
            locality: doc.locality,
            mmpName: doc.mmp_name,
            mmpId: doc.mmp_id || doc.mmpId,
            siteName: doc.metadata?.site_name || doc.metadata?.siteName,
            siteVisitId: doc.site_visit_id,
            issueDate: doc.issue_date,
            expiryDate: doc.expiry_date,
            monthBucket,
            status: doc.status || 'pending',
            verified: doc.verified || false,
            signatureId: doc.signature_id,
            signedAt: doc.signed_at,
            sourceType: doc.source_type || 'other'
          });
        });
        
        console.log(`Processed ${indexedDocs?.length || 0} documents from persistent index, tracking ${indexedSourceIds.size} source IDs`);
      } catch (e) {
        console.error('Error processing indexed documents:', e);
      }
      
      // Helper function to check if a document source is already indexed
      const isAlreadyIndexed = (sourceTable: string, sourceId: string) => {
        return indexedSourceIds.has(`${sourceTable}:${sourceId}`);
      };
      
      // Detailed MMP debug
      if (mmpFiles && mmpFiles.length > 0) {
        console.log('First MMP file details:', JSON.stringify(mmpFiles[0], null, 2));
      } else {
        console.log('No MMP files returned from database query');
      }

      // Build quick mmp name -> id map from fetched mmpFiles for fallback name matching
      const mmpNameToId: Record<string, string> = {};
      (mmpFiles || []).forEach((m: any) => {
        const nm = (m.original_filename || m.name || '').toString();
        if (nm) mmpNameToId[nm] = m.id;
      });

      // 1. Process MMP Files (the CSV uploads themselves)
      try {
        if (mmpError) {
          console.warn('MMP files fetch error:', mmpError);
        }

        (mmpFiles || []).forEach((mmp: any) => {
          if (!mmp) return;
          
          // Skip MMP push if already in persistent document_index (avoid duplicates)
          // but always process permits below
          let skipMmpPush = false;
          if (isAlreadyIndexed('mmp_files', mmp.id)) {
            console.log('Skipping MMP already in persistent index:', mmp.id);
            skipMmpPush = true;
          }
          
          if (!skipMmpPush) {
            const projectName = mmp.project_name || mmp.projects?.name || 'Unknown Project';
            const uploadDate = mmp.uploaded_at || mmp.created_at;
            const monthBucket = safeFormatDate(uploadDate, 'yyyy-MM');
            if (monthBucket) monthsSet.add(monthBucket);
            
            // Add the MMP file itself
            docs.push({
              id: `mmp-${mmp.id}`,
              indexNo: indexCounter++,
              fileName: mmp.original_filename || mmp.name || 'Untitled MMP',
              fileUrl: mmp.file_url || '',
              category: 'mmp_file',
              uploadedAt: uploadDate || new Date().toISOString(),
              uploadedBy: mmp.uploaded_by,
              projectId: mmp.project_id,
              projectName,
              mmpId: mmp.id,
              monthBucket,
              status: mmp.status === 'approved' ? 'approved' : mmp.status === 'rejected' ? 'rejected' : 'pending',
              verified: mmp.status === 'approved',
              sourceType: 'mmp'
            });
          }

          // Always extract permits (even if MMP was skipped as duplicate)
          // Permits should already be in persistent index, but this is a fallback
          const projectName = mmp.project_name || mmp.projects?.name || 'Unknown Project';
          const uploadDate = mmp.uploaded_at || mmp.created_at;
          const monthBucket = safeFormatDate(uploadDate, 'yyyy-MM');
          if (!skipMmpPush && monthBucket) monthsSet.add(monthBucket);
          const permits = mmp.permits || {};
          
          // Federal permits
          if (Array.isArray(permits.documents)) {
            permits.documents.forEach((doc: any, idx: number) => {
              if (!doc) return;
              // Skip if already indexed
              const sourceId = doc.id || `${mmp.id}-fed-${idx}`;
              if (isAlreadyIndexed('mmp_files', sourceId)) return;
              
              // Skip if we've already added this permit file - use stable key based on content
              const permitKey = doc.fileUrl || `${mmp.id}-fed-${doc.fileName}-${doc.uploadedAt || idx}`;
              if (seenPermitFiles.has(permitKey)) return;
              seenPermitFiles.add(permitKey);
              
              const docMonth = safeFormatDate(doc.uploadedAt, 'yyyy-MM', monthBucket);
              if (docMonth) monthsSet.add(docMonth);
              
              docs.push({
                id: `${mmp.id}-fed-${idx}`,
                indexNo: indexCounter++,
                fileName: doc.fileName || 'Federal Permit',
                fileUrl: doc.fileUrl || '',
                category: 'federal_permit',
                uploadedAt: doc.uploadedAt || uploadDate || new Date().toISOString(),
                projectId: mmp.project_id,
                projectName,
                mmpName: mmp.original_filename || mmp.name,
                mmpId: mmp.id,
                monthBucket: docMonth,
                verified: doc.validated || false,
                status: doc.validated ? 'verified' : 'pending',
                sourceType: 'permit'
              });
            });
          }

          // State permits (handle both nested and flat structures)
          if (Array.isArray(permits.statePermits)) {
            permits.statePermits.forEach((sp: any, spIdx: number) => {
              if (!sp) return;
              
              // Handle both legacy nested format (sp.documents) and new flat format (sp.fileUrl directly)
              if (sp.documents && Array.isArray(sp.documents)) {
                // Legacy nested format
                if (sp.stateName) statesSet.add(sp.stateName);
                
                sp.documents.forEach((doc: any, idx: number) => {
                  if (!doc) return;
                  const sourceId = doc.id || `${mmp.id}-state-${sp.stateName}-${idx}`;
                  if (isAlreadyIndexed('mmp_files', sourceId)) return;
                  
                  // Skip if we've already added this permit file - use stable key based on content
                  const permitKey = doc.fileUrl || `${mmp.id}-state-${sp.stateName}-${doc.fileName}-${doc.uploadedAt || idx}`;
                  if (seenPermitFiles.has(permitKey)) return;
                  seenPermitFiles.add(permitKey);
                  
                  const docMonth = safeFormatDate(doc.uploadedAt, 'yyyy-MM', monthBucket);
                  if (docMonth) monthsSet.add(docMonth);
                  
                  docs.push({
                    id: `${mmp.id}-state-${sp.stateName}-${idx}`,
                    indexNo: indexCounter++,
                    fileName: doc.fileName || `State Permit - ${sp.stateName}`,
                    fileUrl: doc.fileUrl || '',
                    category: 'state_permit',
                    uploadedAt: doc.uploadedAt || uploadDate || new Date().toISOString(),
                    state: sp.stateName,
                    projectId: mmp.project_id,
                    projectName,
                    mmpName: mmp.original_filename || mmp.name,
                    mmpId: mmp.id,
                    monthBucket: docMonth,
                    issueDate: doc.issueDate,
                    expiryDate: doc.expiryDate,
                    verified: doc.validated || sp.verified || false,
                    status: doc.status || (sp.verified ? 'verified' : 'pending'),
                    sourceType: 'permit'
                  });
                });
              } else if (sp.fileUrl) {
                // New flat format (direct from StatePermitUpload)
                if (sp.state) statesSet.add(sp.state);
                
                // Skip if we've already added this permit file - use stable key based on content
                const permitKey = sp.fileUrl || `${mmp.id}-state-${sp.state}-${sp.fileName}-${sp.uploadedAt || spIdx}`;
                if (seenPermitFiles.has(permitKey)) return;
                seenPermitFiles.add(permitKey);
                
                // Make ID unique: use sp.id if available, otherwise use mmp.id + state + array index
                const sourceId = sp.id || `${mmp.id}-state-${sp.state}-${spIdx}`;
                if (!isAlreadyIndexed('mmp_files', sourceId)) {
                  const docMonth = safeFormatDate(sp.uploadedAt, 'yyyy-MM', monthBucket);
                  if (docMonth) monthsSet.add(docMonth);
                  
                  docs.push({
                    id: `${mmp.id}-state-${sp.state}-${spIdx}`,
                    indexNo: indexCounter++,
                    fileName: sp.fileName || `State Permit - ${sp.state}`,
                    fileUrl: sp.fileUrl || '',
                    category: 'state_permit',
                    uploadedAt: sp.uploadedAt || uploadDate || new Date().toISOString(),
                    state: sp.state,
                    projectId: mmp.project_id,
                    projectName,
                    mmpName: mmp.original_filename || mmp.name,
                    mmpId: mmp.id,
                    monthBucket: docMonth,
                    issueDate: sp.issueDate,
                    expiryDate: sp.expiryDate,
                    verified: sp.verified || false,
                    status: sp.status || (sp.verified ? 'verified' : 'pending'),
                    sourceType: 'permit'
                  });
                }
              }
            });
          }

          // Local permits
          if (Array.isArray(permits.localPermits)) {
            permits.localPermits.forEach((lp: any) => {
              if (!lp) return;
              if (lp.state) statesSet.add(lp.state);
              
              (Array.isArray(lp.documents) ? lp.documents : []).forEach((doc: any, idx: number) => {
                if (!doc) return;
                // Skip if already indexed
                const sourceId = doc.id || `${mmp.id}-local-${lp.localityName}-${idx}`;
                if (isAlreadyIndexed('mmp_files', sourceId)) return;
                
                // Skip if we've already added this permit file - use stable key based on content
                const permitKey = doc.fileUrl || `${mmp.id}-local-${lp.localityName}-${doc.fileName}-${doc.uploadedAt || idx}`;
                if (seenPermitFiles.has(permitKey)) return;
                seenPermitFiles.add(permitKey);
                
                const docMonth = safeFormatDate(doc.uploadedAt, 'yyyy-MM', monthBucket);
                if (docMonth) monthsSet.add(docMonth);
                
                docs.push({
                  id: `${mmp.id}-local-${lp.localityName}-${idx}`,
                  indexNo: indexCounter++,
                  fileName: doc.fileName || `Local Permit - ${lp.localityName}`,
                  fileUrl: doc.fileUrl || '',
                  category: 'local_permit',
                  uploadedAt: doc.uploadedAt || uploadDate || new Date().toISOString(),
                  state: lp.state,
                  locality: lp.localityName,
                  projectId: mmp.project_id,
                  projectName,
                  mmpName: mmp.original_filename || mmp.name,
                  mmpId: mmp.id,
                  monthBucket: docMonth,
                  issueDate: doc.issueDate,
                  expiryDate: doc.expiryDate,
                  verified: doc.validated || lp.verified || false,
                  status: doc.status || (lp.verified ? 'verified' : 'pending'),
                  sourceType: 'permit'
                });
              });
            });
          }

          // Locality permits array format
          if (Array.isArray(permits.localityPermits)) {
            permits.localityPermits.forEach((lp: any, idx: number) => {
              if (!lp) return;
              // Skip if already indexed
              const sourceId = lp.id || `${mmp.id}-locality-${idx}`;
              if (isAlreadyIndexed('mmp_files', sourceId)) return;
              
              // Skip if we've already added this permit file - use stable key based on content
              const permitKey = lp.fileUrl || `${mmp.id}-locality-${lp.fileName}-${lp.uploadedAt || idx}`;
              if (seenPermitFiles.has(permitKey)) return;
              seenPermitFiles.add(permitKey);
              
              if (lp.state) statesSet.add(lp.state);
              const docMonth = safeFormatDate(lp.uploadedAt, 'yyyy-MM', monthBucket);
              if (docMonth) monthsSet.add(docMonth);
              
              docs.push({
                id: `${mmp.id}-locality-${idx}`,
                indexNo: indexCounter++,
                fileName: lp.fileName || `Locality Permit`,
                fileUrl: lp.fileUrl || '',
                category: 'local_permit',
                uploadedAt: lp.uploadedAt || uploadDate || new Date().toISOString(),
                state: lp.state,
                locality: lp.locality,
                projectId: mmp.project_id,
                projectName,
                mmpName: mmp.original_filename || mmp.name,
                mmpId: mmp.id,
                monthBucket: docMonth,
                issueDate: lp.issueDate,
                expiryDate: lp.expiryDate,
                verified: lp.verified || false,
                status: lp.verified ? 'verified' : 'pending',
                sourceType: 'permit'
              });
            });
          }
        });
      } catch (mmpErr) {
        console.warn('Error processing MMP files:', mmpErr);
      }

      // 4. Fetch and process standalone permit tables (if present) to improve index completeness
      try {
        const [statePermsRes, localPermsRes, federalPermsRes] = await Promise.all([
          (async () => {
            try {
              return await supabase.from('state_permits').select('*').order('created_at', { ascending: false }).limit(500);
            } catch {
              return { data: null, error: { message: 'state_permits table may not exist' } };
            }
          })(),
          (async () => {
            try {
              return await supabase.from('local_permits').select('*').order('created_at', { ascending: false }).limit(500);
            } catch {
              return { data: null, error: { message: 'local_permits table may not exist' } };
            }
          })(),
          (async () => {
            try {
              return await supabase.from('federal_permits').select('*').order('created_at', { ascending: false }).limit(500);
            } catch {
              return { data: null, error: { message: 'federal_permits table may not exist' } };
            }
          })()
        ]);

        const statePerms = statePermsRes.data || [];
        const localPerms = localPermsRes.data || [];
        const federalPerms = federalPermsRes.data || [];

        // normalize state permits (skip if already extracted from mmp_files)
        (statePerms || []).forEach((p: any) => {
          if (!p) return;
          
          // Skip if this state permit already came from the MMP file
          const mmid = p.mmp_id || mmpNameToId[p.mmp_name] || p.mmpId;
          if (mmid && statePermitsByMmp.has(mmid)) return;
          
          const sourceId = p.id?.toString();
          if (sourceId && isAlreadyIndexed('state_permits', sourceId)) return;
          
          // Skip if we've already added this permit file - use stable key based on content
          const permitKey = p.file_url || p.fileUrl || `state-${p.file_name}-${p.uploaded_at || p.created_at || p.id}`;
          if (seenPermitFiles.has(permitKey)) return;
          seenPermitFiles.add(permitKey);
          
          if (p.state) statesSet.add(p.state);
          if (p.locality) localitiesSet.add(p.locality);
          const month = safeFormatDate(p.uploaded_at || p.created_at, 'yyyy-MM');
          if (month) monthsSet.add(month);
          docs.push({
            id: `stateperm-${p.id}`,
            indexNo: indexCounter++,
            fileName: p.file_name || p.name || `State Permit ${p.id}`,
            fileUrl: p.file_url || p.fileUrl || '',
            category: 'state_permit',
            uploadedAt: p.uploaded_at || p.created_at || new Date().toISOString(),
            state: p.state,
            locality: p.locality,
            projectId: p.project_id,
            projectName: p.project_name,
            mmpName: p.mmp_name,
            mmpId: mmid,
            monthBucket: month,
            issueDate: p.issue_date,
            expiryDate: p.expiry_date,
            verified: p.verified || false,
            status: p.status || (p.verified ? 'verified' : 'pending'),
            sourceType: 'permit'
          });
        });

        // normalize local permits (skip if already extracted from mmp_files)
        (localPerms || []).forEach((p: any) => {
          if (!p) return;
          
          // Skip if this local permit already came from the MMP file
          const mmid = p.mmp_id || mmpNameToId[p.mmp_name] || p.mmpId;
          if (mmid && localPermitsByMmp.has(mmid)) return;
          
          const sourceId = p.id?.toString();
          if (sourceId && isAlreadyIndexed('local_permits', sourceId)) return;
          
          // Skip if we've already added this permit file - use stable key based on content
          const permitKey = p.file_url || p.fileUrl || `local-${p.file_name}-${p.uploaded_at || p.created_at || p.id}`;
          if (seenPermitFiles.has(permitKey)) return;
          seenPermitFiles.add(permitKey);
          
          if (p.state) statesSet.add(p.state);
          if (p.locality) localitiesSet.add(p.locality || p.locality_name || p.localityName);
          const month = safeFormatDate(p.uploaded_at || p.created_at, 'yyyy-MM');
          if (month) monthsSet.add(month);
          docs.push({
            id: `localperm-${p.id}`,
            indexNo: indexCounter++,
            fileName: p.file_name || p.name || `Local Permit ${p.id}`,
            fileUrl: p.file_url || p.fileUrl || '',
            category: 'local_permit',
            uploadedAt: p.uploaded_at || p.created_at || new Date().toISOString(),
            state: p.state,
            locality: p.locality || p.locality_name || p.localityName,
            projectId: p.project_id,
            projectName: p.project_name,
            mmpName: p.mmp_name,
            mmpId: mmid,
            monthBucket: month,
            issueDate: p.issue_date,
            expiryDate: p.expiry_date,
            verified: p.verified || false,
            status: p.status || (p.verified ? 'verified' : 'pending'),
            sourceType: 'permit'
          });
        });

        // normalize federal permits (skip if already extracted from mmp_files)
        (federalPerms || []).forEach((p: any) => {
          if (!p) return;
          
          // Skip if this federal permit already came from the MMP file
          const mmid = p.mmp_id || mmpNameToId[p.mmp_name] || p.mmpId;
          if (mmid && federalPermitsByMmp.has(mmid)) return;
          
          const sourceId = p.id?.toString();
          if (sourceId && isAlreadyIndexed('federal_permits', sourceId)) return;
          
          // Skip if we've already added this permit file - use stable key based on content
          const permitKey = p.file_url || p.fileUrl || `federal-${p.file_name}-${p.uploaded_at || p.created_at || p.id}`;
          if (seenPermitFiles.has(permitKey)) return;
          seenPermitFiles.add(permitKey);
          
          const month = safeFormatDate(p.uploaded_at || p.created_at, 'yyyy-MM');
          if (month) monthsSet.add(month);
          docs.push({
            id: `fedperm-${p.id}`,
            indexNo: indexCounter++,
            fileName: p.file_name || p.name || `Federal Permit ${p.id}`,
            fileUrl: p.file_url || p.fileUrl || '',
            category: 'federal_permit',
            uploadedAt: p.uploaded_at || p.created_at || new Date().toISOString(),
            projectId: p.project_id,
            projectName: p.project_name,
            mmpName: p.mmp_name,
            mmpId: mmid,
            monthBucket: month,
            issueDate: p.issue_date,
            expiryDate: p.expiry_date,
            verified: p.verified || false,
            status: p.status || (p.verified ? 'verified' : 'pending'),
            sourceType: 'permit'
          });
        });
      } catch (permErr) {
        console.warn('Error fetching standalone permits:', permErr);
      }

      // 2. Process Cost Submission Receipts from site_visit_cost_submissions (supporting_documents)
      if (!costError && costSubmissions) {
        (costSubmissions || []).forEach((cost: any) => {
          if (!cost) return;
          const costMonth = safeFormatDate(cost.submitted_at || cost.created_at, 'yyyy-MM');
          if (costMonth) monthsSet.add(costMonth);
          const projectName = cost.projects?.name;
          const statusMap = cost.status === 'approved' || cost.status === 'paid' ? 'approved' : cost.status === 'rejected' ? 'rejected' : 'pending';
          const verified = cost.status === 'approved' || cost.status === 'paid';

          const supportingDocs = cost.supporting_documents;
          if (supportingDocs && Array.isArray(supportingDocs)) {
            supportingDocs.forEach((doc: any, idx: number) => {
              if (!doc) return;
              const fileUrl = doc.url || doc.fileUrl;
              if (!fileUrl) return;
              const docMonth = safeFormatDate(doc.uploadedAt || doc.uploaded_at || cost.submitted_at, 'yyyy-MM', costMonth);
              if (docMonth) monthsSet.add(docMonth);
              docs.push({
                id: `cost-${cost.id}-${idx}`,
                indexNo: indexCounter++,
                fileName: doc.filename || doc.fileName || doc.name || `Cost Receipt ${idx + 1}`,
                fileUrl,
                category: 'cost_receipt',
                uploadedAt: doc.uploadedAt || doc.uploaded_at || cost.submitted_at || cost.created_at || new Date().toISOString(),
                projectId: cost.project_id,
                projectName,
                siteVisitId: cost.site_visit_id,
                monthBucket: docMonth,
                status: statusMap,
                verified,
                sourceType: 'cost'
              });
            });
          }
        });
      }

      // 3. Process Report Photos (report_photos join reports for site_visit_id)
      if (!photoError && reportPhotos) {
        const siteVisitIds = Array.from(
          new Set(
            (reportPhotos || [])
              .map((photo: any) => photo?.reports?.site_visit_id ?? photo?.site_visit_id)
              .filter(Boolean)
          )
        ) as string[];

        let siteVisitMap = new Map<string, any>();
        let mmpNameMap = new Map<string, string>();

        if (siteVisitIds.length > 0) {
          const { data: siteVisits } = await supabase
            .from('site_visits')
            .select('id, site_name, site_code, mmp_id, state, locality, visit_date')
            .in('id', siteVisitIds);

          siteVisitMap = new Map((siteVisits || []).map((sv: any) => [sv.id, sv]));

          const mmpIds = Array.from(new Set((siteVisits || []).map((sv: any) => sv?.mmp_id).filter(Boolean))) as string[];
          if (mmpIds.length > 0) {
            const { data: mmpRows } = await supabase
              .from('mmp_files')
              .select('id, name, original_filename')
              .in('id', mmpIds);

            mmpNameMap = new Map(
              (mmpRows || []).map((m: any) => [m.id, m.original_filename || m.name || 'Unknown MMP'])
            );
          }
        }

        (reportPhotos || []).forEach((photo: any) => {
          if (!photo || !photo.photo_url) return;
          const siteVisitId = photo.reports?.site_visit_id ?? photo.site_visit_id;
          const siteVisit = siteVisitId ? siteVisitMap.get(siteVisitId) : null;
          const mmpName = siteVisit?.mmp_id ? mmpNameMap.get(siteVisit.mmp_id) : undefined;
          const mmpId = siteVisit?.mmp_id;
          const siteName = siteVisit?.site_name || 'Unknown Site';
          const photoMonth = safeFormatDate(photo.created_at, 'yyyy-MM');
          if (photoMonth) monthsSet.add(photoMonth);
          docs.push({
            id: `photo-${photo.id}`,
            indexNo: indexCounter++,
            fileName: photo.reports?.notes || photo.caption || `${siteName} - Site Visit Photo`,
            fileUrl: photo.photo_url,
            category: 'site_visit_photo',
            uploadedAt: photo.created_at || new Date().toISOString(),
            mmpName,
            mmpId,
            siteName,
            siteVisitId,
            state: siteVisit?.state,
            locality: siteVisit?.locality,
            monthBucket: photoMonth,
            status: 'verified',
            verified: true,
            sourceType: 'site_visit'
          });
        });
      }

      // Sort by upload date (newest first) and reassign index numbers
      docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      docs.forEach((doc, idx) => {
        doc.indexNo = idx + 1;
      });

      // Debug: Log final document count
      console.log(`[Documents] Total documents after processing: ${docs.length}`, {
        fromIndexedDocs: indexedDocs?.length || 0,
        fromMmpFiles: mmpFiles?.length || 0,
        fromCostSubmissions: costSubmissions?.length || 0,
        fromPhotos: reportPhotos?.length || 0
      });

      // Set available months and states for filters
      const months = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
      const states = Array.from(statesSet).sort();
      const localities = Array.from(localitiesSet).sort();
      setAvailableMonths(months);
      setAvailableStates(states);
      setAvailableLocalities(localities);
      setDocuments(docs);
      
      // Save to cache
      saveToCache(docs, months, states, localities);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: 'Failed to load documents',
        description: 'Please try refreshing the page.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Force refresh handler (clears cache)
  const handleRefresh = () => {
    clearCache();
    setCurrentPage(1);
    setVisibleCount(pageSize);
    fetchDocuments(true);
  };
  
  // Lazy loading with IntersectionObserver
  const loadMore = useCallback(() => {
    if (loadingMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(prev => prev + pageSize);
      setLoadingMore(false);
    }, 100);
  }, [loadingMore, pageSize]);
  
  useEffect(() => {
    // Clear stale cache on mount and force fresh fetch
    clearCache();
    // Fetch filter options and documents in parallel for speed
    Promise.all([fetchFilterOptions(), fetchDocuments(true)])
      .catch(err => {
        console.error('Error during initial fetch:', err);
      });
  }, []);

  // Build available MMP names from loaded documents
  useEffect(() => {
    const map = new Map<string, string>();
    documents.forEach(d => {
      if (d.mmpId && d.mmpName) map.set(d.mmpId, d.mmpName);
      if (d.category === 'mmp_file' && d.mmpId) map.set(d.mmpId, d.fileName || d.mmpName || `MMP ${d.mmpId}`);
    });
    const arr = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    arr.sort((a, b) => a.name.localeCompare(b.name));
    setAvailableMmps(arr);
  }, [documents]);

  // Build available site names for site photos (filtered by sitePhotosMmpFilter)
  useEffect(() => {
    const names = new Set<string>();
    documents.forEach(d => {
      if (d.category !== 'site_visit_photo') return;
      const mmpId = d.mmpId || 'unknown';
      if (sitePhotosMmpFilter !== 'all' && sitePhotosMmpFilter !== mmpId) return;
      const site = d.siteName || d.locality || d.state || 'Unknown Site';
      if (site) names.add(site);
    });
    setAvailableSiteNames(Array.from(names).sort((a, b) => a.localeCompare(b)));
  }, [documents, sitePhotosMmpFilter]);

  // Reset all filters
  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setSourceFilter('all');
    setProjectFilter('all');
    setMonthFilter('all');
    setHubFilter('all');
    setStateFilter('all');
    setLocalityFilter('all');
    setHasSignatureFilter('all');
    setMmpFilter('all');
    setPermitTypeFilter('all');
    setSitePhotosMmpFilter('all');
    setSitePhotosSiteFilter('all');
    setCurrentPage(1);
    setVisibleCount(pageSize);
  };

  // Reset advanced filters when switching to Permits or Site Photos tabs
  // These tabs have different data structures, so advanced filters may not apply
  useEffect(() => {
    if (activeTab === 'permits' || activeTab === 'site_photos') {
      // Reset state/locality filters as they may not apply to all permit/photo types
      setStateFilter('all');
      setLocalityFilter('all');
      setProjectFilter('all');
      setMonthFilter('all');
      setCurrentPage(1);
    }
  }, [activeTab]);

  // When a permit type is selected, lock the category filter to the corresponding permit category
  useEffect(() => {
    if (permitTypeFilter === 'all') return;

    const map: Record<string, string> = {
      federal: 'federal_permit',
      state: 'state_permit',
      local: 'local_permit'
    };

    const mapped = map[permitTypeFilter];
    if (mapped) setCategoryFilter(mapped);
  }, [permitTypeFilter]);

  // Count active advanced filters
  const activeAdvancedFiltersCount = [
    projectFilter !== 'all',
    monthFilter !== 'all',
    stateFilter !== 'all',
    localityFilter !== 'all'
  ].filter(Boolean).length;
  // Include MMP/permit-type in advanced filter badges
  const advancedFiltersCount = (
    (mmpFilter !== 'all' ? 1 : 0) + (permitTypeFilter !== 'all' ? 1 : 0) + activeAdvancedFiltersCount
  );

  // All filtered documents (before pagination)
  const allFilteredDocuments = useMemo(() => {
    let filtered = documents.filter(doc => {
      const matchesMmp = mmpFilter === 'all' || (doc.mmpId && doc.mmpId === mmpFilter);
      const matchesPermitType = permitTypeFilter === 'all' || (
        permitTypeFilter === 'federal' && doc.category === 'federal_permit'
      ) || (
        permitTypeFilter === 'state' && doc.category === 'state_permit'
      ) || (
        permitTypeFilter === 'local' && doc.category === 'local_permit'
      );
      const matchesSearch = searchTerm === '' || 
        doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.siteName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.locality?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.mmpName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.indexNo.toString().includes(searchTerm);
      
      const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
      const matchesSource = sourceFilter === 'all' || doc.sourceType === sourceFilter;
      
      // New advanced filters
      const matchesProject = projectFilter === 'all' || doc.projectId === projectFilter;
      const matchesMonth = monthFilter === 'all' || doc.monthBucket === monthFilter;
      const matchesState = stateFilter === 'all' || doc.state === stateFilter;
      const matchesLocality = localityFilter === 'all' || doc.locality === localityFilter;
      
      // Tab filtering
      const matchesTab = activeTab === 'all' || 
        (activeTab === 'mmp' && doc.category === 'mmp_file') ||
        (activeTab === 'permits' && doc.category.includes('permit')) ||
        (activeTab === 'receipts' && (doc.category === 'cost_receipt' || doc.category === 'transaction_receipt')) ||
        (activeTab === 'site_photos' && doc.category === 'site_visit_photo');
      
      return matchesSearch && matchesCategory && matchesStatus && matchesSource && 
        matchesProject && matchesMonth && matchesState && matchesLocality && matchesTab && matchesMmp && matchesPermitType;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'indexNo':
          comparison = a.indexNo - b.indexNo;
          break;
        case 'fileName':
          comparison = a.fileName.localeCompare(b.fileName);
          break;
        case 'uploadedAt':
          comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [documents, searchTerm, categoryFilter, statusFilter, sourceFilter, projectFilter, monthFilter, stateFilter, activeTab, sortField, sortDirection]);
  
  // Pagination calculations
  const totalPages = Math.ceil(allFilteredDocuments.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  
  // Paginated or lazy-loaded documents
  const filteredDocuments = useMemo(() => {
    if (useLazyLoad) {
      return allFilteredDocuments.slice(0, visibleCount);
    }
    return allFilteredDocuments.slice(startIndex, endIndex);
  }, [allFilteredDocuments, useLazyLoad, visibleCount, startIndex, endIndex]);
  
  // Pagination handlers
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };
  
  const hasMoreToLoad = useLazyLoad && visibleCount < allFilteredDocuments.length;
  
  // Reset page and visibleCount when filters change
  useEffect(() => {
    setCurrentPage(1);
    setVisibleCount(pageSize);
  }, [searchTerm, categoryFilter, statusFilter, sourceFilter, projectFilter, monthFilter, stateFilter, localityFilter, activeTab, pageSize]);
  
  // Clamp currentPage when data length changes to prevent empty results
  useEffect(() => {
    if (allFilteredDocuments.length === 0) {
      if (currentPage !== 1) setCurrentPage(1);
      return;
    }
    const maxPage = Math.ceil(allFilteredDocuments.length / pageSize);
    if (currentPage > maxPage) {
      setCurrentPage(Math.max(1, maxPage));
    }
  }, [allFilteredDocuments.length, pageSize, currentPage]);
  
  // Sync visibleCount when switching to lazy-load mode
  useEffect(() => {
    if (useLazyLoad) {
      setVisibleCount(pageSize);
    }
  }, [useLazyLoad, pageSize]);
  
  // Sentinel tracking for IntersectionObserver
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
  
  // Callback ref to track when sentinel element enters/exits DOM
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelNode(node);
  }, []);
  
  // IntersectionObserver setup with proper cleanup
  useEffect(() => {
    // Disconnect existing observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    
    // Only observe when lazy load is enabled, there's more to load, and sentinel exists
    if (!useLazyLoad || !hasMoreToLoad || !sentinelNode) {
      return;
    }
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '150px' }
    );
    
    observerRef.current.observe(sentinelNode);
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [useLazyLoad, hasMoreToLoad, loadMore, sentinelNode]);

  const stats = useMemo(() => ({
    total: documents.length,
    mmpFiles: documents.filter(d => d.category === 'mmp_file').length,
    permits: documents.filter(d => d.category.includes('permit')).length,
    receipts: documents.filter(d => d.category === 'cost_receipt').length,
    sitePhotos: documents.filter(d => d.category === 'site_visit_photo').length,
    verified: documents.filter(d => d.verified || d.status === 'approved').length,
    pending: documents.filter(d => d.status === 'pending').length
  }), [documents]);

  const selectedMmpName = useMemo(() => {
    if (mmpFilter === 'all') return 'All MMPs';
    return availableMmps.find(m => m.id === mmpFilter)?.name || mmpFilter;
  }, [availableMmps, mmpFilter]);

  const isSitePhotosFilterActive = activeTab === 'site_photos' || categoryFilter === 'site_visit_photo';

  const sitePhotoGroups = useMemo(() => {
    if (!isSitePhotosFilterActive) return [];

    const grouped = new Map<string, {
      mmpName: string;
      month: string;
      siteName: string;
      photos: Document[];
    }>();

    allFilteredDocuments
      .filter(doc => doc.category === 'site_visit_photo')
      .filter(doc => {
        // apply site-photos specific filters (use mmpId for matching)
        const mmpId = doc.mmpId || 'unknown';
        const siteName = doc.siteName || doc.locality || doc.state || 'Unknown Site';
        if (sitePhotosMmpFilter !== 'all' && sitePhotosMmpFilter !== mmpId) return false;
        if (sitePhotosSiteFilter !== 'all' && sitePhotosSiteFilter !== siteName) return false;
        return true;
      })
      .forEach((doc) => {
        const month = doc.monthBucket || safeFormatDate(doc.uploadedAt, 'yyyy-MM', 'Unknown Month') || 'Unknown Month';
        const mmpName = doc.mmpName || 'Unknown MMP';
        const siteName = doc.siteName || doc.locality || doc.state || 'Unknown Site';
        const key = `${mmpName}__${month}__${siteName}`;

        if (!grouped.has(key)) {
          grouped.set(key, { mmpName, month, siteName, photos: [] });
        }

        grouped.get(key)!.photos.push(doc);
      });

    return Array.from(grouped.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [isSitePhotosFilterActive, allFilteredDocuments]);

  // When an MMP is selected, group completed sites (sites with photos) for that MMP
  const siteGroupsForSelectedMmp = useMemo(() => {
    if (mmpFilter === 'all') return [];

    const map = new Map<string, { siteName: string; photos: Document[]; lastVisited?: string }>();

    allFilteredDocuments
      .filter(d => d.category === 'site_visit_photo')
      .forEach((doc) => {
        const mmpId = doc.mmpId || 'unknown';
        if (mmpId !== mmpFilter) return;
        const siteName = doc.siteName || doc.locality || doc.state || 'Unknown Site';
        if (!map.has(siteName)) map.set(siteName, { siteName, photos: [], lastVisited: undefined });
        map.get(siteName)!.photos.push(doc);
      });

    const groups = Array.from(map.values()).map(g => {
      const photos = g.photos.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      const lastVisited = photos.length > 0 ? photos[0].uploadedAt : undefined;
      return { siteName: g.siteName, photos, lastVisited };
    });

    // Sort sites by lastVisited descending (most recently visited first)
    groups.sort((a, b) => {
      const ta = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
      const tb = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;
      return tb - ta;
    });

    return groups;
  }, [allFilteredDocuments, mmpFilter]);

  const handleViewDocument = (doc: Document) => {
    if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank');
    } else {
      toast({
        title: 'Document unavailable',
        description: 'The document URL is not available.',
        variant: 'destructive'
      });
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getStatusBadgeVariant = (status?: string) => {
    switch (status) {
      case 'verified':
      case 'approved':
        return 'default';
      case 'rejected':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={() => handleSort(field)}
      className="h-8 gap-1 text-xs font-medium"
      data-testid={`button-sort-${field}`}
    >
      {label}
      {sortField === field ? (
        sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      )}
    </Button>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 md:p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
            <FolderOpen className="h-5 w-5 text-white dark:text-black" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight" data-testid="text-documents-title">Document Registry</h1>
            <p className="text-sm text-muted-foreground">
              All uploaded files with indexing and categories
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild data-testid="link-site-visits">
            <Link to="/site-visits">
              <MapPin className="h-4 w-4 mr-2" />
              Site Visits
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="link-audit-logs">
            <Link to="/audit-logs">
              <History className="h-4 w-4 mr-2" />
              Audit Logs
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="link-wallet-reports">
            <Link to="/wallet-reports">
              <Wallet className="h-4 w-4 mr-2" />
              Wallet Reports
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-documents">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSyncDocuments} 
            disabled={syncing}
            data-testid="button-sync-documents"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            {syncing ? 'Syncing...' : 'Sync Index'}
          </Button>
          {fromCache && (
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Cached
            </Badge>
          )}
        </div>
      </div>
      
      {syncing && (
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{syncMessage}</p>
                <Progress value={syncProgress} className="mt-2 h-2" />
              </div>
              <span className="text-sm text-muted-foreground">{syncProgress}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Folder className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">MMP Files</p>
                <p className="text-xl font-bold">{stats.mmpFiles}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Permits</p>
                <p className="text-xl font-bold">{stats.permits}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receipts</p>
                <p className="text-xl font-bold">{stats.receipts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <Image className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Site Photos</p>
                <p className="text-xl font-bold">{stats.sitePhotos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Verified</p>
                <p className="text-xl font-bold">{stats.verified}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for quick filtering */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all" data-testid="tab-all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="mmp" data-testid="tab-mmp">MMP Files ({stats.mmpFiles})</TabsTrigger>
          <TabsTrigger value="permits" data-testid="tab-permits">Permits ({stats.permits})</TabsTrigger>
          <TabsTrigger value="receipts" data-testid="tab-receipts">Receipts ({stats.receipts})</TabsTrigger>
          <TabsTrigger value="site_photos" data-testid="tab-site-photos">Site Photos ({stats.sitePhotos})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isSitePhotosFilterActive && sitePhotoGroups.length > 0 && (
            <Card className="border-border mb-4">
              <CardHeader className="pb-3">
                <h3 className="text-sm font-semibold">Site Photos Index</h3>
                <p className="text-xs text-muted-foreground">Grouped by MMP name, month, and site name</p>
                <div className="mt-3 flex items-center gap-2">
                  <Select value={sitePhotosMmpFilter} onValueChange={(v) => { setSitePhotosMmpFilter(v); setSitePhotosSiteFilter('all'); }}>
                    <SelectTrigger className="w-[220px]" data-testid="select-sitephotos-mmp-filter">
                      <SelectValue placeholder="Filter by MMP" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All MMPs</SelectItem>
                      {availableMmps.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={sitePhotosSiteFilter} onValueChange={setSitePhotosSiteFilter}>
                    <SelectTrigger className="w-[200px]" data-testid="select-sitephotos-site-filter">
                      <SelectValue placeholder="Filter by Site" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      {availableSiteNames.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sitePhotoGroups.map((group, idx) => (
                    <div key={`${group.mmpName}-${group.month}-${group.siteName}-${idx}`} className="rounded-md border border-border p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{group.siteName}</p>
                          <p className="text-xs text-muted-foreground truncate">{group.mmpName}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">
                            {safeFormatDate(`${group.month}-01`, 'MMMM yyyy', group.month)}
                          </Badge>
                          <Badge variant="secondary">{group.photos.length} photos</Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {group.photos.map((photo) => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => handleViewDocument(photo)}
                            className="group rounded-md border border-border overflow-hidden text-left"
                            data-testid={`site-photo-thumb-${photo.id}`}
                          >
                            <img
                              src={photo.fileUrl}
                              alt={photo.fileName}
                              className="w-full h-24 object-cover group-hover:opacity-90 transition-opacity"
                              loading="lazy"
                            />
                            <div className="p-2">
                              <p className="text-[11px] text-muted-foreground truncate">{photo.fileName}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* When an MMP is selected, show completed sites for that MMP with attached photos */}
          {mmpFilter !== 'all' && siteGroupsForSelectedMmp.length > 0 && (
            <Card className="border-border mb-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Sites for {selectedMmpName}</h3>
                    <p className="text-xs text-muted-foreground">Completed sites with attached photos</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {siteGroupsForSelectedMmp.map((group) => (
                    <div key={group.siteName} className="rounded-md border border-border p-3">
                        <div className="flex items-center justify-between mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{group.siteName}</p>
                          <p className="text-xs text-muted-foreground">{group.photos.length} photos • {group.lastVisited ? formatDistanceToNow(new Date(group.lastVisited), { addSuffix: true }) : 'No recent visit'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {group.photos.map(photo => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => handleViewDocument(photo)}
                            className="group rounded-md border border-border overflow-hidden text-left"
                          >
                            <img
                              src={photo.fileUrl}
                              alt={photo.fileName}
                              className="w-full h-24 object-cover group-hover:opacity-90 transition-opacity"
                              loading="lazy"
                            />
                            <div className="p-2">
                              <p className="text-[11px] text-muted-foreground truncate">{photo.fileName}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, project, index number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-documents"
                  />
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {/* MMP Selector: choose an MMP first, then choose permit type */}
                  <Select value={mmpFilter} onValueChange={(v) => { setMmpFilter(v); setPermitTypeFilter('all'); }}>
                    <SelectTrigger className="w-[220px]" data-testid="select-mmp-filter">
                      <SelectValue placeholder="All MMPs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All MMPs</SelectItem>
                      {availableMmps.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Permit type selector: show for Permits tab or when MMP is selected */}
                  {(activeTab === 'permits' || mmpFilter !== 'all') && (
                    (() => {
                      // Count permits by type for the currently selected MMP (or all MMPs if no MMP selected)
                      const docsToCount = mmpFilter !== 'all' 
                        ? documents.filter(d => d.mmpId === mmpFilter && d.category.includes('permit'))
                        : documents.filter(d => d.category.includes('permit'));
                      
                      const fed = docsToCount.filter(d => d.category === 'federal_permit').length;
                      const st = docsToCount.filter(d => d.category === 'state_permit').length;
                      const loc = docsToCount.filter(d => d.category === 'local_permit').length;
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Type:</span>
                          <Select value={permitTypeFilter} onValueChange={setPermitTypeFilter}>
                            <SelectTrigger className="w-[170px]" data-testid="select-permit-type-filter">
                              <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All ({fed + st + loc})</SelectItem>
                              {fed > 0 && <SelectItem value="federal">Federal ({fed})</SelectItem>}
                              {st > 0 && <SelectItem value="state">State ({st})</SelectItem>}
                              {loc > 0 && <SelectItem value="local">Local ({loc})</SelectItem>}
                            </SelectContent>
                          </Select>
                          {permitTypeFilter !== 'all' && (
                            <Badge variant="secondary" className="ml-1">
                              {permitTypeFilter}
                            </Badge>
                          )}
                        </div>
                      );
                    })()
                  )}

                  {/* Category selector hidden when a permit-type is chosen */}
                  {permitTypeFilter === 'all' && (
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[150px]" data-testid="select-category-filter">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="mmp_file">MMP File</SelectItem>
                        <SelectItem value="federal_permit">Federal Permit</SelectItem>
                        <SelectItem value="state_permit">State Permit</SelectItem>
                        <SelectItem value="local_permit">Local Permit</SelectItem>
                        <SelectItem value="cost_receipt">Cost Receipt</SelectItem>
                        <SelectItem value="transaction_receipt">Transaction Receipt</SelectItem>
                        <SelectItem value="site_visit_photo">Site Visit Photo</SelectItem>
                        <SelectItem value="report">Report</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Advanced Filters Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-advanced-filters">
                        <Filter className="h-4 w-4 mr-2" />
                        Filters
                        {advancedFiltersCount > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {advancedFiltersCount}
                          </Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Advanced Filters</h4>
                          {activeAdvancedFiltersCount > 0 && (
                            <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="button-reset-filters">
                              <X className="h-3 w-3 mr-1" />
                              Reset
                            </Button>
                          )}
                        </div>
                        
                        {/* Project Filter */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            Project
                          </label>
                          <Select value={projectFilter} onValueChange={setProjectFilter}>
                            <SelectTrigger data-testid="select-project-filter">
                              <SelectValue placeholder="All Projects" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Projects</SelectItem>
                              {projects.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Month Filter */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Month
                          </label>
                          <Select value={monthFilter} onValueChange={setMonthFilter}>
                            <SelectTrigger data-testid="select-month-filter">
                              <SelectValue placeholder="All Months" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Months</SelectItem>
                              {availableMonths.map(m => (
                                <SelectItem key={m} value={m}>
                                  {safeFormatDate(`${m}-01`, 'MMMM yyyy', m)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* State Filter */}
                        {availableStates.length > 0 && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              State
                            </label>
                            <Select value={stateFilter} onValueChange={setStateFilter}>
                              <SelectTrigger data-testid="select-state-filter">
                                <SelectValue placeholder="All States" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All States</SelectItem>
                                {availableStates.map(s => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {/* Locality Filter */}
                        {availableLocalities.length > 0 && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              Locality
                            </label>
                            <Select value={localityFilter} onValueChange={setLocalityFilter}>
                              <SelectTrigger data-testid="select-locality-filter">
                                <SelectValue placeholder="All Localities" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Localities</SelectItem>
                                {availableLocalities.map(l => (
                                  <SelectItem key={l} value={l}>{l}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Sort buttons */}
              <div className="flex items-center gap-1 mt-3 flex-wrap">
                <span className="text-xs text-muted-foreground mr-2">Sort by:</span>
                <SortButton field="indexNo" label="Index" />
                <SortButton field="fileName" label="Name" />
                <SortButton field="uploadedAt" label="Date" />
                <SortButton field="category" label="Category" />
              </div>
            </CardHeader>
            <CardContent>
              {filteredDocuments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-medium">No documents found</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    {searchTerm || categoryFilter !== 'all' || statusFilter !== 'all' 
                      ? 'Try adjusting your filters' 
                      : 'Documents will appear here when uploaded. If you have uploaded documents, try syncing the index.'}
                  </p>
                  {!searchTerm && categoryFilter === 'all' && statusFilter === 'all' && (
                    <Button 
                      variant="outline" 
                      onClick={handleSyncDocuments}
                      disabled={syncing}
                      data-testid="button-sync-empty"
                    >
                      {syncing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Database className="h-4 w-4 mr-2" />
                          Rebuild Document Index
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDocuments.map((doc) => {
                    const IconComponent = categoryIcons[doc.category] || FileText;
                    const colorClass = categoryColors[doc.category] || categoryColors.other;
                    
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-md border border-border hover-elevate cursor-pointer"
                        onClick={() => handleViewDocument(doc)}
                        data-testid={`document-row-${doc.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Index Number */}
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-mono font-medium text-muted-foreground">
                              {doc.indexNo}
                            </span>
                          </div>
                          
                          {/* Category Icon */}
                          <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${colorClass.split(' ')[0]}`}>
                            <IconComponent className={`h-5 w-5 ${colorClass.split(' ').slice(1).join(' ')}`} />
                          </div>
                          
                          {/* Document Info */}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{doc.fileName}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                              <Badge variant="outline" className="text-xs py-0 h-5">
                                {categoryLabels[doc.category] || doc.category}
                              </Badge>
                              {doc.projectName && (
                                <span className="truncate max-w-[120px]">{doc.projectName}</span>
                              )}
                              {doc.siteName && (
                                <span className="flex items-center gap-1">
                                  <Home className="h-3 w-3" />
                                  {doc.siteName}
                                </span>
                              )}
                              {doc.state && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {doc.state}
                                </span>
                              )}
                              {doc.locality && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {doc.locality}
                                </span>
                              )}
                              <span className="flex items-center gap-1" title={format(new Date(doc.uploadedAt), 'PPpp')}>
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(doc.uploadedAt), { addSuffix: true })}
                              </span>
                            </div>
                            {/* Quick links to related pages */}
                            <div className="flex items-center gap-2 mt-1">
                              {doc.siteVisitId && (
                                <Link 
                                  to={`/site-visits/${doc.siteVisitId}`}
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`link-site-visit-${doc.id}`}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View Site Visit
                                </Link>
                              )}
                              {doc.mmpName && doc.id.startsWith('mmp-') && (
                                <Link 
                                  to={`/mmp/${doc.id.replace('mmp-', '')}/view`}
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`link-mmp-${doc.id}`}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View MMP
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Status and Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={getStatusBadgeVariant(doc.status)}>
                            {doc.status || 'pending'}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => { e.stopPropagation(); handleViewDocument(doc); }}
                            data-testid={`button-view-${doc.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Lazy load trigger */}
              {useLazyLoad && hasMoreToLoad && (
                <div ref={sentinelRef} className="py-4 flex justify-center">
                  {loadingMore ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more...
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={loadMore} data-testid="button-load-more">
                      Load More ({allFilteredDocuments.length - visibleCount} remaining)
                    </Button>
                  )}
                </div>
              )}

              {/* Pagination Controls */}
              {!useLazyLoad && allFilteredDocuments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    {/* Page size selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Show:</span>
                      <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                        <SelectTrigger className="w-[80px]" data-testid="select-page-size">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map(size => (
                            <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">per page</span>
                      
                      {/* Toggle lazy load */}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setUseLazyLoad(!useLazyLoad)}
                        className="ml-2 text-xs"
                        data-testid="button-toggle-lazy-load"
                      >
                        {useLazyLoad ? 'Use Pages' : 'Use Scroll'}
                      </Button>
                    </div>
                    
                    {/* Page navigation */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => goToPage(1)}
                        disabled={currentPage === 1}
                        data-testid="button-first-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <ChevronLeft className="h-4 w-4 -ml-2" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      
                      <div className="flex items-center gap-1 px-2">
                        <span className="text-sm font-medium">{currentPage}</span>
                        <span className="text-sm text-muted-foreground">of</span>
                        <span className="text-sm font-medium">{totalPages || 1}</span>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => goToPage(totalPages)}
                        disabled={currentPage >= totalPages}
                        data-testid="button-last-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                        <ChevronRight className="h-4 w-4 -ml-2" />
                      </Button>
                    </div>
                    
                    {/* Results summary */}
                    <p className="text-sm text-muted-foreground">
                      {(() => {
                        const categoryLabel = {
                          all: 'Documents',
                          mmp: 'MMP Files',
                          permits: permitTypeFilter !== 'all' ? `${permitTypeFilter.charAt(0).toUpperCase() + permitTypeFilter.slice(1)} Permits` : 'Permits',
                          receipts: 'Receipts',
                          site_photos: 'Site Photos'
                        }[activeTab] || 'Documents';
                        
                        const showing = `Showing ${startIndex + 1}-${Math.min(endIndex, allFilteredDocuments.length)} of ${allFilteredDocuments.length} ${categoryLabel}`;
                        const total = allFilteredDocuments.length !== documents.length ? ` (${documents.length} total documents)` : '';
                        return showing + total;
                      })()}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Lazy load results summary */}
              {useLazyLoad && filteredDocuments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setUseLazyLoad(false)}
                      className="text-xs"
                      data-testid="button-switch-to-pages"
                    >
                      Switch to Pages
                    </Button>
                    <p className="text-sm text-muted-foreground text-center">
                      Showing {filteredDocuments.length} of {allFilteredDocuments.length} documents
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DocumentsPage;
