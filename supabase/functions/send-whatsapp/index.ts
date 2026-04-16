/**
 * send-whatsapp — WasenderAPI WhatsApp delivery function
 *
 * Accepts user_ids (looked up in profiles.phone) or direct phone_numbers,
 * builds a bilingual EN+AR message, and sends via WasenderAPI.
 *
 * ENV: WASENDER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WASENDER_ENDPOINT = 'https://www.wasenderapi.com/api/send-message'

// ── Bilingual WhatsApp templates ──────────────────────────────────────────────
// Short, emoji-led, action-oriented messages in EN + AR

interface BilingualTemplate {
  en: (d: Record<string, string>) => string
  ar: (d: Record<string, string>) => string
}

const TEMPLATES: Record<string, BilingualTemplate> = {
  // ── Task events ─────────────────────────────────────────────────────────────
  task_created: {
    en: d => `📋 *New Task Created*\n"${d.task_title}"\nPriority: ${d.priority || 'Normal'} | Due: ${d.due_date || 'Not set'}\nCreated by: ${d.actor}`,
    ar: d => `📋 *تم إنشاء مهمة جديدة*\n"${d.task_title}"\nالأولوية: ${d.priority_ar || 'عادية'} | الموعد: ${d.due_date || 'غير محدد'}\nأنشأها: ${d.actor}`,
  },
  task_assigned: {
    en: d => `📌 *Task Assigned to You*\n"${d.task_title}"\nAssigned by: ${d.actor}\nPriority: ${d.priority || 'Normal'} | Due: ${d.due_date || 'Not set'}\nView your tasks: ${d.url || 'app.pactorg.com/my-tasks'}`,
    ar: d => `📌 *تم تعيين مهمة لك*\n"${d.task_title}"\nعيّنها: ${d.actor}\nالأولوية: ${d.priority_ar || 'عادية'} | الموعد: ${d.due_date || 'غير محدد'}\nاعرض مهامك: ${d.url || 'app.pactorg.com/my-tasks'}`,
  },
  task_started: {
    en: d => `▶️ *Task In Progress*\n"${d.task_title}" has been started.\nBy: ${d.actor}`,
    ar: d => `▶️ *المهمة قيد التنفيذ*\nتم البدء في "${d.task_title}"\nبواسطة: ${d.actor}`,
  },
  task_acknowledged: {
    en: d => `✅ *Task Acknowledged*\n"${d.task_title}" has been acknowledged by the assignee.`,
    ar: d => `✅ *تم استلام المهمة*\nتم إقرار الاستلام لـ "${d.task_title}"`,
  },
  task_completed: {
    en: d => `🎉 *Task Completed!*\n"${d.task_title}" has been marked done.\nCompleted by: ${d.actor}`,
    ar: d => `🎉 *اكتملت المهمة!*\nتم إنجاز "${d.task_title}"\nأنجزها: ${d.actor}`,
  },
  task_delayed: {
    en: d => `⚠️ *Task Delayed*\n"${d.task_title}" has been marked as delayed.\nBy: ${d.actor}`,
    ar: d => `⚠️ *مهمة متأخرة*\nتم تأجيل "${d.task_title}"\nبواسطة: ${d.actor}`,
  },
  task_rejected: {
    en: d => `❌ *Task Rejected*\n"${d.task_title}" was rejected by ${d.actor}.`,
    ar: d => `❌ *تم رفض المهمة*\nرُفضت "${d.task_title}" من قِبَل ${d.actor}`,
  },
  task_cancelled: {
    en: d => `🚫 *Task Cancelled*\n"${d.task_title}" has been cancelled.`,
    ar: d => `🚫 *تم إلغاء المهمة*\nتم إلغاء "${d.task_title}"`,
  },
  task_overdue: {
    en: d => `🔴 *OVERDUE — Action Required*\n"${d.task_title}" is past its deadline.\nDue: ${d.due_date || 'Unknown'}\nPlease take action immediately.`,
    ar: d => `🔴 *متأخرة — مطلوب إجراء فوري*\nتجاوزت "${d.task_title}" موعدها\nالموعد: ${d.due_date || 'غير معروف'}\nيرجى اتخاذ إجراء فوري`,
  },
  task_reminder_1day: {
    en: d => `⏰ *Due Tomorrow*\n"${d.task_title}" is due tomorrow.\nMake sure it's ready!`,
    ar: d => `⏰ *الموعد غداً*\n"${d.task_title}" موعدها غداً\nتأكد من جاهزيتها!`,
  },
  task_reminder_3day: {
    en: d => `🔔 *Due in 3 Days*\n"${d.task_title}" is due in 3 days.\nDue: ${d.due_date || 'Not set'}`,
    ar: d => `🔔 *الموعد خلال 3 أيام*\nموعد "${d.task_title}" بعد 3 أيام\nالموعد: ${d.due_date || 'غير محدد'}`,
  },
  task_status_changed: {
    en: d => `🔄 *Task Updated*\n"${d.task_title}" status changed by ${d.actor}.`,
    ar: d => `🔄 *تم تحديث المهمة*\nتغيرت حالة "${d.task_title}" بواسطة ${d.actor}`,
  },
  task_updated: {
    en: d => `✏️ *Task Updated*\n"${d.task_title}" has been updated.\nBy: ${d.actor}`,
    ar: d => `✏️ *تم تحديث المهمة*\nتم تعديل "${d.task_title}"\nبواسطة: ${d.actor}`,
  },

  // ── Project events ───────────────────────────────────────────────────────────
  project_created: {
    en: d => `🚀 *New Project Created*\n"${d.project_name}"\nType: ${d.project_type || 'General'}\nCreated by: ${d.actor}`,
    ar: d => `🚀 *تم إنشاء مشروع جديد*\n"${d.project_name}"\nالنوع: ${d.project_type || 'عام'}\nأنشأه: ${d.actor}`,
  },
  project_stage_advanced: {
    en: d => `🚀 *Project Stage Advanced*\n"${d.project_name}" moved to: ${d.stage}\nAdvanced by: ${d.actor}`,
    ar: d => `🚀 *تقدمت مرحلة المشروع*\n"${d.project_name}" انتقل إلى: ${d.stage}\nبواسطة: ${d.actor}`,
  },
  project_milestone_overdue: {
    en: d => `📅 *Milestone Overdue*\nProject: "${d.project_name}"\nMilestone: ${d.milestone || 'Unknown'}\nImmediate action required.`,
    ar: d => `📅 *تأخر إنجاز المرحلة الرئيسية*\nالمشروع: "${d.project_name}"\nالمرحلة: ${d.milestone || 'غير معروفة'}\nمطلوب إجراء فوري`,
  },
  project_stalled: {
    en: d => `⚠️ *Project Stalled*\n"${d.project_name}" has no activity for ${d.days_stalled || 'several'} days.\nAction required!`,
    ar: d => `⚠️ *المشروع متوقف*\n"${d.project_name}" لم يتحرك منذ ${d.days_stalled || 'عدة'} أيام\nمطلوب إجراء!`,
  },
  project_completed: {
    en: d => `🏁 *Project Completed!*\n"${d.project_name}" has been marked as complete.\nCompleted by: ${d.actor}`,
    ar: d => `🏁 *اكتمل المشروع!*\n"${d.project_name}" اكتمل بنجاح\nأنجزه: ${d.actor}`,
  },
  project_archived: {
    en: d => `📦 *Project Archived*\n"${d.project_name}" has been archived.`,
    ar: d => `📦 *تم أرشفة المشروع*\nتم أرشفة "${d.project_name}"`,
  },
  project_member_added: {
    en: d => `👤 *Added to Project*\nYou have been added to "${d.project_name}".\nAdded by: ${d.actor}`,
    ar: d => `👤 *تمت إضافتك لمشروع*\nتمت إضافتك إلى "${d.project_name}"\nأضافك: ${d.actor}`,
  },
  project_task_assigned: {
    en: d => `📋 *Project Task Assigned*\n"${d.task_title}" in "${d.project_name}"\nAssigned by: ${d.actor} | Due: ${d.due_date || 'Not set'}`,
    ar: d => `📋 *تم تعيين مهمة مشروع*\n"${d.task_title}" في "${d.project_name}"\nعيّنها: ${d.actor} | الموعد: ${d.due_date || 'غير محدد'}`,
  },
  project_task_overdue: {
    en: d => `🔴 *Project Task Overdue*\n"${d.task_title}" in "${d.project_name}" is overdue.\nPlease take action immediately.`,
    ar: d => `🔴 *مهمة مشروع متأخرة*\n"${d.task_title}" في "${d.project_name}" متأخرة\nيرجى اتخاذ إجراء فوري`,
  },
  project_health_changed: {
    en: d => `📊 *Project Health Update*\n"${d.project_name}" health score: ${d.health_score || 'Changed'}\nStatus: ${d.status || 'Review required'}`,
    ar: d => `📊 *تحديث حالة المشروع*\n"${d.project_name}" درجة الصحة: ${d.health_score || 'تغيرت'}\nالحالة: ${d.status || 'مطلوب مراجعة'}`,
  },

  // ── MMP events ───────────────────────────────────────────────────────────────
  mmp_created: {
    en: d => `📋 *New MMP Created*\nCode: ${d.mmp_code || 'N/A'} | Cycle: ${d.cycle || 'N/A'}\nCreated by: ${d.actor}`,
    ar: d => `📋 *تم إنشاء خطة مراقبة شهرية*\nالرمز: ${d.mmp_code || 'غير محدد'} | الدورة: ${d.cycle || 'غير محدد'}\nأنشأها: ${d.actor}`,
  },
  mmp_assigned: {
    en: d => `📌 *MMP Assigned to You*\nCode: ${d.mmp_code || 'N/A'} | Site: ${d.site_name || 'N/A'}\nAssigned by: ${d.actor}`,
    ar: d => `📌 *تم تعيين خطة مراقبة شهرية لك*\nالرمز: ${d.mmp_code || 'غير محدد'} | الموقع: ${d.site_name || 'غير محدد'}\nعيّنها: ${d.actor}`,
  },
  mmp_forwarded: {
    en: d => `⏳ *MMP Forwarded for Approval*\nCode: ${d.mmp_code || 'N/A'}\nReview required — please take action.`,
    ar: d => `⏳ *تم تحويل الخطة للموافقة*\nالرمز: ${d.mmp_code || 'غير محدد'}\nمطلوب مراجعة وإجراء`,
  },
  mmp_completed: {
    en: d => `✅ *MMP Completed*\nCode: ${d.mmp_code || 'N/A'} | Cycle: ${d.cycle || 'N/A'}\nCompleted by: ${d.actor}`,
    ar: d => `✅ *اكتملت خطة المراقبة الشهرية*\nالرمز: ${d.mmp_code || 'غير محدد'} | الدورة: ${d.cycle || 'غير محدد'}\nأنجزها: ${d.actor}`,
  },
  mmp_recall_initiated: {
    en: d => `🔄 *MMP Recall Initiated*\nCode: ${d.mmp_code || 'N/A'}\nInitiated by: ${d.actor}\nAction required from coordinator.`,
    ar: d => `🔄 *تم بدء استرداد الخطة*\nالرمز: ${d.mmp_code || 'غير محدد'}\nبدأه: ${d.actor}\nمطلوب إجراء من المنسق`,
  },
  mmp_reclaim_approved: {
    en: d => `✅ *MMP Reclaim Approved*\nCode: ${d.mmp_code || 'N/A'}\nApproved by: ${d.actor}`,
    ar: d => `✅ *تمت الموافقة على المطالبة*\nالرمز: ${d.mmp_code || 'غير محدد'}\nوافق عليها: ${d.actor}`,
  },
  mmp_cycle_closed: {
    en: d => `🔒 *MMP Cycle Closed*\nCycle: ${d.cycle || 'N/A'} has been officially closed.`,
    ar: d => `🔒 *تم إغلاق الدورة*\nالدورة: ${d.cycle || 'غير محددة'} أُغلقت رسمياً`,
  },

  // ── Site Visit events ────────────────────────────────────────────────────────
  site_visit_assigned: {
    en: d => `📍 *Site Visit Assigned*\nSite: ${d.site_name || 'N/A'}\nScheduled by: ${d.actor}`,
    ar: d => `📍 *تم تعيين زيارة ميدانية*\nالموقع: ${d.site_name || 'غير محدد'}\nجدولها: ${d.actor}`,
  },
  site_visit_started: {
    en: d => `▶️ *Site Visit Started*\nSite: ${d.site_name || 'N/A'}\nStarted by: ${d.actor}`,
    ar: d => `▶️ *بدأت الزيارة الميدانية*\nالموقع: ${d.site_name || 'غير محدد'}\nبدأها: ${d.actor}`,
  },
  site_visit_completed: {
    en: d => `✅ *Site Visit Completed*\nSite: ${d.site_name || 'N/A'}\nCompleted by: ${d.actor}`,
    ar: d => `✅ *اكتملت الزيارة الميدانية*\nالموقع: ${d.site_name || 'غير محدد'}\nأنجزها: ${d.actor}`,
  },
  site_visit_postponed: {
    en: d => `⏸️ *Site Visit Postponed*\nSite: ${d.site_name || 'N/A'}\nPostponed by: ${d.actor}`,
    ar: d => `⏸️ *تم تأجيل الزيارة الميدانية*\nالموقع: ${d.site_name || 'غير محدد'}\nأجّلها: ${d.actor}`,
  },
  site_flagged_uncovered: {
    en: d => `🚩 *Site Flagged: Uncovered*\nSite: ${d.site_name || 'N/A'} has been flagged as uncovered.\nImmediate action required.`,
    ar: d => `🚩 *موقع غير مغطى*\nتم تعليم "${d.site_name || 'غير محدد'}" كموقع غير مغطى\nمطلوب إجراء فوري`,
  },

  // ── Financial events ─────────────────────────────────────────────────────────
  cost_submitted: {
    en: d => `📋 *Cost Submission Received*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}\nSubmitted by: ${d.actor}\nReview required.`,
    ar: d => `📋 *تم استلام طلب تكلفة*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}\nقدّمه: ${d.actor}\nمطلوب مراجعة`,
  },
  cost_approved: {
    en: d => `✅ *Cost Approved*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}\nApproved by: ${d.actor}`,
    ar: d => `✅ *تمت الموافقة على التكلفة*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}\nوافق عليها: ${d.actor}`,
  },
  cost_rejected: {
    en: d => `❌ *Cost Rejected*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}\nRejected by: ${d.actor}`,
    ar: d => `❌ *تم رفض التكلفة*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}\nرفضها: ${d.actor}`,
  },
  payment_processed: {
    en: d => `💰 *Payment Processed*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}`,
    ar: d => `💰 *تمت معالجة الدفع*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}`,
  },
  wallet_updated: {
    en: d => `💳 *Wallet Updated*\nNew Balance: ${d.balance || 'N/A'} ${d.currency || 'SDG'}`,
    ar: d => `💳 *تم تحديث المحفظة*\nالرصيد الجديد: ${d.balance || 'غير محدد'} ${d.currency || 'SDG'}`,
  },
  withdrawal_approved: {
    en: d => `✅ *Withdrawal Approved*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}`,
    ar: d => `✅ *تمت الموافقة على السحب*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}`,
  },
  withdrawal_rejected: {
    en: d => `❌ *Withdrawal Rejected*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}`,
    ar: d => `❌ *تم رفض السحب*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}`,
  },
  budget_threshold_80: {
    en: d => `📊 *Budget Alert: 80% Used*\nBudget line: ${d.budget_line || 'N/A'}\nRemaining: ${d.remaining || 'N/A'} ${d.currency || 'SDG'}`,
    ar: d => `📊 *تنبيه: 80% من الميزانية مستخدمة*\nبند: ${d.budget_line || 'غير محدد'}\nمتبقي: ${d.remaining || 'غير محدد'} ${d.currency || 'SDG'}`,
  },
  budget_threshold_100: {
    en: d => `🚨 *BUDGET FULLY UTILIZED*\nBudget line: ${d.budget_line || 'N/A'} is 100% used.\nNo more spending allowed.`,
    ar: d => `🚨 *تم استنفاد الميزانية بالكامل*\nالبند: ${d.budget_line || 'غير محدد'} استُخدم 100%\nلا يمكن الإنفاق أكثر`,
  },
  advance_request_submitted: {
    en: d => `📋 *Advance Request Submitted*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}\nSubmitted by: ${d.actor}\nAwaiting approval.`,
    ar: d => `📋 *تم تقديم طلب سلفة*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}\nقدّمه: ${d.actor}\nبانتظار الموافقة`,
  },
  advance_request_approved: {
    en: d => `✅ *Advance Approved*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}\nApproved by: ${d.actor}`,
    ar: d => `✅ *تمت الموافقة على السلفة*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}\nوافق عليها: ${d.actor}`,
  },
  advance_request_rejected: {
    en: d => `❌ *Advance Rejected*\nAmount: ${d.amount || 'N/A'} ${d.currency || 'SDG'}\nRejected by: ${d.actor}`,
    ar: d => `❌ *تم رفض طلب السلفة*\nالمبلغ: ${d.amount || 'غير محدد'} ${d.currency || 'SDG'}\nرفضها: ${d.actor}`,
  },

  // ── Leave events ─────────────────────────────────────────────────────────────
  leave_request_submitted: {
    en: d => `📋 *Leave Request Submitted*\nType: ${d.leave_type || 'N/A'} | From: ${d.from_date || 'N/A'} to ${d.to_date || 'N/A'}\nSubmitted by: ${d.actor}\nAwaiting approval.`,
    ar: d => `📋 *تم تقديم طلب إجازة*\nالنوع: ${d.leave_type || 'غير محدد'} | من: ${d.from_date || 'غير محدد'} إلى ${d.to_date || 'غير محدد'}\nقدّمه: ${d.actor}\nبانتظار الموافقة`,
  },
  leave_request_approved: {
    en: d => `✅ *Leave Request Approved!*\nType: ${d.leave_type || 'N/A'} | From: ${d.from_date || 'N/A'} to ${d.to_date || 'N/A'}\nApproved by: ${d.actor}`,
    ar: d => `✅ *تمت الموافقة على طلب الإجازة!*\nالنوع: ${d.leave_type || 'غير محدد'} | من: ${d.from_date || 'غير محدد'} إلى ${d.to_date || 'غير محدد'}\nوافق عليها: ${d.actor}`,
  },
  leave_request_rejected: {
    en: d => `❌ *Leave Request Not Approved*\nType: ${d.leave_type || 'N/A'}\nRejected by: ${d.actor}.\nPlease contact HR for details.`,
    ar: d => `❌ *لم تتم الموافقة على طلب الإجازة*\nالنوع: ${d.leave_type || 'غير محدد'}\nرفضها: ${d.actor}\nيرجى التواصل مع قسم الموارد البشرية`,
  },
  leave_request_cancelled: {
    en: d => `🚫 *Leave Request Cancelled*\nYour leave request has been cancelled.`,
    ar: d => `🚫 *تم إلغاء طلب الإجازة*\nتم إلغاء طلب إجازتك`,
  },

  // ── Payroll & Contracts ──────────────────────────────────────────────────────
  payroll_run_completed: {
    en: d => `💰 *Payroll Processed*\nMonth: ${d.payroll_month || 'N/A'}\nYour salary has been processed. Check your payslip.`,
    ar: d => `💰 *تمت معالجة الراتب*\nالشهر: ${d.payroll_month || 'غير محدد'}\nتمت معالجة راتبك. راجع قسيمة الراتب`,
  },
  payroll_approval_needed: {
    en: d => `📋 *Payroll Approval Required*\nMonth: ${d.payroll_month || 'N/A'}\nPlease review and approve payroll.`,
    ar: d => `📋 *مطلوب موافقة على الرواتب*\nالشهر: ${d.payroll_month || 'غير محدد'}\nيرجى مراجعة الرواتب والموافقة عليها`,
  },
  payroll_slip_ready: {
    en: d => `💵 *Payslip Ready*\nYour payslip for ${d.payroll_month || 'this month'} is now available.\nView it in the HR portal.`,
    ar: d => `💵 *قسيمة الراتب جاهزة*\nقسيمة راتبك عن ${d.payroll_month || 'هذا الشهر'} متاحة الآن\nراجعها في بوابة الموارد البشرية`,
  },
  contract_expiring_30d: {
    en: d => `⏰ *Contract Expiring Soon*\nEmployee: ${d.employee || 'N/A'}\nEnd Date: ${d.end_date || 'N/A'} (30 days remaining)\nPlease initiate renewal.`,
    ar: d => `⏰ *العقد ينتهي قريباً*\nالموظف: ${d.employee || 'غير محدد'}\nتاريخ الانتهاء: ${d.end_date || 'غير محدد'} (متبقي 30 يوماً)\nيرجى بدء التجديد`,
  },
  contract_expiring_7d: {
    en: d => `⚠️ *Contract Expiring This Week*\nEmployee: ${d.employee || 'N/A'}\nEnd Date: ${d.end_date || 'N/A'} (7 days remaining)\nUrgent renewal required!`,
    ar: d => `⚠️ *العقد ينتهي هذا الأسبوع*\nالموظف: ${d.employee || 'غير محدد'}\nتاريخ الانتهاء: ${d.end_date || 'غير محدد'} (متبقي 7 أيام)\nمطلوب تجديد عاجل!`,
  },
  contract_expired: {
    en: d => `❌ *Contract Expired*\nEmployee: ${d.employee || 'N/A'} contract has expired.\nImmediate HR action required.`,
    ar: d => `❌ *انتهى العقد*\nانتهى عقد ${d.employee || 'غير محدد'}\nمطلوب إجراء فوري من الموارد البشرية`,
  },

  // ── Approvals / Signatures ───────────────────────────────────────────────────
  approval_required: {
    en: d => `⏳ *Approval Required*\n${d.message || 'An item is waiting for your approval.'}\nPlease review and action.`,
    ar: d => `⏳ *مطلوب موافقة*\n${d.message_ar || 'هناك بند بانتظار موافقتك'}\nيرجى المراجعة والإجراء`,
  },
  signature_requested: {
    en: d => `✍️ *Signature Required*\nDocument: ${d.document || 'N/A'}\nRequested by: ${d.actor}\nPlease sign as soon as possible.`,
    ar: d => `✍️ *مطلوب توقيع*\nالمستند: ${d.document || 'غير محدد'}\nطلبه: ${d.actor}\nيرجى التوقيع في أقرب وقت`,
  },
  signature_completed: {
    en: d => `✅ *Document Signed*\nDocument: ${d.document || 'N/A'} has been signed successfully.`,
    ar: d => `✅ *تم توقيع المستند*\nتم توقيع "${d.document || 'غير محدد'}" بنجاح`,
  },

  // ── CRM events ───────────────────────────────────────────────────────────────
  crm_opportunity_stage_changed: {
    en: d => `📈 *Opportunity Updated*\n${d.opportunity || 'N/A'} moved to stage: ${d.stage || 'N/A'}\nBy: ${d.actor}`,
    ar: d => `📈 *تحديث الفرصة*\nانتقلت "${d.opportunity || 'غير محدد'}" إلى المرحلة: ${d.stage || 'غير محددة'}\nبواسطة: ${d.actor}`,
  },
  crm_opportunity_won: {
    en: d => `🏆 *Opportunity Won!*\n"${d.opportunity || 'N/A'}" has been marked as WON!\nCongratulations to the team! 🎉`,
    ar: d => `🏆 *تم الفوز بالفرصة!*\nتم الفوز بـ "${d.opportunity || 'غير محدد'}"!\nتهانينا للفريق! 🎉`,
  },
  crm_partner_created: {
    en: d => `🤝 *New Partner Added*\n"${d.partner_name || 'N/A'}" added to CRM by ${d.actor}`,
    ar: d => `🤝 *تمت إضافة شريك جديد*\n"${d.partner_name || 'غير محدد'}" أُضيف إلى CRM بواسطة ${d.actor}`,
  },
  crm_engagement_created: {
    en: d => `📞 *New Engagement Logged*\n${d.engagement_type || 'Activity'} with ${d.partner_name || 'partner'}\nLogged by: ${d.actor}`,
    ar: d => `📞 *تم تسجيل تعامل جديد*\n${d.engagement_type || 'نشاط'} مع ${d.partner_name || 'شريك'}\nسجّله: ${d.actor}`,
  },

  // ── Account / System ─────────────────────────────────────────────────────────
  user_approved: {
    en: d => `✅ *Account Approved!*\nWelcome, ${d.recipient_name || 'Team Member'}!\nYour PACT account has been approved.\nYou can now log in at app.pactorg.com`,
    ar: d => `✅ *تمت الموافقة على الحساب!*\nأهلاً، ${d.recipient_name || 'عضو الفريق'}!\nتمت الموافقة على حسابك في باكت\nيمكنك الآن تسجيل الدخول على app.pactorg.com`,
  },
  user_rejected: {
    en: d => `❌ *Account Status Updated*\nYour PACT account status has been updated. Please contact your administrator.`,
    ar: d => `❌ *تحديث حالة الحساب*\nتم تحديث حالة حسابك في باكت. يرجى التواصل مع المدير`,
  },
  broadcast: {
    en: d => `📢 *System Announcement*\n${d.message || 'An important announcement has been made. Please check the platform.'}`,
    ar: d => `📢 *إعلان النظام*\n${d.message_ar || 'تم إصدار إعلان مهم. يرجى مراجعة المنصة'}`,
  },
  reminder: {
    en: d => `🔔 *Reminder*\n${d.message || 'You have a pending reminder.'}`,
    ar: d => `🔔 *تذكير*\n${d.message_ar || 'لديك تذكير معلق'}`,
  },
  daily_digest: {
    en: d => `📊 *Daily Summary*\nActive: ${d.active || 0} | Done: ${d.done || 0} | Overdue: ${d.overdue || 0}\nHave a productive day! 🌟`,
    ar: d => `📊 *ملخص اليوم*\nنشطة: ${d.active || 0} | منجزة: ${d.done || 0} | متأخرة: ${d.overdue || 0}\nيوم منتج! 🌟`,
  },
}

// ── Phone number normalizer ───────────────────────────────────────────────────
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7) return null

  // Already has country code — return as-is with + prefix
  if (digits.startsWith('249') && digits.length >= 12) return `+${digits}`   // Sudan
  if (digits.startsWith('256') && digits.length >= 12) return `+${digits}`   // Uganda

  // Sudan local numbers: 09XXXXXXXX or 01XXXXXXXX (10 digits)
  if ((digits.startsWith('09') || digits.startsWith('01')) && digits.length === 10)
    return `+249${digits.slice(1)}`

  // Sudan bare 9-digit: 9XXXXXXXX
  if (digits.startsWith('9') && digits.length === 9) return `+249${digits}`

  // Uganda local numbers: 07XXXXXXXX (10 digits)
  if (digits.startsWith('07') && digits.length === 10) return `+256${digits.slice(1)}`

  // Already fully international (10+ digits, no matching prefix above)
  if (digits.length >= 10) return `+${digits}`

  return null
}

// ── Build bilingual WhatsApp message ─────────────────────────────────────────
function buildMessage(eventType: string, data: Record<string, string>): string {
  const tpl = TEMPLATES[eventType]
  if (!tpl) {
    const fallback = data.message_en || data.message || 'PACT notification — please check the platform.'
    const fallbackAr = data.message_ar || 'إشعار من باكت — يرجى مراجعة المنصة'
    return `${fallback}\n\n${fallbackAr}`
  }
  const en = tpl.en(data)
  const ar = tpl.ar(data)
  return `${en}\n\n━━━━━━━━━━━━━━━━\n${ar}\n\n🌐 app.pactorg.com`
}

// ── Event-type → whatsapp_notify_* column mapping ────────────────────────────
type WhatsAppCategoryCol =
  | 'whatsapp_notify_tasks'
  | 'whatsapp_notify_approvals'
  | 'whatsapp_notify_payroll'
  | 'whatsapp_notify_projects'
  | 'whatsapp_notify_mmp'

const EVENT_CATEGORY_MAP: Record<string, WhatsAppCategoryCol> = {
  // Tasks
  task_created: 'whatsapp_notify_tasks',
  task_assigned: 'whatsapp_notify_tasks',
  task_started: 'whatsapp_notify_tasks',
  task_acknowledged: 'whatsapp_notify_tasks',
  task_completed: 'whatsapp_notify_tasks',
  task_delayed: 'whatsapp_notify_tasks',
  task_rejected: 'whatsapp_notify_tasks',
  task_cancelled: 'whatsapp_notify_tasks',
  task_overdue: 'whatsapp_notify_tasks',
  task_reminder_1day: 'whatsapp_notify_tasks',
  task_reminder_3day: 'whatsapp_notify_tasks',
  task_status_changed: 'whatsapp_notify_tasks',
  task_updated: 'whatsapp_notify_tasks',
  // MMP
  mmp_created: 'whatsapp_notify_mmp',
  mmp_assigned: 'whatsapp_notify_mmp',
  mmp_forwarded: 'whatsapp_notify_mmp',
  mmp_completed: 'whatsapp_notify_mmp',
  mmp_recall_initiated: 'whatsapp_notify_mmp',
  mmp_reclaim_approved: 'whatsapp_notify_mmp',
  mmp_cycle_closed: 'whatsapp_notify_mmp',
  // Site visits are part of Field Ops (MMP) per the Integrations Settings UI
  site_visit_assigned: 'whatsapp_notify_mmp',
  site_visit_started: 'whatsapp_notify_mmp',
  site_visit_completed: 'whatsapp_notify_mmp',
  site_visit_postponed: 'whatsapp_notify_mmp',
  site_flagged_uncovered: 'whatsapp_notify_mmp',
  // Approvals
  approval_required: 'whatsapp_notify_approvals',
  signature_requested: 'whatsapp_notify_approvals',
  signature_completed: 'whatsapp_notify_approvals',
  leave_request_submitted: 'whatsapp_notify_approvals',
  leave_request_approved: 'whatsapp_notify_approvals',
  leave_request_rejected: 'whatsapp_notify_approvals',
  leave_request_cancelled: 'whatsapp_notify_approvals',
  // Payroll / Financial
  payroll_run_completed: 'whatsapp_notify_payroll',
  payroll_approval_needed: 'whatsapp_notify_payroll',
  payroll_slip_ready: 'whatsapp_notify_payroll',
  contract_expiring_30d: 'whatsapp_notify_payroll',
  contract_expiring_7d: 'whatsapp_notify_payroll',
  contract_expired: 'whatsapp_notify_payroll',
  cost_submitted: 'whatsapp_notify_payroll',
  cost_approved: 'whatsapp_notify_payroll',
  cost_rejected: 'whatsapp_notify_payroll',
  payment_processed: 'whatsapp_notify_payroll',
  wallet_updated: 'whatsapp_notify_payroll',
  withdrawal_approved: 'whatsapp_notify_payroll',
  withdrawal_rejected: 'whatsapp_notify_payroll',
  budget_threshold_80: 'whatsapp_notify_payroll',
  budget_threshold_100: 'whatsapp_notify_payroll',
  advance_request_submitted: 'whatsapp_notify_payroll',
  advance_request_approved: 'whatsapp_notify_payroll',
  advance_request_rejected: 'whatsapp_notify_payroll',
  // Projects
  project_created: 'whatsapp_notify_projects',
  project_stage_advanced: 'whatsapp_notify_projects',
  project_milestone_overdue: 'whatsapp_notify_projects',
  project_stalled: 'whatsapp_notify_projects',
  project_completed: 'whatsapp_notify_projects',
  project_archived: 'whatsapp_notify_projects',
  project_member_added: 'whatsapp_notify_projects',
  project_task_assigned: 'whatsapp_notify_projects',
  project_task_overdue: 'whatsapp_notify_projects',
  project_health_changed: 'whatsapp_notify_projects',
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('WASENDER_API_KEY')
    if (!apiKey) {
      console.warn('[WhatsApp] WASENDER_API_KEY not configured — skipping')
      return new Response(
        JSON.stringify({ success: false, error: 'WASENDER_API_KEY not configured', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json()
    const {
      user_ids = [],
      phone_numbers = [],
      event_type = 'reminder',
      broadcast_id = null,
      priority = 'medium',
      data: templateData = {},
    } = body as {
      user_ids?: string[]
      phone_numbers?: string[]
      event_type?: string
      broadcast_id?: string | null
      priority?: string
      data?: Record<string, string>
    }

    // ── Look up user-preference column for this event type ──────────────────
    // Uses the authoritative EVENT_CATEGORY_MAP defined at the top of this file.
    const categoryCol: WhatsAppCategoryCol | null = EVENT_CATEGORY_MAP[event_type] ?? null
    const isUrgent = priority === 'urgent'

    // ── Quiet hours: Sudan is UTC+2, block 22:00–07:00 unless urgent ─────────
    const sudanHour = (new Date().getUTCHours() + 2) % 24
    const inQuietHours = sudanHour >= 22 || sudanHour < 7
    if (inQuietHours && !isUrgent) {
      console.log(`[WhatsApp] Quiet hours (Sudan ${sudanHour}:00) — deferring non-urgent ${event_type}`)
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

    interface PhoneEntry { phone: string; userId: string | null }
    let skippedCount = 0

    interface ProfileRow {
      id: string
      phone: string | null
    }
    interface IntegrationRow {
      user_id: string
      whatsapp_enabled: boolean | null
      whatsapp_phone: string | null
      whatsapp_notify_tasks: boolean | null
      whatsapp_notify_approvals: boolean | null
      whatsapp_notify_payroll: boolean | null
      whatsapp_notify_projects: boolean | null
      whatsapp_notify_mmp: boolean | null
    }

    const logSkip = async (userId: string | null, phone: string, reason: string) => {
      try {
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_logs`, {
          method: 'POST',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            phone: phone || 'unknown',
            user_id: userId,
            event_type,
            status: 'skipped',
            direction: 'outbound',
            error_message: `skip_reason:${reason}`,
          }),
        })
      } catch (_) { /* non-blocking */ }
    }

    const phoneEntries: PhoneEntry[] = phone_numbers
      .filter(Boolean)
      .map(p => ({ phone: p, userId: null }))

    if (user_ids.length > 0) {
      // Fetch profiles AND integrations in parallel
      const [profilesResp, integrationsResp] = await Promise.all([
        supabase.from('profiles').select('id, phone').in('id', user_ids),
        supabase
          .from('user_integrations')
          .select('user_id, whatsapp_enabled, whatsapp_phone, whatsapp_notify_tasks, whatsapp_notify_approvals, whatsapp_notify_payroll, whatsapp_notify_projects, whatsapp_notify_mmp')
          .in('user_id', user_ids),
      ])

      const profileMap = new Map<string, ProfileRow>(
        (profilesResp.data as ProfileRow[] ?? []).map(p => [p.id, p])
      )
      const integMap = new Map<string, IntegrationRow>(
        (integrationsResp.data as IntegrationRow[] ?? []).map(r => [r.user_id, r])
      )

      for (const userId of user_ids) {
        const profile = profileMap.get(userId)
        const integ = integMap.get(userId)

        // 1) Master opt-out — default = enabled (null/undefined counts as on)
        if (integ && integ.whatsapp_enabled === false) {
          skippedCount++
          console.log(`[WhatsApp] Skipping ${userId}: whatsapp_enabled=false`)
          await logSkip(userId, '', 'user_opted_out')
          continue
        }

        // 2) Per-category opt-out (urgent always bypasses; unmapped events fall through)
        if (!isUrgent && integ && categoryCol) {
          if (integ[categoryCol] === false) {
            skippedCount++
            console.log(`[WhatsApp] Skipping ${userId}: column '${categoryCol}' is false`)
            await logSkip(userId, '', `category_disabled:${categoryCol}`)
            continue
          }
        }

        // 3) Phone — prefer whatsapp_phone override, fall back to profile phone
        const phone = (integ?.whatsapp_phone && integ.whatsapp_phone.trim())
          ? integ.whatsapp_phone.trim()
          : profile?.phone

        if (phone) {
          phoneEntries.push({ phone, userId })
        } else {
          skippedCount++
          console.log(`[WhatsApp] Skipping user ${userId}: no phone number`)
          await logSkip(userId, 'unknown', 'no_phone')
        }
      }
    }

    // Normalize phones, keeping userId association; deduplicate by normalized phone
    const seenPhones = new Set<string>()
    const normalized: PhoneEntry[] = []
    for (const entry of phoneEntries) {
      const norm = normalizePhone(entry.phone)
      if (norm && !seenPhones.has(norm)) {
        seenPhones.add(norm)
        normalized.push({ phone: norm, userId: entry.userId })
      }
    }

    if (normalized.length === 0) {
      console.log('[WhatsApp] No valid phone numbers found — skipping')
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, skipped: true, reason: 'No valid phones' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const message = buildMessage(event_type, templateData)
    console.log(`[WhatsApp] Sending ${event_type} (priority=${priority}, category=${category}) to ${normalized.length} numbers`)

    // ── Rate limit / bundling check — if phone got ≥3 messages in last 2 min, skip ─
    // Urgent messages bypass the rate limit. Sent status only (skipped/failed don't count).
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const rateLimitedPhones = new Set<string>()
    if (!isUrgent && normalized.length > 0) {
      const { data: recentLogs } = await supabase
        .from('whatsapp_logs')
        .select('phone')
        .in('phone', normalized.map(n => n.phone))
        .eq('status', 'sent')
        .eq('direction', 'outbound')
        .gte('created_at', twoMinutesAgo)
      const counts = new Map<string, number>()
      for (const row of (recentLogs ?? []) as { phone: string }[]) {
        counts.set(row.phone, (counts.get(row.phone) ?? 0) + 1)
      }
      for (const [phone, count] of counts) {
        if (count >= 3) rateLimitedPhones.add(phone)
      }
      if (rateLimitedPhones.size > 0) {
        console.log(`[WhatsApp] Rate-limited ${rateLimitedPhones.size} phones (≥3 msgs in 2min)`)
      }
    }

    // Retry helper: one retry on network error or 5xx
    const sendWithRetry = async (phone: string): Promise<{ ok: boolean; wasenderId: string | null; errorMsg: string | null }> => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const resp = await fetch(WASENDER_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ to: phone, text: message }),
          })
          const responseBody = await resp.text()
          if (resp.ok) {
            let wasenderId: string | null = null
            try {
              const parsed = JSON.parse(responseBody)
              wasenderId = parsed?.id || parsed?.messageId || null
            } catch (_) {}
            console.log(`[WhatsApp] Sent to ${phone}: ${resp.status} (attempt ${attempt})`)
            return { ok: true, wasenderId, errorMsg: null }
          }
          const errorMsg = `HTTP ${resp.status}: ${responseBody.slice(0, 300)}`
          // Retry only on 5xx / 429; 4xx client errors are terminal
          if (attempt === 1 && (resp.status >= 500 || resp.status === 429)) {
            console.warn(`[WhatsApp] ${phone} attempt 1 failed (${resp.status}), retrying in 1s`)
            await new Promise(r => setTimeout(r, 1000))
            continue
          }
          return { ok: false, wasenderId: null, errorMsg }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          if (attempt === 1) {
            console.warn(`[WhatsApp] ${phone} network error, retrying: ${errorMsg}`)
            await new Promise(r => setTimeout(r, 1000))
            continue
          }
          return { ok: false, wasenderId: null, errorMsg }
        }
      }
      return { ok: false, wasenderId: null, errorMsg: 'exhausted' }
    }

    // Send to each number via WasenderAPI
    const results = await Promise.all(
      normalized.map(async ({ phone, userId }) => {
        // Rate-limit skip
        if (rateLimitedPhones.has(phone)) {
          await logSkip(userId, phone, 'rate_limited')
          return { phone, success: false, skipped: true as const }
        }

        const { ok: success, wasenderId, errorMsg } = await sendWithRetry(phone)

        // Always log the delivery attempt — direct REST with service-role key
        try {
          const logResp = await fetch(`${supabaseUrl}/rest/v1/whatsapp_logs`, {
            method: 'POST',
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              phone,
              user_id: userId,
              event_type,
              ...(broadcast_id ? { broadcast_id } : {}),
              status: success ? 'sent' : 'failed',
              direction: 'outbound',
              message_body: message.slice(0, 1000),
              error_message: errorMsg ? errorMsg.slice(0, 500) : null,
              wasender_id: wasenderId,
            }),
          })
          if (!logResp.ok) {
            const t = await logResp.text()
            console.error(`[WhatsApp] whatsapp_logs insert failed (${logResp.status}): ${t.slice(0, 300)}`)
          }
        } catch (logErr) {
          console.error(`[WhatsApp] whatsapp_logs insert threw:`, logErr instanceof Error ? logErr.message : logErr)
        }

        return { phone, success, skipped: false as const }
      }),
    )

    const sent = results.filter(r => r.success).length
    const rateLimitedSkipped = results.filter(r => r.skipped).length
    skippedCount += rateLimitedSkipped
    const failed = results.filter(r => !r.success && !r.skipped).length
    const errors: string[] = []

    if (failed > 0) {
      console.error(`[WhatsApp] ${failed} messages failed:`, errors)
    }
    if (rateLimitedSkipped > 0) {
      console.log(`[WhatsApp] ${rateLimitedSkipped} messages skipped (rate-limited)`)
    }

    // Audit log
    try {
      await supabase.from('audit_logs').insert({
        module: 'notification',
        action: 'whatsapp_send',
        entity_type: 'whatsapp',
        entity_id: `wa-${Date.now()}`,
        entity_name: event_type,
        description: `WhatsApp: sent=${sent}, failed=${failed} for event=${event_type}`,
        success: sent > 0,
        actor_name: 'System',
        metadata: { event_type, sent, failed, total: normalized.length },
      })
    } catch (_) { /* non-blocking */ }

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: normalized.length, skipped: skippedCount }),
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
