import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';
import { Archive, Send, Upload, Eye, Trash2, RotateCcw } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
  const { refreshMMPFiles } = useMMP();
  const { toast } = useToast();

  React.useEffect(() => {
    const wf = (mmpFile.workflow as any) || {};
    setIsForwarded(Array.isArray(wf.forwardedToFomIds) && wf.forwardedToFomIds.length > 0);
  }, [mmpFile.workflow]);

  const handleRecall = async () => {
    setRecalling(true);
    try {
      const { data, error } = await supabase
        .from('mmp_files')
        .select('workflow')
        .eq('id', mmpFile.id)
        .single();
      if (error) throw error;
      const wf = (data?.workflow as any) || {};
      wf.forwardedToFomIds = [];
      await supabase.from('mmp_files').update({ workflow: wf }).eq('id', mmpFile.id);
      await refreshMMPFiles();
      setIsForwarded(false);
      toast({ title: 'MMP recalled', description: 'Forwarding to FOMs has been recalled.' });
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
                <Button
                  variant="destructive"
                  onClick={handleRecall}
                  disabled={recalling}
                  className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm"
                >
                  {recalling ? 'Recalling MMP…' : 'Recall MMP'}
                </Button>
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
