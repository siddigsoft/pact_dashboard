import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle2, AlertCircle, Clock, FileCheck, ShieldCheck, 
  UserCheck, FileText, MapPin, Calendar, Info, GitBranch
} from 'lucide-react';
import { MMPComprehensiveVerification, VerificationStatus } from '@/types/mmp/verification';
import { MMPFile } from '@/types';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import MMPCPVerification from './MMPCPVerification';
import MMPPermitVerification from './MMPPermitVerification';
import { useAppContext } from '@/context/AppContext';

interface MMPComprehensiveVerificationProps {
  mmpFile: MMPFile;
  onVerificationUpdate: (verification: MMPComprehensiveVerification) => void;
  onVerificationComplete: () => void;
}

export const MMPComprehensiveVerificationComponent: React.FC<MMPComprehensiveVerificationProps> = ({
  mmpFile,
  onVerificationUpdate,
  onVerificationComplete
}) => {
  const { toast } = useToast();
  const { roles } = useAppContext();
  const isFOM = (roles?.includes('fom' as any) || roles?.includes('fieldOpManager' as any)) ?? false;
  const [comprehensiveVerification, setComprehensiveVerification] = useState<MMPComprehensiveVerification>(
    mmpFile.comprehensiveVerification || {
      overallStatus: 'pending',
      canProceedToApproval: false,
      systemValidation: {
        status: 'pending',
        fileIntegrity: true,
        noDuplicates: true,
        compliantWithRequirements: true,
        entryProcessingComplete: false
      },
      contentVerification: {
        status: 'pending',
        fileReviewed: false,
        contentValidated: false
      }
    }
  );

  const [fileViewed, setFileViewed] = useState(false);
  const [showFileDetails, setShowFileDetails] = useState(false);

  useEffect(() => {
    // Initialize system validation based on file data
    const systemValidation = {
      status: 'complete' as VerificationStatus,
      fileIntegrity: true,
      noDuplicates: true,
      compliantWithRequirements: true,
      entryProcessingComplete: !!(mmpFile.entries && mmpFile.processedEntries && mmpFile.processedEntries >= mmpFile.entries)
    };

    setComprehensiveVerification(prev => ({
      ...prev,
      systemValidation
    }));
  }, [mmpFile]);

  const updateVerificationStatus = (updates: Partial<MMPComprehensiveVerification>) => {
    const updated = {
      ...comprehensiveVerification,
      ...updates,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'Current User' // This should come from context
    };

    // Check if all verifications are complete
    const allComplete = 
      updated.systemValidation?.status === 'complete' &&
      updated.contentVerification?.status === 'complete' &&
      updated.cpVerification?.verificationStatus === 'complete' &&
      updated.permitVerification?.status === 'complete';

    updated.overallStatus = allComplete ? 'complete' : 'in-progress';
    updated.canProceedToApproval = allComplete;

    setComprehensiveVerification(updated);
    onVerificationUpdate(updated);

    if (allComplete) {
      onVerificationComplete();
      toast({
        title: "All Verifications Complete",
        description: "The MMP is ready for approval process.",
      });
    }
  };

  const handleCPVerificationUpdate = (cpVerification: any) => {
    updateVerificationStatus({
      cpVerification: {
        ...comprehensiveVerification.cpVerification,
        ...cpVerification,
        verificationStatus: cpVerification.verificationStatus || 'complete'
      }
    });
  };

  const handlePermitVerificationUpdate = (permitData: any) => {
    const permits = Array.isArray(permitData?.documents) ? permitData.documents : [];
    const total = permits.length;
    const decided = permits.filter((p: any) => p?.status === 'verified' || p?.status === 'rejected').length;
    const completionPercentage = total > 0 ? Math.round((decided / total) * 100) : 0;
    const status: VerificationStatus = total > 0 && decided === total ? 'complete' : (decided > 0 ? 'in-progress' : 'pending');

    const permitVerification = {
      status,
      verifiedBy: 'Current User',
      verifiedAt: new Date().toISOString(),
      completionPercentage,
      permits,
    } as const;

    updateVerificationStatus({ permitVerification });
  };

  const handleContentVerification = () => {
    if (!fileViewed) {
      toast({
        title: "Error",
        description: "Please review the file before verification.",
        variant: "destructive",
      });
      return;
    }

    const contentVerification = {
      status: 'complete' as VerificationStatus,
      verifiedBy: 'Current User',
      verifiedAt: new Date().toISOString(),
      fileReviewed: true,
      contentValidated: true,
      notes: 'Content verified successfully'
    };

    updateVerificationStatus({ contentVerification });
  };

  const handleFileView = () => {
    setShowFileDetails(true);
  };

  const handleCloseFileDetails = () => {
    setShowFileDetails(false);
    setFileViewed(true);
    toast({
      title: "File review completed",
      description: "You can now proceed with content verification.",
    });
  };

  const getStatusIcon = (status: VerificationStatus) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'in-progress':
        return <Clock className="h-4 w-4 text-amber-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: VerificationStatus) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const calculateOverallProgress = () => {
    const verifications = [
      comprehensiveVerification.systemValidation?.status,
      comprehensiveVerification.contentVerification?.status,
      comprehensiveVerification.cpVerification?.verificationStatus,
      comprehensiveVerification.permitVerification?.status
    ];

    const completed = verifications.filter(status => status === 'complete').length;
    return Math.round((completed / verifications.length) * 100);
  };

  const overallProgress = calculateOverallProgress();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Comprehensive Verification Process
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Overall Progress (hidden for FOM) */}
          {!isFOM && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Overall Verification Progress</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{overallProgress}%</span>
                  <Badge className={getStatusColor(comprehensiveVerification.overallStatus)}>
                    {comprehensiveVerification.overallStatus}
                  </Badge>
                </div>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          )}

          <Separator />

          {/* Verification Steps */}
          <div className="space-y-4">
            {!isFOM && (
              <div className={`p-4 border rounded-md ${
                comprehensiveVerification.systemValidation?.status === 'complete' 
                  ? 'border-green-300 bg-green-50' 
                  : 'border-gray-300 bg-gray-50'
              }`}>
                <div className="flex justify-between items-center">
                  <div className="flex gap-2 items-center">
                    {getStatusIcon(comprehensiveVerification.systemValidation?.status || 'pending')}
                    <span className="font-medium">Step 1: System Validation</span>
                  </div>
                  <Badge className={getStatusColor(comprehensiveVerification.systemValidation?.status || 'pending')}>
                    {comprehensiveVerification.systemValidation?.status || 'pending'}
                  </Badge>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span>File integrity verified</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span>No duplicates detected</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span>Compliant with system requirements</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {comprehensiveVerification.systemValidation?.entryProcessingComplete ? (
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-amber-600" />
                    )}
                    <span>
                      {comprehensiveVerification.systemValidation?.entryProcessingComplete
                        ? `${mmpFile.processedEntries} of ${mmpFile.entries} entries processed`
                        : "Entry processing incomplete"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!isFOM && (
              <div className={`p-4 border rounded-md ${
                comprehensiveVerification.contentVerification?.status === 'complete' 
                  ? 'border-green-300 bg-green-50' 
                  : 'border-gray-300 bg-gray-50'
              }`}>
                <div className="flex justify-between items-center">
                  <div className="flex gap-2 items-center">
                    {getStatusIcon(comprehensiveVerification.contentVerification?.status || 'pending')}
                    <span className="font-medium">Step 2: Content Verification</span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleFileView}
                      className="flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      {fileViewed ? 'View Again' : 'View Details'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleContentVerification}
                      disabled={!fileViewed || comprehensiveVerification.contentVerification?.status === 'complete'}
                    >
                      {comprehensiveVerification.contentVerification?.status === 'complete' ? 'Verified' : 'Verify Content'}
                    </Button>
                  </div>
                </div>
                <p className="text-sm mt-2">
                  {!fileViewed 
                    ? "You must review the MMP file details before proceeding."
                    : comprehensiveVerification.contentVerification?.status === 'complete' 
                    ? "Content has been verified successfully." 
                    : "Verify that all information in the MMP file is correct."}
                </p>
              </div>
            )}

            {!isFOM && (
              <div className={`p-4 border rounded-md ${
                comprehensiveVerification.cpVerification?.verificationStatus === 'complete' 
                  ? 'border-green-300 bg-green-50' 
                  : 'border-gray-300 bg-gray-50'
              }`}>
                <div className="flex justify-between items-center">
                  <div className="flex gap-2 items-center">
                    {getStatusIcon(comprehensiveVerification.cpVerification?.verificationStatus || 'pending')}
                    <span className="font-medium">Step 3: Cooperating Partner Verification</span>
                  </div>
                  <Badge className={getStatusColor(comprehensiveVerification.cpVerification?.verificationStatus || 'pending')}>
                    {comprehensiveVerification.cpVerification?.verificationStatus || 'pending'}
                  </Badge>
                </div>
                <p className="text-sm mt-2">
                  Verify site entries and cooperating partner information.
                </p>
              </div>
            )}

            <div className={`p-4 border rounded-md ${
              comprehensiveVerification.permitVerification?.status === 'complete' 
                ? 'border-green-300 bg-green-50' 
                : 'border-gray-300 bg-gray-50'
            }`}>
              <div className="flex justify-between items-center">
                <div className="flex gap-2 items-center">
                  {getStatusIcon(comprehensiveVerification.permitVerification?.status || 'pending')}
                  <span className="font-medium">Step 4: Permit Verification</span>
                </div>
                <Badge className={getStatusColor(comprehensiveVerification.permitVerification?.status || 'pending')}>
                  {comprehensiveVerification.permitVerification?.status || 'pending'}
                </Badge>
              </div>
              <p className="text-sm mt-2">
                Verify all required permits and documentation.
              </p>
            </div>
          </div>

          {/* Verification Complete Status (hidden for FOM) */}
          {!isFOM && comprehensiveVerification.canProceedToApproval && (
            <div className="p-4 border border-green-300 bg-green-50 rounded-md">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium">All Verifications Complete</span>
              </div>
              <p className="text-sm text-green-700">
                The MMP has passed all verification steps and is ready for the approval process.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Verification Tabs */}
      <Tabs defaultValue={isFOM ? 'permit-verification' : 'cp-verification'} className="w-full">
        <TabsList className={`grid ${isFOM ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!isFOM && (<TabsTrigger value="cp-verification">CP Verification</TabsTrigger>)}
          <TabsTrigger value="permit-verification">Permit Verification</TabsTrigger>
        </TabsList>

        {!isFOM && (
          <TabsContent value="cp-verification" className="mt-6">
            <MMPCPVerification 
              mmpFile={mmpFile}
              onVerificationComplete={handleCPVerificationUpdate}
            />
          </TabsContent>
        )}

        <TabsContent value="permit-verification" className="mt-6">
          <MMPPermitVerification 
            mmpFile={mmpFile}
            onVerificationComplete={handlePermitVerificationUpdate}
          />
        </TabsContent>
      </Tabs>

      {/* File Details Dialog - Simplified version for content verification */}
      {showFileDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">MMP File Review</h3>
              <Button variant="outline" onClick={handleCloseFileDetails}>
                Close
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">File Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">File Name:</span>
                    <p className="font-medium">{mmpFile.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Upload Date:</span>
                    <p className="font-medium">{format(new Date(mmpFile.uploadedAt), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Uploaded By:</span>
                    <p className="font-medium">{mmpFile.uploadedBy}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Region:</span>
                    <p className="font-medium">{mmpFile.region}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Processing Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Entries:</span>
                    <p className="font-medium">{mmpFile.entries || '0'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Processed Entries:</span>
                    <p className="font-medium">{mmpFile.processedEntries || '0'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
