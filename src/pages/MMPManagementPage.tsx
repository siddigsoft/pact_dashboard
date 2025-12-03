import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Use the correct AppRole value for field operation manager (per schema)
const FIELD_OP_ROLE = 'Field Operation Manager (FOM)';

const FieldOperationManagerPage = () => {
  const { currentUser, roles } = useAppContext();
  const { mmpFiles, deleteMMPFile } = useMMP();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  // Check if user can delete MMPs (only admin and ICT can delete)
  const canDeleteMMP = checkPermission('mmp', 'delete') || hasAnyRole(['admin', 'Admin', 'ict', 'ICT']);

  // Check access: Admin or Field Operation Manager
  const allowed = hasAnyRole(['admin', 'Admin']) || hasAnyRole(['fom', 'Field Operation Manager (FOM)', FIELD_OP_ROLE]);
  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-white rounded-xl shadow text-center">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-600">You do not have permission to view this page.</p>
      </div>
    );
  }

  // Calculate total sites per hub (fallback to 0 if not present)
  const sitesPerHub = useMemo(() => {
    const map: Record<string, number> = {};
    (mmpFiles || []).forEach(mmp => {
      // Use mmp.hub if exists, else fallback to mmp.projectHub or 'Unknown'
      const hub = (mmp as any).hub || (mmp as any).projectHub || 'Unknown';
      // Use mmp.sites?.length if exists, else mmp.siteCount, else 0
      const siteCount =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites.length
          : typeof (mmp as any).siteCount === 'number'
            ? (mmp as any).siteCount
            : 0;
      map[hub] = (map[hub] || 0) + siteCount;
    });
    return map;
  }, [mmpFiles]);

  return (
    <div className="container mx-auto p-6 md:p-10 space-y-8">
      <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">
        Field Operation Manager Page
      </h1>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Review and forward MMPs to related hubs before site-level execution.
      </p>

      <Card className="mb-8 p-6">
        <h2 className="text-xl font-semibold mb-4">Uploaded MMPs</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="px-4 py-2 text-left">MMP Name</th>
                <th className="px-4 py-2 text-left">Upload Date</th>
                <th className="px-4 py-2 text-left">Uploaded By</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Hub</th>
                <th className="px-4 py-2 text-left">Total Sites</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(mmpFiles || []).map(mmp => {
                // uploadedBy may be a string in format "Name (Role)" or an object
                const uploadedBy = (mmp as any).uploadedBy;
                let uploadedByName = '-';
                let uploadedByRole = '-';
                if (typeof uploadedBy === 'object' && uploadedBy !== null) {
                  uploadedByName = uploadedBy.name || uploadedBy.fullName || uploadedBy.email || '-';
                  uploadedByRole = uploadedBy.role || '-';
                } else if (typeof uploadedBy === 'string') {
                  const match = uploadedBy.match(/^(.*)\s*\(([^)]+)\)\s*$/);
                  if (match) {
                    uploadedByName = match[1].trim() || '-';
                    uploadedByRole = match[2].trim() || '-';
                  } else {
                    uploadedByName = uploadedBy;
                  }
                }
                const hub = (mmp as any).hub || (mmp as any).projectHub || '-';
                const siteCount =
                  Array.isArray((mmp as any).sites)
                    ? (mmp as any).sites.length
                    : typeof (mmp as any).siteCount === 'number'
                      ? (mmp as any).siteCount
                      : 0;
                return (
                  <tr key={mmp.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{(mmp as any).projectName || mmp.mmpId}</td>
                    <td className="px-4 py-2">{mmp.uploadedAt ? new Date(mmp.uploadedAt).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-2">{uploadedByName}</td>
                    <td className="px-4 py-2">
                      <Badge variant={uploadedByRole === 'Admin' ? 'default' : 'outline'}>
                        {uploadedByRole}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{hub}</td>
                    <td className="px-4 py-2">{siteCount}</td>
                    <td className="px-4 py-2 flex gap-2 items-center">
                      <button
                        className="text-primary hover:underline text-xs"
                        onClick={() => navigate(`/mmp/${mmp.id}`)}
                      >
                        View
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="destructive" className="ml-2" onClick={() => setDeleteId(mmp.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete MMP File "{mmp.projectName || mmp.mmpId}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. The MMP file and all its data will be permanently deleted from the system.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={deleting}
                              onClick={async () => {
                                setDeleting(true);
                                await deleteMMPFile(mmp.id);
                                setDeleting(false);
                                setDeleteId(null);
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                );
              })}
              {(!mmpFiles || mmpFiles.length === 0) && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted-foreground">
                    No MMPs uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Total Sites Per Hub</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(sitesPerHub).map(([hub, count]) => (
            <div key={hub} className="bg-blue-50 dark:bg-gray-800 rounded-lg p-4 flex flex-col items-center">
              <div className="text-lg font-bold">{hub}</div>
              <div className="text-2xl font-extrabold text-blue-700">{count}</div>
              <div className="text-xs text-muted-foreground">Total Sites</div>
            </div>
          ))}
          {Object.keys(sitesPerHub).length === 0 && (
            <div className="text-center text-muted-foreground col-span-full">No data available.</div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default FieldOperationManagerPage;