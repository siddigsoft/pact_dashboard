import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  Download, 
  Upload, 
  Cloud, 
  CloudOff,
  Search,
  RefreshCw,
  Check,
  AlertTriangle,
  Folder,
  HardDrive,
  Clock,
  User,
  RotateCcw,
  ExternalLink,
  FileImage,
  FileType,
  Zap,
  Database
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
}

export default function MobileDocumentSync() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading, refetch } = useQuery({
    queryKey: ['synced-documents', statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('mobile_documents')
        .select(`
          id,
          user_id,
          document_name,
          document_type,
          file_path,
          file_size,
          sync_status,
          last_synced_at,
          device_id,
          created_at,
          profiles:user_id (full_name)
        `)
        .order('last_synced_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('sync_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).map((d: any) => ({
        id: d.id,
        user_id: d.user_id,
        name: d.document_name || 'Unnamed Document',
        file_type: d.document_type || 'unknown',
        file_size: d.file_size || 0,
        sync_status: d.sync_status || 'pending',
        last_synced_at: d.last_synced_at || d.created_at,
        created_at: d.created_at,
        device_id: d.device_id,
        storage_path: d.file_path,
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

  const getFilteredDocuments = () => {
    let filtered = documents.filter((d: SyncedDocument) => {
      const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.user_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || d.file_type.includes(typeFilter);
      return matchesSearch && matchesType;
    });
    
    if (activeTab !== 'all') {
      filtered = filtered.filter((d: SyncedDocument) => d.sync_status === activeTab);
    }
    
    return filtered;
  };

  const filteredDocuments = getFilteredDocuments();

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return FileImage;
    if (fileType.includes('pdf')) return FileText;
    return FileType;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'synced': return { icon: Cloud, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', bgColor: 'bg-emerald-500', label: 'Synced' };
      case 'pending': return { icon: Clock, color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', bgColor: 'bg-amber-500', label: 'Pending' };
      case 'failed': return { icon: CloudOff, color: 'bg-red-500/10 text-red-600 border-red-500/20', bgColor: 'bg-red-500', label: 'Failed' };
      case 'uploading': return { icon: Upload, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', bgColor: 'bg-blue-500', label: 'Uploading' };
      default: return { icon: Cloud, color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', bgColor: 'bg-gray-500', label: status };
    }
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const stats = {
    total: documents.length,
    synced: documents.filter((d: SyncedDocument) => d.sync_status === 'synced').length,
    pending: documents.filter((d: SyncedDocument) => d.sync_status === 'pending' || d.sync_status === 'uploading').length,
    failed: documents.filter((d: SyncedDocument) => d.sync_status === 'failed').length,
    totalSize: documents.reduce((acc: number, d: SyncedDocument) => acc + d.file_size, 0),
    images: documents.filter((d: SyncedDocument) => d.file_type.includes('image')).length,
    pdfs: documents.filter((d: SyncedDocument) => d.file_type.includes('pdf')).length,
  };

  const syncProgress = stats.total > 0 ? (stats.synced / stats.total) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20" data-testid="mobile-document-sync-page">
      <div className="bg-gradient-to-r from-indigo-600 via-blue-700 to-cyan-800 text-white">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                  <Database className="w-6 h-6" />
                </div>
                <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Document Sync</h1>
              </div>
              <p className="text-indigo-100">Monitor and manage document synchronization from mobile devices</p>
            </div>
            <Button onClick={() => refetch()} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-0" data-testid="button-refresh">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <Card className="mt-6 bg-white/10 border-white/10 backdrop-blur-sm text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-xl">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm text-indigo-100">Sync Progress</p>
                    <p className="text-2xl font-bold">{stats.synced} / {stats.total} documents</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-indigo-100">Total Storage Used</p>
                  <p className="text-xl font-bold">{formatFileSize(stats.totalSize)}</p>
                </div>
              </div>
              <div className="relative">
                <Progress value={syncProgress} className="h-3 bg-white/20" data-testid="progress-sync" />
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span className="text-indigo-100">{syncProgress.toFixed(0)}% synced</span>
                  {stats.failed > 0 && (
                    <span className="text-red-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {stats.failed} failed
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <Folder className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-indigo-100">Total</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.synced}</p>
                  <p className="text-xs text-indigo-100">Synced</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Upload className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-indigo-100">Pending</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <CloudOff className="w-5 h-5 text-red-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.failed}</p>
                  <p className="text-xs text-indigo-100">Failed</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-pink-500/20 rounded-lg">
                  <FileImage className="w-5 h-5 text-pink-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.images}</p>
                  <p className="text-xs text-indigo-100">Images</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <FileText className="w-5 h-5 text-orange-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pdfs}</p>
                  <p className="text-xs text-indigo-100">PDFs</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[280px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search documents by name or user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
                data-testid="input-search"
              />
            </div>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px] h-11" data-testid="select-type-filter">
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="all" className="data-[state=active]:bg-background">
              All ({stats.total})
            </TabsTrigger>
            <TabsTrigger value="synced" className="data-[state=active]:bg-background">
              Synced ({stats.synced})
            </TabsTrigger>
            <TabsTrigger value="pending" className="data-[state=active]:bg-background">
              Pending ({stats.pending})
            </TabsTrigger>
            <TabsTrigger value="failed" className="data-[state=active]:bg-background">
              Failed ({stats.failed})
            </TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredDocuments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-16 text-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Folder className="w-8 h-8 opacity-50" />
                </div>
                <p className="font-medium mb-1">No documents found</p>
                <p className="text-sm">Documents synced from mobile devices will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredDocuments.map((doc: SyncedDocument) => {
                const statusConfig = getStatusConfig(doc.sync_status);
                const StatusIcon = statusConfig.icon;
                const FileIcon = getFileIcon(doc.file_type);
                
                return (
                  <Card key={doc.id} className="group hover:shadow-md transition-all" data-testid={`card-document-${doc.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl ${doc.file_type.includes('image') ? 'bg-pink-500/10' : 'bg-blue-500/10'} flex items-center justify-center`}>
                          <FileIcon className={`w-6 h-6 ${doc.file_type.includes('image') ? 'text-pink-500' : 'text-blue-500'}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-medium truncate">{doc.name}</p>
                            <Badge variant="outline" className={statusConfig.color}>
                              <StatusIcon className={`w-3 h-3 mr-1 ${doc.sync_status === 'uploading' ? 'animate-spin' : ''}`} />
                              {statusConfig.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {doc.user_name}
                            </span>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {formatFileSize(doc.file_size)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {getTimeAgo(doc.last_synced_at)}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {doc.sync_status === 'failed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retrySyncMutation.mutate(doc.id)}
                              disabled={retrySyncMutation.isPending}
                              data-testid={`button-retry-${doc.id}`}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Retry
                            </Button>
                          )}
                          {doc.sync_status === 'synced' && doc.storage_path && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(doc.storage_path, '_blank')}
                              data-testid={`button-download-${doc.id}`}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </Button>
                          )}
                          {doc.sync_status === 'synced' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(doc.storage_path, '_blank')}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
}
