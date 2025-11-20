import { MMPFile } from '@/types';
import { CSVValidationError } from '@/utils/csvValidator';
import { toast } from 'sonner';
import { uploadMMPFile } from '@/utils/mmpFileUpload';

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
        return { success: true, id: mmpData.id, mmp: mmpData, validationReport, validationErrors, validationWarnings };
      }

      return { success: false, error: 'Upload finished without returning data', validationReport, validationErrors, validationWarnings }; // Fallback
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
