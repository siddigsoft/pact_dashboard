
// src/components/MMPSiteInformation.tsx

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMMP } from '@/context/mmp/MMPContext';
import { useParams } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, FileText } from 'lucide-react';
import { getStateName } from '@/data/sudanStates';
import { MMPStatePermitDocument } from '@/types/mmp/permits';

interface MMPSiteInformationProps {
  mmpFile?: any;
  showVerificationButton?: boolean;
  onUpdateMMP?: (updatedMMP: any) => void;
}

export const MMPSiteInformation: React.FC<MMPSiteInformationProps> = ({ 
  mmpFile: propsMmpFile,
  showVerificationButton,
  onUpdateMMP
}) => {
  const { id } = useParams<{ id: string }>();
  const { getMmpById } = useMMP();
  const mmpFile = propsMmpFile || getMmpById(id || '');

  const renderPermitStatus = (permit: MMPStatePermitDocument) => {
    if (permit.status === 'verified') {
      return <Badge variant="success" className="flex items-center gap-1">Verified <CheckCircle className="h-3 w-3" /></Badge>;
    }
    if (permit.status === 'rejected') {
      return <Badge variant="destructive" className="flex items-center gap-1">Rejected <XCircle className="h-3 w-3" /></Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };

  // Calculate the actual site entries count
  const actualSiteCount = mmpFile?.siteEntries?.length || 0;
  const declaredSiteCount = mmpFile?.entries || 0;
  const documentCount = Array.isArray(mmpFile?.permits) ? mmpFile.permits.length : 0;

  console.log("MMPSiteInformation - Site counts:", { 
    actualSiteCount, 
    declaredSiteCount, 
    siteEntries: mmpFile?.siteEntries
  });

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Site Information</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm font-medium">MMP ID</p>
            <p className="text-sm text-muted-foreground">{mmpFile?.mmpId || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Status</p>
            <p className="text-sm text-muted-foreground">{mmpFile?.status || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Total Sites</p>
            <p className="text-sm text-muted-foreground">
              {actualSiteCount > 0 ? actualSiteCount : declaredSiteCount || 'N/A'}
              {actualSiteCount !== declaredSiteCount && actualSiteCount > 0 && declaredSiteCount > 0 && (
                <span className="ml-2 text-amber-600 text-xs">
                  (Declared: {declaredSiteCount})
                </span>
              )}
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-sm font-medium">Description</p>
          <p className="text-sm text-muted-foreground">{mmpFile?.description || 'N/A'}</p>
        </div>

        {/* <Separator />

        <div>
          <p className="text-sm font-medium">Location</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">State</p>
              <p className="text-sm text-muted-foreground">{getStateName(mmpFile?.location?.state) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">City</p>
              <p className="text-sm text-muted-foreground">{mmpFile?.location?.address || 'N/A'}</p>
            </div>
          </div>
        </div> */}

        {/* <Separator /> */}

        <div>
          <p className="text-sm font-medium">Permits</p>
          {Array.isArray(mmpFile?.permits) && mmpFile.permits.length > 0 ? (
            <div className="space-y-2">
              {mmpFile.permits.map((permit: MMPStatePermitDocument) => (
                <div key={permit.id} className="border rounded p-2">
                  <p className="text-sm font-medium">{permit.fileName}</p>
                  <p className="text-xs text-muted-foreground">Type: {permit.permitType}</p>
                  {permit.state && (
                    <p className="text-xs text-muted-foreground">State: {getStateName(permit.state)}</p>
                  )}
                  <div className="mt-1">{renderPermitStatus(permit)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No permits uploaded.</p>
          )}
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="bg-muted/20 p-4 rounded border-dashed border">
            <p className="text-xs font-semibold">Debug Information</p>
            <p className="text-xs text-muted-foreground">Actual site entries: {actualSiteCount}</p>
            <p className="text-xs text-muted-foreground">Declared entries: {declaredSiteCount}</p>
            <p className="text-xs text-muted-foreground">First entry: {mmpFile?.siteEntries && mmpFile.siteEntries.length > 0 ? 
              JSON.stringify(mmpFile.siteEntries[0].siteCode || 'No siteCode').substring(0, 40) + '...' : 'None'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Add default export to fix import errors in other files
export default MMPSiteInformation;
