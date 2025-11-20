
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { MMPSiteEntry } from '@/types/mmp/site';
import { SiteLocationDetails } from './site-card/SiteLocationDetails';
import { SitePartnerDetails } from './site-card/SitePartnerDetails';
import { SiteVisitInfo } from './site-card/SiteVisitInfo';
import { SiteVerificationStatus } from './site-card/SiteVerificationStatus';
import { SiteVerificationActions } from './site-card/SiteVerificationActions';

interface SiteCooperatingPartnerVerificationCardProps {
  site: MMPSiteEntry;
  onVerify: (siteId: string, status: 'verified' | 'rejected', notes?: string) => void;
  verificationStatus?: Record<string, { status: 'verified' | 'rejected' | null; notes?: string }>;
}

const SiteCooperatingPartnerVerificationCard: React.FC<SiteCooperatingPartnerVerificationCardProps> = ({
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

  return (
    <Card className="mb-4">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-medium">{site.siteName}</h3>
              <p className="text-sm text-muted-foreground">Site Code: {site.siteCode}</p>
            </div>
            <SiteVerificationStatus status={currentStatus} />
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <SiteLocationDetails site={site} />
              <SitePartnerDetails site={site} />
            </div>

            <div className="space-y-4">
              <SiteVisitInfo site={site} />

              {site.comments && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Comments</h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    {site.comments}
                  </p>
                </div>
              )}

              {verificationStatus[site.id]?.notes && (
                <div className="bg-muted p-3 rounded-md">
                  <h4 className="text-sm font-medium mb-1">Verification Notes</h4>
                  <p className="text-sm">{verificationStatus[site.id].notes}</p>
                </div>
              )}
            </div>
          </div>

          <SiteVerificationActions 
            currentStatus={currentStatus} 
            onVerifyClick={handleVerifyClick}
          />
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

export default SiteCooperatingPartnerVerificationCard;
