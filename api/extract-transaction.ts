import type { IncomingMessage, ServerResponse } from 'http';
import { ocrPostProcess } from '../src/utils/ocrPostProcess';

// ── Model lists ───────────────────────────────────────────────────────────────
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.5-pro-preview-03-25',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-thinking-exp-01-21',
];

const GROQ_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
];

// ── Multi-key support ─────────────────────────────────────────────────────────
// Reads GOOGLE_AI_API_KEY, GOOGLE_AI_API_KEY_2, GOOGLE_AI_API_KEY_3, … from env.
// Add more keys in Replit Secrets to extend daily quota capacity.
function getGeminiApiKeys(): string[] {
  const keys: string[] = [];
  const base = process.env.GOOGLE_AI_API_KEY;
  if (base) keys.push(base);
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`GOOGLE_AI_API_KEY_${i}`];
    if (k) keys.push(k);
    else break;
  }
  return keys;
}

// In serverless each invocation is stateless — quota marks are in-memory only.
// This means exhausted models may be retried on the next invocation, which is
// acceptable: the model will quickly return 429 again and we'll skip it.
// Map key format: "keyIndex:modelName" — each API key gets its own quota tracking.
const unavailableModels    = new Map<string, number>();
const unavailableGroqModels = new Map<string, number>();
const MODEL_UNAVAILABLE_TTL_MS = 23 * 60 * 60 * 1000;

function isModelUnavailable(map: Map<string, number>, model: string): boolean {
  const markedAt = map.get(model);
  if (markedAt === undefined) return false;
  if (Date.now() - markedAt > MODEL_UNAVAILABLE_TTL_MS) { map.delete(model); return false; }
  return true;
}
function markModelUnavailable(map: Map<string, number>, model: string): void {
  map.set(model, Date.now());
}

// ── Prompt ────────────────────────────────────────────────────────────────────
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
- (self-assessed) → amount_confidence  (integer 0–100: your confidence that the amount value is correct. 100 = clearly legible, 70–99 = minor uncertainty, below 70 = blurry/partially obscured/guessed)

Rules:
1. Remove ALL spaces from account numbers (from_account and to_account).
2. Use "N/A" for any missing or blank text field.
3. amount must be a plain numeric value (e.g. 2000000.00).
4. Return exactly ${count} JSON objects in order, one per image.
5. amount_confidence must be an integer 0–100. Use 100 only when the amount digits are completely clear. Use 70–99 for minor uncertainty. Use below 70 if the image is blurry, cropped, or you had to guess any digit.

Examples:
Style 1: {"transaction_id":"20024933620","date_time":"04-Mar-2026 19:13:16","from_account":"08131231711700001","to_account":"03431595497500001","recipient_name":"محمد بابكر الجزولي عثمان","mobile_number":"N/A","comment":"N/A","amount":3000000.00,"amount_confidence":100}
Style 2: {"transaction_id":"20090302958","date_time":"04-Mar-2026 16:24:02","from_account":"00130319603000001","to_account":"03431595497500001","recipient_name":"محمد بابكر الجزولى عثمان","mobile_number":"N/A","comment":"N/A","amount":2000000.00,"amount_confidence":100}`;
}

// ── Gemini ────────────────────────────────────────────────────────────────────
// Iterates over every API key × every model until one succeeds.
// Quota exhaustion is tracked per-key so key 2 is tried fresh after key 1 runs dry.
async function callGeminiWithRotation(
  apiKeys: string[],
  images: Array<{ base64: string; mimeType: string }>,
): Promise<{ text: string; model: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  for (let ki = 0; ki < apiKeys.length; ki++) {
    const ai = new GoogleGenAI({ apiKey: apiKeys[ki] });
    let allModelsExhaustedForKey = true;

    for (const model of GEMINI_MODELS) {
      const mapKey = `${ki}:${model}`;
      if (isModelUnavailable(unavailableModels, mapKey)) continue;
      allModelsExhaustedForKey = false;

      const parts: any[] = [{ text: buildBatchPrompt(images.length) }];
      images.forEach((img, i) => {
        if (images.length > 1) parts.push({ text: `Image ${i + 1}:` });
        parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.base64 } });
      });

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts }],
          });
          const text = (response.text || '').replace(/```json\n?|```\n?/g, '').trim();
          const keyLabel = ki === 0 ? '' : ` (key ${ki + 1})`;
          console.log(`[Gemini OCR] Success: ${model}${keyLabel}`);
          return { text, model: `${model}${keyLabel}` };
        } catch (err: any) {
          const msg = err.message || '';
          const isModelNotFound  = msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND');
          const isDailyExhausted = msg.includes('GenerateRequestsPerDay') && msg.includes('limit: 0');
          const isMinuteLimit    = (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) && !isDailyExhausted;

          if (isModelNotFound || isDailyExhausted) {
            const reason = isDailyExhausted ? 'daily exhausted' : '404';
            console.log(`[Gemini OCR] Model ${model} key ${ki + 1} unavailable (${reason}) — skipping`);
            markModelUnavailable(unavailableModels, mapKey);
            break;
          }
          if (isMinuteLimit) {
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
            const waitMs = retryMatch ? (Math.ceil(parseFloat(retryMatch[1])) + 2) * 1000 : 15000;
            console.log(`[Gemini OCR] Model ${model} key ${ki + 1} minute-limit — waiting ${waitMs}ms`);
            await sleep(waitMs);
            continue;
          }
          throw err;
        }
      }
    }

    if (allModelsExhaustedForKey) {
      console.log(`[Gemini OCR] All models exhausted for key ${ki + 1} — trying next key`);
    }
  }

  throw new Error('All Gemini models unavailable — daily quotas exhausted. Quotas reset at midnight Pacific time.');
}

// ── Groq ──────────────────────────────────────────────────────────────────────
async function callGroqSingleImage(
  apiKey: string,
  model: string,
  img: { base64: string; mimeType: string },
  imageIndex: number,
  totalImages: number,
  sleep: (ms: number) => Promise<void>,
): Promise<string> {
  const content: any[] = [
    { type: 'text', text: buildBatchPrompt(1) },
    { type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` } },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0, max_tokens: 512 }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
      const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
      const isDecommissioned = errMsg.includes('decommissioned') || errMsg.includes('not supported');
      const isNotFound   = res.status === 404 || errMsg.includes('not found') || errMsg.includes('does not exist');
      const isTPM        = errMsg.includes('per minute') || errMsg.includes('TPM') || errMsg.includes('tokens per minute');
      const isRPD        = (errMsg.includes('per day') || errMsg.includes('RPD') || errMsg.includes('requests per day')) && !isTPM;
      const isDailyLimit = res.status === 429 && isRPD;
      const isMinuteLimit = res.status === 429 && !isDailyLimit;
      const isInvalidImage = errMsg.toLowerCase().includes('invalid image') || errMsg.toLowerCase().includes('unsupported image');

      if (isDecommissioned || isNotFound || isDailyLimit) { markModelUnavailable(unavailableGroqModels, model); throw new Error(`Groq model unavailable: ${errMsg}`); }
      if (isMinuteLimit) {
        const headerRetry = parseInt(res.headers.get('retry-after') || '0', 10);
        const msgMatch = errMsg.match(/try again in (\d+(?:\.\d+)?)s/i);
        const msgRetry = msgMatch ? Math.ceil(parseFloat(msgMatch[1])) : 0;
        const waitSec = Math.max(headerRetry, msgRetry, 15);
        await sleep(waitSec * 1000);
        continue;
      }
      if (isInvalidImage) throw new Error(`Groq image rejected (${res.status}): ${errMsg}`);
      throw new Error(`Groq API error: ${errMsg}`);
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return (data.choices?.[0]?.message?.content || '').replace(/```json\n?|```\n?/g, '').trim();
  }
  throw new Error('Groq: max retries reached for image');
}

