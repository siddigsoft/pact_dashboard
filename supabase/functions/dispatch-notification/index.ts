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
  'cycle_close_step4_ready':    { title_en: 'Cycle Close Step 4 Ready',             title_ar: 'الخطوة ٤ من إغلاق الدورة جاهزة',             category: 'approvals',    priority: 'high'   },
  // Tasks — full lifecycle
  'task_created':               { title_en: 'New Task Created',                     title_ar: 'تم إنشاء مهمة جديدة',                         category: 'assignments',  priority: 'normal' },
  'task_assigned':              { title_en: 'Task Assigned to You',                 title_ar: 'تم تعيين مهمة لك',                            category: 'assignments',  priority: 'normal' },
  'task_started':               { title_en: 'Task In Progress',                     title_ar: 'المهمة قيد التنفيذ',                          category: 'system',       priority: 'normal' },
  'task_acknowledged':          { title_en: 'Task Acknowledged',                    title_ar: 'تم إقرار استلام المهمة',                      category: 'system',       priority: 'normal' },
  'task_completed':             { title_en: 'Task Completed',                       title_ar: 'اكتملت المهمة',                               category: 'system',       priority: 'normal' },
  'task_delayed':               { title_en: 'Task Delayed',                         title_ar: 'المهمة متأخرة',                               category: 'assignments',  priority: 'high'   },
  'task_rejected':              { title_en: 'Task Rejected',                        title_ar: 'تم رفض المهمة',                               category: 'assignments',  priority: 'high'   },
  'task_cancelled':             { title_en: 'Task Cancelled',                       title_ar: 'تم إلغاء المهمة',                             category: 'system',       priority: 'normal' },
  'task_overdue':               { title_en: 'Task Overdue — Action Required',       title_ar: 'المهمة متأخرة — مطلوب إجراء',                 category: 'assignments',  priority: 'high'   },
  'task_updated':               { title_en: 'Task Updated',                         title_ar: 'تم تحديث المهمة',                             category: 'system',       priority: 'normal' },
  'task_status_changed':        { title_en: 'Task Status Changed',                  title_ar: 'تغيرت حالة المهمة',                           category: 'system',       priority: 'normal' },
  'task_reminder_1day':         { title_en: 'Task Due Tomorrow',                    title_ar: 'موعد المهمة غداً',                            category: 'system',       priority: 'high'   },
  'task_reminder_3day':         { title_en: 'Task Due in 3 Days',                   title_ar: 'موعد المهمة خلال 3 أيام',                     category: 'system',       priority: 'normal' },
  'task_comment_added':         { title_en: 'New Comment on Task',                  title_ar: 'تعليق جديد على المهمة',                       category: 'system',       priority: 'normal' },
  'comment_mention':            { title_en: 'You Were Mentioned in a Comment',       title_ar: 'تم ذكرك في تعليق',                            category: 'system',       priority: 'normal' },
  'comment_reply':              { title_en: 'Someone Replied to Your Comment',       title_ar: 'رد شخص على تعليقك',                          category: 'system',       priority: 'normal' },
  // Workspace Hub
  'workspace_share':            { title_en: 'File Shared With You',                 title_ar: 'تمت مشاركة ملف معك',                          category: 'system',       priority: 'high'   },
  'workspace_access_request':   { title_en: 'Workspace Access Request',             title_ar: 'طلب الوصول إلى مساحة العمل',                  category: 'approvals',    priority: 'high'   },
  'workspace_access_granted':   { title_en: 'Workspace Access Granted',             title_ar: 'تم منحك الوصول إلى مساحة العمل',              category: 'approvals',    priority: 'high'   },
  'workspace_access_revoked':   { title_en: 'Workspace Access Revoked',             title_ar: 'تم سحب صلاحية الوصول إلى مساحة العمل',        category: 'approvals',    priority: 'high'   },
  'workspace_access_rejected':  { title_en: 'Workspace Access Request Rejected',    title_ar: 'تم رفض طلب الوصول إلى مساحة العمل',           category: 'approvals',    priority: 'high'   },
  // Site Visits
  'site_visit_assigned':        { title_en: 'Site Visit Assigned',                  title_ar: 'تم تعيين زيارة ميدانية',                      category: 'assignments',  priority: 'normal' },
  'site_visit_started':         { title_en: 'Site Visit Started',                   title_ar: 'بدأت الزيارة الميدانية',                      category: 'assignments',  priority: 'normal' },
  'site_visit_completed':       { title_en: 'Site Visit Completed',                 title_ar: 'اكتملت الزيارة الميدانية',                    category: 'assignments',  priority: 'normal' },
  'site_visit_postponed':       { title_en: 'Site Visit Postponed',                 title_ar: 'تم تأجيل الزيارة الميدانية',                  category: 'assignments',  priority: 'normal' },
  'site_flagged_uncovered':     { title_en: 'Site Flagged as Uncovered',            title_ar: 'تم تعليم الموقع كغير مغطى',                   category: 'assignments',  priority: 'high'   },
  // Financial
  // Project Director Updates
  'project_director_update_submitted': { title_en: 'Director Update Awaiting Validation', title_ar: 'تحديث مدير المشروع بانتظار التحقق', category: 'approvals', priority: 'high' },
  'project_director_update_validated': { title_en: 'Director Update Validated',            title_ar: 'تم التحقق من تحديث مدير المشروع',   category: 'approvals', priority: 'normal' },
  'project_director_update_returned':  { title_en: 'Director Update Returned',             title_ar: 'أُعيد تحديث مدير المشروع للمراجعة', category: 'approvals', priority: 'high' },
  'project_director_update_escalated': { title_en: 'Director Update Escalated',            title_ar: 'تصعيد تحديث مدير المشروع',           category: 'approvals', priority: 'urgent' },
  'project_director_update_due':       { title_en: 'Director Update Due',                  title_ar: 'تحديث مدير المشروع مستحق',           category: 'approvals', priority: 'high' },
  'project_director_update_validation_pending': { title_en: 'Director Updates Awaiting Validation', title_ar: 'تحديثات مدير المشروع بانتظار التحقق', category: 'approvals', priority: 'high' },
  'cost_submitted':             { title_en: 'Cost Submission Received',             title_ar: 'تم استلام طلب التكلفة',                       category: 'approvals',    priority: 'normal' },
  'cost_approved':              { title_en: 'Cost Approved',                        title_ar: 'تمت الموافقة على التكلفة',                    category: 'financial',    priority: 'normal' },
  'cost_rejected':              { title_en: 'Cost Rejected / Returned',             title_ar: 'تم رفض التكلفة / إعادتها',                   category: 'financial',    priority: 'high'   },
  'cost_action_required':       { title_en: 'Action Required: Cost Review',         title_ar: 'مطلوب إجراء: مراجعة طلب التكلفة',             category: 'approvals',    priority: 'high'   },
  'cost_reminder':              { title_en: 'Reminder: Cost Submission Pending',    title_ar: 'تذكير: طلب التكلفة بانتظار المراجعة',         category: 'financial',    priority: 'high'   },
  // GL Bridge
  'gl_bridge_error':            { title_en: 'GL Bridge Posting Failed',              title_ar: 'فشل ترحيل جسر الأستاذ العام',                category: 'financial',    priority: 'high'   },
  'payment_processed':          { title_en: 'Payment Processed',                    title_ar: 'تمت معالجة الدفع',                           category: 'financial',    priority: 'normal' },
  'wallet_updated':             { title_en: 'Wallet Balance Updated',               title_ar: 'تم تحديث رصيد المحفظة',                      category: 'financial',    priority: 'normal' },
  'withdrawal_approved':        { title_en: 'Withdrawal Request Approved',          title_ar: 'تمت الموافقة على طلب السحب',                  category: 'financial',    priority: 'normal' },
  'withdrawal_rejected':        { title_en: 'Withdrawal Request Not Approved',      title_ar: 'لم تتم الموافقة على طلب السحب',               category: 'financial',    priority: 'normal' },
  'budget_threshold_80':        { title_en: 'Budget Alert: 80% Utilized',           title_ar: 'تنبيه الميزانية: تم استخدام 80٪',             category: 'financial',    priority: 'high'   },
  'budget_threshold_100':       { title_en: 'Budget Alert: Fully Utilized',         title_ar: 'تنبيه الميزانية: تم استخدام كامل الميزانية', category: 'financial',    priority: 'urgent' },
  // Approvals
  'approval_required':          { title_en: 'Approval Required',                    title_ar: 'مطلوب موافقة',                                category: 'approvals',    priority: 'high'   },
  // Leave Requests — full lifecycle
  'leave_request_submitted':    { title_en: 'Leave Request Submitted',              title_ar: 'تم تقديم طلب إجازة',                         category: 'approvals',    priority: 'normal' },
  'leave_request_approved':     { title_en: 'Leave Request Approved',               title_ar: 'تمت الموافقة على طلب الإجازة',               category: 'system',       priority: 'normal' },
  'leave_request_rejected':     { title_en: 'Leave Request Not Approved',           title_ar: 'لم تتم الموافقة على طلب الإجازة',            category: 'system',       priority: 'normal' },
  'leave_request_cancelled':    { title_en: 'Leave Request Cancelled',              title_ar: 'تم إلغاء طلب الإجازة',                       category: 'system',       priority: 'normal' },
  'leave_balance_updated':      { title_en: 'Leave Balance Updated',                title_ar: 'تم تحديث رصيد الإجازات',                     category: 'system',       priority: 'normal' },
  // Advance Requests
  'advance_request_submitted':  { title_en: 'Advance Request Submitted',            title_ar: 'تم تقديم طلب سلفة',                          category: 'approvals',    priority: 'normal' },
  'advance_request_approved':   { title_en: 'Advance Request Approved',             title_ar: 'تمت الموافقة على طلب السلفة',                category: 'financial',    priority: 'normal' },
  'advance_request_rejected':   { title_en: 'Advance Request Not Approved',         title_ar: 'لم تتم الموافقة على طلب السلفة',             category: 'financial',    priority: 'normal' },
  // Payroll & Contracts
  'payroll_run_completed':      { title_en: 'Payroll Processed',                    title_ar: 'تمت معالجة كشف الرواتب',                     category: 'financial',    priority: 'normal' },
  'payroll_approval_needed':    { title_en: 'Payroll Approval Required',            title_ar: 'مطلوب موافقة على كشف الرواتب',               category: 'approvals',    priority: 'high'   },
  'payroll_slip_ready':         { title_en: 'Your Payslip is Ready',                title_ar: 'قسيمة راتبك جاهزة',                          category: 'financial',    priority: 'normal' },
  'retainer_payment_processed': { title_en: 'Retainer Payment Processed',           title_ar: 'تمت معالجة دفعة الاستبقاء',                  category: 'financial',    priority: 'normal' },
  'retainer_overdue':           { title_en: 'Retainer Payment Overdue',             title_ar: 'دفعة الاستبقاء متأخرة',                      category: 'financial',    priority: 'high'   },
  'contract_expiring_30d':      { title_en: 'Contract Expiring in 30 Days',         title_ar: 'عقد ينتهي خلال 30 يوماً',                    category: 'system',       priority: 'normal' },
  'contract_expiring_7d':       { title_en: 'Contract Expiring This Week',          title_ar: 'عقد ينتهي هذا الأسبوع',                      category: 'system',       priority: 'high'   },
  'contract_expired':           { title_en: 'Contract Expired',                     title_ar: 'انتهى العقد',                                 category: 'system',       priority: 'urgent' },
  // Signatures
  'signature_requested':        { title_en: 'Your Signature is Required',           title_ar: 'توقيعك مطلوب',                                category: 'approvals',    priority: 'high'   },
  'signature_completed':        { title_en: 'Document Signed Successfully',         title_ar: 'تم توقيع المستند بنجاح',                      category: 'system',       priority: 'normal' },
  // Projects — full lifecycle
  'project_created':            { title_en: 'New Project Created',                  title_ar: 'تم إنشاء مشروع جديد',                        category: 'assignments',  priority: 'normal' },
  'project_stage_advanced':     { title_en: 'Project Stage Advanced',               title_ar: 'تقدمت مرحلة المشروع',                        category: 'system',       priority: 'normal' },
  'project_stage_assigned':     { title_en: 'You\'ve Been Assigned to a Stage',     title_ar: 'تم تعيينك في مرحلة',                          category: 'assignments',  priority: 'high'   },
  'project_milestone_overdue':  { title_en: 'Project Milestone Overdue',            title_ar: 'تأخر إنجاز المرحلة الرئيسية',                category: 'assignments',  priority: 'high'   },
  'project_stalled':            { title_en: 'Project Stalled – Action Needed',      title_ar: 'المشروع متوقف – مطلوب إجراء',                category: 'assignments',  priority: 'high'   },
  'project_completed':          { title_en: 'Project Completed',                    title_ar: 'اكتمل المشروع',                              category: 'system',       priority: 'normal' },
  'project_archived':           { title_en: 'Project Archived',                     title_ar: 'تم أرشفة المشروع',                           category: 'system',       priority: 'normal' },
  'project_member_added':       { title_en: 'Added to Project',                     title_ar: 'تمت إضافتك إلى مشروع',                      category: 'assignments',  priority: 'normal' },
  'project_member_removed':     { title_en: 'Removed from Project',                 title_ar: 'تمت إزالتك من مشروع',                       category: 'assignments',  priority: 'normal' },
  'project_stage_deadline_reminder': { title_en: 'Stage Deadline Reminder',         title_ar: 'تذكير بموعد المرحلة',                        category: 'assignments',  priority: 'high'   },
  'project_task_assigned':      { title_en: 'Project Task Assigned',                title_ar: 'تم تعيين مهمة مشروع',                        category: 'assignments',  priority: 'normal' },
  'project_task_completed':     { title_en: 'Project Task Completed',               title_ar: 'اكتملت مهمة المشروع',                        category: 'system',       priority: 'normal' },
  'project_task_overdue':       { title_en: 'Project Task Overdue',                 title_ar: 'مهمة المشروع متأخرة',                        category: 'assignments',  priority: 'high'   },
  'project_task_status_changed':{ title_en: 'Project Task Status Updated',          title_ar: 'تم تحديث حالة مهمة المشروع',                  category: 'system',       priority: 'normal' },
  'project_task_updated':       { title_en: 'Project Task Updated',                 title_ar: 'تم تحديث مهمة المشروع',                      category: 'system',       priority: 'normal' },
  'project_task_commented':     { title_en: 'New Comment on Project Task',          title_ar: 'تعليق جديد على مهمة المشروع',                 category: 'system',       priority: 'normal' },
  'project_task_file_uploaded': { title_en: 'File Uploaded to Project Task',        title_ar: 'تم رفع ملف إلى مهمة المشروع',                 category: 'system',       priority: 'normal' },
  'project_health_changed':     { title_en: 'Project Health Status Changed',        title_ar: 'تغيرت حالة صحة المشروع',                     category: 'system',       priority: 'normal' },
  'project_budget_exceeded':    { title_en: 'Project Budget Exceeded',              title_ar: 'تجاوزت ميزانية المشروع',                     category: 'financial',    priority: 'urgent' },
  'project_stage_completed':    { title_en: 'Stage Completed',                      title_ar: 'اكتملت مرحلة المشروع',                       category: 'system',       priority: 'normal' },
  'project_milestone_reached':  { title_en: 'Project Milestone Reached',            title_ar: 'تم الوصول إلى نقطة التحول',                  category: 'system',       priority: 'high'   },
  'project_milestone_completed':{ title_en: 'Milestone Completed',                  title_ar: 'تم إنجاز نقطة التحول',                       category: 'system',       priority: 'high'   },
  'project_risk_added':         { title_en: 'New Risk Logged',                      title_ar: 'تم تسجيل مخاطرة جديدة',                      category: 'system',       priority: 'high'   },
  'project_risk_updated':       { title_en: 'Risk Status Updated',                  title_ar: 'تم تحديث حالة المخاطرة',                     category: 'system',       priority: 'normal' },
  'project_status_changed':     { title_en: 'Project Status Changed',               title_ar: 'تغيرت حالة المشروع',                         category: 'system',       priority: 'normal' },
  'project_stage_acknowledged': { title_en: 'Stage Assignment Confirmed',           title_ar: 'تم تأكيد التعيين في المرحلة',                 category: 'assignments',  priority: 'normal' },
  // CRM — full lifecycle
  'crm_opportunity_stage_changed': { title_en: 'Opportunity Stage Updated',        title_ar: 'تم تحديث مرحلة الفرصة',                      category: 'system',       priority: 'normal' },
  'crm_opportunity_won':        { title_en: 'Opportunity Won!',                     title_ar: 'تم الفوز بالفرصة!',                          category: 'system',       priority: 'normal' },
  'crm_partner_created':        { title_en: 'New Partner Added',                    title_ar: 'تمت إضافة شريك جديد',                        category: 'system',       priority: 'normal' },
  'crm_engagement_created':     { title_en: 'New Engagement Logged',               title_ar: 'تم تسجيل تعامل جديد',                         category: 'system',       priority: 'normal' },
  'crm_contact_added':          { title_en: 'New Contact Added',                   title_ar: 'تمت إضافة جهة اتصال جديدة',                   category: 'system',       priority: 'normal' },
  // Account / User
  'user_approved':              { title_en: 'Account Approved',                     title_ar: 'تمت الموافقة على الحساب',                    category: 'account',      priority: 'normal' },
  'user_rejected':              { title_en: 'Account Status Updated',               title_ar: 'تم تحديث حالة الحساب',                       category: 'account',      priority: 'normal' },
  // Task Dependencies
  'dependency_added':           { title_en: 'New Dependency Added to Your Task',    title_ar: 'تمت إضافة اعتمادية جديدة لمهمتك',            category: 'assignments',  priority: 'high'   },
  'dependency_acknowledged':    { title_en: 'Dependency Acknowledged',              title_ar: 'تم إقرار الاعتمادية',                          category: 'system',       priority: 'normal' },
  'dependency_blocked':         { title_en: 'Task is Blocked by a Dependency',      title_ar: 'المهمة محظورة بسبب اعتمادية',                  category: 'assignments',  priority: 'high'   },
  'dependency_resolved':        { title_en: 'Dependency Resolved – You Can Proceed',title_ar: 'تم حل الاعتمادية – يمكنك المتابعة',            category: 'system',       priority: 'normal' },
  // Timesheet
  'timesheet_submitted':        { title_en: 'Timesheet Submitted for Your Approval',title_ar: 'تم تقديم كشف الدوام لاعتمادك',                category: 'approvals',    priority: 'high'   },
  'timesheet_approved':         { title_en: 'Your Timesheet was Approved',          title_ar: 'تمت الموافقة على كشف الدوام الخاص بك',         category: 'system',       priority: 'normal' },
  'timesheet_rejected':         { title_en: 'Your Timesheet was Not Approved',      title_ar: 'لم تتم الموافقة على كشف الدوام الخاص بك',      category: 'system',       priority: 'high'   },
  'timesheet_revision_requested':{ title_en: 'Timesheet Revision Requested',         title_ar: 'مطلوب مراجعة كشف الدوام',                      category: 'system',       priority: 'high'   },
  // Broadcast / System
  'broadcast':                  { title_en: 'System Announcement',                  title_ar: 'إعلان النظام',                                category: 'broadcast',    priority: 'normal' },
  'reminder':                   { title_en: 'Reminder',                             title_ar: 'تذكير',                                       category: 'system',       priority: 'normal' },
  'daily_digest':               { title_en: 'Daily Action Summary',                 title_ar: 'ملخص الإجراءات اليومية',                      category: 'system',       priority: 'normal' },
  // Pre-Funding
  'pre_fund_created':            { title_en: 'New Pre-Fund Created',                  title_ar: 'تم إنشاء تمويل مسبق جديد',                   category: 'financial',  priority: 'normal' },
  'pre_fund_approval_requested': { title_en: 'Pre-Fund Approval Required',            title_ar: 'مطلوب موافقة على التمويل المسبق',             category: 'approvals',  priority: 'high'   },
  'pre_fund_step_assigned':      { title_en: 'Pre-Fund: Action Required on Your Step',title_ar: 'التمويل المسبق: إجراء مطلوب في خطوتك',       category: 'approvals',  priority: 'high'   },
  'pre_fund_approved':           { title_en: 'Pre-Fund Fully Approved',               title_ar: 'تمت الموافقة الكاملة على التمويل المسبق',    category: 'financial',  priority: 'high'   },
  'pre_fund_rejected':           { title_en: 'Pre-Fund Rejected',                     title_ar: 'تم رفض التمويل المسبق',                      category: 'financial',  priority: 'urgent' },
  'pre_fund_activated':          { title_en: 'Pre-Fund Now Active',                   title_ar: 'التمويل المسبق نشط الآن',                    category: 'financial',  priority: 'normal' },
  'pre_fund_allocated':          { title_en: 'Pre-Fund Allocation Assigned',          title_ar: 'تم تعيين تخصيص التمويل المسبق',              category: 'financial',  priority: 'normal' },
  'pre_fund_allocation_removed': { title_en: 'Pre-Fund Allocation Removed',           title_ar: 'تم إلغاء تخصيص التمويل المسبق',              category: 'financial',  priority: 'normal' },
  'pre_fund_allocation_assigned':{ title_en: 'Fund Allocation Assigned to You',       title_ar: 'تم تعيين تخصيص الصندوق لك',                  category: 'financial',  priority: 'normal' },
  'pre_fund_topup_requested':    { title_en: 'Pre-Fund Top-Up Requested',             title_ar: 'تم طلب تعبئة التمويل المسبق',                category: 'approvals',  priority: 'high'   },
  'pre_fund_expiry_warning':     { title_en: 'Pre-Fund Expiry Warning',               title_ar: 'تحذير: انتهاء صلاحية التمويل المسبق قريباً', category: 'financial',  priority: 'high'   },
  'pre_fund_period_closed':      { title_en: 'Pre-Fund Period Closed',                title_ar: 'تم إغلاق فترة التمويل المسبق',               category: 'financial',  priority: 'normal' },
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
  'cycle_close_step4_ready':     'email_notify_approval_needed',
  'project_stage_advanced':      'email_notify_project_milestones',
  'project_stage_assigned':      'email_notify_project_milestones',
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
  'crm_partner_created':         'email_notify_system',
  'crm_engagement_created':      'email_notify_system',
  'crm_contact_added':           'email_notify_system',
  'daily_digest':                'email_notify_system',
  'reminder':                    'email_notify_system',
  // New task events
  'task_created':                'email_notify_task_assigned',
  'task_started':                'email_notify_task_assigned',
  'task_acknowledged':           'email_notify_task_assigned',
  'task_delayed':                'email_notify_task_assigned',
  'task_rejected':               'email_notify_task_assigned',
  'task_cancelled':              'email_notify_task_assigned',
  'task_status_changed':         'email_notify_task_assigned',
  'task_reminder_1day':          'email_notify_task_assigned',
  'task_reminder_3day':          'email_notify_task_assigned',
  'task_comment_added':          'email_notify_task_assigned',
  'comment_mention':             'email_notify_task_assigned',
  'comment_reply':               'email_notify_task_assigned',
  // New project events
  'project_created':             'email_notify_project_milestones',
  'project_completed':           'email_notify_project_milestones',
  'project_archived':            'email_notify_project_milestones',
  'project_member_added':        'email_notify_project_milestones',
  'project_member_removed':      'email_notify_project_milestones',
  'project_stage_deadline_reminder': 'email_notify_project_milestones',
  'project_task_assigned':       'email_notify_task_assigned',
  'project_task_completed':      'email_notify_project_milestones',
  'project_task_overdue':        'email_notify_task_assigned',
  'project_task_status_changed': 'email_notify_task_assigned',
  'project_task_updated':        'email_notify_task_assigned',
  'project_task_commented':      'email_notify_task_assigned',
  'project_task_file_uploaded':  'email_notify_task_assigned',
  'project_health_changed':      'email_notify_project_milestones',
  'project_budget_exceeded':     'email_notify_payroll',
  'project_stage_completed':     'email_notify_project_milestones',
  'project_milestone_reached':   'email_notify_project_milestones',
  'project_milestone_completed': 'email_notify_project_milestones',
  'project_risk_added':          'email_notify_project_milestones',
  'project_risk_updated':        'email_notify_project_milestones',
  'project_status_changed':      'email_notify_project_milestones',
  'project_stage_acknowledged':  'email_notify_project_milestones',
  // New leave events
  'leave_request_cancelled':     'email_notify_approval_needed',
  'leave_balance_updated':       'email_notify_system',
  // Advance requests
  'advance_request_submitted':   'email_notify_approval_needed',
  'advance_request_approved':    'email_notify_payroll',
  'advance_request_rejected':    'email_notify_payroll',
  // New payroll events
  'payroll_slip_ready':          'email_notify_payroll',
  'retainer_payment_processed':  'email_notify_payroll',
  'retainer_overdue':            'email_notify_payroll',
  // Task dependencies
  'dependency_added':            'email_notify_task_assigned',
  'dependency_acknowledged':     'email_notify_task_assigned',
  'dependency_blocked':          'email_notify_task_assigned',
  'dependency_resolved':         'email_notify_task_assigned',
  // Timesheet
  'timesheet_submitted':         'email_notify_approval_needed',
  'timesheet_approved':          'email_notify_payroll',
  'timesheet_rejected':          'email_notify_payroll',
  'timesheet_revision_requested':'email_notify_payroll',
  // Pre-Funding
  'pre_fund_created':            'email_notify_payroll',
  'pre_fund_approval_requested': 'email_notify_approval_needed',
  'pre_fund_step_assigned':      'email_notify_approval_needed',
  'pre_fund_approved':           'email_notify_payroll',
  'pre_fund_rejected':           'email_notify_payroll',
  'pre_fund_activated':          'email_notify_payroll',
  'pre_fund_allocated':          'email_notify_payroll',
  'pre_fund_allocation_removed': 'email_notify_payroll',
  'pre_fund_allocation_assigned':'email_notify_payroll',
  'pre_fund_topup_requested':    'email_notify_approval_needed',
  'pre_fund_expiry_warning':     'email_notify_payroll',
  'pre_fund_period_closed':      'email_notify_payroll',
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
    'task_assigned':            '#2563eb',
    'task_created':             '#2563eb',
    'task_started':             '#2563eb',
    'task_acknowledged':        '#2563eb',
    'task_reminder_1day':       '#d97706',
    'task_reminder_3day':       '#f59e0b',
    'task_delayed':             '#d97706',
    'task_rejected':            '#dc2626',
    'task_cancelled':           '#6b7280',
    'task_status_changed':      '#6b7280',
    'task_comment_added':       '#6b7280',
    'comment_mention':          '#7c3aed',
    'comment_reply':            '#2563eb',
    'project_created':          '#2563eb',
    'project_completed':        '#059669',
    'project_archived':         '#6b7280',
    'project_member_added':     '#2563eb',
    'project_member_removed':   '#6b7280',
    'project_stage_assigned':   '#2563eb',
    'project_stage_deadline_reminder': '#d97706',
    'project_task_assigned':    '#2563eb',
    'project_task_completed':   '#059669',
    'project_task_overdue':     '#dc2626',
    'project_health_changed':   '#d97706',
    'project_budget_exceeded':  '#dc2626',
    'crm_partner_created':      '#059669',
    'crm_engagement_created':   '#2563eb',
    'crm_contact_added':        '#2563eb',
    'advance_request_submitted':'#d97706',
    'advance_request_approved': '#059669',
    'advance_request_rejected': '#dc2626',
    'leave_request_cancelled':  '#6b7280',
    'leave_balance_updated':    '#0891b2',
    'payroll_slip_ready':       '#059669',
    'retainer_payment_processed':'#0891b2',
    'retainer_overdue':         '#dc2626',
    'site_visit_assigned':      '#2563eb',
    'mmp_assigned':             '#2563eb',
    'mmp_recall_initiated':     '#7c3aed',
    'broadcast':                '#7c3aed',
    'wallet_updated':           '#0891b2',
    'payment_processed':        '#0891b2',
    // Pre-Funding
    'pre_fund_approved':            '#059669',
    'pre_fund_activated':           '#059669',
    'pre_fund_rejected':            '#dc2626',
    'pre_fund_approval_requested':  '#d97706',
    'pre_fund_step_assigned':       '#d97706',
    'pre_fund_topup_requested':     '#d97706',
    'pre_fund_expiry_warning':      '#d97706',
    'pre_fund_created':             '#2563eb',
    'pre_fund_allocated':           '#0891b2',
    'pre_fund_allocation_assigned': '#0891b2',
    'pre_fund_allocation_removed':  '#6b7280',
    'pre_fund_period_closed':       '#6b7280',
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
    'task_assigned': '📌', 'task_created': '📋', 'task_started': '▶️', 'task_acknowledged': '✅',
    'task_delayed': '⚠️', 'task_rejected': '❌', 'task_cancelled': '🚫', 'task_status_changed': '🔄',
    'task_reminder_1day': '⏰', 'task_reminder_3day': '🔔', 'task_comment_added': '💬',
    'comment_mention': '🔔', 'comment_reply': '↩️',
    'project_created': '🚀', 'project_completed': '🏁', 'project_archived': '📦',
    'project_member_added': '👤', 'project_member_removed': '🚪', 'project_task_assigned': '📋', 'project_task_completed': '✅',
    'project_task_status_changed': '🔄', 'project_task_updated': '✏️', 'project_task_commented': '💬', 'project_task_file_uploaded': '📎',
    'project_stage_assigned': '📌', 'project_stage_deadline_reminder': '⏰',
    'project_task_overdue': '🔴', 'project_health_changed': '📊', 'project_budget_exceeded': '🚨',
    'crm_partner_created': '🤝', 'crm_engagement_created': '📞', 'crm_contact_added': '👥',
    'advance_request_submitted': '📋', 'advance_request_approved': '✅', 'advance_request_rejected': '❌',
    'leave_request_cancelled': '🚫', 'leave_balance_updated': '📊',
    'payroll_slip_ready': '💵', 'retainer_payment_processed': '💰', 'retainer_overdue': '⏰',
    'mmp_assigned': '📌', 'site_visit_assigned': '📍',
    'approval_required': '⏳', 'mmp_forwarded': '⏳', 'signature_requested': '✍️',
    'contract_expiring_7d': '⚠️', 'contract_expiring_30d': '⏰', 'task_overdue': '⏰',
    'site_flagged_uncovered': '🚩', 'project_stalled': '⚠️', 'mmp_recall_initiated': '🔄',
    'budget_threshold_80': '📊', 'project_milestone_overdue': '📅', 'broadcast': '📢',
    'project_stage_advanced': '🚀', 'project_stage_completed': '✅', 'project_milestone_reached': '🏆',
    'project_milestone_completed': '🏆', 'project_risk_added': '⚠️', 'project_risk_updated': '🔄',
    'project_status_changed': '📊', 'crm_opportunity_won': '🏆', 'reminder': '🔔',
    // Pre-Funding
    'pre_fund_created': '💼', 'pre_fund_approval_requested': '⏳', 'pre_fund_step_assigned': '📋',
    'pre_fund_approved': '✅', 'pre_fund_rejected': '❌', 'pre_fund_activated': '🟢',
    'pre_fund_allocated': '💰', 'pre_fund_allocation_removed': '🚫', 'pre_fund_allocation_assigned': '💰',
    'pre_fund_topup_requested': '📈', 'pre_fund_expiry_warning': '⏰', 'pre_fund_period_closed': '🔒',
  }
  return icons[eventType] || '🔔'
}

