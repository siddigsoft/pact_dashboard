/**
 * whatsapp-webhook — Receives inbound WhatsApp from Meta Cloud API (or WasenderAPI fallback)
 *
 * Meta Cloud API:
 *   GET  → handshake: returns hub.challenge if hub.verify_token matches META_WA_VERIFY_TOKEN
 *   POST → inbound message: parses entry[].changes[].value.messages[]
 *
 * WasenderAPI (legacy):
 *   POST with x-wasender-signature header → parses body.data.messages[]
 *
 * Webhook URL to configure in Meta Developer Console:
 *   https://<project>.supabase.co/functions/v1/whatsapp-webhook
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wasender-signature, x-hub-signature-256',
}

interface InboundMessage {
  phone: string
  text: string
  providerId: string
}

function parseMetaPayload(body: unknown): InboundMessage[] {
  const messages: InboundMessage[] = []
  // Meta payload: { object, entry: [{ changes: [{ value: { messages: [...] }}] }] }
  const entries = (body as { entry?: unknown[] })?.entry ?? []
  for (const entry of entries as { changes?: unknown[] }[]) {
    for (const change of (entry.changes ?? []) as { value?: { messages?: unknown[] } }[]) {
      for (const msg of (change.value?.messages ?? []) as Record<string, unknown>[]) {
        const phone = String(msg.from ?? '')
        const id = String(msg.id ?? '')
        let text = ''
        const textObj = msg.text as { body?: string } | undefined
        const buttonObj = msg.button as { text?: string } | undefined
        const interactiveObj = msg.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined
        if (textObj?.body) text = textObj.body
        else if (buttonObj?.text) text = buttonObj.text
        else if (interactiveObj?.button_reply?.title) text = interactiveObj.button_reply.title
        else if (interactiveObj?.list_reply?.title) text = interactiveObj.list_reply.title
        else text = `[${msg.type ?? 'unknown'}]`
        if (phone) messages.push({ phone, text, providerId: id })
      }
    }
  }
  return messages
}

function parseWasenderPayload(body: unknown): InboundMessage[] {
  const messages: InboundMessage[] = []
  const data = (body as { data?: { messages?: unknown[] }; messages?: unknown[] })
  const list = data?.data?.messages ?? (data?.messages ? [body] : [])
  for (const msg of list as Record<string, unknown>[]) {
    const key = msg.key as { remoteJid?: string; id?: string } | undefined
    const message = msg.message as { conversation?: string; extendedTextMessage?: { text?: string } } | undefined
    const text = msg.text as { body?: string } | undefined
    const from = key?.remoteJid || (msg.from as string) || ''
    const body = message?.conversation || message?.extendedTextMessage?.text || text?.body || ''
    const id = key?.id || (msg.id as string) || ''
    const phone = from.replace('@s.whatsapp.net', '').replace('@c.us', '')
    if (phone) messages.push({ phone, text: body, providerId: id })
  }
  return messages
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const metaVerifyToken = Deno.env.get('META_WA_VERIFY_TOKEN')
  const wasenderSecret = Deno.env.get('WASENDER_WEBHOOK_SECRET')

  // ── Meta handshake (GET) ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && metaVerifyToken && token === metaVerifyToken) {
      console.log('[WhatsApp Webhook] Meta handshake successful')
      return new Response(challenge ?? '', { status: 200, headers: corsHeaders })
    }
    console.warn('[WhatsApp Webhook] Meta handshake failed: token mismatch')
    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const rawBody = await req.text()
    let body: unknown
    try { body = JSON.parse(rawBody) } catch { body = {} }

    // Detect provider: Meta payloads have `object: "whatsapp_business_account"`
    const isMeta = (body as { object?: string })?.object === 'whatsapp_business_account'

    // ── Validate Wasender signature (only when not Meta) ─────────────────────
    if (!isMeta && wasenderSecret) {
      const signature = req.headers.get('x-wasender-signature')
      if (!signature || signature !== wasenderSecret) {
        console.warn('[WhatsApp Webhook] Invalid Wasender signature')
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const messages = isMeta ? parseMetaPayload(body) : parseWasenderPayload(body)
    console.log(`[WhatsApp Webhook] Provider=${isMeta ? 'meta' : 'wasender'}, messages=${messages.length}`)

    if (messages.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    for (const m of messages) {
      // Look up user by phone (try multiple normalizations)
      const variants = [m.phone, `+${m.phone}`, `0${m.phone.slice(3)}`]
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .or(variants.map(p => `phone.eq.${p}`).join(','))
        .maybeSingle()

      await supabase.from('whatsapp_logs').insert({
        phone: m.phone,
        user_id: profile?.id ?? null,
        event_type: 'inbound_message',
        status: 'received',
        direction: 'inbound',
        message_body: m.text,
        wasender_id: m.providerId,
      })

      console.log(`[WhatsApp Webhook] Inbound from ${m.phone}: "${m.text.slice(0, 100)}"`)
    }

    return new Response(JSON.stringify({ success: true, processed: messages.length, provider: isMeta ? 'meta' : 'wasender' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[WhatsApp Webhook] Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
