/**
 * subscription-renewal-check
 *
 * Scheduled Edge Function — runs daily via pg_cron at 08:00 UTC.
 * Also callable manually via HTTP POST for testing (requires CRON_SECRET).
 *
 * Authorization: callers must supply the shared secret in one of:
 *   - Authorization header: `Bearer <CRON_SECRET>`
 *   - x-cron-secret header: `<CRON_SECRET>`
 *
 * Checks:
 *   1. Active subscriptions renewing within the alert window (default 7 days)
 *   2. Total monthly subscription cost exceeding the configured threshold
 *
 * Sends in-app notifications to all admin / financialAdmin / superAdmin users.
 *
 * Deduplication (same pattern as contract-expiry-check):
 *   - Renewal alerts: entity_id = "<subscription_id>:<YYYY-MM-DD>"
 *     → one alert per subscription per day
 *   - Cost threshold: entity_id = "threshold:<YYYY-MM>"
 *     → one alert per recipient per calendar month
 * Existing notifications are queried by (event_type + entity_id + recipient_id)
 * before insert; already-sent records are skipped.
 *
 * Environment variables (auto-injected by Supabase):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET  — shared secret for callers (set via Supabase Dashboard > Secrets)
 *   APP_URL      — e.g. https://app.pactorg.com
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { format } from 'https://esm.sh/date-fns@2.30.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'

// ── CRON auth (same pattern as contract-expiry-check) ─────────────────────────
function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) return false

  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader === cronSecret) return true

  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader === `Bearer ${cronSecret}`) return true

  return false
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Subscription {
  id: string
  name: string
  vendor: string
  amount: number
  currency: string
  billing_cycle: string
  renewal_date: string
}

interface NotifSettings {
  monthly_cost_threshold: number
  currency: string
  renewal_alert_days: number
}

interface AdminProfile {
  id: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function monthlyEquivalent(amount: number, cycle: string): number {
  return cycle === 'annual' ? amount / 12 : amount
}

function differenceInDays(renewalDateStr: string, today: Date): number {
  const renewal = new Date(renewalDateStr)
  const diffMs = renewal.getTime() - today.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Deduplication check — same pattern as contract-expiry-check.
 * Returns true if a notification already exists for this (event_type, entity_id, recipient_id) triplet.
 */
async function notificationExists(
  adminClient: SupabaseClient,
  eventType: string,
  entityId: string,
  recipientId: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from('notifications')
    .select('id')
    .eq('event_type', eventType)
    .eq('entity_id', entityId)
    .eq('recipient_id', recipientId)
    .maybeSingle()
  return !!data
}

