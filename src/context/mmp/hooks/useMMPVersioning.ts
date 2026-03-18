
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';

export const useMMPVersioning = (setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  const updateMMPVersion = async (id: string, changes: string): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast.error(session.error || 'Session expired. Please refresh and try again.');
      return false;
    }

    try {
      let versionUpdated = false;
      let updatedMMP: MMPFile | null = null;
      
      setMMPFiles((prev: MMPFile[]) =>
        (prev || []).map((mmp) => {
          if (mmp.id === id) {
            const newVersion = {
              major: mmp.version?.major || 1,
              minor: (mmp.version?.minor || 0) + 1,
              updatedAt: new Date().toISOString()
            };
            
            updatedMMP = {
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
            return updatedMMP;
          }
          return mmp;
        })
      );
      
      if (!versionUpdated || !updatedMMP) {
        toast.warning('MMP file not found');
        return false;
      }

      const newVersion = updatedMMP.version!;
      const { error } = await withTimeout(
        supabase
          .from('mmp_files')
          .update({
            version: newVersion,
            updated_at: new Date().toISOString(),
            modificationhistory: updatedMMP.modificationHistory
          })
          .eq('id', id),
        15000,
        'Update MMP version timed out'
      );

      if (error) {
        console.error('Supabase version update error:', error);
        toast.error('Failed to save version update. Please try again.');
        return false;
      } else {
        toast.success('MMP version updated successfully');
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
