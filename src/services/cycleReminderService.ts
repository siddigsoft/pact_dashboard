import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { EmailNotificationService } from '@/services/email-notification.service';

const fetchSuperAdminEmails = async (): Promise<string[]> => {
  const { data } = await supabase
    .from('profiles')
    .select('email')
    .in('role', ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
    .eq('status', 'approved');
  return (data || []).filter((a: any) => a.email).map((a: any) => a.email);
};

export async function checkAndSendCycleReminders(): Promise<{ sent: number; cycles: number }> {
  let sentCount = 0;
  let cycleCount = 0;

  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: overdueCycles, error } = await supabase
      .from('mmp_files')
      .select('id, name, hub, region, cycle_close_deadline, last_reminder_sent')
      .eq('cycle_status', 'closing')
      .lt('cycle_close_deadline', now.toISOString());

    if (error) throw error;
    if (!overdueCycles || overdueCycles.length === 0) return { sent: 0, cycles: 0 };

    const eligibleCycles = overdueCycles.filter(c => {
      if (!c.last_reminder_sent) return true;
      return c.last_reminder_sent < oneDayAgo;
    });

    cycleCount = eligibleCycles.length;

    const superAdminCcEmails = await fetchSuperAdminEmails();

    const { data: superAdminProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, hub_id, role')
      .in('role', ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
      .eq('status', 'approved');

    for (const cycle of eligibleCycles) {
      const mmpHub = (cycle as any).hub || (cycle as any).region || '';
      const deadlineStr = cycle.cycle_close_deadline
        ? new Date(cycle.cycle_close_deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'N/A';

      let recipientQuery = supabase
        .from('profiles')
        .select('id, full_name, email, hub_id, role')
        .in('role', ['Supervisor', 'supervisor', 'fom', 'Field Operation Manager (FOM)'])
        .eq('status', 'approved');

      if (mmpHub) {
        const { data: hubData } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', `%${mmpHub}%`)
          .limit(1);
        if (hubData && hubData.length > 0) {
          recipientQuery = recipientQuery.eq('hub_id', hubData[0].id);
        }
      }

      const { data: recipients } = await recipientQuery;

      const allRecipients = [...(recipients || []), ...(superAdminProfiles || [])];
      const uniqueRecipients = allRecipients.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

      if (uniqueRecipients.length > 0) {
        await Promise.allSettled(
          uniqueRecipients.map(async (r: any) => {
            const isSuperAdminRole = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin');

            await NotificationTriggerService.send({
              userId: r.id,
              title: `OVERDUE: Cycle Close Reasons Required`,
              message: `MMP "${cycle.name}" cycle close is overdue. Please submit remaining reasons for uncovered sites immediately.`,
              titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
              messageAr: `إغلاق دورة MMP "${cycle.name}" متأخر. يرجى تقديم الأسباب المتبقية للمواقع غير المغطاة فوراً.`,
              type: 'error',
              category: 'assignments',
              priority: 'urgent',
              link: '/mmp/cycle-close?tab=uncovered',
              relatedEntityId: cycle.id,
              relatedEntityType: 'mmpFile',
            });

            if (r.email) {
              const recipientCc = isSuperAdminRole ? [] : superAdminCcEmails.filter(e => e !== r.email);

              await EmailNotificationService.sendNotification(
                r.email,
                r.full_name || 'Team',
                {
                  title: `OVERDUE: Cycle Close Reasons Required`,
                  message: `MMP "${cycle.name}" cycle close is overdue. Please submit remaining reasons for uncovered sites immediately.`,
                  titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
                  messageAr: `إغلاق دورة MMP "${cycle.name}" متأخر. يرجى تقديم الأسباب المتبقية للمواقع غير المغطاة فوراً.`,
                  type: 'error',
                  actionUrl: '/mmp/cycle-close?tab=uncovered',
                  actionLabel: 'Review & Submit Reasons | مراجعة وتقديم الأسباب',
                  details: [
                    { label: 'MMP / خطة الرصد', value: cycle.name },
                    { label: 'Hub / المحور', value: mmpHub || 'N/A' },
                    { label: 'Deadline / الموعد النهائي', value: deadlineStr },
                    { label: 'Status / الحالة', value: 'OVERDUE - Immediate Action Required / متأخر - يتطلب إجراء فوري' },
                  ],
                  cc: recipientCc,
                }
              );
            }
          })
        );
        sentCount += uniqueRecipients.length;
      }

      await supabase
        .from('mmp_files')
        .update({ last_reminder_sent: now.toISOString() } as any)
        .eq('id', cycle.id);
    }

    return { sent: sentCount, cycles: cycleCount };
  } catch (err) {
    console.error('[CycleReminder] Error checking/sending reminders:', err);
    return { sent: sentCount, cycles: cycleCount };
  }
}
