
import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { MMPFile, MMPPermitsData, MMPStatePermitDocument, MMPDocument } from '@/types';

interface MMPVerificationSummaryProps {
  mmpFile: MMPFile;
  verificationProgress: number;
  onFinalizeVerification: () => void;
  onGoBack: () => void;
}

const MMPVerificationSummary: React.FC<MMPVerificationSummaryProps> = ({
  mmpFile,
  verificationProgress,
  onFinalizeVerification,
  onGoBack,
}) => {
  // Helper function to safely get permits count
  const getPermitCounts = () => {
    // Check if permits exists and is of MMPPermitsData type with documents
    if (mmpFile.permits && typeof mmpFile.permits === 'object' && 'documents' in mmpFile.permits && Array.isArray(mmpFile.permits.documents)) {
      const permitsData = mmpFile.permits as MMPPermitsData;
      return {
        total: permitsData.documents.length,
        verified: permitsData.documents.filter((p: MMPDocument | MMPStatePermitDocument) => {
          // Check if it's a MMPStatePermitDocument (has status property)
          if ('status' in p) {
            return p.status === 'verified';
          }
          return false;
        }).length || 0
      };
    }
    
    // If permits is an array (for backward compatibility)
    if (mmpFile.permits && Array.isArray(mmpFile.permits)) {
      return {
        total: mmpFile.permits.length,
        verified: mmpFile.permits.filter((p: any) => p.status === 'verified').length || 0
      };
    }
    
    return { total: 0, verified: 0 };
  };

  const permitCounts = getPermitCounts();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verification Summary</CardTitle>
        <CardDescription>Review overall verification status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-2">Permit Verification</h3>
            <div className="space-y-2">
              <p>Total Permits: {permitCounts.total}</p>
              <p>Verified: {permitCounts.verified}</p>
            </div>
          </div>
          
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-2">Cooperating Partner Verification</h3>
            <div className="space-y-2">
              <p>Status: {mmpFile?.cpVerification?.verificationStatus || 'Pending'}</p>
              <p>Last Updated: {mmpFile?.cpVerification?.verifiedAt ? new Date(mmpFile.cpVerification.verifiedAt).toLocaleDateString() : 'Not verified'}</p>
            </div>
          </div>
          
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-2">Overall Progress</h3>
            <div className="space-y-2">
              <p>Progress: {verificationProgress}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-green-600 h-2.5 rounded-full" 
                  style={{ width: `${verificationProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between border-t mt-6">
        <Button variant="outline" onClick={onGoBack}>Cancel</Button>
        <Button
          onClick={onFinalizeVerification}
          disabled={verificationProgress < 100}
          className="flex items-center gap-2"
        >
          <CheckCircle className="h-4 w-4" />
          Finalize Verification
        </Button>
      </CardFooter>
    </Card>
  );
};

export default MMPVerificationSummary;
