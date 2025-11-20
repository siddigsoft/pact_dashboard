
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, FileText } from 'lucide-react';
import { MMPSiteEntry } from '@/types/mmp/site';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface SiteCPVerificationCardProps {
  site: MMPSiteEntry;
  onVerify: (siteId: string, status: 'verified' | 'rejected', notes?: string) => void;
  verificationStatus?: Record<string, { status: 'verified' | 'rejected' | null; notes?: string }>;
}

const SiteCPVerificationCard: React.FC<SiteCPVerificationCardProps> = ({
  site,
  onVerify,
  verificationStatus = {}
}) => {
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyAction, setVerifyAction] = useState<'verified' | 'rejected'>();
  const [notes, setNotes] = useState('');

  const currentStatus = verificationStatus[site.id]?.status || null;

  const handleVerifyClick = (action: 'verified' | 'rejected') => {
    setVerifyAction(action);
    setVerifyDialogOpen(true);
  };

  const handleConfirmVerification = () => {
    if (!verifyAction) return;
    onVerify(site.id, verifyAction, notes);
    setVerifyDialogOpen(false);
    setNotes('');
  };

  const renderStatus = () => {
    switch (currentStatus) {
      case 'verified':
        return (
          <Badge variant="success" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Verified
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" className="flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Pending
          </Badge>
        );
    }
  };

  return (
    <Card className="mb-4">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium">{site.siteName || site.siteCode}</h3>
              <p className="text-sm text-muted-foreground">Site Code: {site.siteCode}</p>
            </div>
            {renderStatus()}
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Site Details</h4>
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Main Activity:</span> {site.mainActivity || 'N/A'}</p>
                <p><span className="font-medium">Status:</span> {site.status}</p>
                {site.visitDate && (
                  <p><span className="font-medium">Visit Date:</span> {new Date(site.visitDate).toLocaleDateString()}</p>
                )}
              </div>
            </div>

            {site.isFlagged && (
              <div className="bg-red-50 p-3 rounded-md">
                <h4 className="text-sm font-medium text-red-800 mb-1">Flagged Site</h4>
                <p className="text-sm text-red-600">{site.flagReason || 'No reason provided'}</p>
              </div>
            )}
          </div>

          {verificationStatus[site.id]?.notes && (
            <div className="bg-muted p-3 rounded-md">
              <h4 className="text-sm font-medium mb-1">Verification Notes</h4>
              <p className="text-sm">{verificationStatus[site.id].notes}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleVerifyClick('verified')}
              disabled={currentStatus === 'verified'}
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Verify
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleVerifyClick('rejected')}
              disabled={currentStatus === 'rejected'}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        </div>

        <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {verifyAction === 'verified' ? 'Verify Site' : 'Reject Site'}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p>Are you sure you want to {verifyAction === 'verified' ? 'verify' : 'reject'} this site?</p>
              <div className="mt-4">
                <label htmlFor="verification-notes" className="text-sm font-medium mb-2 block">
                  Verification Notes
                </label>
                <Textarea
                  id="verification-notes"
                  placeholder="Add any notes about the verification..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmVerification}
                variant={verifyAction === 'verified' ? 'default' : 'destructive'}
              >
                Confirm {verifyAction === 'verified' ? 'Verification' : 'Rejection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default SiteCPVerificationCard;
