import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from './NotificationTriggerService';
import { shouldAutoRelease } from '@/utils/confirmationDeadlines';

interface SiteVisitData {
  confirmation_deadline?: string;
  confirmation_status?: 'pending' | 'confirmed' | 'auto_released';
  autorelease_at?: string;
  autorelease_triggered?: boolean;
  [key: string]: unknown;
}

interface SiteVisitRow {
  id: string;
  site_name: string;
  assigned_to: string | null;
  status: string;
  visit_data: SiteVisitData | null;
  mmp_file_id: string | null;
}

interface AutoReleaseResult {
  siteId: string;
  siteName: string;
  formerAssignee: string;
  success: boolean;
  error?: string;
}

export const AutoReleaseService = {
  async processAutoReleases(): Promise<{
    processed: number;
    released: number;
    errors: number;
    results: AutoReleaseResult[];
  }> {
    const results: AutoReleaseResult[] = [];
    let processed = 0;
    let released = 0;
    let errors = 0;

    try {
      const { data: pendingSites, error: fetchError } = await supabase
        .from('site_visits')
        .select('id, site_name, assigned_to, status, visit_data, mmp_file_id')
        .not('assigned_to', 'is', null)
        .in('status', ['dispatched', 'in_progress', 'claimed', 'assigned'])
        .limit(500);

      if (fetchError) {
        console.error('Failed to fetch sites for auto-release:', fetchError);
        return { processed: 0, released: 0, errors: 1, results: [] };
      }

      if (!pendingSites || pendingSites.length === 0) {
        return { processed: 0, released: 0, errors: 0, results: [] };
      }

      const sitesToRelease = pendingSites.filter((site) => {
        const visitData = site.visit_data as SiteVisitData | null;
        if (!visitData?.autorelease_at) return false;
        if (visitData.confirmation_status !== 'pending') return false;
        if (visitData.autorelease_triggered) return false;
        
        return shouldAutoRelease(visitData.autorelease_at, visitData.confirmation_status || 'pending');
      });

      for (const site of sitesToRelease) {
        processed++;
        const result = await this.releaseSite(site as SiteVisitRow);
        results.push(result);
        
        if (result.success) {
          released++;
        } else {
          errors++;
        }
      }

      console.log(`Auto-release complete: ${released}/${processed} sites released, ${errors} errors`);
      return { processed, released, errors, results };
    } catch (error) {
      console.error('Auto-release processing error:', error);
      return { processed, released, errors: errors + 1, results };
    }
  },

  async releaseSite(site: SiteVisitRow): Promise<AutoReleaseResult> {
    const { id: siteId, site_name: siteName, assigned_to: formerAssignee, visit_data, mmp_file_id } = site;
    
    if (!formerAssignee) {
      return {
        siteId,
        siteName,
        formerAssignee: '',
        success: false,
        error: 'No assignee to release'
      };
    }

    try {
      const existingVisitData = (visit_data as SiteVisitData) || {};
      const updatedVisitData: SiteVisitData = {
        ...existingVisitData,
        confirmation_status: 'auto_released',
        autorelease_triggered: true,
        autorelease_executed_at: new Date().toISOString(),
        former_assignee: formerAssignee,
      };

      const { error: updateError } = await supabase
        .from('site_visits')
        .update({
          status: 'dispatched',
          assigned_to: null,
          assigned_at: null,
          visit_data: updatedVisitData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', siteId);

      if (updateError) {
        console.error(`Failed to release site ${siteId}:`, updateError);
        return {
          siteId,
          siteName,
          formerAssignee,
          success: false,
          error: updateError.message
        };
      }

      await NotificationTriggerService.siteAutoReleased(formerAssignee, siteName, siteId);

      // Notify hub supervisors that a site was auto-released (coverage gap risk)
      if (mmp_file_id) {
        try {
          const { data: mmpInfo } = await supabase
            .from('mmp_files')
            .select('hub_id')
            .eq('id', mmp_file_id)
            .single();

          if (mmpInfo?.hub_id) {
            await NotificationTriggerService.notifyHubSupervisor(mmpInfo.hub_id, {
              title: 'Site Auto-Released',
              message: `Site "${siteName}" was automatically released back to the dispatch pool — the assigned data collector did not confirm before the deadline. Reassignment may be needed.`,
              type: 'warning',
              category: 'assignments',
              priority: 'high',
              link: '/mmp',
              relatedEntityId: siteId,
              relatedEntityType: 'siteVisit'
            });
          }
        } catch (hubNotifError) {
          console.error(`[AUTO-RELEASE] Failed to notify supervisors for site ${siteId}:`, hubNotifError);
        }
      }

      console.log(`Site ${siteName} (${siteId}) auto-released from user ${formerAssignee}`);
      
      return {
        siteId,
        siteName,
        formerAssignee,
        success: true
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error releasing site ${siteId}:`, error);
      return {
        siteId,
        siteName,
        formerAssignee,
        success: false,
        error: errorMessage
      };
    }
  },

  async checkSingleSite(siteId: string): Promise<{
    shouldRelease: boolean;
    reason: string;
  }> {
    const { data: site, error } = await supabase
      .from('site_visits')
      .select('id, site_name, assigned_to, status, visit_data')
      .eq('id', siteId)
      .single();

    if (error || !site) {
      return { shouldRelease: false, reason: 'Site not found' };
    }

    const visitData = site.visit_data as SiteVisitData | null;
    
    if (!visitData?.autorelease_at) {
      return { shouldRelease: false, reason: 'No auto-release time set' };
    }

    if (visitData.confirmation_status === 'confirmed') {
      return { shouldRelease: false, reason: 'Already confirmed by assignee' };
    }

    if (visitData.confirmation_status === 'auto_released') {
      return { shouldRelease: false, reason: 'Already auto-released' };
    }

    if (visitData.autorelease_triggered) {
      return { shouldRelease: false, reason: 'Auto-release already triggered' };
    }

    if (!site.assigned_to) {
      return { shouldRelease: false, reason: 'No assignee on site' };
    }

    const shouldRelease = shouldAutoRelease(
      visitData.autorelease_at,
      visitData.confirmation_status || 'pending'
    );

    if (!shouldRelease) {
      return { shouldRelease: false, reason: 'Auto-release time not yet reached' };
    }

    return { shouldRelease: true, reason: 'Ready for auto-release' };
  }
};

export default AutoReleaseService;
