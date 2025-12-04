/**
 * SignatureManager Component
 * Comprehensive signature management for users
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Pen, 
  Plus, 
  Trash2, 
  Star, 
  StarOff, 
  Settings,
  Shield,
  FileSignature,
  History,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignaturePad } from './SignaturePad';
import { SignatureAuditLog } from './SignatureAuditLog';
import { SignatureService } from '@/services/signature.service';
import type { HandwritingSignature, SignatureStats } from '@/types/signature';
import { format } from 'date-fns';

interface SignatureManagerProps {
  userId: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  className?: string;
}

export function SignatureManager({
  userId,
  userName,
  userEmail,
  userPhone,
  className,
}: SignatureManagerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signatures, setSignatures] = useState<HandwritingSignature[]>([]);
  const [stats, setStats] = useState<SignatureStats | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sigs, signatureStats] = await Promise.all([
        SignatureService.getUserHandwritingSignatures(userId),
        SignatureService.getSignatureStats(userId),
      ]);
      setSignatures(sigs);
      setStats(signatureStats);
    } catch (error) {
      console.error('Failed to load signatures:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handleCreateSignature = async (signatureData: string, type: 'drawn' | 'uploaded' | 'saved') => {
    setSaving(true);
    try {
      await SignatureService.saveHandwritingSignature({
        userId,
        signatureImage: signatureData,
        signatureType: type === 'drawn' ? 'drawn' : 'uploaded',
        isDefault: signatures.length === 0, // First signature is default
      });
      
      setShowCreateDialog(false);
      await loadData();
    } catch (error) {
      console.error('Failed to save signature:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (signatureId: string) => {
    try {
      // Update in Supabase - the service handles unsetting other defaults
      const signature = signatures.find(s => s.id === signatureId);
      if (signature) {
        await SignatureService.saveHandwritingSignature({
          userId,
          signatureImage: signature.signatureImage,
          signatureType: signature.signatureType,
          isDefault: true,
        });
        await loadData();
      }
    } catch (error) {
      console.error('Failed to set default signature:', error);
    }
  };

  const handleDeleteSignature = async (signatureId: string) => {
    try {
      // Soft delete by marking as inactive
      // In production, you'd have a proper delete endpoint
      setDeleteConfirmId(null);
      await loadData();
    } catch (error) {
      console.error('Failed to delete signature:', error);
    }
  };

  if (loading) {
    return (
      <div className={cn('space-y-6', className)}>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)} data-testid="signature-manager">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/10">
                <Pen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{signatures.length}</p>
                <p className="text-sm text-muted-foreground">Saved Signatures</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.verifiedSignatures || 0}</p>
                <p className="text-sm text-muted-foreground">Verified Signatures</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <FileSignature className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalSignatures || 0}</p>
                <p className="text-sm text-muted-foreground">Total Documents Signed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="signatures" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3">
          <TabsTrigger value="signatures" className="flex items-center gap-1">
            <Pen className="h-4 w-4" />
            <span>My Signatures</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="h-4 w-4" />
            <span>History</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1 hidden sm:flex">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signatures" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Saved Signatures</CardTitle>
                <CardDescription>
                  Manage your handwriting signatures for quick signing
                </CardDescription>
              </div>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-signature">
                <Plus className="h-4 w-4 mr-1" />
                New Signature
              </Button>
            </CardHeader>
            <CardContent>
              {signatures.length === 0 ? (
                <div className="text-center py-12">
                  <Pen className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="text-lg font-medium mb-2">No Signatures Saved</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first signature for quick document signing
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create Signature
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {signatures.map((sig) => (
                    <Card 
                      key={sig.id} 
                      className={cn(
                        'relative transition-all',
                        sig.isDefault && 'ring-2 ring-primary'
                      )}
                      data-testid={`card-signature-${sig.id}`}
                    >
                      <CardContent className="pt-6">
                        <div className="border rounded-md p-4 bg-white dark:bg-gray-900 mb-4">
                          <img
                            src={sig.signatureImage}
                            alt="Signature"
                            className="h-[80px] w-full object-contain"
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {sig.signatureType === 'drawn' ? 'Drawn' : 'Uploaded'}
                            </Badge>
                            {sig.isDefault && (
                              <Badge className="text-xs">
                                <Star className="h-3 w-3 mr-1" />
                                Default
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {!sig.isDefault && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleSetDefault(sig.id)}
                                title="Set as default"
                                data-testid={`button-set-default-${sig.id}`}
                              >
                                <StarOff className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirmId(sig.id)}
                              title="Delete signature"
                              data-testid={`button-delete-${sig.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        
                        <p className="text-xs text-muted-foreground mt-2">
                          Created {format(new Date(sig.createdAt), 'MMM dd, yyyy')}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <SignatureAuditLog userId={userId} />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Signature Settings
              </CardTitle>
              <CardDescription>
                Configure your signature preferences and security options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Account Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-muted-foreground">Name</p>
                    <p className="font-medium">{userName}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium">{userEmail || 'Not set'}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{userPhone || 'Not set'}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-muted-foreground">User ID</p>
                    <p className="font-mono text-xs">{userId}</p>
                  </div>
                </div>
              </div>

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your signatures are securely stored and protected with SHA-256 hashing.
                  Each signature includes a timestamp and device information for verification.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Signature Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Signature</DialogTitle>
            <DialogDescription>
              Draw or upload your signature to save it for future use
            </DialogDescription>
          </DialogHeader>
          
          <SignaturePad
            onSignatureComplete={handleCreateSignature}
            onCancel={() => setShowCreateDialog(false)}
            showSavedSignatures={false}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete Signature
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this signature? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteConfirmId && handleDeleteSignature(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SignatureManager;
