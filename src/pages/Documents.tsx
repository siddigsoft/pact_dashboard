import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Filter, Download, Eye, Calendar, MapPin, Building2, FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Document {
  id: string;
  fileName: string;
  fileUrl: string;
  category: 'federal_permit' | 'state_permit' | 'local_permit' | 'receipt' | 'report' | 'other';
  uploadedAt: string;
  uploadedBy?: string;
  state?: string;
  locality?: string;
  projectName?: string;
  mmpName?: string;
  issueDate?: string;
  expiryDate?: string;
  status?: 'pending' | 'verified' | 'rejected';
  verified?: boolean;
}

const categoryLabels: Record<string, string> = {
  federal_permit: 'Federal Permit',
  state_permit: 'State Permit',
  local_permit: 'Local Permit',
  receipt: 'Receipt',
  report: 'Report',
  other: 'Other'
};

const DocumentsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data: mmpFiles, error } = await supabase
        .from('mmp_files')
        .select('id, filename, permits, project_id, projects(name)')
        .not('permits', 'is', null);

      if (error) throw error;

      const docs: Document[] = [];
      
      mmpFiles?.forEach((mmp: any) => {
        const permits = mmp.permits || {};
        const projectName = mmp.projects?.name || 'Unknown Project';
        
        if (permits.documents) {
          permits.documents.forEach((doc: any, idx: number) => {
            docs.push({
              id: `${mmp.id}-doc-${idx}`,
              fileName: doc.fileName || 'Unknown',
              fileUrl: doc.fileUrl || '',
              category: doc.type === 'federal' ? 'federal_permit' : 'other',
              uploadedAt: doc.uploadedAt || new Date().toISOString(),
              projectName,
              mmpName: mmp.filename,
              verified: doc.validated || false,
              status: doc.validated ? 'verified' : 'pending'
            });
          });
        }

        if (permits.statePermits) {
          permits.statePermits.forEach((sp: any) => {
            sp.documents?.forEach((doc: any, idx: number) => {
              docs.push({
                id: `${mmp.id}-state-${sp.stateName}-${idx}`,
                fileName: doc.fileName || 'Unknown',
                fileUrl: doc.fileUrl || '',
                category: 'state_permit',
                uploadedAt: doc.uploadedAt || new Date().toISOString(),
                state: sp.stateName,
                projectName,
                mmpName: mmp.filename,
                issueDate: doc.issueDate,
                expiryDate: doc.expiryDate,
                verified: doc.validated || sp.verified || false,
                status: doc.status || (sp.verified ? 'verified' : 'pending')
              });
            });
          });
        }

        if (permits.localPermits) {
          permits.localPermits.forEach((lp: any) => {
            lp.documents?.forEach((doc: any, idx: number) => {
              docs.push({
                id: `${mmp.id}-local-${lp.localityName}-${idx}`,
                fileName: doc.fileName || 'Unknown',
                fileUrl: doc.fileUrl || '',
                category: 'local_permit',
                uploadedAt: doc.uploadedAt || new Date().toISOString(),
                locality: lp.localityName,
                projectName,
                mmpName: mmp.filename,
                issueDate: doc.issueDate,
                expiryDate: doc.expiryDate,
                verified: doc.validated || lp.verified || false,
                status: doc.status || (lp.verified ? 'verified' : 'pending')
              });
            });
          });
        }

        if (Array.isArray(permits.localityPermits)) {
          permits.localityPermits.forEach((lp: any, idx: number) => {
            docs.push({
              id: `${mmp.id}-locality-${idx}`,
              fileName: lp.fileName || 'Unknown',
              fileUrl: lp.fileUrl || '',
              category: 'local_permit',
              uploadedAt: lp.uploadedAt || new Date().toISOString(),
              state: lp.state,
              locality: lp.locality,
              projectName,
              mmpName: mmp.filename,
              issueDate: lp.issueDate,
              expiryDate: lp.expiryDate,
              verified: lp.verified || false,
              status: lp.verified ? 'verified' : 'pending'
            });
          });
        }
      });

      docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
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
    fetchDocuments();
  }, []);

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchesSearch = searchTerm === '' || 
        doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.locality?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
      
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [documents, searchTerm, categoryFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: documents.length,
    permits: documents.filter(d => d.category.includes('permit')).length,
    verified: documents.filter(d => d.verified).length,
    pending: documents.filter(d => !d.verified).length
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

  const getStatusBadgeVariant = (status?: string) => {
    switch (status) {
      case 'verified': return 'default';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 md:p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
            <FolderOpen className="h-5 w-5 text-white dark:text-black" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Documents</h1>
            <p className="text-sm text-muted-foreground">
              View and manage all uploaded documents
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDocuments} data-testid="button-refresh-documents">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Documents</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Permits</p>
                <p className="text-2xl font-bold">{stats.permits}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Verified</p>
                <p className="text-2xl font-bold">{stats.verified}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-documents"
              />
            </div>
            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-category-filter">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="federal_permit">Federal Permit</SelectItem>
                  <SelectItem value="state_permit">State Permit</SelectItem>
                  <SelectItem value="local_permit">Local Permit</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-md border border-border hover-elevate cursor-pointer"
                  onClick={() => handleViewDocument(doc)}
                  data-testid={`document-row-${doc.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span>{categoryLabels[doc.category] || doc.category}</span>
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
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={getStatusBadgeVariant(doc.status)}>
                      {doc.status || 'pending'}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleViewDocument(doc); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentsPage;
