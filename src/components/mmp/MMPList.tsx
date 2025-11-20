
import React from 'react';
import { MMPFile } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { FileText, MoreVertical } from 'lucide-react';
import { MMPStatusBadge } from './MMPStatusBadge';
import { useNavigate } from 'react-router-dom';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
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

interface MMPListProps {
  mmpFiles: MMPFile[];
}

export const MMPList = ({ mmpFiles }: MMPListProps) => {
  const navigate = useNavigate();
  const { deleteMMPFile } = useMMP();
  const { checkPermission, hasAnyRole, currentUser } = useAuthorization();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  // Check if user can delete MMPs (only admin and ICT can delete)
  const canDeleteMMP = checkPermission('mmp', 'delete') || hasAnyRole(['admin', 'ict']);

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
    <div className="grid gap-4">
      {mmpFiles.map((mmp) => (
        <Card
          key={mmp.id}
          className="cursor-pointer hover:bg-accent/5 transition-colors"
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div 
                className="flex items-start gap-3 flex-1 cursor-pointer"
                onClick={() => {
                  // If FOM and federal permit not attached, go to permit message page
                  const isFOM = hasAnyRole(['fom']);
                  if (isFOM && !(mmp.permits && mmp.permits.federal)) {
                    navigate(`/mmp/${mmp.id}/permit-message`);
                  } else {
                    navigate(`/mmp/${mmp.id}/view`);
                  }
                }}
              >
                <div className="mt-1">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">{mmp.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    MMP ID: {mmp.mmpId}
                    {mmp.projectName && <span> • Project: {mmp.projectName}</span>}
                    {mmp.hub && <span> • Hub: {mmp.hub}</span>}
                    {mmp.month && <span> • Month: {new Date(2024, parseInt(mmp.month) - 1).toLocaleDateString('en-US', { month: 'long' })}</span>}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                      Uploaded {format(new Date(mmp.uploadedAt), 'MMM d, yyyy')}
                    </span>
                    <span>•</span>
                    <span>by {mmp.uploadedBy || 'Unknown (User)'}</span>
                    <span>•</span>
                    <span>{mmp.entries} entries</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MMPStatusBadge status={mmp.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="ml-2 p-2 rounded-full hover:bg-accent/30 focus:outline-none"
                      onClick={e => e.stopPropagation()}
                      aria-label="File management options"
                    >
                      <MoreVertical className="h-5 w-5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/view`)}>
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/edit`)}>
                        Edit
                      </DropdownMenuItem>

                      {/* FOM: No verify/reject options, only permit upload and preview flow */}

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
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Confirmation Dialog - Outside the dropdown to persist */}
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
    </div>
  );
};
