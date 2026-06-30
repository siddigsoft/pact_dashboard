/**
 * Field Data Sync Engine — Phase 2
 * Handles live sync from ODK Central, Ona, WFP MoDa, KoboToolbox.
 * All API calls are made directly from the browser; servers must allow CORS
 * or users should configure a reverse-proxy. Sync attempts are logged to
 * field_data_sync_logs regardless of outcome.
 */

import { supabase } from '@/lib/supabase';

export type ServerType = 'odk_central' | 'ona' | 'moda' | 'kobo' | 'generic';

export interface SyncServer {
  id: string;
  name: string;
  type: ServerType;
  base_url: string;
  username: string | null;
  api_token: string | null;
  project_id: string | null;
  sync_frequency_minutes: number;
}

export interface SyncForm {
  id: string;
  name: string;
  form_id_slug: string | null;
}

export interface SyncResult {
  success: boolean;
  recordsPulled: number;
  recordsNew: number;
  recordsUpdated: number;
  error?: string;
  durationMs: number;
}

/** Normalise a base URL — strip trailing slash */
function base(url: string) {
  return url.replace(/\/+$/, '');
}

/** Build Basic-auth header for ODK Central */
function odkBasicAuth(username: string, password: string) {
  return 'Basic ' + btoa(`${username}:${password}`);
}

/** Build Token auth header (Ona / Kobo / MoDa) */
function tokenAuth(token: string) {
  return `Token ${token}`;
}

// ─── ODK Central ─────────────────────────────────────────────────────────────

