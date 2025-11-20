
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MMPStatePermitDocument } from '@/types/mmp/permits';
import { FileCheck, XCircle, CheckCircle, Eye, Calendar, FileText, Trash } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { getStateName } from '@/data/sudanStates';
import { Progress } from '@/components/ui/progress';
import PermitPreviewDialog from './PermitPreviewDialog';
import { format } from 'date-fns';

interface PermitVerificationCardProps {
  permit: MMPStatePermitDocument;
  onVerify: (permitId: string, status: 'verified' | 'rejected', notes?: string) => void;
  onDelete: (permitId: string) => void;
}

export const PermitVerificationCard: React.FC<PermitVerificationCardProps> = ({
  permit,
  onVerify,
  onDelete,
}) => {
  const [verifyDialogOpen, setVerifyDialogOpen] = React.useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = React.useState(false);
  const [verifyAction, setVerifyAction] = React.useState<'verified' | 'rejected'>();
  const [notes, setNotes] = React.useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const { toast } = useToast();

  const handleVerifyClick = (action: 'verified' | 'rejected') => {
    setVerifyAction(action);
    setVerifyDialogOpen(true);
  };

  const handleConfirmVerification = () => {
    if (!verifyAction) return;
    
    onVerify(permit.id, verifyAction, notes);
    setVerifyDialogOpen(false);
    setNotes('');
    
    toast({
      title: `Permit ${verifyAction === 'verified' ? 'Verified' : 'Rejected'}`,
      description: `The permit has been ${verifyAction === 'verified' ? 'verified' : 'rejected'} successfully.`
    });
  };

  const renderStatus = () => {
    switch (permit.status) {
      case 'verified':
        return (
          <Badge variant="success" className="flex items-center gap-2 px-3 py-1">
            <CheckCircle className="h-4 w-4" />
            Verified
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" className="flex items-center gap-2 px-3 py-1">
            <XCircle className="h-4 w-4" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="flex items-center gap-2 px-3 py-1">
            <FileCheck className="h-4 w-4" />
            Pending
          </Badge>
        );
    }
  };

  // Function to ensure the fileUrl is valid and complete
  const getFileUrl = () => {
    if (!permit.fileUrl) return undefined;
    
    // Check if fileUrl is a complete URL
    if (permit.fileUrl.startsWith('http://') || permit.fileUrl.startsWith('https://')) {
      return permit.fileUrl;
    }
    
    // If it's a relative path, make it absolute
    // This is just an example, you might need to adjust based on your actual URL structure
    return `${window.location.origin}${permit.fileUrl.startsWith('/') ? '' : '/'}${permit.fileUrl}`;
  };

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header Section */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight">{permit.fileName}</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="capitalize">
                  {permit.permitType}
                </Badge>
                {permit.state && (
                  <Badge variant="outline" className="capitalize">
                    {getStateName(permit.state)}
                  </Badge>
                )}
              </div>
            </div>
            {renderStatus()}
          </div>

          {/* Details Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {permit.issueDate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Issued: {format(new Date(permit.issueDate), 'MMMM d, yyyy')}</span>
              </div>
            )}
            {permit.expiryDate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Expires: {format(new Date(permit.expiryDate), 'MMMM d, yyyy')}</span>
              </div>
            )}
          </div>

          {permit.comments && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground pt-2">
              <FileText className="h-4 w-4 mt-1" />
              <p>{permit.comments}</p>
            </div>
          )}

          {permit.status && (
            <div className={`mt-2 text-sm rounded-md p-3 ${permit.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-700'}`}>
              <div className="flex items-center gap-2 mb-1">
                {permit.status === 'rejected' ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                <span className="font-medium capitalize">{permit.status}</span>
              </div>
              {permit.verificationNotes ? (
                <p className="pl-6">{permit.verificationNotes}</p>
              ) : (
                permit.status === 'rejected' && <p className="pl-6 italic">No reason provided</p>
              )}
            </div>
          )}

          {/* File URL Debug (only in development) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
              <p className="truncate">File URL: {permit.fileUrl || 'Not available'}</p>
            </div>
          )}

          {/* Actions Section */}
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              Preview Document
            </Button>

            <div className="flex gap-2">
              {!permit.status && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleVerifyClick('verified')}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Verify
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleVerifyClick('rejected')}
                    className="flex items-center gap-2 border-destructive/50 hover:bg-destructive/10"
                  >
                    <XCircle className="h-4 w-4 text-destructive" />
                    Reject
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="flex items-center gap-2 border-destructive/50 hover:bg-destructive/10"
              >
                <Trash className="h-4 w-4 text-destructive" />
                Delete
              </Button>
            </div>
          </div>

          {/* Progress Indicator */}
          {!permit.status && (
            <div className="pt-2">
              <Progress value={0} className="h-1" />
              <p className="text-xs text-muted-foreground text-center pt-1">
                Pending verification
              </p>
            </div>
          )}
        </div>

        {/* Dialogs */}
        <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {verifyAction === 'verified' ? 'Verify Permit' : 'Reject Permit'}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm font-medium">Verification Notes</label>
              <Textarea
                placeholder="Add any notes about this verification..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmVerification}
                variant={verifyAction === 'verified' ? 'default' : 'destructive'}
                className="flex items-center gap-2"
              >
                {verifyAction === 'verified' ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Verify Permit
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Reject Permit
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PermitPreviewDialog
          fileUrl={getFileUrl()}
          fileName={permit.fileName}
          open={previewDialogOpen}
          onOpenChange={setPreviewDialogOpen}
        />

        {/* Delete confirmation */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Permit</DialogTitle>
            </DialogHeader>
            <div className="py-2 text-sm text-muted-foreground">
              Are you sure you want to delete "{permit.fileName}"? This will remove the file from storage and from this MMP. This action cannot be undone.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex items-center gap-2"
                onClick={() => { onDelete(permit.id); setDeleteDialogOpen(false); }}
              >
                <Trash className="h-4 w-4" />
                Delete Permit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default PermitVerificationCard;
