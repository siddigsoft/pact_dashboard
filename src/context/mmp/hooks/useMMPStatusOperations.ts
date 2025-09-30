
import { useCallback } from 'react';
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const useMMPStatusOperations = (setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  const archiveMMP = useCallback(
    (id: string, archivedBy: string) => {
    try {
      // Update local state
      setMMPFiles((prev: MMPFile[]) =>
        (prev || []).map((mmp) =>
          mmp.id === id
            ? {
                ...mmp,
                status: 'archived',
                archivedBy,
                archivedAt: new Date().toISOString(),
              }
            : mmp
        )
      );

      // Update database via Supabase
      supabase
        .from('mmp_files')
        .update({
          status: 'archived',
          archived_by: archivedBy,
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error('Supabase archive error:', error);
            toast.error('Database update failed');
          } else {
            toast.success('MMP file archived successfully');
          }
        });
    } catch (error) {
      console.error('Error archiving MMP file:', error);
      toast.error('Failed to archive MMP file');
    }
  }, [setMMPFiles]);

  const approveMMP = useCallback(
    (id: string, approvedBy: string) => {
    try {
      // Update local state
      setMMPFiles((prev: MMPFile[]) =>
        (prev || []).map((mmp) =>
          mmp.id === id
            ? {
                ...mmp,
                status: 'approved',
                approvedBy,
                approvedAt: new Date().toISOString(),
              }
            : mmp
        )
      );
      
      // Update database via Supabase with approver metadata (columns now exist)
      try {
        supabase
          .from('mmp_files')
          .update({ 
            status: 'approved',
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              console.error('Supabase approve error:', error);
              toast.error('Database update failed');
            } else {
              toast.success('MMP file approved successfully');
            }
          });
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        toast.error('Database operation failed');
      }
    } catch (error) {
      console.error('Error approving MMP file:', error);
      toast.error('Failed to approve MMP file');
    }
  }, [setMMPFiles]);

  const rejectMMP = useCallback(
    (id: string, rejectionReason: string) => {
    try {
      // Update local state
      setMMPFiles((prev: MMPFile[]) =>
        (prev || []).map((mmp) => {
          if (mmp.id === id) {
            return {
              ...mmp,
              status: 'rejected',
              rejectionReason,
              rejectedAt: new Date().toISOString(),
            };
          }
          return mmp;
        })
      );
      
      // Update database via Supabase (if connected)
      try {
        supabase
          .from('mmp_files')
          .update({ 
            status: 'rejected', 
            rejection_reason: rejectionReason,
            updated_at: new Date().toISOString() 
          })
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              console.error('Supabase reject error:', error);
              toast.error('Database update failed');
            } else {
              toast.success('MMP file rejected');
            }
          });
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        toast.error('Database operation failed');
      }
    } catch (error) {
      console.error('Error rejecting MMP file:', error);
      toast.error('Failed to reject MMP file');
    }
  }, [setMMPFiles]);

  return {
    archiveMMP,
    approveMMP,
    rejectMMP,
  };
};
