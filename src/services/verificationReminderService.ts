import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { EmailNotificationService } from '@/services/email-notification.service';

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REMINDER_STORAGE_KEY = 'verification_reminder_last_sent';

interface StateVerificationSummary {
  stateName: string;
  stateId: string;
  totalSites: number;
  verifiedSites: number;
  pendingSites: number;
  returnedSites: number;
  coordinatorCount: number;
  mmpId: string;
  mmpName: string;
}

const fetchSuperAdminProfiles = async () => {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
    .eq('status', 'approved');
  return data || [];
};

const fetchDataTeamProfiles = async () => {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['data_team', 'DataTeam', 'dataTeam', 'Data Team'])
    .eq('status', 'approved');
  return data || [];
};

const fetchSupervisorsForHub = async (hubId: string) => {
  if (!hubId) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, hub_id')
    .eq('role', 'supervisor')
    .eq('hub_id', hubId)
    .eq('status', 'approved');
  return data || [];
};

const fetchStateTeamMembers = async (stateId: string) => {
  if (!stateId) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, state_id')
    .eq('state_id', stateId)
    .eq('status', 'approved');
  return data || [];
};

const fetchCoordinatorsForMmp = async (mmpId: string) => {
  if (!mmpId) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('role', 'coordinator')
    .eq('status', 'approved');
  return data || [];
};

function buildVerificationSummaryMessage(summaries: StateVerificationSummary[]): { en: string; ar: string } {
  const lines = summaries.map(s => {
    const pct = s.totalSites > 0 ? Math.round((s.verifiedSites / s.totalSites) * 100) : 0;
    return `• ${s.stateName}: ${s.verifiedSites}/${s.totalSites} verified (${pct}%)${s.returnedSites > 0 ? `, ${s.returnedSites} returned` : ''}`;
  });

  const arLines = summaries.map(s => {
    const pct = s.totalSites > 0 ? Math.round((s.verifiedSites / s.totalSites) * 100) : 0;
    return `• ${s.stateName}: ${s.verifiedSites}/${s.totalSites} تم التحقق (${pct}%)${s.returnedSites > 0 ? `، ${s.returnedSites} مُعاد` : ''}`;
  });

  return {
    en: `Daily Verification Status Report:\n${lines.join('\n')}\n\nPlease follow up on pending site verifications.`,
    ar: `تقرير حالة التحقق اليومي:\n${arLines.join('\n')}\n\nيرجى متابعة عمليات التحقق المعلقة.`
  };
}

function buildStateSpecificMessage(summary: StateVerificationSummary): { en: string; ar: string } {
  const pct = summary.totalSites > 0 ? Math.round((summary.verifiedSites / summary.totalSites) * 100) : 0;
  return {
    en: `Verification reminder for ${summary.stateName}: ${summary.verifiedSites}/${summary.totalSites} sites verified (${pct}%). ${summary.pendingSites} sites still pending verification. Please take action.`,
    ar: `تذكير بالتحقق لـ ${summary.stateName}: ${summary.verifiedSites}/${summary.totalSites} مواقع تم التحقق منها (${pct}%). ${summary.pendingSites} مواقع لا تزال معلقة. يرجى اتخاذ إجراء.`
  };
}

