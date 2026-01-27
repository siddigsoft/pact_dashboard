import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  Download, 
  Upload, 
  Cloud, 
  CloudOff,
  Smartphone,
  Search,
  RefreshCw,
  Check,
  AlertTriangle,
  Folder,
  Image,
  File
} from 'lucide-react';

interface SyncedDocument {
  id: string;
  user_id: string;
  name: string;
  file_type: string;
  file_size: number;
  sync_status: 'synced' | 'pending' | 'failed' | 'uploading';
  last_synced_at: string;
  created_at: string;
  device_id?: string;
  user_name?: string;
  storage_path?: string;
  version: number;
}

export default function MobileDocumentSync() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading, refetch } = useQuery({
    queryKey: ['synced-documents', statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('mobile_documents')
        .select(`
          *,
          profiles:user_id (full_name)
        `)
        .order('last_synced_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('sync_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        user_name: d.profiles?.full_name || 'Unknown',
      }));
    },
  });

  const retrySyncMutation = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase
        .from('mobile_documents')
        .update({ sync_status: 'pending' })
        .eq('id', docId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synced-documents'] });
      toast({ title: 'Sync queued', description: 'Document will be synced shortly.' });
    },
  });

  const filteredDocuments = documents.filter((d: SyncedDocument) => {
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.user_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || d.file_type.includes(typeFilter);
    return matchesSearch && matchesType;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <Image className="w-4 h-4" />;
    if (fileType.includes('pdf')) return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'synced': return <Cloud className="w-4 h-4 text-green-500" />;
      case 'pending': return <Upload className="w-4 h-4 text-yellow-500" />;
      case 'failed': return <CloudOff className="w-4 h-4 text-red-500" />;
      case 'uploading': return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <Cloud className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      case 'uploading': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const stats = {
    total: documents.length,
    synced: documents.filter((d: SyncedDocument) => d.sync_status === 'synced').length,
    pending: documents.filter((d: SyncedDocument) => d.sync_status === 'pending' || d.sync_status === 'uploading').length,
    failed: documents.filter((d: SyncedDocument) => d.sync_status === 'failed').length,
    totalSize: documents.reduce((acc: number, d: SyncedDocument) => acc + d.file_size, 0),
  };

  const syncProgress = stats.total > 0 ? (stats.synced / stats.total) * 100 : 0;

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="mobile-document-sync-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Document Sync</h1>
          <p className="text-muted-foreground">Monitor documents synced from mobile devices</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">Sync Progress</p>
              <p className="text-2xl font-bold">{stats.synced} / {stats.total} documents</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Storage</p>
              <p className="text-lg font-medium">{formatFileSize(stats.totalSize)}</p>
            </div>
          </div>
          <Progress value={syncProgress} className="h-2" data-testid="progress-sync" />
          <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
            <span>{syncProgress.toFixed(0)}% synced</span>
            {stats.failed > 0 && (
              <span className="text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {stats.failed} failed
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total">
          <CardContent className="p-4 flex items-center gap-4">
            <Folder className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total Documents</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-synced">
          <CardContent className="p-4 flex items-center gap-4">
            <Check className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{stats.synced}</p>
              <p className="text-sm text-muted-foreground">Synced</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-pending">
          <CardContent className="p-4 flex items-center gap-4">
            <Upload className="w-8 h-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-failed">
          <CardContent className="p-4 flex items-center gap-4">
            <CloudOff className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{stats.failed}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="synced">Synced</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="uploading">Uploading</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
            <SelectValue placeholder="File Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="pdf">PDFs</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p>Loading documents...</p>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No synced documents found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc: SyncedDocument) => (
            <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    {getFileIcon(doc.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{doc.name}</p>
                      <Badge className={getStatusColor(doc.sync_status)} variant="secondary">
                        {getStatusIcon(doc.sync_status)}
                        <span className="ml-1">{doc.sync_status}</span>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Smartphone className="w-3 h-3" />
                        {doc.user_name}
                      </span>
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>v{doc.version}</span>
                      <span>Last synced: {new Date(doc.last_synced_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.sync_status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retrySyncMutation.mutate(doc.id)}
                        disabled={retrySyncMutation.isPending}
                        data-testid={`button-retry-${doc.id}`}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Retry
                      </Button>
                    )}
                    {doc.sync_status === 'synced' && doc.storage_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          window.open(doc.storage_path, '_blank');
                        }}
                        data-testid={`button-download-${doc.id}`}
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
