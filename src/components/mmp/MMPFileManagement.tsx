import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';
import { Archive, Send, Upload, Eye, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { checkRecallAllowed, performRecall } from '@/utils/recallUtils';

interface MMPFileManagementProps {
  mmpFile: any;
  canArchive?: boolean;
  canDelete?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
  onResetApproval?: () => void;
  canApprove?: boolean;
  onApprove?: () => void;
  canForward?: boolean;
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

  // --- Forward/Recall logic for New MMPs ---
  const [recalling, setRecalling] = React.useState(false);
  const [isForwarded, setIsForwarded] = React.useState(false);
  const [recallDialogOpen, setRecallDialogOpen] = React.useState(false);
  const { refreshMMPFiles } = useMMP();
  const { toast } = useToast();
  const { currentUser } = useAuthorization();

  React.useEffect(() => {
    const wf = (mmpFile.workflow as any) || {};
    setIsForwarded(Array.isArray(wf.forwardedToFomIds) && wf.forwardedToFomIds.length > 0);
  }, [mmpFile.workflow]);

  const recallCheck = checkRecallAllowed(mmpFile);

  const handleRecall = async () => {
    if (!recallCheck.canRecall) {
      toast({
        title: 'Cannot recall MMP',
        description: recallCheck.reason || 'Work has already started on this MMP',
        variant: 'destructive'
      });
      return;
    }

    setRecalling(true);
    try {
      const recallerName = currentUser?.fullName || currentUser?.email || 'Unknown User';
      const recallerEmail = currentUser?.email;

      const result = await performRecall(mmpFile.id, recallerName, recallerEmail);

      if (!result.success) {
        throw new Error(result.error);
      }

      await refreshMMPFiles();
      setIsForwarded(false);
      setRecallDialogOpen(false);
      toast({
        title: 'MMP recalled successfully',
        description: `FOMs have been notified that the MMP has been recalled.`
      });
    } catch (e: any) {
      toast({ title: 'Recall failed', description: e?.message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setRecalling(false);
    }
  };

  // Only show for New MMPs (not approved)
  const isNewMMP = !isApproved;

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
            {(isApproved || isRejected) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Approval Status
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Approval Status</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset the approval status of the MMP and all its sites. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onResetApproval}>
                      Reset
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {isNewMMP && canForward && (
              isForwarded ? (
                <AlertDialog open={recallDialogOpen} onOpenChange={setRecallDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={recalling || !recallCheck.canRecall}
                      className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm"
                      data-testid="button-recall-mmp"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {recalling ? 'Recalling MMP...' : 'Recall MMP'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Recall MMP
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        {recallCheck.canRecall ? (
                          <>
                            <p>Are you sure you want to recall this MMP? This will:</p>
                            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                              <li>Remove the MMP from all assigned FOMs</li>
                              <li>Send a notification to affected FOMs</li>
                              <li>Log this action for audit purposes</li>
                            </ul>
                          </>
                        ) : (
                          <>
                            <p className="text-destructive font-medium">This MMP cannot be recalled because:</p>
                            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                              {recallCheck.blockers.map((blocker, i) => (
                                <li key={i}>{blocker}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      {recallCheck.canRecall && (
                        <AlertDialogAction
                          onClick={handleRecall}
                          disabled={recalling}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {recalling ? 'Recalling...' : 'Yes, Recall MMP'}
                        </AlertDialogAction>
                      )}
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                onForward && (
                  <Button 
                    onClick={onForward}
                    className="bg-blue-600 text-white hover:bg-blue-700 shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Forward to FOMs
                  </Button>
                )
              )
            )}

            {canActuallyApprove && onApprove && (
              <Button 
                onClick={onApprove}
                className="bg-green-600 text-white hover:bg-green-700 shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm"
              >
                Approve MMP
              </Button>
            )}
            
            {canArchive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm">
                    <Archive className="h-4 w-4 mr-2" />
                    Archive MMP
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive MMP File</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will archive the MMP file. It can be restored later if needed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onArchive}>
                      Archive
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="outline" onClick={() => navigate(`/mmp/${mmpFile.id}/view`)} className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm">
              <Eye className="h-4 w-4 mr-2" />
              View MMP Details
            </Button>
            <Button onClick={() => navigate('/mmp')} className="bg-blue-600 text-white hover:bg-blue-700 shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform duration-150 text-sm">
              <Upload className="h-4 w-4 mr-2" />
              Go to MMP List
            </Button>
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete MMP
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete MMP File</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the MMP file and all associated data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete}>
                      Delete
                    </AlertDialogAction>
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
