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
    const { to, subject, recipientName, html, text } = options;
    
    try {
      console.log(`[EMAIL] Sending to ${to}: ${subject}`);

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to,
          subject,
          html,
          text,
          type: 'notification',
          recipientName: recipientName || 'User',
        },
      });

      if (error) {
        console.error('[EMAIL] Send failed:', error);
        await logEmailSend(to, subject, 'notification', false, undefined, error.message);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }

      if (data && !data.success) {
        console.error('[EMAIL] Send failed:', data.error);
        await logEmailSend(to, subject, 'notification', false, undefined, data.error);
        return {
          success: false,
          error: data.error || 'Failed to send email',
        };
      }

      console.log(`[EMAIL] Sent successfully to ${to}`);
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
   * Send a notification-style email with formatted template
   */
  async sendNotification(
    email: string,
    recipientName: string,
    options: NotificationEmailOptions
  ): Promise<EmailNotificationResult> {
    const html = generateNotificationEmailHTML(recipientName, options);
    const text = generatePlainText(recipientName, options);
    
    return this.sendEmail({
      to: email,
      subject: options.title,
      recipientName,
      html,
      text,
    });
  },

  // ============================================
  // TEMPLATE 6: Welcome Email (New User) - Bilingual
  // ============================================
  async sendWelcomeEmail(
    email: string,
    recipientName: string,
    role: string
  ): Promise<EmailNotificationResult> {
    const html = `
      <!DOCTYPE html>
      <html dir="ltr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to PACT | مرحباً بك في باكت</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
          </div>
          
          <!-- English Section -->
          <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello ${recipientName},</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Welcome to PACT Workflow Platform! Your account has been approved and is now active.</p>
            
            <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Account Status:</strong> Approved</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Role:</strong> ${role}</p>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.5;">You can now log in to access your dashboard and start managing your assignments.</p>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">مرحباً ${recipientName}،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">أهلاً بك في منصة باكت للعمليات الميدانية! تمت الموافقة على حسابك وأصبح نشطاً الآن.</p>
            
            <div style="background-color: #e8f5e9; border-right: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>حالة الحساب:</strong> تمت الموافقة</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>الدور:</strong> ${role}</p>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.8;">يمكنك الآن تسجيل الدخول للوصول إلى لوحة التحكم الخاصة بك والبدء في إدارة مهامك.</p>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${APP_URL}/login" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              Log In Now | تسجيل الدخول
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <!-- Management Oversight Notice -->
          <div style="background-color: #f8f9fa; border-radius: 6px; padding: 12px; margin-bottom: 20px;">
            <p style="color: #555; font-size: 11px; text-align: center; margin: 0; line-height: 1.6;">
              This notification has been sent to relevant management for oversight and accountability.<br>
              <span style="direction: rtl; display: inline-block;">تم إرسال هذا الإشعار إلى الإدارة المعنية للإشراف والمساءلة.</span>
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
    
    const text = `Hello ${recipientName},

Welcome to PACT Workflow Platform! Your account has been approved and is now active.

Account Status: Approved
Role: ${role}

You can now log in to access your dashboard and start managing your assignments.

Log in at: ${APP_URL}/login

---

مرحباً ${recipientName}،

أهلاً بك في منصة باكت للعمليات الميدانية! تمت الموافقة على حسابك وأصبح نشطاً الآن.

حالة الحساب: تمت الموافقة
الدور: ${role}

يمكنك الآن تسجيل الدخول للوصول إلى لوحة التحكم الخاصة بك والبدء في إدارة مهامك.

---
PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: 'Welcome to PACT | مرحباً بك في باكت',
      recipientName,
      html,
      text,
    });
  },

  // ============================================
  // TEMPLATE 6B: MMP Forwarded to FOM - Bilingual
  // ============================================
  async sendMMPForwardedToFOM(
    email: string,
    recipientName: string,
    mmpName: string,
    forwarderName: string,
    mmpId: string,
    isRecipientFOM: boolean = true
  ): Promise<EmailNotificationResult> {
    const viewMmpUrl = `${APP_URL}/mmp/${mmpId}`;
    
    const titleEn = isRecipientFOM ? 'MMP Forwarded to You' : 'MMP Forwarded to FOM';
    const titleAr = isRecipientFOM ? 'تم إرسال خطة المراقبة الشهرية إليك' : 'تم إرسال خطة المراقبة الشهرية إلى مدير العمليات الميدانية';
    
    const messageEn = isRecipientFOM 
      ? `The Monthly Monitoring Plan "${mmpName}" has been forwarded to you for permits attachment by ${forwarderName}. Please review and attach the necessary permits.`
      : `The Monthly Monitoring Plan "${mmpName}" has been forwarded to the Field Operations Manager(s) for permits attachment by ${forwarderName}.`;
    
    const messageAr = isRecipientFOM
      ? `تم إرسال خطة المراقبة الشهرية "${mmpName}" إليك لإرفاق التصاريح بواسطة ${forwarderName}. يرجى المراجعة وإرفاق التصاريح اللازمة.`
      : `تم إرسال خطة المراقبة الشهرية "${mmpName}" إلى مدير(مديري) العمليات الميدانية لإرفاق التصاريح بواسطة ${forwarderName}.`;

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
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello ${recipientName},</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">${messageEn}</p>
            
            <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>MMP Name:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Forwarded By:</strong> ${forwarderName}</p>
              ${isRecipientFOM ? '<p style="margin: 10px 0 0 0; color: #333;"><strong>Action Required:</strong> Attach Permits</p>' : ''}
            </div>
          </div>
          
          <!-- Arabic Section -->
          <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
            <p style="color: #333; font-size: 16px; line-height: 1.8;">مرحباً ${recipientName}،</p>
            <p style="color: #333; font-size: 16px; line-height: 1.8;">${messageAr}</p>
            
            <div style="background-color: #e3f2fd; border-right: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>اسم خطة المراقبة الشهرية:</strong> ${mmpName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>تم الإرسال بواسطة:</strong> ${forwarderName}</p>
              ${isRecipientFOM ? '<p style="margin: 10px 0 0 0; color: #333;"><strong>الإجراء المطلوب:</strong> إرفاق التصاريح</p>' : ''}
            </div>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${viewMmpUrl}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              View MMP | عرض خطة المراقبة الشهرية
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <!-- Management Oversight Notice -->
          <div style="background-color: #f8f9fa; border-radius: 6px; padding: 12px; margin-bottom: 20px;">
            <p style="color: #555; font-size: 11px; text-align: center; margin: 0; line-height: 1.6;">
              This notification has been sent to relevant management for oversight and accountability.<br>
              <span style="direction: rtl; display: inline-block;">تم إرسال هذا الإشعار إلى الإدارة المعنية للإشراف والمساءلة.</span>
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
    
    const text = `Hello ${recipientName},

${messageEn}

MMP Name: ${mmpName}
Forwarded By: ${forwarderName}
${isRecipientFOM ? 'Action Required: Attach Permits' : ''}

View MMP: ${viewMmpUrl}

---

مرحباً ${recipientName}،

${messageAr}

اسم خطة المراقبة الشهرية: ${mmpName}
تم الإرسال بواسطة: ${forwarderName}
${isRecipientFOM ? 'الإجراء المطلوب: إرفاق التصاريح' : ''}

---
PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `${titleEn} | ${titleAr}`,
      recipientName,
      html,
      text,
    });
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
    recipientRole?: { en: string; ar: string }
  ): Promise<EmailNotificationResult> {
    const viewMmpUrl = mmpId ? `${APP_URL}/mmp/${mmpId}` : `${APP_URL}/mmp`;
    
    const titleEn = 'MMP Forwarded to Coordinators';
    const titleAr = 'تم إرسال خطة المراقبة الشهرية إلى المنسقين';
    
    // Personalized greeting based on role
    const roleEn = recipientRole?.en || 'Team Member';
    const roleAr = recipientRole?.ar || 'عضو الفريق';
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

This notification has been sent to relevant management including Administrators, Field Operations Managers, and Supervisors for oversight and accountability.

تم إرسال هذا الإشعار إلى الإدارة المعنية بما في ذلك المسؤولين ومديري العمليات الميدانية والمشرفين للإشراف والمساءلة.

- PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `${titleEn} | ${titleAr}`,
      recipientName,
      html,
      text,
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
    recipientRole?: { en: string; ar: string }
  ): Promise<EmailNotificationResult> {
    const viewSiteUrl = siteId ? `${APP_URL}/mmp?site=${siteId}` : `${APP_URL}/mmp`;
    
    const titleEn = 'Site Verified by Coordinator';
    const titleAr = 'تم التحقق من الموقع بواسطة المنسق';
    
    // Personalized greeting based on role
    const roleEn = recipientRole?.en || 'Team Member';
    const roleAr = recipientRole?.ar || 'عضو الفريق';
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

Management Oversight Notice:
This notification is sent to Hub Supervisors, Field Operations Managers, Administrators, and Super Administrators for transparency and accountability purposes.

إشعار الرقابة الإدارية:
يتم إرسال هذا الإشعار إلى مشرفي المحاور ومديري العمليات الميدانية والمسؤولين والمسؤولين الأعلى لأغراض الشفافية والمساءلة.

- PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: `${titleEn} | ${titleAr}`,
      recipientName,
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
   * Send bulk emails to multiple recipients
   */
  async sendBulk(
    recipients: Array<{ email: string; name: string }>,
    options: NotificationEmailOptions
  ): Promise<{ total: number; successful: number; failed: number }> {
    const results = await Promise.all(
      recipients.map(r => this.sendNotification(r.email, r.name, options))
    );
    
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
        .select('email, first_name, last_name, full_name')
        .eq('id', userId)
        .single();

      if (error || !data?.email) {
        return null;
      }

      const name = data.full_name || 
        (data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : data.first_name) || 
        'User';

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
};

export default EmailNotificationService;
