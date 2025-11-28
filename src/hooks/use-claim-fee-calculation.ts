import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ClassificationLevel, ClassificationRoleScope } from '@/types/classification';

export interface ClaimFeeBreakdown {
  transportBudget: number;
  enumeratorFee: number;
  totalPayout: number;
  classificationLevel: ClassificationLevel | null;
  roleScope: ClassificationRoleScope | null;
  feeSource: 'classification' | 'default';
  currency: string;
}

export interface UseClaimFeeCalculationResult {
  calculateFeeForClaim: (siteId: string, userId: string) => Promise<ClaimFeeBreakdown | null>;
  loading: boolean;
  error: string | null;
}

const DEFAULT_ENUMERATOR_FEE_SDG = 50;

export function useClaimFeeCalculation(): UseClaimFeeCalculationResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateFeeForClaim = useCallback(async (
    siteId: string,
    userId: string
  ): Promise<ClaimFeeBreakdown | null> => {
    setLoading(true);
    setError(null);

    try {
      const { data: siteEntry, error: siteError } = await supabase
        .from('mmp_site_entries')
        .select('transport_fee, enumerator_fee, cost, additional_data')
        .eq('id', siteId)
        .single();

      if (siteError) {
        console.error('Error fetching site entry:', siteError);
        setError('Failed to load site details');
        return null;
      }

      const transportBudget = Number(siteEntry?.transport_fee) || 0;

      const { data: userClassification, error: classError } = await supabase
        .from('user_classifications')
        .select('classification_level, role_scope, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (classError) {
        console.error('Error fetching user classification:', classError);
      }

      let enumeratorFee = DEFAULT_ENUMERATOR_FEE_SDG;
      let classificationLevel: ClassificationLevel | null = null;
      let roleScope: ClassificationRoleScope | null = null;
      let feeSource: 'classification' | 'default' = 'default';

      if (userClassification) {
        classificationLevel = userClassification.classification_level as ClassificationLevel;
        roleScope = userClassification.role_scope as ClassificationRoleScope;

        const { data: feeStructure, error: feeError } = await supabase
          .from('classification_fee_structures')
          .select('site_visit_base_fee_cents, complexity_multiplier, currency, is_active')
          .eq('classification_level', classificationLevel)
          .eq('role_scope', roleScope)
          .eq('is_active', true)
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (feeError) {
          console.error('Error fetching fee structure:', feeError);
        }

        if (feeStructure) {
          // Fees are stored directly in SDG, not cents
          const baseFee = Number(feeStructure.site_visit_base_fee_cents) || 0;
          const multiplier = Number(feeStructure.complexity_multiplier) || 1.0;
          enumeratorFee = Math.round(baseFee * multiplier * 100) / 100; // Round to 2 decimals
          feeSource = 'classification';
        }
      }

      const totalPayout = transportBudget + enumeratorFee;

      return {
        transportBudget,
        enumeratorFee,
        totalPayout,
        classificationLevel,
        roleScope,
        feeSource,
        currency: 'SDG'
      };
    } catch (err) {
      console.error('Error calculating claim fee:', err);
      setError('Failed to calculate fees');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    calculateFeeForClaim,
    loading,
    error
  };
}

export async function calculateEnumeratorFeeForUser(userId: string): Promise<{
  fee: number;
  classificationLevel: ClassificationLevel | null;
  source: 'classification' | 'default';
}> {
  try {
    const { data: userClassification } = await supabase
      .from('user_classifications')
      .select('classification_level, role_scope')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!userClassification) {
      return { fee: DEFAULT_ENUMERATOR_FEE_SDG, classificationLevel: null, source: 'default' };
    }

    const { data: feeStructure } = await supabase
      .from('classification_fee_structures')
      .select('site_visit_base_fee_cents, complexity_multiplier')
      .eq('classification_level', userClassification.classification_level)
      .eq('role_scope', userClassification.role_scope)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!feeStructure) {
      return { 
        fee: DEFAULT_ENUMERATOR_FEE_SDG, 
        classificationLevel: userClassification.classification_level as ClassificationLevel, 
        source: 'default' 
      };
    }

    // Fees are stored directly in SDG, not cents
    const baseFee = Number(feeStructure.site_visit_base_fee_cents) || 0;
    const multiplier = Number(feeStructure.complexity_multiplier) || 1.0;
    const fee = Math.round(baseFee * multiplier * 100) / 100; // Round to 2 decimals

    return {
      fee,
      classificationLevel: userClassification.classification_level as ClassificationLevel,
      source: 'classification'
    };
  } catch (err) {
    console.error('Error calculating enumerator fee:', err);
    return { fee: DEFAULT_ENUMERATOR_FEE_SDG, classificationLevel: null, source: 'default' };
  }
}

export default useClaimFeeCalculation;
