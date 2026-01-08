import { supabase } from '@/integrations/supabase/client';
import { CollectorRecommendationService, CoverageGapAlert } from './collectorRecommendation.service';
import { NotificationTriggerService } from './NotificationTriggerService';
import { EmailNotificationService } from './email-notification.service';

export interface CoverageGapNotification {
  id: string;
  type: 'coverage_gap';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  localityId: string;
  localityName: string;
  stateName: string;
  suggestedAction: string;
  createdAt: string;
  readAt?: string;
}

export class CoverageGapNotificationService {
  
  static async notifyAdminsOfCoverageGap(
    gap: CoverageGapAlert,
    dispatchContext?: {
      mmpId?: string;
      siteCount?: number;
      dispatchedBy?: string;
    }
  ): Promise<void> {
    try {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('role', ['admin', 'superAdmin', 'super_admin']);
      
      if (!admins || admins.length === 0) {
        console.warn('No admins found to notify about coverage gap');
        return;
      }
      
      const title = gap.severity === 'critical' 
        ? `Critical: No Data Collectors in ${gap.localityName}`
        : gap.severity === 'warning'
          ? `Warning: Coverage Gap in ${gap.localityName}`
          : `Info: Low Coverage in ${gap.localityName}`;
      
      let message = gap.message;
      if (dispatchContext?.siteCount) {
        message += ` (${dispatchContext.siteCount} site(s) being dispatched)`;
      }
      
      for (const admin of admins) {
        try {
          await NotificationTriggerService.send({
            userId: admin.id,
            type: 'info',
            title,
            message: `${message} - Action: ${gap.suggestedAction}`,
            category: 'system',
            relatedEntityType: 'mmpFile',
            relatedEntityId: dispatchContext?.mmpId
          });
        } catch (error) {
          console.error(`Failed to notify admin ${admin.id}:`, error);
        }
      }
      
      if (gap.severity === 'critical' && dispatchContext?.siteCount) {
        const adminEmails = admins
          .filter(a => a.email)
          .map(a => a.email as string);
        
        if (adminEmails.length > 0) {
          try {
            for (const email of adminEmails) {
              const adminName = admins.find(a => a.email === email)?.full_name || 'Admin';
              await EmailNotificationService.sendNotification(
                email,
                adminName,
                {
                  title: `Coverage Gap Alert: ${gap.localityName}`,
                  message: `${gap.message}. ${dispatchContext.siteCount} site(s) are being dispatched to this area with no assigned data collectors. ${gap.suggestedAction}. Please assign data collectors to ${gap.localityName} in ${gap.stateName} to ensure site coverage.`,
                  type: 'warning',
                  details: [
                    { label: 'Locality', value: gap.localityName },
                    { label: 'State', value: gap.stateName },
                    { label: 'Sites Affected', value: String(dispatchContext.siteCount) },
                    { label: 'Suggested Action', value: gap.suggestedAction }
                  ]
                }
              );
            }
          } catch (error) {
            console.error('Failed to send coverage gap email:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error in notifyAdminsOfCoverageGap:', error);
    }
  }
  
  static async checkAndNotifyDispatchCoverage(
    siteState: string,
    siteLocality: string,
    siteCoordinates?: { latitude: number; longitude: number } | null,
    dispatchContext?: {
      mmpId?: string;
      siteCount?: number;
      dispatchedBy?: string;
    }
  ): Promise<CoverageGapAlert[]> {
    try {
      const recommendations = await CollectorRecommendationService.getRecommendationsForSite(
        siteState,
        siteLocality,
        siteCoordinates
      );
      
      const criticalGaps = recommendations.coverageGaps.filter(g => g.severity === 'critical');
      
      for (const gap of criticalGaps) {
        await this.notifyAdminsOfCoverageGap(gap, dispatchContext);
      }
      
      return recommendations.coverageGaps;
    } catch (error) {
      console.error('Error checking dispatch coverage:', error);
      return [];
    }
  }
  
  static async getStateCoverageReport(stateId: string): Promise<{
    totalLocalities: number;
    coveredLocalities: number;
    uncoveredLocalities: number;
    coveragePercentage: number;
    gaps: CoverageGapAlert[];
  }> {
    const coverage = await CollectorRecommendationService.getLocalityCoverage(stateId);
    
    const totalLocalities = coverage.length;
    const coveredLocalities = coverage.filter(l => !l.hasGap).length;
    const uncoveredLocalities = coverage.filter(l => l.hasGap).length;
    const coveragePercentage = totalLocalities > 0 
      ? Math.round((coveredLocalities / totalLocalities) * 100) 
      : 0;
    
    const gaps: CoverageGapAlert[] = coverage
      .filter(l => l.hasGap)
      .map(l => ({
        type: 'no-collectors' as const,
        severity: 'warning' as const,
        message: `No data collectors in ${l.localityName}`,
        localityId: l.localityId,
        localityName: l.localityName,
        stateName: l.stateName,
        suggestedAction: l.recommendedAction
      }));
    
    return {
      totalLocalities,
      coveredLocalities,
      uncoveredLocalities,
      coveragePercentage,
      gaps
    };
  }
}