export async function checkAndSendVerificationReminders(): Promise<{ sent: number; states: number }> {
  let sentCount = 0;

  try {
    const lastSent = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (lastSent) {
      const elapsed = Date.now() - Number(lastSent);
      if (elapsed < REMINDER_INTERVAL_MS) {
        console.log('[VERIFICATION REMINDER] Already sent within 24h, skipping');
        return { sent: 0, states: 0 };
      }
    }

    const { data: activeMmps, error: mmpError } = await supabase
      .from('mmp_files')
      .select('id, name, hub, status')
      .in('status', ['in_progress', 'forwarded', 'dispatched', 'active']);

    if (mmpError || !activeMmps || activeMmps.length === 0) {
      console.log('[VERIFICATION REMINDER] No active MMPs found');
      return { sent: 0, states: 0 };
    }

    const stateSummaries: StateVerificationSummary[] = [];

    for (const mmp of activeMmps) {
      const { data: entries, error: entryError } = await supabase
        .from('mmp_site_entries')
        .select('id, status, state, accepted_by, additional_data')
        .eq('mmp_file_id', mmp.id);

      if (entryError || !entries || entries.length === 0) continue;

      const stateGroups: Record<string, typeof entries> = {};
      for (const entry of entries) {
        const stateKey = (entry.state || 'Unknown').toString();
        if (!stateGroups[stateKey]) stateGroups[stateKey] = [];
        stateGroups[stateKey].push(entry);
      }

      for (const [stateName, stateEntries] of Object.entries(stateGroups)) {
        const totalSites = stateEntries.length;
        const verifiedSites = stateEntries.filter(e => (e.status || '').toLowerCase() === 'verified').length;
        const returnedSites = stateEntries.filter(e => {
          const s = (e.status || '').toLowerCase();
          return s === 'returned' || s === 'returned_to_fom';
        }).length;
        const pendingSites = totalSites - verifiedSites;
        const coordinators = new Set(stateEntries.filter(e => e.accepted_by).map(e => e.accepted_by));

        if (pendingSites > 0) {
          stateSummaries.push({
            stateName,
            stateId: stateName,
            totalSites,
            verifiedSites,
            pendingSites,
            returnedSites,
            coordinatorCount: coordinators.size,
            mmpId: mmp.id,
            mmpName: mmp.name || 'MMP'
          });
        }
      }
    }

    if (stateSummaries.length === 0) {
      console.log('[VERIFICATION REMINDER] All sites verified, no reminders needed');
      localStorage.setItem(REMINDER_STORAGE_KEY, String(Date.now()));
      return { sent: 0, states: 0 };
    }

    const overallMessage = buildVerificationSummaryMessage(stateSummaries);
    const totalPending = stateSummaries.reduce((sum, s) => sum + s.pendingSites, 0);
    const totalSites = stateSummaries.reduce((sum, s) => sum + s.totalSites, 0);
    const totalVerified = stateSummaries.reduce((sum, s) => sum + s.verifiedSites, 0);

    const superAdmins = await fetchSuperAdminProfiles();
    const allNotifiedIds = new Set<string>();

    for (const admin of superAdmins) {
      if (allNotifiedIds.has(admin.id)) continue;
      allNotifiedIds.add(admin.id);

      await NotificationTriggerService.send({
        userId: admin.id,
        title: `Verification Follow-up: ${totalPending} sites pending`,
        titleAr: `متابعة التحقق: ${totalPending} مواقع معلقة`,
        message: overallMessage.en,
        messageAr: overallMessage.ar,
        type: 'warning',
        category: 'assignments',
        priority: 'high',
        link: '/mmp',
        sendEmail: true,
        emailActionUrl: 'https://app.pactorg.com/mmp',
        emailActionLabel: 'View MMP Management'
      });
      sentCount++;
    }

    const dataTeam = await fetchDataTeamProfiles();
    for (const member of dataTeam) {
      if (allNotifiedIds.has(member.id)) continue;
      allNotifiedIds.add(member.id);

      await NotificationTriggerService.send({
        userId: member.id,
        title: `Daily Reminder: ${totalPending} sites pending verification`,
        titleAr: `تذكير يومي: ${totalPending} مواقع في انتظار التحقق`,
        message: overallMessage.en,
        messageAr: overallMessage.ar,
        type: 'info',
        category: 'assignments',
        priority: 'normal',
        link: '/mmp',
        sendEmail: true,
        emailActionUrl: 'https://app.pactorg.com/mmp',
        emailActionLabel: 'View Pending Sites'
      });
      sentCount++;
    }

    for (const summary of stateSummaries) {
      const stateMessage = buildStateSpecificMessage(summary);
      const stateTeam = await fetchStateTeamMembers(summary.stateId);

      for (const member of stateTeam) {
        if (allNotifiedIds.has(member.id)) continue;
        allNotifiedIds.add(member.id);

        const isSupervisor = member.role === 'supervisor' || member.role === 'Supervisor';
        await NotificationTriggerService.send({
          userId: member.id,
          title: `${summary.stateName}: ${summary.pendingSites} sites pending`,
          titleAr: `${summary.stateName}: ${summary.pendingSites} مواقع معلقة`,
          message: stateMessage.en,
          messageAr: stateMessage.ar,
          type: isSupervisor ? 'warning' : 'info',
          category: 'assignments',
          priority: isSupervisor ? 'high' : 'normal',
          link: '/mmp',
          sendEmail: isSupervisor,
          emailActionUrl: 'https://app.pactorg.com/mmp',
          emailActionLabel: 'View State Sites'
        });
        sentCount++;
      }
    }

    localStorage.setItem(REMINDER_STORAGE_KEY, String(Date.now()));
    console.log(`[VERIFICATION REMINDER] Sent ${sentCount} notifications for ${stateSummaries.length} states`);
    return { sent: sentCount, states: stateSummaries.length };
  } catch (error) {
    console.error('[VERIFICATION REMINDER] Error:', error);
    return { sent: sentCount, states: 0 };
  }
}

