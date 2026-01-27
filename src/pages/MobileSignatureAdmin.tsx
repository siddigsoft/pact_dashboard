import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Shield
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
}

export default function MobileSignatureAdmin() {
  const [selectedSignature, setSelectedSignature] = useState<Signature | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: signatures = [], isLoading } = useQuery({
    queryKey: ['mobile-signatures', statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('digital_signatures')
        .select(`
          *,
          profiles:user_id (full_name, email),
          documents:document_id (name)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('verification_status', statusFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('signature_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        user_name: s.profiles?.full_name || 'Unknown',
        user_email: s.profiles?.email || '',
        document_name: s.documents?.name || 'No document',
      }));
    },
  });

  const filteredSignatures = signatures.filter((s: Signature) =>
    s.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.document_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: signatures.length,
    verified: signatures.filter((s: Signature) => s.verification_status === 'verified').length,
    pending: signatures.filter((s: Signature) => s.verification_status === 'pending').length,
    rejected: signatures.filter((s: Signature) => s.verification_status === 'rejected').length,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'drawn': return 'bg-blue-500';
      case 'typed': return 'bg-purple-500';
      case 'initials': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="mobile-signature-admin-page">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Signatures</h1>
        <p className="text-muted-foreground">View and verify digital signatures from mobile app</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total">
          <CardContent className="p-4 flex items-center gap-4">
            <PenTool className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total Signatures</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-verified">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{stats.verified}</p>
              <p className="text-sm text-muted-foreground">Verified</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-pending">
          <CardContent className="p-4 flex items-center gap-4">
            <Clock className="w-8 h-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-rejected">
          <CardContent className="p-4 flex items-center gap-4">
            <XCircle className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{stats.rejected}</p>
              <p className="text-sm text-muted-foreground">Rejected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search by user or document..."
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
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="drawn">Drawn</SelectItem>
            <SelectItem value="typed">Typed</SelectItem>
            <SelectItem value="initials">Initials</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p>Loading signatures...</p>
      ) : filteredSignatures.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <PenTool className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No signatures found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSignatures.map((signature: Signature) => (
            <Card key={signature.id} data-testid={`card-signature-${signature.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(signature.verification_status)}
                    <CardTitle className="text-base">{signature.user_name}</CardTitle>
                  </div>
                  <Badge className={getTypeColor(signature.signature_type)} variant="secondary">
                    {signature.signature_type}
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {signature.document_name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div 
                  className="border rounded-lg p-2 bg-white h-24 flex items-center justify-center cursor-pointer"
                  onClick={() => {
                    setSelectedSignature(signature);
                    setIsPreviewOpen(true);
                  }}
                  data-testid={`preview-${signature.id}`}
                >
                  {signature.signature_type === 'typed' ? (
                    <span className="text-2xl font-signature">{signature.signature_data}</span>
                  ) : (
                    <img 
                      src={signature.signature_data} 
                      alt="Signature"
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(signature.created_at).toLocaleDateString()}</span>
                  <Smartphone className="w-3 h-3 ml-2" />
                  <span>Mobile</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedSignature(signature);
                      setIsPreviewOpen(true);
                    }}
                    data-testid={`button-view-${signature.id}`}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = signature.signature_data;
                      link.download = `signature-${signature.id}.png`;
                      link.click();
                    }}
                    data-testid={`button-download-${signature.id}`}
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Signature Details</DialogTitle>
          </DialogHeader>
          {selectedSignature && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-white">
                {selectedSignature.signature_type === 'typed' ? (
                  <span className="text-4xl font-signature block text-center">
                    {selectedSignature.signature_data}
                  </span>
                ) : (
                  <img 
                    src={selectedSignature.signature_data} 
                    alt="Signature"
                    className="max-w-full mx-auto"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Signer</span>
                  </div>
                  <p className="text-sm">{selectedSignature.user_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedSignature.user_email}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Document</span>
                  </div>
                  <p className="text-sm">{selectedSignature.document_name}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Signed At</span>
                  </div>
                  <p className="text-sm">{new Date(selectedSignature.created_at).toLocaleString()}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Status</span>
                  </div>
                  <Badge className={
                    selectedSignature.verification_status === 'verified' ? 'bg-green-500' :
                    selectedSignature.verification_status === 'rejected' ? 'bg-red-500' : 'bg-yellow-500'
                  }>
                    {selectedSignature.verification_status}
                  </Badge>
                </div>
              </div>
              {selectedSignature.device_info && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Device Info</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{selectedSignature.device_info}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
