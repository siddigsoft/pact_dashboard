import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface MFAFactor {
  id: string;
  friendly_name?: string;
  factor_type: 'totp' | 'phone';
  status: 'verified' | 'unverified';
  created_at: string;
  updated_at: string;
}

export interface EnrollmentData {
  id: string;
  qr_code: string;
  secret: string;
  uri: string;
}

export interface MFAState {
  isLoading: boolean;
  factors: MFAFactor[];
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  enrollmentData: EnrollmentData | null;
}

export function useMFA() {
  const { toast } = useToast();
  const [state, setState] = useState<MFAState>({
    isLoading: false,
    factors: [],
    currentLevel: null,
    nextLevel: null,
    enrollmentData: null,
  });

  const getAuthenticatorAssuranceLevel = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (error) {
        console.error('Error getting AAL:', error);
        return null;
      }
      
      setState(prev => ({
        ...prev,
        currentLevel: data.currentLevel as 'aal1' | 'aal2',
        nextLevel: data.nextLevel as 'aal1' | 'aal2',
        isLoading: false,
      }));
      
      return data;
    } catch (error) {
      console.error('Error getting AAL:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return null;
    }
  }, []);

  const listFactors = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const { data, error } = await supabase.auth.mfa.listFactors();
      
      if (error) {
        console.error('Error listing factors:', error);
        setState(prev => ({ ...prev, isLoading: false }));
        return [];
      }
      
      const totpFactors = (data.totp || []).map(f => ({
        id: f.id,
        friendly_name: f.friendly_name,
        factor_type: 'totp' as const,
        status: f.status as 'verified' | 'unverified',
        created_at: f.created_at,
        updated_at: f.updated_at,
      }));
      
      setState(prev => ({
        ...prev,
        factors: totpFactors,
        isLoading: false,
      }));
      
      return totpFactors;
    } catch (error) {
      console.error('Error listing factors:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return [];
    }
  }, []);

  const enrollTOTP = useCallback(async (friendlyName?: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName || 'Authenticator App',
      });
      
      if (error) {
        console.error('Error enrolling TOTP:', error);
        toast({
          title: 'Enrollment Failed',
          description: error.message || 'Failed to set up two-factor authentication.',
          variant: 'destructive',
        });
        setState(prev => ({ ...prev, isLoading: false }));
        return null;
      }
      
      const enrollmentData: EnrollmentData = {
        id: data.id,
        qr_code: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      };
      
      setState(prev => ({
        ...prev,
        enrollmentData,
        isLoading: false,
      }));
      
      return enrollmentData;
    } catch (error: any) {
      console.error('Error enrolling TOTP:', error);
      toast({
        title: 'Enrollment Failed',
        description: error?.message || 'Failed to set up two-factor authentication.',
        variant: 'destructive',
      });
      setState(prev => ({ ...prev, isLoading: false }));
      return null;
    }
  }, [toast]);

  const verifyTOTP = useCallback(async (factorId: string, code: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      
      if (challengeError) {
        console.error('Error creating challenge:', challengeError);
        toast({
          title: 'Verification Failed',
          description: challengeError.message || 'Failed to create verification challenge.',
          variant: 'destructive',
        });
        setState(prev => ({ ...prev, isLoading: false }));
        return false;
      }
      
      const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      
      if (error) {
        console.error('Error verifying TOTP:', error);
        toast({
          title: 'Invalid Code',
          description: 'The verification code is incorrect. Please try again.',
          variant: 'destructive',
        });
        setState(prev => ({ ...prev, isLoading: false }));
        return false;
      }
      
      toast({
        title: 'Verification Successful',
        description: 'Two-factor authentication has been verified.',
      });
      
      setState(prev => ({
        ...prev,
        enrollmentData: null,
        currentLevel: 'aal2',
        isLoading: false,
      }));
      
      await listFactors();
      return true;
    } catch (error: any) {
      console.error('Error verifying TOTP:', error);
      toast({
        title: 'Verification Failed',
        description: error?.message || 'Failed to verify the code.',
        variant: 'destructive',
      });
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [toast, listFactors]);

  const unenrollFactor = useCallback(async (factorId: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      
      if (error) {
        console.error('Error unenrolling factor:', error);
        toast({
          title: 'Removal Failed',
          description: error.message || 'Failed to remove two-factor authentication.',
          variant: 'destructive',
        });
        setState(prev => ({ ...prev, isLoading: false }));
        return false;
      }
      
      toast({
        title: 'Two-Factor Removed',
        description: 'Two-factor authentication has been disabled.',
      });
      
      await listFactors();
      await getAuthenticatorAssuranceLevel();
      return true;
    } catch (error: any) {
      console.error('Error unenrolling factor:', error);
      toast({
        title: 'Removal Failed',
        description: error?.message || 'Failed to remove two-factor authentication.',
        variant: 'destructive',
      });
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [toast, listFactors, getAuthenticatorAssuranceLevel]);

  const challengeAndVerify = useCallback(async (factorId: string, code: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      
      if (challengeError) {
        console.error('Error creating challenge:', challengeError);
        setState(prev => ({ ...prev, isLoading: false }));
        return { success: false, error: challengeError.message };
      }
      
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      
      if (verifyError) {
        console.error('Error verifying:', verifyError);
        setState(prev => ({ ...prev, isLoading: false }));
        return { success: false, error: 'Invalid verification code. Please try again.' };
      }
      
      setState(prev => ({
        ...prev,
        currentLevel: 'aal2',
        isLoading: false,
      }));
      
      return { success: true };
    } catch (error: any) {
      console.error('Error in challenge and verify:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return { success: false, error: error?.message || 'Verification failed.' };
    }
  }, []);

  const requiresMFA = useCallback(async () => {
    const aalData = await getAuthenticatorAssuranceLevel();
    if (!aalData) return false;
    return aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2';
  }, [getAuthenticatorAssuranceLevel]);

  const hasMFAEnabled = useCallback(async () => {
    const factors = await listFactors();
    return factors.some(f => f.status === 'verified');
  }, [listFactors]);

  const clearEnrollment = useCallback(() => {
    setState(prev => ({ ...prev, enrollmentData: null }));
  }, []);

  const checkMFAStatus = useCallback(async () => {
    await listFactors();
    await getAuthenticatorAssuranceLevel();
  }, [listFactors, getAuthenticatorAssuranceLevel]);

  const unenrollMFA = useCallback(async () => {
    const factors = await listFactors();
    const verifiedFactors = factors.filter(f => f.status === 'verified');
    
    if (verifiedFactors.length === 0) {
      return true;
    }
    
    let success = true;
    for (const factor of verifiedFactors) {
      const result = await unenrollFactor(factor.id);
      if (!result) {
        success = false;
        break;
      }
    }
    
    return success;
  }, [listFactors, unenrollFactor]);

  const mfaEnabled = state.factors.some(f => f.status === 'verified');

  return {
    ...state,
    loading: state.isLoading,
    mfaEnabled,
    enrollTOTP,
    verifyTOTP,
    unenrollFactor,
    unenrollMFA,
    listFactors,
    getAuthenticatorAssuranceLevel,
    challengeAndVerify,
    requiresMFA,
    hasMFAEnabled,
    clearEnrollment,
    checkMFAStatus,
  };
}
