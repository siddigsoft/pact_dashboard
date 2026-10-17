/**
 * extract-transaction — Bank of Khartoum receipt OCR
 *
 * Same contract as the former Vercel /api/extract-transaction:
 *   POST { images: [{ base64, mimeType }] }
 *   200  { text: string, model: string }   // text = JSON array of receipt objects
 *   429/503/422/500 { error, retryAfterSec?, isDailyExhausted?, needsGroqKey? }
 *
 * Uses Gemini REST + Groq vision over fetch (no @google/genai npm package).
 * Secrets: GOOGLE_AI_API_KEY (+ optional _2…_10), GROQ_API_KEY
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.5-pro-preview-03-25',
  'gemini-2.0-flash-exp',
]

const GROQ_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct']

const unavailableModels = new Map<string, number>()
const unavailableGroqModels = new Map<string, number>()
const MODEL_UNAVAILABLE_TTL_MS = 23 * 60 * 60 * 1000

function isUnavailable(map: Map<string, number>, key: string): boolean {
  const markedAt = map.get(key)
  if (markedAt === undefined) return false
  if (Date.now() - markedAt > MODEL_UNAVAILABLE_TTL_MS) {
    map.delete(key)
    return false
  }
  return true
}

function markUnavailable(map: Map<string, number>, key: string) {
  map.set(key, Date.now())
}

function getGeminiApiKeys(): string[] {
  const keys: string[] = []
  const base = Deno.env.get('GOOGLE_AI_API_KEY')
  if (base) keys.push(base)
  for (let i = 2; i <= 10; i++) {
    const k = Deno.env.get(`GOOGLE_AI_API_KEY_${i}`)
    if (k) keys.push(k)
    else break
  }
  return keys
}

function buildBatchPrompt(count: number): string {
  return `You are a Bank of Khartoum transfer receipt OCR expert. Analyze ${count} screenshot${count > 1 ? 's' : ''} of Bank of Khartoum transfer receipts. There are TWO receipt styles — handle both:

STYLE 1 — Green app (تحويلات): labels are رقم العملية, التاريخ و الزمن, من حساب, الى حساب, اسم المرسل اليه / إسم المرسل اليه, رقم الموبايل, التعليق, المبلغ.
STYLE 2 — Bankak white/red app (تفاصيل المعاملة): labels are رقم العملية, التاريخ والوقت, المبلغ, من, إلى, إسم المرسل اليه / اسم المرسل اليه, التعليق. (No mobile number field — use "N/A".)

Extract EXACTLY these 9 fields from EACH image and return ONLY a valid JSON array of ${count} objects. No markdown, no explanation, no extra text. Ignore any extra fields like نوع العملية, الحالة, etc.

Field mapping (Arabic label → JSON key):
- رقم العملية → transaction_id
- التاريخ و الزمن / التاريخ والوقت → date_time  (keep exactly as shown, e.g. "04-Mar-2026 16:24:02")
- من حساب / من → from_account  (digits only, remove all spaces)
- الى حساب / إلى حساب / إلى → to_account  (digits only, remove all spaces)
- اسم المرسل اليه / إسم المرسل اليه / اسم المرسل اليه → recipient_name  (full Arabic name)
- رقم الموبايل → mobile_number  (use "N/A" if not present or shown as N/A)
- التعليق → comment  (use "N/A" if not present or shown as N/A)
- المبلغ → amount  (plain number, no commas, no currency symbols)
- (self-assessed) → amount_confidence  (integer 0–100)

Rules:
1. Remove ALL spaces from account numbers (from_account and to_account).
2. Use "N/A" for any missing or blank text field.
3. amount must be a plain numeric value (e.g. 2000000.00).
4. Return exactly ${count} JSON objects in order, one per image.
5. amount_confidence must be an integer 0–100.`
}

function ocrPostProcess(text: string): string {
  try {
    const arr = JSON.parse(text)
    if (!Array.isArray(arr)) return text
    for (const obj of arr as Record<string, unknown>[]) {
      if (typeof obj.from_account === 'string' || typeof obj.from_account === 'number') {
        obj.from_account = String(obj.from_account).replace(/\s+/g, '')
      }
      if (typeof obj.to_account === 'string' || typeof obj.to_account === 'number') {
        obj.to_account = String(obj.to_account).replace(/\s+/g, '')
      }
      if (obj.amount != null) {
        const n = parseFloat(String(obj.amount).replace(/,/g, ''))
        obj.amount = isNaN(n) ? 0 : n
      }
    }
    return JSON.stringify(arr)
  } catch {
    return text
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function callGeminiWithRotation(
  apiKeys: string[],
  images: Array<{ base64: string; mimeType: string }>,
): Promise<{ text: string; model: string }> {
  for (let ki = 0; ki < apiKeys.length; ki++) {
    let allModelsExhaustedForKey = true

    for (const model of GEMINI_MODELS) {
      const mapKey = `${ki}:${model}`
      if (isUnavailable(unavailableModels, mapKey)) continue
      allModelsExhaustedForKey = false

      const parts: Array<Record<string, unknown>> = [{ text: buildBatchPrompt(images.length) }]
      images.forEach((img, i) => {
        if (images.length > 1) parts.push({ text: `Image ${i + 1}:` })
        parts.push({
          inline_data: {
            mime_type: img.mimeType || 'image/jpeg',
            data: img.base64,
          },
        })
      })

      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys[ki]}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig: { temperature: 0 },
            }),
          },
        )

        const errText = res.ok ? '' : await res.text().catch(() => '')
        if (!res.ok) {
          const msg = errText || `HTTP ${res.status}`
          const isModelNotFound =
            res.status === 404 || msg.includes('not found') || msg.includes('NOT_FOUND')
          const isDailyExhausted = msg.includes('GenerateRequestsPerDay') && msg.includes('limit: 0')
          const isMinuteLimit =
            (res.status === 429 || msg.includes('RESOURCE_EXHAUSTED')) && !isDailyExhausted

          if (isModelNotFound || isDailyExhausted) {
            console.log(
              `[Gemini OCR] ${model} key ${ki + 1} unavailable (${isDailyExhausted ? 'daily' : '404'})`,
            )
            markUnavailable(unavailableModels, mapKey)
            break
          }
          if (isMinuteLimit) {
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i)
            const waitMs = retryMatch
              ? (Math.ceil(parseFloat(retryMatch[1])) + 2) * 1000
              : 15000
            console.log(`[Gemini OCR] ${model} minute-limit — waiting ${waitMs}ms`)
            await sleep(Math.min(waitMs, 45000))
            continue
          }
          throw new Error(`Gemini API error: ${msg.slice(0, 300)}`)
        }

        const result = await res.json()
        const text = (
          result?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') ||
          ''
        )
          .replace(/```json\n?|```\n?/g, '')
          .trim()

        if (!text) throw new Error('Gemini returned empty content')

        const keyLabel = ki === 0 ? '' : ` (key ${ki + 1})`
        console.log(`[Gemini OCR] Success: ${model}${keyLabel}`)
        return { text, model: `${model}${keyLabel}` }
      }
    }

    if (allModelsExhaustedForKey) {
      console.log(`[Gemini OCR] All models exhausted for key ${ki + 1}`)
    }
  }

  throw new Error(
    'All Gemini models unavailable — daily quotas exhausted. Quotas reset at midnight Pacific time.',
  )
}

async function callGroqSingleImage(
  apiKey: string,
  model: string,
  img: { base64: string; mimeType: string },
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildBatchPrompt(1) },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 512,
      }),
    })

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: { message?: string }
      }
      const errMsg = errBody?.error?.message || `HTTP ${res.status}`
      const isDecommissioned =
        errMsg.includes('decommissioned') || errMsg.includes('not supported')
      const isNotFound =
        res.status === 404 || errMsg.includes('not found') || errMsg.includes('does not exist')
      const isTPM =
        errMsg.includes('per minute') ||
        errMsg.includes('TPM') ||
        errMsg.includes('tokens per minute')
      const isRPD =
        (errMsg.includes('per day') ||
          errMsg.includes('RPD') ||
          errMsg.includes('requests per day')) &&
        !isTPM
      const isDailyLimit = res.status === 429 && isRPD
      const isMinuteLimit = res.status === 429 && !isDailyLimit
      const isInvalidImage =
        errMsg.toLowerCase().includes('invalid image') ||
        errMsg.toLowerCase().includes('unsupported image')

      if (isDecommissioned || isNotFound || isDailyLimit) {
        markUnavailable(unavailableGroqModels, model)
        throw new Error(`Groq model unavailable: ${errMsg}`)
      }
      if (isMinuteLimit) {
        const headerRetry = parseInt(res.headers.get('retry-after') || '0', 10)
        const msgMatch = errMsg.match(/try again in (\d+(?:\.\d+)?)s/i)
        const msgRetry = msgMatch ? Math.ceil(parseFloat(msgMatch[1])) : 0
        const waitSec = Math.min(Math.max(headerRetry, msgRetry, 15), 45)
        await sleep(waitSec * 1000)
        continue
      }
      if (isInvalidImage) throw new Error(`Groq image rejected (${res.status}): ${errMsg}`)
      throw new Error(`Groq API error: ${errMsg}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return (data.choices?.[0]?.message?.content || '')
      .replace(/```json\n?|```\n?/g, '')
      .trim()
  }
  throw new Error('Groq: max retries reached for image')
}

async function callGroqOCR(
  images: Array<{ base64: string; mimeType: string }>,
): Promise<{ text: string; model: string }> {
  const apiKey = Deno.env.get('GROQ_API_KEY') || ''
  if (!apiKey) throw new Error('GROQ_API_KEY not configured')

  for (const model of GROQ_MODELS) {
    if (isUnavailable(unavailableGroqModels, model)) continue
    try {
      const results: unknown[] = []
      let successCount = 0
      for (let i = 0; i < images.length; i++) {
        try {
          const singleText = await callGroqSingleImage(apiKey, model, images[i])
          let parsed: unknown = null
          try {
            parsed = JSON.parse(singleText.replace(/```json\n?|```\n?/g, '').trim())
          } catch {
            parsed = null
          }
          results.push(Array.isArray(parsed) ? parsed[0] : parsed)
          if (parsed) successCount++
        } catch (imgErr: unknown) {
          const msg = imgErr instanceof Error ? imgErr.message : String(imgErr)
          if (msg.startsWith('Groq model unavailable')) throw imgErr
          results.push(null)
        }
        if (i < images.length - 1) await sleep(9000)
      }
      if (successCount === 0) throw new Error('Groq: all images failed to process')
      return { text: JSON.stringify(results.map((r) => r ?? {})), model: `groq/${model}` }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.startsWith('GROQ_API_KEY')) throw err
      if (msg.startsWith('Groq model unavailable')) continue
      if (msg.startsWith('Groq: all images failed')) continue
      throw err
    }
  }

  throw new Error('All Groq models unavailable. Check GROQ_API_KEY or try again later.')
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  try {
    const parsed = await req.json()
    const images: Array<{ base64: string; mimeType: string }> = parsed.images
      ? parsed.images
      : [{ base64: parsed.base64 || '', mimeType: parsed.mimeType || 'image/jpeg' }]

    if (!images.length || !images.some((i) => i.base64)) {
      return jsonResponse(422, { error: 'Request body must include at least one image base64' })
    }

    let text = ''
    let model = ''
    let geminiExhausted = false

    const geminiKeys = getGeminiApiKeys()
    try {
      if (geminiKeys.length === 0) {
        throw new Error('All Gemini models unavailable — no API keys configured')
      }
      ;({ text, model } = await callGeminiWithRotation(geminiKeys, images))
    } catch (geminiErr: unknown) {
      const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
      geminiExhausted = msg.includes('All Gemini models unavailable')
      if (!geminiExhausted) throw geminiErr
      console.log(`[OCR] Gemini exhausted (${geminiKeys.length} key(s)) — trying Groq`)
    }

    if (geminiExhausted) {
      ;({ text, model } = await callGroqOCR(images))
    }

    const processed = ocrPostProcess(text)
    try {
      JSON.parse(processed)
    } catch {
      throw new Error('OCR model returned unparseable output. Try again.')
    }

    return jsonResponse(200, { text: processed, model })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'OCR failed'
    const noKey = msg.includes('GROQ_API_KEY not configured')
    const allExhausted = msg.includes('All Gemini') || msg.includes('All Groq')
    const isClientError = msg.includes('unparseable output') || msg.includes('Request body')
    console.error('[OCR] Fatal:', msg.slice(0, 300))
    return jsonResponse(noKey ? 503 : allExhausted ? 429 : isClientError ? 422 : 500, {
      error: noKey
        ? 'Gemini daily quota exhausted and no Groq API key configured. Add GROQ_API_KEY to use the free Groq fallback.'
        : msg,
      retryAfterSec: allExhausted ? 3600 : 30,
      isDailyExhausted: allExhausted && !noKey,
      needsGroqKey: noKey,
    })
  }
})
