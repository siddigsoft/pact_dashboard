import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
  event_type: string
  entity_type?: string
  entity_id?: string
  priority?: 'urgent' | 'high' | 'normal'
  recipient_ids?: string[]
  recipient_roles?: string[]
  title_en: string
  title_ar?: string
  message_en: string
  message_ar?: string
  triggered_by?: string
  triggered_by_name?: string
  workflow_stage?: string
  action_url?: string
  metadata?: Record<string, any>
  send_email?: boolean
}

// ── Event Templates (expanded to 40+ types) ────────────────────────────────────
const eventTemplates: Record<string, { title_en: string; title_ar: string; category: string; priority: string }> = {
  // MMP
  'mmp_created':                { title_en: 'New MMP Created',                      title_ar: 'تم إنشاء خطة مراقبة شهرية جديدة',             category: 'assignments',  priority: 'normal' },
  'mmp_assigned':               { title_en: 'MMP Assigned to You',                  title_ar: 'تم تعيين خطة مراقبة شهرية لك',                category: 'assignments',  priority: 'normal' },
  'mmp_updated':                { title_en: 'MMP Updated',                          title_ar: 'تم تحديث خطة المراقبة الشهرية',               category: 'assignments',  priority: 'normal' },
  'mmp_completed':              { title_en: 'MMP Completed',                        title_ar: 'اكتملت خطة المراقبة الشهرية',                 category: 'assignments',  priority: 'normal' },
  'mmp_forwarded':              { title_en: 'MMP Forwarded for Approval',           title_ar: 'تم تحويل خطة المراقبة الشهرية للموافقة',      category: 'approvals',    priority: 'high'   },
  'mmp_recall_initiated':       { title_en: 'MMP Recall Initiated',                 title_ar: 'تم بدء استرداد خطة المراقبة الشهرية',         category: 'assignments',  priority: 'high'   },
  'mmp_reclaim_approved':       { title_en: 'MMP Reclaim Approved',                 title_ar: 'تمت الموافقة على مطالبة خطة المراقبة',        category: 'approvals',    priority: 'normal' },
  'mmp_cycle_closed':           { title_en: 'MMP Cycle Closed',                     title_ar: 'تم إغلاق دورة خطة المراقبة الشهرية',         category: 'system',       priority: 'normal' },
  // Tasks
  'task_assigned':              { title_en: 'New Task Assigned',                    title_ar: 'تم تعيين مهمة جديدة',                         category: 'assignments',  priority: 'normal' },
  'task_completed':             { title_en: 'Task Completed',                       title_ar: 'اكتملت المهمة',                               category: 'system',       priority: 'normal' },
  'task_updated':               { title_en: 'Task Updated',                         title_ar: 'تم تحديث المهمة',                             category: 'system',       priority: 'normal' },
  'task_overdue':               { title_en: 'Task Overdue',                         title_ar: 'المهمة متأخرة',                               category: 'assignments',  priority: 'high'   },
  // Site Visits
  'site_visit_assigned':        { title_en: 'Site Visit Assigned',                  title_ar: 'تم تعيين زيارة ميدانية',                      category: 'assignments',  priority: 'normal' },
  'site_visit_started':         { title_en: 'Site Visit Started',                   title_ar: 'بدأت الزيارة الميدانية',                      category: 'assignments',  priority: 'normal' },
  'site_visit_completed':       { title_en: 'Site Visit Completed',                 title_ar: 'اكتملت الزيارة الميدانية',                    category: 'assignments',  priority: 'normal' },
  'site_visit_postponed':       { title_en: 'Site Visit Postponed',                 title_ar: 'تم تأجيل الزيارة الميدانية',                  category: 'assignments',  priority: 'normal' },
  'site_flagged_uncovered':     { title_en: 'Site Flagged as Uncovered',            title_ar: 'تم تعليم الموقع كغير مغطى',                   category: 'assignments',  priority: 'high'   },
  // Financial
  'cost_submitted':             { title_en: 'Cost Submission Received',             title_ar: 'تم استلام طلب التكلفة',                       category: 'approvals',    priority: 'normal' },
  'cost_approved':              { title_en: 'Cost Approved',                        title_ar: 'تمت الموافقة على التكلفة',                    category: 'financial',    priority: 'normal' },
  'cost_rejected':              { title_en: 'Cost Rejected',                        title_ar: 'تم رفض التكلفة',                              category: 'financial',    priority: 'normal' },
  'payment_processed':          { title_en: 'Payment Processed',                    title_ar: 'تمت معالجة الدفع',                           category: 'financial',    priority: 'normal' },
  'wallet_updated':             { title_en: 'Wallet Balance Updated',               title_ar: 'تم تحديث رصيد المحفظة',                      category: 'financial',    priority: 'normal' },
  'withdrawal_approved':        { title_en: 'Withdrawal Request Approved',          title_ar: 'تمت الموافقة على طلب السحب',                  category: 'financial',    priority: 'normal' },
  'withdrawal_rejected':        { title_en: 'Withdrawal Request Not Approved',      title_ar: 'لم تتم الموافقة على طلب السحب',               category: 'financial',    priority: 'normal' },
  'budget_threshold_80':        { title_en: 'Budget Alert: 80% Utilized',           title_ar: 'تنبيه الميزانية: تم استخدام 80٪',             category: 'financial',    priority: 'high'   },
  'budget_threshold_100':       { title_en: 'Budget Alert: Fully Utilized',         title_ar: 'تنبيه الميزانية: تم استخدام كامل الميزانية', category: 'financial',    priority: 'urgent' },
  // Approvals
  'approval_required':          { title_en: 'Approval Required',                    title_ar: 'مطلوب موافقة',                                category: 'approvals',    priority: 'high'   },
  // Leave Requests
  'leave_request_submitted':    { title_en: 'Leave Request Submitted',              title_ar: 'تم تقديم طلب إجازة',                         category: 'approvals',    priority: 'normal' },
  'leave_request_approved':     { title_en: 'Leave Request Approved',               title_ar: 'تمت الموافقة على طلب الإجازة',               category: 'system',       priority: 'normal' },
  'leave_request_rejected':     { title_en: 'Leave Request Not Approved',           title_ar: 'لم تتم الموافقة على طلب الإجازة',            category: 'system',       priority: 'normal' },
  // Payroll & Contracts
  'payroll_run_completed':      { title_en: 'Payroll Processed',                    title_ar: 'تمت معالجة كشف الرواتب',                     category: 'financial',    priority: 'normal' },
  'payroll_approval_needed':    { title_en: 'Payroll Approval Required',            title_ar: 'مطلوب موافقة على كشف الرواتب',               category: 'approvals',    priority: 'high'   },
  'contract_expiring_30d':      { title_en: 'Contract Expiring in 30 Days',         title_ar: 'عقد ينتهي خلال 30 يوماً',                    category: 'system',       priority: 'normal' },
  'contract_expiring_7d':       { title_en: 'Contract Expiring This Week',          title_ar: 'عقد ينتهي هذا الأسبوع',                      category: 'system',       priority: 'high'   },
  'contract_expired':           { title_en: 'Contract Expired',                     title_ar: 'انتهى العقد',                                 category: 'system',       priority: 'urgent' },
  // Signatures
  'signature_requested':        { title_en: 'Your Signature is Required',           title_ar: 'توقيعك مطلوب',                                category: 'approvals',    priority: 'high'   },
  'signature_completed':        { title_en: 'Document Signed Successfully',         title_ar: 'تم توقيع المستند بنجاح',                      category: 'system',       priority: 'normal' },
  // Projects
  'project_stage_advanced':     { title_en: 'Project Stage Advanced',               title_ar: 'تقدمت مرحلة المشروع',                        category: 'system',       priority: 'normal' },
  'project_milestone_overdue':  { title_en: 'Project Milestone Overdue',            title_ar: 'تأخر إنجاز المرحلة الرئيسية',                category: 'assignments',  priority: 'high'   },
  'project_stalled':            { title_en: 'Project Stalled – Action Needed',      title_ar: 'المشروع متوقف – مطلوب إجراء',                category: 'assignments',  priority: 'high'   },
  // CRM
  'crm_opportunity_stage_changed': { title_en: 'Opportunity Stage Updated',        title_ar: 'تم تحديث مرحلة الفرصة',                      category: 'system',       priority: 'normal' },
  'crm_opportunity_won':        { title_en: 'Opportunity Won!',                     title_ar: 'تم الفوز بالفرصة!',                          category: 'system',       priority: 'normal' },
  // Account / User
  'user_approved':              { title_en: 'Account Approved',                     title_ar: 'تمت الموافقة على الحساب',                    category: 'account',      priority: 'normal' },
  'user_rejected':              { title_en: 'Account Status Updated',               title_ar: 'تم تحديث حالة الحساب',                       category: 'account',      priority: 'normal' },
  // Broadcast / System
  'broadcast':                  { title_en: 'System Announcement',                  title_ar: 'إعلان النظام',                                category: 'broadcast',    priority: 'normal' },
  'reminder':                   { title_en: 'Reminder',                             title_ar: 'تذكير',                                       category: 'system',       priority: 'normal' },
  'daily_digest':               { title_en: 'Daily Action Summary',                 title_ar: 'ملخص الإجراءات اليومية',                      category: 'system',       priority: 'normal' },
}

