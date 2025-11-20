
import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Clock, CheckCircle } from 'lucide-react';
import { MMPStageIndicator } from '@/components/MMPStageIndicator';
import { MMPStatusBadge } from '@/components/mmp/MMPStatusBadge';
import { MMPFile } from '@/types';
import { format } from 'date-fns';

interface MMPVerificationHeaderProps {
  mmpFile: MMPFile;
  verificationProgress: number;
  onGoBack: () => void;
}

const MMPVerificationHeader: React.FC<MMPVerificationHeaderProps> = ({
  mmpFile,
  verificationProgress,
  onGoBack
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onGoBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Verify MMP File</h1>
          <p className="text-muted-foreground">{mmpFile?.mmpId || mmpFile?.id}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800">
            {verificationProgress}% Complete
          </Badge>
          {mmpFile?.workflow && (
            <MMPStageIndicator 
              stage={mmpFile.workflow.currentStage} 
              mmpId={mmpFile.id} 
              status={mmpFile.status} 
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border bg-card">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">File Details</span>
          </div>
          <div className="space-y-1">
            <p className="text-sm">Name: {mmpFile.name}</p>
            <p className="text-sm">Type: {mmpFile.type || 'N/A'}</p>
            <p className="text-sm">Project: {mmpFile.projectName || 'N/A'}</p>
            <div className="flex items-center gap-2 pt-1">
              <MMPStatusBadge status={mmpFile.status} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Timeline</span>
          </div>
          <div className="space-y-1">
            <p className="text-sm">Uploaded: {format(new Date(mmpFile.uploadedAt), 'MMM dd, yyyy')}</p>
            <p className="text-sm">Month: {mmpFile.month || 'N/A'}</p>
            <p className="text-sm">Year: {mmpFile.year || 'N/A'}</p>
            {mmpFile.expiryDate && (
              <p className="text-sm">Expires: {format(new Date(mmpFile.expiryDate), 'MMM dd, yyyy')}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Verification Progress</span>
          </div>
          <div className="space-y-1">
            <p className="text-sm">Total Entries: {mmpFile.entries}</p>
            <p className="text-sm">Processed: {mmpFile.processedEntries || 0}</p>
            <p className="text-sm">Region: {mmpFile.region || 'N/A'}</p>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${verificationProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MMPVerificationHeader;
