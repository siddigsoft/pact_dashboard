/**
 * Classification repository — all Supabase DB access for the classification domain.
 * Pure async functions: no React, no hooks, no toasts.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  UserClassification,
  ClassificationFeeStructure,
  ClassificationHistory,
  CurrentUserClassification,
  CreateClassificationRequest,
  CreateFeeStructureRequest,
  UpdateClassificationRequest,
  UpdateFeeStructureRequest,
} from '@/types/classification';

// ─── Transforms ───────────────────────────────────────────────────────────────

export function transformUserClassificationFromDB(data: any): UserClassification {
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
    retainerFrequency: data.retainer_frequency,
    assignedBy: data.assigned_by,
    changeReason: data.change_reason,
    notes: data.notes,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export function transformFeeStructureFromDB(data: any): ClassificationFeeStructure {
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

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchUserClassifications(): Promise<UserClassification[]> {
  try {
    const { data, error } = await supabase
      .from('user_classifications')
      .select('*')
      .order('effective_from', { ascending: false });
    if (error) throw error;
    return (data || []).map(transformUserClassificationFromDB);
  } catch (err: any) {
    console.warn('[Classification] Could not load user classifications:', err?.message || err);
    return [];
  }
}

export async function fetchFeeStructures(): Promise<ClassificationFeeStructure[]> {
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

export async function fetchClassificationHistory(userId: string): Promise<ClassificationHistory[]> {
  const { data, error } = await supabase
    .from('user_classifications')
    .select('id, classification_level, role_scope, effective_from, effective_until, assigned_by, change_reason, created_at')
    .eq('user_id', userId)
    .order('effective_from', { ascending: false });
  if (error) throw error;
  return (data || []).map((item: any) => ({
    id: item.id,
    classificationLevel: item.classification_level,
    roleScope: item.role_scope,
    effectiveFrom: item.effective_from,
    effectiveUntil: item.effective_until,
    assignedBy: item.assigned_by,
    changeReason: item.change_reason,
    createdAt: item.created_at,
  }));
}

export async function fetchCurrentUserClassifications(): Promise<CurrentUserClassification[]> {
  const { data, error } = await supabase
    .from('user_classifications')
    .select(`
      *,
      profiles!user_classifications_user_id_fkey (
        full_name,
        email,
        role
      )
    `);
  if (error) throw error;
  return (data || []).map((item: any) => ({
    id: item.id,
    userId: item.user_id,
    classificationLevel: item.classification_level,
    roleScope: item.role_scope,
    effectiveFrom: item.effective_from,
    effectiveUntil: item.effective_until,
    hasRetainer: item.has_retainer,
    retainerAmountCents: parseInt(item.retainer_amount_cents || 0),
    retainerCurrency: item.retainer_currency,
    retainerFrequency: item.retainer_frequency,
    assignedBy: item.assigned_by,
    changeReason: item.change_reason,
    notes: item.notes,
    isActive: item.is_active,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    fullName: item.profiles?.full_name || '',
    email: item.profiles?.email || '',
    userRole: item.profiles?.role || '',
  }));
}

// ─── Mutations — User Classifications ─────────────────────────────────────────

export async function insertUserClassification(
  data: CreateClassificationRequest,
  actorId: string | undefined,
): Promise<UserClassification> {
  const { data: result, error } = await supabase
    .from('user_classifications')
    .insert({
      user_id: data.userId,
      classification_level: data.classificationLevel,
      role_scope: data.roleScope,
      effective_from: data.effectiveFrom || new Date().toISOString(),
      effective_until: data.effectiveUntil,
      has_retainer: data.hasRetainer || false,
      retainer_amount_cents: data.retainerAmountCents || 0,
      retainer_currency: data.retainerCurrency || 'SDG',
      retainer_frequency: data.retainerFrequency || 'monthly',
      assigned_by: actorId,
      change_reason: data.changeReason,
      notes: data.notes,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return transformUserClassificationFromDB(result);
}

export async function updateUserClassificationRecord(
  id: string,
  data: UpdateClassificationRequest & { updatedBy?: string },
): Promise<void> {
  const updateData: any = {};
  if (data.classificationLevel !== undefined) updateData.classification_level = data.classificationLevel;
  if (data.roleScope !== undefined) updateData.role_scope = data.roleScope;
  if (data.effectiveFrom !== undefined) updateData.effective_from = data.effectiveFrom;
  if (data.effectiveUntil !== undefined) updateData.effective_until = data.effectiveUntil;
  if (data.hasRetainer !== undefined) updateData.has_retainer = data.hasRetainer;
  if (data.retainerAmountCents !== undefined) updateData.retainer_amount_cents = data.retainerAmountCents;
  if (data.retainerCurrency !== undefined) updateData.retainer_currency = data.retainerCurrency;
  if (data.retainerFrequency !== undefined) updateData.retainer_frequency = data.retainerFrequency;
  if (data.changeReason !== undefined) updateData.change_reason = data.changeReason;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.isActive !== undefined) updateData.is_active = data.isActive;

  const { error } = await supabase
    .from('user_classifications')
    .update(updateData)
    .eq('id', id);
  if (error) throw error;
}

export async function deactivateUserClassificationRecord(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('user_classifications')
    .update({
      is_active: false,
      effective_until: new Date().toISOString(),
      change_reason: reason,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deactivateClassificationForAssign(id: string, newReason: string, effectiveFrom: string): Promise<void> {
  const { error } = await supabase
    .from('user_classifications')
    .update({
      is_active: false,
      effective_until: effectiveFrom,
      change_reason: newReason,
    })
    .eq('id', id);
  if (error) throw error;
}

// ─── Mutations — Fee Structures ────────────────────────────────────────────────

export async function insertFeeStructure(
  data: CreateFeeStructureRequest,
  actorId: string | undefined,
): Promise<ClassificationFeeStructure> {
  const { data: result, error } = await supabase
    .from('classification_fee_structures')
    .insert({
      classification_level: data.classificationLevel,
      role_scope: data.roleScope,
      site_visit_base_fee_cents: data.siteVisitBaseFeeCents,
      complexity_multiplier: data.complexityMultiplier || 1.0,
      currency: data.currency || 'SDG',
      valid_from: data.validFrom || new Date().toISOString(),
      valid_until: data.validUntil,
      metadata: data.metadata,
      change_notes: data.changeNotes,
      created_by: actorId,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return transformFeeStructureFromDB(result);
}

export async function updateFeeStructureRecord(
  id: string,
  data: UpdateFeeStructureRequest,
  actorId: string | undefined,
): Promise<void> {
  const updateData: any = { updated_by: actorId };
  if (data.siteVisitBaseFeeCents !== undefined) updateData.site_visit_base_fee_cents = data.siteVisitBaseFeeCents;
  if (data.complexityMultiplier !== undefined) updateData.complexity_multiplier = data.complexityMultiplier;
  if (data.validFrom !== undefined) updateData.valid_from = data.validFrom;
  if (data.validUntil !== undefined) updateData.valid_until = data.validUntil;
  if (data.metadata !== undefined) updateData.metadata = data.metadata;
  if (data.changeNotes !== undefined) updateData.change_notes = data.changeNotes;
  if (data.isActive !== undefined) updateData.is_active = data.isActive;

  const { error } = await supabase
    .from('classification_fee_structures')
    .update(updateData)
    .eq('id', id);
  if (error) throw error;
}

export async function deactivateFeeStructureRecord(id: string, reason: string, actorId: string | undefined): Promise<void> {
  const { error } = await supabase
    .from('classification_fee_structures')
    .update({
      is_active: false,
      valid_until: new Date().toISOString(),
      change_notes: reason,
      updated_by: actorId,
    })
    .eq('id', id);
  if (error) throw error;
}
