// One-shot endpoint to register the WhatsApp Business phone number with Meta Cloud API.
// Required after migrating a phone number to a new WABA (fixes error 133010 "Account not registered").
//
// Usage: POST /functions/v1/meta-register-phone  Body: { "pin": "123456" }
// Returns Meta's response verbatim.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = Deno.env.get('META_WA_ACCESS_TOKEN')
    const phoneId = Deno.env.get('META_WA_PHONE_NUMBER_ID')
    if (!token || !phoneId) {
      return new Response(JSON.stringify({ error: 'Meta secrets not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const pin: string = body.pin || '482913' // default 6-digit PIN if not supplied
    if (!/^\d{6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: 'pin must be 6 digits' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 1: register phone for Cloud API
    const registerRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    })
    const registerJson = await registerRes.json().catch(() => ({}))

    // Step 2: also fetch current phone status for diagnostic context
    const statusRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,name_status,status,platform_type`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const statusJson = await statusRes.json().catch(() => ({}))

    return new Response(JSON.stringify({
      ok: registerRes.ok,
      register_status: registerRes.status,
      register_response: registerJson,
      phone_status: statusJson,
      pin_used: pin,
    }), {
      status: registerRes.ok ? 200 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
