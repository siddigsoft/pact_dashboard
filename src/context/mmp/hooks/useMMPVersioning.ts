
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const useMMPVersioning = (setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  const updateMMPVersion = async (id: string, changes: string): Promise<boolean> => {
    try {
      // First update local state
      let versionUpdated = false;
      
      setMMPFiles((prev: MMPFile[]) =>
        (prev || []).map((mmp) => {
          if (mmp.id === id) {
            const newVersion = {
              major: mmp.version?.major || 1,
              minor: (mmp.version?.minor || 0) + 1,
              updatedAt: new Date().toISOString()
            };
            
            const updatedMMP = {
              ...mmp,
              version: newVersion,
              modifiedAt: new Date().toISOString(),
              modificationHistory: [
                ...(mmp.modificationHistory || []),
                {
                  timestamp: new Date().toISOString(),
                  modifiedBy: 'Current User',
                  changes,
                  previousVersion: `${mmp.version?.major || 1}.${mmp.version?.minor || 0}`,
                  newVersion: `${newVersion.major}.${newVersion.minor}`
                }
              ]
            };
            
            versionUpdated = true;
            
            // Update database via Supabase (if connected)
            try {
              supabase
                .from('mmp_files')
                .update({
                  version: newVersion,
                  updated_at: new Date().toISOString(),
                  modificationhistory: updatedMMP.modificationHistory
                })
                .eq('id', id)
                .then(({ error }) => {
                  if (error) {
                    console.error('Supabase version update error:', error);
                    toast.error('Database version update failed, using local storage');
                    // Fall back to local storage
                    const existingFiles = JSON.parse(localStorage.getItem('mock_mmp_files') || '[]');
                    const updatedFiles = existingFiles.map((m: MMPFile) => m.id === id ? updatedMMP : m);
                    localStorage.setItem('mock_mmp_files', JSON.stringify(updatedFiles));
                  } else {
                    toast.success('MMP version updated successfully');
                  }
                });
            } catch (dbError) {
              console.error('Database operation failed:', dbError);
              toast.error('Database operation failed, using local storage');
              // Fall back to local storage
              const existingFiles = JSON.parse(localStorage.getItem('mock_mmp_files') || '[]');
              const updatedFiles = existingFiles.map((m: MMPFile) => m.id === id ? updatedMMP : m);
              localStorage.setItem('mock_mmp_files', JSON.stringify(updatedFiles));
            }
            
            return updatedMMP;
          }
          return mmp;
        })
      );
      
      if (!versionUpdated) {
        toast.warning('MMP file not found');
      }
      
      return versionUpdated;
    } catch (error) {
      console.error('Error updating MMP version:', error);
      toast.error('Failed to update MMP version');
      return false;
    }
  };

  return {
    updateMMPVersion,
  };
};
