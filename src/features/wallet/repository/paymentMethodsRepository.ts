/**
 * User payment_methods table — used by wallet UI (PaymentMethodsCard).
 */
import { supabase } from '@/integrations/supabase/client';

export function fetchPaymentMethodsForUser(userId: string) {
  return supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export function insertPaymentMethodRow(methodData: Record<string, unknown>) {
  return supabase.from('payment_methods').insert(methodData).select().single();
}

export function updatePaymentMethodRow(id: string, updateData: Record<string, unknown>) {
  return supabase.from('payment_methods').update(updateData).eq('id', id).select().single();
}

export function deletePaymentMethodRow(id: string) {
  return supabase.from('payment_methods').delete().eq('id', id);
}

export async function setDefaultPaymentMethodForUser(userId: string, methodId: string) {
  const ts = new Date().toISOString();
  const { error: clearError } = await supabase
    .from('payment_methods')
    .update({ is_default: false, updated_at: ts })
    .eq('user_id', userId);
  if (clearError) return { error: clearError };
  return supabase
    .from('payment_methods')
    .update({ is_default: true, updated_at: ts })
    .eq('id', methodId);
}