export async function sendSiteClaimNotifications(
  claimerUserId: string,
  claimerName: string,
  claimerRole: string,
  siteName: string,
  siteId: string,
  stateName?: string,
  hubId?: string
): Promise<number> {
  let sentCount = 0;
  const notifiedIds = new Set<string>();
  notifiedIds.add(claimerUserId);

  try {
    const superAdmins = await fetchSuperAdminProfiles();
    for (const admin of superAdmins) {
      if (notifiedIds.has(admin.id)) continue;
      notifiedIds.add(admin.id);

      await NotificationTriggerService.send({
        userId: admin.id,
        title: 'Site Claimed',
        titleAr: 'تم المطالبة بالموقع',
        message: `${claimerName} (${claimerRole}) has claimed site "${siteName}"`,
        messageAr: `${claimerName} (${claimerRole}) طالب بالموقع "${siteName}"`,
        type: 'info',
        category: 'assignments',
        priority: 'normal',
        link: '/mmp',
        relatedEntityId: siteId,
        relatedEntityType: 'siteVisit',
        sendEmail: true,
        emailActionUrl: `https://app.pactorg.com/mmp`,
        emailActionLabel: 'View Site'
      });
      sentCount++;
    }

    if (hubId) {
      const supervisors = await fetchSupervisorsForHub(hubId);
      for (const sup of supervisors) {
        if (notifiedIds.has(sup.id)) continue;
        notifiedIds.add(sup.id);

        await NotificationTriggerService.send({
          userId: sup.id,
          title: 'Site Claimed in Your Hub',
          titleAr: 'تم المطالبة بموقع في محورك',
          message: `${claimerName} has claimed site "${siteName}" in your hub area`,
          messageAr: `${claimerName} طالب بالموقع "${siteName}" في منطقة محورك`,
          type: 'info',
          category: 'assignments',
          priority: 'normal',
          link: '/mmp',
          relatedEntityId: siteId,
          relatedEntityType: 'siteVisit',
          sendEmail: true,
          emailActionUrl: `https://app.pactorg.com/mmp`,
          emailActionLabel: 'View Hub Sites'
        });
        sentCount++;
      }
    }

    const dataTeam = await fetchDataTeamProfiles();
    for (const member of dataTeam) {
      if (notifiedIds.has(member.id)) continue;
      notifiedIds.add(member.id);

      await NotificationTriggerService.send({
        userId: member.id,
        title: 'Site Claimed',
        titleAr: 'تم المطالبة بالموقع',
        message: `${claimerName} has claimed site "${siteName}"`,
        messageAr: `${claimerName} طالب بالموقع "${siteName}"`,
        type: 'info',
        category: 'assignments',
        priority: 'normal',
        link: '/mmp',
        relatedEntityId: siteId,
        relatedEntityType: 'siteVisit'
      });
      sentCount++;
    }

    console.log(`[SITE CLAIM NOTIFY] Sent ${sentCount} notifications for site "${siteName}" claimed by ${claimerName}`);
    return sentCount;
  } catch (error) {
    console.error('[SITE CLAIM NOTIFY] Error:', error);
    return sentCount;
  }
}
