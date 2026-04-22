/**
 * dispatchNotification — Generic helper that fires the full notification stack
 * (in-app + email via `dispatch-notification` edge function, and WhatsApp via
 * `send-whatsapp`) for any event in the platform.
 *
 * Used by Tasks/Dependencies/Payroll/Timesheet/etc. to keep the wiring DRY.
 *
 * NOTE: Both invokes are fire-and-forget so the caller's UX never blocks.
 */
import { supabase } from '@/lib/supabase';

export interface DispatchNotificationOptions {
  /** Event key — must exist in the eventTemplates map of dispatch-notification. */
  event: string;
  /** User IDs that should receive the message (in-app, email, optionally WA). */
  recipientIds: string[];
  titleEn: string;
  titleAr: string;
  messageEn: string;
  messageAr: string;
  priority?: 'urgent' | 'high' | 'normal';
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  /** Extra fields surfaced inside the email template's detail table. */
  metadata?: Record<string, string | number | boolean | null | undefined>;
  /** When true, also dispatch a WhatsApp message via WasenderAPI. */
  sendWhatsApp?: boolean;
  triggeredBy?: string;
  triggeredByName?: string;
}

export async function dispatchNotification(opts: DispatchNotificationOptions): Promise<void> {
  const recipients = Array.from(new Set((opts.recipientIds ?? []).filter(Boolean)));
  if (recipients.length === 0) return;

  // ── 1. In-app + email ────────────────────────────────────────────────────
  supabase.functions
    .invoke('dispatch-notification', {
      body: {
        event_type: opts.event,
        entity_type: opts.entityType,
        entity_id: opts.entityId,
        priority: opts.priority ?? 'normal',
        recipient_ids: recipients,
        title_en: opts.titleEn,
        title_ar: opts.titleAr,
        message_en: opts.messageEn,
        message_ar: opts.messageAr,
        triggered_by: opts.triggeredBy,
        triggered_by_name: opts.triggeredByName,
        action_url: opts.actionUrl,
        metadata: opts.metadata ?? {},
      },
    })
    .catch((err) => console.warn('[notify] dispatch-notification failed:', err));

  // ── 2. WhatsApp for high-urgency events ─────────────────────────────────
  if (opts.sendWhatsApp) {
    supabase.functions
      .invoke('send-whatsapp', {
        body: {
          user_ids: recipients,
          event_type: opts.event,
          data: {
            title: opts.titleEn,
            message: opts.messageEn,
            message_ar: opts.messageAr,
            url: opts.actionUrl ?? '',
            ...(opts.metadata ?? {}),
          },
        },
      })
      .catch((err) => console.warn('[notify] send-whatsapp failed:', err));
  }
}
