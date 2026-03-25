import { useState } from 'react';
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { uploadMMPFile } from '@/utils/mmpFileUpload';
import { logDeletionAudit } from '@/services/mmpAudit.service';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';
import { supabase } from '@/integrations/supabase/client';
import {
  updateMMPFileRecord,
  deleteMMPFileCascade,
} from '@/features/mmp/repository/mmpRepository';

// camelCase → snake_case map shared by updateMMPFile and updateMMPFile (full)
const CAMEL_TO_DB: Record<string, string> = {
  uploadedAt: 'uploaded_at',
  uploadedBy: 'uploaded_by',
  processedEntries: 'processed_entries',
  mmpId: 'mmp_id',
  filePath: 'file_path',
  originalFilename: 'original_filename',
  fileUrl: 'file_url',
  approvalWorkflow: 'approval_workflow',
  siteEntries: 'site_entries',
  projectName: 'project_name',
  cpVerification: 'cp_verification',
  rejectionReason: 'rejection_reason',
  approvedBy: 'approved_by',
  approvedAt: 'approved_at',
  archivedBy: 'archived_by',
  archivedAt: 'archived_at',
  deletedBy: 'deleted_by',
  deletedAt: 'deleted_at',
  expiryDate: 'expiry_date',
  modificationHistory: 'modification_history',
  modifiedAt: 'modified_at',
};

function toDBPayload(m: Partial<MMPFile>): Record<string, any> {
  const out: any = { updated_at: new Date().toISOString() };
  Object.entries(m).forEach(([k, v]) => {
    out[CAMEL_TO_DB[k] || k] = v;
  });
  return out;
}

export const useMMPOperations = (mmpFiles: MMPFile[], setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  const [currentMMP, setCurrentMMP] = useState<MMPFile | null>(null);

  const getMmpById = (id: string): MMPFile | undefined => {
    if (!id || !mmpFiles?.length) return undefined;
    return mmpFiles.find(m => m.id === id);
  };

  const addMMPFile = (mmp: MMPFile) => {
    try {
      setMMPFiles((prev: MMPFile[]) => [...(prev || []), mmp]);
      toast.success('MMP file added');
    } catch (error) {
      console.error('Error adding MMP file:', error);
      toast.error('Failed to add MMP file');
    }
  };

  const updateMMPFile = async (mmp: MMPFile) => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast.error(session.error || 'Session expired. Please refresh and try again.');
      return;
    }

    try {
      setMMPFiles((prev: MMPFile[]) => (prev || []).map((m) => (m.id === mmp.id ? mmp : m)));

      await withTimeout(
        updateMMPFileRecord(mmp.id, toDBPayload(mmp)),
        15000,
        'Update MMP file timed out',
      );

      toast.success('MMP file updated');
    } catch (error) {
      console.error('Error updating MMP file:', error);
      toast.error('Failed to update MMP file');
    }
  };

  const deleteMMPFile = async (id: string): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast.error(session.error || 'Session expired. Please refresh and try again.');
      return false;
    }

    try {
      return await withTimeout(
        (async () => {
          const mmpToDelete = mmpFiles.find(m => m.id === id);
          const mmpName = mmpToDelete?.name || mmpToDelete?.mmpId || 'Unknown MMP';

          // Get current user for audit
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUser = sessionData?.session?.user;

          await deleteMMPFileCascade(id, { mmpId: mmpToDelete?.mmpId, filePath: mmpToDelete?.filePath });

          // Audit log (not a DB concern — stays in hook)
          try {
            await logDeletionAudit(
              'mmp', id, mmpName,
              currentUser?.id || 'unknown',
              currentUser?.user_metadata?.full_name || currentUser?.email,
              currentUser?.email,
              'MMP file deleted',
              undefined,
              { mmpStatus: mmpToDelete?.status, deletedAt: new Date().toISOString() },
            );
          } catch (auditError) {
            console.warn('[MMP Delete] Audit log failed:', auditError);
          }

          setMMPFiles((prev: MMPFile[]) => (prev || []).filter((mmp) => mmp.id !== id));
          toast.success('MMP file deleted');
          return true;
        })(),
        30000,
        'Delete MMP file timed out',
      );
    } catch (error) {
      console.error('Error deleting MMP file:', error);
      toast.error('Failed to delete MMP file');
      return false;
    }
  };

  return { currentMMP, setCurrentMMP, getMmpById, addMMPFile, updateMMPFile, deleteMMPFile };
};
