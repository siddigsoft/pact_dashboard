import React from 'react';
import { MMPFile } from '@/types';
import { GitBranch, Calendar, UserCheck } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface MMPVersionHistoryProps {
  mmpFile: MMPFile;
  mmpId?: string; // Add mmpId as optional prop
}



const MMPVersionHistory = ({ mmpFile, mmpId }: MMPVersionHistoryProps) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  };

  // Use either the mmpFile's modification history or create a default one
  const versionHistory = mmpFile.modificationHistory && mmpFile.modificationHistory.length > 0
    ? mmpFile.modificationHistory
    : [{
        timestamp: mmpFile.uploadedAt,
        modifiedBy: mmpFile.uploadedBy,
        changes: 'Initial upload',
        previousVersion: 'N/A',
        newVersion: mmpFile.mmpId || mmpId || `MMP-${mmpFile.id}`
      }];
      
  // Helper function to safely access version properties with proper type guards
  const getVersionParts = () => {
    // Default return if no version exists
    if (!mmpFile.version) return { major: '1', minor: '0' };
    
    // Handle string version format (e.g., "1.0")
    if (typeof mmpFile.version === 'string') {
      const versionString = mmpFile.version as string;
      const parts = versionString.split('.');
      return { 
        major: parts && parts.length > 0 ? parts[0] || '1' : '1', 
        minor: parts && parts.length > 1 ? parts[1] || '0' : '0' 
      };
    }
    
    // Handle MMPVersion object type
    if (typeof mmpFile.version === 'object' && mmpFile.version !== null) {
      return { 
        major: mmpFile.version.major?.toString() || '1', 
        minor: mmpFile.version.minor?.toString() || '0' 
      };
    }
    
    // Default fallback
    return { major: '1', minor: '0' };
  };
  
  const versionParts = getVersionParts();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">Version History</h4>
        <Badge variant="outline" className="px-2 py-1">
          Current Version: v{versionParts.major || '1'}.{versionParts.minor || '0'}
        </Badge>
      </div>

      <div className="relative pl-6 border-l border-gray-200 space-y-6">
        {versionHistory.map((version, idx) => (
          <div key={idx} className="relative">
            <div className="absolute -left-[13px] mt-1.5">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center ${idx === 0 ? 'bg-primary text-white' : 'border-2 border-primary bg-white'}`}>
                {idx === 0 ? (
                  <GitBranch className="h-3 w-3" />
                ) : (
                  <span className="text-xs font-medium text-primary">{idx + 1}</span>
                )}
              </div>
            </div>
            <div className={`bg-white p-4 rounded-md border ${idx === 0 ? 'border-primary/30' : 'border-gray-200'}`}>
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <h4 className="font-medium text-base">{version.changes}</h4>
                  <Badge variant={idx === 0 ? "default" : "secondary"}>
                    {version.newVersion}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    {formatDate(version.timestamp)}
                  </div>
                  <div className="flex items-center text-muted-foreground">
                    <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                    {version.modifiedBy}
                  </div>
                </div>
                
                {idx > 0 && (
                  <div className="mt-2 bg-slate-50 p-2 rounded flex items-center justify-between">
                    <span className="text-sm text-slate-600">Previous version:</span>
                    <Badge variant="outline">{version.previousVersion}</Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MMPVersionHistory;