async function getODKSession(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${base(baseUrl)}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`ODK Central auth failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.token as string;
}

async function fetchODKSubmissions(
  baseUrl: string,
  projectId: string,
  formIdSlug: string,
  token: string,
  since?: string,
): Promise<Record<string, unknown>[]> {
  let url = `${base(baseUrl)}/v1/projects/${projectId}/forms/${encodeURIComponent(formIdSlug)}/submissions.json`;
  if (since) url += `?$filter=__system/submissionDate gt ${since}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`ODK Central fetch failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return Array.isArray(json.value) ? json.value : [];
}

async function syncODKCentral(
  server: SyncServer,
  form: SyncForm,
  since?: string,
): Promise<Record<string, unknown>[]> {
  const projectId = server.project_id || '1';
  const formSlug = form.form_id_slug || form.name;

  let token: string;
  if (server.api_token) {
    token = server.api_token;
  } else if (server.username) {
    const [email, ...rest] = server.username.split('|');
    const password = rest.join('|');
    token = await getODKSession(server.base_url, email, password);
  } else {
    throw new Error('No credentials configured for ODK Central server');
  }

  return fetchODKSubmissions(server.base_url, projectId, formSlug, token, since);
}

// ─── Ona ─────────────────────────────────────────────────────────────────────

async function syncOna(
  server: SyncServer,
  form: SyncForm,
  since?: string,
): Promise<Record<string, unknown>[]> {
  const formId = form.form_id_slug || form.id;
  const token = server.api_token;
  if (!token) throw new Error('No API token configured for Ona server');

  let url = `${base(server.base_url)}/api/v1/data/${formId}`;
  if (since) url += `?query={"_submission_time":{"$gt":"${since}"}}`;

  const res = await fetch(url, {
    headers: { Authorization: tokenAuth(token) },
  });
  if (!res.ok) throw new Error(`Ona fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// ─── WFP MoDa / KoboToolbox ──────────────────────────────────────────────────

async function syncKobo(
  server: SyncServer,
  form: SyncForm,
  since?: string,
): Promise<Record<string, unknown>[]> {
  const assetUid = form.form_id_slug || form.id;
  const token = server.api_token;
  if (!token) throw new Error('No API token configured for MoDa/Kobo server');

  let url = `${base(server.base_url)}/api/v2/assets/${assetUid}/data/?format=json`;
  if (since) url += `&query={"_submission_time":{"$gt":"${since}"}}`;

  const res = await fetch(url, {
    headers: { Authorization: tokenAuth(token) },
  });
  if (!res.ok) throw new Error(`MoDa/Kobo fetch failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return Array.isArray(json.results) ? json.results : [];
}

// ─── Normalise raw submission to our schema ───────────────────────────────────

function normaliseSubmission(
  raw: Record<string, unknown>,
  formId: string,
  serverId: string,
  serverType: ServerType,
): Record<string, unknown> {
  const gpsRaw =
    (raw['_geolocation'] as number[] | undefined) ||
    (raw['geopoint'] as number[] | undefined);

  const gpsLat =
    gpsRaw?.[0] ??
    (raw['_gps_latitude'] as number | undefined) ??
    (raw['gps_lat'] as number | undefined) ??
    null;

  const gpsLng =
    gpsRaw?.[1] ??
    (raw['_gps_longitude'] as number | undefined) ??
    (raw['gps_lng'] as number | undefined) ??
    null;

  const uuid =
    (raw['_uuid'] as string | undefined) ||
    (raw['__id'] as string | undefined) ||
    (raw['meta/instanceID'] as string | undefined) ||
    String(raw['_id'] ?? '');

  const submittedAt =
    (raw['_submission_time'] as string | undefined) ||
    (raw['start'] as string | undefined) ||
    null;

  const enumerator =
    (raw['_submitted_by'] as string | undefined) ||
    (raw['username'] as string | undefined) ||
    null;

  return {
    form_id: formId,
    server_id: serverId,
    submission_uuid: uuid,
    submitted_at: submittedAt ? new Date(submittedAt).toISOString() : null,
    submitted_by: enumerator,
    enumerator_name: enumerator,
    data: raw,
    gps_lat: gpsLat ? Number(gpsLat) : null,
    gps_lng: gpsLng ? Number(gpsLng) : null,
    source: serverType,
    review_status: 'pending',
    sync_status: 'synced',
  };
}

// ─── Public sync function ─────────────────────────────────────────────────────

export async function syncFormFromServer(
  server: SyncServer,
  form: SyncForm,
  triggeredBy?: string,
): Promise<SyncResult> {
  const startedAt = Date.now();

  const logRow: Record<string, unknown> = {
    form_id: form.id,
    server_id: server.id,
    sync_type: 'manual',
    status: 'running',
    started_at: new Date().toISOString(),
    triggered_by: triggeredBy ?? null,
  };

  const { data: logInsert } = await supabase
    .from('field_data_sync_logs')
    .insert(logRow)
    .select('id')
    .single();
  const logId = logInsert?.id as string | undefined;

  const updateLog = async (patch: Record<string, unknown>) => {
    if (!logId) return;
    await supabase.from('field_data_sync_logs').update(patch).eq('id', logId);
  };

  try {
    const { data: lastLog } = await supabase
      .from('field_data_sync_logs')
      .select('completed_at')
      .eq('form_id', form.id)
      .eq('server_id', server.id)
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    const since = lastLog?.completed_at as string | undefined;

    let rawRows: Record<string, unknown>[] = [];

    switch (server.type) {
      case 'odk_central':
        rawRows = await syncODKCentral(server, form, since);
        break;
      case 'ona':
        rawRows = await syncOna(server, form, since);
        break;
      case 'moda':
      case 'kobo':
      case 'generic':
        rawRows = await syncKobo(server, form, since);
        break;
    }

    if (rawRows.length === 0) {
      const dur = Date.now() - startedAt;
      await updateLog({
        status: 'success',
        records_pulled: 0,
        records_new: 0,
        records_updated: 0,
        completed_at: new Date().toISOString(),
      });
      await supabase
        .from('field_data_form_servers')
        .upsert(
          { form_id: form.id, server_id: server.id, last_synced_at: new Date().toISOString() },
          { onConflict: 'form_id,server_id' },
        );
      return { success: true, recordsPulled: 0, recordsNew: 0, recordsUpdated: 0, durationMs: dur };
    }

    const normalised = rawRows.map(r => normaliseSubmission(r, form.id, server.id, server.type));

    const BATCH = 200;
    let totalNew = 0;
    let totalUpdated = 0;

    for (let i = 0; i < normalised.length; i += BATCH) {
      const slice = normalised.slice(i, i + BATCH);
      const { data: upserted, error } = await supabase
        .from('field_data_submissions')
        .upsert(slice, { onConflict: 'form_id,submission_uuid', ignoreDuplicates: false })
        .select('id');
      if (error) throw error;
      totalNew += upserted?.length ?? 0;
    }

    totalUpdated = normalised.length - totalNew;

    await supabase
      .from('field_data_forms')
      .update({
        submission_count: (form as unknown as { submission_count?: number }).submission_count
          ? undefined
          : normalised.length,
        last_submission_at: normalised[0]?.submitted_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', form.id);

    await supabase
      .from('field_data_form_servers')
      .upsert(
        {
          form_id: form.id,
          server_id: server.id,
          last_synced_at: new Date().toISOString(),
          submission_count: normalised.length,
        },
        { onConflict: 'form_id,server_id' },
      );

    const dur = Date.now() - startedAt;
    await updateLog({
      status: 'success',
      records_pulled: normalised.length,
      records_new: totalNew,
      records_updated: totalUpdated,
      completed_at: new Date().toISOString(),
    });

    return {
      success: true,
      recordsPulled: normalised.length,
      recordsNew: totalNew,
      recordsUpdated: totalUpdated,
      durationMs: dur,
    };
  } catch (err) {
    const errorMsg = (err as Error).message;
    const dur = Date.now() - startedAt;
    await updateLog({
      status: 'error',
      error_message: errorMsg,
      completed_at: new Date().toISOString(),
    });
    return { success: false, recordsPulled: 0, recordsNew: 0, recordsUpdated: 0, error: errorMsg, durationMs: dur };
  }
}

// ─── Test Connection ──────────────────────────────────────────────────────────

export async function testServerConnection(server: SyncServer): Promise<{ ok: boolean; message: string }> {
  try {
    switch (server.type) {
      case 'odk_central': {
        let token: string;
        if (server.api_token) {
          token = server.api_token;
        } else if (server.username) {
          const [email, ...rest] = server.username.split('|');
          const password = rest.join('|');
          token = await getODKSession(server.base_url, email, password);
        } else {
          return { ok: false, message: 'No credentials configured' };
        }
        const res = await fetch(`${base(server.base_url)}/v1/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { ok: false, message: `Server returned ${res.status}` };
        const projects = await res.json();
        const count = Array.isArray(projects) ? projects.length : 0;
        return { ok: true, message: `Connected — ${count} project${count !== 1 ? 's' : ''} found` };
      }

      case 'ona': {
        if (!server.api_token) return { ok: false, message: 'No API token configured' };
        const res = await fetch(`${base(server.base_url)}/api/v1/user`, {
          headers: { Authorization: tokenAuth(server.api_token) },
        });
        if (!res.ok) return { ok: false, message: `Server returned ${res.status}` };
        const user = await res.json();
        return { ok: true, message: `Connected as ${user.username ?? 'user'}` };
      }

      case 'moda':
      case 'kobo': {
        if (!server.api_token) return { ok: false, message: 'No API token configured' };
        const res = await fetch(`${base(server.base_url)}/api/v2/assets/?format=json&limit=1`, {
          headers: { Authorization: tokenAuth(server.api_token) },
        });
        if (!res.ok) return { ok: false, message: `Server returned ${res.status}` };
        const json = await res.json();
        const count = json.count ?? 0;
        return { ok: true, message: `Connected — ${count} asset${count !== 1 ? 's' : ''} found` };
      }

      default:
        return { ok: false, message: 'Unknown server type' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
      return {
        ok: false,
        message:
          'Cannot reach server from browser (CORS or network). The server URL is saved — live sync will work once CORS is enabled on the target server.',
      };
    }
    return { ok: false, message: msg };
  }
}

// ─── Polling helper ───────────────────────────────────────────────────────────

/** Returns true if a server is due for a sync based on last sync time */
export function isDueForSync(lastSyncedAt: string | null, frequencyMinutes: number): boolean {
  if (!lastSyncedAt) return true;
  const diffMs = Date.now() - new Date(lastSyncedAt).getTime();
  return diffMs >= frequencyMinutes * 60 * 1000;
}

/** Generate a webhook inbound URL for a form (informational — not a real endpoint yet) */
export function getWebhookUrl(formId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/api/field-data/webhook/${formId}`;
}