// ── Preference column mapping (expanded) ──────────────────────────────────────
const EVENT_TYPE_PREF_MAP: Record<string, string> = {
  'task_assigned':               'email_notify_task_assigned',
  'task_updated':                'email_notify_task_assigned',
  'task_completed':              'email_notify_task_assigned',
  'task_overdue':                'email_notify_task_assigned',
  'approval_required':           'email_notify_approval_needed',
  'mmp_assigned':                'email_notify_approval_needed',
  'mmp_forwarded':               'email_notify_approval_needed',
  'mmp_recall_initiated':        'email_notify_approval_needed',
  'cost_submitted':              'email_notify_approval_needed',
  'leave_request_submitted':     'email_notify_approval_needed',
  'leave_request_approved':      'email_notify_approval_needed',
  'leave_request_rejected':      'email_notify_approval_needed',
  'signature_requested':         'email_notify_approval_needed',
  'payroll_approval_needed':     'email_notify_approval_needed',
  'payment_processed':           'email_notify_payroll',
  'wallet_updated':              'email_notify_payroll',
  'cost_approved':               'email_notify_payroll',
  'cost_rejected':               'email_notify_payroll',
  'withdrawal_approved':         'email_notify_payroll',
  'withdrawal_rejected':         'email_notify_payroll',
  'payroll_run_completed':       'email_notify_payroll',
  'budget_threshold_80':         'email_notify_payroll',
  'budget_threshold_100':        'email_notify_payroll',
  'mmp_completed':               'email_notify_project_milestones',
  'site_visit_completed':        'email_notify_project_milestones',
  'mmp_cycle_closed':            'email_notify_project_milestones',
  'project_stage_advanced':      'email_notify_project_milestones',
  'project_milestone_overdue':   'email_notify_project_milestones',
  'project_stalled':             'email_notify_project_milestones',
  'mmp_created':                 'email_notify_system',
  'user_approved':               'email_notify_system',
  'user_rejected':               'email_notify_system',
  'broadcast':                   'email_notify_system',
  'contract_expiring_30d':       'email_notify_system',
  'contract_expiring_7d':        'email_notify_system',
  'contract_expired':            'email_notify_system',
  'site_flagged_uncovered':      'email_notify_system',
  'crm_opportunity_stage_changed': 'email_notify_system',
  'crm_opportunity_won':         'email_notify_system',
  'daily_digest':                'email_notify_system',
  'reminder':                    'email_notify_system',
}

