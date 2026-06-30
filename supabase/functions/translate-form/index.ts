/**
 * translate-form — Supabase Edge Function
 *
 * Translates an array of form field texts to a target language using Gemini 2.0 Flash.
 * Called by the Field Data Hub → Multi-Language Forms → AI Assistant tab.
 *
 * Request body:
 *   {
 *     texts: { key: string; text: string }[]  — field key + English source text
 *     target_lang: string                      — BCP-47 code, e.g. "ar", "fr", "so"
 *     target_lang_label: string                — human label for prompt clarity
 *   }
 *
 * Response:
 *   { results: { field_key: string; source: string; translation: string }[] }
 *
 * Security:
 *   Requires valid Supabase JWT (anon or authenticated).
 *   GOOGLE_AI_API_KEY must be set in Supabase Secrets.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured — GOOGLE_AI_API_KEY is not set.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { texts, target_lang, target_lang_label } = await req.json() as {
      texts: { key: string; text: string }[]
      target_lang: string
      target_lang_label: string
    }

    if (!texts?.length || !target_lang) {
      return new Response(
        JSON.stringify({ error: 'texts[] and target_lang are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cap at 50 items per call to keep prompts manageable
    const batch = texts.slice(0, 50)

    const numbered = batch.map((t, i) => `${i + 1}. [${t.key}] ${t.text}`).join('\n')

    const prompt = `You are a professional humanitarian aid translator specializing in ODK/XLSForm survey translations.

Translate the following survey field texts from English to ${target_lang_label} (language code: ${target_lang}).

Rules:
- Preserve any placeholder variables like {{name}}, ${'{'}name{'}'}, or #name exactly as-is.
- Keep translations concise — these are survey labels and hints, not prose.
- Maintain the original meaning and tone.
- For Arabic/RTL languages: produce right-to-left text naturally.
- Return ONLY a JSON array. No markdown, no explanation. Format:
[{"key":"field_key","translation":"translated text"},...]

Fields to translate:
${numbered}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('[translate-form] Gemini error:', geminiRes.status, errText)
      return new Response(
        JSON.stringify({ error: `Gemini API returned ${geminiRes.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const geminiData = await geminiRes.json()
    const rawText: string =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'

    let parsed: { key: string; translation: string }[] = []
    try {
      // Strip possible markdown code fences
      const clean = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      parsed = JSON.parse(clean)
    } catch (e) {
      console.error('[translate-form] Failed to parse Gemini response:', rawText)
      return new Response(
        JSON.stringify({ error: 'Could not parse AI response. Try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Map back to original keys with source text
    const keyToSource = Object.fromEntries(batch.map(t => [t.key, t.text]))
    const results = parsed
      .filter(r => r.key && r.translation)
      .map(r => ({
        field_key:   r.key,
        source:      keyToSource[r.key] ?? '',
        translation: r.translation,
      }))

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[translate-form] Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
