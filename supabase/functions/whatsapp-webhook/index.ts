/**
 * whatsapp-webhook — Receives inbound WhatsApp messages from WasenderAPI
 *
 * WasenderAPI sends a POST with a JSON body when a message arrives.
 * This function:
 *   1. Validates the webhook secret (WASENDER_WEBHOOK_SECRET)
 *   2. Logs the inbound message to whatsapp_logs
 *   3. Auto-replies with a helpful message (optional)
 *
 * Configure the webhook URL in your WasenderAPI dashboard:
 *   https://<project>.supabase.co/functions/v1/whatsapp-webhook
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wasender-signature',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const webhookSecret = Deno.env.get('WASENDER_WEBHOOK_SECRET')

  try {
    // Validate webhook secret if configured
    if (webhookSecret) {
      const signature = req.headers.get('x-wasender-signature') || req.headers.get('x-hub-signature-256')
      if (!signature || signature !== webhookSecret) {
        console.warn('[WhatsApp Webhook] Invalid webhook signature')
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const body = await req.json()
    console.log('[WhatsApp Webhook] Received:', JSON.stringify(body).slice(0, 500))

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // WasenderAPI webhook payload structure
    // body.event: 'messages.upsert' | 'messages.update' | etc.
    // body.data.messages[]: array of messages
    const messages = body?.data?.messages ?? (body?.messages ? [body] : [])

    for (const msg of messages) {
      const from: string = msg?.key?.remoteJid || msg?.from || ''
      const text: string = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || msg?.text?.body || ''
      const wasenderId: string = msg?.key?.id || msg?.id || ''

      if (!from) continue

      // Normalize phone (strip @s.whatsapp.net suffix)
      const phone = from.replace('@s.whatsapp.net', '').replace('@c.us', '')

      // Look up the user by phone number
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.0${phone.slice(3)}`)
        .maybeSingle()

      // Log inbound message
      await supabase.from('whatsapp_logs').insert({
        phone,
        user_id: profile?.id ?? null,
        event_type: 'inbound_message',
        status: 'received',
        direction: 'inbound',
        message_body: text,
        wasender_id: wasenderId,
      })

      console.log(`[WhatsApp Webhook] Logged inbound from ${phone}: "${text?.slice(0, 100)}"`)
    }

    return new Response(JSON.stringify({ success: true, processed: messages.length }), {
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
