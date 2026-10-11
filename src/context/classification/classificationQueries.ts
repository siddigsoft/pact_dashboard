/**
 * React Query keys and hooks for Classification data.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { UserClassification, ClassificationFeeStructure } from '@/types/classification';

export const classificationQueryKeys = {
  all: ['classification'] as const,
  userClassifications: () => [...classificationQueryKeys.all, 'user'] as const,
  feeStructures: () => [...classificationQueryKeys.all, 'fee'] as const,
};

function transformUserClassificationFromDB(data: any): UserClassification {
  return {
    id: data.id,
    userId: data.user_id,
    classificationLevel: data.classification_level,
    roleScope: data.role_scope,
    effectiveFrom: data.effective_from,
    effectiveUntil: data.effective_until,
    hasRetainer: data.has_retainer,
    retainerAmountCents: parseInt(data.retainer_amount_cents || 0),
    retainerCurrency: data.retainer_currency,
    retainerPayoutCurrency: data.retainer_payout_currency ?? undefined,
    retainerFrequency: data.retainer_frequency,
    assignedBy: data.assigned_by,
    changeReason: data.change_reason,
    notes: data.notes,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformFeeStructureFromDB(data: any): ClassificationFeeStructure {
  const fromCol = data.effective_from ?? data.valid_from;
  const untilCol = data.effective_until ?? data.valid_until;
  return {
    id: data.id,
    classificationLevel: data.classification_level,
    roleScope: data.role_scope,
    siteVisitBaseFeeCents: parseInt(data.site_visit_base_fee_cents || 0),
    complexityMultiplier: parseFloat(data.complexity_multiplier || 1.0),
    currency: data.currency,
    validFrom: fromCol,
    validUntil: untilCol,
    metadata: data.metadata,
    isActive: data.is_active,
    createdBy: data.created_by,
    updatedBy: data.updated_by,
    changeNotes: data.change_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// Retainer columns are not selectable on user_classifications; they come from the
// user_classification_retainers view, which only returns rows the caller may see.
export const CLASSIFICATION_BASE_COLUMNS =
  'id, user_id, classification_level, role_scope, effective_from, effective_until, assigned_by, change_reason, notes, is_active, created_at, updated_at';

export async function withRetainers<T extends { id: string }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await (supabase as any)
    .from('user_classification_retainers')
    .select('id, has_retainer, retainer_amount_cents, retainer_currency, retainer_payout_currency, retainer_frequency');
  if (error) {
    console.warn('[Classification] Could not load retainers:', error.message);
    return rows;
  }
  const byId = new Map<string, Record<string, unknown>>((data ?? []).map((r: any) => [r.id, r]));
  return rows.map(row => ({ ...row, ...(byId.get(row.id) ?? {}) }));
}

async function fetchUserClassifications(): Promise<UserClassification[]> {
  try {
    const { data, error } = await supabase
      .from('user_classifications')
      .select(CLASSIFICATION_BASE_COLUMNS)
      .order('effective_from', { ascending: false });

    if (error) throw error;
    return (await withRetainers((data || []) as any[])).map(transformUserClassificationFromDB);
  } catch (err: any) {
    console.warn('[Classification] Could not load user classifications:', err?.message || err);
    return [];
  }
}

async function fetchFeeStructures(): Promise<ClassificationFeeStructure[]> {
  try {
    const { data, error } = await supabase
      .from('classification_fee_structures')
      .select('*')
      .order('effective_from', { ascending: false });

    if (error) throw error;
    return (data || []).map(transformFeeStructureFromDB);
  } catch (err: any) {
    console.warn('[Classification] Could not load fee structures:', err?.message || err);
    return [];
  }
}

const STALE_MS = 60 * 1000;

export function useUserClassificationsQuery(enabled = true) {
  return useQuery({
    queryKey: classificationQueryKeys.userClassifications(),
    queryFn: fetchUserClassifications,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useFeeStructuresQuery(enabled = true) {
  return useQuery({
    queryKey: classificationQueryKeys.feeStructures(),
    queryFn: fetchFeeStructures,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useInvalidateClassificationQueries() {
  const queryClient = useQueryClient();
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: classificationQueryKeys.all }),
    invalidateUserClassifications: () => queryClient.invalidateQueries({ queryKey: classificationQueryKeys.userClassifications() }),
    invalidateFeeStructures: () => queryClient.invalidateQueries({ queryKey: classificationQueryKeys.feeStructures() }),
  };
}

export { transformUserClassificationFromDB, transformFeeStructureFromDB };
