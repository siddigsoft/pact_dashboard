
import React from 'react';
import { FileCheck, InfoIcon, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MMPFile } from '@/types';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { 
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getActualSiteCount, getTotalSiteCount } from '@/utils/mmpUtils';

interface MMPProcessingStatusProps {
  mmpFile: MMPFile;
}

const MMPProcessingStatus: React.FC<MMPProcessingStatusProps> = ({ mmpFile }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Get the actual site count from the site entries array
  const actualSiteCount = getActualSiteCount(mmpFile);
  
  // Get the declared entries count from MMP file
  const declaredEntries = mmpFile?.entries || 0;
  
  // Get the total site count to use for calculation
  const totalSiteCount = getTotalSiteCount(mmpFile);
  
  // Ensure processed entries is a number
  const processedEntries = mmpFile?.processedEntries || 0;
  
  // Log values for debugging
  console.log('MMPProcessingStatus - actualSiteCount:', actualSiteCount);
  console.log('MMPProcessingStatus - declaredEntries:', declaredEntries);
  console.log('MMPProcessingStatus - totalSiteCount:', totalSiteCount);
  console.log('MMPProcessingStatus - processedEntries:', processedEntries);
  
  // Calculate processing progress percentage safely
  const progressPercentage = totalSiteCount > 0 
    ? Math.round((processedEntries / totalSiteCount) * 100)
    : 0;

  const hasSiteData = actualSiteCount > 0;

  const handleEdit = () => {
    navigate(`/mmp/${mmpFile.id}/edit`);
  };

  const handleVerify = () => {
    if (totalSiteCount === 0) {
      toast({
        title: "Cannot Verify MMP",
        description: "This MMP has no entries to verify. Please add site data first.",
        variant: "destructive"
      });
      return;
    }
    // Continue with verification process
    toast({
      title: "Starting Verification",
      description: "Beginning the verification process for this MMP."
    });
  };

  return (
    <div className="mt-8 border rounded-xl p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10">
      <h4 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-4 flex items-center gap-2">
        <FileCheck className="h-5 w-5" />
        Site Processing Status
      </h4>
      
      {!hasSiteData && (
        <div className="bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <InfoIcon className="h-5 w-5" />
            <p className="font-medium">No site entries found</p>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
            This MMP has {declaredEntries} declared entries but no site data is available yet. You may need to update the MMP with site information before verification.
          </p>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-blue-100 dark:border-blue-800/30">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Total Entries</p>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-300">{totalSiteCount}</p>
          <p className="text-xs text-muted-foreground mt-1">{actualSiteCount > 0 ? 'From site data' : 'Declared'}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-blue-100 dark:border-blue-800/30">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Site Entries</p>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-300">{actualSiteCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Available site details</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-blue-100 dark:border-blue-800/30">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Processed Sites</p>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-300">{processedEntries}</p>
          <p className="text-xs text-muted-foreground mt-1">Completed verification</p>
        </div>
      </div>
      
      <div className="mt-4">
        <div className="flex justify-between text-sm text-blue-700 dark:text-blue-400 mb-2">
          <span>Processing Progress</span>
          <span>{progressPercentage}%</span>
        </div>
        <div className="w-full bg-blue-100 dark:bg-blue-900/30 rounded-full h-2">
          <div 
            className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
      
      <div className="mt-6 flex gap-4 justify-end">
        <Button variant="outline" onClick={handleEdit}>
          <Edit className="h-4 w-4 mr-2" />
          Edit MMP
        </Button>
        {/* Verification button removed for admin overview */}
        {/* <Button onClick={handleVerify}>
          <FileCheck className="h-4 w-4 mr-2" />
          Start Verification
        </Button> */}
      </div>

      {!hasSiteData && (
        <div className="mt-6 bg-white dark:bg-gray-800 p-4 rounded-lg border border-blue-100 dark:border-blue-800/30">
          <h5 className="font-medium text-blue-800 dark:text-blue-400 mb-2">Next Steps</h5>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <div className="min-w-4 mt-0.5">1.</div>
              <p>Upload or edit the MMP with site information</p>
            </li>
            <li className="flex items-start gap-2">
              <div className="min-w-4 mt-0.5">2.</div>
              <p>Define the number of sites and their details</p>
            </li>
            <li className="flex items-start gap-2">
              <div className="min-w-4 mt-0.5">3.</div>
              <p>Return to verification once site data is available</p>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default MMPProcessingStatus;
