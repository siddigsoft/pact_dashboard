/**
 * OTP Delivery Service
 * Handles SMS delivery via Twilio and Email delivery via SendGrid
 * For phone/email signature verification
 * 
 * IMPORTANT: This service currently operates in MOCK MODE only.
 * In production, OTP delivery MUST be handled by a secure backend service
 * to prevent exposing API credentials. The Supabase Edge Functions or a
 * dedicated backend API should handle actual SMS/Email delivery.
 * 
 * This mock implementation:
 * - Logs OTP codes to console for development/testing
 * - Simulates delivery delays for realistic testing
 * - Does NOT send real SMS/Email messages
 * 
 * For production deployment:
 * 1. Create a Supabase Edge Function for OTP delivery
 * 2. Store Twilio/SendGrid credentials in Supabase secrets
 * 3. Call the Edge Function from this service instead of direct API calls
 */

export interface OTPDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: 'mock';
  deliveredAt?: string;
  developmentNote?: string;
}

export const OTPDeliveryService = {
  /**
   * Check if OTP delivery services are configured
   * Always returns false in mock mode - real delivery requires backend integration
   */
  isConfigured(): boolean {
    return false;
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
      emailConfigured: false,
      mode: 'mock',
      note: 'OTP delivery is in mock mode. For production, implement a Supabase Edge Function.',
    };
  },

  /**
   * Send OTP via SMS (Mock implementation)
   * In development, logs OTP to console instead of sending actual SMS
   */
  async sendSMS(phoneNumber: string, otp: string, purpose: string): Promise<OTPDeliveryResult> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('='.repeat(60));
    console.log('[OTP DELIVERY - MOCK MODE]');
    console.log(`Phone: ${phoneNumber}`);
    console.log(`Purpose: ${purpose}`);
    console.log(`OTP Code: ${otp}`);
    console.log('NOTE: In production, this would be sent via Twilio SMS');
    console.log('='.repeat(60));
    
    return {
      success: true,
      provider: 'mock',
      messageId: `mock-sms-${Date.now()}`,
      deliveredAt: new Date().toISOString(),
      developmentNote: `Mock SMS - OTP: ${otp} sent to ${phoneNumber}`,
    };
  },

  /**
   * Send OTP via Email (Mock implementation)
   * In development, logs OTP to console instead of sending actual email
   */
  async sendEmail(
    email: string,
    otp: string,
    purpose: string,
    recipientName?: string
  ): Promise<OTPDeliveryResult> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('='.repeat(60));
    console.log('[OTP DELIVERY - MOCK MODE]');
    console.log(`Email: ${email}`);
    console.log(`Recipient: ${recipientName || 'Unknown'}`);
    console.log(`Purpose: ${purpose}`);
    console.log(`OTP Code: ${otp}`);
    console.log('NOTE: In production, this would be sent via SendGrid Email');
    console.log('='.repeat(60));
    
    return {
      success: true,
      provider: 'mock',
      messageId: `mock-email-${Date.now()}`,
      deliveredAt: new Date().toISOString(),
      developmentNote: `Mock Email - OTP: ${otp} sent to ${email}`,
    };
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

  /**
   * Production implementation template
   * This shows how to implement real OTP delivery via Supabase Edge Function
   */
  getProductionImplementationGuide(): string {
    return `
## Production OTP Delivery Implementation

### 1. Create Supabase Edge Function (supabase/functions/send-otp/index.ts):

\`\`\`typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { method, destination, otp, purpose } = await req.json()
  
  if (method === 'phone') {
    // Twilio SMS
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')
    
    const response = await fetch(
      \`https://api.twilio.com/2010-04-01/Accounts/\${accountSid}/Messages.json\`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(\`\${accountSid}:\${authToken}\`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: destination,
          From: fromNumber,
          Body: \`Your PACT verification code: \${otp}\`,
        }),
      }
    )
    return new Response(JSON.stringify(await response.json()))
  } else {
    // SendGrid Email
    const apiKey = Deno.env.get('SENDGRID_API_KEY')
    // ... SendGrid implementation
  }
})
\`\`\`

### 2. Set secrets in Supabase:
\`\`\`bash
supabase secrets set TWILIO_ACCOUNT_SID=xxx
supabase secrets set TWILIO_AUTH_TOKEN=xxx
supabase secrets set TWILIO_FROM_NUMBER=+1234567890
supabase secrets set SENDGRID_API_KEY=xxx
\`\`\`

### 3. Call Edge Function from this service:
\`\`\`typescript
const { data, error } = await supabase.functions.invoke('send-otp', {
  body: { method, destination, otp, purpose }
})
\`\`\`
    `;
  },
};

export default OTPDeliveryService;