async function insertNotification(
  adminClient: SupabaseClient,
  recipientId: string,
  eventType: string,
  entityId: string,
  titleEn: string,
  titleAr: string,
  messageEn: string,
  messageAr: string,
  priority: 'normal' | 'high' | 'urgent',
  actionUrl: string,
): Promise<boolean> {
  // Skip if already notified (deduplication)
  const exists = await notificationExists(adminClient, eventType, entityId, recipientId)
  if (exists) return false

  const { error } = await adminClient.from('notifications').insert({
    event_type: eventType,
    entity_type: 'subscription',
    entity_id: entityId,
    recipient_id: recipientId,
    triggered_by: null,
    title_en: titleEn,
    title_ar: titleAr,
    message_en: messageEn,
    message_ar: messageAr,
    priority,
    action_url: `${APP_URL}${actionUrl}`,
  })
  if (error) {
    console.error(`[subscription-renewal-check] Failed to insert notification for ${recipientId}:`, error.message)
    return false
  }
  return true
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!isAuthorized(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const adminClient = createClient(supabaseUrl, serviceKey)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = format(today, 'yyyy-MM-dd')
    const monthStr = format(today, 'yyyy-MM')

    // 1. Load notification settings (or use defaults)
    const { data: settingsData } = await adminClient
      .from('subscription_notification_settings')
      .select('monthly_cost_threshold, currency, renewal_alert_days')
      .limit(1)
      .maybeSingle()

    const settings: NotifSettings = settingsData ?? {
      monthly_cost_threshold: 10000,
      currency: 'USD',
      renewal_alert_days: 7,
    }

    // 2. Load all active subscriptions
    const { data: subscriptionsData, error: subsError } = await adminClient
      .from('subscriptions')
      .select('id, name, vendor, amount, currency, billing_cycle, renewal_date')
      .eq('is_active', true)

    if (subsError) {
      throw new Error(`Failed to fetch subscriptions: ${subsError.message}`)
    }

    const activeSubs = (subscriptionsData ?? []) as Subscription[]

    // 3. Load admin and financial admin profiles to notify
    const { data: adminsData, error: adminsError } = await adminClient
      .from('profiles')
      .select('id')
      .in('role', [
        'admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin',
        'financialAdmin', 'financial_admin', 'FinancialAdmin',
      ])

    if (adminsError) {
      throw new Error(`Failed to fetch admin profiles: ${adminsError.message}`)
    }

    const admins = (adminsData ?? []) as AdminProfile[]

    if (admins.length === 0) {
      console.log('[subscription-renewal-check] No admin users found to notify.')
      return new Response(JSON.stringify({ ok: true, notified: 0, renewals: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    let renewalCount = 0
    let notificationCount = 0

    // 4. Check each subscription for upcoming renewals
    for (const sub of activeSubs) {
      const daysLeft = differenceInDays(sub.renewal_date, today)
      if (daysLeft < 0 || daysLeft > settings.renewal_alert_days) continue

      renewalCount++
      const renewalDate = new Date(sub.renewal_date).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
      const daysText = daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
      const priority: 'urgent' | 'high' = daysLeft <= 2 ? 'urgent' : 'high'

      // entity_id = "<sub_id>:<YYYY-MM-DD>" — deduplicates within the same day
      const entityId = `${sub.id}:${todayStr}`

      for (const admin of admins) {
        const inserted = await insertNotification(
          adminClient,
          admin.id,
          'subscription_renewal',
          entityId,
          `Subscription Renewal: ${sub.name}`,
          `تجديد الاشتراك: ${sub.name}`,
          `${sub.vendor} – "${sub.name}" renews ${daysText} (${renewalDate}). Amount: ${sub.currency} ${Number(sub.amount).toLocaleString()}.`,
          `${sub.vendor} – "${sub.name}" يتجدد ${daysText} (${renewalDate}). المبلغ: ${sub.currency} ${Number(sub.amount).toLocaleString()}.`,
          priority,
          '/subscriptions',
        )
        if (inserted) notificationCount++
      }
    }

    // 5. Check total monthly cost threshold
    const totalMonthly = activeSubs.reduce(
      (sum, sub) => sum + monthlyEquivalent(Number(sub.amount), sub.billing_cycle),
      0,
    )
    const thresholdExceeded = totalMonthly > settings.monthly_cost_threshold

    if (thresholdExceeded) {
      // entity_id = "threshold:<YYYY-MM>" — deduplicates within the same calendar month
      const thresholdEntityId = `threshold:${monthStr}`

      for (const admin of admins) {
        const inserted = await insertNotification(
          adminClient,
          admin.id,
          'subscription_cost_threshold',
          thresholdEntityId,
          'Monthly Subscription Cost Alert',
          'تنبيه تكلفة الاشتراكات الشهرية',
          `Total estimated monthly subscription cost (${settings.currency} ${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}) exceeds the configured threshold of ${settings.currency} ${settings.monthly_cost_threshold.toLocaleString()}.`,
          `إجمالي تكلفة الاشتراكات الشهرية المقدرة (${settings.currency} ${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}) يتجاوز الحد المحدد البالغ ${settings.currency} ${settings.monthly_cost_threshold.toLocaleString()}.`,
          'high',
          '/subscriptions',
        )
        if (inserted) notificationCount++
      }
    }

    console.log(`[subscription-renewal-check] Done. Renewals checked: ${renewalCount}, New notifications: ${notificationCount}`)

    return new Response(
      JSON.stringify({
        ok: true,
        renewalCount,
        notificationCount,
        totalMonthly,
        threshold: settings.monthly_cost_threshold,
        thresholdExceeded,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[subscription-renewal-check] Error:', message)
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
