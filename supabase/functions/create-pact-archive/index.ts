import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Minimal in-memory ZIP builder (no external deps) ─────────────────────────
// Implements PKZIP local file header + central directory + EOCD (stored, no compression).
// Suitable for text-heavy archives up to ~50 MB.
function crc32(data: Uint8Array): number {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (const b of data) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; data: Uint8Array }

function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralDirs: Uint8Array[]  = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc       = crc32(entry.data);
    const size      = entry.data.length;

    // Local file header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0,  0x04034b50, true); // signature
    lv.setUint16(4,  20, true);         // version needed
    lv.setUint16(6,  0, true);          // flags
    lv.setUint16(8,  0, true);          // compression: stored
    lv.setUint16(10, 0, true);          // mod time
    lv.setUint16(12, 0, true);          // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);          // extra field length
    lh.set(nameBytes, 30);

    // Central directory entry (46 bytes + name)
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0,  0x02014b50, true); // signature
    cv.setUint16(4,  20, true);         // version made by
    cv.setUint16(6,  20, true);         // version needed
    cv.setUint16(8,  0, true);          // flags
    cv.setUint16(10, 0, true);          // compression
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);          // extra
    cv.setUint16(32, 0, true);          // comment
    cv.setUint16(34, 0, true);          // disk start
    cv.setUint16(36, 0, true);          // internal attr
    cv.setUint32(38, 0, true);          // external attr
    cv.setUint32(42, offset, true);     // offset of local header
    cd.set(nameBytes, 46);

    localHeaders.push(lh, entry.data);
    centralDirs.push(cd);
    offset += lh.length + size;
  }

  // End of central directory record
  const cdOffset = offset;
  const cdSize   = centralDirs.reduce((s, b) => s + b.length, 0);
  const eocd     = new Uint8Array(22);
  const ev       = new DataView(eocd.buffer);
  ev.setUint32(0,  0x06054b50, true);
  ev.setUint16(4,  0, true);
  ev.setUint16(6,  0, true);
  ev.setUint16(8,  entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);

  const parts = [...localHeaders, ...centralDirs, eocd];
  const total = parts.reduce((s, b) => s + b.length, 0);
  const zip   = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { zip.set(p, pos); pos += p.length; }
  return zip;
}

