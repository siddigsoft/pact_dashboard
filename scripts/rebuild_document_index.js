#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function existsInIndexBySource(sourceTable, sourceId) {
  const { data, error } = await supabase.from('document_index').select('id').eq('source_table', sourceTable).eq('source_id', sourceId).limit(1);
  return !error && data && data.length > 0;
}

async function existsInIndexByUrl(url) {
  if (!url) return false;
  const { data, error } = await supabase.from('document_index').select('id').eq('file_url', url).limit(1);
  return !error && data && data.length > 0;
}

async function insertDocument(row) {
  const { error } = await supabase.from('document_index').insert(row);
  if (error) {
    console.error('Insert failed', error.message || error);
    return false;
  }
  return true;
}

async function indexMMPFiles() {
  console.log('Indexing mmp_files...');
  const { data: mmpFiles, error } = await supabase
    .from('mmp_files')
    .select('id, name, original_filename, file_url, created_at, permits, project_id, status, uploaded_by')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed fetching mmp_files', error.message || error);
    return;
  }
  for (const mmp of (mmpFiles || [])) {
    const sourceId = mmp.id;
    const fileUrl = mmp.file_url || null;
    const exists = await existsInIndexBySource('mmp_files', sourceId) || (fileUrl && await existsInIndexByUrl(fileUrl));
    if (exists) continue;

    const fileName = mmp.original_filename || mmp.name || 'MMP File';
    const row = {
      file_name: fileName,
      file_url: fileUrl,
      category: 'mmp_file',
      uploaded_at: mmp.created_at || new Date().toISOString(),
      uploaded_by: mmp.uploaded_by,
      project_id: mmp.project_id || null,
      mmp_id: mmp.id,
      mmp_name: fileName,
      month_bucket: mmp.created_at ? mmp.created_at.slice(0,7) : (new Date()).toISOString().slice(0,7),
      status: mmp.status === 'approved' ? 'approved' : 'pending',
      verified: mmp.status === 'approved',
      source_type: 'mmp',
      source_table: 'mmp_files',
      source_id: sourceId,
      metadata: {}
    };
    const ok = await insertDocument(row);
    if (ok) console.log('Indexed MMP', sourceId);
  }
}

async function indexPermitTable(tableName, category) {
  console.log('Indexing', tableName);
  const { data: rows, error } = await supabase.from(tableName).select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) {
    console.error('Failed fetching', tableName, error.message || error);
    return;
  }
  for (const r of (rows || [])) {
    const sourceId = r.id?.toString() || r.file_key || `${tableName}-${r.file_key || Math.random().toString(36).slice(2,8)}`;
    const fileUrl = r.file_url || null;
    const exists = await existsInIndexBySource(tableName, sourceId) || (fileUrl && await existsInIndexByUrl(fileUrl));
    if (exists) continue;

    const row = {
      file_name: r.file_name || null,
      file_url: fileUrl,
      category,
      uploaded_at: r.uploaded_at || r.created_at || new Date().toISOString(),
      project_id: r.project_id || null,
      mmp_id: r.mmp_id || null,
      mmp_name: r.mmp_name || null,
      state: r.state || null,
      locality: r.locality || null,
      site_visit_id: r.site_visit_id || null,
      month_bucket: r.uploaded_at ? (r.uploaded_at.slice(0,7)) : (new Date()).toISOString().slice(0,7),
      issue_date: r.issue_date || null,
      expiry_date: r.expiry_date || null,
      status: r.status || 'pending',
      verified: r.verified || false,
      source_type: 'permit',
      source_table: tableName,
      source_id: sourceId,
      metadata: r.source_meta || {}
    };

    const ok = await insertDocument(row);
    if (ok) console.log('Inserted', tableName, sourceId);
  }
}

async function indexSitePhotos() {
  console.log('Indexing site_visit_photos');
  const { data: rows, error } = await supabase.from('site_visit_photos').select('*').order('uploaded_at', { ascending: false }).limit(1000);
  if (error) {
    console.error('Failed fetching site_visit_photos', error.message || error);
    return;
  }
  for (const r of (rows || [])) {
    const sourceId = r.id?.toString() || r.file_key || `site-photo-${r.file_key || Math.random().toString(36).slice(2,8)}`;
    const fileUrl = r.file_url || null;
    const exists = await existsInIndexBySource('site_visit_photos', sourceId) || (fileUrl && await existsInIndexByUrl(fileUrl));
    if (exists) continue;

    const row = {
      file_name: null,
      file_url: fileUrl,
      category: 'site_photo',
      uploaded_at: r.uploaded_at || new Date().toISOString(),
      mmp_id: r.mmp_id || null,
      site_visit_id: r.site_visit_id || null,
      site_visit_code: r.site_name || null,
      state: r.state || null,
      locality: r.locality || null,
      project_id: r.project_id || null,
      month_bucket: r.uploaded_at ? (r.uploaded_at.slice(0,7)) : (new Date()).toISOString().slice(0,7),
      status: 'pending',
      verified: false,
      source_type: 'photo',
      source_table: 'site_visit_photos',
      source_id: sourceId,
      metadata: r.source_meta || {}
    };
    const ok = await insertDocument(row);
    if (ok) console.log('Inserted site photo', sourceId);
  }
}

async function indexCostSubmissions() {
  console.log('Indexing cost submissions');
  const { data: costs, error } = await supabase.from('site_visit_cost_submissions').select('id, supporting_documents, submitted_at, created_at, status, site_visit_id, project_id, submitted_by').order('created_at',{ascending:false}).limit(1000);
  if (error) {
    console.error('Failed fetching cost submissions', error.message || error);
    return;
  }
  for (const cost of (costs || [])) {
    const docs = cost.supporting_documents || [];
    for (let i=0;i<docs.length;i++) {
      const doc = docs[i];
      const fileUrl = doc.url || doc.fileUrl || null;
      if (!fileUrl) continue;
      const sourceId = `${cost.id}-${i}`;
      const exists = await existsInIndexBySource('site_visit_cost_submissions', sourceId) || await existsInIndexByUrl(fileUrl);
      if (exists) continue;
      const row = {
        file_name: doc.filename || doc.fileName || `cost-${i+1}`,
        file_url: fileUrl,
        category: 'cost_receipt',
        uploaded_at: doc.uploadedAt || doc.uploaded_at || cost.submitted_at || cost.created_at || new Date().toISOString(),
        uploaded_by: cost.submitted_by || null,
        project_id: cost.project_id || null,
        site_visit_id: cost.site_visit_id || null,
        month_bucket: (doc.uploadedAt || doc.uploaded_at || cost.submitted_at || cost.created_at || new Date().toISOString()).slice(0,7),
        status: cost.status || 'pending',
        verified: cost.status === 'approved' || cost.status === 'paid',
        source_type: 'cost',
        source_table: 'site_visit_cost_submissions',
        source_id: sourceId,
        metadata: doc || {}
      };
      const ok = await insertDocument(row);
      if (ok) console.log('Inserted cost doc', sourceId);
    }
  }
}

async function main(){
  try{
    await indexMMPFiles();
    await indexPermitTable('state_permits','state_permit');
    await indexPermitTable('local_permits','local_permit');
    await indexPermitTable('federal_permits','federal_permit');
    await indexSitePhotos();
    await indexCostSubmissions();
    console.log('Rebuild complete');
    process.exit(0);
  }catch(e){
    console.error('Rebuild failed', e);
    process.exit(1);
  }
}

main();
