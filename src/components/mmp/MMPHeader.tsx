
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileCheck, Edit, Download, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MMPFile } from '@/types';

interface MMPHeaderProps {
  mmpFile: MMPFile;
  canEdit: boolean;
  handleProceedToVerification: () => void;
  handleEditMMP: () => void;
  handleDownload: () => void;
  setShowAuditTrail: (show: boolean) => void;
}

export const MMPHeader: React.FC<MMPHeaderProps> = ({ 
  mmpFile, 
  canEdit, 
  handleProceedToVerification, 
  handleEditMMP, 
  handleDownload, 
  setShowAuditTrail 
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/mmp")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{mmpFile.name}</h1>
          <p className="text-muted-foreground">
            Uploaded on {format(new Date(mmpFile.uploadedAt), 'MMMM d, yyyy')} by {mmpFile.uploadedBy}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {mmpFile.status === 'pending' && (
          <Button onClick={handleProceedToVerification}>
            <FileCheck className="h-4 w-4 mr-2" />
            Verify MMP
          </Button>
        )}
        
        {canEdit && (
          <Button variant="outline" onClick={handleEditMMP}>
            <Edit className="h-4 w-4 mr-2" />
            Edit MMP
          </Button>
        )}
        
        <Button variant="outline" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        
        <Button onClick={() => setShowAuditTrail(true)}>
          <History className="h-4 w-4 mr-2" />
          Activity Log
        </Button>
      </div>
    </div>
  );
};