// ── Per-event email accent colors ─────────────────────────────────────────────
function getEventAccentColor(eventType: string, priority?: string): string {
  if (priority === 'urgent') return '#dc2626'
  if (priority === 'high') return '#d97706'
  const colorMap: Record<string, string> = {
    'cost_approved':        '#059669',
    'withdrawal_approved':  '#059669',
    'leave_request_approved': '#059669',
    'user_approved':        '#059669',
    'mmp_completed':        '#059669',
    'site_visit_completed': '#059669',
    'signature_completed':  '#059669',
    'payroll_run_completed':'#059669',
    'project_stage_advanced':'#059669',
    'crm_opportunity_won':  '#059669',
    'cost_rejected':        '#dc2626',
    'withdrawal_rejected':  '#dc2626',
    'leave_request_rejected':'#dc2626',
    'user_rejected':        '#dc2626',
    'contract_expired':     '#dc2626',
    'budget_threshold_100': '#dc2626',
    'task_overdue':         '#dc2626',
    'project_milestone_overdue': '#dc2626',
    'approval_required':    '#d97706',
    'mmp_forwarded':        '#d97706',
    'cost_submitted':       '#d97706',
    'leave_request_submitted': '#d97706',
    'signature_requested':  '#d97706',
    'payroll_approval_needed': '#d97706',
    'contract_expiring_7d': '#d97706',
    'contract_expiring_30d':'#f59e0b',
    'budget_threshold_80':  '#f59e0b',
    'site_flagged_uncovered':'#f59e0b',
    'project_stalled':      '#f59e0b',
    'task_assigned':        '#2563eb',
    'site_visit_assigned':  '#2563eb',
    'mmp_assigned':         '#2563eb',
    'mmp_recall_initiated': '#7c3aed',
    'broadcast':            '#7c3aed',
    'wallet_updated':       '#0891b2',
    'payment_processed':    '#0891b2',
  }
  return colorMap[eventType] || '#1D3461'
}

