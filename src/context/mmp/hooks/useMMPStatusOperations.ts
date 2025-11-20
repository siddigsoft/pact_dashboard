
import { useCallback } from 'react';
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const useMMPStatusOperations = (setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  const archiveMMP = useCallback(
    async (id: string, archivedBy: string) => {
      try {
        const timestamp = new Date().toISOString();

        // Persist to database first
        const { error } = await supabase
          .from('mmp_files')
          .update({
            status: 'archived',
            archivedby: archivedBy,
            archivedat: timestamp,
            updated_at: timestamp,
          })
          .eq('id', id);

        if (error) {
          console.error('Supabase archive error:', error);
          toast.error('Database update failed');
          throw error;
        }

        // Update local state after successful DB write
        setMMPFiles((prev: MMPFile[]) =>
          (prev || []).map((mmp) =>
            mmp.id === id
              ? { ...mmp, status: 'archived', archivedBy, archivedAt: timestamp }
              : mmp
          )
        );

        toast.success('MMP file archived successfully');
      } catch (error) {
        console.error('Error archiving MMP file:', error);
        toast.error('Failed to archive MMP file');
        throw error;
      }
    },
    [setMMPFiles]
  );

  const approveMMP = useCallback(
    async (id: string, approvedBy: string) => {
      try {
        const timestamp = new Date().toISOString();

        // Persist to DB first
        const { error } = await supabase
          .from('mmp_files')
          .update({
            status: 'approved',
            approvedby: approvedBy,
            approvedat: timestamp,
            updated_at: timestamp,
          })
          .eq('id', id);

        if (error) {
          console.error('Supabase approve error:', error);
          toast.error('Database update failed');
          throw error;
        }

        // Update local state after successful DB write
        setMMPFiles((prev: MMPFile[]) =>
          (prev || []).map((mmp) =>
            mmp.id === id
              ? { ...mmp, status: 'approved', approvedBy, approvedAt: timestamp }
              : mmp
          )
        );

        toast.success('MMP file approved successfully');
      } catch (error) {
        console.error('Error approving MMP file:', error);
        toast.error('Failed to approve MMP file');
        throw error;
      }
    },
    [setMMPFiles]
  );

  const rejectMMP = useCallback(
    async (id: string, rejectionReason: string) => {
      try {
        const timestamp = new Date().toISOString();

        // Persist to DB first
        const { error } = await supabase
          .from('mmp_files')
          .update({
            status: 'rejected',
            rejectionreason: rejectionReason,
            updated_at: timestamp,
          })
          .eq('id', id);

        if (error) {
          console.error('Supabase reject error:', error);
          toast.error('Database update failed');
          throw error;
        }

        // Update local state after successful DB write
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
    [setMMPFiles]
  );

  return {
    archiveMMP,
    approveMMP,
    rejectMMP,
  };
};

