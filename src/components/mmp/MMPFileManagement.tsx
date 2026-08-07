import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { Archive, Send, Upload, Eye, Trash2, RotateCcw, AlertTriangle, Link2Off } from 'lucide-react';
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
  canReject?: boolean;
  onReject?: () => void;
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
  canReject,
  onReject,
  canForward,
  onForward
}: MMPFileManagementProps) => {
  const navigate = useNavigate();
  const isApproved = mmpFile.status === 'approved';
  const isRejected = mmpFile.status === 'rejected';
  const isVerificationComplete = mmpFile.comprehensiveVerification?.canProceedToApproval || false;
  const canActuallyApprove = canApprove && isVerificationComplete;

  // --- Forward/Recall logic for New MMPs ---
  const [recalling, setRecalling] = useState(false);
  const [isForwarded, setIsForwarded] = useState(false);
  const [recallDialogOpen, setRecallDialogOpen] = useState(false);
  const { refreshMMPFiles } = useMMP();
  const { toast } = useToast();
  const { currentUser } = useAuthorization();

  // --- Delete pre-check ---
  const [deleteBlocked, setDeleteBlocked] = useState<{
    downPayments: number;
    costSubmissions: number;
  } | null>(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  const handleDeleteClick = async () => {
    setCheckingDelete(true);
    try {
      const { data: entryIds } = await supabase
        .from('mmp_site_entries').select('id').eq('mmp_file_id', mmpFile.id);
      const ids = (entryIds ?? []).map((e: any) => e.id as string);

      const [dpRes, costRes] = await Promise.all([
        ids.length > 0
          ? supabase.from('down_payment_requests').select('id', { count: 'exact', head: true }).in('mmp_site_entry_id', ids)
          : Promise.resolve({ count: 0, error: null }),
        supabase.from('operational_cost_submissions').select('id', { count: 'exact', head: true }).eq('mmp_id', mmpFile.id),
      ]);

      const dp   = dpRes.count   ?? 0;
      const cost = costRes.count ?? 0;

      if (dp > 0 || cost > 0) {
        setDeleteBlocked({ downPayments: dp, costSubmissions: cost });
        setBlockedDialogOpen(true);
      }
      // else — proceed to the normal AlertDialog below (open it programmatically)
      // We use a separate state flag to open the real dialog only when unblocked.
      else {
        setDeleteBlocked(null);
        setBlockedDialogOpen(false);
        // trigger the real AlertDialog
        document.getElementById('mmp-delete-trigger')?.click();
      }
    } catch {
      // If check fails, allow the normal flow — deleteMMPFile has its own guard
      document.getElementById('mmp-delete-trigger')?.click();
    } finally {
      setCheckingDelete(false);
    }
  };

  useEffect(() => {
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

            {canReject && onReject && !isRejected && (
              <Button 
                onClick={onReject}
                variant="destructive"
                className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm"
                data-testid="button-reject-mmp"
              >
                Reject MMP
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
              <>
                {/* Pre-check button — runs link check before opening dialog */}
                <Button
                  variant="destructive"
                  className="shadow hover:shadow-md active:scale-95 active:translate-y-0.5 transition transform text-sm"
                  onClick={handleDeleteClick}
                  disabled={checkingDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {checkingDelete ? 'Checking…' : 'Delete MMP'}
                </Button>

                {/* Real confirm dialog — opened programmatically when not blocked */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button id="mmp-delete-trigger" className="sr-only" aria-hidden />
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

                {/* Blocked dialog — shown when linked submissions prevent deletion */}
                <Dialog open={blockedDialogOpen} onOpenChange={setBlockedDialogOpen}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        Delete Blocked — Linked Submissions
                      </DialogTitle>
                      <DialogDescription className="pt-1 text-sm leading-relaxed">
                        This MMP cannot be deleted because it has linked field submissions:
                        <ul className="mt-2 space-y-1 list-disc list-inside text-foreground">
                          {(deleteBlocked?.downPayments ?? 0) > 0 && (
                            <li><strong>{deleteBlocked!.downPayments}</strong> advance request{deleteBlocked!.downPayments !== 1 ? 's' : ''}</li>
                          )}
                          {(deleteBlocked?.costSubmissions ?? 0) > 0 && (
                            <li><strong>{deleteBlocked!.costSubmissions}</strong> cost submission{deleteBlocked!.costSubmissions !== 1 ? 's' : ''}</li>
                          )}
                        </ul>
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                      {/* Option 1: Archive (safe) */}
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          <Archive className="h-4 w-4 text-muted-foreground" /> Archive MMP (Recommended)
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Hides the MMP from regular views without losing any data. Linked submissions stay intact.
                        </p>
                        {onArchive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 w-full"
                            onClick={() => { setBlockedDialogOpen(false); onArchive(); }}
                          >
                            Archive this MMP
                          </Button>
                        )}
                      </div>

                      {/* Option 2: Go to list for Unlink & Delete */}
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          <Link2Off className="h-4 w-4 text-muted-foreground" /> Unlink &amp; Delete
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Detaches all linked submissions (they are preserved, only the MMP link is removed), then permanently deletes the MMP. Available from the MMP List page.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full"
                          onClick={() => { setBlockedDialogOpen(false); navigate('/mmp'); }}
                        >
                          Go to MMP List →
                        </Button>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setBlockedDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default MMPFileManagement;
