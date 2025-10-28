
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMMP } from '@/context/mmp/MMPContext';
import { useToast } from '@/hooks/use-toast';
import FieldTeamMapPermissions from '@/components/map/FieldTeamMapPermissions';
import MMPPermitVerification from '@/components/MMPPermitVerification';
import MMPCooperatingPartnerVerification from '@/components/MMPCPVerification';
import MMPVerificationHeader from '@/components/verification/MMPVerificationHeader';
import { MMPFile, MMPPermitsData, MMPDocument } from '@/types';
import { getActualSiteCount } from '@/utils/mmpUtils';
import { ArrowLeft } from 'lucide-react';

const MMPDetailedVerification: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMmpById, updateMMP, mmpFiles } = useMMP();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mmpFile, setMmpFile] = useState<MMPFile | null>(null);
  const [verificationProgress, setVerificationProgress] = useState(0);

  useEffect(() => {
    if (id) {
      const mmp = getMmpById(id);
      
      if (mmp) {
        setMmpFile(mmp);
      } else {
        toast({
          title: "MMP Not Found",
          description: `The MMP file with ID ${id} could not be found.`,
          variant: "destructive"
        });
        navigate('/mmp');
      }
      setLoading(false);
    }
  }, [id, getMmpById, navigate, toast]);

  // Recalculate progress whenever mmpFile changes (processedEntries or permits updates)
  useEffect(() => {
    if (!mmpFile) return;
    const processedEntries = mmpFile.processedEntries || 0;
    const totalEntries = mmpFile.entries || 0;
    let calculatedProgress = totalEntries > 0 
      ? Math.round((processedEntries / totalEntries) * 100)
      : 0;

    const permitsData = mmpFile.permits as MMPPermitsData | undefined;
    if (permitsData && Array.isArray(permitsData.documents) && permitsData.documents.length > 0) {
      const verifiedPermits = permitsData.documents.filter((p: any) => p?.status === 'verified').length;
      const permitProgress = Math.round((verifiedPermits / permitsData.documents.length) * 100);
      calculatedProgress = Math.round((calculatedProgress + permitProgress) / 2);
    }
    setVerificationProgress(calculatedProgress);
  }, [mmpFile]);
  
  const handleGoBack = () => {
    if (id) {
      navigate(`/mmp/verify/${id}`);
    } else {
      navigate('/mmp');
    }
  };

  const handleVerificationComplete = (type: 'permits' | 'cp', data: any) => {
    if (!mmpFile || !id) return;
    
    const updatedMMP = { ...mmpFile };
    if (type === 'permits') {
      updatedMMP.permits = data;
    } else {
      updatedMMP.cpVerification = {
        ...updatedMMP.cpVerification,
        ...data,
        verifiedAt: new Date().toISOString(),
        verificationStatus: data?.verificationStatus || updatedMMP.cpVerification?.verificationStatus || 'in-progress'
      };
      // Also reflect verifier and time at the top-level columns for easier reporting
      const firstSite: any = (data as any)?.siteVerification ? (Object.values((data as any).siteVerification as any)[0] as any) : undefined;
      const verifier = (data as any)?.verifiedBy || firstSite?.verifiedBy || undefined;
      if (verifier) {
        updatedMMP.verifiedBy = verifier as any;
      }
      updatedMMP.verifiedAt = new Date().toISOString();
      // Derive processedEntries from number of sites that have a verification decision
      const totalSites = (updatedMMP.siteEntries?.length || updatedMMP.entries || 0) as number;
      const processed = data?.siteVerification ? Object.keys(data.siteVerification).length : 0;
      const newProcessed = Math.min(totalSites, processed);
      // Never decrease processedEntries if it was already higher
      updatedMMP.processedEntries = Math.max(updatedMMP.processedEntries || 0, newProcessed);
    }
    
    updateMMP(id, updatedMMP);
    setMmpFile(updatedMMP);
    
    toast({
      title: `${type === 'permits' ? 'Permit' : 'Cooperating Partner'} Verification Complete`,
      description: `The ${type === 'permits' ? 'permit' : 'cooperating partner'} verification has been successfully completed.`,
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="ml-3">Loading detailed verification information...</p>
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
            <Button variant="default" onClick={() => navigate('/mmp')}>
              Return to MMP List
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <FieldTeamMapPermissions resource="mmp" action="approve">
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="outline" size="sm" onClick={handleGoBack} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Basic Verification
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Detailed MMP Verification</h1>
            <p className="text-muted-foreground">Verify permits and cooperating partner information</p>
          </div>
        </div>
        
        <MMPVerificationHeader 
          mmpFile={mmpFile}
          verificationProgress={verificationProgress}
          onGoBack={handleGoBack}
        />

        <Tabs defaultValue="permits" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="permits">Permits</TabsTrigger>
            <TabsTrigger value="cp">Cooperating Partner</TabsTrigger>
          </TabsList>

          <TabsContent value="permits">
            <Card>
              <CardContent className="p-6">
                <MMPPermitVerification 
                  mmpFile={mmpFile}
                  onVerificationComplete={(data) => handleVerificationComplete('permits', data)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cp">
            <Card>
              <CardContent className="p-6">
                <MMPCooperatingPartnerVerification
                  mmpFile={mmpFile}
                  onVerificationComplete={(data) => handleVerificationComplete('cp', data)}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </FieldTeamMapPermissions>
  );
};

export default MMPDetailedVerification;