// ── Per-event icon HTML ───────────────────────────────────────────────────────
function getEventIconSvg(eventType: string): string {
  const icons: Record<string, string> = {
    'cost_approved': '✅', 'withdrawal_approved': '✅', 'leave_request_approved': '✅',
    'user_approved': '✅', 'mmp_completed': '✅', 'signature_completed': '✅',
    'payroll_run_completed': '💰', 'payment_processed': '💰', 'wallet_updated': '💰',
    'cost_submitted': '📋', 'leave_request_submitted': '📋', 'payroll_approval_needed': '📋',
    'cost_rejected': '❌', 'withdrawal_rejected': '❌', 'leave_request_rejected': '❌',
    'user_rejected': '❌', 'contract_expired': '❌', 'budget_threshold_100': '🚨',
    'task_assigned': '📌', 'mmp_assigned': '📌', 'site_visit_assigned': '📍',
    'approval_required': '⏳', 'mmp_forwarded': '⏳', 'signature_requested': '✍️',
    'contract_expiring_7d': '⚠️', 'contract_expiring_30d': '⏰', 'task_overdue': '⏰',
    'site_flagged_uncovered': '🚩', 'project_stalled': '⚠️', 'mmp_recall_initiated': '🔄',
    'budget_threshold_80': '📊', 'project_milestone_overdue': '📅', 'broadcast': '📢',
    'project_stage_advanced': '🚀', 'crm_opportunity_won': '🏆', 'reminder': '🔔',
  }
  return icons[eventType] || '🔔'
}

// ── Contextual sections per event type ────────────────────────────────────────
function getEventContextBlock(eventType: string, metadata: Record<string, any>, accentColor: string): string {
  const items: { label_en: string; label_ar: string; value: string }[] = []

  if (['cost_submitted', 'cost_approved', 'cost_rejected'].includes(eventType)) {
    if (metadata.amount)     items.push({ label_en: 'Amount',          label_ar: 'المبلغ',          value: `${metadata.amount} ${metadata.currency || 'SDG'}` })
    if (metadata.category)   items.push({ label_en: 'Category',        label_ar: 'الفئة',           value: metadata.category })
    if (metadata.submitted_by) items.push({ label_en: 'Submitted By',  label_ar: 'قُدِّم بواسطة',   value: metadata.submitted_by })
    if (metadata.period)     items.push({ label_en: 'Period',          label_ar: 'الفترة',          value: metadata.period })
  }
  if (['withdrawal_approved', 'withdrawal_rejected', 'wallet_updated', 'payment_processed'].includes(eventType)) {
    if (metadata.amount)     items.push({ label_en: 'Amount',          label_ar: 'المبلغ',          value: `${metadata.amount} ${metadata.currency || 'SDG'}` })
    if (metadata.account)    items.push({ label_en: 'Account',         label_ar: 'الحساب',          value: metadata.account })
    if (metadata.balance)    items.push({ label_en: 'New Balance',      label_ar: 'الرصيد الجديد',   value: `${metadata.balance} ${metadata.currency || 'SDG'}` })
  }
  if (['leave_request_submitted', 'leave_request_approved', 'leave_request_rejected'].includes(eventType)) {
    if (metadata.leave_type) items.push({ label_en: 'Leave Type',      label_ar: 'نوع الإجازة',     value: metadata.leave_type })
    if (metadata.from_date)  items.push({ label_en: 'From Date',       label_ar: 'من تاريخ',        value: metadata.from_date })
    if (metadata.to_date)    items.push({ label_en: 'To Date',         label_ar: 'إلى تاريخ',       value: metadata.to_date })
    if (metadata.days)       items.push({ label_en: 'Days',            label_ar: 'الأيام',          value: `${metadata.days} day(s)` })
  }
  if (['contract_expiring_30d', 'contract_expiring_7d', 'contract_expired'].includes(eventType)) {
    if (metadata.employee)   items.push({ label_en: 'Employee',        label_ar: 'الموظف',          value: metadata.employee })
    if (metadata.end_date)   items.push({ label_en: 'Contract End Date', label_ar: 'تاريخ انتهاء العقد', value: metadata.end_date })
    if (metadata.days_remaining) items.push({ label_en: 'Days Remaining', label_ar: 'الأيام المتبقية', value: `${metadata.days_remaining} days` })
  }
  if (['task_assigned', 'task_overdue', 'task_updated', 'task_completed'].includes(eventType)) {
    if (metadata.task_name)  items.push({ label_en: 'Task',            label_ar: 'المهمة',          value: metadata.task_name })
    if (metadata.due_date)   items.push({ label_en: 'Due Date',        label_ar: 'تاريخ الاستحقاق', value: metadata.due_date })
    if (metadata.priority)   items.push({ label_en: 'Priority',        label_ar: 'الأولوية',        value: metadata.priority })
  }
  if (['project_stage_advanced', 'project_stalled', 'project_milestone_overdue'].includes(eventType)) {
    if (metadata.project_name) items.push({ label_en: 'Project',       label_ar: 'المشروع',         value: metadata.project_name })
    if (metadata.stage)      items.push({ label_en: 'Stage',           label_ar: 'المرحلة',         value: metadata.stage })
    if (metadata.milestone)  items.push({ label_en: 'Milestone',       label_ar: 'المرحلة الرئيسية', value: metadata.milestone })
  }
  if (['mmp_assigned', 'mmp_recall_initiated', 'mmp_cycle_closed', 'mmp_completed'].includes(eventType)) {
    if (metadata.mmp_code)   items.push({ label_en: 'MMP Code',        label_ar: 'رمز الخطة',       value: metadata.mmp_code })
    if (metadata.site_name)  items.push({ label_en: 'Site',            label_ar: 'الموقع',          value: metadata.site_name })
    if (metadata.cycle)      items.push({ label_en: 'Cycle',           label_ar: 'الدورة',          value: metadata.cycle })
  }
  if (['budget_threshold_80', 'budget_threshold_100'].includes(eventType)) {
    if (metadata.budget_line) items.push({ label_en: 'Budget Line',    label_ar: 'بند الميزانية',   value: metadata.budget_line })
    if (metadata.utilized)   items.push({ label_en: 'Utilized',        label_ar: 'المستخدم',        value: `${metadata.utilized}%` })
    if (metadata.remaining)  items.push({ label_en: 'Remaining',       label_ar: 'المتبقي',         value: `${metadata.remaining} ${metadata.currency || 'SDG'}` })
  }
  if (metadata.payroll_month) items.push({ label_en: 'Payroll Month',  label_ar: 'شهر الراتب',      value: metadata.payroll_month })

  if (items.length === 0) return ''

  const rows = items.map(item => `
    <tr>
      <td style="padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 600; white-space: nowrap; width: 35%;">${item.label_en}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b; font-weight: 500;">${item.value}</td>
      <td style="padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 600; text-align: right; direction: rtl;">${item.label_ar}</td>
    </tr>
  `).join('')

  return `
    <div style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background: ${accentColor}; padding: 10px 14px;">
        <span style="color: white; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Details / التفاصيل</span>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        ${rows}
      </table>
    </div>
  `
}

