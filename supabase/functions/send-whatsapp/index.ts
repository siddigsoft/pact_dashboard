/**
 * send-whatsapp — Meta WhatsApp Cloud API delivery (with WasenderAPI fallback)
 *
 * Maps each PACT event_type to one of 5 approved Meta templates:
 *   pact_task_event      (name, task_title, action, due_date, url)
 *   pact_approval_request(name, item, submitted_by, url)
 *   pact_status_update   (name, item, action, notes)
 *   pact_alert           (title, item, details, action_needed)
 *   pact_reminder        (name, count, url)
 *
 * If META_WA_ACCESS_TOKEN is set → uses Meta Cloud API (template messages).
 * Else falls back to WasenderAPI free-text (legacy).
 *
 * ENV (Meta):     META_WA_ACCESS_TOKEN, META_WA_PHONE_NUMBER_ID
 * ENV (Wasender): WASENDER_API_KEY
 * ENV (always):   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const META_GRAPH_VERSION = 'v21.0'
const WASENDER_ENDPOINT = 'https://www.wasenderapi.com/api/send-message'
const APP_URL = 'https://app.pactorg.com'

// ── Template shape mapping ────────────────────────────────────────────────────
// Each event maps to one of 5 approved templates with positional variables.

type TemplateName = 'pact_task_event' | 'pact_approval_request' | 'pact_status_update' | 'pact_alert' | 'pact_reminder'

interface TemplateMapping {
  template: TemplateName
  vars: (d: Record<string, string>) => string[]
}

const v = (s: string | undefined | null, fallback = '—') =>
  (s && String(s).trim()) ? String(s).trim() : fallback

const EVENT_TO_TEMPLATE: Record<string, TemplateMapping> = {
  // ── Tasks → pact_task_event(name, task_title, action, due_date) — static URL button ─
  task_created:        { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), v(d.task_title), `created by ${v(d.actor, 'system')}`, v(d.due_date, 'not set')] },
  task_assigned:       { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), v(d.task_title), `assigned to you by ${v(d.actor, 'system')}`, v(d.due_date, 'not set')] },
  task_started:        { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), v(d.task_title), `started by ${v(d.actor, 'system')}`, v(d.due_date, 'not set')] },
  task_acknowledged:   { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), v(d.task_title), 'acknowledged by the assignee', v(d.due_date, 'not set')] },
  task_completed:      { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), v(d.task_title), `completed by ${v(d.actor, 'system')}`, v(d.due_date, 'not set')] },
  task_status_changed: { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), v(d.task_title), `status changed by ${v(d.actor, 'system')}`, v(d.due_date, 'not set')] },
  task_updated:        { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), v(d.task_title), `updated by ${v(d.actor, 'system')}`, v(d.due_date, 'not set')] },
  task_reminder_3day:  { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), v(d.task_title), 'due in 3 days', v(d.due_date, 'soon')] },
  project_task_assigned: { template: 'pact_task_event', vars: d => [v(d.recipient_name, 'there'), `${v(d.task_title)} (project: ${v(d.project_name, 'N/A')})`, `assigned by ${v(d.actor, 'system')}`, v(d.due_date, 'not set')] },

  // ── Approvals → pact_approval_request(name, item, submitted_by) — static URL button ─
  approval_required:         { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'there'), v(d.item, v(d.message, 'an item')), v(d.actor, 'system')] },
  signature_requested:       { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'there'), `signature on ${v(d.document, 'document')}`, v(d.actor, 'system')] },
  leave_request_submitted:   { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'manager'), `leave request (${v(d.leave_type, 'leave')}, ${v(d.from_date)} → ${v(d.to_date)})`, v(d.actor, 'employee')] },
  cost_submitted:            { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'manager'), `cost ${v(d.amount)} ${v(d.currency, 'SDG')}`, v(d.actor, 'employee')] },
  advance_request_submitted: { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'manager'), `advance ${v(d.amount)} ${v(d.currency, 'SDG')}`, v(d.actor, 'employee')] },
  payroll_approval_needed:   { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'manager'), `payroll for ${v(d.payroll_month, 'this month')}`, v(d.actor, 'HR')] },
  mmp_forwarded:             { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'manager'), `MMP ${v(d.mmp_code)}`, v(d.actor, 'coordinator')] },
  mmp_recall_initiated:      { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'coordinator'), `MMP recall ${v(d.mmp_code)}`, v(d.actor, 'system')] },
  mmp_assigned:              { template: 'pact_approval_request', vars: d => [v(d.recipient_name, 'there'), `MMP ${v(d.mmp_code)} at ${v(d.site_name, 'site')}`, v(d.actor, 'manager')] },

  // ── Status updates → pact_status_update(name, item, action, notes) ──────────
  leave_request_approved:    { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `leave request (${v(d.leave_type, 'leave')})`, 'approved', `${v(d.from_date)} → ${v(d.to_date)} by ${v(d.actor, 'manager')}`] },
  leave_request_rejected:    { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `leave request (${v(d.leave_type, 'leave')})`, 'rejected', `by ${v(d.actor, 'manager')} — contact HR for details`] },
  leave_request_cancelled:   { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), 'leave request', 'cancelled', v(d.notes, '—')] },
  cost_approved:             { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `cost ${v(d.amount)} ${v(d.currency, 'SDG')}`, 'approved', `by ${v(d.actor, 'manager')}`] },
  cost_rejected:             { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `cost ${v(d.amount)} ${v(d.currency, 'SDG')}`, 'rejected', `by ${v(d.actor, 'manager')}`] },
  withdrawal_approved:       { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `withdrawal ${v(d.amount)} ${v(d.currency, 'SDG')}`, 'approved', v(d.notes, '—')] },
  withdrawal_rejected:       { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `withdrawal ${v(d.amount)} ${v(d.currency, 'SDG')}`, 'rejected', v(d.notes, '—')] },
  advance_request_approved:  { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `advance ${v(d.amount)} ${v(d.currency, 'SDG')}`, 'approved', `by ${v(d.actor, 'manager')}`] },
  advance_request_rejected:  { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `advance ${v(d.amount)} ${v(d.currency, 'SDG')}`, 'rejected', `by ${v(d.actor, 'manager')}`] },
  signature_completed:       { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), v(d.document, 'document'), 'signed', '—'] },
  mmp_completed:             { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `MMP ${v(d.mmp_code)} (cycle ${v(d.cycle)})`, 'completed', `by ${v(d.actor, 'team')}`] },
  mmp_reclaim_approved:      { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `MMP reclaim ${v(d.mmp_code)}`, 'approved', `by ${v(d.actor, 'manager')}`] },
  mmp_cycle_closed:          { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `MMP cycle ${v(d.cycle)}`, 'officially closed', '—'] },
  mmp_created:               { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `MMP ${v(d.mmp_code)} (cycle ${v(d.cycle)})`, 'created', `by ${v(d.actor, 'system')}`] },
  payroll_run_completed:     { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `payroll for ${v(d.payroll_month, 'this month')}`, 'processed', 'check your payslip in the HR portal'] },
  payroll_slip_ready:        { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `payslip for ${v(d.payroll_month, 'this month')}`, 'ready', `view it at ${APP_URL}/payroll`] },
  payment_processed:         { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `payment ${v(d.amount)} ${v(d.currency, 'SDG')}`, 'processed', '—'] },
  wallet_updated:            { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), 'wallet', 'updated', `new balance: ${v(d.balance)} ${v(d.currency, 'SDG')}`] },
  project_completed:         { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `project "${v(d.project_name)}"`, 'completed', `by ${v(d.actor, 'team')}`] },
  project_archived:          { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `project "${v(d.project_name)}"`, 'archived', '—'] },
  project_member_added:      { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `project "${v(d.project_name)}"`, 'you were added as a member', `by ${v(d.actor, 'manager')}`] },
  project_created:           { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `project "${v(d.project_name)}"`, 'created', `${v(d.project_type, 'general')} — by ${v(d.actor, 'system')}`] },
  project_stage_advanced:    { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `project "${v(d.project_name)}"`, `advanced to ${v(d.stage)}`, `by ${v(d.actor, 'manager')}`] },
  project_stage_assigned:    { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `stage "${v(d.stage)}" in project "${v(d.project_name)}"`, 'assigned to you', `by ${v(d.actor, 'a manager')}`] },
  project_health_changed:    { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `project "${v(d.project_name)}" health`, `changed to ${v(d.health_score, 'updated')}`, v(d.status, 'review required')] },
  site_visit_assigned:       { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `site visit at ${v(d.site_name)}`, 'assigned to you', `by ${v(d.actor, 'manager')}`] },
  site_visit_started:        { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `site visit at ${v(d.site_name)}`, 'started', `by ${v(d.actor, 'team')}`] },
  site_visit_completed:      { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `site visit at ${v(d.site_name)}`, 'completed', `by ${v(d.actor, 'team')}`] },
  site_visit_postponed:      { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `site visit at ${v(d.site_name)}`, 'postponed', `by ${v(d.actor, 'team')}`] },
  user_approved:             { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), 'your PACT account', 'approved', `you can now log in at ${APP_URL}`] },
  user_rejected:             { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), 'your PACT account status', 'updated', 'please contact your administrator'] },
  crm_opportunity_stage_changed: { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `opportunity "${v(d.opportunity)}"`, `moved to ${v(d.stage)}`, `by ${v(d.actor, 'team')}`] },
  crm_opportunity_won:       { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `opportunity "${v(d.opportunity)}"`, 'WON 🏆', 'congratulations to the team!'] },
  crm_partner_created:       { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `partner "${v(d.partner_name)}"`, 'added to CRM', `by ${v(d.actor, 'team')}`] },
  crm_engagement_created:    { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `${v(d.engagement_type, 'engagement')} with ${v(d.partner_name, 'partner')}`, 'logged', `by ${v(d.actor, 'team')}`] },
  crm_contact_added:         { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `contact "${v(d.contact_name)}" at ${v(d.partner_name, 'partner')}`, 'added to CRM', `by ${v(d.actor, 'team')}`] },
  leave_balance_updated:     { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), 'leave balance', 'updated', `new balance: ${v(d.balance_days, '0')} days`] },
  mmp_updated:               { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `MMP ${v(d.mmp_code)}`, 'updated', `by ${v(d.actor, 'team')}`] },
  project_task_completed:    { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `${v(d.task_title)} (${v(d.project_name, 'project')})`, 'completed', `by ${v(d.actor, 'team')}`] },
  retainer_payment_processed: { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'team'), `retainer payment ${v(d.amount)} ${v(d.currency, 'SDG')}`, 'processed', `for ${v(d.partner_name, 'partner')}`] },
  task_comment_added:        { template: 'pact_status_update', vars: d => [v(d.recipient_name, 'there'), `task "${v(d.task_title)}"`, 'has a new comment', `from ${v(d.actor, 'team')}`] },

  // ── Alerts → pact_alert(title, item, details, action_needed) ────────────────
  task_overdue:              { template: 'pact_alert', vars: d => ['Overdue Task', v(d.task_title), `due ${v(d.due_date, 'unknown')}`, 'take action immediately'] },
  task_delayed:              { template: 'pact_alert', vars: d => ['Task Delayed', v(d.task_title), `marked delayed by ${v(d.actor, 'system')}`, 'review and reschedule'] },
  task_rejected:             { template: 'pact_alert', vars: d => ['Task Rejected', v(d.task_title), `by ${v(d.actor, 'manager')}`, 'review feedback'] },
  task_cancelled:            { template: 'pact_alert', vars: d => ['Task Cancelled', v(d.task_title), 'no longer required', 'no action needed'] },
  project_milestone_overdue: { template: 'pact_alert', vars: d => ['Milestone Overdue', `${v(d.project_name)} — ${v(d.milestone, 'milestone')}`, 'past deadline', 'immediate action required'] },
  project_stalled:           { template: 'pact_alert', vars: d => ['Project Stalled', v(d.project_name), `no activity for ${v(d.days_stalled, 'several')} days`, 'review and re-engage'] },
  project_task_overdue:      { template: 'pact_alert', vars: d => ['Project Task Overdue', `${v(d.task_title)} (${v(d.project_name)})`, 'past deadline', 'take action immediately'] },
  site_flagged_uncovered:    { template: 'pact_alert', vars: d => ['Site Uncovered', v(d.site_name), 'no coverage assigned', 'assign a data collector'] },
  contract_expiring_30d:     { template: 'pact_alert', vars: d => ['Contract Expiring (30d)', v(d.employee), `ends ${v(d.end_date)}`, 'initiate renewal process'] },
  contract_expiring_7d:      { template: 'pact_alert', vars: d => ['Contract Expiring (7d)', v(d.employee), `ends ${v(d.end_date)}`, 'urgent renewal required'] },
  contract_expired:          { template: 'pact_alert', vars: d => ['Contract Expired', v(d.employee), 'expired', 'immediate HR action required'] },
  budget_threshold_80:       { template: 'pact_alert', vars: d => ['Budget 80% Used', v(d.budget_line), `remaining: ${v(d.remaining)} ${v(d.currency, 'SDG')}`, 'monitor spending closely'] },
  budget_threshold_100:      { template: 'pact_alert', vars: d => ['Budget Fully Used', v(d.budget_line), '100% utilized', 'no more spending allowed'] },

  // ── Reminders → pact_reminder(name, message) — static URL button ───────────
  reminder:           { template: 'pact_reminder', vars: d => [v(d.recipient_name, 'there'), v(d.message, '1 pending item')] },
  daily_digest:       { template: 'pact_reminder', vars: d => [v(d.recipient_name, 'there'), `${v(d.active, '0')} active, ${v(d.done, '0')} done, ${v(d.overdue, '0')} overdue`] },
  broadcast:          { template: 'pact_reminder', vars: d => [v(d.recipient_name, 'team'), v(d.message, 'an important announcement')] },
  task_reminder_1day: { template: 'pact_reminder', vars: d => [v(d.recipient_name, 'there'), `1 task due tomorrow: "${v(d.task_title)}"`] },
}

// ── Phone normalizer ──────────────────────────────────────────────────────────
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7) return null
  if (digits.startsWith('249') && digits.length >= 12) return `+${digits}`
  if (digits.startsWith('256') && digits.length >= 12) return `+${digits}`
  if ((digits.startsWith('09') || digits.startsWith('01')) && digits.length === 10) return `+249${digits.slice(1)}`
  if ((digits.startsWith('9') || digits.startsWith('1')) && digits.length === 9) return `+249${digits}`
  if (digits.startsWith('07') && digits.length === 10) return `+256${digits.slice(1)}`
  if (digits.startsWith('7') && digits.length === 9) return `+256${digits}`
  if (digits.length >= 10) return `+${digits}`
  return null
}

// ── Event-type → user-preference column ───────────────────────────────────────
type WhatsAppCategoryCol =
  | 'whatsapp_notify_tasks' | 'whatsapp_notify_approvals'
  | 'whatsapp_notify_payroll' | 'whatsapp_notify_projects' | 'whatsapp_notify_mmp'

const EVENT_CATEGORY_MAP: Record<string, WhatsAppCategoryCol> = {
  task_created: 'whatsapp_notify_tasks', task_assigned: 'whatsapp_notify_tasks',
  task_started: 'whatsapp_notify_tasks', task_acknowledged: 'whatsapp_notify_tasks',
  task_completed: 'whatsapp_notify_tasks', task_delayed: 'whatsapp_notify_tasks',
  task_rejected: 'whatsapp_notify_tasks', task_cancelled: 'whatsapp_notify_tasks',
  task_overdue: 'whatsapp_notify_tasks', task_reminder_1day: 'whatsapp_notify_tasks',
  task_reminder_3day: 'whatsapp_notify_tasks', task_status_changed: 'whatsapp_notify_tasks',
  task_updated: 'whatsapp_notify_tasks',
  mmp_created: 'whatsapp_notify_mmp', mmp_assigned: 'whatsapp_notify_mmp',
  mmp_forwarded: 'whatsapp_notify_mmp', mmp_completed: 'whatsapp_notify_mmp',
  mmp_recall_initiated: 'whatsapp_notify_mmp', mmp_reclaim_approved: 'whatsapp_notify_mmp',
  mmp_cycle_closed: 'whatsapp_notify_mmp',
  site_visit_assigned: 'whatsapp_notify_mmp', site_visit_started: 'whatsapp_notify_mmp',
  site_visit_completed: 'whatsapp_notify_mmp', site_visit_postponed: 'whatsapp_notify_mmp',
  site_flagged_uncovered: 'whatsapp_notify_mmp',
  approval_required: 'whatsapp_notify_approvals', signature_requested: 'whatsapp_notify_approvals',
  signature_completed: 'whatsapp_notify_approvals', leave_request_submitted: 'whatsapp_notify_approvals',
  leave_request_approved: 'whatsapp_notify_approvals', leave_request_rejected: 'whatsapp_notify_approvals',
  leave_request_cancelled: 'whatsapp_notify_approvals',
  payroll_run_completed: 'whatsapp_notify_payroll', payroll_approval_needed: 'whatsapp_notify_payroll',
  payroll_slip_ready: 'whatsapp_notify_payroll',
  contract_expiring_30d: 'whatsapp_notify_payroll', contract_expiring_7d: 'whatsapp_notify_payroll',
  contract_expired: 'whatsapp_notify_payroll',
  cost_submitted: 'whatsapp_notify_payroll', cost_approved: 'whatsapp_notify_payroll',
  cost_rejected: 'whatsapp_notify_payroll', payment_processed: 'whatsapp_notify_payroll',
  wallet_updated: 'whatsapp_notify_payroll', withdrawal_approved: 'whatsapp_notify_payroll',
  withdrawal_rejected: 'whatsapp_notify_payroll', budget_threshold_80: 'whatsapp_notify_payroll',
  budget_threshold_100: 'whatsapp_notify_payroll',
  advance_request_submitted: 'whatsapp_notify_payroll', advance_request_approved: 'whatsapp_notify_payroll',
  advance_request_rejected: 'whatsapp_notify_payroll',
  project_created: 'whatsapp_notify_projects', project_stage_advanced: 'whatsapp_notify_projects',
  project_stage_assigned: 'whatsapp_notify_projects',
  project_milestone_reached: 'whatsapp_notify_projects',
  project_milestone_overdue: 'whatsapp_notify_projects', project_stalled: 'whatsapp_notify_projects',
  project_completed: 'whatsapp_notify_projects', project_archived: 'whatsapp_notify_projects',
  project_member_added: 'whatsapp_notify_projects', project_task_assigned: 'whatsapp_notify_projects',
  project_task_overdue: 'whatsapp_notify_projects', project_health_changed: 'whatsapp_notify_projects',
}

// ── Build Meta template payload ───────────────────────────────────────────────
function buildMetaPayload(to: string, eventType: string, data: Record<string, string>, lang: string) {
  const mapping = EVENT_TO_TEMPLATE[eventType]
  // Unknown events fall through to pact_reminder with raw message
  const tpl: TemplateMapping = mapping ?? {
    template: 'pact_reminder',
    vars: d => [v(d.recipient_name, 'there'), v(d.message, eventType), APP_URL],
  }
  const params = tpl.vars(data).map(text => ({ type: 'text', text: String(text).slice(0, 1024) }))
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: tpl.template,
      language: { code: lang },
      components: [{ type: 'body', parameters: params }],
    },
  }
}

// ── Build Wasender bilingual (EN + AR) free-text message ─────────────────────
function buildWasenderText(eventType: string, data: Record<string, string>, lang: string = 'en'): string {
  const mapping = EVENT_TO_TEMPLATE[eventType]
  const sep = '\n━━━━━━━━━━━━━━━━\n'
  // Logo preview at the top — WhatsApp will render the URL as a rich link card.
  const header = `🏛️ *PACT Command Center*\n_A Synergy of Consulting Expertise for Transformation & Development_\n${APP_URL}/pact-logo-email.png\n\n`
  const footer = `\n\n━━━━━━━━━━━━━━━━\n🔗 Open PACT: ${APP_URL}\n📧 Need help? Reply to this message or email ict@pactorg.com\n_This is an automated message from PACT Workflow Platform._\n_هذه رسالة آلية من منصة باكت._`

  // Stamp every message so users can see when it was triggered (UTC + Africa/Khartoum).
  const ts = new Date()
  const stamp = (() => {
    try {
      return ts.toLocaleString('en-GB', { timeZone: 'Africa/Khartoum', hour12: false })
    } catch {
      return ts.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    }
  })()
  const stampLine = `\n🕒 ${stamp} (Khartoum)`

  if (!mapping) {
    const en = data.message || `PACT update: ${eventType}`
    const ar = data.message_ar || data.message || `تحديث من باكت: ${eventType}`
    const body = lang === 'ar' ? ar + sep + en : en + sep + ar
    return header + body + stampLine + footer
  }
  const p = mapping.vars(data)

  type Pair = { en: string; ar: string }
  const pair: Pair = (() => {
    switch (mapping.template) {
      case 'pact_task_event':
        return {
          en: `📋 *TASK UPDATE*\n\nHello *${p[0]}*,\n\n📌 *Task:* ${p[1]}\n🔄 *Status:* ${p[2]}\n📅 *Due:* ${p[3]}\n\n👉 Open task: ${p[4]}`,
          ar: `📋 *تحديث مهمة*\n\nمرحباً *${p[0]}*،\n\n📌 *المهمة:* ${p[1]}\n🔄 *الحالة:* ${p[2]}\n📅 *الاستحقاق:* ${p[3]}\n\n👉 فتح المهمة: ${p[4]}`,
        }
      case 'pact_approval_request':
        return {
          en: `✅ *APPROVAL REQUIRED*\n\nHello *${p[0]}*,\n\n📌 *Item:* ${p[1]}\n👤 *Submitted by:* ${p[2]}\n⚠️ Your approval is needed to proceed.\n\n👉 Review now: ${p[3]}`,
          ar: `✅ *مطلوب موافقة*\n\nمرحباً *${p[0]}*،\n\n📌 *العنصر:* ${p[1]}\n👤 *مقدم من:* ${p[2]}\n⚠️ موافقتك مطلوبة للمتابعة.\n\n👉 للمراجعة الآن: ${p[3]}`,
        }
      case 'pact_status_update':
        return {
          en: `🔔 *STATUS UPDATE*\n\nHello *${p[0]}*,\n\n📌 *Subject:* ${p[1]}\n✨ *Decision:* ${p[2]}\n📝 *Notes:* ${p[3]}`,
          ar: `🔔 *تحديث حالة*\n\nمرحباً *${p[0]}*،\n\n📌 *الموضوع:* ${p[1]}\n✨ *القرار:* ${p[2]}\n📝 *ملاحظات:* ${p[3]}`,
        }
      case 'pact_alert':
        return {
          en: `⚠️ *ALERT — ${p[0]}*\n\n${p[1]}\n\n📌 *Details:* ${p[2]}\n🚨 *Action needed:* ${p[3]}`,
          ar: `⚠️ *تنبيه — ${p[0]}*\n\n${p[1]}\n\n📌 *التفاصيل:* ${p[2]}\n🚨 *الإجراء المطلوب:* ${p[3]}`,
        }
      case 'pact_reminder':
      default:
        return {
          en: `⏰ *REMINDER*\n\nHello *${p[0]}*,\n\nYou have *${p[1]}*.\n\n👉 View: ${p[2]}`,
          ar: `⏰ *تذكير*\n\nمرحباً *${p[0]}*،\n\nلديك *${p[1]}*.\n\n👉 للعرض: ${p[2]}`,
        }
    }
  })()

  const body = lang === 'ar' ? pair.ar + sep + pair.en : pair.en + sep + pair.ar
  return header + body + stampLine + footer
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const metaToken = Deno.env.get('META_WA_ACCESS_TOKEN')
    const metaPhoneId = Deno.env.get('META_WA_PHONE_NUMBER_ID')
    const wasenderKey = Deno.env.get('WASENDER_API_KEY')

    const hasMeta = !!(metaToken && metaPhoneId)
    const hasWasender = !!wasenderKey
    if (!hasMeta && !hasWasender) {
      console.warn('[WhatsApp] No provider configured (Meta or Wasender)')
      return new Response(
        JSON.stringify({ success: false, error: 'No WhatsApp provider configured', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const body = await req.json()
    const {
      user_ids = [], phone_numbers = [],
      event_type = 'reminder',
      broadcast_id = null,
      priority = 'medium',
      lang_override = null,
      data: templateData = {},
      provider: requestedProvider = 'meta_first',
    } = body as {
      user_ids?: string[]; phone_numbers?: string[];
      event_type?: string; broadcast_id?: string | null;
      priority?: string; lang_override?: string | null;
      data?: Record<string, string>;
      provider?: 'meta' | 'wasender' | 'meta_first' | 'wasender_first';
    }
    // Build provider order based on what's available + the request preference
    const providerOrder: Array<'meta' | 'wasender'> = (() => {
      if (requestedProvider === 'meta')     return hasMeta ? ['meta'] : []
      if (requestedProvider === 'wasender') return hasWasender ? ['wasender'] : []
      if (requestedProvider === 'wasender_first') {
        return [hasWasender && 'wasender', hasMeta && 'meta'].filter(Boolean) as any
      }
      // 'meta_first' (default)
      return [hasMeta && 'meta', hasWasender && 'wasender'].filter(Boolean) as any
    })()
    if (providerOrder.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: `Requested provider '${requestedProvider}' not configured`, skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const categoryCol: WhatsAppCategoryCol | null = EVENT_CATEGORY_MAP[event_type] ?? null
    const isUrgent = priority === 'urgent'

    // Quiet hours: Sudan UTC+2, block 22:00–07:00 unless urgent
    const sudanHour = (new Date().getUTCHours() + 2) % 24
    if ((sudanHour >= 22 || sudanHour < 7) && !isUrgent) {
      console.log(`[WhatsApp] Quiet hours (Sudan ${sudanHour}:00) — deferring ${event_type}`)
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, skipped: true, reason: 'quiet_hours' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    interface PhoneEntry { phone: string; userId: string | null; lang: string }
    let skippedCount = 0

    const logSkip = async (userId: string | null, phone: string, reason: string) => {
      try {
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_logs`, {
          method: 'POST',
          headers: {
            'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            phone: phone || 'unknown', user_id: userId, event_type,
            status: 'skipped', direction: 'outbound',
            error_message: `skip_reason:${reason}`,
          }),
        })
      } catch (_) { /* non-blocking */ }
    }

    const phoneEntries: PhoneEntry[] = phone_numbers
      .filter(Boolean)
      .map(p => ({ phone: p, userId: null, lang: lang_override || 'en' }))

    if (user_ids.length > 0) {
      const [profilesResp, integrationsResp] = await Promise.all([
        supabase.from('profiles').select('id, phone, full_name').in('id', user_ids),
        supabase.from('user_integrations')
          .select('user_id, whatsapp_enabled, whatsapp_phone, whatsapp_notify_tasks, whatsapp_notify_approvals, whatsapp_notify_payroll, whatsapp_notify_projects, whatsapp_notify_mmp')
          .in('user_id', user_ids),
      ])

      interface ProfileRow { id: string; phone: string | null; full_name: string | null }
      interface IntegrationRow {
        user_id: string; whatsapp_enabled: boolean | null; whatsapp_phone: string | null;
        whatsapp_notify_tasks: boolean | null; whatsapp_notify_approvals: boolean | null;
        whatsapp_notify_payroll: boolean | null; whatsapp_notify_projects: boolean | null;
        whatsapp_notify_mmp: boolean | null;
      }
      const profileMap = new Map<string, ProfileRow>((profilesResp.data as ProfileRow[] ?? []).map(p => [p.id, p]))
      const integMap = new Map<string, IntegrationRow>((integrationsResp.data as IntegrationRow[] ?? []).map(r => [r.user_id, r]))

      for (const userId of user_ids) {
        const profile = profileMap.get(userId)
        const integ = integMap.get(userId)

        if (integ && integ.whatsapp_enabled === false) {
          skippedCount++; await logSkip(userId, '', 'user_opted_out'); continue
        }
        if (!isUrgent && integ && categoryCol && integ[categoryCol] === false) {
          skippedCount++; await logSkip(userId, '', `category_disabled:${categoryCol}`); continue
        }

        const phone = (integ?.whatsapp_phone && integ.whatsapp_phone.trim())
          ? integ.whatsapp_phone.trim()
          : profile?.phone

        if (phone) {
          // Inject recipient_name automatically if not provided
          if (!templateData.recipient_name && profile?.full_name) {
            templateData.recipient_name = profile.full_name.split(' ')[0]
          }
          phoneEntries.push({ phone, userId, lang: lang_override || 'en' })
        } else {
          skippedCount++; await logSkip(userId, 'unknown', 'no_phone')
        }
      }
    }

    // Normalize + dedupe
    const seenPhones = new Set<string>()
    const normalized: PhoneEntry[] = []
    for (const entry of phoneEntries) {
      const norm = normalizePhone(entry.phone)
      if (norm && !seenPhones.has(norm)) {
        seenPhones.add(norm)
        normalized.push({ ...entry, phone: norm })
      }
    }

    if (normalized.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, skipped: true, reason: 'No valid phones' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[WhatsApp] Sending ${event_type} via [${providerOrder.join(' → ')}] to ${normalized.length} number(s)`)

    // Rate limit (≥3 sent in last 2min unless urgent)
    const rateLimitedPhones = new Set<string>()
    if (!isUrgent) {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data: recentLogs } = await supabase
        .from('whatsapp_logs').select('phone')
        .in('phone', normalized.map(n => n.phone))
        .eq('status', 'sent').eq('direction', 'outbound')
        .gte('created_at', twoMinAgo)
      const counts = new Map<string, number>()
      for (const row of (recentLogs ?? []) as { phone: string }[]) {
        counts.set(row.phone, (counts.get(row.phone) ?? 0) + 1)
      }
      for (const [phone, count] of counts) if (count >= 3) rateLimitedPhones.add(phone)
    }

    // ── Single-provider attempt (used inside failover loop) ──────────────────
    type AttemptResult = { ok: boolean; providerId: string | null; errorMsg: string | null; bodySent: string; provider: 'meta' | 'wasender' }

    const attemptMeta = async (phone: string, lang: string): Promise<AttemptResult> => {
      const payload = buildMetaPayload(phone, event_type, templateData, lang)
      // Log the human-readable text (same content as Wasender), not the raw JSON.
      // The JSON is what the Meta API needs; the log should be what a human reads.
      const readable = buildWasenderText(event_type, templateData, lang)
      const bodySent = `[META→${metaPhoneId}] ` + readable.slice(0, 950)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const resp = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${metaPhoneId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${metaToken}` },
            body: JSON.stringify(payload),
          })
          const respBody = await resp.text()
          if (resp.ok) {
            let providerId: string | null = null
            try { providerId = JSON.parse(respBody)?.messages?.[0]?.id ?? null } catch (_) {}
            return { ok: true, providerId, errorMsg: null, bodySent, provider: 'meta' }
          }
          const errorMsg = `Meta HTTP ${resp.status}: ${respBody.slice(0, 400)}`
          if (attempt === 1 && (resp.status >= 500 || resp.status === 429)) {
            await new Promise(r => setTimeout(r, 1000)); continue
          }
          return { ok: false, providerId: null, errorMsg, bodySent, provider: 'meta' }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          if (attempt === 1) { await new Promise(r => setTimeout(r, 1000)); continue }
          return { ok: false, providerId: null, errorMsg, bodySent, provider: 'meta' }
        }
      }
      return { ok: false, providerId: null, errorMsg: 'exhausted', bodySent, provider: 'meta' }
    }

    const attemptWasender = async (phone: string, lang: string): Promise<AttemptResult> => {
      const text = buildWasenderText(event_type, templateData, lang)
      const bodySent = `[WASENDER] ` + text.slice(0, 950)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const resp = await fetch(WASENDER_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${wasenderKey}` },
            body: JSON.stringify({ to: phone, text }),
          })
          const respBody = await resp.text()
          if (resp.ok) {
            let providerId: string | null = null
            try { const p = JSON.parse(respBody); providerId = p?.id || p?.messageId || null } catch (_) {}
            return { ok: true, providerId, errorMsg: null, bodySent, provider: 'wasender' }
          }
          const errorMsg = `Wasender HTTP ${resp.status}: ${respBody.slice(0, 300)}`
          if (attempt === 1 && (resp.status >= 500 || resp.status === 429)) {
            await new Promise(r => setTimeout(r, 1000)); continue
          }
          return { ok: false, providerId: null, errorMsg, bodySent, provider: 'wasender' }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          if (attempt === 1) { await new Promise(r => setTimeout(r, 1000)); continue }
          return { ok: false, providerId: null, errorMsg, bodySent, provider: 'wasender' }
        }
      }
      return { ok: false, providerId: null, errorMsg: 'exhausted', bodySent, provider: 'wasender' }
    }

    // Failover: try each provider in order; first one that succeeds wins.
    // If all fail, return the LAST attempt (with combined error trail in errorMsg).
    const sendOne = async (phone: string, lang: string): Promise<AttemptResult> => {
      const attempts: AttemptResult[] = []
      for (const prov of providerOrder) {
        const r = prov === 'meta' ? await attemptMeta(phone, lang) : await attemptWasender(phone, lang)
        attempts.push(r)
        if (r.ok) {
          if (attempts.length > 1) {
            console.log(`[WhatsApp] ${phone}: succeeded via ${prov} after ${attempts.length - 1} provider failure(s)`)
          }
          return r
        }
        console.warn(`[WhatsApp] ${phone}: ${prov} failed → ${r.errorMsg?.slice(0, 200)}`)
      }
      // All providers failed — surface the combined trail
      const combined = attempts.map(a => `${a.provider}: ${a.errorMsg}`).join(' | ')
      return { ...attempts[attempts.length - 1], errorMsg: combined }
    }

    const results = await Promise.all(
      normalized.map(async ({ phone, userId, lang }) => {
        if (rateLimitedPhones.has(phone)) {
          await logSkip(userId, phone, 'rate_limited')
          return { phone, success: false, skipped: true as const }
        }
        const { ok: success, providerId, errorMsg, bodySent, provider } = await sendOne(phone, lang)

        try {
          await fetch(`${supabaseUrl}/rest/v1/whatsapp_logs`, {
            method: 'POST',
            headers: {
              'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json', 'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              phone, user_id: userId, event_type,
              ...(broadcast_id ? { broadcast_id } : {}),
              status: success ? 'sent' : 'failed',
              direction: 'outbound',
              message_body: bodySent.slice(0, 1000),
              error_message: errorMsg ? `[${provider}] ${errorMsg}`.slice(0, 500) : null,
              wasender_id: providerId,
            }),
          })
        } catch (logErr) {
          console.error(`[WhatsApp] log insert failed:`, logErr instanceof Error ? logErr.message : logErr)
        }

        return { phone, success, provider, skipped: false as const }
      }),
    )

    const sent = results.filter(r => r.success).length
    const rateLimitedSkipped = results.filter(r => r.skipped).length
    skippedCount += rateLimitedSkipped
    const failed = results.filter(r => !r.success && !r.skipped).length
    const sentMeta = results.filter(r => r.success && r.provider === 'meta').length
    const sentWasender = results.filter(r => r.success && r.provider === 'wasender').length

    try {
      await supabase.from('audit_logs').insert({
        module: 'notification', action: 'whatsapp_send',
        entity_type: 'whatsapp', entity_id: `wa-${Date.now()}`, entity_name: event_type,
        description: `WhatsApp [${providerOrder.join('→')}]: meta=${sentMeta}, wasender=${sentWasender}, failed=${failed} for event=${event_type}`,
        success: sent > 0, actor_name: 'System',
        metadata: { event_type, sent, failed, total: normalized.length, sent_meta: sentMeta, sent_wasender: sentWasender, provider_order: providerOrder },
      })
    } catch (_) { /* non-blocking */ }

    return new Response(
      JSON.stringify({
        success: true,
        sent, failed, total: normalized.length, skipped: skippedCount,
        provider_order: providerOrder,
        sent_via_meta: sentMeta,
        sent_via_wasender: sentWasender,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[WhatsApp] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
