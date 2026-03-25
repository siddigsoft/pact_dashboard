/**
 * Archive — raw reads for archive dashboard aggregation.
 */
import { supabase } from '@/integrations/supabase/client';

export async function fetchMmpFilesForArchive() {
  return supabase.from('mmp_files').select('*').order('created_at', { ascending: false });
}

export async function fetchMmpSiteEntriesForArchive() {
  return supabase.from('mmp_site_entries').select('*').order('created_at', { ascending: false });
}

export async function fetchReportPhotosForArchive() {
  return supabase.from('report_photos').select('*').order('created_at', { ascending: false });
}
