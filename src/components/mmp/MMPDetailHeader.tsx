
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileCheck, Edit, Download, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MMPFile } from '@/types';

interface MMPDetailHeaderProps {
  mmpFile: MMPFile;
  canEdit: boolean;
  onProceedToVerification: () => void;
  onEditMMP: () => void;
  onDownload: () => void;
  onShowAuditTrail: () => void;
}

const MMPDetailHeader = ({ 
  mmpFile, 
  canEdit, 
  onProceedToVerification, 
  onEditMMP, 
  onDownload, 
  onShowAuditTrail 
}: MMPDetailHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/mmp")} className="hover:bg-muted">
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
          {/* Verification buttons removed for admin overview */}
          {/* {mmpFile.status === 'pending' && (
            <Button onClick={onProceedToVerification} className="bg-blue-600 hover:bg-blue-700">
              <FileCheck className="h-4 w-4 mr-2" />
              Verify MMP
            </Button>
          )} */}
          
          {canEdit && (
            <Button variant="outline" onClick={onEditMMP}>
              <Edit className="h-4 w-4 mr-2" />
              Edit MMP
            </Button>
          )}
          
          <Button variant="outline" onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          
          <Button onClick={onShowAuditTrail}>
            <History className="h-4 w-4 mr-2" />
            Activity Log
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MMPDetailHeader;