// ── Master email HTML generator (contextual per event) ────────────────────────
function generateEventEmailHtml(
  title_en: string,
  title_ar: string,
  message_en: string,
  message_ar: string,
  recipientName: string,
  eventType: string,
  priority: string,
  actionUrl?: string,
  metadata: Record<string, any> = {},
  recipientRoles: string[] = []
): string {
  const accentColor = getEventAccentColor(eventType, priority)
  const icon = getEventIconSvg(eventType)
  const contextBlock = getEventContextBlock(eventType, metadata, accentColor)

  const isSuccess = ['approved', 'completed', 'processed', 'won'].some(k => eventType.includes(k))
  const isError   = ['rejected', 'expired', 'overdue'].some(k => eventType.includes(k))
  const isWarning = ['expiring', 'threshold', 'stalled', 'flagged', 'overdue', 'recall'].some(k => eventType.includes(k))

  const headerBg = isSuccess ? '#ecfdf5' : isError ? '#fef2f2' : isWarning ? '#fffbeb' : '#eff6ff'
  const headerText = isSuccess ? '#065f46' : isError ? '#991b1b' : isWarning ? '#78350f' : '#1e3a5f'

  const actionBtnColor = isSuccess ? '#059669' : isError ? '#dc2626' : accentColor
  const actionBtnLabel_en = (() => {
    if (['approval_required', 'cost_submitted', 'leave_request_submitted', 'payroll_approval_needed', 'mmp_forwarded', 'signature_requested'].includes(eventType)) return 'Review & Approve →'
    if (eventType.includes('assigned')) return 'View Assignment →'
    if (['project_stage_advanced', 'project_stalled', 'project_milestone_overdue'].includes(eventType)) return 'View Project →'
    if (['contract_expiring_7d', 'contract_expiring_30d', 'contract_expired'].includes(eventType)) return 'View Contract →'
    return 'View Details →'
  })()
  const actionBtnLabel_ar = (() => {
    if (['approval_required', 'cost_submitted', 'leave_request_submitted', 'payroll_approval_needed', 'mmp_forwarded', 'signature_requested'].includes(eventType)) return '← المراجعة والموافقة'
    if (eventType.includes('assigned')) return '← عرض التعيين'
    return '← عرض التفاصيل'
  })()

  const roleDisplayNames: Record<string, { en: string; ar: string }> = {
    'super_admin': { en: 'Super Administrators', ar: 'المسؤولين الكبار' },
    'admin': { en: 'Administrators', ar: 'المسؤولين' },
    'supervisor': { en: 'Supervisors', ar: 'المشرفين' },
    'coordinator': { en: 'Coordinators', ar: 'المنسقين' },
    'data_collector': { en: 'Data Collectors', ar: 'جامعي البيانات' },
    'finance': { en: 'Finance Team', ar: 'فريق المالية' },
    'project_manager': { en: 'Project Managers', ar: 'مديري المشاريع' },
  }
  const uniqueRoles = [...new Set(recipientRoles)]
  const rolesEn = uniqueRoles.map(r => roleDisplayNames[r]?.en || r).join(', ')
  const rolesAr = uniqueRoles.map(r => roleDisplayNames[r]?.ar || r).join('، ')
  const recipientNoticeEn = uniqueRoles.length > 0
    ? `Sent to ${rolesEn} for oversight and accountability.`
    : 'Sent to relevant management for oversight and accountability.'
  const recipientNoticeAr = uniqueRoles.length > 0
    ? `تم الإرسال إلى ${rolesAr} للإشراف والمساءلة.`
    : 'تم الإرسال إلى الإدارة المعنية للإشراف والمساءلة.'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title_en}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        
        <!-- Brand header -->
        <tr><td style="background:linear-gradient(135deg,#0F2041 0%,#1D3461 100%);padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
          <div style="font-size:28px;margin-bottom:4px;">${icon}</div>
          <h1 style="color:white;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em;">PACT Command Center</h1>
          <p style="color:rgba(255,255,255,0.65);margin:4px 0 0;font-size:13px;">مركز قيادة باكت للعمليات الميدانية</p>
        </td></tr>

        <!-- Priority stripe -->
        <tr><td style="background:${accentColor};height:4px;"></td></tr>

        <!-- Event type badge + main title -->
        <tr><td style="background:${headerBg};padding:24px 32px;border-left:4px solid ${accentColor};">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.08em;">${eventType.replace(/_/g,' ')}</p>
          <h2 style="margin:0 0 4px;font-size:22px;font-weight:800;color:${headerText};">${title_en}</h2>
          <p style="margin:0;font-size:16px;color:${headerText};opacity:0.8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;text-align:right;">${title_ar}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:white;padding:28px 32px;">

          <!-- Greeting -->
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Dear <strong>${recipientName}</strong>,<br>
            <span style="font-size:14px;color:#6b7280;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">عزيزي ${recipientName}،</span>
          </p>

          <!-- English message -->
          <div style="background:#f8fafc;border-left:3px solid ${accentColor};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:16px;">
            <p style="margin:0;font-size:15px;line-height:1.7;color:#374151;">${message_en}</p>
          </div>

          <!-- Arabic message -->
          <div style="background:#f8fafc;border-right:3px solid ${accentColor};border-left:none;padding:16px 20px;border-radius:8px 0 0 8px;margin-bottom:20px;direction:rtl;text-align:right;">
            <p style="margin:0;font-size:15px;line-height:1.9;color:#374151;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">${message_ar}</p>
          </div>

          <!-- Context details block (dynamic per event type) -->
          ${contextBlock}

          <!-- Action button -->
          ${actionUrl ? `
          <div style="text-align:center;margin:28px 0 8px;">
            <a href="${actionUrl}"
               style="display:inline-block;padding:14px 32px;background:${actionBtnColor};color:white;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:-0.01em;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
              ${actionBtnLabel_en}
            </a>
          </div>
          <p style="text-align:center;margin:8px 0 0;font-size:13px;color:#9ca3af;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">${actionBtnLabel_ar}</p>
          ` : ''}

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-align:center;">${recipientNoticeEn}</p>
          <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;text-align:center;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">${recipientNoticeAr}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0;">
          <p style="margin:0;font-size:11px;color:#cbd5e1;text-align:center;">
            This is an automated message from PACT Workflow Platform.<br>
            <span style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;">هذه رسالة آلية من منصة باكت للعمليات الميدانية</span><br><br>
            ICT Team · PACT Command Center · <a href="https://app.pactorg.com" style="color:#1D3461;">app.pactorg.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: NotificationPayload = await req.json()

    const {
      event_type,
      entity_type,
      entity_id,
      priority = 'normal',
      recipient_ids = [],
      recipient_roles = [],
      title_en,
      title_ar,
      message_en,
      message_ar,
      triggered_by,
      triggered_by_name,
      workflow_stage,
      action_url,
      metadata = {},
      send_email = true
    } = payload

    if (!event_type || !message_en) {
      return new Response(
        JSON.stringify({ success: false, error: 'event_type and message_en are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get template defaults
    const template = eventTemplates[event_type] || { title_en: 'Notification', title_ar: 'إشعار', category: 'system', priority: 'normal' }
    const finalTitleEn = title_en || template.title_en
    const finalTitleAr = title_ar || template.title_ar
    const effectivePriority = priority || template.priority || 'normal'

    // Get recipients based on IDs and roles
    let recipients: any[] = []

    if (recipient_ids.length > 0) {
      const { data: usersByIds } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .in('id', recipient_ids)
      if (usersByIds) recipients.push(...usersByIds)
    }

    if (recipient_roles.length > 0) {
      const { data: usersByRoles } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .in('role', recipient_roles)
        .eq('status', 'approved')
      if (usersByRoles) {
        const existingIds = new Set(recipients.map(r => r.id))
        for (const user of usersByRoles) {
          if (!existingIds.has(user.id)) recipients.push(user)
        }
      }
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No recipients found', notifications_created: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch email integration preferences
    const prefColumn = EVENT_TYPE_PREF_MAP[event_type] ?? null
    const recipientIdSet = recipients.map(r => r.id)
    const { data: integrationPrefs } = await supabase
      .from('user_integrations')
      .select('user_id, email_notifications_enabled, notification_email, email_notify_task_assigned, email_notify_approval_needed, email_notify_payroll, email_notify_project_milestones, email_notify_system')
      .in('user_id', recipientIdSet)

    const prefsByUserId = new Map<string, Record<string, unknown>>()
    for (const pref of (integrationPrefs ?? [])) {
      prefsByUserId.set(pref.user_id as string, pref as Record<string, unknown>)
    }

    // SMTP configuration
    const smtpHost = Deno.env.get('SMTP_HOST')
    const smtpPort = Deno.env.get('SMTP_PORT') || '465'
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPassword = Deno.env.get('SMTP_PASSWORD')
    const smtpConfigured = smtpHost && smtpUser && smtpPassword

    let nodemailerTransporter: any = null
    if (smtpConfigured && send_email) {
      try {
        const nodemailer = await import('npm:nodemailer@6.9.8')
        nodemailerTransporter = nodemailer.default.createTransport({
          host: smtpHost,
          port: Number(smtpPort),
          secure: Number(smtpPort) === 465,
          auth: { user: smtpUser, pass: smtpPassword },
          tls: { rejectUnauthorized: false }
        })
      } catch (e) {
        console.error('Failed to create SMTP transporter:', e)
      }
    }

    const notifications: any[] = []
    const emailResults: any[] = []

    for (const recipient of recipients) {
      const notification = {
        event_type,
        entity_type,
        entity_id,
        priority: effectivePriority,
        status: 'pending',
        recipient_id: recipient.id,
        recipient_email: recipient.email,
        recipient_role: recipient.role,
        title_en: finalTitleEn,
        title_ar: finalTitleAr,
        message_en,
        message_ar: message_ar || message_en,
        triggered_by,
        triggered_by_name,
        workflow_stage,
        action_url,
        metadata,
        email_sent: false
      }

      const { data: inserted, error: insertError } = await supabase
        .from('notifications')
        .insert(notification)
        .select()
        .single()

      if (insertError) {
        if (insertError.code === '42P01' || insertError.code === '42703' ||
            insertError.message?.includes('does not exist')) {
          console.log('Notifications table not configured, skipping DB insert but sending email')
        } else {
          console.error('Failed to insert notification:', insertError)
        }
      } else {
        notifications.push(inserted)
      }

      // Email logic respecting per-user preferences
      const recipientPrefs = prefsByUserId.get(recipient.id)
      const userEmailEnabled = recipientPrefs ? recipientPrefs.email_notifications_enabled !== false : true
      const categoryEnabled = recipientPrefs && prefColumn ? recipientPrefs[prefColumn] !== false : true
      const effectiveEmail = (recipientPrefs?.notification_email as string | null) || recipient.email

      if (nodemailerTransporter && effectiveEmail && send_email && userEmailEnabled && categoryEnabled) {
        try {
          const allRecipientRoles = recipients.map(r => r.role).filter(Boolean)
          const emailHtml = generateEventEmailHtml(
            finalTitleEn,
            finalTitleAr,
            message_en,
            message_ar || message_en,
            recipient.full_name || 'Team Member',
            event_type,
            effectivePriority,
            action_url,
            metadata,
            allRecipientRoles
          )

          const priorityLabel = effectivePriority.toUpperCase()
          const mailOptions = {
            from: `"PACT Command Center" <${smtpUser}>`,
            to: effectiveEmail,
            subject: `[${priorityLabel}] ${finalTitleEn} | ${finalTitleAr}`,
            text: `${finalTitleEn}\n\n${message_en}\n\n---\n\n${finalTitleAr}\n\n${message_ar || message_en}`,
            html: emailHtml
          }

          const info = await nodemailerTransporter.sendMail(mailOptions)

          if (inserted?.id) {
            await supabase
              .from('notifications')
              .update({ email_sent: true, email_sent_at: new Date().toISOString(), status: 'sent' })
              .eq('id', inserted.id)
          }

          emailResults.push({ recipient: recipient.email, success: true, messageId: info.messageId })
          console.log(`Email sent to ${recipient.email}: ${event_type}`)

          // Audit log
          try {
            await supabase.from('audit_logs').insert({
              module: 'notification',
              action: 'send',
              entity_type: 'email',
              entity_id: info.messageId || `email-${Date.now()}`,
              entity_name: `[${priorityLabel}] ${finalTitleEn}`,
              description: `Email sent to ${effectiveEmail}: ${finalTitleEn}`,
              success: true,
              actor_id: triggered_by || 'system',
              actor_name: triggered_by_name || 'System',
              metadata: { recipient: effectiveEmail, subject: `[${priorityLabel}] ${finalTitleEn}`, emailType: 'notification', messageId: info.messageId, deliveredAt: new Date().toISOString(), event_type, priority: effectivePriority }
            })
          } catch (logErr) {
            console.warn('Failed to log email to audit:', logErr)
          }

        } catch (emailError) {
          const errMsg = (emailError as Error)?.message || 'Unknown email error'
          console.error(`Failed to send email to ${effectiveEmail}:`, errMsg)

          if (inserted?.id) {
            await supabase
              .from('notifications')
              .update({ email_error: errMsg })
              .eq('id', inserted.id)
          }

          try {
            await supabase.from('audit_logs').insert({
              module: 'notification',
              action: 'send',
              entity_type: 'email',
              entity_id: `email-${Date.now()}`,
              entity_name: `${finalTitleEn}`,
              description: `Failed to send email to ${effectiveEmail}: ${finalTitleEn}`,
              success: false,
              error_message: errMsg,
              actor_id: triggered_by || 'system',
              actor_name: triggered_by_name || 'System',
              metadata: { recipient: effectiveEmail, event_type, priority: effectivePriority, errorMessage: errMsg }
            })
          } catch (logErr) {
            console.warn('Failed to log email error to audit:', logErr)
          }

          emailResults.push({ recipient: recipient.email, success: false, error: errMsg })
        }
      }
    }

    // FCM push notifications (fire-and-forget)
    if (recipients.length > 0) {
      const recipientIds = recipients.map((r: any) => r.id).filter(Boolean)
      if (recipientIds.length > 0) {
        const fcmPriority = effectivePriority === 'urgent' || effectivePriority === 'high' ? 'high' : 'normal'
        fetch(`${supabaseUrl}/functions/v1/send-fcm-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            user_ids: recipientIds,
            title: finalTitleEn,
            body: message_en,
            priority: fcmPriority,
            data: { event_type, ...(action_url ? { action_url } : {}), ...(entity_id ? { entity_id } : {}), ...(entity_type ? { entity_type } : {}) },
          }),
        }).then(r => r.json())
          .then(result => console.log(`FCM push result: sent=${result.sent}, failed=${result.failed}`))
          .catch(err => console.warn('FCM push fire-and-forget error:', err))
      }
    }

    // Audit log for dispatch
    try {
      await supabase.from('audit_logs').insert({
        action: 'notification_dispatched',
        entity_type: 'notification',
        entity_name: event_type,
        description: `Dispatched ${notifications.length} notifications for ${event_type}`,
        success: true,
        actor_id: triggered_by,
        actor_name: triggered_by_name,
        metadata: { event_type, priority: effectivePriority, recipients_count: notifications.length, emails_sent: emailResults.filter(e => e.success).length, emails_failed: emailResults.filter(e => !e.success).length }
      })
    } catch (logError) {
      console.error('Audit log failed:', logError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_created: notifications.length,
        emails_sent: emailResults.filter(e => e.success).length,
        emails_failed: emailResults.filter(e => !e.success).length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Dispatch notification error:', error)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Unexpected error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
