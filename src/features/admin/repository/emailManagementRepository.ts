import { supabase } from '@/integrations/supabase/client';

export async function fetchProfilesForEmailCompose(): Promise<{ data: any[]; error: any }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .order('full_name');

  return { data: (data || []) as any[], error };
}

export function invokeSendEmail(body: Record<string, unknown>): Promise<{ data: any; error: any }> {
  return supabase.functions.invoke('send-email', { body });
}

