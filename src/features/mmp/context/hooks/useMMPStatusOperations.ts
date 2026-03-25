import { useCallback } from 'react';
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';
import {
  verifyMMPRecord,
  archiveMMPRecord,
  approveMMPRecord,
  rejectMMPRecord,
} from '@/features/mmp/repository/mmpRepository';

export const useMMPStatusOperations = (setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  const verifyMMP = useCallback(
    async (id: string, verifiedBy: string, verifiedByName?: string) => {
      const session = await ensureValidSession();
      if (!session.success) {
        toast.error(session.error || 'Session expired. Please refresh and try again.');
        throw new Error(session.error || 'Session expired');
      }

      try {
        await withTimeout(
          (async () => {
            const timestamp = new Date().toISOString();
            const name = verifiedByName || 'Unknown';
            await verifyMMPRecord(id, verifiedBy, name);

            setMMPFiles((prev: MMPFile[]) =>
              (prev || []).map((mmp) =>
                mmp.id === id
                  ? {
                      ...mmp,
                      status: 'verified',
                      verifiedBy,
                      verifiedAt: timestamp,
                      comprehensiveVerification: {
                        ...mmp.comprehensiveVerification,
                        overallStatus: 'complete',
                        canProceedToApproval: true,
                        verified_by: verifiedBy,
                        verified_by_name: name,
                        verified_at: timestamp,
                        systemValidation: {
                          ...(mmp.comprehensiveVerification?.systemValidation || {}),
                          status: 'complete',
                        },
                        contentVerification: {
                          ...(mmp.comprehensiveVerification?.contentVerification || {}),
                          status: 'complete',
                          fileReviewed: true,
                          contentValidated: true,
                        },
                        cpVerification: {
                          ...(mmp.comprehensiveVerification?.cpVerification || {}),
                          verificationStatus: 'complete',
                        },
                        permitVerification: {
                          ...(mmp.comprehensiveVerification?.permitVerification || {}),
                          status: 'complete',
                          permits: mmp.comprehensiveVerification?.permitVerification?.permits || [],
                        },
                      },
                    } as MMPFile
                  : mmp
              )
            );

            toast.success('MMP verified successfully! It can now proceed to approval and costing.');
          })(),
          15000,
          'Verify MMP timed out',
        );
      } catch (error) {
        console.error('Error verifying MMP file:', error);
        toast.error('Failed to verify MMP file');
        throw error;
      }
    },
    [setMMPFiles],
  );

  const archiveMMP = useCallback(
    async (id: string, archivedBy: string) => {
      const session = await ensureValidSession();
      if (!session.success) {
        toast.error(session.error || 'Session expired. Please refresh and try again.');
        throw new Error(session.error || 'Session expired');
      }

      try {
        const timestamp = new Date().toISOString();
        await withTimeout(archiveMMPRecord(id, archivedBy), 15000, 'Archive MMP timed out');

        setMMPFiles((prev: MMPFile[]) =>
          (prev || []).map((mmp) =>
            mmp.id === id ? { ...mmp, status: 'archived', archivedBy, archivedAt: timestamp } : mmp
          )
        );
        toast.success('MMP file archived successfully');
      } catch (error) {
        console.error('Error archiving MMP file:', error);
        toast.error('Failed to archive MMP file');
        throw error;
      }
    },
    [setMMPFiles],
  );

  const approveMMP = useCallback(
    async (id: string, approvedBy: string) => {
      const session = await ensureValidSession();
      if (!session.success) {
        toast.error(session.error || 'Session expired. Please refresh and try again.');
        throw new Error(session.error || 'Session expired');
      }

      try {
        const timestamp = new Date().toISOString();
        await withTimeout(approveMMPRecord(id, approvedBy), 15000, 'Approve MMP timed out');

        setMMPFiles((prev: MMPFile[]) =>
          (prev || []).map((mmp) =>
            mmp.id === id ? { ...mmp, status: 'approved', approvedBy, approvedAt: timestamp } : mmp
          )
        );
        toast.success('MMP file approved successfully');
      } catch (error) {
        console.error('Error approving MMP file:', error);
        toast.error('Failed to approve MMP file');
        throw error;
      }
    },
    [setMMPFiles],
  );

  const rejectMMP = useCallback(
    async (id: string, rejectionReason: string) => {
      const session = await ensureValidSession();
      if (!session.success) {
        toast.error(session.error || 'Session expired. Please refresh and try again.');
        throw new Error(session.error || 'Session expired');
      }

      try {
        const timestamp = new Date().toISOString();
        await withTimeout(rejectMMPRecord(id, rejectionReason), 15000, 'Reject MMP timed out');

        setMMPFiles((prev: MMPFile[]) =>
          (prev || []).map((mmp) =>
            mmp.id === id
              ? { ...mmp, status: 'rejected', rejectionReason, rejectedAt: timestamp }
              : mmp
          )
        );
        toast.success('MMP file rejected');
      } catch (error) {
        console.error('Error rejecting MMP file:', error);
        toast.error('Failed to reject MMP file');
        throw error;
      }
    },
    [setMMPFiles],
  );

  return { verifyMMP, archiveMMP, approveMMP, rejectMMP };
};