async function callGroqOCR(
  images: Array<{ base64: string; mimeType: string }>,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  for (const model of GROQ_MODELS) {
    if (isModelUnavailable(unavailableGroqModels, model)) continue;

    try {
      const results: any[] = [];
      let successCount = 0;
      for (let i = 0; i < images.length; i++) {
        try {
          const singleText = await callGroqSingleImage(apiKey, model, images[i], i, images.length, sleep);
          let parsed: any;
          try { parsed = JSON.parse(singleText.replace(/```json\n?|```\n?/g, '').trim()); } catch { parsed = null; }
          results.push(Array.isArray(parsed) ? parsed[0] : (parsed || null));
          if (parsed) successCount++;
        } catch (imgErr: any) {
          if (imgErr.message?.startsWith('Groq model unavailable')) throw imgErr;
          results.push(null);
        }
        if (i < images.length - 1) await sleep(9000);
      }

      if (successCount === 0) throw new Error('Groq: all images failed to process');
      return { text: JSON.stringify(results.map(r => r ?? {})), model: `groq/${model}` };
    } catch (err: any) {
      if (err.message?.startsWith('GROQ_API_KEY')) throw err;
      if (err.message?.startsWith('Groq model unavailable')) continue;
      if (err.message?.startsWith('Groq: all images failed')) continue;
      throw err;
    }
  }

  throw new Error('All Groq models unavailable. Check GROQ_API_KEY or try again later.');
}

// ── Handler ───────────────────────────────────────────────────────────────────
function sendJson(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(json);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  // Collect body
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  await new Promise<void>((resolve, reject) => {
    req.on('end', resolve);
    req.on('error', reject);
  });

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    const images: Array<{ base64: string; mimeType: string }> = parsed.images
      ? parsed.images
      : [{ base64: parsed.base64 || '', mimeType: parsed.mimeType || 'image/jpeg' }];

    let text = '';
    let model = '';
    let geminiExhausted = false;

    const geminiKeys = getGeminiApiKeys();
    try {
      if (geminiKeys.length === 0) throw new Error('All Gemini models unavailable — no API keys configured');
      ({ text, model } = await callGeminiWithRotation(geminiKeys, images));
    } catch (geminiErr: any) {
      geminiExhausted = geminiErr.message?.includes('All Gemini models unavailable');
      if (!geminiExhausted) throw geminiErr;
      console.log(`[OCR] Gemini exhausted (${geminiKeys.length} key(s) tried) — trying Groq fallback`);
    }

    if (geminiExhausted) {
      ({ text, model } = await callGroqOCR(images));
    }

    const processed = ocrPostProcess(text);
    try { JSON.parse(processed); } catch {
      throw new Error('OCR model returned unparseable output. Try again.');
    }

    return sendJson(res, 200, { text: processed, model });

  } catch (err: any) {
    const msg = err.message || 'OCR failed';
    const noKey         = msg.includes('GROQ_API_KEY not configured');
    const allExhausted  = msg.includes('All Gemini') || msg.includes('All Groq');
    const isClientError = msg.includes('unparseable output') || msg.includes('Request body');
    console.error('[OCR] Fatal:', msg.slice(0, 300));
    return sendJson(res, noKey ? 503 : allExhausted ? 429 : isClientError ? 422 : 500, {
      error: noKey
        ? 'Gemini daily quota exhausted and no Groq API key configured. Add GROQ_API_KEY to use the free Groq fallback.'
        : msg,
      retryAfterSec: allExhausted ? 3600 : 30,
      isDailyExhausted: allExhausted && !noKey,
      needsGroqKey: noKey,
    });
  }
}
