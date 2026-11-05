import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Invoke from a trusted cron scheduler using the service-role Authorization header.
// No browser credential or public invocation can claim/report delivery work.
Deno.serve(async request => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!key || !url) return new Response('Report delivery is not configured', { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${key}`) return new Response('Forbidden', { status: 403 });
  if (request.method !== 'POST') return new Response('POST required', { status: 405 });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: deliveries, error } = await client.rpc('claim_project_report_deliveries');
  if (error) { console.error('Report claim failed', error.message); return new Response('Report claim failed', { status: 500 }); }
  const outcomes = await Promise.all((deliveries || []).map(async (delivery: any) => {
    let status = 'uncertain', result: any;
    try {
      const dispatch = await client.functions.invoke('dispatch-notification', { body: {
        event_type: 'project_report_ready', entity_type: 'project_report', entity_id: delivery.id,
        recipient_ids: delivery.recipients, title_en: `Project progress report: ${delivery.projectName}`,
        message_en: `A progress report is ready. Report reference: ${delivery.reportId}. Open the project Reports section to review its period, capture date, acceptance and individual contributions.`,
        action_url: `/projects/${delivery.projectId}?tab=reports&report=${delivery.reportId}`,
        send_email: delivery.email, metadata: { report_id: delivery.reportId },
      } });
      if (dispatch.error) result = { error: 'Dispatcher acknowledgement unavailable; verify delivery before retrying.' };
      else {
        result = dispatch.data;
        status = result?.success === true && (!delivery.email || Number(result.emails_failed || 0) === 0) ? 'sent' : 'uncertain';
      }
    } catch { result = { error: 'Delivery outcome unknown; check notification history before retrying.' }; }
    const finish = await client.rpc('finish_project_report_delivery', { p_id: delivery.id, p_status: status, p_result: result });
    if (finish.error) console.error('Report acknowledgement failed', delivery.id, finish.error.message);
    return { id: delivery.id, status: finish.error ? 'acknowledgement_failed' : status };
  }));
  return Response.json({ processed: outcomes.length, outcomes });
});
