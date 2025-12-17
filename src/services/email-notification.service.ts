/**
 * Email Notification Service
 * Sends email notifications via IONOS SMTP through Supabase Edge Function
 * Integrates with the existing notification system for important alerts
 * 
 * Templates 6-30 from docs/supabase-email-templates.md
 */

import { supabase } from '@/integrations/supabase/client';
import { logEmailSend } from '@/utils/audit-logger';

// Base URL for links in emails
const APP_URL = 'https://app.pactorg.com';

export interface EmailNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  recipientName?: string;
  html?: string;
  text?: string;
  priority?: 'normal' | 'high' | 'urgent';
  cc?: string[];
}

export interface NotificationEmailOptions {
  title: string;
  message: string;
  titleAr?: string;
  messageAr?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  actionUrl?: string;
  actionLabel?: string;
  details?: Array<{ label: string; value: string }>;
  recipientRole?: { en: string; ar: string };
}

/**
 * Helper to detect transient SMTP/network errors that can be retried
 * Normalizes error message to lowercase for case-insensitive matching
 */
const isTransientSmtpError = (errorMsg: string | undefined): boolean => {
  if (!errorMsg) return false;
  const msg = errorMsg.toLowerCase();
  return (
    msg.includes('450') ||       // Rate limit / temporary rejection
    msg.includes('421') ||       // Service temporarily unavailable  
    msg.includes('451') ||       // Temporary local error
    msg.includes('connection') ||// Connection issues
    msg.includes('timeout') ||   // Timeouts
    msg.includes('econnreset') ||// Connection reset
    msg.includes('etimedout') || // Connection timed out
    msg.includes('econnrefused') || // Connection refused
    msg.includes('enotfound') || // DNS lookup failed
    msg.includes('socket') ||    // Socket errors
    msg.includes('network')      // Network errors
  );
};

// Role display names for email footers
const roleDisplayNames: Record<string, { en: string; ar: string }> = {
  'super_admin': { en: 'Super Administrator', ar: 'المسؤول الأعلى' },
  'admin': { en: 'Administrator', ar: 'المسؤول' },
  'fom': { en: 'Field Operations Manager', ar: 'مدير العمليات الميدانية' },
  'supervisor': { en: 'Supervisor', ar: 'المشرف' },
  'coordinator': { en: 'Coordinator', ar: 'المنسق' },
  'data_collector': { en: 'Data Collector', ar: 'جامع البيانات' },
  'finance': { en: 'Finance', ar: 'المالية' },
  'project_manager': { en: 'Project Manager', ar: 'مدير المشروع' },
  'viewer': { en: 'Viewer', ar: 'المشاهد' }
};

// Get role display name
export const getRoleDisplayName = (role: string): { en: string; ar: string } => {
  return roleDisplayNames[role] || { en: role, ar: role };
};

const generateNotificationEmailHTML = (
  recipientName: string,
  options: NotificationEmailOptions
): string => {
  const { title, message, titleAr, messageAr, type = 'info', actionUrl, actionLabel, details, recipientRole } = options;
  
  const typeColors: Record<string, { bg: string; border: string }> = {
    info: { bg: '#e3f2fd', border: '#2196f3' },
    success: { bg: '#e8f5e9', border: '#4caf50' },
    warning: { bg: '#fff3e0', border: '#ff9800' },
    error: { bg: '#ffebee', border: '#f44336' },
  };
  
  const colors = typeColors[type];
  const fullUrl = actionUrl ? (actionUrl.startsWith('http') ? actionUrl : APP_URL + actionUrl) : '';
  
  // Role-based greeting
  const roleEn = recipientRole?.en || '';
  const roleAr = recipientRole?.ar || '';
  const greetingEn = roleEn ? `Dear ${recipientName} (${roleEn}),` : `Hello ${recipientName},`;
  const greetingAr = roleAr ? `عزيزي ${recipientName} (${roleAr})،` : `مرحباً ${recipientName}،`;
  
  // Arabic content (use provided or fallback)
  const titleArText = titleAr || title;
  const messageArText = messageAr || message;
  
  const detailsHtml = details?.length ? `
    <div style="background-color: ${colors.bg}; border-left: 4px solid ${colors.border}; border-radius: 4px; padding: 16px; margin: 20px 0;">
      ${details.map(d => `<p style="margin: 5px 0;"><strong>${d.label}:</strong> ${d.value}</p>`).join('')}
    </div>
  ` : '';
  
  const actionButton = fullUrl ? `
    <div style="text-align: center; margin: 25px 0;">
      <a href="${fullUrl}" 
         style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        ${actionLabel || 'View Details'} | عرض التفاصيل
      </a>
    </div>
  ` : '';
  
  // Role notice for footer
  const roleNoticeEn = roleEn 
    ? `You are receiving this notification as a ${roleEn}.`
    : 'You are receiving this notification as part of the PACT team.';
  const roleNoticeAr = roleAr
    ? `أنت تتلقى هذا الإشعار بصفتك ${roleAr}.`
    : 'أنت تتلقى هذا الإشعار كجزء من فريق باكت.';

  return `
    <!DOCTYPE html>
    <html dir="ltr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} | ${titleArText}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid ${colors.border}; padding-bottom: 20px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Command Center</h1>
          <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">مركز قيادة باكت</p>
        </div>
        
        <!-- English Section -->
        <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
          <p style="color: #333; font-size: 16px; line-height: 1.5;">${greetingEn}</p>
          
          ${detailsHtml || `
          <div style="background-color: ${colors.bg}; border-left: 4px solid ${colors.border}; border-radius: 4px; padding: 16px; margin: 20px 0;">
            <h2 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${title}</h2>
            <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">${message}</p>
          </div>
          `}
          
          ${!detailsHtml ? '' : `<p style="color: #555; font-size: 14px; line-height: 1.5;">${message}</p>`}
        </div>
        
        <!-- Arabic Section -->
        <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
          <p style="color: #333; font-size: 16px; line-height: 1.8;">${greetingAr}</p>
          
          <div style="background-color: ${colors.bg}; border-right: 4px solid ${colors.border}; border-radius: 4px; padding: 16px; margin: 20px 0;">
            <h2 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${titleArText}</h2>
            <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.8;">${messageArText}</p>
          </div>
        </div>
        
        ${actionButton}
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <!-- Role Notice -->
        <p style="color: #666; font-size: 12px; text-align: center; margin-bottom: 15px;">
          ${roleNoticeEn}<br>
          <span style="direction: rtl; display: inline-block;">${roleNoticeAr}</span>
        </p>
        
        <!-- Management Oversight Notice -->
        <div style="background-color: #f8f9fa; border-radius: 6px; padding: 12px; margin-bottom: 20px;">
          <p style="color: #555; font-size: 11px; text-align: center; margin: 0; line-height: 1.6;">
            This notification has been sent to relevant management for oversight and accountability.<br>
            <span style="direction: rtl; display: inline-block;">تم إرسال هذا الإشعار إلى الإدارة المعنية للإشراف والمساءلة.</span>
          </p>
        </div>
        
        <!-- Platform Footer -->
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message from PACT Workflow Platform.<br>
          هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
          ICT Team - PACT Command Center Platform<br>
          فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
        </p>
      </div>
    </body>
    </html>
  `;
};

const generatePlainText = (
  recipientName: string,
  options: NotificationEmailOptions
): string => {
  const { title, message, titleAr, messageAr, actionUrl, actionLabel, details, recipientRole } = options;
  
  // Role-based greeting
  const roleEn = recipientRole?.en || '';
  const roleAr = recipientRole?.ar || '';
  const greetingEn = roleEn ? `Dear ${recipientName} (${roleEn}),` : `Hello ${recipientName},`;
  const greetingAr = roleAr ? `عزيزي ${recipientName} (${roleAr})،` : `مرحباً ${recipientName}،`;
  
  // Arabic content
  const titleArText = titleAr || title;
  const messageArText = messageAr || message;
  
  let text = `${greetingEn}\n\n${title}\n\n`;
  if (details?.length) {
    text += details.map(d => `${d.label}: ${d.value}`).join('\n') + '\n\n';
  }
  text += message;
  if (actionUrl) {
    const fullUrl = actionUrl.startsWith('http') ? actionUrl : APP_URL + actionUrl;
    text += `\n\n${actionLabel || 'View Details'}: ${fullUrl}`;
  }
  
  // Role notice
  const roleNoticeEn = roleEn 
    ? `You are receiving this notification as a ${roleEn}.`
    : 'You are receiving this notification as part of the PACT team.';
  const roleNoticeAr = roleAr
    ? `أنت تتلقى هذا الإشعار بصفتك ${roleAr}.`
    : 'أنت تتلقى هذا الإشعار كجزء من فريق باكت.';
  
  text += `\n\n---\n\n${greetingAr}\n\n${titleArText}\n\n${messageArText}`;
  text += '\n\n---\nPACT Workflow Platform | منصة باكت';
  return text;
};

