
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Archive, Trash2, Upload, Send } from 'lucide-react';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { MMPFile } from '@/types';

interface MMPFileManagementProps {
  mmpFile: MMPFile;
  canArchive: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canForward?: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onResetApproval: () => void;
  onApprove: () => void;
  onForward?: () => void;
}

const MMPFileManagement = ({ 
  mmpFile, 
  canArchive, 
  canDelete, 
  onArchive, 
  onDelete, 
  onResetApproval, 
  canApprove,
  onApprove,
  canForward,
  onForward
}: MMPFileManagementProps) => {
  const navigate = useNavigate();
  const isApproved = mmpFile.status === 'approved';
  const isRejected = mmpFile.status === 'rejected';
  const isVerificationComplete = mmpFile.comprehensiveVerification?.canProceedToApproval || false;
  const canActuallyApprove = canApprove && isVerificationComplete;

  const handleStartVerification = () => {
    navigate(`/mmp/${mmpFile.id}/verification`);
  };

  return (
    <>
      <Card className="border-l-4 border-l-gray-300">
        <CardHeader>
          <CardTitle className="text-gray-700">File Management</CardTitle>
          <CardDescription>
            Options for managing this MMP file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">

            {/* Verification Button - removed for admin overview */}
            {/* {canApprove && !isVerificationComplete && (
              <Button 
                variant="outline" 
                className="border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                onClick={handleStartVerification}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Start Verification
              </Button>
            )} */}

            {/* Approve button removed per UX request - approvals should be handled via workflow tools */}

            {(isApproved || isRejected) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-blue-200 hover:bg-blue-50 hover:text-blue-700 shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reset Approval Status
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Approval Status?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset the MMP approval status to pending. Any current approvals will be removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onResetApproval}>Reset</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {canForward && onForward && (
              <Button 
                onClick={onForward}
                className="bg-blue-600 text-white hover:bg-blue-700 shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform"
              >
                <Send className="h-4 w-4 mr-2" />
                Forward to FOMs
              </Button>
            )}
            
            {canArchive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-yellow-200 hover:bg-yellow-50 hover:text-yellow-700 shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform">
                    <Archive className="h-4 w-4 mr-2" />
                    Archive MMP
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive MMP File?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will archive the MMP file and restrict further edits. Archived files can still be viewed but not modified.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onArchive}>Archive</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {/* View details button - opens the MMP detail page */}
            <Button variant="outline" onClick={() => navigate(`/mmp/${mmpFile.id}/view`)} className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform">
              View MMP Details
            </Button>

            {/* Quick link to MMP management page (between Archive and Delete) */}
            <Button onClick={() => navigate('/mmp')} className="bg-blue-600 text-white hover:bg-blue-700 shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform duration-150">
              <Upload className="h-4 w-4 mr-2" />
              Go to MMP List
            </Button>

            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete MMP
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete MMP File "{mmpFile.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. The MMP file "{mmpFile.name}" will be permanently deleted from the system.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default MMPFileManagement;