// ── Contextual sections per event type ────────────────────────────────────────
function getEventContextBlock(eventType: string, metadata: Record<string, any>, accentColor: string): string {
  const items: { label_en: string; label_ar: string; value: string }[] = []

  if (['cost_submitted', 'cost_approved', 'cost_rejected', 'cost_action_required', 'cost_reminder'].includes(eventType) || eventType.startsWith('cost_')) {
    if (metadata.submission_type) items.push({ label_en: 'Request Type',    label_ar: 'نوع الطلب',         value: metadata.submission_type })
    if (metadata.ref_number)      items.push({ label_en: 'Reference No.',   label_ar: 'الرقم المرجعي',     value: metadata.ref_number })
    if (metadata.submission_title) items.push({ label_en: 'Title',          label_ar: 'العنوان',            value: metadata.submission_title })
    if (metadata.amount)          items.push({ label_en: 'Amount',          label_ar: 'المبلغ',             value: typeof metadata.amount === 'number' ? `${Number(metadata.amount).toLocaleString('en-US')} ${metadata.currency || 'SDG'}` : String(metadata.amount) })
    if (metadata.category)        items.push({ label_en: 'Category',        label_ar: 'الفئة',              value: metadata.category })
    if (metadata.expense_date)    items.push({ label_en: 'Expense Date',    label_ar: 'تاريخ المصروف',     value: metadata.expense_date })
    if (metadata.vendor)          items.push({ label_en: 'Vendor / Payee',  label_ar: 'المورد / المستفيد',  value: metadata.vendor })
    if (metadata.submitted_by)    items.push({ label_en: 'Submitted By',    label_ar: 'قُدِّم بواسطة',     value: metadata.submitted_by })
    if (metadata.disbursed_by)    items.push({ label_en: 'Disbursed By',    label_ar: 'صُرف بواسطة',       value: metadata.disbursed_by })
    if (metadata.payment_date)    items.push({ label_en: 'Payment Date',    label_ar: 'تاريخ الصرف',       value: metadata.payment_date })
    if (metadata.approver_name)   items.push({ label_en: 'Reviewed By',     label_ar: 'راجعه',              value: metadata.approver_name })
    if (metadata.rejection_reason) items.push({ label_en: 'Reason',         label_ar: 'السبب',              value: metadata.rejection_reason })
    if (metadata.hub)             items.push({ label_en: 'Hub / Office',    label_ar: 'المكتب / المحطة',    value: metadata.hub })
    if (metadata.period)          items.push({ label_en: 'Period',          label_ar: 'الفترة',             value: metadata.period })
    if (metadata.notes)           items.push({ label_en: 'Notes',           label_ar: 'ملاحظات',            value: metadata.notes })
  }

  // cost_action_required: extra fields not covered by the main cost block above
  if (eventType === 'cost_action_required') {
    if (metadata.submitter_name)    items.push({ label_en: 'Submitted By',    label_ar: 'قُدِّم بواسطة',      value: metadata.submitter_name })
    if (metadata.approval_flow)     items.push({ label_en: 'Approval Flow',   label_ar: 'مسار الموافقة',       value: metadata.approval_flow })
    if (metadata.current_step)      items.push({ label_en: 'Your Action',     label_ar: 'إجراؤك المطلوب',      value: metadata.current_step })
    if (metadata.next_step)         items.push({ label_en: 'Next Step',       label_ar: 'الخطوة التالية',       value: metadata.next_step })
  }
  if (['withdrawal_approved', 'withdrawal_rejected', 'wallet_updated'].includes(eventType)) {
    if (metadata.amount)     items.push({ label_en: 'Amount',          label_ar: 'المبلغ',          value: `${metadata.amount} ${metadata.currency || 'SDG'}` })
    if (metadata.account)    items.push({ label_en: 'Account',         label_ar: 'الحساب',          value: metadata.account })
    if (metadata.balance)    items.push({ label_en: 'New Balance',      label_ar: 'الرصيد الجديد',   value: `${metadata.balance} ${metadata.currency || 'SDG'}` })
  }
  // payment_processed: covers both cost-submission payments and wallet payments
  if (eventType === 'payment_processed') {
    if (metadata.submission_type) {
      // Cost submission / Down-payment payment — show full details
      if (metadata.ref_number)       items.push({ label_en: 'Reference No.',   label_ar: 'الرقم المرجعي',    value: metadata.ref_number })
      if (metadata.submission_title) items.push({ label_en: 'Title',           label_ar: 'العنوان',           value: metadata.submission_title })
      if (metadata.amount)           items.push({ label_en: 'Amount',          label_ar: 'المبلغ',            value: String(metadata.amount) })
      if (metadata.category)         items.push({ label_en: 'Category',        label_ar: 'الفئة',             value: metadata.category })
      if (metadata.expense_date)     items.push({ label_en: 'Expense Date',    label_ar: 'تاريخ المصروف',    value: metadata.expense_date })
      if (metadata.vendor)           items.push({ label_en: 'Vendor / Payee',  label_ar: 'المورد / المستفيد', value: metadata.vendor })
      if (metadata.submitted_by)     items.push({ label_en: 'Submitted By',    label_ar: 'قُدِّم بواسطة',    value: metadata.submitted_by })
      if (metadata.disbursed_by)     items.push({ label_en: 'Disbursed By',    label_ar: 'صُرف بواسطة',      value: metadata.disbursed_by })
      if (metadata.payment_date)     items.push({ label_en: 'Payment Date',    label_ar: 'تاريخ الصرف',      value: metadata.payment_date })
    } else {
      // Wallet payment — show wallet fields
      if (metadata.amount)   items.push({ label_en: 'Amount',          label_ar: 'المبلغ',          value: `${metadata.amount} ${metadata.currency || 'SDG'}` })
      if (metadata.account)  items.push({ label_en: 'Account',         label_ar: 'الحساب',          value: metadata.account })
      if (metadata.balance)  items.push({ label_en: 'New Balance',     label_ar: 'الرصيد الجديد',   value: `${metadata.balance} ${metadata.currency || 'SDG'}` })
    }
    if (metadata.item_count && metadata.item_count > 1) {
      items.push({ label_en: 'Submissions Count', label_ar: 'عدد المطالبات', value: String(metadata.item_count) })
    }
    if (metadata.notes) items.push({ label_en: 'Notes', label_ar: 'ملاحظات', value: metadata.notes })
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
  if ([
    'task_assigned', 'task_overdue', 'task_updated', 'task_completed', 'task_created',
    'task_started', 'task_acknowledged', 'task_delayed', 'task_rejected', 'task_cancelled',
    'task_reminder_1day', 'task_reminder_3day', 'task_status_changed', 'task_comment_added',
    'project_task_assigned', 'project_task_completed', 'project_task_overdue',
    'project_task_status_changed', 'project_task_updated', 'project_task_commented',
    'project_task_file_uploaded',
  ].includes(eventType)) {
    if (metadata.task_name)    items.push({ label_en: 'Task',            label_ar: 'المهمة',          value: metadata.task_name })
    if (metadata.project_name) items.push({ label_en: 'Project',         label_ar: 'المشروع',         value: metadata.project_name })
    if (metadata.due_date)     items.push({ label_en: 'Due Date',        label_ar: 'تاريخ الاستحقاق', value: metadata.due_date })
    if (metadata.priority)     items.push({ label_en: 'Priority',        label_ar: 'الأولوية',        value: metadata.priority })
    if (metadata.assigned_to)  items.push({ label_en: 'Assigned To',     label_ar: 'المعيّن لـ',      value: metadata.assigned_to })
    if (metadata.status)       items.push({ label_en: 'Status',          label_ar: 'الحالة',          value: metadata.status })
    if (metadata.file_name) {
      const fileLabel = String(metadata.file_name).replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const fileUrl = typeof metadata.file_url === 'string' ? metadata.file_url : ''
      items.push({
        label_en: 'File',
        label_ar: 'الملف',
        value: fileUrl
          ? `<a href="${fileUrl}" target="_blank" rel="noopener noreferrer" style="color:#1D3461;font-weight:700;text-decoration:underline;">${fileLabel} — Open / Download</a>`
          : fileLabel,
      })
    }
    if (metadata.comment)      items.push({ label_en: 'Comment',         label_ar: 'التعليق',         value: metadata.comment })
  }
  if ([
    'project_stage_advanced', 'project_stage_completed', 'project_milestone_reached',
    'project_stage_assigned', 'project_stage_acknowledged', 'project_stalled', 'project_milestone_overdue',
    'project_created', 'project_completed', 'project_archived', 'project_member_added', 'project_member_removed',
    'project_health_changed', 'project_budget_exceeded', 'project_stage_deadline_reminder',
    'project_milestone_completed', 'project_status_changed',
  ].includes(eventType)) {
    if (metadata.project_name)  items.push({ label_en: 'Project',         label_ar: 'المشروع',          value: metadata.project_name })
    if (metadata.project_type)  items.push({ label_en: 'Type',            label_ar: 'النوع',            value: metadata.project_type })
    if (metadata.stage)         items.push({ label_en: 'Stage',           label_ar: 'المرحلة',          value: metadata.stage })
    if (metadata.milestone)     items.push({ label_en: 'Milestone',       label_ar: 'المرحلة الرئيسية', value: metadata.milestone })
    if (metadata.status)        items.push({ label_en: 'Status',          label_ar: 'الحالة',           value: metadata.status })
    if (metadata.health_score)  items.push({ label_en: 'Health Score',    label_ar: 'درجة الصحة',       value: metadata.health_score })
    if (metadata.days_stalled)  items.push({ label_en: 'Days Stalled',    label_ar: 'أيام التوقف',      value: `${metadata.days_stalled} days` })
    if (metadata.due_date)      items.push({ label_en: 'Due Date',        label_ar: 'تاريخ الاستحقاق',  value: metadata.due_date })
    if (metadata.days_label)    items.push({ label_en: 'Timeline',        label_ar: 'الجدول الزمني',    value: metadata.days_label })
    if (metadata.role)          items.push({ label_en: 'Role',            label_ar: 'الدور',            value: metadata.role })
  }
  if (['project_risk_added', 'project_risk_updated'].includes(eventType)) {
    if (metadata.project_name)  items.push({ label_en: 'Project',         label_ar: 'المشروع',          value: metadata.project_name })
    if (metadata.risk_title)    items.push({ label_en: 'Risk',            label_ar: 'المخاطرة',         value: metadata.risk_title })
    if (metadata.category)      items.push({ label_en: 'Category',        label_ar: 'الفئة',            value: metadata.category })
    if (metadata.risk_score)    items.push({ label_en: 'Risk Score',      label_ar: 'درجة المخاطرة',    value: String(metadata.risk_score) })
    if (metadata.status)        items.push({ label_en: 'Status',          label_ar: 'الحالة',           value: metadata.status })
    if (metadata.due_date)      items.push({ label_en: 'Due Date',        label_ar: 'تاريخ الاستحقاق',  value: metadata.due_date })
    if (metadata.responsible_unit) items.push({ label_en: 'Responsible Unit', label_ar: 'الجهة المسؤولة', value: metadata.responsible_unit })
  }
  if (['mmp_assigned', 'mmp_recall_initiated', 'mmp_cycle_closed', 'mmp_completed', 'cycle_close_step4_ready'].includes(eventType)) {
    if (metadata.mmp_code)   items.push({ label_en: 'MMP Code',        label_ar: 'رمز الخطة',       value: metadata.mmp_code })
    if (metadata.site_name)  items.push({ label_en: 'Site',            label_ar: 'الموقع',          value: metadata.site_name })
    if (metadata.cycle)      items.push({ label_en: 'Cycle',           label_ar: 'الدورة',          value: metadata.cycle })
  }
  if (['budget_threshold_80', 'budget_threshold_100'].includes(eventType)) {
    if (metadata.budget_line) items.push({ label_en: 'Budget Line',    label_ar: 'بند الميزانية',   value: metadata.budget_line })
    if (metadata.utilized)   items.push({ label_en: 'Utilized',        label_ar: 'المستخدم',        value: `${metadata.utilized}%` })
    if (metadata.remaining)  items.push({ label_en: 'Remaining',       label_ar: 'المتبقي',         value: `${metadata.remaining} ${metadata.currency || 'SDG'}` })
  }
  if (['advance_request_submitted', 'advance_request_approved', 'advance_request_rejected'].includes(eventType)) {
    if (metadata.amount)       items.push({ label_en: 'Amount',          label_ar: 'المبلغ',           value: `${metadata.amount} ${metadata.currency || 'SDG'}` })
    if (metadata.submitted_by) items.push({ label_en: 'Submitted By',    label_ar: 'قدّمه',            value: metadata.submitted_by })
    if (metadata.purpose)      items.push({ label_en: 'Purpose',         label_ar: 'الغرض',            value: metadata.purpose })
  }
  if (['crm_opportunity_stage_changed', 'crm_opportunity_won'].includes(eventType)) {
    if (metadata.opportunity)  items.push({ label_en: 'Opportunity',     label_ar: 'الفرصة',           value: metadata.opportunity })
    if (metadata.stage)        items.push({ label_en: 'Stage',           label_ar: 'المرحلة',          value: metadata.stage })
    if (metadata.partner_name) items.push({ label_en: 'Partner',         label_ar: 'الشريك',           value: metadata.partner_name })
    if (metadata.value)        items.push({ label_en: 'Value',           label_ar: 'القيمة',           value: metadata.value })
  }
  if (metadata.payroll_month) items.push({ label_en: 'Payroll Month',  label_ar: 'شهر الراتب',      value: metadata.payroll_month })

  if (eventType.startsWith('pre_fund_')) {
    if (metadata.fund_name)        items.push({ label_en: 'Fund Name',       label_ar: 'اسم الصندوق',       value: String(metadata.fund_name) })
    if (metadata.amount != null)   items.push({ label_en: 'Amount',          label_ar: 'المبلغ',            value: `${Number(metadata.amount).toLocaleString('en-US')} ${metadata.currency || 'SDG'}` })
    if (metadata.step_label)       items.push({ label_en: 'Approval Step',   label_ar: 'خطوة الموافقة',     value: String(metadata.step_label) })
    if (metadata.days_remaining != null) items.push({ label_en: 'Days Remaining', label_ar: 'الأيام المتبقية', value: `${metadata.days_remaining} days` })
    if (metadata.surplus_action)   items.push({ label_en: 'Surplus Action',  label_ar: 'إجراء الفائض',      value: String(metadata.surplus_action) })
    if (metadata.reason)           items.push({ label_en: 'Reason',          label_ar: 'السبب',             value: String(metadata.reason) })
    if (metadata.requested_amount != null) items.push({ label_en: 'Requested Amount', label_ar: 'المبلغ المطلوب', value: `${Number(metadata.requested_amount).toLocaleString('en-US')} ${metadata.currency || 'SDG'}` })
  }

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
    if (['approval_required', 'cost_action_required', 'cost_submitted', 'leave_request_submitted', 'payroll_approval_needed', 'mmp_forwarded', 'signature_requested'].includes(eventType)) return 'Review & Approve →'
    if (eventType.includes('assigned')) return 'View Assignment →'
    if ([
      'project_stage_advanced', 'project_stage_completed', 'project_milestone_reached',
      'project_stage_assigned', 'project_stalled', 'project_milestone_overdue',
      'project_stage_deadline_reminder', 'project_milestone_completed',
      'project_risk_added', 'project_risk_updated', 'project_status_changed',
    ].includes(eventType)) return 'View Project →'
    if (['contract_expiring_7d', 'contract_expiring_30d', 'contract_expired'].includes(eventType)) return 'View Contract →'
    return 'View Details →'
  })()
  const actionBtnLabel_ar = (() => {
    if (['approval_required', 'cost_action_required', 'cost_submitted', 'leave_request_submitted', 'payroll_approval_needed', 'mmp_forwarded', 'signature_requested'].includes(eventType)) return '← المراجعة والموافقة'
    if ([
      'project_stage_advanced', 'project_stage_completed', 'project_milestone_reached',
      'project_stage_assigned', 'project_stalled', 'project_milestone_overdue',
      'project_stage_deadline_reminder', 'project_milestone_completed',
      'project_risk_added', 'project_risk_updated', 'project_status_changed',
    ].includes(eventType)) return '← عرض المشروع'
    if (eventType.includes('assigned')) return '← عرض التعيين'
    return '← عرض التفاصيل'
  })()

  // ── Resolve absolute URLs ──────────────────────────────────────────────────
  const APP_BASE = 'https://app.pactorg.com'
  const fullWebUrl = actionUrl
    ? (actionUrl.startsWith('http') ? actionUrl : `${APP_BASE}${actionUrl}`)
    : ''
  // Mobile link: use HTTPS (same web URL) so email clients don't flag custom schemes.
  // Universal links on Android/iOS will open the native app if installed.
  const fullMobileUrl = fullWebUrl

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
        <tr><td style="background:linear-gradient(135deg,#0F2041 0%,#1D3461 100%);padding:28px 32px 22px;border-radius:12px 12px 0 0;text-align:center;">
          <div style="background:white;display:inline-block;padding:10px 14px;border-radius:14px;margin-bottom:14px;box-shadow:0 2px 12px rgba(0,0,0,0.18);">
            <img src="https://app.pactorg.com/pact-logo-email.png" alt="PACT" width="84" height="84" style="display:block;width:84px;height:auto;border:0;outline:none;" />
          </div>
          <div style="font-size:22px;margin-bottom:2px;">${icon}</div>
          <h1 style="color:white;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.02em;">PACT Command Center</h1>
          <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px;">A Synergy of Consulting Expertise for Transformation &amp; Development</p>
          <p style="color:rgba(255,255,255,0.55);margin:2px 0 0;font-size:12px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">مركز قيادة باكت للعمليات الميدانية</p>
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

          <!-- Action buttons: Web + Mobile -->
          ${fullWebUrl ? `
          <div style="text-align:center;margin:28px 0 4px;">

            <!-- Primary: Open in Web App -->
            <a href="${fullWebUrl}"
               style="display:inline-block;padding:14px 28px;background:${actionBtnColor};color:white;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:-0.01em;box-shadow:0 2px 8px rgba(0,0,0,0.15);margin:4px 6px;">
              🌐 ${actionBtnLabel_en}
            </a>

            <!-- Secondary: Open in Mobile App -->
            <a href="${fullMobileUrl}"
               style="display:inline-block;padding:14px 28px;background:#ffffff;color:${actionBtnColor};text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:-0.01em;box-shadow:0 2px 8px rgba(0,0,0,0.12);border:2px solid ${actionBtnColor};margin:4px 6px;">
              📱 Open in Mobile App
            </a>

          </div>
          <p style="text-align:center;margin:10px 0 0;font-size:12px;color:#9ca3af;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
            ${actionBtnLabel_ar} &nbsp;|&nbsp; افتح في تطبيق الجوال
          </p>
          <p style="text-align:center;margin:6px 0 0;font-size:11px;color:#cbd5e1;">
            If the mobile button doesn't open, install the PACT Command Center app first.
          </p>
          ` : ''}

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:22px 32px;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;width:64px;">
              <img src="https://app.pactorg.com/pact-logo-email.png" alt="PACT" width="48" height="48" style="display:block;width:48px;height:auto;border:0;outline:none;" />
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <p style="margin:0;font-size:13px;color:#1D3461;font-weight:700;">PACT Command Center</p>
              <p style="margin:2px 0 0;font-size:11px;color:#64748b;">A Synergy of Consulting Expertise for Transformation &amp; Development</p>
            </td>
          </tr></table>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-align:center;">${recipientNoticeEn}</p>
          <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;text-align:center;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">${recipientNoticeAr}</p>
          <p style="margin:0;font-size:11px;color:#cbd5e1;text-align:center;line-height:1.6;">
            This is an automated message from PACT Workflow Platform.<br>
            <span style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;">هذه رسالة آلية من منصة باكت للعمليات الميدانية</span><br><br>
            ICT Team · PACT Command Center · <a href="https://app.pactorg.com" style="color:#1D3461;text-decoration:none;font-weight:600;">app.pactorg.com</a>
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
    const serviceRoleKeyEarly = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    // ── Dedup guard: prevent duplicate notifications for same event+entity+message within 5 min ──
    // Include message_en so distinct file uploads / comments on the same project are not suppressed.
    if (entity_id && supabaseUrl && serviceRoleKeyEarly && recipient_ids.length > 0) {
      try {
        const sbCheck = createClient(supabaseUrl, serviceRoleKeyEarly)
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        let q = sbCheck
          .from('notifications')
          .select('id')
          .eq('event_type', event_type)
          .eq('entity_id', entity_id)
          .eq('message_en', message_en)
          .in('recipient_id', recipient_ids.slice(0, 10))
          .gte('created_at', fiveMinAgo)
          .limit(1)
        const { data: recent } = await q
        if (recent?.length) {
          return new Response(
            JSON.stringify({ success: true, deduped: true, count: 0, reason: 'Duplicate suppressed within 5-minute window' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } catch (_dedupErr) {
        // Dedup check failed — continue and send normally rather than silently drop
      }
    }
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

    // Resolve actor name if triggered_by is set but triggered_by_name was not supplied
    let resolvedTriggeredByName = triggered_by_name
    if (triggered_by && !resolvedTriggeredByName) {
      const { data: actorProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', triggered_by)
        .single()
      resolvedTriggeredByName = (actorProfile as { full_name?: string | null } | null)?.full_name || undefined
    }
    const effectiveActorName = resolvedTriggeredByName || triggered_by_name

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
      // Audit warning for silent drops when no recipients resolve from IDs/roles
      try {
        await supabase.from('audit_logs').insert({
          module: 'notification',
          action: 'send',
          entity_type: 'notification',
          entity_id: `notify-no-recipients-${Date.now()}`,
          entity_name: finalTitleEn,
          description: `Notification skipped: no recipients resolved for event "${event_type}"`,
          success: false,
          actor_id: triggered_by || 'system',
          actor_name: effectiveActorName || 'System',
          metadata: {
            event_type,
            entity_type,
            entity_id,
            recipient_ids_count: recipient_ids.length,
            recipient_roles_count: recipient_roles.length,
            action_url,
          },
        })
      } catch (auditErr) {
        console.warn('Failed to write no-recipient audit warning:', auditErr)
      }

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
        triggered_by_name: effectiveActorName,
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

      // Project events always send email regardless of per-user preference toggles
      const isProjectEvent = event_type.startsWith('project_')
      const emailAllowed = isProjectEvent || (userEmailEnabled && categoryEnabled)

      if (nodemailerTransporter && effectiveEmail && send_email && emailAllowed) {
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
              actor_name: effectiveActorName || 'System',
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
              actor_name: effectiveActorName || 'System',
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
          .then(result => {
            console.log(`FCM push result: sent=${result.sent}, failed=${result.failed}`)
            // Log FCM failures to audit_logs so they're visible alongside email/WA failures
            if (result.failed > 0) {
              supabase.from('audit_logs').insert({
                module: 'notification',
                action: 'send',
                entity_type: 'fcm',
                entity_id: `fcm-${Date.now()}`,
                entity_name: finalTitleEn,
                description: `FCM push: ${result.sent} delivered, ${result.failed} failed — event: ${event_type}`,
                success: false,
                actor_id: triggered_by || 'system',
                actor_name: effectiveActorName || 'System',
                metadata: { event_type, sent: result.sent, failed: result.failed, recipient_count: recipientIds.length }
              }).then(() => {}).catch(e => console.warn('FCM audit log failed:', e))
            }
          })
          .catch(err => {
            console.warn('FCM push fire-and-forget error:', err)
            supabase.from('audit_logs').insert({
              module: 'notification',
              action: 'send',
              entity_type: 'fcm',
              entity_id: `fcm-err-${Date.now()}`,
              entity_name: finalTitleEn,
              description: `FCM push request failed entirely — event: ${event_type}`,
              success: false,
              error_message: String(err),
              actor_id: triggered_by || 'system',
              actor_name: effectiveActorName || 'System',
              metadata: { event_type, recipient_count: recipientIds.length }
            }).then(() => {}).catch(() => {})
          })

        // WhatsApp via WasenderAPI (fire-and-forget — fires for ALL notifications)
        // Per-user opt-out is honoured inside send-whatsapp via user_integrations.whatsapp_enabled
        {
          const waData: Record<string, string> = {
            actor: effectiveActorName || 'System',
            url: action_url ? (action_url.startsWith('http') ? action_url : `https://app.pactorg.com${action_url}`) : 'https://app.pactorg.com',
          }
          // Map common metadata fields to template data keys
          if (metadata.task_name)    waData.task_title  = metadata.task_name
          if (metadata.project_name) waData.project_name = metadata.project_name
          if (metadata.project_type) waData.project_type = metadata.project_type
          if (metadata.site_name)    waData.site_name   = metadata.site_name
          if (metadata.mmp_code)     waData.mmp_code    = metadata.mmp_code
          if (metadata.cycle)        waData.cycle       = metadata.cycle
          if (metadata.uncovered_count != null) waData.uncovered_count = String(metadata.uncovered_count)
          if (metadata.stage)        waData.stage       = metadata.stage
          if (metadata.milestone)    waData.milestone   = metadata.milestone
          if (metadata.due_date)     waData.due_date    = metadata.due_date
          if (metadata.priority)     waData.priority    = metadata.priority
          if (metadata.amount)       waData.amount      = metadata.amount
          if (metadata.currency)     waData.currency    = metadata.currency
          if (metadata.balance)      waData.balance     = metadata.balance
          if (metadata.employee)     waData.employee    = metadata.employee
          if (metadata.end_date)     waData.end_date    = metadata.end_date
          if (metadata.budget_line)  waData.budget_line = metadata.budget_line
          if (metadata.remaining)    waData.remaining   = metadata.remaining
          if (metadata.leave_type)   waData.leave_type  = metadata.leave_type
          if (metadata.from_date)    waData.from_date   = metadata.from_date
          if (metadata.to_date)      waData.to_date     = metadata.to_date
          if (metadata.payroll_month) waData.payroll_month = metadata.payroll_month
          if (metadata.opportunity)  waData.opportunity = metadata.opportunity
          if (metadata.health_score) waData.health_score = metadata.health_score
          if (metadata.days_stalled) waData.days_stalled = String(metadata.days_stalled)
          if (message_en)            waData.message     = message_en
          if (message_ar)            waData.message_ar  = message_ar

          fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({ user_ids: recipientIds, event_type, priority: effectivePriority, data: waData }),
          }).then(r => r.json())
            .then(result => console.log(`WhatsApp result: sent=${result.sent}, failed=${result.failed}`))
            .catch(err => console.warn('WhatsApp fire-and-forget error:', err))
        }
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
        actor_name: effectiveActorName,
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
