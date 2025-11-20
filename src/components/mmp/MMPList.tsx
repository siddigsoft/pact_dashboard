
import React, { useState } from 'react';
import { MMPFile } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { MoreVertical } from 'lucide-react';
import { MMPStatusBadge } from './MMPStatusBadge';
import { useNavigate } from 'react-router-dom';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import ForwardToFOMDialog from './ForwardToFOMDialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface MMPListProps {
  mmpFiles: MMPFile[];
  showActions?: boolean;
}

export const MMPList = ({ mmpFiles, showActions = true }: MMPListProps) => {
  const navigate = useNavigate();
  const { deleteMMPFile } = useMMP();
  const { checkPermission, hasAnyRole, currentUser } = useAuthorization();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [selectedMMPForForward, setSelectedMMPForForward] = useState<MMPFile | null>(null);
  const [forwardedMMPs, setForwardedMMPs] = useState<Set<string>>(new Set());

  // Check permissions (case-insensitive fallback for possible lowercase stored roles)
  const isAdmin = hasAnyRole(['Admin', 'admin']);
  const isICT = hasAnyRole(['ICT', 'ict']);
  const isFOM = hasAnyRole(['Field Operation Manager (FOM)']);
  const canDeleteMMP = checkPermission('mmp', 'delete') || isAdmin || isICT;
  const canEditMMP = checkPermission('mmp', 'update') || isAdmin || isICT;
  // Allow forwarding if user can update OR has admin/ict role
  const canForwardMMP = checkPermission('mmp', 'update') || isAdmin || isICT;

  // Initialize forwarded status from MMP workflow
  React.useEffect(() => {
    const forwarded = new Set<string>();
    mmpFiles.forEach(mmp => {
      const workflow = mmp.workflow as any;
      if (workflow?.forwardedToFomIds && workflow.forwardedToFomIds.length > 0) {
        forwarded.add(mmp.id);
      }
    });
    setForwardedMMPs(forwarded);
  }, [mmpFiles]);

  const handleForward = (mmp: MMPFile) => {
    setSelectedMMPForForward(mmp);
    setForwardDialogOpen(true);
  };

  const handleForwardComplete = (userIds: string[]) => {
    if (selectedMMPForForward) {
      setForwardedMMPs(prev => new Set(prev).add(selectedMMPForForward.id));
    }
  };

  if (!mmpFiles.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No MMP files uploaded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {mmpFiles.map((mmp) => {
          const isForwarded = forwardedMMPs.has(mmp.id);
          const workflow = mmp.workflow as any;
          const forwardedCount = workflow?.forwardedToFomIds?.length || 0;
          
          return (
            <Card
              key={mmp.id}
              className="hover:shadow-md transition-all"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div 
                    className="flex items-start gap-3 flex-1 cursor-pointer"
                    onClick={() => {
                      // If FOM and federal permit not attached, go to permit verification
                      if (isFOM && !(mmp.permits && (mmp.permits as any).federal)) {
                        navigate(`/mmp/${mmp.id}/verification`);
                      } else {
                        navigate(`/mmp/${mmp.id}/view`);
                      }
                    }}
                  >
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold text-lg">{mmp.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="font-mono text-blue-700">{mmp.mmpId}</span>
                        {mmp.projectName && <span> • Project: {mmp.projectName}</span>}
                        {mmp.hub && <span> • Hub: {mmp.hub}</span>}
                        {mmp.month && <span> • {new Date(2024, parseInt(mmp.month) - 1).toLocaleDateString('en-US', { month: 'long' })}</span>}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Uploaded {format(new Date(mmp.uploadedAt), 'MMM d, yyyy')}
                        </span>
                        <span>•</span>
                        <span>by {mmp.uploadedBy || 'Unknown'}</span>
                        <span>•</span>
                        <span className="font-semibold">{mmp.entries} sites</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <MMPStatusBadge status={mmp.status} />
                        {isForwarded && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Forwarded to {forwardedCount} FOM(s)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Quick Links Dropdown Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-2 rounded-full hover:bg-accent/30 focus:outline-none"
                        onClick={e => e.stopPropagation()}
                        aria-label="More options"
                      >
                        <MoreVertical className="h-5 w-5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/view`)}>
                        View Details
                      </DropdownMenuItem>
                      
                      {canEditMMP && !isForwarded && (
                        <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/edit`)}>
                          Edit MMP
                        </DropdownMenuItem>
                      )}
                      
                      {canForwardMMP && !isForwarded && (
                        <DropdownMenuItem onClick={() => handleForward(mmp)}>
                          Forward to FOM
                        </DropdownMenuItem>
                      )}
                      
                      {isFOM && !isAdmin && !isICT && !(mmp.permits && (mmp.permits as any).federal) && (
                        <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/verification`)}>
                          Upload Permits
                        </DropdownMenuItem>
                      )}
                      
                      {/* Admin/ICT Pending Forwarded: Permit upload & forward to coordinators (show before delete) */}
                      {(isAdmin || isICT) && isForwarded && !(mmp.permits && (mmp.permits as any).federal) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => navigate(`/mmp/${mmp.id}/verification`)}
                          >
                            Upload Permits & Forward to Coordinators
                          </DropdownMenuItem>
                        </>
                      )}
                      {canDeleteMMP && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={deletingId === mmp.id}
                            onClick={e => {
                              e.stopPropagation();
                              setConfirmId(mmp.id);
                            }}
                            className="text-destructive"
                          >
                            Delete MMP
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Forward Dialog */}
      {selectedMMPForForward && (
        <ForwardToFOMDialog
          open={forwardDialogOpen}
          onOpenChange={setForwardDialogOpen}
          mmpId={selectedMMPForForward.id}
          mmpName={selectedMMPForForward.name}
          onForwarded={handleForwardComplete}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={confirmId !== null} onOpenChange={open => { if (!open) setConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MMP File?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this MMP file and all its data? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingId === confirmId}
              onClick={async () => {
                if (confirmId) {
                  setDeletingId(confirmId);
                  await deleteMMPFile(confirmId);
                  setDeletingId(null);
                  setConfirmId(null);
                }
              }}
            >
              {deletingId === confirmId ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
