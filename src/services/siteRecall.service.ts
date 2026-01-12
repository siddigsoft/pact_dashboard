import { supabase } from '@/integrations/supabase/client';

export type SiteStatus = 
  | 'new' 
  | 'pending' 
  | 'forwarded'
  | 'permits_attached' 
  | 'cp_verification'
  | 'locality_permit_verified'
  | 'verified' 
  | 'approved' 
  | 'approved_and_costed'
  | 'dispatched' 
  | 'completed' 
  | 'rejected';

export const SITE_STATUS_ORDER: SiteStatus[] = [
  'new',
  'pending',
  'forwarded',
  'permits_attached',
  'cp_verification',
  'locality_permit_verified',
  'verified',
  'approved',
  'approved_and_costed',
  'dispatched',
  'completed'
];

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  new: 'New Sites',
  pending: 'Pending',
  forwarded: 'Forwarded',
  permits_attached: 'Permits Attached',
  cp_verification: 'CP Verification',
  locality_permit_verified: 'Locality Permit Verified',
  verified: 'Verified',
  approved: 'Approved',
  approved_and_costed: 'Approved & Costed',
  dispatched: 'Dispatched',
  completed: 'Completed',
  rejected: 'Rejected'
};

export interface SiteRecallRequest {
  siteEntryIds: string[];
  targetStatus: SiteStatus;
  reason: string;
  recalledBy: string;
  recalledByEmail?: string;
  recalledByName?: string;
}

export interface SiteRecallResult {
  success: boolean;
  successCount: number;
  failedCount: number;
  errors: string[];
}

export function canRecallSites(userRole: string): boolean {
  const allowedRoles = ['super_admin', 'admin', 'fom', 'ict'];
  return allowedRoles.includes(userRole?.toLowerCase() || '');
}

export function getTargetStatusOptions(currentStatus: string): SiteStatus[] {
  const normalizedStatus = normalizeStatus(currentStatus);
  const currentIndex = SITE_STATUS_ORDER.indexOf(normalizedStatus);
  
  if (currentIndex <= 0) return [];
  
  return SITE_STATUS_ORDER.slice(0, currentIndex);
}

function normalizeStatus(status: string): SiteStatus {
  const normalized = status?.toLowerCase().replace(/\s+/g, '_') || 'new';
  
  const statusMap: Record<string, SiteStatus> = {
    'new': 'new',
    'new_sites': 'new',
    'pending': 'pending',
    'forwarded': 'forwarded',
    'assigned': 'forwarded',
    'permits_attached': 'permits_attached',
    'permit_verification': 'permits_attached',
    'cp_verification': 'cp_verification',
    'locality_permit_verified': 'locality_permit_verified',
    'verified': 'verified',
    'approved': 'approved',
    'approved_and_costed': 'approved_and_costed',
    'dispatched': 'dispatched',
    'inprogress': 'dispatched',
    'in_progress': 'dispatched',
    'completed': 'completed',
    'rejected': 'rejected'
  };
  
  return statusMap[normalized] || 'new';
}

export async function recallSites(request: SiteRecallRequest): Promise<SiteRecallResult> {
  const { siteEntryIds, targetStatus, reason, recalledBy, recalledByEmail, recalledByName } = request;
  
  const result: SiteRecallResult = {
    success: false,
    successCount: 0,
    failedCount: 0,
    errors: []
  };

  if (!siteEntryIds.length) {
    result.errors.push('No sites selected for recall');
    return result;
  }

  if (!reason.trim()) {
    result.errors.push('Reason is required for recall');
    return result;
  }

  const recallTimestamp = new Date().toISOString();

  for (const siteId of siteEntryIds) {
    try {
      const { data: currentSite, error: fetchError } = await supabase
        .from('mmp_site_entries')
        .select('id, status, additional_data, site_name, mmp_file_id')
        .eq('id', siteId)
        .single();

      if (fetchError || !currentSite) {
        result.failedCount++;
        result.errors.push(`Failed to fetch site ${siteId}: ${fetchError?.message || 'Not found'}`);
        continue;
      }

      const existingData = (currentSite.additional_data as Record<string, unknown>) || {};
      const recallHistory = Array.isArray(existingData.recall_history) 
        ? existingData.recall_history 
        : [];

      recallHistory.push({
        from_status: currentSite.status,
        to_status: targetStatus,
        reason,
        recalled_by: recalledBy,
        recalled_by_email: recalledByEmail,
        recalled_by_name: recalledByName,
        recalled_at: recallTimestamp
      });

      const updatedData: Record<string, unknown> = {
        ...existingData,
        recall_history: recallHistory,
        last_recalled_at: recallTimestamp,
        last_recalled_by: recalledBy,
        last_recalled_from: currentSite.status,
        last_recalled_to: targetStatus,
        last_recall_reason: reason
      };

      if (targetStatus === 'new' || targetStatus === 'pending') {
        delete updatedData.verified_at;
        delete updatedData.verified_by;
        delete updatedData.verification_notes;
        delete updatedData.locality_permit_verified;
        delete updatedData.locality_permit_not_required;
        delete updatedData.cp_verified;
        delete updatedData.cp_verification_date;
      }

      if (['new', 'pending', 'forwarded', 'permits_attached'].includes(targetStatus)) {
        delete updatedData.cp_verified;
        delete updatedData.cp_verification_date;
        delete updatedData.cp_verification_by;
      }

      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          status: targetStatus === 'new' ? 'Pending' : 
                  targetStatus === 'verified' ? 'Verified' :
                  targetStatus === 'approved' ? 'Approved' :
                  targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1).replace(/_/g, ' '),
          additional_data: updatedData
        })
        .eq('id', siteId);

      if (updateError) {
        result.failedCount++;
        result.errors.push(`Failed to update site ${currentSite.site_name || siteId}: ${updateError.message}`);
        continue;
      }

      await supabase.from('audit_logs').insert({
        module: 'mmp',
        action: 'site_recalled',
        entity_type: 'mmp_site_entry',
        entity_id: siteId,
        performed_by: recalledBy,
        old_value: { status: currentSite.status },
        new_value: { status: targetStatus, reason },
        metadata: {
          site_name: currentSite.site_name,
          mmp_file_id: currentSite.mmp_file_id,
          recalled_by_email: recalledByEmail,
          recalled_by_name: recalledByName
        }
      });

      result.successCount++;
    } catch (error: any) {
      result.failedCount++;
      result.errors.push(`Error processing site ${siteId}: ${error.message}`);
    }
  }

  result.success = result.successCount > 0 && result.failedCount === 0;
  return result;
}
