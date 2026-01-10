
import { useCallback } from 'react';
import { MMPFile } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const useMMPStatusOperations = (setMMPFiles: React.Dispatch<React.SetStateAction<MMPFile[]>>) => {
  // Verify MMP - marks the MMP as verified after FOM/Admin review
  const verifyMMP = useCallback(
    async (id: string, verifiedBy: string, verifiedByName?: string) => {
      try {
        const timestamp = new Date().toISOString();
        
        // First, fetch the current MMP to get existing workflow (which contains comprehensiveVerification)
        const { data: currentMmp, error: fetchError } = await supabase
          .from('mmp_files')
          .select('workflow')
          .eq('id', id)
          .single();

        if (fetchError) {
          console.error('Error fetching current MMP:', fetchError);
        }

        const existingWorkflow = (currentMmp?.workflow as any) || {};
        const existingVerification = existingWorkflow.comprehensiveVerification || {};
        const existingSystem = existingVerification.systemValidation || {};
        const existingContent = existingVerification.contentVerification || {};
        const existingCp = existingVerification.cpVerification || {};
        const existingPermit = existingVerification.permitVerification || {};
        
        // Build comprehensive verification by deeply merging with existing data
        // Preserve all existing nested properties while marking verification as complete
        const comprehensiveVerification = {
          ...existingVerification,
          overallStatus: 'complete',
          canProceedToApproval: true,
          verified_by: verifiedBy,
          verified_by_name: verifiedByName || 'Unknown',
          verified_at: timestamp,
          lastUpdated: timestamp,
          updatedBy: verifiedByName || 'Unknown',
          systemValidation: { 
            ...existingSystem,
            status: 'complete',
            fileIntegrity: existingSystem.fileIntegrity ?? true,
            noDuplicates: existingSystem.noDuplicates ?? true,
            compliantWithRequirements: existingSystem.compliantWithRequirements ?? true,
            entryProcessingComplete: existingSystem.entryProcessingComplete ?? true
          },
          contentVerification: { 
            ...existingContent,
            status: 'complete',
            fileReviewed: existingContent.fileReviewed ?? true,
            contentValidated: existingContent.contentValidated ?? true,
            verifiedBy: existingContent.verifiedBy || verifiedBy,
            verifiedAt: existingContent.verifiedAt || timestamp,
            notes: existingContent.notes || 'Verified during MMP verification'
          },
          cpVerification: { 
            ...existingCp,
            verificationStatus: 'complete',
            verifiedBy: existingCp.verifiedBy || verifiedBy,
            verifiedAt: existingCp.verifiedAt || timestamp
          },
          permitVerification: { 
            ...existingPermit,
            status: 'complete',
            verifiedBy: existingPermit.verifiedBy || verifiedBy,
            verifiedAt: existingPermit.verifiedAt || timestamp,
            completionPercentage: 100,
            // Preserve the permits array - this is critical
            permits: existingPermit.permits || []
          }
        };

        // Merge comprehensiveVerification into workflow JSONB
        const updatedWorkflow = {
          ...existingWorkflow,
          comprehensiveVerification,
          verifiedBy,
          verifiedByName: verifiedByName || 'Unknown',
          verifiedAt: timestamp
        };

        // Update the MMP file status to verified
        // Store verification data inside workflow JSONB since there's no separate column
        const { error: mmpError } = await supabase
          .from('mmp_files')
          .update({
            status: 'verified',
            workflow: updatedWorkflow,
            updated_at: timestamp,
          })
          .eq('id', id);

        if (mmpError) {
          console.error('Supabase verify MMP error:', mmpError);
          toast.error('Database update failed');
          throw mmpError;
        }

        // Update ONLY pre-verification site entries to 'verified' status
        // IMPORTANT: Do NOT touch downstream workflow statuses like 'approved and costed', 
        // 'dispatched', 'assigned', 'accepted', 'in_progress', 'completed' - these should keep their state
        // Only update truly pre-verification statuses: pending, forwarded, permits_attached, cp_verified
        const { error: sitesError } = await supabase
          .from('mmp_site_entries')
          .update({
            status: 'verified',
            verified_by: verifiedBy,
            verified_at: timestamp,
            updated_at: timestamp,
          })
          .eq('mmp_file_id', id)
          .or('status.ilike.pending,status.ilike.forwarded,status.ilike.permits_attached,status.ilike.cp_verified,status.ilike.locality_permit_verified');

        if (sitesError) {
          console.error('Error updating site entries to verified:', sitesError);
          // Don't throw - MMP is already verified, just log
        }

        // Update local state with full verification metadata
        // Use type assertion since we're setting complete status which satisfies the verification requirements
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
                    verified_by_name: verifiedByName || 'Unknown',
                    verified_at: timestamp,
                    systemValidation: { 
                      ...(mmp.comprehensiveVerification?.systemValidation || {}),
                      status: 'complete'
                    },
                    contentVerification: { 
                      ...(mmp.comprehensiveVerification?.contentVerification || {}),
                      status: 'complete',
                      fileReviewed: true,
                      contentValidated: true
                    },
                    cpVerification: { 
                      ...(mmp.comprehensiveVerification?.cpVerification || {}),
                      verificationStatus: 'complete'
                    },
                    permitVerification: { 
                      ...(mmp.comprehensiveVerification?.permitVerification || {}),
                      status: 'complete',
                      permits: mmp.comprehensiveVerification?.permitVerification?.permits || []
                    }
                  }
                } as MMPFile
              : mmp
          )
        );

        toast.success('MMP verified successfully! It can now proceed to approval and costing.');
      } catch (error) {
        console.error('Error verifying MMP file:', error);
        toast.error('Failed to verify MMP file');
        throw error;
      }
    },
    [setMMPFiles]
  );

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
    verifyMMP,
    archiveMMP,
    approveMMP,
    rejectMMP,
  };
};

