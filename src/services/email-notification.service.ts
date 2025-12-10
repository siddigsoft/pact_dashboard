/**
 * Email Notification Service
 * Sends email notifications via IONOS SMTP through Supabase Edge Function
 * Integrates with the existing notification system for important alerts
 */

import { supabase } from '@/integrations/supabase/client';
import { logEmailSend } from '@/utils/audit-logger';

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
  type?: 'info' | 'success' | 'warning' | 'error';
  actionUrl?: string;
  actionLabel?: string;
}

const generateNotificationEmailHTML = (
  recipientName: string,
  options: NotificationEmailOptions
): string => {
  const { title, message, type = 'info', actionUrl, actionLabel } = options;
  
  const typeColors: Record<string, { bg: string; border: string; icon: string }> = {
    info: { bg: '#e3f2fd', border: '#2196f3', icon: 'info' },
    success: { bg: '#e8f5e9', border: '#4caf50', icon: 'checkmark' },
    warning: { bg: '#fff3e0', border: '#ff9800', icon: 'warning' },
    error: { bg: '#ffebee', border: '#f44336', icon: 'error' },
  };
  
  const colors = typeColors[type];
  
  const actionButton = actionUrl ? `
    <div style="text-align: center; margin: 25px 0;">
      <a href="${actionUrl}" 
         style="display: inline-block; padding: 12px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
        ${actionLabel || 'View Details'}
      </a>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
        </div>
        
        <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello ${recipientName},</p>
        
        <div style="background-color: ${colors.bg}; border-left: 4px solid ${colors.border}; border-radius: 4px; padding: 16px; margin: 20px 0;">
          <h2 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${title}</h2>
          <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">${message}</p>
        </div>
        
        ${actionButton}
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message from PACT Workflow Platform.<br>
          Please do not reply to this email.
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
  const { title, message, actionUrl, actionLabel } = options;
  let text = `Hello ${recipientName},\n\n${title}\n\n${message}`;
  if (actionUrl) {
    text += `\n\n${actionLabel || 'View Details'}: ${actionUrl}`;
  }
  text += '\n\n---\nThis is an automated message from PACT Workflow Platform.';
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

  /**
   * Send site assignment email notification
   */
  async sendSiteAssignment(
    email: string,
    recipientName: string,
    siteName: string,
    siteUrl?: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: 'New Site Assignment',
      message: `You have been assigned to visit "${siteName}". Please review the site details and confirm your assignment.`,
      type: 'info',
      actionUrl: siteUrl,
      actionLabel: 'View Assignment',
    });
  },

  /**
   * Send approval request email
   */
  async sendApprovalRequest(
    email: string,
    recipientName: string,
    itemType: string,
    itemName: string,
    approvalUrl?: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: 'Approval Required',
      message: `A ${itemType} "${itemName}" requires your approval. Please review and take action.`,
      type: 'warning',
      actionUrl: approvalUrl,
      actionLabel: 'Review Now',
    });
  },

  /**
   * Send withdrawal status update email
   */
  async sendWithdrawalStatus(
    email: string,
    recipientName: string,
    status: 'approved' | 'rejected' | 'pending',
    amount: number,
    currency: string = 'SDG'
  ): Promise<EmailNotificationResult> {
    const statusInfo = {
      approved: {
        title: 'Withdrawal Approved',
        message: `Your withdrawal request of ${currency} ${amount.toLocaleString()} has been approved and is being processed.`,
        type: 'success' as const,
      },
      rejected: {
        title: 'Withdrawal Rejected',
        message: `Your withdrawal request of ${currency} ${amount.toLocaleString()} has been rejected. Please contact your administrator for more details.`,
        type: 'error' as const,
      },
      pending: {
        title: 'Withdrawal Pending',
        message: `Your withdrawal request of ${currency} ${amount.toLocaleString()} is pending final approval.`,
        type: 'info' as const,
      },
    };

    const info = statusInfo[status];
    return this.sendNotification(email, recipientName, {
      title: info.title,
      message: info.message,
      type: info.type,
      actionUrl: '/wallet',
      actionLabel: 'View Wallet',
    });
  },

  /**
   * Send site visit completion notification
   */
  async sendSiteVisitCompleted(
    email: string,
    recipientName: string,
    siteName: string,
    collectorName: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: 'Site Visit Completed',
      message: `${collectorName} has completed the site visit to "${siteName}". The visit report is now available for review.`,
      type: 'success',
      actionUrl: '/mmp',
      actionLabel: 'View Report',
    });
  },

  /**
   * Send budget alert email
   */
  async sendBudgetAlert(
    email: string,
    recipientName: string,
    projectName: string,
    percentUsed: number
  ): Promise<EmailNotificationResult> {
    const isExceeded = percentUsed >= 100;
    const isCritical = percentUsed >= 90;
    
    return this.sendNotification(email, recipientName, {
      title: isExceeded ? 'Budget Exceeded' : 'Budget Alert',
      message: isExceeded 
        ? `The budget for "${projectName}" has exceeded ${percentUsed}% of its allocated amount. Immediate attention is required.`
        : `The budget for "${projectName}" has reached ${percentUsed}% of its allocated amount.`,
      type: isExceeded ? 'error' : isCritical ? 'warning' : 'info',
      actionUrl: '/budget',
      actionLabel: 'View Budget',
    });
  },

  /**
   * Send deadline reminder email
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
        ? `is in ${Math.round(hoursUntilDeadline)} hours`
        : `is in ${Math.round(hoursUntilDeadline / 24)} days`;

    return this.sendNotification(email, recipientName, {
      title: hoursUntilDeadline <= 0 ? 'Deadline Passed' : 'Deadline Reminder',
      message: hoursUntilDeadline <= 0
        ? `The confirmation deadline for "${siteName}" has passed. The site may be released to another team member.`
        : `Reminder: The confirmation deadline for "${siteName}" ${timeText}. Please confirm your assignment.`,
      type: hoursUntilDeadline <= 0 ? 'error' : isUrgent ? 'warning' : 'info',
      actionUrl: '/mmp',
      actionLabel: 'Confirm Now',
    });
  },

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(
    email: string,
    recipientName: string,
    role: string
  ): Promise<EmailNotificationResult> {
    return this.sendNotification(email, recipientName, {
      title: 'Welcome to PACT Workflow Platform',
      message: `Your account has been created with the role of "${role}". You can now log in to access your dashboard and start managing your assignments.`,
      type: 'success',
      actionUrl: '/login',
      actionLabel: 'Log In Now',
    });
  },

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
};

export default EmailNotificationService;
