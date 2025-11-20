
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Archive, Trash2, Check, ShieldCheck } from 'lucide-react';
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
  onArchive: () => void;
  onDelete: () => void;
  onResetApproval: () => void;
  onApprove: () => void;
}

const MMPFileManagement = ({ 
  mmpFile, 
  canArchive, 
  canDelete, 
  onArchive, 
  onDelete, 
  onResetApproval, 
  canApprove,
  onApprove
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
            {canApprove && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className={`border-green-200 hover:bg-green-50 hover:text-green-700 ${
                      !isVerificationComplete ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={!isVerificationComplete}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve MMP
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve MMP File?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {isVerificationComplete 
                        ? "This will mark the MMP file as approved. This action can be reset later."
                        : "Cannot approve MMP file. All verification steps must be completed first."
                      }
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={onApprove}
                      disabled={!isVerificationComplete}
                    >
                      Approve
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

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

            {canApprove && isVerificationComplete && (
              <div className="text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                <strong>✓ Verification Complete:</strong> Ready for approval.
              </div>
            )}

            {(isApproved || isRejected) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-blue-200 hover:bg-blue-50 hover:text-blue-700">
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
            
            {canArchive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-yellow-200 hover:bg-yellow-50 hover:text-yellow-700">
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
            
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
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
