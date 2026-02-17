import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';

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

    for (const cycle of eligibleCycles) {
      const mmpHub = (cycle as any).hub || (cycle as any).region || '';

      let recipientQuery = supabase
        .from('profiles')
        .select('id, full_name, hub_id, role')
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

      if (recipients && recipients.length > 0) {
        await Promise.allSettled(
          recipients.map(r =>
            NotificationTriggerService.send({
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
            })
          )
        );
        sentCount += recipients.length;
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
