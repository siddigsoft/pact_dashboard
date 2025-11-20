
import { useState } from 'react';
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadMMPFile } from '@/utils/mmpFileUpload';

export const useMMPOperations = (mmpFiles: MMPFile[], setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  const [currentMMP, setCurrentMMP] = useState<MMPFile | null>(null);

  const getMmpById = (id: string): MMPFile | undefined => {
    if (!id || !mmpFiles?.length) {
      console.log('No ID provided or no MMP files available');
      return undefined;
    }
    
    console.log('Current ID from URL:', id);
    console.log('Available MMP files:', mmpFiles?.length || 0);
    
    const mmp = mmpFiles.find(m => m.id === id);
    console.log('Found MMP file:', mmp ? 'Found' : 'Not found');
    
    return mmp;
  };

  const addMMPFile = (mmp: MMPFile) => {
    try {
      console.log('Adding new MMP file:', mmp);
      setMMPFiles((prev: MMPFile[]) => [...(prev || []), mmp]);
      // Do not insert here; upload flow handles DB insert
      toast.success('MMP file added');
    } catch (error) {
      console.error('Error adding MMP file:', error);
      toast.error('Failed to add MMP file');
    }
  };

  const updateMMPFile = (mmp: MMPFile) => {
    try {
      setMMPFiles((prev: MMPFile[]) =>
        (prev || []).map((m) => (m.id === mmp.id ? mmp : m))
      );

      // Update database via Supabase with snake_case mapping
      const mapToDB = (m: Partial<MMPFile>) => {
        const map: Record<string, string> = {
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
        const out: any = { updated_at: new Date().toISOString() };
        Object.entries(m).forEach(([k, v]) => {
          const dbk = (map as any)[k] || k;
          out[dbk] = v as any;
        });
        return out;
      };

      const dbPayload = mapToDB(mmp);
      supabase
        .from('mmp_files')
        .update(dbPayload)
        .eq('id', mmp.id)
        .then(({ error }) => {
          if (error) {
            console.error('Supabase update error:', error);
            toast.error('Database update failed');
          } else {
            toast.success('MMP file updated');
          }
        });
    } catch (error) {
      console.error('Error updating MMP file:', error);
      toast.error('Failed to update MMP file');
    }
  };

  const deleteMMPFile = async (id: string): Promise<boolean> => {
    try {
      // Delete from DB first to ensure it persists across refresh
      const { error } = await supabase
        .from('mmp_files')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase delete error:', error);
        toast.error('Database delete failed. Check permissions/RLS and try again.');
        return false;
      }

      // Only update local state after successful DB delete
      setMMPFiles((prev: MMPFile[]) => (prev || []).filter((mmp) => mmp.id !== id));
      toast.success('MMP file deleted');
      return true;
    } catch (error) {
      console.error('Error deleting MMP file:', error);
      toast.error('Failed to delete MMP file');
      return false;
    }
  };

  return {
    currentMMP,
    setCurrentMMP,
    getMmpById,
    addMMPFile,
    updateMMPFile,
    deleteMMPFile,
  };
};
