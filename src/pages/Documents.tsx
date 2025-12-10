import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FileText, Search, Download, Eye, Calendar, MapPin, Building2, 
  FolderOpen, RefreshCw, FileSpreadsheet, Receipt, Shield, Hash,
  ArrowUpDown, ChevronDown, ChevronUp, File, Image, Folder,
  ExternalLink, History, Clock, Wallet, Filter, X, PenLine,
  Briefcase, Home
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO, isValid } from 'date-fns';

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

const DocumentsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('uploadedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [activeTab, setActiveTab] = useState('all');
  
  // New advanced filters
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [hubFilter, setHubFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [hasSignatureFilter, setHasSignatureFilter] = useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Filter options data
  const [projects, setProjects] = useState<Project[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [availableStates, setAvailableStates] = useState<string[]>([]);

  // Fetch filter options (projects, hubs, etc.)
  const fetchFilterOptions = async () => {
    try {
      // Fetch projects
      const { data: projectsData } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');
      
      setProjects(projectsData || []);
      
      // Fetch hubs
      const { data: hubsData } = await supabase
        .from('hubs')
        .select('id, name')
        .order('name');
      
      setHubs(hubsData || []);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const docs: Document[] = [];
      let indexCounter = 1;
      const monthsSet = new Set<string>();
      const statesSet = new Set<string>();

      // 1. Fetch MMP Files (the CSV uploads themselves)
      try {
        const { data: mmpFiles, error: mmpError } = await supabase
          .from('mmp_files')
          .select('id, filename, file_url, created_at, updated_at, permits, project_id, status, uploaded_by, projects(name)')
          .order('created_at', { ascending: false });

        if (mmpError) {
          console.warn('MMP files fetch error:', mmpError);
        }

        (mmpFiles || []).forEach((mmp: any) => {
          if (!mmp) return;
          const projectName = mmp.projects?.name || 'Unknown Project';
          const monthBucket = safeFormatDate(mmp.created_at, 'yyyy-MM');
          if (monthBucket) monthsSet.add(monthBucket);
          
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
            monthBucket,
            status: mmp.status === 'approved' ? 'approved' : mmp.status === 'rejected' ? 'rejected' : 'pending',
            verified: mmp.status === 'approved',
            sourceType: 'mmp'
          });

          // Extract permit documents
          const permits = mmp.permits || {};
          
          // Federal permits
          if (Array.isArray(permits.documents)) {
            permits.documents.forEach((doc: any, idx: number) => {
              if (!doc) return;
              const docMonth = safeFormatDate(doc.uploadedAt, 'yyyy-MM', monthBucket);
              if (docMonth) monthsSet.add(docMonth);
              
              docs.push({
                id: `${mmp.id}-fed-${idx}`,
                indexNo: indexCounter++,
                fileName: doc.fileName || 'Federal Permit',
                fileUrl: doc.fileUrl || '',
                category: 'federal_permit',
                uploadedAt: doc.uploadedAt || mmp.created_at || new Date().toISOString(),
                projectId: mmp.project_id,
                projectName,
                mmpName: mmp.filename,
                monthBucket: docMonth,
                verified: doc.validated || false,
                status: doc.validated ? 'verified' : 'pending',
                sourceType: 'permit'
              });
            });
          }

          // State permits
          if (Array.isArray(permits.statePermits)) {
            permits.statePermits.forEach((sp: any) => {
              if (!sp) return;
              if (sp.stateName) statesSet.add(sp.stateName);
              
              (Array.isArray(sp.documents) ? sp.documents : []).forEach((doc: any, idx: number) => {
                if (!doc) return;
                const docMonth = safeFormatDate(doc.uploadedAt, 'yyyy-MM', monthBucket);
                if (docMonth) monthsSet.add(docMonth);
                
                docs.push({
                  id: `${mmp.id}-state-${sp.stateName}-${idx}`,
                  indexNo: indexCounter++,
                  fileName: doc.fileName || `State Permit - ${sp.stateName}`,
                  fileUrl: doc.fileUrl || '',
                  category: 'state_permit',
                  uploadedAt: doc.uploadedAt || mmp.created_at || new Date().toISOString(),
                  state: sp.stateName,
                  projectId: mmp.project_id,
                  projectName,
                  mmpName: mmp.filename,
                  monthBucket: docMonth,
                  issueDate: doc.issueDate,
                  expiryDate: doc.expiryDate,
                  verified: doc.validated || sp.verified || false,
                  status: doc.status || (sp.verified ? 'verified' : 'pending'),
                  sourceType: 'permit'
                });
              });
            });
          }

          // Local permits
          if (Array.isArray(permits.localPermits)) {
            permits.localPermits.forEach((lp: any) => {
              if (!lp) return;
              if (lp.state) statesSet.add(lp.state);
              
              (Array.isArray(lp.documents) ? lp.documents : []).forEach((doc: any, idx: number) => {
                if (!doc) return;
                const docMonth = safeFormatDate(doc.uploadedAt, 'yyyy-MM', monthBucket);
                if (docMonth) monthsSet.add(docMonth);
                
                docs.push({
                  id: `${mmp.id}-local-${lp.localityName}-${idx}`,
                  indexNo: indexCounter++,
                  fileName: doc.fileName || `Local Permit - ${lp.localityName}`,
                  fileUrl: doc.fileUrl || '',
                  category: 'local_permit',
                  uploadedAt: doc.uploadedAt || mmp.created_at || new Date().toISOString(),
                  state: lp.state,
                  locality: lp.localityName,
                  projectId: mmp.project_id,
                  projectName,
                  mmpName: mmp.filename,
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
              if (lp.state) statesSet.add(lp.state);
              const docMonth = safeFormatDate(lp.uploadedAt, 'yyyy-MM', monthBucket);
              if (docMonth) monthsSet.add(docMonth);
              
              docs.push({
                id: `${mmp.id}-locality-${idx}`,
                indexNo: indexCounter++,
                fileName: lp.fileName || `Locality Permit`,
                fileUrl: lp.fileUrl || '',
                category: 'local_permit',
                uploadedAt: lp.uploadedAt || mmp.created_at || new Date().toISOString(),
                state: lp.state,
                locality: lp.locality,
                projectId: mmp.project_id,
                projectName,
                mmpName: mmp.filename,
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

      // 2. Fetch Cost Submission Receipts
      const { data: costSubmissions, error: costError } = await supabase
        .from('cost_submissions')
        .select('id, receipt_url, receipt_filename, amount, created_at, status, site_visit_id, documents, project_id, projects(name)')
        .order('created_at', { ascending: false });

      if (!costError && costSubmissions) {
        (costSubmissions || []).forEach((cost: any) => {
          if (!cost) return;
          const costMonth = safeFormatDate(cost.created_at, 'yyyy-MM');
          if (costMonth) monthsSet.add(costMonth);
          const projectName = cost.projects?.name;
          
          // Add main receipt if exists
          if (cost.receipt_url) {
            docs.push({
              id: `cost-${cost.id}`,
              indexNo: indexCounter++,
              fileName: cost.receipt_filename || `Receipt - ${cost.amount ? `SDG ${cost.amount}` : 'Cost Submission'}`,
              fileUrl: cost.receipt_url,
              category: 'cost_receipt',
              uploadedAt: cost.created_at || new Date().toISOString(),
              projectId: cost.project_id,
              projectName,
              siteVisitId: cost.site_visit_id,
              monthBucket: costMonth,
              status: cost.status === 'approved' ? 'approved' : cost.status === 'rejected' ? 'rejected' : 'pending',
              verified: cost.status === 'approved',
              sourceType: 'cost'
            });
          }
          // Add any additional documents from the documents JSON field
          if (cost.documents && Array.isArray(cost.documents)) {
            cost.documents.forEach((doc: any, idx: number) => {
              if (!doc) return;
              if (doc.fileUrl || doc.url) {
                const docMonth = safeFormatDate(doc.uploadedAt, 'yyyy-MM', costMonth);
                if (docMonth) monthsSet.add(docMonth);
                
                docs.push({
                  id: `cost-doc-${cost.id}-${idx}`,
                  indexNo: indexCounter++,
                  fileName: doc.fileName || doc.name || `Cost Document ${idx + 1}`,
                  fileUrl: doc.fileUrl || doc.url || '',
                  category: 'cost_receipt',
                  uploadedAt: doc.uploadedAt || cost.created_at || new Date().toISOString(),
                  projectId: cost.project_id,
                  projectName,
                  siteVisitId: cost.site_visit_id,
                  monthBucket: docMonth,
                  status: cost.status === 'approved' ? 'approved' : cost.status === 'rejected' ? 'rejected' : 'pending',
                  verified: cost.status === 'approved',
                  sourceType: 'cost'
                });
              }
            });
          }
        });
      }

      // 3. Fetch Report Photos (site visit attachments)
      try {
        const { data: reportPhotos, error: photoError } = await supabase
          .from('report_photos')
          .select('id, photo_url, caption, created_at, site_visit_id')
          .order('created_at', { ascending: false });

        if (!photoError && reportPhotos) {
          (reportPhotos || []).forEach((photo: any) => {
            if (!photo) return;
            if (photo.photo_url) {
              const photoMonth = safeFormatDate(photo.created_at, 'yyyy-MM');
              if (photoMonth) monthsSet.add(photoMonth);
              
              docs.push({
                id: `photo-${photo.id}`,
                indexNo: indexCounter++,
                fileName: photo.caption || `Site Visit Photo`,
                fileUrl: photo.photo_url,
                category: 'site_visit_photo',
                uploadedAt: photo.created_at || new Date().toISOString(),
                siteVisitId: photo.site_visit_id,
                monthBucket: photoMonth,
                status: 'verified',
                verified: true,
                sourceType: 'site_visit'
              });
            }
          });
        }
      } catch (photoErr) {
        console.log('Report photos table may not exist:', photoErr);
      }

      // Sort by upload date (newest first) and reassign index numbers
      docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      docs.forEach((doc, idx) => {
        doc.indexNo = idx + 1;
      });

      // Set available months and states for filters
      setAvailableMonths(Array.from(monthsSet).sort((a, b) => b.localeCompare(a)));
      setAvailableStates(Array.from(statesSet).sort());

      setDocuments(docs);
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

  useEffect(() => {
    // Fetch filter options first, then documents
    const loadData = async () => {
      await fetchFilterOptions();
      await fetchDocuments();
    };
    loadData();
  }, []);

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
    setHasSignatureFilter('all');
  };

  // Count active advanced filters
  const activeAdvancedFiltersCount = [
    projectFilter !== 'all',
    monthFilter !== 'all',
    stateFilter !== 'all'
  ].filter(Boolean).length;

  const filteredDocuments = useMemo(() => {
    let filtered = documents.filter(doc => {
      const matchesSearch = searchTerm === '' || 
        doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      
      // Tab filtering
      const matchesTab = activeTab === 'all' || 
        (activeTab === 'mmp' && doc.category === 'mmp_file') ||
        (activeTab === 'permits' && doc.category.includes('permit')) ||
        (activeTab === 'receipts' && (doc.category === 'cost_receipt' || doc.category === 'transaction_receipt'));
      
      return matchesSearch && matchesCategory && matchesStatus && matchesSource && 
        matchesProject && matchesMonth && matchesState && matchesTab;
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

  const stats = useMemo(() => ({
    total: documents.length,
    mmpFiles: documents.filter(d => d.category === 'mmp_file').length,
    permits: documents.filter(d => d.category.includes('permit')).length,
    receipts: documents.filter(d => d.category === 'cost_receipt').length,
    verified: documents.filter(d => d.verified || d.status === 'approved').length,
    pending: documents.filter(d => d.status === 'pending').length
  }), [documents]);

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
          <Button variant="outline" size="sm" onClick={fetchDocuments} data-testid="button-refresh-documents">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all" data-testid="tab-all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="mmp" data-testid="tab-mmp">MMP Files ({stats.mmpFiles})</TabsTrigger>
          <TabsTrigger value="permits" data-testid="tab-permits">Permits ({stats.permits})</TabsTrigger>
          <TabsTrigger value="receipts" data-testid="tab-receipts">Receipts ({stats.receipts})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
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
                        {activeAdvancedFiltersCount > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {activeAdvancedFiltersCount}
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
                  <p className="text-muted-foreground">No documents found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {searchTerm || categoryFilter !== 'all' || statusFilter !== 'all' 
                      ? 'Try adjusting your filters' 
                      : 'Documents will appear here when uploaded'}
                  </p>
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

              {/* Results summary */}
              {filteredDocuments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground text-center">
                    Showing {filteredDocuments.length} of {documents.length} documents
                  </p>
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
