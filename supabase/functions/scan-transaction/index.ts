import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image_base64, mime_type } = await req.json()

    if (!image_base64) {
      return new Response(JSON.stringify({ error: 'image_base64 is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const imageMime = mime_type || 'image/jpeg'

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: 'Extract transaction details from this bank receipt or transfer screenshot. Return ONLY valid JSON with these fields: sender_name, sender_account, receiver_name, receiver_account, amount, currency, transaction_id, date, bank_name, transfer_type. For Arabic text, transliterate names to English. If a field is not found, use null.',
              },
              {
                inline_data: {
                  mime_type: imageMime,
                  data: image_base64,
                },
              },
            ],
          }],
          generationConfig: {
            response_mime_type: 'application/json',
          },
        }),
      }
    )

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text()

      // Attempt Groq fallback for text-only extraction hint
      const groqKey = Deno.env.get('GROQ_API_KEY')
      if (groqKey) {
        const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [{
              role: 'user',
              content: 'Return a JSON template for a bank transaction with fields: sender_name, sender_account, receiver_name, receiver_account, amount, currency, transaction_id, date, bank_name, transfer_type. All values should be null since no image was provided.',
            }],
            response_format: { type: 'json_object' },
          }),
        })
        if (groqResp.ok) {
          const groqData = await groqResp.json()
          const content = groqData.choices?.[0]?.message?.content ?? '{}'
          return new Response(JSON.stringify({ data: JSON.parse(content), source: 'groq_fallback' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      return new Response(JSON.stringify({ error: `AI API error: ${geminiResponse.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await geminiResponse.json()
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const data = JSON.parse(text)

    return new Response(JSON.stringify({ data, source: 'gemini' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
