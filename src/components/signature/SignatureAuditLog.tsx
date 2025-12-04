/**
 * SignatureAuditLog Component
 * Displays signature history and audit trail for compliance
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  History, 
  FileSignature, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye,
  Download,
  Shield,
  Fingerprint,
  Phone,
  Mail,
  Pen,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SignatureService } from '@/services/signature.service';
import type { 
  TransactionSignature, 
  DocumentSignature, 
  SignatureMethod,
  SignatureStatus,
  SignatureStats
} from '@/types/signature';

interface SignatureAuditLogProps {
  userId: string;
  className?: string;
}

export function SignatureAuditLog({ userId, className }: SignatureAuditLogProps) {
  const [loading, setLoading] = useState(true);
  const [transactionSignatures, setTransactionSignatures] = useState<TransactionSignature[]>([]);
  const [documentSignatures, setDocumentSignatures] = useState<DocumentSignature[]>([]);
  const [stats, setStats] = useState<SignatureStats | null>(null);
  const [selectedSignature, setSelectedSignature] = useState<TransactionSignature | DocumentSignature | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const loadSignatures = async () => {
    setLoading(true);
    try {
      const [txSigs, docSigs, signatureStats] = await Promise.all([
        SignatureService.getUserTransactionSignatures(userId),
        SignatureService.getUserDocumentSignatures(userId),
        SignatureService.getSignatureStats(userId),
      ]);
      
      setTransactionSignatures(txSigs);
      setDocumentSignatures(docSigs);
      setStats(signatureStats);
    } catch (error) {
      console.error('Failed to load signatures:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignatures();
  }, [userId]);

  const getMethodIcon = (method: SignatureMethod) => {
    switch (method) {
      case 'uuid': return <Fingerprint className="h-4 w-4" />;
      case 'phone': return <Phone className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'handwriting': return <Pen className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: SignatureStatus, verified: boolean) => {
    if (verified) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>;
    }
    
    switch (status) {
      case 'signed':
        return <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Signed</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'expired':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
      case 'revoked':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Revoked</Badge>;
      case 'invalid':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Invalid</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const viewSignatureDetails = (signature: TransactionSignature | DocumentSignature) => {
    setSelectedSignature(signature);
    setDetailsOpen(true);
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)} data-testid="card-signature-audit">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Signature History
            </CardTitle>
            <CardDescription>
              Your digital signatures and verification records
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadSignatures} data-testid="button-refresh-signatures">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-md">
              <p className="text-2xl font-bold">{stats.totalSignatures}</p>
              <p className="text-xs text-muted-foreground">Total Signatures</p>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
              <p className="text-2xl font-bold text-green-600">{stats.verifiedSignatures}</p>
              <p className="text-xs text-muted-foreground">Verified</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
              <p className="text-2xl font-bold text-yellow-600">{stats.pendingSignatures}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md">
              <p className="text-2xl font-bold text-gray-600">{stats.expiredSignatures}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="transactions" data-testid="tab-transaction-signatures">
              Transactions ({transactionSignatures.length})
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-document-signatures">
              Documents ({documentSignatures.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-4">
            <ScrollArea className="h-[400px]">
              {transactionSignatures.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSignature className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No transaction signatures yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionSignatures.map((sig) => (
                      <TableRow key={sig.id} data-testid={`row-signature-${sig.id}`}>
                        <TableCell className="text-sm">
                          {format(new Date(sig.createdAt), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {sig.transactionType.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          {sig.currency} {sig.amount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getMethodIcon(sig.signatureMethod)}
                            <span className="text-xs capitalize">{sig.signatureMethod}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(sig.status, sig.verified)}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => viewSignatureDetails(sig)}
                            data-testid={`button-view-signature-${sig.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <ScrollArea className="h-[400px]">
              {documentSignatures.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSignature className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No document signatures yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentSignatures.map((sig) => (
                      <TableRow key={sig.id} data-testid={`row-doc-signature-${sig.id}`}>
                        <TableCell className="text-sm">
                          {format(new Date(sig.createdAt), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {sig.documentTitle}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {sig.documentType.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getMethodIcon(sig.signatureMethod)}
                            <span className="text-xs capitalize">{sig.signatureMethod}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(sig.status, sig.verified)}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => viewSignatureDetails(sig)}
                            data-testid={`button-view-doc-signature-${sig.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Signature Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedSignature && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Signature ID</p>
                  <p className="font-mono text-xs break-all">{selectedSignature.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Method</p>
                  <div className="flex items-center gap-1">
                    {getMethodIcon(selectedSignature.signatureMethod)}
                    <span className="capitalize">{selectedSignature.signatureMethod}</span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedSignature.status, selectedSignature.verified)}
                </div>
                <div>
                  <p className="text-muted-foreground">Signed At</p>
                  <p>{selectedSignature.signedAt ? format(new Date(selectedSignature.signedAt), 'PPpp') : 'N/A'}</p>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-muted-foreground text-sm mb-2">Signature Hash</p>
                <code className="block p-2 bg-muted rounded text-xs break-all">
                  {selectedSignature.signatureHash}
                </code>
              </div>

              {selectedSignature.signatureData && (
                <div>
                  <p className="text-muted-foreground text-sm mb-2">Handwriting Signature</p>
                  <div className="border rounded-md p-4 bg-white dark:bg-gray-900">
                    <img 
                      src={selectedSignature.signatureData} 
                      alt="Signature" 
                      className="max-h-[100px] mx-auto object-contain"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Device</p>
                  <p className="text-xs">{selectedSignature.deviceInfo || 'Unknown'}</p>
                </div>
                {selectedSignature.verifiedAt && (
                  <div>
                    <p className="text-muted-foreground">Verified At</p>
                    <p>{format(new Date(selectedSignature.verifiedAt), 'PPpp')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default SignatureAuditLog;