// ── CSV helper ────────────────────────────────────────────────────────────────
function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [keys.join(','), ...rows.map(r => keys.map(k => escape(r[k])).join(','))].join('\n');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey)
      return new Response(JSON.stringify({ error: 'Supabase env vars not set' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const authHeader = req.headers.get('Authorization') ?? '';
    const client = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json();
    const { form_id, include_media = true, include_exports = true, include_charts = false } = body;
    if (!form_id)
      return new Response(JSON.stringify({ error: 'form_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const enc = new TextEncoder();
    const entries: ZipEntry[] = [];
    const manifest: string[] = [
      '═══════════════════════════════════════════════════════════',
      '  PACT Command Center — Offline Archive',
      `  Generated: ${new Date().toISOString()}`,
      `  Form ID:   ${form_id}`,
      '═══════════════════════════════════════════════════════════',
      '',
      'CONTENTS',
      '--------',
    ];

    // ── Fetch form metadata ──────────────────────────────────────────────────
    const { data: form } = await client
      .from('fd_forms').select('*').eq('id', form_id).single();
    if (!form)
      return new Response(JSON.stringify({ error: 'Form not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const formName = (form.name ?? 'form').replace(/[^a-z0-9_-]/gi, '_');

    // form_metadata.json
    entries.push({ name: `${formName}/form_metadata.json`, data: enc.encode(JSON.stringify(form, null, 2)) });
    manifest.push('  form_metadata.json   — Form definition and settings');

    // ── Fetch form schema ────────────────────────────────────────────────────
    const { data: schema = [] } = await client
      .from('fd_form_schema').select('*').eq('form_id', form_id).order('position');
    entries.push({ name: `${formName}/form_schema.json`, data: enc.encode(JSON.stringify(schema, null, 2)) });
    manifest.push('  form_schema.json     — Question/field definitions (XLSForm-compatible)');

    // XLSForm-style CSV (survey sheet approximation)
    if (schema.length) {
      const surveyRows = (schema as any[]).map((f: any) => ({
        type:  f.field_type ?? 'text',
        name:  f.field_key ?? '',
        label: f.label ?? '',
        hint:  f.hint ?? '',
        required: f.required ? 'yes' : 'no',
        constraint: f.constraint ?? '',
        relevant: f.relevant ?? '',
      }));
      entries.push({ name: `${formName}/xlsform_survey.csv`, data: enc.encode(toCSV(surveyRows)) });
      manifest.push('  xlsform_survey.csv   — XLSForm survey sheet (CSV)');
    }

    // ── Fetch all submissions ─────────────────────────────────────────────────
    const { data: submissions = [] } = await client
      .from('fd_submissions')
      .select('*')
      .eq('form_id', form_id)
      .order('submitted_at');

    // submissions.json
    entries.push({ name: `${formName}/submissions.json`, data: enc.encode(JSON.stringify(submissions, null, 2)) });
    manifest.push(`  submissions.json     — ${submissions.length} submission(s) in JSON`);

    // submissions.csv (flatten data field)
    if (submissions.length) {
      const csvRows = (submissions as any[]).map((s: any) => {
        const flat: Record<string, unknown> = {
          id: s.id,
          submitted_at: s.submitted_at,
          submitted_by: s.submitted_by,
          status: s.status,
          review_status: s.review_status,
        };
        if (s.data && typeof s.data === 'object') {
          Object.entries(s.data).forEach(([k, v]) => { flat[`data.${k}`] = v; });
        }
        return flat;
      });
      entries.push({ name: `${formName}/submissions.csv`, data: enc.encode(toCSV(csvRows)) });
      manifest.push(`  submissions.csv      — ${submissions.length} submission(s) in CSV (flattened)`);
    }

    // ── Optional: exports list ────────────────────────────────────────────────
    if (include_exports) {
      const { data: exports = [] } = await client
        .from('fd_export_queue')
        .select('id, format, status, created_at, file_name')
        .eq('form_id', form_id)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(20);
      if (exports.length) {
        entries.push({ name: `${formName}/exports_index.json`, data: enc.encode(JSON.stringify(exports, null, 2)) });
        manifest.push(`  exports_index.json   — ${exports.length} completed export record(s)`);
      }
    }

    // ── Insert archive log row ────────────────────────────────────────────────
    const archivePath = `${form_id}/${Date.now()}_${formName}.zip`;

    // ── Build README ──────────────────────────────────────────────────────────
    manifest.push('', 'To read this archive: unzip and open any file in a text editor or Excel.');
    manifest.push('No server or internet connection is required.');
    entries.push({ name: `${formName}/README.txt`, data: enc.encode(manifest.join('\n')) });

    // ── Build ZIP ─────────────────────────────────────────────────────────────
    const zipBytes = buildZip(entries);

    // ── Upload to Supabase Storage ────────────────────────────────────────────
    const { error: uploadError } = await client.storage
      .from('field-data-archives')
      .upload(archivePath, zipBytes, { contentType: 'application/zip', upsert: true });

    if (uploadError)
      return new Response(JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Log the archive
    await client.from('fd_archive_logs').insert({
      form_id,
      status: 'success',
      storage_path: archivePath,
      file_size_bytes: zipBytes.length,
      submission_count: submissions.length,
      include_media,
      include_exports,
      include_charts,
      completed_at: new Date().toISOString(),
    });

    // Signed URL (valid 5 minutes)
    const { data: signed } = await client.storage
      .from('field-data-archives')
      .createSignedUrl(archivePath, 300);

    return new Response(
      JSON.stringify({
        ok: true,
        signed_url: signed?.signedUrl ?? null,
        storage_path: archivePath,
        file_size_bytes: zipBytes.length,
        submission_count: submissions.length,
        entry_count: entries.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
