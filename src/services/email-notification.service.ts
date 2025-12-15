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
  type?: 'info' | 'success' | 'warning' | 'error';
  actionUrl?: string;
  actionLabel?: string;
  details?: Array<{ label: string; value: string }>;
}

const generateNotificationEmailHTML = (
  recipientName: string,
  options: NotificationEmailOptions
): string => {
  const { title, message, type = 'info', actionUrl, actionLabel, details } = options;
  
  const typeColors: Record<string, { bg: string; border: string }> = {
    info: { bg: '#e3f2fd', border: '#2196f3' },
    success: { bg: '#e8f5e9', border: '#4caf50' },
    warning: { bg: '#fff3e0', border: '#ff9800' },
    error: { bg: '#ffebee', border: '#f44336' },
  };
  
  const colors = typeColors[type];
  
  const detailsHtml = details?.length ? `
    <div style="background-color: ${colors.bg}; border-left: 4px solid ${colors.border}; border-radius: 4px; padding: 16px; margin: 20px 0;">
      ${details.map(d => `<p style="margin: 5px 0;"><strong>${d.label}:</strong> ${d.value}</p>`).join('')}
    </div>
  ` : '';
  
  const actionButton = actionUrl ? `
    <div style="text-align: center; margin: 25px 0;">
      <a href="${actionUrl.startsWith('http') ? actionUrl : APP_URL + actionUrl}" 
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
        
        ${detailsHtml || `
        <div style="background-color: ${colors.bg}; border-left: 4px solid ${colors.border}; border-radius: 4px; padding: 16px; margin: 20px 0;">
          <h2 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${title}</h2>
          <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">${message}</p>
        </div>
        `}
        
        ${!detailsHtml ? '' : `<p style="color: #555; font-size: 14px; line-height: 1.5;">${message}</p>`}
        
        ${actionButton}
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message from PACT Workflow Platform.<br>
          ICT Team - PACT Command Center Platform
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
  const { title, message, actionUrl, actionLabel, details } = options;
  let text = `Hello ${recipientName},\n\n${title}\n\n`;
  if (details?.length) {
    text += details.map(d => `${d.label}: ${d.value}`).join('\n') + '\n\n';
  }
  text += message;
  if (actionUrl) {
    const fullUrl = actionUrl.startsWith('http') ? actionUrl : APP_URL + actionUrl;
    text += `\n\n${actionLabel || 'View Details'}: ${fullUrl}`;
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

- PACT Workflow Platform | منصة باكت`;

    return this.sendEmail({
      to: email,
      subject: 'Welcome to PACT | مرحباً بك في باكت',
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
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Code</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
          </div>
          
          <h2 style="color: #333; text-align: center;">Verification Code</h2>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello ${recipientName},</p>
          
          <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #666;">Your verification code is:</p>
            <p style="margin: 10px 0; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${otpCode}</p>
            <p style="margin: 0; font-size: 12px; color: #999;">This code expires in ${expiryMinutes} minutes</p>
          </div>
          
          <p style="color: #555; font-size: 14px; line-height: 1.5;">Enter this code to complete your verification. Do not share this code with anyone.</p>
          
          <p style="color: #666; font-size: 13px;">If you did not request this code, please ignore this email or contact support if you have concerns.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from PACT Workflow Platform.<br>
            ICT Team - PACT Command Center Platform
          </p>
        </div>
      </body>
      </html>
    `;
    
    return this.sendEmail({
      to: email,
      subject: `Your PACT Verification Code: ${otpCode}`,
      recipientName,
      html,
      text: `Hello ${recipientName},\n\nYour verification code is: ${otpCode}\n\nThis code expires in ${expiryMinutes} minutes.\n\nDo not share this code with anyone.\n\n---\nPACT Workflow Platform`,
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
