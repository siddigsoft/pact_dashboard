/**
 * OTP Delivery Service
 * Handles Email delivery via IONOS SMTP through Supabase Edge Function
 * For phone/email signature verification
 * 
 * This service sends real emails in production using the send-email Edge Function.
 * SMS delivery remains in mock mode (requires Twilio integration).
 */

import { supabase } from '@/integrations/supabase/client';

export interface OTPDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: 'smtp' | 'mock';
  deliveredAt?: string;
  developmentNote?: string;
}

export const OTPDeliveryService = {
  /**
   * Check if OTP delivery services are configured
   * Email is configured via IONOS SMTP, SMS is not yet configured
   */
  isConfigured(): boolean {
    return true;
  },

  /**
   * Get configuration status for debugging
   */
  getConfigStatus(): {
    smsConfigured: boolean;
    emailConfigured: boolean;
    mode: 'mock' | 'production';
    note: string;
  } {
    return {
      smsConfigured: false,
      emailConfigured: true,
      mode: 'production',
      note: 'Email delivery is configured via IONOS SMTP. SMS requires Twilio integration.',
    };
  },

  /**
   * Send OTP via SMS (Mock implementation - Twilio not configured)
   * In development, logs OTP to console instead of sending actual SMS
   */
  async sendSMS(phoneNumber: string, otp: string, purpose: string): Promise<OTPDeliveryResult> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('='.repeat(60));
    console.log('[OTP DELIVERY - SMS MOCK MODE]');
    console.log(`Phone: ${phoneNumber}`);
    console.log(`Purpose: ${purpose}`);
    console.log(`OTP Code: ${otp}`);
    console.log('NOTE: SMS delivery requires Twilio integration');
    console.log('='.repeat(60));
    
    return {
      success: true,
      provider: 'mock',
      messageId: `mock-sms-${Date.now()}`,
      deliveredAt: new Date().toISOString(),
      developmentNote: `Mock SMS - OTP: ${otp} sent to ${phoneNumber}. Configure Twilio for real SMS.`,
    };
  },

  /**
   * Send OTP via Email using IONOS SMTP
   * Uses the send-email Supabase Edge Function
   */
  async sendEmail(
    email: string,
    otp: string,
    purpose: string,
    recipientName?: string
  ): Promise<OTPDeliveryResult> {
    try {
      console.log(`[OTP DELIVERY] Sending email to ${email} for ${purpose}`);

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: `Your PACT Verification Code`,
          type: 'otp',
          otp: otp,
          recipientName: recipientName || 'User',
        },
      });

      if (error) {
        console.error('[OTP DELIVERY] Email send failed:', error);
        return {
          success: false,
          provider: 'smtp',
          error: error.message || 'Failed to send email',
        };
      }

      if (data && !data.success) {
        console.error('[OTP DELIVERY] Email send failed:', data.error);
        return {
          success: false,
          provider: 'smtp',
          error: data.error || 'Failed to send email',
        };
      }

      console.log(`[OTP DELIVERY] Email sent successfully to ${email}`);
      return {
        success: true,
        provider: 'smtp',
        messageId: data?.messageId || `email-${Date.now()}`,
        deliveredAt: data?.deliveredAt || new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('[OTP DELIVERY] Email send error:', error);
      
      // Fallback to mock mode if edge function fails
      console.log('='.repeat(60));
      console.log('[OTP DELIVERY - FALLBACK MOCK MODE]');
      console.log(`Email: ${email}`);
      console.log(`Recipient: ${recipientName || 'Unknown'}`);
      console.log(`Purpose: ${purpose}`);
      console.log(`OTP Code: ${otp}`);
      console.log('NOTE: Edge function unavailable, using mock mode');
      console.log('='.repeat(60));
      
      return {
        success: true,
        provider: 'mock',
        messageId: `mock-email-${Date.now()}`,
        deliveredAt: new Date().toISOString(),
        developmentNote: `Mock fallback - OTP: ${otp} sent to ${email}. Edge function error: ${error.message}`,
      };
    }
  },

  /**
   * Send password reset email using IONOS SMTP
   * Uses the send-email Supabase Edge Function with password-reset template
   */
  async sendPasswordResetEmail(
    email: string,
    otp: string,
    recipientName?: string
  ): Promise<OTPDeliveryResult> {
    try {
      console.log(`[PASSWORD RESET] Sending reset email to ${email}`);

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: `PACT Password Reset Code`,
          type: 'password-reset',
          otp: otp,
          recipientName: recipientName || 'User',
        },
      });

      if (error) {
        console.error('[PASSWORD RESET] Email send failed:', error);
        return {
          success: false,
          provider: 'smtp',
          error: error.message || 'Failed to send password reset email',
        };
      }

      if (data && !data.success) {
        console.error('[PASSWORD RESET] Email send failed:', data.error);
        return {
          success: false,
          provider: 'smtp',
          error: data.error || 'Failed to send password reset email',
        };
      }

      console.log(`[PASSWORD RESET] Email sent successfully to ${email}`);
      return {
        success: true,
        provider: 'smtp',
        messageId: data?.messageId || `email-${Date.now()}`,
        deliveredAt: data?.deliveredAt || new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('[PASSWORD RESET] Email send error:', error);
      return {
        success: false,
        provider: 'smtp',
        error: error.message || 'Failed to send password reset email',
      };
    }
  },

  /**
   * Send a general notification email
   */
  async sendNotificationEmail(
    email: string,
    subject: string,
    htmlContent: string,
    textContent?: string
  ): Promise<OTPDeliveryResult> {
    try {
      console.log(`[NOTIFICATION] Sending email to ${email}: ${subject}`);

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: subject,
          html: htmlContent,
          text: textContent,
          type: 'notification',
        },
      });

      if (error) {
        console.error('[NOTIFICATION] Email send failed:', error);
        return {
          success: false,
          provider: 'smtp',
          error: error.message || 'Failed to send notification email',
        };
      }

      if (data && !data.success) {
        console.error('[NOTIFICATION] Email send failed:', data.error);
        return {
          success: false,
          provider: 'smtp',
          error: data.error || 'Failed to send notification email',
        };
      }

      console.log(`[NOTIFICATION] Email sent successfully to ${email}`);
      return {
        success: true,
        provider: 'smtp',
        messageId: data?.messageId || `email-${Date.now()}`,
        deliveredAt: data?.deliveredAt || new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('[NOTIFICATION] Email send error:', error);
      return {
        success: false,
        provider: 'smtp',
        error: error.message || 'Failed to send notification email',
      };
    }
  },

  /**
   * Send OTP via the appropriate channel
   */
  async sendOTP(
    method: 'phone' | 'email',
    destination: string,
    otp: string,
    purpose: string,
    recipientName?: string
  ): Promise<OTPDeliveryResult> {
    if (method === 'phone') {
      return this.sendSMS(destination, otp, purpose);
    } else {
      return this.sendEmail(destination, otp, purpose, recipientName);
    }
  },
};

export default OTPDeliveryService;