export const EmailNotificationService = {
  /**
   * Send a custom email
   */
  async sendEmail(options: EmailOptions): Promise<EmailNotificationResult> {
    const { to, subject, recipientName, html, text, priority, cc } = options;
    
    try {
      const priorityPrefix = priority === 'urgent' ? '[URGENT | عاجل] ' : 
                            priority === 'high' ? '[HIGH PRIORITY | أولوية عالية] ' : '';
      const finalSubject = priorityPrefix + subject;
      
      console.log(`[EMAIL] Sending to ${to}: ${finalSubject}${cc?.length ? ` (CC: ${cc.join(', ')})` : ''}`);
      console.log(`[EMAIL] HTML length: ${html?.length || 0}, Text length: ${text?.length || 0}`);

      const payload = {
        to,
        subject: finalSubject,
        html,
        text,
        type: 'notification',
        recipientName: recipientName || 'User',
        priority: priority || 'normal',
        cc: cc || [],
      };
      
      console.log(`[EMAIL] Invoking send-email Edge Function...`);
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: payload,
      });

      if (error) {
        console.error('[EMAIL] Edge Function invocation failed:', error);
        console.error('[EMAIL] Error details:', JSON.stringify(error, null, 2));
        await logEmailSend(to, subject, 'notification', false, undefined, error.message);
        return {
          success: false,
          error: `Edge Function error: ${error.message || 'Unknown error'}. Make sure the send-email Edge Function is deployed to Supabase.`,
        };
      }

      console.log('[EMAIL] Edge Function response:', JSON.stringify(data, null, 2));

      if (data && !data.success) {
        console.error('[EMAIL] Email send failed:', data.error);
        await logEmailSend(to, subject, 'notification', false, undefined, data.error);
        return {
          success: false,
          error: data.error || 'Failed to send email. Check SMTP secrets in Supabase Edge Functions.',
        };
      }

      console.log(`[EMAIL] Sent successfully to ${to}, messageId: ${data?.messageId}`);
      const messageId = data?.messageId || `email-${Date.now()}`;
      await logEmailSend(to, subject, 'notification', true, messageId);
      return {
        success: true,
        messageId,
        deliveredAt: data?.deliveredAt || new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('[EMAIL] Error:', error);
      await logEmailSend(to, subject, 'notification', false, undefined, error.message);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  },

  /**
   * Send a notification-style email with formatted template (compact payload)
   */
  async sendNotification(
    email: string,
    recipientName: string,
    options: NotificationEmailOptions,
    retryCount: number = 0
  ): Promise<EmailNotificationResult> {
    const MAX_RETRIES = 2; // Reduced to avoid excessive delays
    const BASE_DELAY = 3000; // 3 seconds base delay
    
    try {
      const priorityPrefix = options.type === 'error' ? '[URGENT | عاجل] ' : 
                            options.type === 'warning' ? '[HIGH PRIORITY | أولوية عالية] ' : '';
      const subject = priorityPrefix + options.title;
      
      console.log(`[EMAIL] Sending notification to ${email}: ${subject} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject,
          type: 'notification',
          recipientName: recipientName || 'User',
          title_en: options.title,
          title_ar: options.titleAr || options.title,
          message_en: options.message,
          message_ar: options.messageAr || options.message,
          actionUrl: options.actionUrl,
          priority: options.type === 'error' ? 'urgent' : options.type === 'warning' ? 'high' : 'normal',
          details: options.details,
        },
      });

      if (error) {
        console.error('[EMAIL] Edge Function error:', error);
        
        // Only retry on transient errors
        if (isTransientSmtpError(error.message) && retryCount < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retryCount); // Exponential backoff: 3s, 6s
          console.log(`[EMAIL] Transient error detected, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.sendNotification(email, recipientName, options, retryCount + 1);
        }
        
        await logEmailSend(email, subject, 'notification', false, undefined, error.message);
        return { success: false, error: error.message };
      }

      if (data && !data.success) {
        console.error('[EMAIL] Email failed:', data.error);
        
        // Only retry on transient errors
        if (isTransientSmtpError(data.error) && retryCount < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retryCount);
          console.log(`[EMAIL] Transient error in response, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.sendNotification(email, recipientName, options, retryCount + 1);
        }
        
        await logEmailSend(email, subject, 'notification', false, undefined, data.error);
        return { success: false, error: data.error };
      }

      const messageId = data?.messageId || `email-${Date.now()}`;
      console.log(`[EMAIL] Successfully sent to ${email}, messageId: ${messageId}`);
      await logEmailSend(email, subject, 'notification', true, messageId);
      return { success: true, messageId, deliveredAt: data?.deliveredAt };
    } catch (error: any) {
      console.error('[EMAIL] Exception:', error);
      
      // Only retry on network/transient errors, not on deterministic failures
      if (isTransientSmtpError(error.message) && retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, retryCount);
        console.log(`[EMAIL] Network error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendNotification(email, recipientName, options, retryCount + 1);
      }
      
      return { success: false, error: error.message };
    }
  },

  // ============================================
  // TEMPLATE 6: Welcome Email (New User) - Compact Payload
  // ============================================
  async sendWelcomeEmail(
    email: string,
    recipientName: string,
    role: string
  ): Promise<EmailNotificationResult> {
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: 'Welcome to PACT | مرحباً بك في باكت',
          type: 'welcome',
          recipientName,
          title_en: 'Welcome to PACT Command Center',
          title_ar: 'مرحباً بك في مركز قيادة باكت',
          message_en: `Your account has been approved and is now active. You can now log in to access your dashboard and start managing your assignments.`,
          message_ar: `تمت الموافقة على حسابك وأصبح نشطاً الآن. يمكنك الآن تسجيل الدخول للوصول إلى لوحة التحكم الخاصة بك.`,
          actionUrl: '/login',
          details: [{ label: 'Role', value: role }],
        },
      });

      const subject = 'Welcome to PACT | مرحباً بك في باكت';
      
      if (error) {
        console.error('[EMAIL] Welcome email error:', error);
        await logEmailSend(email, subject, 'welcome', false, undefined, error.message);
        return { success: false, error: error.message };
      }
      if (data && !data.success) {
        await logEmailSend(email, subject, 'welcome', false, undefined, data.error);
        return { success: false, error: data.error };
      }
      
      const messageId = data?.messageId || `welcome-${Date.now()}`;
      await logEmailSend(email, subject, 'welcome', true, messageId);
      return { success: true, messageId };
    } catch (error: any) {
      console.error('[EMAIL] Welcome email error:', error);
      await logEmailSend(email, 'Welcome to PACT', 'welcome', false, undefined, error.message);
      return { success: false, error: error.message };
    }
  },

  // ============================================
  // TEMPLATE 6A: New User Registration Notification (to Admins)
  // ============================================
  async sendNewUserRegistrationNotification(
    userName: string,
    userEmail: string,
    userRole: string,
    hubName?: string
  ): Promise<EmailNotificationResult> {
    try {
      // Get all admin emails (admin and superAdmin)
      const { data: admins } = await supabase
        .from('profiles')
        .select('email, full_name')
        .in('role', ['admin', 'superAdmin', 'Admin', 'SuperAdmin', 'super_admin'])
        .eq('status', 'approved');

      if (!admins || admins.length === 0) {
        console.log('[EMAIL] No admins found to notify about new registration');
        return { success: true, messageId: 'no-admins' };
      }

      const subject = 'New User Registration | تسجيل مستخدم جديد';
      const results: EmailNotificationResult[] = [];

      for (const admin of admins) {
        if (!admin.email) continue;
        
        try {
          const { data, error } = await supabase.functions.invoke('send-email', {
            body: {
              to: admin.email,
              subject,
              type: 'notification',
              recipientName: admin.full_name || 'Admin',
              title_en: 'New User Registration - Approval Required',
              title_ar: 'تسجيل مستخدم جديد - يتطلب الموافقة',
              message_en: `A new user "${userName}" (${userEmail}) has registered as ${userRole}${hubName ? ` in ${hubName}` : ''}. Please review and approve their account.`,
              message_ar: `قام المستخدم "${userName}" (${userEmail}) بالتسجيل كـ ${userRole}${hubName ? ` في ${hubName}` : ''}. يرجى مراجعة حسابه والموافقة عليه.`,
              actionUrl: '/users?tab=pending',
              details: [
                { label: 'Name', value: userName },
                { label: 'Email', value: userEmail },
                { label: 'Role', value: userRole },
                ...(hubName ? [{ label: 'Hub', value: hubName }] : [])
              ],
            },
          });

          if (error) {
            console.error(`[EMAIL] Failed to notify admin ${admin.email}:`, error);
            await logEmailSend(admin.email, subject, 'notification', false, undefined, error.message);
            results.push({ success: false, error: error.message });
          } else if (data && !data.success) {
            await logEmailSend(admin.email, subject, 'notification', false, undefined, data.error);
            results.push({ success: false, error: data.error });
          } else {
            const messageId = data?.messageId || `newuser-${Date.now()}`;
            await logEmailSend(admin.email, subject, 'notification', true, messageId);
            results.push({ success: true, messageId });
          }

          // Add small delay between emails to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err: any) {
          console.error(`[EMAIL] Error notifying admin ${admin.email}:`, err);
          results.push({ success: false, error: err.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`[EMAIL] New user registration notification: ${successCount}/${admins.length} admins notified`);
      
      return { 
        success: successCount > 0, 
        messageId: `newuser-batch-${Date.now()}` 
      };
    } catch (error: any) {
      console.error('[EMAIL] New user registration notification error:', error);
      return { success: false, error: error.message };
    }
  },

  // ============================================
  // TEMPLATE 6B: MMP Forwarded to FOM - Compact Payload
  // ============================================
  async sendMMPForwardedToFOM(
    email: string,
    recipientName: string,
    mmpName: string,
    forwarderName: string,
    mmpId: string,
    isRecipientFOM: boolean = true,
    recipientRole?: { en: string; ar: string },
    retryCount: number = 0,
    cc?: string[]
  ): Promise<EmailNotificationResult> {
    const MAX_RETRIES = 2;
    const BASE_DELAY = 3000;
    
    const roleEn = recipientRole?.en || 'Field Operations Manager';
    const roleAr = recipientRole?.ar || 'مدير العمليات الميدانية';
    
    const titleEn = isRecipientFOM 
      ? `MMP "${mmpName}" Forwarded - Action Required` 
      : `MMP "${mmpName}" Forwarded to FOM`;
    const titleAr = isRecipientFOM 
      ? `خطة "${mmpName}" - إجراء مطلوب` 
      : `خطة "${mmpName}" إلى مدير العمليات الميدانية`;
    
    const messageEn = isRecipientFOM 
      ? `MMP "${mmpName}" forwarded to you for permits by ${forwarderName}. Please attach necessary permits.`
      : `MMP "${mmpName}" forwarded to FOM for permits by ${forwarderName}.`;
    
    const messageAr = isRecipientFOM
      ? `خطة "${mmpName}" أُرسلت إليك لإرفاق التصاريح بواسطة ${forwarderName}. يرجى إرفاق التصاريح.`
      : `خطة "${mmpName}" أُرسلت إلى مدير العمليات الميدانية بواسطة ${forwarderName}.`;

    try {
      console.log(`[EMAIL] Sending MMP forward email to ${email} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
      console.log(`[EMAIL] FOM Email Details: to=${email}, mmpName=${mmpName}, forwarder=${forwarderName}, cc=${cc?.join(',') || 'none'}`);
      
      const requestBody = {
        to: email,
        subject: `${titleEn} | ${titleAr}`,
        type: 'mmp',
        recipientName,
        title_en: titleEn,
        title_ar: titleAr,
        message_en: messageEn,
        message_ar: messageAr,
        actionUrl: `/mmp/${mmpId}`,
        priority: 'high',
        cc: cc, // CC Super Admin only
        details: [
          { label: 'MMP', value: mmpName },
          { label: 'By', value: forwarderName },
          ...(isRecipientFOM ? [{ label: 'Action', value: 'Attach Permits' }] : []),
        ],
      };
      
      console.log(`[EMAIL] Invoking Supabase Edge Function send-email with body:`, JSON.stringify(requestBody, null, 2));
      
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: requestBody,
      });

      console.log(`[EMAIL] Edge Function response: data=${JSON.stringify(data)}, error=${JSON.stringify(error)}`);

      const subject = `${titleEn} | ${titleAr}`;
      
      if (error) {
        console.error('[EMAIL] MMP forward email error:', error);
        
        if (isTransientSmtpError(error.message) && retryCount < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retryCount);
          console.log(`[EMAIL] Transient error on MMP email, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.sendMMPForwardedToFOM(email, recipientName, mmpName, forwarderName, mmpId, isRecipientFOM, recipientRole, retryCount + 1, cc);
        }
        
        await logEmailSend(email, subject, 'mmp', false, undefined, error.message);
        return { success: false, error: error.message };
      }
      
      if (data && !data.success) {
        if (isTransientSmtpError(data.error) && retryCount < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retryCount);
          console.log(`[EMAIL] Transient error in MMP response, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.sendMMPForwardedToFOM(email, recipientName, mmpName, forwarderName, mmpId, isRecipientFOM, recipientRole, retryCount + 1, cc);
        }
        
        await logEmailSend(email, subject, 'mmp', false, undefined, data.error);
        return { success: false, error: data.error };
      }
      
      const messageId = data?.messageId || `mmp-fom-${Date.now()}`;
      console.log(`[EMAIL] MMP forward email sent successfully to ${email}`);
      await logEmailSend(email, subject, 'mmp', true, messageId);
      return { success: true, messageId };
    } catch (error: any) {
      console.error('[EMAIL] MMP forward email exception:', error);
      
      if (isTransientSmtpError(error.message) && retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, retryCount);
        console.log(`[EMAIL] Network error on MMP email, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendMMPForwardedToFOM(email, recipientName, mmpName, forwarderName, mmpId, isRecipientFOM, recipientRole, retryCount + 1, cc);
      }
      
      await logEmailSend(email, `MMP Forwarded to FOM`, 'mmp', false, undefined, error.message);
      return { success: false, error: error.message };
    }
  },

  // ============================================
  // TEMPLATE 6C: MMP Forwarded to Coordinators - Bilingual
  // ============================================
  async sendMMPForwardedToCoordinators(
    email: string,
    recipientName: string,
    mmpName: string,
    forwarderName: string,
    coordinatorCount: number,
    mmpId?: string,
    recipientRole?: { en: string; ar: string },
    cc?: string[]
  ): Promise<EmailNotificationResult> {
    const viewMmpUrl = mmpId ? `${APP_URL}/mmp/${mmpId}` : `${APP_URL}/mmp`;
    
    // Personalized greeting based on role
    const roleEn = recipientRole?.en || 'Coordinator';
    const roleAr = recipientRole?.ar || 'المنسق';
    
    // Personalized subject with name, role, and MMP name
    const titleEn = `MMP "${mmpName}" Forwarded to ${recipientName} - ${roleEn}`;
    const titleAr = `خطة "${mmpName}" إلى ${recipientName} - ${roleAr}`;
    
    const greetingEn = `Dear ${recipientName} (${roleEn}),`;
    const greetingAr = `عزيزي ${recipientName} (${roleAr})،`;
    
    const messageEn = `The Monthly Monitoring Plan "${mmpName}" has been forwarded to ${coordinatorCount} Coordinator(s) for site assignment and data collection by ${forwarderName}. Please monitor progress and ensure timely completion.`;
    const messageAr = `تم إرسال خطة المراقبة الشهرية "${mmpName}" إلى ${coordinatorCount} منسق(ين) لتوزيع المواقع وجمع البيانات بواسطة ${forwarderName}. يرجى متابعة التقدم وضمان الإنجاز في الوقت المحدد.`;

    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${titleEn} | ${titleAr}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
          </div>
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">${greetingEn}</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">${messageEn}</p>
            
            <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>MMP Name:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Forwarded By:</strong> ${forwarderName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Coordinators Assigned:</strong> ${coordinatorCount}</p>
            </div>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">${greetingAr}</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">${messageAr}</p>
            
            <div style="background-color: #fff3e0; border-right: 4px solid #ff9800; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>اسم خطة المراقبة الشهرية:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>تم الإرسال بواسطة:</strong> ${forwarderName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>عدد المنسقين:</strong> ${coordinatorCount}</p>
            </div>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${viewMmpUrl}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              View MMP | عرض خطة المراقبة الشهرية
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #666; font-size: 12px; text-align: center; line-height: 1.6;">
            This notification has been sent to relevant management including Administrators, Field Operations Managers, and Supervisors for oversight and accountability.
          </p>
          <p dir="rtl" style="color: #666; font-size: 12px; text-align: center; line-height: 1.8;">
            تم إرسال هذا الإشعار إلى الإدارة المعنية بما في ذلك المسؤولين ومديري العمليات الميدانية والمشرفين للإشراف والمساءلة.
          </p>
          
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
            This is an automated message from PACT Workflow Platform.<br>
            هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
            ICT Team - PACT Command Center Platform<br>
            فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
          </p>
        </div>
      </body>
      </html>
    `;
    
    const text = `${greetingEn}

${messageEn}

MMP Name: ${mmpName}
Forwarded By: ${forwarderName}
Coordinators Assigned: ${coordinatorCount}

View MMP: ${viewMmpUrl}

---

${greetingAr}

${messageAr}

اسم خطة المراقبة الشهرية: ${mmpName}
تم الإرسال بواسطة: ${forwarderName}
عدد المنسقين: ${coordinatorCount}

---
PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `${titleEn} | ${titleAr}`,
      recipientName,
      html,
      text,
      cc: cc, // CC Super Admin only
    });
  },

  // ============================================
  // TEMPLATE 6D: Site Verified by Coordinator - Bilingual
  // ============================================
  async sendSiteVerifiedByCoordinator(
    email: string,
    recipientName: string,
    siteName: string,
    mmpName: string,
    coordinatorName: string,
    siteId?: string,
    recipientRole?: { en: string; ar: string },
    cc?: string[]
  ): Promise<EmailNotificationResult> {
    const viewSiteUrl = siteId ? `${APP_URL}/mmp?site=${siteId}` : `${APP_URL}/mmp`;
    
    // Personalized greeting based on role
    const roleEn = recipientRole?.en || 'Team Member';
    const roleAr = recipientRole?.ar || 'عضو الفريق';
    
    // Personalized subject with site name, recipient name and role
    const titleEn = `Site "${siteName}" Verified - ${recipientName} - ${roleEn}`;
    const titleAr = `تم التحقق من "${siteName}" - ${recipientName} - ${roleAr}`;
    
    const greetingEn = `Dear ${recipientName} (${roleEn}),`;
    const greetingAr = `عزيزي ${recipientName} (${roleAr})،`;
    
    const messageEn = `The site "${siteName}" from MMP "${mmpName}" has been verified by Coordinator ${coordinatorName}. The site is now ready for FOM review and approval.`;
    const messageAr = `تم التحقق من الموقع "${siteName}" من خطة المراقبة الشهرية "${mmpName}" بواسطة المنسق ${coordinatorName}. الموقع جاهز الآن لمراجعة وموافقة مدير العمليات الميدانية.`;

    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${titleEn} | ${titleAr}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
          </div>
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">${greetingEn}</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">${messageEn}</p>
            
            <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Site Name:</strong> ${siteName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>MMP Name:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Verified By:</strong> ${coordinatorName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Status:</strong> <span style="color: #4caf50; font-weight: bold;">Verified</span></p>
            </div>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">${greetingAr}</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">${messageAr}</p>
            
            <div style="background-color: #e8f5e9; border-right: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>اسم الموقع:</strong> ${siteName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>اسم خطة المراقبة الشهرية:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>تم التحقق بواسطة:</strong> ${coordinatorName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>الحالة:</strong> <span style="color: #4caf50; font-weight: bold;">تم التحقق</span></p>
            </div>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${viewSiteUrl}" style="display: inline-block; padding: 14px 30px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              View Site | عرض الموقع
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <!-- Management Oversight Notice -->
          <div style="background-color: #f0f4f8; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
            <p style="color: #555; font-size: 11px; margin: 0 0 8px 0; font-weight: 600;">
              Management Oversight Notice:
            </p>
            <p style="color: #666; font-size: 11px; margin: 0; line-height: 1.5;">
              This notification is sent to Hub Supervisors, Field Operations Managers, Administrators, and Super Administrators for transparency and accountability purposes.
            </p>
            <p dir="rtl" style="color: #666; font-size: 11px; margin: 10px 0 0 0; line-height: 1.8; text-align: right;">
              <span style="font-weight: 600;">إشعار الرقابة الإدارية:</span><br>
              يتم إرسال هذا الإشعار إلى مشرفي المحاور ومديري العمليات الميدانية والمسؤولين والمسؤولين الأعلى لأغراض الشفافية والمساءلة.
            </p>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from PACT Workflow Platform.<br>
            هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
            ICT Team - PACT Command Center Platform<br>
            فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
          </p>
        </div>
      </body>
      </html>
    `;
    
    const text = `${greetingEn}

${messageEn}

Site Name: ${siteName}
MMP Name: ${mmpName}
Verified By: ${coordinatorName}
Status: Verified

View Site: ${viewSiteUrl}

---

${greetingAr}

${messageAr}

اسم الموقع: ${siteName}
اسم خطة المراقبة الشهرية: ${mmpName}
تم التحقق بواسطة: ${coordinatorName}
الحالة: تم التحقق

---
PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `${titleEn} | ${titleAr}`,
      recipientName,
      html,
      text,
      cc: cc, // CC Super Admin only
    });
  },

  // ============================================
  // TEMPLATE 6E: Sites Forwarded TO Coordinator - Direct Notification
  // ============================================
  async sendSitesForwardedToCoordinator(
    email: string,
    coordinatorName: string,
    siteNames: string[],
    mmpName: string,
    forwarderName: string,
    locationInfo: string,
    mmpId?: string
  ): Promise<EmailNotificationResult> {
    const viewMmpUrl = mmpId ? `${APP_URL}/mmp/${mmpId}` : `${APP_URL}/coordinator/sites`;
    const siteCount = siteNames.length;
    const siteList = siteNames.slice(0, 5).join(', ') + (siteNames.length > 5 ? ` and ${siteNames.length - 5} more` : '');
    
    const titleEn = `${siteCount} Site(s) Assigned to You - Action Required`;
    const titleAr = `تم تعيين ${siteCount} موقع(ًا) لك - مطلوب إجراء`;
    
    const messageEn = `You have been assigned ${siteCount} site(s) for verification from the Monthly Monitoring Plan "${mmpName}". Please review and verify these sites at your earliest convenience.`;
    const messageAr = `تم تعيينك لـ ${siteCount} موقع(ًا) للتحقق من خطة المراقبة الشهرية "${mmpName}". يرجى مراجعة هذه المواقع والتحقق منها في أقرب وقت ممكن.`;

    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${titleEn} | ${titleAr}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Command Center</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">مركز قيادة باكت</p>
          </div>
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Dear ${coordinatorName},</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">${messageEn}</p>
            
            <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Sites Assigned:</strong> ${siteCount}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Sites:</strong> ${siteList}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Location:</strong> ${locationInfo}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>MMP:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Assigned By:</strong> ${forwarderName}</p>
            </div>
            
            <p style="color: #d32f2f; font-size: 14px; font-weight: 600;">Action Required: Please verify these sites as soon as possible.</p>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">عزيزي ${coordinatorName}،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">${messageAr}</p>
            
            <div style="background-color: #e3f2fd; border-right: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>المواقع المعينة:</strong> ${siteCount}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>المواقع:</strong> ${siteList}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>الموقع:</strong> ${locationInfo}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>خطة المراقبة الشهرية:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>تم التعيين بواسطة:</strong> ${forwarderName}</p>
            </div>
            
            <p style="color: #d32f2f; font-size: 14px; font-weight: 600;">مطلوب إجراء: يرجى التحقق من هذه المواقع في أقرب وقت ممكن.</p>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${viewMmpUrl}" style="display: inline-block; padding: 14px 30px; background-color: #2196f3; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              View My Sites | عرض مواقعي
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from PACT Command Center.<br>
            هذه رسالة آلية من مركز قيادة باكت.<br>
            ICT Team | فريق تكنولوجيا المعلومات
          </p>
        </div>
      </body>
      </html>
    `;
    
    const text = `Dear ${coordinatorName},

${messageEn}

Sites Assigned: ${siteCount}
Sites: ${siteList}
Location: ${locationInfo}
MMP: ${mmpName}
Assigned By: ${forwarderName}

Action Required: Please verify these sites as soon as possible.

View Sites: ${viewMmpUrl}

---

عزيزي ${coordinatorName}،

${messageAr}

المواقع المعينة: ${siteCount}
الموقع: ${locationInfo}
خطة المراقبة الشهرية: ${mmpName}
تم التعيين بواسطة: ${forwarderName}

---
PACT Command Center | مركز قيادة باكت`;

    return this.sendEmail({
      to: email,
      subject: `${titleEn} | ${titleAr}`,
      recipientName: coordinatorName,
      html,
      text,
    });
  },

  // ============================================
  // TEMPLATE 6B: Site Dispatched to Data Collector
  // ============================================
  async sendSiteDispatchedToCollector(
    email: string,
    collectorName: string,
    siteNames: string[],
    location: string,
    mmpName: string,
    assignedBy: string,
    totalBudget: number,
    siteId?: string
  ): Promise<EmailNotificationResult> {
    const viewSitesUrl = siteId ? `${APP_URL}/mmp?entry=${siteId}` : `${APP_URL}/my-sites`;
    const siteCount = siteNames.length;
    const siteList = siteNames.slice(0, 5).join(', ') + (siteNames.length > 5 ? ` and ${siteNames.length - 5} more` : '');
    
    const titleEn = `${siteCount} Site(s) Assigned to You - Action Required`;
    const titleAr = `تم تعيين ${siteCount} موقع(ًا) لك - مطلوب إجراء`;
    
    const messageEn = `You have been assigned ${siteCount} site(s) for data collection. Please review the site details and complete your visits according to the schedule.`;
    const messageAr = `تم تعيينك لـ ${siteCount} موقع(ًا) لجمع البيانات. يرجى مراجعة تفاصيل الموقع وإكمال زياراتك وفقًا للجدول الزمني.`;

    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${titleEn} | ${titleAr}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Command Center</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">مركز قيادة باكت</p>
          </div>
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Dear ${collectorName},</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">${messageEn}</p>
            
            <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Sites Assigned:</strong> ${siteCount}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Sites:</strong> ${siteList}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Location:</strong> ${location}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>MMP:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Transport Budget:</strong> ${totalBudget.toLocaleString()} SDG</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Assigned By:</strong> ${assignedBy}</p>
            </div>
            
            <p style="color: #1976d2; font-size: 14px; font-weight: 600;">Please complete your site visits and submit your reports on time.</p>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">عزيزي ${collectorName}،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">${messageAr}</p>
            
            <div style="background-color: #e8f5e9; border-right: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>المواقع المعينة:</strong> ${siteCount}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>المواقع:</strong> ${siteList}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>الموقع:</strong> ${location}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>خطة المراقبة الشهرية:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>ميزانية النقل:</strong> ${totalBudget.toLocaleString()} جنيه سوداني</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>تم التعيين بواسطة:</strong> ${assignedBy}</p>
            </div>
            
            <p style="color: #1976d2; font-size: 14px; font-weight: 600;">يرجى إكمال زيارات المواقع وتقديم تقاريرك في الوقت المحدد.</p>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${viewSitesUrl}" style="display: inline-block; padding: 14px 30px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              View My Sites | عرض مواقعي
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from PACT Command Center.<br>
            هذه رسالة آلية من مركز قيادة باكت.<br>
            ICT Team | فريق تكنولوجيا المعلومات
          </p>
        </div>
      </body>
      </html>
    `;

    const text = `Dear ${collectorName},

${messageEn}

Sites Assigned: ${siteCount}
Sites: ${siteList}
Location: ${location}
MMP: ${mmpName}
Transport Budget: ${totalBudget.toLocaleString()} SDG
Assigned By: ${assignedBy}

View Sites: ${viewSitesUrl}

---

عزيزي ${collectorName}،

${messageAr}

المواقع المعينة: ${siteCount}
الموقع: ${location}
خطة المراقبة الشهرية: ${mmpName}
ميزانية النقل: ${totalBudget.toLocaleString()} جنيه سوداني
تم التعيين بواسطة: ${assignedBy}

---
PACT Command Center | مركز قيادة باكت`;

    return this.sendEmail({
      to: email,
      subject: `${titleEn} | ${titleAr}`,
      recipientName: collectorName,
      html,
      text,
    });
  },

  // ============================================
  // TEMPLATE 7: Site Assignment
  // ============================================
  async sendSiteAssignment(
    email: string,
    recipientName: string,
    siteName: string,
    location: string,
    mmpName: string,
    siteUrl?: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `New Site Assignment - ${siteName}`,
      message: 'You have been assigned to visit this site. Please review the site details and confirm your assignment within 48 hours.',
      type: 'info',
      details: [
        { label: 'Site', value: siteName },
        { label: 'Location', value: location },
        { label: 'MMP', value: mmpName },
      ],
      actionUrl: siteUrl || '/mmp',
      actionLabel: 'View Assignment',
    });
  },

  // ============================================
  // TEMPLATE 8: Assignment Confirmation Reminder
  // ============================================
  async sendAssignmentReminder(
    email: string,
    recipientName: string,
    siteName: string,
    deadline: string,
    timeRemaining: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Reminder: Confirm your site assignment - ${siteName}`,
      message: 'Your assignment is pending confirmation. If you do not confirm within the deadline, the site may be reassigned to another team member.',
      type: 'warning',
      details: [
        { label: 'Site', value: siteName },
        { label: 'Deadline', value: deadline },
        { label: 'Time Remaining', value: timeRemaining },
      ],
      actionUrl: '/mmp',
      actionLabel: 'Confirm Now',
    });
  },

  // ============================================
  // TEMPLATE 9: Site Visit Completed
  // ============================================
  async sendSiteVisitCompleted(
    email: string,
    recipientName: string,
    siteName: string,
    collectorName: string,
    completionTime: string,
    gpsCoordinates?: string
  ): Promise<EmailNotificationResult> {
    const details = [
      { label: 'Site', value: siteName },
      { label: 'Completed By', value: collectorName },
      { label: 'Completion Time', value: completionTime },
    ];
    if (gpsCoordinates) {
      details.push({ label: 'GPS Coordinates', value: gpsCoordinates });
    }
    
    return this.sendNotification(email, recipientName, {
      title: `Site Visit Completed - ${siteName}`,
      message: 'The site visit report is now available for review.',
      type: 'success',
      details,
      actionUrl: '/mmp',
      actionLabel: 'View Report',
    });
  },

  // ============================================
  // TEMPLATE 10: Approval Request
  // ============================================
  async sendApprovalRequest(
    email: string,
    recipientName: string,
    itemType: string,
    itemName: string,
    requesterName: string,
    amount?: string,
    approvalUrl?: string
  ): Promise<EmailNotificationResult> {
    const details = [
      { label: 'Type', value: itemType },
      { label: 'Item', value: itemName },
      { label: 'Requested By', value: requesterName },
    ];
    if (amount) {
      details.push({ label: 'Amount', value: amount });
    }
    
    return this.sendNotification(email, recipientName, {
      title: `Approval Required: ${itemType} - ${itemName}`,
      message: 'This item requires your review and approval. Please take action at your earliest convenience.',
      type: 'warning',
      details,
      actionUrl: approvalUrl || '/approvals',
      actionLabel: 'Review Now',
    });
  },

  // ============================================
  // TEMPLATE 11: Approval - Approved
  // ============================================
  async sendApprovalApproved(
    email: string,
    recipientName: string,
    itemType: string,
    itemName: string,
    approverName: string,
    approvalDate: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Approved: ${itemType} - ${itemName}`,
      message: 'Your request has been approved and is now being processed.',
      type: 'success',
      details: [
        { label: 'Status', value: 'Approved' },
        { label: 'Type', value: itemType },
        { label: 'Item', value: itemName },
        { label: 'Approved By', value: approverName },
        { label: 'Approved On', value: approvalDate },
      ],
      actionUrl: '/dashboard',
      actionLabel: 'View Details',
    });
  },

  // ============================================
  // TEMPLATE 12: Approval - Rejected
  // ============================================
  async sendApprovalRejected(
    email: string,
    recipientName: string,
    itemType: string,
    itemName: string,
    approverName: string,
    rejectionReason: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Rejected: ${itemType} - ${itemName}`,
      message: 'Please review the reason for rejection and contact your administrator if you have questions.',
      type: 'error',
      details: [
        { label: 'Status', value: 'Rejected' },
        { label: 'Type', value: itemType },
        { label: 'Item', value: itemName },
        { label: 'Rejected By', value: approverName },
        { label: 'Reason', value: rejectionReason },
      ],
      actionUrl: '/dashboard',
      actionLabel: 'View Details',
    });
  },

  // ============================================
  // TEMPLATE 13: Withdrawal Request Submitted
  // ============================================
  async sendWithdrawalSubmitted(
    email: string,
    recipientName: string,
    amount: number,
    requestId: string,
    submissionDate: string,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Withdrawal Request Submitted - ${currency} ${amount.toLocaleString()}`,
      message: 'Your withdrawal request has been submitted and is awaiting approval. You will receive a notification once it has been processed.',
      type: 'info',
      details: [
        { label: 'Amount', value: `${currency} ${amount.toLocaleString()}` },
        { label: 'Request ID', value: requestId },
        { label: 'Submitted', value: submissionDate },
        { label: 'Status', value: 'Pending Approval' },
      ],
      actionUrl: '/wallet',
      actionLabel: 'View Wallet',
    });
  },

  // ============================================
  // TEMPLATE 14: Withdrawal Approved
  // ============================================
  async sendWithdrawalApproved(
    email: string,
    recipientName: string,
    amount: number,
    requestId: string,
    approverName: string,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Withdrawal Approved - ${currency} ${amount.toLocaleString()}`,
      message: 'Your withdrawal request has been approved and is being processed. Funds will be transferred shortly.',
      type: 'success',
      details: [
        { label: 'Amount', value: `${currency} ${amount.toLocaleString()}` },
        { label: 'Request ID', value: requestId },
        { label: 'Approved By', value: approverName },
        { label: 'Status', value: 'Approved - Processing' },
      ],
      actionUrl: '/wallet',
      actionLabel: 'View Wallet',
    });
  },

  // ============================================
  // TEMPLATE 15: Withdrawal Rejected
  // ============================================
  async sendWithdrawalRejected(
    email: string,
    recipientName: string,
    amount: number,
    requestId: string,
    approverName: string,
    rejectionReason: string,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Withdrawal Rejected - ${currency} ${amount.toLocaleString()}`,
      message: 'Your withdrawal request has been rejected. Please contact your administrator for more details.',
      type: 'error',
      details: [
        { label: 'Amount', value: `${currency} ${amount.toLocaleString()}` },
        { label: 'Request ID', value: requestId },
        { label: 'Rejected By', value: approverName },
        { label: 'Reason', value: rejectionReason },
      ],
      actionUrl: '/wallet',
      actionLabel: 'View Wallet',
    });
  },

  // ============================================
  // TEMPLATE 16: Cost Submission Received
  // ============================================
  async sendCostSubmissionReceived(
    email: string,
    recipientName: string,
    category: string,
    amount: number,
    siteName: string,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Cost Submission Received - ${category}`,
      message: 'Your cost submission has been received and is pending review.',
      type: 'info',
      details: [
        { label: 'Category', value: category },
        { label: 'Amount', value: `${currency} ${amount.toLocaleString()}` },
        { label: 'Site', value: siteName },
        { label: 'Status', value: 'Pending Review' },
      ],
      actionUrl: '/costs',
      actionLabel: 'View Submission',
    });
  },

  // ============================================
  // TEMPLATE 17: Budget Alert (80%)
  // ============================================
  async sendBudgetAlert(
    email: string,
    recipientName: string,
    projectName: string,
    percentUsed: number,
    totalBudget: number,
    remainingBudget: number,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Budget Alert: ${projectName} at ${percentUsed}%`,
      message: 'The budget for this project is reaching its limit. Please review and take action if necessary.',
      type: 'warning',
      details: [
        { label: 'Project', value: projectName },
        { label: 'Budget Used', value: `${percentUsed}%` },
        { label: 'Total Budget', value: `${currency} ${totalBudget.toLocaleString()}` },
        { label: 'Remaining', value: `${currency} ${remainingBudget.toLocaleString()}` },
      ],
      actionUrl: '/budget',
      actionLabel: 'View Budget',
    });
  },

  // ============================================
  // TEMPLATE 18: Budget Exceeded
  // ============================================
  async sendBudgetExceeded(
    email: string,
    recipientName: string,
    projectName: string,
    percentUsed: number,
    overBudgetAmount: number,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `URGENT: Budget Exceeded - ${projectName}`,
      message: 'The budget for this project has been exceeded. Immediate attention is required. Further spending may be restricted.',
      type: 'error',
      details: [
        { label: 'Project', value: projectName },
        { label: 'Budget Used', value: `${percentUsed}%` },
        { label: 'Over Budget', value: `${currency} ${overBudgetAmount.toLocaleString()}` },
        { label: 'Status', value: 'Requires Immediate Attention' },
      ],
      actionUrl: '/budget',
      actionLabel: 'View Budget',
    });
  },

  // ============================================
  // TEMPLATE 19: MMP Upload Success
  // ============================================
  async sendMMPUploadSuccess(
    email: string,
    recipientName: string,
    mmpName: string,
    projectName: string,
    totalSites: number,
    uploadDate: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `MMP Upload Successful - ${mmpName}`,
      message: 'The MMP file has been uploaded successfully and sites are now available for assignment.',
      type: 'success',
      details: [
        { label: 'MMP Name', value: mmpName },
        { label: 'Project', value: projectName },
        { label: 'Total Sites', value: totalSites.toString() },
        { label: 'Upload Date', value: uploadDate },
      ],
      actionUrl: '/mmp',
      actionLabel: 'View MMP',
    });
  },

  // ============================================
  // TEMPLATE 20: Signature Request
  // ============================================
  async sendSignatureRequest(
    email: string,
    recipientName: string,
    documentName: string,
    requesterName: string,
    dueDate: string,
    signatureType: string,
    signatureUrl?: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Signature Required: ${documentName}`,
      message: 'Your signature is required on this document. Please review and sign at your earliest convenience.',
      type: 'warning',
      details: [
        { label: 'Document', value: documentName },
        { label: 'Requested By', value: requesterName },
        { label: 'Due Date', value: dueDate },
        { label: 'Type', value: signatureType },
      ],
      actionUrl: signatureUrl || '/signatures',
      actionLabel: 'Sign Document',
    });
  },

  // ============================================
  // TEMPLATE 21: Signature Completed
  // ============================================
  async sendSignatureCompleted(
    email: string,
    recipientName: string,
    documentName: string,
    signerName: string,
    signatureDate: string,
    verificationHash: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Document Signed: ${documentName}`,
      message: 'The document has been signed and verified. A copy has been stored in the system.',
      type: 'success',
      details: [
        { label: 'Document', value: documentName },
        { label: 'Signed By', value: signerName },
        { label: 'Signed On', value: signatureDate },
        { label: 'Verification Hash', value: verificationHash.substring(0, 16) + '...' },
      ],
      actionUrl: '/documents',
      actionLabel: 'View Document',
    });
  },

  // ============================================
  // TEMPLATE 22: OTP Verification Code
  // ============================================
  async sendOTPCode(
    email: string,
    recipientName: string,
    otpCode: string,
    expiryMinutes: number = 10
  ): Promise<EmailNotificationResult> {
    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Code | رمز التحقق</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Command Center</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">مركز قيادة باكت</p>
          </div>
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello ${recipientName},</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Your verification code is:</p>
            
            <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 10px 0; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${otpCode}</p>
              <p style="margin: 0; font-size: 12px; color: #999;">This code expires in ${expiryMinutes} minutes</p>
            </div>
            
            <p style="color: #555; font-size: 14px; line-height: 1.5;">Enter this code to complete your verification. Do not share this code with anyone.</p>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">مرحباً ${recipientName}،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">رمز التحقق الخاص بك هو:</p>
            
            <div style="background-color: #e3f2fd; border-right: 4px solid #2196f3; border-radius: 4px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 10px 0; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${otpCode}</p>
              <p style="margin: 0; font-size: 12px; color: #999;">ينتهي هذا الرمز خلال ${expiryMinutes} دقائق</p>
            </div>
            
            <p style="color: #555; font-size: 14px; line-height: 1.8;">أدخل هذا الرمز لإكمال التحقق. لا تشارك هذا الرمز مع أي شخص.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from PACT Workflow Platform.<br>
            هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
            ICT Team - PACT Command Center Platform<br>
            فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
          </p>
        </div>
      </body>
      </html>
    `;
    
    const text = `Hello ${recipientName},

Your verification code is: ${otpCode}
This code expires in ${expiryMinutes} minutes.

---

مرحباً ${recipientName}،
رمز التحقق: ${otpCode}
ينتهي خلال ${expiryMinutes} دقائق.

---
PACT Workflow Platform`;
    
    return this.sendEmail({
      to: email,
      subject: `Your PACT Verification Code | رمز التحقق: ${otpCode}`,
      recipientName,
      html,
      text,
    });
  },

  // ============================================
  // TEMPLATE 23: Role Assignment Changed
  // ============================================
  async sendRoleChanged(
    email: string,
    recipientName: string,
    previousRole: string,
    newRole: string,
    changedBy: string,
    effectiveDate: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: 'Your Role Has Been Updated - PACT Platform',
      message: 'Your role and permissions have been updated. Please log out and log back in to see your updated access.',
      type: 'info',
      details: [
        { label: 'Previous Role', value: previousRole },
        { label: 'New Role', value: newRole },
        { label: 'Changed By', value: changedBy },
        { label: 'Effective Date', value: effectiveDate },
      ],
      actionUrl: '/dashboard',
      actionLabel: 'Go to Dashboard',
    });
  },

  // ============================================
  // TEMPLATE 24: Account Deactivated
  // ============================================
  async sendAccountDeactivated(
    email: string,
    recipientName: string,
    deactivatedBy: string,
    deactivationDate: string,
    reason: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: 'Account Deactivated - PACT Platform',
      message: 'Your access to PACT Workflow Platform has been deactivated. If you believe this is an error, please contact your administrator.',
      type: 'error',
      details: [
        { label: 'Status', value: 'Account Deactivated' },
        { label: 'Deactivated By', value: deactivatedBy },
        { label: 'Date', value: deactivationDate },
        { label: 'Reason', value: reason },
      ],
    });
  },

  // ============================================
  // TEMPLATE 25: Account Reactivated
  // ============================================
  async sendAccountReactivated(
    email: string,
    recipientName: string,
    reactivatedBy: string,
    reactivationDate: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: 'Account Reactivated - PACT Platform',
      message: 'Your access to PACT Workflow Platform has been restored. You can now log in and access your dashboard.',
      type: 'success',
      details: [
        { label: 'Status', value: 'Account Active' },
        { label: 'Reactivated By', value: reactivatedBy },
        { label: 'Date', value: reactivationDate },
      ],
      actionUrl: '/login',
      actionLabel: 'Log In Now',
    });
  },

  // ============================================
  // TEMPLATE 26: Project Assignment
  // ============================================
  async sendProjectAssignment(
    email: string,
    recipientName: string,
    projectName: string,
    projectRole: string,
    startDate: string,
    assignedBy: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `You've Been Assigned to Project: ${projectName}`,
      message: 'You have been assigned to this project. Please review the project details and your responsibilities.',
      type: 'info',
      details: [
        { label: 'Project', value: projectName },
        { label: 'Your Role', value: projectRole },
        { label: 'Start Date', value: startDate },
        { label: 'Assigned By', value: assignedBy },
      ],
      actionUrl: '/projects',
      actionLabel: 'View Project',
    });
  },

  // ============================================
  // TEMPLATE 27: Weekly Report Ready
  // ============================================
  async sendWeeklyReportReady(
    email: string,
    recipientName: string,
    reportPeriod: string,
    generatedDate: string,
    reportType: string,
    reportUrl?: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Weekly Report Ready - ${generatedDate}`,
      message: 'Your weekly report is now available. Click the button below to view and download.',
      type: 'info',
      details: [
        { label: 'Report Period', value: reportPeriod },
        { label: 'Generated On', value: generatedDate },
        { label: 'Report Type', value: reportType },
      ],
      actionUrl: reportUrl || '/reports',
      actionLabel: 'View Report',
    });
  },

  // ============================================
  // TEMPLATE 28: Bank Transfer Receipt Validated
  // ============================================
  async sendBankTransferValidated(
    email: string,
    recipientName: string,
    receiptNumber: string,
    bankName: string,
    amount: number,
    transactionDate: string,
    validatedBy: string,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Bank Transfer Validated - Receipt #${receiptNumber}`,
      message: 'Your bank transfer receipt has been validated and the funds have been credited to your wallet.',
      type: 'success',
      details: [
        { label: 'Receipt Number', value: receiptNumber },
        { label: 'Bank', value: bankName },
        { label: 'Amount', value: `${currency} ${amount.toLocaleString()}` },
        { label: 'Transaction Date', value: transactionDate },
        { label: 'Validated By', value: validatedBy },
      ],
      actionUrl: '/wallet',
      actionLabel: 'View Wallet',
    });
  },

  // ============================================
  // TEMPLATE 29: Bank Transfer Receipt Rejected
  // ============================================
  async sendBankTransferRejected(
    email: string,
    recipientName: string,
    receiptNumber: string,
    bankName: string,
    amount: number,
    rejectedBy: string,
    rejectionReason: string,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Bank Transfer Rejected - Receipt #${receiptNumber}`,
      message: 'Your bank transfer receipt has been rejected. Please review the reason and submit a new receipt if necessary.',
      type: 'error',
      details: [
        { label: 'Receipt Number', value: receiptNumber },
        { label: 'Bank', value: bankName },
        { label: 'Amount', value: `${currency} ${amount.toLocaleString()}` },
        { label: 'Rejected By', value: rejectedBy },
        { label: 'Reason', value: rejectionReason },
      ],
      actionUrl: '/wallet',
      actionLabel: 'View Wallet',
    });
  },

  // ============================================
  // TEMPLATE 30: Down Payment Request
  // ============================================
  async sendDownPaymentRequest(
    email: string,
    recipientName: string,
    projectName: string,
    amount: number,
    requesterName: string,
    purpose: string,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: `Down Payment Request - ${projectName}`,
      message: 'A down payment has been requested for this project. Please review and approve or reject.',
      type: 'warning',
      details: [
        { label: 'Project', value: projectName },
        { label: 'Amount', value: `${currency} ${amount.toLocaleString()}` },
        { label: 'Requested By', value: requesterName },
        { label: 'Purpose', value: purpose },
      ],
      actionUrl: '/approvals',
      actionLabel: 'Review Request',
    });
  },

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Send bulk emails to multiple recipients with rate limiting
   * Sends emails sequentially with 2-second delays to avoid SMTP rate limits
   */
  async sendBulk(
    recipients: Array<{ email: string; name: string }>,
    options: NotificationEmailOptions
  ): Promise<{ total: number; successful: number; failed: number }> {
    const results: EmailNotificationResult[] = [];
    const DELAY_MS = 5000; // 5 second delay between emails to avoid IONOS rate limiting
    
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      
      // Add delay before sending (except for the first email)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
      
      try {
        const result = await this.sendNotification(r.email, r.name, options);
        results.push(result);
        console.log(`[EMAIL] Sent ${i + 1}/${recipients.length} to ${r.email}: ${result.success ? 'OK' : result.error}`);
      } catch (error: any) {
        results.push({ success: false, error: error.message });
        console.error(`[EMAIL] Failed ${i + 1}/${recipients.length} to ${r.email}:`, error.message);
      }
    }
    
    const successful = results.filter(r => r.success).length;
    return {
      total: recipients.length,
      successful,
      failed: recipients.length - successful,
    };
  },

  /**
   * Get user email from profile
   */
  async getUserEmail(userId: string): Promise<{ email: string; name: string } | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('email, full_name, username')
        .eq('id', userId)
        .single();

      if (error || !data?.email) {
        return null;
      }

      const name = data.full_name || data.username || 'User';

      return { email: data.email, name };
    } catch (error) {
      console.error('[EMAIL] Failed to get user email:', error);
      return null;
    }
  },

  /**
   * Send notification email to a user by their user ID
   */
  async sendToUser(
    userId: string,
    options: NotificationEmailOptions
  ): Promise<EmailNotificationResult> {
    const userInfo = await this.getUserEmail(userId);
    
    if (!userInfo) {
      return {
        success: false,
        error: 'User email not found',
      };
    }

    return this.sendNotification(userInfo.email, userInfo.name, options);
  },

  /**
   * Send deadline reminder email (legacy compatibility)
   */
  async sendDeadlineReminder(
    email: string,
    recipientName: string,
    siteName: string,
    hoursUntilDeadline: number
  ): Promise<EmailNotificationResult> {
    const isUrgent = hoursUntilDeadline <= 12;
    const timeText = hoursUntilDeadline <= 0 
      ? 'has passed'
      : hoursUntilDeadline < 24 
        ? `${Math.round(hoursUntilDeadline)} hours`
        : `${Math.round(hoursUntilDeadline / 24)} days`;

    return this.sendAssignmentReminder(
      email,
      recipientName,
      siteName,
      new Date(Date.now() + hoursUntilDeadline * 60 * 60 * 1000).toLocaleString(),
      timeText
    );
  },

  /**
   * Send withdrawal status update (legacy compatibility)
   */
  async sendWithdrawalStatus(
    email: string,
    recipientName: string,
    status: 'approved' | 'rejected' | 'pending',
    amount: number,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    const requestId = `WD-${Date.now()}`;
    
    if (status === 'approved') {
      return this.sendWithdrawalApproved(email, recipientName, amount, requestId, 'System', currency);
    } else if (status === 'rejected') {
      return this.sendWithdrawalRejected(email, recipientName, amount, requestId, 'System', 'Please contact administrator', currency);
    } else {
      return this.sendWithdrawalSubmitted(email, recipientName, amount, requestId, new Date().toLocaleString(), currency);
    }
  },

  // ============================================
  // TEMPLATE: Task Deadline Reminder with Urgency
  // ============================================
  async sendTaskDeadlineReminder(
    email: string,
    recipientName: string,
    taskName: string,
    deadline: string,
    hoursRemaining: number,
    taskUrl?: string,
    recipientRole?: { en: string; ar: string }
  ): Promise<EmailNotificationResult> {
    const roleEn = recipientRole?.en || 'Team Member';
    const roleAr = recipientRole?.ar || 'عضو الفريق';
    
    const isUrgent = hoursRemaining <= 24;
    const priority: 'urgent' | 'high' | 'normal' = hoursRemaining <= 12 ? 'urgent' : hoursRemaining <= 24 ? 'high' : 'normal';
    
    const timeTextEn = hoursRemaining <= 0 ? 'OVERDUE' : 
                       hoursRemaining < 24 ? `${Math.round(hoursRemaining)} hours remaining` :
                       `${Math.round(hoursRemaining / 24)} days remaining`;
    const timeTextAr = hoursRemaining <= 0 ? 'متأخر' : 
                       hoursRemaining < 24 ? `${Math.round(hoursRemaining)} ساعة متبقية` :
                       `${Math.round(hoursRemaining / 24)} أيام متبقية`;

    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Task Deadline Reminder | تذكير بموعد المهمة</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
          </div>
          
          ${isUrgent ? `
          <div style="background-color: #ffebee; border: 2px solid #f44336; border-radius: 8px; padding: 15px; margin-bottom: 20px; text-align: center;">
            <p style="color: #c62828; font-weight: bold; margin: 0; font-size: 18px;">URGENT: Deadline Approaching | عاجل: اقتراب الموعد النهائي</p>
          </div>
          ` : ''}
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Dear ${recipientName} (${roleEn}),</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">This is a reminder that your task deadline is approaching.</p>
            
            <div style="background-color: ${isUrgent ? '#fff3e0' : '#e3f2fd'}; border-left: 4px solid ${isUrgent ? '#ff9800' : '#2196f3'}; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Task:</strong> ${taskName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Deadline:</strong> ${deadline}</p>
              <p style="margin: 10px 0 0 0; color: ${isUrgent ? '#c62828' : '#333'}; font-weight: ${isUrgent ? 'bold' : 'normal'};"><strong>Time Remaining:</strong> ${timeTextEn}</p>
            </div>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">عزيزي ${recipientName} (${roleAr})،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">هذا تذكير بأن موعد مهمتك يقترب.</p>
            
            <div style="background-color: ${isUrgent ? '#fff3e0' : '#e3f2fd'}; border-right: 4px solid ${isUrgent ? '#ff9800' : '#2196f3'}; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>المهمة:</strong> ${taskName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>الموعد النهائي:</strong> ${deadline}</p>
              <p style="margin: 10px 0 0 0; color: ${isUrgent ? '#c62828' : '#333'}; font-weight: ${isUrgent ? 'bold' : 'normal'};"><strong>الوقت المتبقي:</strong> ${timeTextAr}</p>
            </div>
          </div>
          
          ${taskUrl ? `
          <div style="text-align: center; margin: 25px 0;">
            <a href="${taskUrl.startsWith('http') ? taskUrl : APP_URL + taskUrl}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              View Task | عرض المهمة
            </a>
          </div>
          ` : ''}
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            PACT Workflow Platform | منصة باكت للعمليات الميدانية
          </p>
        </div>
      </body>
      </html>
    `;
    
    const text = `Dear ${recipientName} (${roleEn}),

Task Deadline Reminder:
Task: ${taskName}
Deadline: ${deadline}
Time Remaining: ${timeTextEn}

---

عزيزي ${recipientName} (${roleAr})،

تذكير بموعد المهمة:
المهمة: ${taskName}
الموعد النهائي: ${deadline}
الوقت المتبقي: ${timeTextAr}

---
PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `Task "${taskName}" Deadline - ${recipientName} | تذكير بموعد المهمة`,
      recipientName,
      html,
      text,
      priority,
    });
  },

  // ============================================
  // TEMPLATE: Site Approval Notification
  // ============================================
  async sendSiteApproved(
    email: string,
    recipientName: string,
    siteName: string,
    mmpName: string,
    approvedBy: string,
    approvalDate: string,
    siteUrl?: string,
    recipientRole?: { en: string; ar: string }
  ): Promise<EmailNotificationResult> {
    const roleEn = recipientRole?.en || 'Team Member';
    const roleAr = recipientRole?.ar || 'عضو الفريق';

    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Site Approved | تمت الموافقة على الموقع</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
          </div>
          
          <!-- Success Banner -->
          <div style="background-color: #e8f5e9; border: 2px solid #4caf50; border-radius: 8px; padding: 15px; margin-bottom: 20px; text-align: center;">
            <p style="color: #2e7d32; font-weight: bold; margin: 0; font-size: 18px;">Site Approved | تمت الموافقة</p>
          </div>
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Dear ${recipientName} (${roleEn}),</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">The site has been approved and is now complete.</p>
            
            <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Site Name:</strong> ${siteName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>MMP:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Approved By:</strong> ${approvedBy}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Approval Date:</strong> ${approvalDate}</p>
              <p style="margin: 10px 0 0 0; color: #4caf50; font-weight: bold;"><strong>Status:</strong> APPROVED</p>
            </div>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">عزيزي ${recipientName} (${roleAr})،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">تمت الموافقة على الموقع وهو الآن مكتمل.</p>
            
            <div style="background-color: #e8f5e9; border-right: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>اسم الموقع:</strong> ${siteName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>خطة المراقبة:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>تمت الموافقة بواسطة:</strong> ${approvedBy}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>تاريخ الموافقة:</strong> ${approvalDate}</p>
              <p style="margin: 10px 0 0 0; color: #4caf50; font-weight: bold;"><strong>الحالة:</strong> تمت الموافقة</p>
            </div>
          </div>
          
          ${siteUrl ? `
          <div style="text-align: center; margin: 25px 0;">
            <a href="${siteUrl.startsWith('http') ? siteUrl : APP_URL + siteUrl}" style="display: inline-block; padding: 14px 30px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              View Site | عرض الموقع
            </a>
          </div>
          ` : ''}
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            PACT Workflow Platform | منصة باكت للعمليات الميدانية
          </p>
        </div>
      </body>
      </html>
    `;
    
    const text = `Dear ${recipientName} (${roleEn}),

Site Approved:
Site: ${siteName}
MMP: ${mmpName}
Approved By: ${approvedBy}
Date: ${approvalDate}

---

عزيزي ${recipientName} (${roleAr})،

تمت الموافقة على الموقع:
الموقع: ${siteName}
الخطة: ${mmpName}
الموافقة بواسطة: ${approvedBy}

---
PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `Site "${siteName}" Approved - ${recipientName} | تمت الموافقة على الموقع`,
      recipientName,
      html,
      text,
    });
  },

  // ============================================
  // TEMPLATE: Permit Expiration Alert
  // ============================================
  async sendPermitExpirationAlert(
    email: string,
    recipientName: string,
    permitType: string,
    expirationDate: string,
    daysRemaining: number,
    mmpName: string,
    permitUrl?: string,
    recipientRole?: { en: string; ar: string }
  ): Promise<EmailNotificationResult> {
    const roleEn = recipientRole?.en || 'Team Member';
    const roleAr = recipientRole?.ar || 'عضو الفريق';
    
    const isUrgent = daysRemaining <= 7;
    const priority: 'urgent' | 'high' | 'normal' = daysRemaining <= 3 ? 'urgent' : daysRemaining <= 7 ? 'high' : 'normal';

    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Permit Expiration Alert | تنبيه انتهاء التصريح</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
          </div>
          
          ${isUrgent ? `
          <div style="background-color: #ffebee; border: 2px solid #f44336; border-radius: 8px; padding: 15px; margin-bottom: 20px; text-align: center;">
            <p style="color: #c62828; font-weight: bold; margin: 0; font-size: 18px;">ALERT: Permit Expiring Soon | تنبيه: التصريح ينتهي قريباً</p>
          </div>
          ` : ''}
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Dear ${recipientName} (${roleEn}),</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">This is an alert that a permit is expiring soon. Please take action to renew it before the expiration date.</p>
            
            <div style="background-color: ${isUrgent ? '#ffebee' : '#fff3e0'}; border-left: 4px solid ${isUrgent ? '#f44336' : '#ff9800'}; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Permit Type:</strong> ${permitType}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>MMP:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Expiration Date:</strong> ${expirationDate}</p>
              <p style="margin: 10px 0 0 0; color: ${isUrgent ? '#c62828' : '#e65100'}; font-weight: bold;"><strong>Days Remaining:</strong> ${daysRemaining} days</p>
            </div>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">عزيزي ${recipientName} (${roleAr})،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">هذا تنبيه بأن التصريح ينتهي قريباً. يرجى اتخاذ الإجراءات اللازمة لتجديده قبل تاريخ الانتهاء.</p>
            
            <div style="background-color: ${isUrgent ? '#ffebee' : '#fff3e0'}; border-right: 4px solid ${isUrgent ? '#f44336' : '#ff9800'}; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>نوع التصريح:</strong> ${permitType}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>خطة المراقبة:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>تاريخ الانتهاء:</strong> ${expirationDate}</p>
              <p style="margin: 10px 0 0 0; color: ${isUrgent ? '#c62828' : '#e65100'}; font-weight: bold;"><strong>الأيام المتبقية:</strong> ${daysRemaining} أيام</p>
            </div>
          </div>
          
          ${permitUrl ? `
          <div style="text-align: center; margin: 25px 0;">
            <a href="${permitUrl.startsWith('http') ? permitUrl : APP_URL + permitUrl}" style="display: inline-block; padding: 14px 30px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              Renew Permit | تجديد التصريح
            </a>
          </div>
          ` : ''}
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            PACT Workflow Platform | منصة باكت للعمليات الميدانية
          </p>
        </div>
      </body>
      </html>
    `;
    
    const text = `Dear ${recipientName} (${roleEn}),

Permit Expiration Alert:
Permit Type: ${permitType}
MMP: ${mmpName}
Expiration Date: ${expirationDate}
Days Remaining: ${daysRemaining}

---

عزيزي ${recipientName} (${roleAr})،

تنبيه انتهاء التصريح:
نوع التصريح: ${permitType}
الخطة: ${mmpName}
تاريخ الانتهاء: ${expirationDate}
الأيام المتبقية: ${daysRemaining}

---
PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `Permit "${permitType}" Expiring - ${daysRemaining} Days | تنبيه انتهاء التصريح`,
      recipientName,
      html,
      text,
      priority,
    });
  },

  // ============================================
  // TEMPLATE: Send Email with CC to Management
  // ============================================
  async sendWithManagementCC(
    email: string,
    recipientName: string,
    options: NotificationEmailOptions,
    ccEmails: string[]
  ): Promise<EmailNotificationResult> {
    const html = generateNotificationEmailHTML(recipientName, options);
    const text = generatePlainText(recipientName, options);
    
    return this.sendEmail({
      to: email,
      subject: options.title,
      recipientName,
      html,
      text,
      cc: ccEmails,
    });
  },

  // ============================================
  // TEMPLATE: Weekly Summary Report
  // ============================================
  async sendWeeklySummary(
    email: string,
    recipientName: string,
    weekStartDate: string,
    weekEndDate: string,
    stats: {
      sitesVisited: number;
      sitesApproved: number;
      sitesPending: number;
      mmpsCompleted: number;
    },
    recipientRole?: { en: string; ar: string }
  ): Promise<EmailNotificationResult> {
    const roleEn = recipientRole?.en || 'Team Member';
    const roleAr = recipientRole?.ar || 'عضو الفريق';

    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Weekly Summary Report | التقرير الأسبوعي</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
          </div>
          
          <div style="background-color: #e3f2fd; border-radius: 8px; padding: 15px; margin-bottom: 20px; text-align: center;">
            <p style="color: #1565c0; font-weight: bold; margin: 0; font-size: 18px;">Weekly Summary | الملخص الأسبوعي</p>
            <p style="color: #1565c0; margin: 5px 0 0 0; font-size: 14px;">${weekStartDate} - ${weekEndDate}</p>
          </div>
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Dear ${recipientName} (${roleEn}),</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Here is your weekly activity summary:</p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
              <div style="background-color: #e3f2fd; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0; font-size: 32px; font-weight: bold; color: #1565c0;">${stats.sitesVisited}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Sites Visited</p>
              </div>
              <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0; font-size: 32px; font-weight: bold; color: #2e7d32;">${stats.sitesApproved}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Sites Approved</p>
              </div>
              <div style="background-color: #fff3e0; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0; font-size: 32px; font-weight: bold; color: #e65100;">${stats.sitesPending}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Sites Pending</p>
              </div>
              <div style="background-color: #f3e5f5; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0; font-size: 32px; font-weight: bold; color: #7b1fa2;">${stats.mmpsCompleted}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">MMPs Completed</p>
              </div>
            </div>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">عزيزي ${recipientName} (${roleAr})،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">إليك ملخص نشاطك الأسبوعي:</p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
              <div style="background-color: #e3f2fd; border-radius: 8px; padding: 15px; text-align: center;">
                <p style="margin: 0; font-size: 24px; font-weight: bold; color: #1565c0;">${stats.sitesVisited}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">المواقع التي تمت زيارتها</p>
              </div>
              <div style="background-color: #e8f5e9; border-radius: 8px; padding: 15px; text-align: center;">
                <p style="margin: 0; font-size: 24px; font-weight: bold; color: #2e7d32;">${stats.sitesApproved}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">المواقع المعتمدة</p>
              </div>
              <div style="background-color: #fff3e0; border-radius: 8px; padding: 15px; text-align: center;">
                <p style="margin: 0; font-size: 24px; font-weight: bold; color: #e65100;">${stats.sitesPending}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">المواقع المعلقة</p>
              </div>
              <div style="background-color: #f3e5f5; border-radius: 8px; padding: 15px; text-align: center;">
                <p style="margin: 0; font-size: 24px; font-weight: bold; color: #7b1fa2;">${stats.mmpsCompleted}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">الخطط المكتملة</p>
              </div>
            </div>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${APP_URL}/dashboard" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              View Dashboard | عرض لوحة التحكم
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            PACT Workflow Platform | منصة باكت للعمليات الميدانية
          </p>
        </div>
      </body>
      </html>
    `;
    
    const text = `Dear ${recipientName} (${roleEn}),

Weekly Summary (${weekStartDate} - ${weekEndDate}):
- Sites Visited: ${stats.sitesVisited}
- Sites Approved: ${stats.sitesApproved}
- Sites Pending: ${stats.sitesPending}
- MMPs Completed: ${stats.mmpsCompleted}

---

عزيزي ${recipientName} (${roleAr})،

الملخص الأسبوعي:
- المواقع التي تمت زيارتها: ${stats.sitesVisited}
- المواقع المعتمدة: ${stats.sitesApproved}
- المواقع المعلقة: ${stats.sitesPending}
- الخطط المكتملة: ${stats.mmpsCompleted}

---
PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `Weekly Summary (${weekStartDate} - ${weekEndDate}) - ${recipientName} | الملخص الأسبوعي`,
      recipientName,
      html,
      text,
    });
  },
};

export default EmailNotificationService;
