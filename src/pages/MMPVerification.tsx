
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import FieldTeamMapPermissions from '@/components/map/FieldTeamMapPermissions';
import MMPSiteInformation from '@/components/MMPSiteInformation';
import MMPVerificationHeader from '@/components/verification/MMPVerificationHeader';
import MMPVerificationOverview from '@/components/verification/tabs/MMPVerificationOverview';
import MMPVerificationSummary from '@/components/verification/tabs/MMPVerificationSummary';
import { MMPFile, MMPStage, MMPStatus } from '@/types';
import { getActualSiteCount, debugMMPFiles } from '@/utils/mmpUtils';
import MMPFileUpload from '@/components/mmp/MMPFileUpload';

const MMPVerification: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMmpById, updateMMP, mmpFiles } = useMMP();
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mmpFile, setMmpFile] = useState<MMPFile | null>(null);
  const [verificationProgress, setVerificationProgress] = useState(0);

  useEffect(() => {
    if (id) {
      console.log(`Fetching MMP with ID: ${id}`);
      console.log('Available MMP files:', mmpFiles.length);
      
      // Debug the available MMP files to check what we're working with
      debugMMPFiles(mmpFiles, 'MMPVerification Page');
      
      const mmp = getMmpById(id);
      console.log('Found MMP file:', mmp ? 'Found' : 'Not found');
      
      if (mmp) {
        console.log('MMP Data:', JSON.stringify(mmp, null, 2));
        setMmpFile(mmp);
        
        // Calculate verification progress
        const siteEntries = getActualSiteCount(mmp);
        console.log(`Site entries count: ${siteEntries}`);
        
        // Calculate verification progress based on processed entries
        const processedEntries = mmp.processedEntries || 0;
        const totalEntries = mmp.entries || 0;
        const calculatedProgress = totalEntries > 0 
          ? Math.round((processedEntries / totalEntries) * 100)
          : 0;
          
        console.log(`Verification progress: ${calculatedProgress}%`);
        setVerificationProgress(calculatedProgress);
      } else {
        toast({
          title: "MMP Not Found",
          description: `The MMP file with ID ${id} could not be found.`,
          variant: "destructive"
        });
        console.error(`MMP with ID ${id} not found`);
        navigate('/mmp');
      }
      setLoading(false);
    }
  }, [id, getMmpById, navigate, toast, mmpFiles]);
  
  const handleGoBack = () => navigate('/mmp');

  const handleFinalizeVerification = () => {
    if (!mmpFile || !id) return;
    const now = new Date().toISOString();
    const verifier = currentUser?.username || currentUser?.fullName || currentUser?.name || currentUser?.email || currentUser?.id || 'System';

    const payload: Partial<MMPFile> = {
      status: 'verified' as MMPStatus,
      verifiedBy: verifier,
      verifiedAt: now,
      workflow: {
        ...(mmpFile.workflow || {}),
        currentStage: 'verified' as MMPStage,
        lastUpdated: now
      }
    };

    updateMMP(id, payload);
    setMmpFile(prev => prev ? { ...prev, ...payload } as MMPFile : prev);
    
    toast({
      title: "MMP Verification Complete",
      description: "The MMP has been successfully verified.",
    });
    
    navigate(`/mmp/${id}/view`);
  };
  
  const handleDetailedVerification = () => {
    if (id) {
      navigate(`/mmp/${id}/detailed-verification`);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="ml-3">Loading verification information...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!mmpFile) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <div className="p-8 flex flex-col items-center justify-center gap-4">
            <div className="text-red-500 bg-red-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold">MMP File Not Found</h2>
            <p className="text-muted-foreground text-center">
              The requested MMP file (ID: {id}) could not be found or accessed.
            </p>
            <Button variant="default" onClick={handleGoBack}>
              Return to MMP List
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Show upload form if no ID is provided
  if (!id) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-6">MMP Upload and Verification</h1>
        <MMPFileUpload />
      </div>
    );
  }

  return (
    <FieldTeamMapPermissions resource="mmp" action="approve">
      <div className="container mx-auto p-4 space-y-6">
        <MMPVerificationHeader 
          mmpFile={mmpFile}
          verificationProgress={verificationProgress}
          onGoBack={handleGoBack}
        />

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="site-info">Site Information</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <MMPVerificationOverview mmpFile={mmpFile} />
          </TabsContent>

          <TabsContent value="site-info">
            <Card>
              <CardContent className="p-6">
                <MMPSiteInformation
                  mmpFile={mmpFile}
                  showVerificationButton={true}
                  onUpdateMMP={(updatedMMP) => updateMMP(id!, updatedMMP)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary">
            <Card>
              <CardContent className="p-6">
                <MMPVerificationSummary
                  mmpFile={mmpFile}
                  verificationProgress={verificationProgress}
                  onFinalizeVerification={handleFinalizeVerification}
                  onGoBack={handleGoBack}
                />
                <div className="mt-6 border-t pt-4">
                  <Button 
                    variant="outline" 
                    onClick={handleDetailedVerification}
                    className="w-full"
                  >
                    Go to Detailed Verification (Permits & Cooperating Partner)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </FieldTeamMapPermissions>
  );
};

export default MMPVerification;
