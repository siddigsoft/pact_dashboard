/**
 * SignatureVerificationPanel Component
 * Admin panel for verifying and auditing collected signatures
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileSignature, 
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  Shield,
  Download,
  RefreshCw,
  Calendar,
  User,
  Smartphone,
  MapPin,
  Fingerprint
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SignatureRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  documentType: string;
  documentId: string;
  documentName?: string;
  signatureImage: string;
  signatureMethod: 'drawn' | 'typed' | 'biometric';
  signatureHash?: string;
  verificationStatus: 'pending' | 'verified' | 'flagged' | 'rejected';
  biometricVerified: boolean;
  deviceInfo?: {
    platform: string;
    model: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  ipAddress?: string;
  createdAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

interface SignatureStats {
  total: number;
  pending: number;
  verified: number;
  flagged: number;
  rejected: number;
  byMethod: {
    drawn: number;
    typed: number;
    biometric: number;
  };
  biometricRate: number;
}

interface SignatureVerificationPanelProps {
  className?: string;
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, className: 'bg-black/10 text-black dark:bg-white/10 dark:text-white' },
  verified: { label: 'Verified', icon: CheckCircle2, className: 'bg-black/20 text-black dark:bg-white/20 dark:text-white' },
  flagged: { label: 'Flagged', icon: AlertTriangle, className: 'bg-black/30 text-black dark:bg-white/30 dark:text-white' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'bg-black/40 text-black dark:bg-white/40 dark:text-white' },
};

const methodLabels = {
  drawn: 'Hand Drawn',
  typed: 'Typed',
  biometric: 'Biometric',
};

export function SignatureVerificationPanel({ className }: SignatureVerificationPanelProps) {
  const [loading, setLoading] = useState(true);
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [stats, setStats] = useState<SignatureStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [selectedSignature, setSelectedSignature] = useState<SignatureRecord | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Mock data
      const mockSignatures: SignatureRecord[] = [
        {
          id: '1',
          userId: 'user1',
          userName: 'Ahmed Hassan',
          userEmail: 'ahmed@example.com',
          documentType: 'Site Visit',
          documentId: 'sv-001',
          documentName: 'Field Survey - Location A',
          signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          signatureMethod: 'drawn',
          signatureHash: 'sha256:abc123...',
          verificationStatus: 'verified',
          biometricVerified: true,
          deviceInfo: { platform: 'android', model: 'Samsung Galaxy S21' },
          location: { latitude: 15.5527, longitude: 32.5599, accuracy: 10 },
          ipAddress: '196.29.xxx.xxx',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          verifiedBy: 'admin1',
          verifiedAt: new Date(Date.now() - 43200000).toISOString(),
        },
        {
          id: '2',
          userId: 'user2',
          userName: 'Fatima Ali',
          userEmail: 'fatima@example.com',
          documentType: 'Cost Submission',
          documentId: 'cs-002',
          documentName: 'Transportation Expenses - Dec',
          signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          signatureMethod: 'typed',
          signatureHash: 'sha256:def456...',
          verificationStatus: 'pending',
          biometricVerified: false,
          deviceInfo: { platform: 'ios', model: 'iPhone 14' },
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: '3',
          userId: 'user3',
          userName: 'Mohamed Osman',
          userEmail: 'mohamed@example.com',
          documentType: 'Handover',
          documentId: 'ho-003',
          documentName: 'Equipment Transfer',
          signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          signatureMethod: 'drawn',
          signatureHash: 'sha256:ghi789...',
          verificationStatus: 'flagged',
          biometricVerified: false,
          deviceInfo: { platform: 'android', model: 'Xiaomi Redmi Note 10' },
          location: { latitude: 15.6445, longitude: 32.4802, accuracy: 50 },
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          notes: 'Signature appears inconsistent with previous submissions',
        },
      ];

      const mockStats: SignatureStats = {
        total: 156,
        pending: 12,
        verified: 138,
        flagged: 4,
        rejected: 2,
        byMethod: {
          drawn: 98,
          typed: 45,
          biometric: 13,
        },
        biometricRate: 72,
      };

      setSignatures(mockSignatures);
      setStats(mockStats);
    } catch (error) {
      console.error('Failed to load signatures:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSignatures = useMemo(() => {
    return signatures.filter(sig => {
      if (statusFilter !== 'all' && sig.verificationStatus !== statusFilter) return false;
      if (methodFilter !== 'all' && sig.signatureMethod !== methodFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          sig.userName.toLowerCase().includes(query) ||
          sig.documentName?.toLowerCase().includes(query) ||
          sig.documentType.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [signatures, statusFilter, methodFilter, searchQuery]);

  const handleVerify = async (signatureId: string, status: 'verified' | 'flagged' | 'rejected') => {
    setSignatures(prev => prev.map(sig => 
      sig.id === signatureId 
        ? { ...sig, verificationStatus: status, verifiedAt: new Date().toISOString() }
        : sig
    ));
    setShowDetailDialog(false);
  };

  const handleViewDetails = (signature: SignatureRecord) => {
    setSelectedSignature(signature);
    setShowDetailDialog(true);
  };

  if (loading) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Signatures</p>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-pending">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending Review</p>
            <p className="text-2xl font-bold">{stats?.pending || 0}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-verified">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Verified</p>
            <p className="text-2xl font-bold">{stats?.verified || 0}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-biometric">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Biometric Rate</p>
            <p className="text-2xl font-bold">{stats?.biometricRate || 0}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Panel */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Signature Verification
              </CardTitle>
              <CardDescription>
                Review and verify collected signatures
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                data-testid="button-refresh"
                aria-label="Refresh signatures"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-export"
                aria-label="Export signatures"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
                aria-label="Search signatures"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-method" aria-label="Filter by method">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="drawn">Hand Drawn</SelectItem>
                <SelectItem value="typed">Typed</SelectItem>
                <SelectItem value="biometric">Biometric</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Signature List */}
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {filteredSignatures.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileSignature className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No signatures found</p>
                </div>
              ) : (
                filteredSignatures.map((sig) => {
                  const statusCfg = statusConfig[sig.verificationStatus];
                  const StatusIcon = statusCfg.icon;

                  return (
                    <div
                      key={sig.id}
                      className="border rounded-lg p-4 space-y-3"
                      data-testid={`signature-item-${sig.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{sig.userName}</span>
                            <Badge className={cn("text-xs", statusCfg.className)}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusCfg.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {methodLabels[sig.signatureMethod]}
                            </Badge>
                            {sig.biometricVerified && (
                              <Badge variant="outline" className="text-xs">
                                <Fingerprint className="h-3 w-3 mr-1" />
                                Bio
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {sig.documentType}: {sig.documentName || sig.documentId}
                          </p>
                        </div>
                        <div className="w-20 h-12 border rounded bg-white dark:bg-neutral-900 flex items-center justify-center">
                          <img 
                            src={sig.signatureImage} 
                            alt="Signature preview" 
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="text-xs text-muted-foreground flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(sig.createdAt), 'MMM d, yyyy h:mm a')}
                          </span>
                          {sig.deviceInfo && (
                            <span className="flex items-center gap-1">
                              <Smartphone className="h-3 w-3" />
                              {sig.deviceInfo.platform}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewDetails(sig)}
                          data-testid={`button-view-${sig.id}`}
                          aria-label={`View details for ${sig.userName}`}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Signature Details</DialogTitle>
            <DialogDescription>
              Review signature and verification information
            </DialogDescription>
          </DialogHeader>

          {selectedSignature && (
            <div className="space-y-4">
              {/* Signature Preview */}
              <div className="border rounded-lg p-4 bg-white dark:bg-neutral-900">
                <img 
                  src={selectedSignature.signatureImage} 
                  alt="Signature" 
                  className="h-24 mx-auto object-contain"
                />
              </div>

              {/* Details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Signer</span>
                  <span className="font-medium">{selectedSignature.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Document</span>
                  <span>{selectedSignature.documentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method</span>
                  <span>{methodLabels[selectedSignature.signatureMethod]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Biometric</span>
                  <span>{selectedSignature.biometricVerified ? 'Verified' : 'Not used'}</span>
                </div>
                {selectedSignature.location && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>
                      {selectedSignature.location.latitude.toFixed(4)}, {selectedSignature.location.longitude.toFixed(4)}
                    </span>
                  </div>
                )}
                {selectedSignature.deviceInfo && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Device</span>
                    <span>{selectedSignature.deviceInfo.model}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Signed At</span>
                  <span>{format(new Date(selectedSignature.createdAt), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>

              {/* Notes */}
              {selectedSignature.notes && (
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-sm">{selectedSignature.notes}</p>
                </div>
              )}

              {/* Actions */}
              {selectedSignature.verificationStatus === 'pending' && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={() => handleVerify(selectedSignature.id, 'verified')}
                    data-testid="button-verify"
                    aria-label="Verify signature"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Verify
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleVerify(selectedSignature.id, 'flagged')}
                    data-testid="button-flag"
                    aria-label="Flag signature"
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Flag
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleVerify(selectedSignature.id, 'rejected')}
                    data-testid="button-reject"
                    aria-label="Reject signature"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SignatureVerificationPanel;
