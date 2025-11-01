import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { MMPComprehensiveVerificationComponent } from '@/components/MMPComprehensiveVerification';
import { useMMP } from '@/context/mmp/MMPContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthorization } from '@/hooks/use-authorization';

const MMPVerificationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMmpById, updateMMP } = useMMP();
  const { toast } = useToast();
  const { checkPermission, hasAnyRole } = useAuthorization();

  const mmpFile = id ? getMmpById(id) : null;

  const isAdmin = hasAnyRole(['admin']);
  const canApprove = checkPermission('mmp', 'approve') || isAdmin;
  if (!canApprove) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>You don't have permission to verify or approve MMPs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/mmp')} className="w-full">Back to MMP</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!mmpFile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">MMP File Not Found</h1>
          <p className="text-gray-600 mb-6">The requested MMP file could not be found.</p>
          <Button onClick={() => navigate('/mmp')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to MMP Files
          </Button>
        </div>
      </div>
    );
  }

  const handleVerificationUpdate = (verification: any) => {
    if (!mmpFile.id) return;

    const payload: any = { comprehensiveVerification: verification };

    // Mirror CP verification to the legacy/top-level fields used elsewhere
    if (verification?.cpVerification) {
      payload.cpVerification = verification.cpVerification;
      const cpv = verification.cpVerification as any;
      if (cpv?.verifiedBy) payload.verifiedBy = cpv.verifiedBy;
      if (cpv?.verifiedAt) payload.verifiedAt = cpv.verifiedAt;

      // Derive processedEntries from number of site decisions
      const totalSites = (mmpFile.siteEntries?.length || mmpFile.entries || 0) as number;
      const processed = cpv?.siteVerification ? Object.keys(cpv.siteVerification).length : 0;
      const newProcessed = Math.min(totalSites, processed);
      if (newProcessed > (mmpFile.processedEntries || 0)) {
        payload.processedEntries = newProcessed;
      }
    }

    // Sync permits into shared MMPPermitsData shape used by other pages
    if (verification?.permitVerification?.permits) {
      const permits = verification.permitVerification.permits as any[];
      payload.permits = {
        documents: permits,
        verifiedBy: verification.permitVerification.verifiedBy,
        lastVerified: verification.permitVerification.verifiedAt,
        federal: permits.some((p) => p?.permitType === 'federal'),
        state: permits.some((p) => p?.permitType === 'state'),
        local: permits.some((p) => p?.permitType === 'local'),
      };
    }

    // If overall is complete and we have a verifier, set top-level too
    if (verification?.overallStatus === 'complete') {
      payload.verifiedAt = payload.verifiedAt || new Date().toISOString();
      payload.verifiedBy = payload.verifiedBy || 'System';
    }

    updateMMP(mmpFile.id, payload);
  };

  const handleVerificationComplete = () => {
    toast({
      title: "Verification Complete!",
      description: "All verification steps have been completed. You can now proceed with approval.",
    });
    
    // Navigate back to the MMP file details page
    navigate(`/mmp/${mmpFile.id}`);
  };

  const handleGoBack = () => {
    navigate(`/mmp/${mmpFile.id}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button 
            variant="outline" 
            onClick={handleGoBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to MMP File
          </Button>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              MMP Verification Process
            </h1>
            <p className="text-gray-600">
              Complete all verification steps for <strong>{mmpFile.name}</strong>
            </p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span>MMP ID: {mmpFile.mmpId}</span>
              <span>Region: {mmpFile.region}</span>
              <span>Uploaded: {new Date(mmpFile.uploadedAt).toLocaleDateString()}</span>
            </div>
          </div>
          
          {mmpFile.comprehensiveVerification?.canProceedToApproval && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Verification Complete</span>
            </div>
          )}
        </div>
      </div>

      {/* Verification Component */}
      <div className="bg-white rounded-lg shadow-sm border">
        <MMPComprehensiveVerificationComponent
          mmpFile={mmpFile}
          onVerificationUpdate={handleVerificationUpdate}
          onVerificationComplete={handleVerificationComplete}
        />
      </div>

      {/* Footer Actions */}
      <div className="mt-8 flex justify-between items-center">
        <Button 
          variant="outline" 
          onClick={handleGoBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to MMP File
        </Button>
        
        {mmpFile.comprehensiveVerification?.canProceedToApproval && (
          <Button 
            onClick={() => navigate(`/mmp/${mmpFile.id}`)}
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Proceed to Approval
          </Button>
        )}
      </div>
    </div>
  );
};

export default MMPVerificationPage;
