import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { 
  PenTool, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search,
  Eye,
  Download,
  FileText,
  User,
  Calendar,
  Smartphone,
  Shield,
  ShieldCheck,
  ShieldX,
  RefreshCw,
  Fingerprint,
  Hash,
  Globe,
  AlertTriangle,
  Check,
  X,
  ZoomIn,
  Info
} from 'lucide-react';

interface Signature {
  id: string;
  user_id: string;
  document_id?: string;
  document_name?: string;
  signature_type: 'drawn' | 'typed' | 'initials';
  signature_data: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  ip_address?: string;
  device_info?: string;
  user_name?: string;
  user_email?: string;
  hash?: string;
  is_template?: boolean;
  source_signature_id?: string;
}

export default function MobileSignatureAdmin() {
  const [selectedSignature, setSelectedSignature] = useState<Signature | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: signatures = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-signatures', statusFilter, typeFilter, templateFilter],
    queryFn: async () => {
      // Fetch from digital_signatures (document signing events)
      let digitalQuery = supabase
        .from('digital_signatures')
        .select(`
          *,
          profiles:user_id (full_name, email),
          documents:document_id (name)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        digitalQuery = digitalQuery.eq('verification_status', statusFilter);
      }
      if (typeFilter !== 'all') {
        digitalQuery = digitalQuery.eq('signature_type', typeFilter);
      }
      // Filter by template status using explicit is_template field
      if (templateFilter === 'templates') {
        digitalQuery = digitalQuery.eq('is_template', true);
      } else if (templateFilter === 'documents') {
        digitalQuery = digitalQuery.or('is_template.is.null,is_template.eq.false');
      }

      const { data: digitalData, error: digitalError } = await digitalQuery;
      if (digitalError) throw digitalError;
      
      // Map digital_signatures to unified format
      // Note: Mobile signatures are automatically synced to digital_signatures on creation
      // This provides a single source of truth for admin verification
      return (digitalData || []).map((s: any) => ({
        ...s,
        user_name: s.profiles?.full_name || 'Unknown',
        user_email: s.profiles?.email || '',
        document_name: s.documents?.name || s.document_name || 'No document',
      }));
    },
  });

  const updateVerificationMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // All signatures are in digital_signatures (synced from mobile on creation)
      const { error } = await supabase
        .from('digital_signatures')
        .update({ verification_status: status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-signatures'] });
      toast({ title: 'Status updated', description: 'Signature verification status has been updated.' });
      setIsPreviewOpen(false);
    },
  });

  const getFilteredSignatures = () => {
    let filtered = signatures.filter((s: Signature) =>
      s.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.document_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (activeTab !== 'all') {
      filtered = filtered.filter((s: Signature) => s.verification_status === activeTab);
    }
    
    return filtered;
  };

  const filteredSignatures = getFilteredSignatures();

  const stats = {
    total: signatures.length,
    verified: signatures.filter((s: Signature) => s.verification_status === 'verified').length,
    pending: signatures.filter((s: Signature) => s.verification_status === 'pending').length,
    rejected: signatures.filter((s: Signature) => s.verification_status === 'rejected').length,
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'verified': return { icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Verified' };
      case 'rejected': return { icon: ShieldX, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Rejected' };
      default: return { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Pending' };
    }
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'drawn': return { color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', label: 'Drawn' };
      case 'typed': return { color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', label: 'Typed' };
      case 'initials': return { color: 'bg-teal-500/10 text-teal-600 border-teal-500/20', label: 'Initials' };
      default: return { color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', label: type };
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20" data-testid="mobile-signature-admin-page">
      <div className="bg-gradient-to-r from-violet-600 via-purple-700 to-indigo-800 text-white">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                  <Fingerprint className="w-6 h-6" />
                </div>
                <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Signatures</h1>
              </div>
              <p className="text-violet-100">View, verify, and manage digital signatures from mobile app</p>
            </div>
            <Button onClick={() => refetch()} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-0">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <PenTool className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-violet-100">Total</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <ShieldCheck className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.verified}</p>
                  <p className="text-sm text-violet-100">Verified</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Clock className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-violet-100">Pending</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <ShieldX className="w-5 h-5 text-red-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.rejected}</p>
                  <p className="text-sm text-violet-100">Rejected</p>
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
                placeholder="Search by user or document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
                data-testid="input-search"
              />
            </div>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px] h-11" data-testid="select-type-filter">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="drawn">Drawn</SelectItem>
              <SelectItem value="typed">Typed</SelectItem>
              <SelectItem value="initials">Initials</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateFilter} onValueChange={setTemplateFilter}>
            <SelectTrigger className="w-[160px] h-11" data-testid="select-template-filter">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="templates">Mobile Templates</SelectItem>
              <SelectItem value="documents">Document Signatures</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="all" className="data-[state=active]:bg-background">
              All ({stats.total})
            </TabsTrigger>
            <TabsTrigger value="pending" className="data-[state=active]:bg-background">
              Pending ({stats.pending})
            </TabsTrigger>
            <TabsTrigger value="verified" className="data-[state=active]:bg-background">
              Verified ({stats.verified})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-background">
              Rejected ({stats.rejected})
            </TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Card key={i} className="p-4">
                  <div className="space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredSignatures.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-16 text-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <PenTool className="w-8 h-8 opacity-50" />
                </div>
                <p className="font-medium mb-1">No signatures found</p>
                <p className="text-sm">Signatures will appear here when users sign documents on mobile</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSignatures.map((signature: Signature) => {
                const statusConfig = getStatusConfig(signature.verification_status);
                const typeConfig = getTypeConfig(signature.signature_type);
                const StatusIcon = statusConfig.icon;
                
                return (
                  <Card 
                    key={signature.id} 
                    className="group hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                    onClick={() => {
                      setSelectedSignature(signature);
                      setIsPreviewOpen(true);
                    }}
                    data-testid={`card-signature-${signature.id}`}
                  >
                    <div className="relative">
                      <div className="h-28 bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center border-b overflow-hidden">
                        {signature.signature_type === 'typed' ? (
                          <span className="text-2xl font-signature text-foreground/80">{signature.signature_data}</span>
                        ) : (
                          <img 
                            src={signature.signature_data} 
                            alt="Signature"
                            className="max-h-full max-w-full object-contain p-2"
                          />
                        )}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="secondary" className="h-7 w-7">
                            <ZoomIn className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className={`absolute top-2 left-2 p-1.5 rounded-full ${statusConfig.bg}`}>
                        <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.color}`} />
                      </div>
                    </div>
                    
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {signature.user_name?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{signature.user_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{signature.document_name}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={typeConfig.color}>
                            {typeConfig.label}
                          </Badge>
                          {signature.device_info?.includes('Template') && (
                            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 border-cyan-500/20 text-[10px]">
                              Template
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{getTimeAgo(signature.created_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="w-5 h-5" />
              Signature Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedSignature && (
            <div className="space-y-6">
              <div className="rounded-xl border bg-gradient-to-br from-muted/30 to-muted/60 p-6">
                {selectedSignature.signature_type === 'typed' ? (
                  <span className="text-4xl font-signature block text-center py-4">
                    {selectedSignature.signature_data}
                  </span>
                ) : (
                  <img 
                    src={selectedSignature.signature_data} 
                    alt="Signature"
                    className="max-w-full max-h-48 mx-auto"
                  />
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Signer</p>
                      <p className="font-medium">{selectedSignature.user_name}</p>
                      <p className="text-xs text-muted-foreground">{selectedSignature.user_email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Document</p>
                      <p className="font-medium">{selectedSignature.document_name}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Signed At</p>
                      <p className="font-medium">{new Date(selectedSignature.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Badge variant="outline" className={getStatusConfig(selectedSignature.verification_status).bg + ' ' + getStatusConfig(selectedSignature.verification_status).border}>
                        {getStatusConfig(selectedSignature.verification_status).label}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              
              {(selectedSignature.device_info || selectedSignature.ip_address) && (
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Device Information</span>
                  </div>
                  {selectedSignature.device_info && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Smartphone className="w-3 h-3" />
                      {selectedSignature.device_info}
                    </p>
                  )}
                  {selectedSignature.ip_address && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Globe className="w-3 h-3" />
                      IP: {selectedSignature.ip_address}
                    </p>
                  )}
                </div>
              )}
              
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = selectedSignature.signature_data;
                    link.download = `signature-${selectedSignature.id}.png`;
                    link.click();
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                
                {selectedSignature.verification_status === 'pending' && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => updateVerificationMutation.mutate({ 
                        id: selectedSignature.id, 
                        status: 'rejected'
                      })}
                      disabled={updateVerificationMutation.isPending}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => updateVerificationMutation.mutate({ 
                        id: selectedSignature.id, 
                        status: 'verified'
                      })}
                      disabled={updateVerificationMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Verify
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
