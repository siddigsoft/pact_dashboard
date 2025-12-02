import { MMPFile } from '@/types';
import { CSVValidationError } from '@/utils/csvValidator';
import { toast } from 'sonner';
import { uploadMMPFile } from '@/utils/mmpFileUpload';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { supabase } from '@/integrations/supabase/client';

export const useMMPUpload = (addMMPFile: (mmp: MMPFile) => void) => {
  const uploadMMP = async (
    file: File,
    metadata?: string | { name?: string; hub?: string; month?: string; projectId?: string },
    onProgress?: (progress: { current: number; total: number; stage: string }) => void
  ): Promise<{ success: boolean; id?: string; mmp?: MMPFile; error?: string; validationReport?: string; validationErrors?: CSVValidationError[]; validationWarnings?: CSVValidationError[] }> => {
    try {
      console.log('Starting MMP upload process for file:', file.name, 'with metadata:', metadata);

      const normalized = typeof metadata === 'string' ? { projectId: metadata } : metadata;

      const { success, mmpData, error, validationReport, validationErrors, validationWarnings } = await uploadMMPFile(file, normalized, onProgress);

      if (!success || error) {
        console.error('Error uploading MMP:', error);
        toast.error(`Error uploading MMP: ${error}`);
        return { success: false, error, validationReport, validationErrors, validationWarnings };
      }

      if (mmpData) {
        console.log('MMP uploaded successfully, adding to context:', mmpData);
        addMMPFile(mmpData);
        toast.success(`${file.name} uploaded successfully`);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user && mmpData.id) {
          NotificationTriggerService.mmpUploadComplete(
            user.id,
            mmpData.name || file.name,
            mmpData.entries || 0,
            mmpData.id
          ).catch(err => console.error('Failed to send upload notification:', err));
        }
        
        return { success: true, id: mmpData.id, mmp: mmpData, validationReport, validationErrors, validationWarnings };
      }

      return { success: false, error: 'Upload finished without returning data', validationReport, validationErrors, validationWarnings };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error in MMP upload:', err);
      toast.error(`Upload failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  };

  return {
    uploadMMP,
  };
};
