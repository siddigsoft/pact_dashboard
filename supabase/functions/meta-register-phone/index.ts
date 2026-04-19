// Diagnostic + admin endpoint for Meta WhatsApp Cloud API.
//
// POST /functions/v1/meta-register-phone
// Body modes:
//   { "action": "register", "pin": "482913" }            → register phone for Cloud API
//   { "action": "status" }                                → fetch sender phone status
//   { "action": "subscribe_webhook" }                     → subscribe WABA app to status webhooks
//   { "action": "send_text", "to": "+256...", "body":"hi" } → send free-text (only inside 24h window)
//   { "action": "send_template", "to":"+256...", "template":"pact_reminder", "lang":"en", "params":["X","Y","Z"] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GRAPH = 'https://graph.facebook.com/v21.0'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = Deno.env.get('META_WA_ACCESS_TOKEN')
    const phoneId = Deno.env.get('META_WA_PHONE_NUMBER_ID')
    const wabaId = Deno.env.get('META_WA_BUSINESS_ACCOUNT_ID')
    if (!token || !phoneId) {
      return new Response(JSON.stringify({ error: 'Meta secrets not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action || (body.pin ? 'register' : 'status')

    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    if (action === 'register') {
      const pin: string = body.pin || '482913'
      if (!/^\d{6}$/.test(pin)) {
        return json({ error: 'pin must be 6 digits' }, 400)
      }
      const r = await fetch(`${GRAPH}/${phoneId}/register`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
      })
      return json({ ok: r.ok, status: r.status, response: await r.json().catch(() => ({})) }, r.ok ? 200 : 400)
    }

    if (action === 'status') {
      const r = await fetch(
        `${GRAPH}/${phoneId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,name_status,status,platform_type,throughput,messaging_limit_tier`,
        { headers: auth }
      )
      return json({ ok: r.ok, status: r.status, phone: await r.json().catch(() => ({})) })
    }

    if (action === 'subscribe_webhook') {
      if (!wabaId) return json({ error: 'WABA id missing' }, 400)
      const r = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: 'POST', headers: auth })
      return json({ ok: r.ok, status: r.status, response: await r.json().catch(() => ({})) })
    }

    if (action === 'send_text') {
      const to = body.to as string
      const text = body.body as string || 'test'
      if (!to) return json({ error: 'to required' }, 400)
      const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
      })
      return json({ ok: r.ok, status: r.status, response: await r.json().catch(() => ({})) }, r.ok ? 200 : 400)
    }

    if (action === 'send_template') {
      const to = body.to as string
      const tpl = body.template || 'pact_reminder'
      const lang = body.lang || 'en'
      const params: string[] = body.params || ['ELSIDDIG', 'PACT diagnostic test message — please reply if received', 'https://app.pactorg.com']
      if (!to) return json({ error: 'to required' }, 400)
      const payload = {
        messaging_product: 'whatsapp', to, type: 'template',
        template: { name: tpl, language: { code: lang }, components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }] },
      }
      const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: 'POST', headers: auth, body: JSON.stringify(payload),
      })
      return json({ ok: r.ok, status: r.status, sent: payload, response: await r.json().catch(() => ({})) }, r.ok ? 200 : 400)
    }

    return json({ error: 'unknown action', valid: ['register', 'status', 'subscribe_webhook', 'send_text', 'send_template'] }, 400)
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500)
  }

  function json(obj: any, status = 200) {
    return new Response(JSON.stringify(obj), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
