/**
 * fd-api — Field Data Hub unified REST API
 *
 * Handles all outbound (GET) and inbound (POST) endpoints:
 *
 * Auth:
 *   GET/POST endpoints:  X-API-Key: pact_…  (hashed against fd_api_keys)
 *   POST /webhook/:id:   X-Hub-Signature-256: sha256=… (HMAC-SHA256 of raw body)
 *
 * Routes:
 *   GET  /forms
 *   GET  /forms/:id/submissions
 *   GET  /forms/:id/submissions/:uuid
 *   GET  /forms/:id/submissions.csv
 *   GET  /forms/:id/stats
 *   GET  /studies/:id/rounds
 *   GET  /studies/:id/comparison
 *   GET  /datasets/:id
 *   GET  /forms/:id/odata
 *   POST /webhook/:form_id        (inbound: Ona/MoDa/ODK Central)
 *   POST /submissions/:form_id    (inbound: custom mobile apps)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-hub-signature-256',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  });

const csv = (body: string) =>
  new Response(body, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="submissions.csv"' },
  });

// ── SHA-256 ───────────────────────────────────────────────────────────────────
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── CSV helper ────────────────────────────────────────────────────────────────
function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n');
}

// ── Route parser ──────────────────────────────────────────────────────────────
function parseRoute(pathname: string) {
  // Strip /functions/v1/fd-api prefix
  const base = pathname.replace(/^\/functions\/v1\/fd-api/, '').replace(/^\/fd-api/, '') || '/';
  const parts = base.split('/').filter(Boolean);

  // GET /forms
  if (parts.length === 1 && parts[0] === 'forms') return { route: 'list_forms' };

  // GET /forms/:id/submissions
  if (parts[0] === 'forms' && parts[2] === 'submissions' && !parts[3])
    return { route: 'list_submissions', formId: parts[1] };

  // GET /forms/:id/submissions.csv
  if (parts[0] === 'forms' && parts[2] === 'submissions.csv')
    return { route: 'submissions_csv', formId: parts[1] };

  // GET /forms/:id/submissions/:uuid
  if (parts[0] === 'forms' && parts[2] === 'submissions' && parts[3])
    return { route: 'get_submission', formId: parts[1], subId: parts[3] };

  // GET /forms/:id/stats
  if (parts[0] === 'forms' && parts[2] === 'stats')
    return { route: 'form_stats', formId: parts[1] };

  // GET /forms/:id/odata
  if (parts[0] === 'forms' && parts[2] === 'odata')
    return { route: 'odata', formId: parts[1] };

  // GET /studies/:id/rounds
  if (parts[0] === 'studies' && parts[2] === 'rounds')
    return { route: 'study_rounds', studyId: parts[1] };

  // GET /studies/:id/comparison
  if (parts[0] === 'studies' && parts[2] === 'comparison')
    return { route: 'study_comparison', studyId: parts[1] };

  // GET /datasets/:id
  if (parts[0] === 'datasets' && parts[1])
    return { route: 'dataset', datasetId: parts[1] };

  // POST /webhook/:form_id
  if (parts[0] === 'webhook' && parts[1])
    return { route: 'inbound_webhook', formId: parts[1] };

  // POST /submissions/:form_id
  if (parts[0] === 'submissions' && parts[1])
    return { route: 'inbound_submission', formId: parts[1] };

  return { route: 'not_found' };
}

// ── Auth: API key ─────────────────────────────────────────────────────────────
async function verifyApiKey(
  req: Request,
  db: ReturnType<typeof createClient>,
  requiredAccess: 'read' | 'read_write' = 'read',
  scopeFormId?: string
): Promise<{ ok: boolean; keyId?: string; keyHash?: string; error?: string }> {
  const rawKey = req.headers.get('X-API-Key') ?? req.headers.get('x-api-key') ?? '';
  if (!rawKey) return { ok: false, error: 'Missing X-API-Key header' };

  const hash = await sha256Hex(rawKey);
  const { data: key } = await db.from('fd_api_keys').select('*').eq('key_hash', hash).eq('is_active', true).single();
  if (!key) return { ok: false, error: 'Invalid or revoked API key' };

  // IP whitelist check (server-side IPs not easily available in Edge Functions — skip for now)

  // Access level check
  if (requiredAccess === 'read_write' && key.access_level === 'read')
    return { ok: false, error: 'This key is read-only' };

  // Scope check
  if (key.key_scope === 'form' && scopeFormId && key.form_id !== scopeFormId)
    return { ok: false, error: 'API key not authorized for this form' };

  return { ok: true, keyId: key.id, keyHash: hash };
}

// ── Auth: HMAC webhook ────────────────────────────────────────────────────────
async function verifyHmac(
  req: Request,
  body: string,
  db: ReturnType<typeof createClient>,
  formId: string
): Promise<{ ok: boolean; error?: string }> {
  const sigHeader = req.headers.get('X-Hub-Signature-256') ?? req.headers.get('x-hub-signature-256') ?? '';
  if (!sigHeader) return { ok: false, error: 'Missing X-Hub-Signature-256 header' };

  const { data: ws } = await db.from('fd_webhook_secrets')
    .select('secret_hash').eq('form_id', formId).eq('is_active', true).single();
  if (!ws) return { ok: false, error: 'No webhook secret configured for this form' };

  // The stored secret_hash is the SHA-256 of the raw secret.
  // We can't reverse it, so we store the raw secret in an env var or use a direct compare.
  // For production: store the raw secret encrypted (use pg_crypto decrypt) or in Vault.
  // Here we accept the signature header if it matches sha256=<hmac(secret_hash, body)>
  // as a simplified approach that matches Ona / GitHub webhook format.
  const expected = 'sha256=' + await hmacSha256Hex(ws.secret_hash, body);
  if (sigHeader !== expected) return { ok: false, error: 'Invalid HMAC signature' };
  return { ok: true };
}

// ── Log request ───────────────────────────────────────────────────────────────
async function logRequest(db: ReturnType<typeof createClient>, opts: {
  keyId?: string; method: string; path: string; status: number; ms: number; ip: string; error?: string;
}) {
  await db.from('fd_api_usage_logs').insert({
    api_key_id:    opts.keyId ?? null,
    method:        opts.method,
    path:          opts.path,
    status_code:   opts.status,
    response_ms:   opts.ms,
    ip_address:    opts.ip,
    error_message: opts.error ?? null,
  }).then(() => { /* fire and forget */ });

  if (opts.keyId) {
    await db.rpc('fd_increment_api_key_usage', { p_key_hash: '' }).then(() => {});
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const t0 = Date.now();
  const url = new URL(req.url);
  const routeInfo = parseRoute(url.pathname);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? 'unknown';

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey)
    return json({ error: 'Server configuration error' }, 503);

  const db = createClient(supabaseUrl, serviceKey);

  const logAndReturn = async (res: Response, keyId?: string) => {
    await logRequest(db, {
      keyId,
      method:  req.method,
      path:    url.pathname + url.search,
      status:  res.status,
      ms:      Date.now() - t0,
      ip,
    });
    return res;
  };

  try {
    const { route } = routeInfo as any;

    // ── Not found ────────────────────────────────────────────────────────────
    if (route === 'not_found')
      return logAndReturn(json({ error: 'Endpoint not found' }, 404));

    // ── POST /webhook/:form_id — HMAC auth ───────────────────────────────────
    if (route === 'inbound_webhook') {
      const { formId } = routeInfo as any;
      const body = await req.text();
      const auth = await verifyHmac(req, body, db, formId);
      if (!auth.ok) return logAndReturn(json({ error: auth.error }, 401));

      let payload: Record<string, unknown>;
      try { payload = JSON.parse(body); } catch { return logAndReturn(json({ error: 'Invalid JSON body' }, 422)); }

      const { data: form } = await db.from('fd_forms').select('id').eq('id', formId).single();
      if (!form) return logAndReturn(json({ error: 'Form not found' }, 404));

      const { data: sub, error: subErr } = await db.from('fd_submissions').insert({
        form_id:      formId,
        data:         payload,
        status:       'pending',
        review_status: 'pending',
        source:       'webhook',
        submitted_at: new Date().toISOString(),
      }).select('id, submitted_at').single();

      if (subErr) return logAndReturn(json({ error: subErr.message }, 500));
      return logAndReturn(json({ ok: true, id: sub.id, submitted_at: sub.submitted_at }, 200));
    }

    // ── POST /submissions/:form_id — API key auth ─────────────────────────────
    if (route === 'inbound_submission') {
      const { formId } = routeInfo as any;
      const auth = await verifyApiKey(req, db, 'read_write', formId);
      if (!auth.ok) return logAndReturn(json({ error: auth.error }, 401), auth.keyId);

      let payload: Record<string, unknown>;
      try { payload = await req.json(); } catch { return logAndReturn(json({ error: 'Invalid JSON body' }, 422)); }

      const { data: form } = await db.from('fd_forms').select('id').eq('id', formId).single();
      if (!form) return logAndReturn(json({ error: 'Form not found' }, 404));

      const { data: sub, error: subErr } = await db.from('fd_submissions').insert({
        form_id:      formId,
        data:         payload,
        status:       'pending',
        review_status: 'pending',
        source:       'api',
        submitted_at: new Date().toISOString(),
      }).select('id, submitted_at').single();

      if (subErr) return logAndReturn(json({ error: subErr.message }, 500), auth.keyId);
      return logAndReturn(json({ ok: true, id: sub.id, submitted_at: sub.submitted_at }), auth.keyId);
    }

    // ── All remaining routes require API key (read) ──────────────────────────
    if (req.method !== 'GET')
      return logAndReturn(json({ error: 'Method not allowed' }, 405));

    const auth = await verifyApiKey(req, db, 'read', (routeInfo as any).formId);
    if (!auth.ok) return logAndReturn(json({ error: auth.error }, 401));

    const sp = url.searchParams;

    // ── GET /forms ─────────────────────────────────────────────────────────
    if (route === 'list_forms') {
      const { data, error } = await db.from('fd_forms')
        .select('id, name, version, status, submission_count, created_at, updated_at')
        .order('name');
      if (error) return logAndReturn(json({ error: error.message }, 500), auth.keyId);
      return logAndReturn(json({ data, total: data?.length ?? 0 }), auth.keyId);
    }

    // ── GET /forms/:id/submissions ─────────────────────────────────────────
    if (route === 'list_submissions') {
      const { formId } = routeInfo as any;
      const page  = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
      const limit = Math.min(1000, Math.max(1, parseInt(sp.get('limit') ?? '100', 10)));
      const from  = (page - 1) * limit;
      const since = sp.get('since');
      const status = sp.get('status');

      let q = db.from('fd_submissions')
        .select('*', { count: 'exact' })
        .eq('form_id', formId)
        .order('submitted_at', { ascending: false })
        .range(from, from + limit - 1);

      if (since) q = q.gte('submitted_at', since);
      if (status) q = q.eq('review_status', status);

      const { data, count, error } = await q;
      if (error) return logAndReturn(json({ error: error.message }, 500), auth.keyId);

      return logAndReturn(json({
        data, total: count ?? 0, page, limit, has_more: (count ?? 0) > from + limit
      }), auth.keyId);
    }

    // ── GET /forms/:id/submissions/:uuid ──────────────────────────────────
    if (route === 'get_submission') {
      const { formId, subId } = routeInfo as any;
      const { data, error } = await db.from('fd_submissions')
        .select('*').eq('form_id', formId).eq('id', subId).single();
      if (error || !data) return logAndReturn(json({ error: 'Submission not found' }, 404), auth.keyId);
      return logAndReturn(json({ data }), auth.keyId);
    }

    // ── GET /forms/:id/submissions.csv ─────────────────────────────────────
    if (route === 'submissions_csv') {
      const { formId } = routeInfo as any;
      const { data, error } = await db.from('fd_submissions')
        .select('*').eq('form_id', formId)
        .order('submitted_at').limit(50000);
      if (error) return logAndReturn(json({ error: error.message }, 500), auth.keyId);

      const rows = (data ?? []).map((s: any) => {
        const flat: Record<string, unknown> = {
          id: s.id, submitted_at: s.submitted_at, status: s.status, review_status: s.review_status,
        };
        if (s.data && typeof s.data === 'object') {
          Object.entries(s.data).forEach(([k, v]) => { flat[`data.${k}`] = v; });
        }
        return flat;
      });

      await logRequest(db, { keyId: auth.keyId, method: req.method, path: url.pathname, status: 200, ms: Date.now() - t0, ip });
      return csv(toCSV(rows));
    }

    // ── GET /forms/:id/stats ───────────────────────────────────────────────
    if (route === 'form_stats') {
      const { formId } = routeInfo as any;
      const { data: subs, error } = await db.from('fd_submissions')
        .select('review_status, submitted_at').eq('form_id', formId);
      if (error) return logAndReturn(json({ error: error.message }, 500), auth.keyId);

      const total  = subs?.length ?? 0;
      const byStatus: Record<string, number> = {};
      const byDate:   Record<string, number> = {};
      for (const s of (subs ?? [])) {
        byStatus[s.review_status ?? 'unknown'] = (byStatus[s.review_status ?? 'unknown'] ?? 0) + 1;
        const d = new Date(s.submitted_at).toISOString().slice(0, 10);
        byDate[d] = (byDate[d] ?? 0) + 1;
      }
      return logAndReturn(json({ total, by_status: byStatus, by_date: byDate }), auth.keyId);
    }

    // ── GET /studies/:id/rounds ────────────────────────────────────────────
    if (route === 'study_rounds') {
      const { studyId } = routeInfo as any;
      const { data, error } = await db.from('fd_study_rounds')
        .select('*').eq('study_id', studyId).order('round_number');
      if (error) return logAndReturn(json({ error: error.message }, 500), auth.keyId);
      return logAndReturn(json({ data, total: data?.length ?? 0 }), auth.keyId);
    }

    // ── GET /studies/:id/comparison ────────────────────────────────────────
    if (route === 'study_comparison') {
      const { studyId } = routeInfo as any;
      const { data: rounds } = await db.from('fd_study_rounds')
        .select('id, round_number, form_id, started_at, completed_at')
        .eq('study_id', studyId).order('round_number');
      const result = [];
      for (const r of (rounds ?? [])) {
        const { count } = await db.from('fd_submissions')
          .select('*', { count: 'exact', head: true }).eq('form_id', r.form_id);
        result.push({ ...r, submission_count: count ?? 0 });
      }
      return logAndReturn(json({ study_id: studyId, rounds: result }), auth.keyId);
    }

    // ── GET /datasets/:id ──────────────────────────────────────────────────
    if (route === 'dataset') {
      const { datasetId } = routeInfo as any;
      const { data, error } = await db.from('fd_server_datasets')
        .select('*').eq('id', datasetId).single();
      if (error || !data) return logAndReturn(json({ error: 'Dataset not found' }, 404), auth.keyId);
      return logAndReturn(json({ data }), auth.keyId);
    }

    // ── GET /forms/:id/odata ───────────────────────────────────────────────
    if (route === 'odata') {
      const { formId } = routeInfo as any;
      const top    = parseInt(sp.get('$top')  ?? '1000', 10);
      const skip   = parseInt(sp.get('$skip') ?? '0',    10);
      const filter = sp.get('$filter');

      let q = db.from('fd_submissions')
        .select('*', { count: 'exact' })
        .eq('form_id', formId)
        .order('submitted_at', { ascending: false })
        .range(skip, skip + top - 1);

      // Basic OData $filter: status eq 'approved'
      if (filter) {
        const m = filter.match(/review_status\s+eq\s+'([^']+)'/);
        if (m) q = q.eq('review_status', m[1]);
      }

      const { data, count, error } = await q;
      if (error) return logAndReturn(json({ error: error.message }, 500), auth.keyId);

      const odataResp = {
        '@odata.context': `${url.origin}/functions/v1/fd-api/forms/${formId}/odata/$metadata`,
        '@odata.count':   count ?? 0,
        value: (data ?? []).map((s: any) => ({
          ...s,
          ...(typeof s.data === 'object' ? s.data : {}),
        })),
      };
      return logAndReturn(
        new Response(JSON.stringify(odataResp), {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json;odata.metadata=minimal' },
        }),
        auth.keyId
      );
    }

    return logAndReturn(json({ error: 'Endpoint not found' }, 404), auth.keyId);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return logAndReturn(json({ error: msg }, 500));
  }
});
