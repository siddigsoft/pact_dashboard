import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { CalendarIcon, MapPinIcon, FileTextIcon, ClockIcon, CheckCircle2Icon, XCircleIcon, AlertTriangleIcon, Edit, FileCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface MMPInfoCardProps {
  mmpData: {
    id?: string;
    projectName?: string;
    region?: string;
    status?: string;
    approvedAt?: string;
    mmpId?: string;
    month?: number | string;
    year?: number;
    entries?: number;
    siteEntries?: any[];
    version?: {
      major: number;
      minor: number;
    };
    workflow?: {
      currentStage?: string;
      lastUpdated?: string;
    };
    expiryDate?: string;
    location?: {
      state?: string;
      address?: string;
    };
    permitVerification?: {
      federal?: boolean;
      state?: boolean;
      local?: boolean;
    };
    cpVerification?: {
      status?: 'verified' | 'pending' | 'rejected';
      verifiedBy?: string;
      verifiedAt?: string;
    };
    sitesByState?: Array<{
      state: string;
      count: number;
      localities?: Array<{
        name: string;
        count: number;
      }>;
    }>;
  };
  showActions?: boolean;
  onVerificationClick?: () => void;
  onEditClick?: () => void;
}

export const MMPInfoCard = ({ 
  mmpData, 
  showActions = false, 
  onVerificationClick, 
  onEditClick 
}: MMPInfoCardProps) => {
  const navigate = useNavigate();
  
  // Calculate total sites from different sources for validation
  const declaredSiteCount = mmpData?.entries || 0;
  const actualSiteEntriesCount = mmpData?.siteEntries?.length || 0;
  const sitesByStateCount = mmpData?.sitesByState?.reduce((acc, state) => acc + state.count, 0) || 0;
  
  // Check for discrepancies
  const hasSiteCountDiscrepancy = declaredSiteCount !== actualSiteEntriesCount || 
                                 declaredSiteCount !== sitesByStateCount;

  // Function to get badge variant based on status
  const getStatusBadge = (status?: string) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;
    
    switch(status.toLowerCase()) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
          <CheckCircle2Icon className="h-3 w-3" />
          Approved
        </Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
          <XCircleIcon className="h-3 w-3" />
          Rejected
        </Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
          <AlertTriangleIcon className="h-3 w-3" />
          Pending
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Format month name
  const getMonthName = (month?: number | string) => {
    if (month === undefined || month === null || month === '') return 'N/A';
    const n = typeof month === 'string' ? parseInt(month as string, 10) : month;
    if (!n || isNaN(n) || n < 1 || n > 12) return 'N/A';
    return new Date(2000, n - 1, 1).toLocaleString('default', { month: 'long' });
  };

  // Handle verification button click
  const handleVerificationClick = () => {
    if (onVerificationClick) {
      onVerificationClick();
    } else if (mmpData?.id) {
      navigate(`/mmp/verify/${mmpData.id}`);
    }
  };

  // Handle edit button click
  const handleEditClick = () => {
    if (onEditClick) {
      onEditClick();
    } else if (mmpData?.id) {
      navigate(`/mmp/edit/${mmpData.id}`);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex justify-between items-center">
          <span>MMP Plan Details</span>
          {getStatusBadge(mmpData?.status)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {mmpData?.mmpId && (
          <div className="text-sm font-medium text-center text-muted-foreground border-b pb-2 mb-2">
            {mmpData.mmpId}
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <div className="flex items-center text-muted-foreground">
              <FileTextIcon className="h-3.5 w-3.5 mr-1" />
              Project
            </div>
            <div className="font-medium">{mmpData?.projectName || 'N/A'}</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center text-muted-foreground">
              <MapPinIcon className="h-3.5 w-3.5 mr-1" />
              Region
            </div>
            <div className="font-medium">{mmpData?.region || 'N/A'}</div>
          </div>
          
          <div className="space-y-1 col-span-2">
            <div className="flex items-center text-muted-foreground">
              Sites Information
            </div>
            <div className="font-medium space-y-1">
              <div className="flex justify-between items-center">
                <span>Total Sites:</span>
                <Badge 
                  variant={hasSiteCountDiscrepancy ? "destructive" : "default"}
                  className="flex gap-1 items-center"
                >
                  {declaredSiteCount}
                  {hasSiteCountDiscrepancy && 
                    <AlertTriangleIcon className="h-3 w-3" />
                  }
                </Badge>
              </div>
              {hasSiteCountDiscrepancy && (
                <div className="text-xs text-destructive space-y-1 bg-destructive/10 p-2 rounded-sm">
                  <p>Site count discrepancy detected:</p>
                  <ul className="list-disc list-inside">
                    <li>Declared count: {declaredSiteCount}</li>
                    <li>Actual site entries: {actualSiteEntriesCount}</li>
                    <li>Sum of sites by state: {sitesByStateCount}</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
          
          {mmpData?.location?.state && (
            <div className="space-y-1">
              <div className="flex items-center text-muted-foreground">
                State
              </div>
              <div className="font-medium">{mmpData.location.state}</div>
            </div>
          )}
          
          <div className="space-y-1">
            <div className="flex items-center text-muted-foreground">
              <CalendarIcon className="h-3.5 w-3.5 mr-1" />
              Period
            </div>
            <div className="font-medium">
              {getMonthName(mmpData?.month)} {mmpData?.year || 'N/A'}
            </div>
          </div>
          
          {mmpData?.version && (
            <div className="space-y-1">
              <div className="flex items-center text-muted-foreground">
                Version
              </div>
              <div className="font-medium">
                v{mmpData.version.major}.{mmpData.version.minor}
              </div>
            </div>
          )}
          
          {mmpData?.entries !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center text-muted-foreground">
                Sites
              </div>
              <div className="font-medium">{mmpData.entries}</div>
            </div>
          )}
          
          {mmpData?.workflow?.currentStage && (
            <div className="space-y-1">
              <div className="flex items-center text-muted-foreground">
                Stage
              </div>
              <div className="font-medium capitalize">
                {mmpData.workflow.currentStage}
              </div>
            </div>
          )}
        </div>
        
        {/* Site Statistics Summary */}
        <div className="pt-3 border-t mt-2">
          <h4 className="text-sm font-medium mb-2">Site Distribution</h4>
          <div className="space-y-3">
            {mmpData?.sitesByState?.map((stateData, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{stateData.state}</span>
                  <Badge variant="outline">{stateData.count} sites</Badge>
                </div>
                {stateData.localities && stateData.localities.length > 0 && (
                  <div className="pl-4 space-y-1 text-xs text-muted-foreground">
                    {stateData.localities.map((locality, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{locality.name}</span>
                        <span>{locality.count} sites</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {mmpData?.approvedAt && (
          <div className="pt-2 border-t text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center">
                <ClockIcon className="h-3.5 w-3.5 mr-1" />
                Approved
              </span>
              <span className="font-medium">
                {new Date(mmpData.approvedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
      </CardContent>
      
      {showActions && (
        <CardFooter className="flex flex-col sm:flex-row gap-2 border-t pt-4">
          <Button 
            className="w-full sm:w-auto flex-1" 
            onClick={handleVerificationClick}
          >
            <FileCheck className="h-4 w-4 mr-2" />
            Verify Permits & CP
          </Button>
          <Button 
            variant="outline" 
            className="w-full sm:w-auto flex-1"
            onClick={handleEditClick}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit MMP Data
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};
