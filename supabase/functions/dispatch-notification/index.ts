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

const eventTemplates: Record<string, { title_en: string; title_ar: string }> = {
  'mmp_created': { title_en: 'New MMP Created', title_ar: 'تم إنشاء خطة مراقبة شهرية جديدة' },
  'mmp_assigned': { title_en: 'MMP Assigned to You', title_ar: 'تم تعيين خطة مراقبة شهرية لك' },
  'mmp_updated': { title_en: 'MMP Updated', title_ar: 'تم تحديث خطة المراقبة الشهرية' },
  'mmp_completed': { title_en: 'MMP Completed', title_ar: 'اكتملت خطة المراقبة الشهرية' },
  'task_assigned': { title_en: 'New Task Assigned', title_ar: 'تم تعيين مهمة جديدة' },
  'task_completed': { title_en: 'Task Completed', title_ar: 'اكتملت المهمة' },
  'task_updated': { title_en: 'Task Updated', title_ar: 'تم تحديث المهمة' },
  'site_visit_assigned': { title_en: 'Site Visit Assigned', title_ar: 'تم تعيين زيارة ميدانية' },
  'site_visit_started': { title_en: 'Site Visit Started', title_ar: 'بدأت الزيارة الميدانية' },
  'site_visit_completed': { title_en: 'Site Visit Completed', title_ar: 'اكتملت الزيارة الميدانية' },
  'cost_submitted': { title_en: 'Cost Submission Received', title_ar: 'تم استلام طلب التكلفة' },
  'cost_approved': { title_en: 'Cost Approved', title_ar: 'تمت الموافقة على التكلفة' },
  'cost_rejected': { title_en: 'Cost Rejected', title_ar: 'تم رفض التكلفة' },
  'payment_processed': { title_en: 'Payment Processed', title_ar: 'تمت معالجة الدفع' },
  'wallet_updated': { title_en: 'Wallet Balance Updated', title_ar: 'تم تحديث رصيد المحفظة' },
  'approval_required': { title_en: 'Approval Required', title_ar: 'مطلوب موافقة' },
  'user_approved': { title_en: 'Account Approved', title_ar: 'تمت الموافقة على الحساب' },
  'user_rejected': { title_en: 'Account Status Updated', title_ar: 'تم تحديث حالة الحساب' },
}

function generateBilingualEmailHtml(
  title_en: string,
  title_ar: string,
  message_en: string,
  message_ar: string,
  recipientName: string,
  actionUrl?: string,
  eventType?: string
): string {
  const priorityColor = eventType?.includes('urgent') || eventType?.includes('rejected') ? '#dc2626' : '#9b87f5'
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>PACT Notification</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid ${priorityColor}; padding-bottom: 20px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Command Center</h1>
          <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">مركز قيادة باكت</p>
        </div>

        <!-- English Section -->
        <div style="margin-bottom: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid ${priorityColor};">
          <h2 style="color: #1a1a2e; margin: 0 0 15px 0; font-size: 18px;">${title_en}</h2>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 10px 0;">Dear ${recipientName},</p>
          <p style="color: #333; font-size: 15px; line-height: 1.6; margin: 0;">${message_en}</p>
        </div>

        <!-- Arabic Section -->
        <div style="margin-bottom: 30px; padding: 20px; background-color: #f0f4f8; border-radius: 8px; border-right: 4px solid ${priorityColor}; direction: rtl; text-align: right;">
          <h2 style="color: #1a1a2e; margin: 0 0 15px 0; font-size: 18px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">${title_ar}</h2>
          <p style="color: #333; font-size: 16px; line-height: 1.8; margin: 0 0 10px 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">عزيزي ${recipientName}،</p>
          <p style="color: #333; font-size: 15px; line-height: 1.8; margin: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">${message_ar}</p>
        </div>

        ${actionUrl ? `
        <!-- Action Button -->
        <div style="text-align: center; margin: 25px 0;">
          <a href="${actionUrl}" style="display: inline-block; padding: 14px 30px; background-color: ${priorityColor}; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            View Details / عرض التفاصيل
          </a>
        </div>
        ` : ''}

        <!-- Footer -->
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated notification from PACT Command Center.<br>
          هذا إشعار آلي من مركز قيادة باكت.<br><br>
          ICT Team - PACT Sudan
        </p>
      </div>
    </body>
    </html>
  `
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
    const template = eventTemplates[event_type] || { title_en: 'Notification', title_ar: 'إشعار' }
    const finalTitleEn = title_en || template.title_en
    const finalTitleAr = title_ar || template.title_ar

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
          if (!existingIds.has(user.id)) {
            recipients.push(user)
          }
        }
      }
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No recipients found', notifications_created: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
      // Create notification record
      const notification = {
        event_type,
        entity_type,
        entity_id,
        priority,
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
        console.error('Failed to insert notification:', insertError)
        continue
      }

      notifications.push(inserted)

      // Send email if configured
      if (nodemailerTransporter && recipient.email && send_email) {
        try {
          const emailHtml = generateBilingualEmailHtml(
            finalTitleEn,
            finalTitleAr,
            message_en,
            message_ar || message_en,
            recipient.full_name || 'Team Member',
            action_url,
            event_type
          )

          const mailOptions = {
            from: `"PACT Command Center" <${smtpUser}>`,
            to: recipient.email,
            subject: `[${priority.toUpperCase()}] ${finalTitleEn} | ${finalTitleAr}`,
            text: `${finalTitleEn}\n\n${message_en}\n\n---\n\n${finalTitleAr}\n\n${message_ar || message_en}`,
            html: emailHtml
          }

          const info = await nodemailerTransporter.sendMail(mailOptions)
          
          await supabase
            .from('notifications')
            .update({ 
              email_sent: true, 
              email_sent_at: new Date().toISOString(),
              status: 'sent'
            })
            .eq('id', inserted.id)

          emailResults.push({ recipient: recipient.email, success: true, messageId: info.messageId })
          console.log(`Email sent to ${recipient.email}`)

        } catch (emailError) {
          const errMsg = (emailError as Error)?.message || 'Unknown email error'
          console.error(`Failed to send email to ${recipient.email}:`, errMsg)
          
          await supabase
            .from('notifications')
            .update({ email_error: errMsg })
            .eq('id', inserted.id)

          emailResults.push({ recipient: recipient.email, success: false, error: errMsg })
        }
      }
    }

    // Log to audit
    try {
      await supabase.from('audit_logs').insert({
        action: 'notification_dispatched',
        entity_type: 'notification',
        entity_name: event_type,
        description: `Dispatched ${notifications.length} notifications for ${event_type}`,
        success: true,
        actor_id: triggered_by,
        actor_name: triggered_by_name,
        metadata: {
          event_type,
          priority,
          recipients_count: notifications.length,
          emails_sent: emailResults.filter(e => e.success).length,
          emails_failed: emailResults.filter(e => !e.success).length
        }
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
