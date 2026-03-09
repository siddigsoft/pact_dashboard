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
    // Validate uploaded_by is a valid UUID, otherwise set to null
    const isValidUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const uploadedBy = mmp.uploaded_by && isValidUUID(mmp.uploaded_by) ? mmp.uploaded_by : null;
    
    const row = {
      file_name: fileName,
      file_url: fileUrl,
      category: 'mmp_file',
      uploaded_at: mmp.created_at || new Date().toISOString(),
      uploaded_by: uploadedBy,
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

    // Extract and index permits from mmp_files.permits JSONB column
    const permits = mmp.permits || {};
    
    // Index Federal Permits
    if (permits.federalPermits && Array.isArray(permits.federalPermits)) {
      for (let i = 0; i < permits.federalPermits.length; i++) {
        const permit = permits.federalPermits[i];
        const permitSourceId = `${mmp.id}-federal-${i}`;
        const permitUrl = permit.fileUrl || permit.file_url || null;
        const permitExists = await existsInIndexBySource('mmp_files', permitSourceId) || (permitUrl && await existsInIndexByUrl(permitUrl));
        if (!permitExists && permitUrl) {
          const permitRow = {
            file_name: permit.fileName || permit.file_name || `federal-permit-${i+1}`,
            file_url: permitUrl,
            category: 'federal_permit',
            uploaded_at: permit.uploadedAt || permit.uploaded_at || mmp.created_at || new Date().toISOString(),
            uploaded_by: permit.uploadedBy || permit.uploaded_by || null,
            project_id: mmp.project_id || null,
            mmp_id: mmp.id,
            mmp_name: fileName,
            state: permit.state || null,
            month_bucket: (permit.uploadedAt || permit.uploaded_at || mmp.created_at || new Date().toISOString()).slice(0,7),
            issue_date: permit.issueDate || permit.issue_date || null,
            expiry_date: permit.expiryDate || permit.expiry_date || null,
            status: permit.status || 'pending',
            verified: permit.verified || false,
            source_type: 'permit',
            source_table: 'mmp_files',
            source_id: permitSourceId,
            metadata: permit || {}
          };
          const ok = await insertDocument(permitRow);
          if (ok) console.log('Indexed federal permit', permitSourceId);
        }
      }
    }

    // Index State Permits
    if (permits.statePermits && Array.isArray(permits.statePermits)) {
      for (let i = 0; i < permits.statePermits.length; i++) {
        const permit = permits.statePermits[i];
        const permitSourceId = `${mmp.id}-state-${i}`;
        const permitUrl = permit.fileUrl || permit.file_url || null;
        const permitExists = await existsInIndexBySource('mmp_files', permitSourceId) || (permitUrl && await existsInIndexByUrl(permitUrl));
        if (!permitExists && permitUrl) {
          const permitRow = {
            file_name: permit.fileName || permit.file_name || `state-permit-${i+1}`,
            file_url: permitUrl,
            category: 'state_permit',
            uploaded_at: permit.uploadedAt || permit.uploaded_at || mmp.created_at || new Date().toISOString(),
            uploaded_by: permit.uploadedBy || permit.uploaded_by || null,
            project_id: mmp.project_id || null,
            mmp_id: mmp.id,
            mmp_name: fileName,
            state: permit.state || null,
            month_bucket: (permit.uploadedAt || permit.uploaded_at || mmp.created_at || new Date().toISOString()).slice(0,7),
            issue_date: permit.issueDate || permit.issue_date || null,
            expiry_date: permit.expiryDate || permit.expiry_date || null,
            status: permit.status || 'pending',
            verified: permit.verified || false,
            source_type: 'permit',
            source_table: 'mmp_files',
            source_id: permitSourceId,
            metadata: permit || {}
          };
          const ok = await insertDocument(permitRow);
          if (ok) console.log('Indexed state permit', permitSourceId);
        }
      }
    }

    // Index Locality Permits
    if (permits.localityPermits && Array.isArray(permits.localityPermits)) {
      for (let i = 0; i < permits.localityPermits.length; i++) {
        const permit = permits.localityPermits[i];
        const permitSourceId = `${mmp.id}-locality-${i}`;
        const permitUrl = permit.fileUrl || permit.file_url || null;
        const permitExists = await existsInIndexBySource('mmp_files', permitSourceId) || (permitUrl && await existsInIndexByUrl(permitUrl));
        if (!permitExists && permitUrl) {
          const permitRow = {
            file_name: permit.fileName || permit.file_name || `locality-permit-${i+1}`,
            file_url: permitUrl,
            category: 'local_permit',
            uploaded_at: permit.uploadedAt || permit.uploaded_at || mmp.created_at || new Date().toISOString(),
            uploaded_by: permit.uploadedBy || permit.uploaded_by || null,
            project_id: mmp.project_id || null,
            mmp_id: mmp.id,
            mmp_name: fileName,
            state: permit.state || null,
            locality: permit.locality || null,
            month_bucket: (permit.uploadedAt || permit.uploaded_at || mmp.created_at || new Date().toISOString()).slice(0,7),
            issue_date: permit.issueDate || permit.issue_date || null,
            expiry_date: permit.expiryDate || permit.expiry_date || null,
            status: permit.status || 'pending',
            verified: permit.verified || false,
            source_type: 'permit',
            source_table: 'mmp_files',
            source_id: permitSourceId,
            metadata: permit || {}
          };
          const ok = await insertDocument(permitRow);
          if (ok) console.log('Indexed locality permit', permitSourceId);
        }
      }
    }
  }
}

async function indexPermitTable(tableName, category) {
  console.log('Indexing', tableName);
  const { data: rows, error } = await supabase.from(tableName).select('*').order('uploaded_at', { ascending: false }).limit(1000);
  if (error) {
    console.error('Failed fetching', tableName, error.message || error);
    return;
  }
  for (const r of (rows || [])) {
    const sourceId = r.id?.toString() || r.file_key || `${tableName}-${r.file_key || Math.random().toString(36).slice(2,8)}`;
    const fileUrl = r.file_url || null;
    const exists = await existsInIndexBySource(tableName, sourceId) || (fileUrl && await existsInIndexByUrl(fileUrl));
    if (exists) continue;

    // Validate uploaded_by is a valid UUID
    const isValidUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const uploadedBy = r.uploaded_by && isValidUUID(r.uploaded_by) ? r.uploaded_by : null;

    const row = {
      file_name: r.file_name || null,
      file_url: fileUrl,
      category,
      uploaded_at: r.uploaded_at || new Date().toISOString(),
      uploaded_by: uploadedBy,
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
    // Permits are now extracted from mmp_files.permits JSONB during indexMMPFiles()
    // The following are kept for backward compatibility if separate permit tables exist:
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
