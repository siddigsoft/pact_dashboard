#!/usr/bin/env node
/**
 * Backfill script: scan storage buckets and insert rows into permit/photo tables.
 * Requires environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * Usage: node scripts/backfill_storage_to_db.js
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Map buckets to target table behavior
// Extend this mapping with your actual bucket names used for permits
const BUCKET_TO_TABLE = {
  'site-visit-photos': 'site_visit_photos',
  'monitoring_photos': 'site_visit_photos',
  // permit buckets (add your real bucket names here)
  'state-permits': 'state_permits',
  'local-permits': 'local_permits',
  'federal-permits': 'federal_permits',
  // Common alternate bucket names (created via Supabase UI)
  'permits-state': 'state_permits',
  'permits-local': 'local_permits',
  'permits-federal': 'federal_permits',
  'permits': 'state_permits',
  'coordinator-permits': 'local_permits',
  // mmp-files bucket usually contains uploaded MMP CSVs; we will not insert into mmp_files from storage
  'mmp-files': null
};

async function listAllObjects(bucket) {
  const results = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list('', { limit, offset });
    if (error) {
      console.error('Error listing objects for bucket', bucket, error.message || error);
      break;
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < limit) break;
    offset += data.length;
  }
  return results;
}

async function createSignedUrl(bucket, path) {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
    if (error) return null;
    return data.signedURL || data.signedUrl || null;
  } catch (e) {
    return null;
  }
}

async function backfillBucket(bucket) {
  const table = BUCKET_TO_TABLE[bucket];
  if (!table) {
    console.log(`Skipping bucket ${bucket}: no mapping configured.`);
    return;
  }
  // Ensure bucket exists; create if not
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = (buckets || []).some(b => b.name === bucket);
    if (!exists) {
      console.log(`Bucket ${bucket} not found. Creating...`);
      await supabase.storage.createBucket(bucket, { public: true });
      console.log(`Created bucket ${bucket}`);
    }
  } catch (e) {
    console.warn('Could not verify/create bucket:', e?.message || e);
  }

  console.log(`Scanning bucket ${bucket} -> table ${table}`);
  const objects = await listAllObjects(bucket);
  console.log(`Found ${objects.length} objects in ${bucket}`);

  for (const obj of objects) {
    const path = obj.name;

    // Skip folders
    if (!path) continue;

    // Check if already present
    const { data: exists } = await supabase.from(table).select('id').eq('file_key', path).limit(1);
    if (exists && exists.length > 0) {
      // already inserted
      continue;
    }

    const signedUrl = await createSignedUrl(bucket, path);

    const row = {
      file_key: path,
      file_url: signedUrl || null,
      uploaded_at: obj.updated_at || new Date().toISOString(),
      source_meta: { size: obj.size, content_type: obj.metadata?.mimetype || obj.content_type || null }
    };

    // Try to extract site_visit_id or mmp info from path or metadata
    // conventions: site-visit-photos/{siteVisitId}/... or siteVisit_{id}_...
    const siteVisitMatch = path.match(/([0-9a-fA-F-]{8,36})/);
    if (siteVisitMatch) {
      row.site_visit_id = siteVisitMatch[1];
    }

    // If we have a site_visit_id, try to enrich row with site and mmp metadata
    if (row.site_visit_id) {
      try {
        const { data: sv } = await supabase.from('site_visits').select('id, site_name, mmp_id, state, locality, project_id').eq('id', row.site_visit_id).limit(1).single();
        if (sv) {
          row.site_name = sv.site_name || null;
          row.mmp_id = sv.mmp_id || null;
          row.state = sv.state || null;
          row.locality = sv.locality || null;
          row.project_id = sv.project_id || null;
        }
      } catch (e) {
        // ignore enrichment errors
      }
    }

    // If mmp_id still missing, try to resolve from object metadata or file path name
    if (!row.mmp_id) {
      const mmpNameCandidate = obj.metadata?.mmp_name || obj.metadata?.mmp || null;
      if (mmpNameCandidate) {
        try {
          const { data: mmpRow } = await supabase.from('mmp_files').select('id, original_filename, name').or(`original_filename.eq.${mmpNameCandidate},name.eq.${mmpNameCandidate}`).limit(1).single();
          if (mmpRow) row.mmp_id = mmpRow.id;
        } catch (e) {
          // ignore
        }
      }
    }

    // If there's no target table (e.g. mmp-files), skip insertion but log for discovery
    if (!table) {
      console.log(`Skipping DB insert for ${path} (bucket ${bucket} mapped to no table)`);
      continue;
    }

    // If target is a permit table, prepare permit-specific row
    if (['state_permits', 'local_permits', 'federal_permits'].includes(table)) {
      const permitRow = {
        file_key: row.file_key,
        file_url: row.file_url,
        file_name: row.file_name,
        uploaded_at: row.uploaded_at,
        mmp_id: row.mmp_id || null,
        mmp_name: obj.metadata?.mmp_name || obj.metadata?.mmp || null,
        project_id: row.project_id || null,
        site_visit_id: row.site_visit_id || null,
        state: row.state || obj.metadata?.state || null,
        locality: row.locality || obj.metadata?.locality || obj.metadata?.locality_name || null,
        issue_date: obj.metadata?.issue_date || null,
        expiry_date: obj.metadata?.expiry_date || null,
        verified: obj.metadata?.verified === 'true' || obj.metadata?.verified === true || null,
        status: obj.metadata?.status || null,
        source_meta: row.source_meta
      };

      const { data: existsPerm } = await supabase.from(table).select('id').eq('file_key', row.file_key).limit(1);
      if (existsPerm && existsPerm.length > 0) {
        continue;
      }

      const insertRes = await supabase.from(table).insert(permitRow).select('id');
      if (insertRes.error) {
        console.error('Failed to insert permit row for', path, insertRes.error.message || insertRes.error);
      } else {
        console.log(`Inserted ${table} row for ${path}`);
      }
      continue;
    }

    // For site photos table the migration doesn't include a `file_name` column,
    // so build a photo-specific insert object.
    if (table === 'site_visit_photos') {
      const photoRow = {
        file_key: row.file_key,
        file_url: row.file_url,
        caption: obj.metadata?.caption || null,
        uploaded_at: row.uploaded_at,
        mmp_id: row.mmp_id || null,
        site_visit_id: row.site_visit_id || null,
        site_name: row.site_name || null,
        state: row.state || null,
        locality: row.locality || null,
        project_id: row.project_id || null,
        source_meta: row.source_meta
      };
      const insertRes = await supabase.from(table).insert(photoRow).select('id');
      if (insertRes.error) {
        console.error('Failed to insert site photo for', path, insertRes.error.message || insertRes.error);
      } else {
        console.log(`Inserted ${table} row for ${path}`);
      }
    } else {
      const insertRes = await supabase.from(table).insert(row).select('id');
      if (insertRes.error) {
        console.error('Failed to insert row for', path, insertRes.error.message || insertRes.error);
      } else {
        console.log(`Inserted ${table} row for ${path}`);
      }
    }
  }
}

async function main() {
  try {
    const buckets = Object.keys(BUCKET_TO_TABLE);
    for (const b of buckets) {
      await backfillBucket(b);
    }
    console.log('Backfill finished');
  } catch (e) {
    console.error('Backfill failed', e);
    process.exit(1);
  }
}

main();
