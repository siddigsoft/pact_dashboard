import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MMPCooperatingPartnerVerification as MMPCooperatingPartnerVerificationType } from '@/types/mmp/verification';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SiteCooperatingPartnerVerificationCard from './verification/SiteCooperatingPartnerVerificationCard';
import { useAppContext } from '@/context/AppContext';

interface MMPCooperatingPartnerVerificationProps {
  mmpFile: any;
  onVerificationComplete?: (verificationData: MMPCooperatingPartnerVerificationType) => void;
}

const MMPCooperatingPartnerVerification: React.FC<MMPCooperatingPartnerVerificationProps> = ({ mmpFile, onVerificationComplete }) => {
  const [verificationStatus, setVerificationStatus] = useState<Record<string, { 
    status: 'verified' | 'rejected' | null;
    notes?: string;
  }>>({});
  const [verificationProgress, setVerificationProgress] = useState<number>(0);
  const { toast } = useToast();
  const { currentUser } = useAppContext();

  // Seed local status from persisted cpVerification
  useEffect(() => {
    const sv = mmpFile?.cpVerification?.siteVerification as Record<string, { verified: boolean; notes?: string; verifiedAt?: string; verifiedBy?: string }> | undefined;
    if (sv && typeof sv === 'object') {
      const initial: Record<string, { status: 'verified' | 'rejected' | null; notes?: string }> = Object.entries(sv).reduce((acc, [siteId, rec]) => {
        acc[siteId] = { status: rec.verified ? 'verified' : 'rejected', notes: rec.notes };
        return acc;
      }, {} as Record<string, { status: 'verified' | 'rejected' | null; notes?: string }>);
      setVerificationStatus(initial);
    }
  }, [mmpFile?.cpVerification]);

  useEffect(() => {
    if (mmpFile?.siteEntries && mmpFile.siteEntries.length > 0) {
      const totalSites = mmpFile.siteEntries.length;
      const verifiedSites = Object.values(verificationStatus).filter(status => 
        status.status === 'verified' || status.status === 'rejected'
      ).length;
      const progress = Math.round((verifiedSites / totalSites) * 100);
      setVerificationProgress(progress);

      if (verifiedSites === totalSites) {
        const cooperatingPartnerVerificationData: MMPCooperatingPartnerVerificationType = {
          verificationStatus: 'complete',
          verifiedAt: new Date().toISOString(),
          verifiedBy: "Current User",
          completionPercentage: 100,
          siteVerification: Object.entries(verificationStatus).reduce((acc, [siteId, status]) => ({
            ...acc,
            [siteId]: {
              verified: status.status === 'verified',
              verifiedAt: new Date().toISOString(),
              verifiedBy: "Current User",
              notes: status.notes
            }
          }), {})
        };
        
        onVerificationComplete?.(cooperatingPartnerVerificationData);
      }
    }
  }, [verificationStatus, mmpFile, onVerificationComplete]);

  const handleVerifySite = (siteId: string, status: 'verified' | 'rejected', notes?: string) => {
    setVerificationStatus(prev => {
      const next = {
        ...prev,
        [siteId]: { status, notes }
      } as typeof prev;

      // Calculate progress and build CP verification payload
      const totalSites: number = (mmpFile?.siteEntries?.length || mmpFile?.entries || 0) as number;
      const processed = Object.values(next).filter(s => s.status === 'verified' || s.status === 'rejected').length;
      const completionPercentage = totalSites > 0 ? Math.round((processed / totalSites) * 100) : 0;
      const isComplete = totalSites > 0 && processed === totalSites;

      const cpData: MMPCooperatingPartnerVerificationType = {
        verificationStatus: isComplete ? 'complete' : 'in-progress',
        verifiedAt: new Date().toISOString(),
        verifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
        completionPercentage,
        siteVerification: Object.entries(next).reduce((acc, [sId, st]) => ({
          ...acc,
          [sId]: {
            verified: st.status === 'verified',
            verifiedAt: new Date().toISOString(),
            verifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
            notes: st.notes,
          }
        }), {})
      };

      // Notify parent immediately so it can persist to DB and update processedEntries
      onVerificationComplete?.(cpData);

      return next;
    });

    toast({
      title: `Site ${status === 'verified' ? 'Verified' : 'Rejected'}`,
      description: `Site has been ${status === 'verified' ? 'verified' : 'rejected'} successfully.`,
    });
  };

  const handleVerifyAll = () => {
    const siteEntries = mmpFile?.siteEntries || [];
    const totalSites: number = (siteEntries.length || mmpFile?.entries || 0) as number;
    if (totalSites === 0) return;

    const now = new Date().toISOString();
    const verifier = currentUser?.username || currentUser?.fullName || currentUser?.email || 'System';

    // Build full verified map
    const next: Record<string, { status: 'verified' | 'rejected' | null; notes?: string }> = { ...verificationStatus };
    siteEntries.forEach((site: any, idx: number) => {
      const sid = site?.id || String(idx);
      next[sid] = { status: 'verified' };
    });
    setVerificationStatus(next);

    // Build CP verification payload
    const cpData: MMPCooperatingPartnerVerificationType = {
      verificationStatus: 'complete',
      verifiedAt: now,
      verifiedBy: verifier,
      completionPercentage: 100,
      siteVerification: siteEntries.reduce((acc: any, site: any, idx: number) => {
        const sid = site?.id || String(idx);
        acc[sid] = {
          verified: true,
          verifiedAt: now,
          verifiedBy: verifier,
          notes: next[sid]?.notes,
        };
        return acc;
      }, {}),
    };

    onVerificationComplete?.(cpData);
    toast({ title: 'All sites verified', description: `Marked ${totalSites} sites as verified.` });
  };

  if (!mmpFile) {
    return <div>No MMP file data available</div>;
  }

  const siteEntries = mmpFile.siteEntries || [];
  const totalSites = siteEntries.length || mmpFile.entries || 0;

  if (totalSites === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center text-center p-6">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium">No Sites Available</h3>
            <p className="text-muted-foreground mt-2">
              This MMP file does not have any sites to verify.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Count processed for UI state
  const processedCount = Object.values(verificationStatus).filter(s => s.status === 'verified' || s.status === 'rejected').length;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Verification Progress</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm">{verificationProgress}%</span>
            {/* Verification button removed for admin overview */}
            {/* <Button size="sm" onClick={handleVerifyAll} disabled={processedCount >= (mmpFile?.siteEntries?.length || mmpFile?.entries || 0)}>
              Verify All
            </Button> */}
          </div>
        </div>
        <Progress value={verificationProgress} className="h-2" />
      </div>

      <Tabs defaultValue="sites" className="w-full">
        <TabsList>
          <TabsTrigger value="sites">Sites ({totalSites})</TabsTrigger>
          <TabsTrigger value="distribution">Distribution Details</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-6">
          <div className="space-y-4">
            {siteEntries.map((site) => (
              <SiteCooperatingPartnerVerificationCard
                key={site.id}
                site={site}
                onVerify={handleVerifySite}
                verificationStatus={verificationStatus}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="distribution" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium mb-4">Distribution Information</h3>
              <div className="grid gap-4">
                <div>
                  <p className="font-medium">Total Sites: {totalSites}</p>
                  <p className="text-sm text-muted-foreground">Number of sites included in this MMP</p>
                </div>
                <div>
                  <p className="font-medium">Verified Sites: {Object.values(verificationStatus).filter(s => s.status === 'verified').length}</p>
                  <p className="text-sm text-muted-foreground">Sites that have been verified</p>
                </div>
                <div>
                  <p className="font-medium">Rejected Sites: {Object.values(verificationStatus).filter(s => s.status === 'rejected').length}</p>
                  <p className="text-sm text-muted-foreground">Sites that have been rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MMPCooperatingPartnerVerification;
