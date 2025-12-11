/**
 * Verification Enforcement Service
 * Enforces phone/email pre-verification before allowing signature methods
 */

import { supabase } from '@/integrations/supabase/client';
import type { SignatureMethod } from '@/types/signature';

export interface VerificationStatus {
  method: 'phone' | 'email';
  verified: boolean;
  verifiedAt?: string;
  destination?: string;
  lastVerificationRequest?: string;
}

export interface EnforcementResult {
  allowed: boolean;
  reason?: string;
  requiredAction?: 'verify_phone' | 'verify_email' | 'add_phone' | 'add_email';
  verificationStatus: VerificationStatus[];
}

export interface UserVerificationProfile {
  id: string;
  phone?: string;
  email?: string;
  phoneVerified: boolean;
  phoneVerifiedAt?: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
}

export const VerificationEnforcementService = {
  /**
   * Check if a user has the required verification for a signature method
   */
  async checkMethodAllowed(
    userId: string,
    method: SignatureMethod
  ): Promise<EnforcementResult> {
    if (method === 'uuid' || method === 'handwriting' || method === 'biometric') {
      return {
        allowed: true,
        verificationStatus: [],
      };
    }

    const profile = await this.getUserVerificationProfile(userId);
    
    if (!profile) {
      return {
        allowed: false,
        reason: 'User profile not found',
        verificationStatus: [],
      };
    }

    if (method === 'phone') {
      return this.checkPhoneVerification(profile);
    }

    if (method === 'email') {
      return this.checkEmailVerification(profile);
    }

    return {
      allowed: true,
      verificationStatus: [],
    };
  },

  /**
   * Check phone verification status
   */
  checkPhoneVerification(profile: UserVerificationProfile): EnforcementResult {
    const verificationStatus: VerificationStatus = {
      method: 'phone',
      verified: profile.phoneVerified,
      verifiedAt: profile.phoneVerifiedAt,
      destination: profile.phone,
    };

    if (!profile.phone) {
      return {
        allowed: false,
        reason: 'No phone number registered. Please add and verify your phone number first.',
        requiredAction: 'add_phone',
        verificationStatus: [verificationStatus],
      };
    }

    if (!profile.phoneVerified) {
      return {
        allowed: false,
        reason: 'Phone number not verified. Please verify your phone number in settings before using phone-based signatures.',
        requiredAction: 'verify_phone',
        verificationStatus: [verificationStatus],
      };
    }

    return {
      allowed: true,
      verificationStatus: [verificationStatus],
    };
  },

  /**
   * Check email verification status
   */
  checkEmailVerification(profile: UserVerificationProfile): EnforcementResult {
    const verificationStatus: VerificationStatus = {
      method: 'email',
      verified: profile.emailVerified,
      verifiedAt: profile.emailVerifiedAt,
      destination: profile.email,
    };

    if (!profile.email) {
      return {
        allowed: false,
        reason: 'No email address registered. Please add and verify your email first.',
        requiredAction: 'add_email',
        verificationStatus: [verificationStatus],
      };
    }

    if (!profile.emailVerified) {
      return {
        allowed: false,
        reason: 'Email address not verified. Please verify your email in settings before using email-based signatures.',
        requiredAction: 'verify_email',
        verificationStatus: [verificationStatus],
      };
    }

    return {
      allowed: true,
      verificationStatus: [verificationStatus],
    };
  },

  /**
   * Get user's verification profile from database
   */
  async getUserVerificationProfile(userId: string): Promise<UserVerificationProfile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone, email, phone_verified, phone_verified_at, email_verified, email_verified_at')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('[VerificationEnforcementService] Error fetching user profile:', error);
        return null;
      }

      return {
        id: data.id,
        phone: data.phone || undefined,
        email: data.email || undefined,
        phoneVerified: data.phone_verified || false,
        phoneVerifiedAt: data.phone_verified_at || undefined,
        emailVerified: data.email_verified || false,
        emailVerifiedAt: data.email_verified_at || undefined,
      };
    } catch (error) {
      console.error('[VerificationEnforcementService] Error in getUserVerificationProfile:', error);
      return null;
    }
  },

  /**
   * Mark phone as verified
   */
  async markPhoneVerified(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        console.error('[VerificationEnforcementService] Error marking phone verified:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[VerificationEnforcementService] Error in markPhoneVerified:', error);
      return false;
    }
  },

  /**
   * Mark email as verified
   */
  async markEmailVerified(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          email_verified: true,
          email_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        console.error('[VerificationEnforcementService] Error marking email verified:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[VerificationEnforcementService] Error in markEmailVerified:', error);
      return false;
    }
  },

  /**
   * Get all available signature methods for a user based on their verification status
   */
  async getAvailableSignatureMethods(userId: string): Promise<{
    methods: SignatureMethod[];
    unavailableMethods: { method: SignatureMethod; reason: string }[];
  }> {
    const profile = await this.getUserVerificationProfile(userId);
    const availableMethods: SignatureMethod[] = ['uuid', 'handwriting'];
    const unavailableMethods: { method: SignatureMethod; reason: string }[] = [];

    if (!profile) {
      return {
        methods: availableMethods,
        unavailableMethods: [
          { method: 'phone', reason: 'Profile not found' },
          { method: 'email', reason: 'Profile not found' },
        ],
      };
    }

    if (profile.phone && profile.phoneVerified) {
      availableMethods.push('phone');
    } else if (!profile.phone) {
      unavailableMethods.push({ method: 'phone', reason: 'No phone number registered' });
    } else {
      unavailableMethods.push({ method: 'phone', reason: 'Phone number not verified' });
    }

    if (profile.email && profile.emailVerified) {
      availableMethods.push('email');
    } else if (!profile.email) {
      unavailableMethods.push({ method: 'email', reason: 'No email address registered' });
    } else {
      unavailableMethods.push({ method: 'email', reason: 'Email address not verified' });
    }

    return { methods: availableMethods, unavailableMethods };
  },

  /**
   * Send verification code for phone or email verification
   */
  async sendVerificationCode(
    userId: string,
    method: 'phone' | 'email'
  ): Promise<{ success: boolean; requestId?: string; error?: string }> {
    const profile = await this.getUserVerificationProfile(userId);

    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    const destination = method === 'phone' ? profile.phone : profile.email;

    if (!destination) {
      return {
        success: false,
        error: method === 'phone'
          ? 'No phone number registered'
          : 'No email address registered',
      };
    }

    const { SignatureService } = await import('./signature.service');

    try {
      const result = await SignatureService.createVerificationRequest({
        userId,
        method,
        destination,
        purpose: 'login',
      });

      return {
        success: true,
        requestId: result.requestId,
      };
    } catch (error) {
      console.error('[VerificationEnforcementService] Error sending verification code:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send verification code',
      };
    }
  },

  /**
   * Verify code and mark method as verified
   */
  async verifyCodeAndMark(
    userId: string,
    requestId: string,
    code: string,
    method: 'phone' | 'email'
  ): Promise<{ success: boolean; error?: string }> {
    const { SignatureService } = await import('./signature.service');

    const result = await SignatureService.verifyCode(requestId, code);

    if (!result.verified) {
      return { success: false, error: result.error };
    }

    const markSuccess = method === 'phone'
      ? await this.markPhoneVerified(userId)
      : await this.markEmailVerified(userId);

    if (!markSuccess) {
      return { success: false, error: 'Failed to update verification status' };
    }

    return { success: true };
  },
};

export default VerificationEnforcementService;
