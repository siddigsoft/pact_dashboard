import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { config } from 'dotenv';
import type { IncomingMessage, ServerResponse } from 'http';
import { ocrPostProcess } from './src/utils/ocrPostProcess';

// Load environment variables from .env file
config();

// Models tried in order — each has its own daily quota
// Note: Gemini 1.5 series was discontinued May 2025 — only 2.0+ models are valid
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',              // 1500 RPD free — primary
  'gemini-2.0-flash',                   // 1500 RPD free — secondary
  'gemini-2.5-flash-preview-04-17',     // preview flash, separate quota
  'gemini-2.5-pro-preview-03-25',       // preview pro, separate quota
  'gemini-2.0-flash-exp',               // experimental, separate quota
  'gemini-2.0-flash-thinking-exp-01-21',// thinking experimental
];
// Track which models are unavailable and when they were marked so.
// Daily-quota exhaustions reset at midnight Pacific; we use a 23-hour TTL so
// the dev server automatically retries without needing a restart.
const MODEL_UNAVAILABLE_TTL_MS = 23 * 60 * 60 * 1000;
const unavailableModels = new Map<string, number>(); // model → timestamp marked unavailable
const unavailableGroqModels = new Map<string, number>();

function isModelUnavailable(map: Map<string, number>, model: string): boolean {
  const markedAt = map.get(model);
  if (markedAt === undefined) return false;
  if (Date.now() - markedAt > MODEL_UNAVAILABLE_TTL_MS) {
    map.delete(model); // TTL expired — give it another chance
    return false;
  }
  return true;
}

function markModelUnavailable(map: Map<string, number>, model: string): void {
  map.set(model, Date.now());
}

function buildBatchPrompt(count: number): string {
  return `You are a Bank of Khartoum transfer receipt OCR expert. Analyze ${count} screenshot${count > 1 ? 's' : ''} of Bank of Khartoum transfer receipts. There are TWO receipt styles — handle both:

STYLE 1 — Green app (تحويلات): labels are رقم العملية, التاريخ و الزمن, من حساب, الى حساب, اسم المرسل اليه / إسم المرسل اليه, رقم الموبايل, التعليق, المبلغ.
STYLE 2 — Bankak white/red app (تفاصيل المعاملة): labels are رقم العملية, التاريخ والوقت, المبلغ, من, إلى, إسم المرسل اليه / اسم المرسل اليه, التعليق. (No mobile number field — use "N/A".)

Extract EXACTLY these 8 fields from EACH image and return ONLY a valid JSON array of ${count} objects. No markdown, no explanation, no extra text. Ignore any extra fields like نوع العملية, الحالة, etc.

Field mapping (Arabic label → JSON key):
- رقم العملية → transaction_id
- التاريخ و الزمن / التاريخ والوقت → date_time  (keep exactly as shown, e.g. "04-Mar-2026 16:24:02")
- من حساب / من → from_account  (digits only, remove all spaces)
- الى حساب / إلى حساب / إلى → to_account  (digits only, remove all spaces)
- اسم المرسل اليه / إسم المرسل اليه / اسم المرسل اليه → recipient_name  (full Arabic name)
- رقم الموبايل → mobile_number  (use "N/A" if not present or shown as N/A)
- التعليق → comment  (use "N/A" if not present or shown as N/A)
- المبلغ → amount  (plain number, no commas, no currency symbols)

Rules:
1. Remove ALL spaces from account numbers (from_account and to_account).
2. Use "N/A" for any missing or blank text field.
3. amount must be a plain numeric value (e.g. 2000000.00).
4. Return exactly ${count} JSON objects in order, one per image.

Examples:
Style 1: {"transaction_id":"20024933620","date_time":"04-Mar-2026 19:13:16","from_account":"08131231711700001","to_account":"03431595497500001","recipient_name":"محمد بابكر الجزولي عثمان","mobile_number":"N/A","comment":"N/A","amount":3000000.00}
Style 2: {"transaction_id":"20090302958","date_time":"04-Mar-2026 16:24:02","from_account":"00130319603000001","to_account":"03431595497500001","recipient_name":"محمد بابكر الجزولى عثمان","mobile_number":"N/A","comment":"N/A","amount":2000000.00}`;
}

async function callGeminiWithRotation(
  ai: any,
  images: Array<{ base64: string; mimeType: string }>,
): Promise<{ text: string; model: string }> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Try each model in order, skipping ones we know are unavailable
  for (const model of GEMINI_MODELS) {
    if (isModelUnavailable(unavailableModels, model)) {
      console.log(`[Gemini OCR] Skipping ${model} (unavailable)`);
      continue;
    }

    const parts: any[] = [{ text: buildBatchPrompt(images.length) }];
    images.forEach((img, i) => {
      if (images.length > 1) parts.push({ text: `Image ${i + 1}:` });
      parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.base64 } });
    });

    // Try this model up to 3 times (for per-minute rate limits)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`[Gemini OCR] Trying model: ${model}, batch: ${images.length}, attempt: ${attempt + 1}`);
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
        });
        const text = (response.text || '').replace(/```json\n?|```\n?/g, '').trim();
        console.log(`[Gemini OCR] Success with ${model}`);
        return { text, model };
      } catch (err: any) {
        const msg = err.message || '';
        const isModelNotFound = msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND');
        const isDailyExhausted = msg.includes('GenerateRequestsPerDay') && msg.includes('limit: 0');
        const isMinuteLimit = (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) && !isDailyExhausted;

        if (isModelNotFound || isDailyExhausted) {
          console.log(`[Gemini OCR] Model ${model} unavailable (${isModelNotFound ? '404' : 'daily exhausted'}) — rotating`);
          markModelUnavailable(unavailableModels, model);
          break; // try next model
        }

        if (isMinuteLimit) {
          // Per-minute rate limit — wait and retry same model
          const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
          const waitMs = retryMatch ? (Math.ceil(parseFloat(retryMatch[1])) + 2) * 1000 : 15000;
          console.log(`[Gemini OCR] ${model} minute rate limit — waiting ${Math.round(waitMs / 1000)}s`);
          await sleep(waitMs);
          continue;
        }

        // Other error — rethrow
        throw err;
      }
    }
  }

  throw new Error('All Gemini models unavailable — daily quotas exhausted. Quotas reset at midnight Pacific time.');
}

// ─── Groq fallback — llama-4-scout is the only current Groq vision model ────
// It ONLY supports one image per request — we process images individually then combine
const GROQ_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct', // only Groq vision model (one image at a time)
];

async function callGroqSingleImage(
  apiKey: string,
  model: string,
  img: { base64: string; mimeType: string },
  imageIndex: number,
  totalImages: number,
  sleep: (ms: number) => Promise<void>,
): Promise<string> {
  const singlePrompt = buildBatchPrompt(1);
  const content: any[] = [
    { type: 'text', text: singlePrompt },
    { type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` } },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    console.log(`[Groq OCR] Model: ${model}, image ${imageIndex + 1}/${totalImages}, attempt: ${attempt + 1}`);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0, max_tokens: 512 }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
      const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
      console.warn(`[Groq OCR] HTTP ${res.status} for image ${imageIndex + 1}: ${errMsg.slice(0, 200)}`);
      const isDecommissioned = errMsg.includes('decommissioned') || errMsg.includes('not supported');
      const isNotFound = res.status === 404 || errMsg.includes('not found') || errMsg.includes('does not exist');
      const isDailyLimit = res.status === 429 && errMsg.toLowerCase().includes('day');
      const isMinuteLimit = res.status === 429 && !isDailyLimit;
      const isInvalidImage = errMsg.toLowerCase().includes('invalid image') || errMsg.toLowerCase().includes('unsupported image');

      if (isDecommissioned || isNotFound || isDailyLimit) {
        markModelUnavailable(unavailableGroqModels, model);
        throw new Error(`Groq model unavailable: ${errMsg}`);
      }
      if (isMinuteLimit) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '10', 10);
        console.log(`[Groq OCR] Minute rate limit — waiting ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (isInvalidImage) {
        // Image was rejected by model but model itself is fine — signal per-image failure
        throw new Error(`Groq image rejected (${res.status}): ${errMsg}`);
      }
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
    if (isModelUnavailable(unavailableGroqModels, model)) {
      console.log(`[Groq OCR] Skipping ${model} (unavailable)`);
      continue;
    }

    try {
      // Llama-4-Scout only supports 1 image per request — process individually then merge
      const results: any[] = [];
      let successCount = 0;
      for (let i = 0; i < images.length; i++) {
        try {
          const singleText = await callGroqSingleImage(apiKey, model, images[i], i, images.length, sleep);
          let parsed: any;
          try { parsed = JSON.parse(singleText.replace(/```json\n?|```\n?/g, '').trim()); } catch { parsed = null; }
          // Groq returns a single object per image — collect them
          results.push(Array.isArray(parsed) ? parsed[0] : (parsed || null));
          if (parsed) successCount++;
        } catch (imgErr: any) {
          const imgErrMsg = imgErr.message?.slice(0, 150) || 'unknown';
          console.warn(`[Groq OCR] Image ${i + 1} failed: ${imgErrMsg}`);
          if (imgErr.message?.startsWith('Groq model unavailable')) throw imgErr; // propagate model failure
          // Image-level error (invalid image, network, etc.) — push empty obj, continue
          results.push(null);
        }
        // Small delay between calls to avoid minute rate limiting
        if (i < images.length - 1) await sleep(400);
      }

      if (successCount === 0) throw new Error('Groq: all images failed to process');

      // Combine all individual results into a JSON array string
      const combinedText = JSON.stringify(results.map(r => r ?? {}));
      console.log(`[Groq OCR] ${successCount}/${images.length} images processed with ${model}`);
      return { text: combinedText, model: `groq/${model}` };

    } catch (err: any) {
      if (err.message?.startsWith('GROQ_API_KEY')) throw err;
      if (err.message?.startsWith('Groq model unavailable')) continue; // try next model
      if (err.message?.startsWith('Groq: all images failed')) {
        // Mark model as unreliable for this session
        markModelUnavailable(unavailableGroqModels, model);
        continue;
      }
      // Network or other error — re-throw
      throw err;
    }
  }

  throw new Error('All Groq models unavailable. Check GROQ_API_KEY or try again later.');
}

// postProcess is imported from src/utils/ocrPostProcess.ts
const postProcess = ocrPostProcess;

function geminiOcrPlugin() {
  return {
    name: 'gemini-ocr-api',
    configureServer(server: any) {
      server.middlewares.use('/api/extract-transaction', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== 'POST') return next();

        // ── Auth check ───────────────────────────────────────────────────
        // Require a shared dev secret so arbitrary clients on the network
        // cannot burn through Gemini/Groq quotas.
        const OCR_SECRET = process.env.OCR_DEV_SECRET;
        if (OCR_SECRET) {
          const authHeader = req.headers['authorization'] || '';
          if (authHeader !== `Bearer ${OCR_SECRET}`) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
        }

        // ── Body collection with size guard (10 MB) ──────────────────────
        const MAX_BODY_BYTES = 10 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let aborted = false;

        req.on('error', (err) => {
          console.error('[OCR] Request stream error:', err.message);
          if (!res.headersSent) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Request stream error' }));
          }
        });

        req.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_BODY_BYTES) {
            aborted = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Request body too large (max 10 MB)' }));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        req.on('end', async () => {
          if (aborted) return;
          const body = Buffer.concat(chunks).toString();
          try {
            const parsed = JSON.parse(body);
            const images: Array<{ base64: string; mimeType: string }> = parsed.images
              ? parsed.images
              : [{ base64: parsed.base64, mimeType: parsed.mimeType || 'image/jpeg' }];

            // ── Try Gemini first ─────────────────────────────────────────
            let text = '';
            let model = '';
            let geminiExhausted = false;

            try {
              const { GoogleGenAI } = await import('@google/genai');
              const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY || '' });
              ({ text, model } = await callGeminiWithRotation(ai, images));
            } catch (geminiErr: any) {
              geminiExhausted = geminiErr.message?.includes('All Gemini models unavailable');
              if (!geminiExhausted) throw geminiErr; // real error, not quota
              console.log('[OCR] Gemini exhausted — trying Groq fallback');
            }

            // ── Groq fallback if Gemini exhausted ────────────────────────
            if (geminiExhausted) {
              ({ text, model } = await callGroqOCR(images));
            }

            // ── Post-process and validate output ─────────────────────────
            const processed = postProcess(text);
            try {
              JSON.parse(processed); // verify output is valid JSON before sending
            } catch {
              console.error('[OCR] postProcess returned invalid JSON:', processed.slice(0, 200));
              throw new Error('OCR model returned unparseable output. Try again.');
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ text: processed, model }));

          } catch (err: any) {
            const msg = err.message || 'OCR failed';
            const noKey = msg.includes('GROQ_API_KEY not configured');
            const allExhausted = msg.includes('All Gemini') || msg.includes('All Groq');
            const isClientError = msg.includes('unparseable output') || msg.includes('Request body');
            console.error('[OCR] Fatal:', msg.slice(0, 300));
            res.statusCode = noKey ? 503 : allExhausted ? 429 : isClientError ? 422 : 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: noKey
                ? 'Gemini daily quota exhausted and no Groq API key configured. Add GROQ_API_KEY to use the free Groq fallback.'
                : msg,
              retryAfterSec: allExhausted ? 3600 : 30,
              isDailyExhausted: allExhausted && !noKey,
              needsGroqKey: noKey,
            }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
  plugins: [
    react(),
    geminiOcrPlugin(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  optimizeDeps: {
    exclude: [
      'face-api.js',
      'jspdf',
      'jspdf-autotable',
      'xlsx',
      'docx',
      'html2canvas',
      '@octokit/rest',
      '@google/genai',
      'p-limit',
      'p-retry',
      'drizzle-zod',
      'zod-validation-error'
    ]
  },
  esbuild: {
    // Remove console output in production bundles
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@assets": path.resolve(__dirname, "./attached_assets"),
    },
    dedupe: ['react', 'react-dom'],
  },
  define: {
    // Explicitly define environment variables for mobile builds
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(process.env.VITE_FIREBASE_API_KEY),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(process.env.VITE_FIREBASE_AUTH_DOMAIN),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(process.env.VITE_FIREBASE_PROJECT_ID),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(process.env.VITE_FIREBASE_STORAGE_BUCKET),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(process.env.VITE_FIREBASE_APP_ID),
    'import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY': JSON.stringify(process.env.VITE_FIREBASE_VAPID_PUBLIC_KEY),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VITE_APP_VERSION || '1.0.0'),
    'import.meta.env.VITE_BUILD_NUMBER': JSON.stringify(process.env.VITE_BUILD_NUMBER || '1'),
    'import.meta.env.VITE_OCR_DEV_SECRET': JSON.stringify(process.env.VITE_OCR_DEV_SECRET || ''),
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      external: [
        '@capacitor-firebase/crashlytics',
        '@capacitor/haptics',
        'capacitor-native-biometric',
        'capacitor-native-settings',
      ],
      output: {
        manualChunks(id) {
          // Core React libraries + Radix UI (MUST be in same chunk to avoid forwardRef errors)
          // All packages that depend on React or that React components depend on must be here
          if (id.includes('node_modules/react/') || 
              id.includes('node_modules/react-dom/') ||
              id.includes('@radix-ui') ||
              id.includes('class-variance-authority') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge') ||
              id.includes('@heroicons/react') ||
              id.includes('lucide-react')) {
            return 'vendor';
          }
          
          // React Router (depends on React, loads after vendor)
          if (id.includes('react-router-dom') || id.includes('wouter')) {
            return 'router';
          }
          
          // Form handling
          if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
            return 'forms';
          }
          
          // Data visualization libraries
          if (id.includes('recharts') || id.includes('chart.js') || id.includes('react-chartjs')) {
            return 'charts';
          }
          
          // Map libraries
          if (id.includes('leaflet') || id.includes('react-leaflet')) {
            return 'maps';
          }
          
          // PDF generation (very large)
          if (id.includes('jspdf')) {
            return 'jspdf';
          }
          
          // Excel/CSV export
          if (id.includes('xlsx-js-style')) {
            return 'xlsx';
          }
          if (id.includes('xlsx')) {
            return 'xlsx';
          }
          
          // Document generation
          if (id.includes('docx') || id.includes('file-saver') || id.includes('html2canvas')) {
            return 'docs';
          }
          
          // Face detection
          if (id.includes('face-api')) {
            return 'face-detection';
          }
          
          // Query and state management
          if (id.includes('@tanstack/react-query')) {
            return 'query';
          }
          
          // Animation
          if (id.includes('framer-motion')) {
            return 'animations';
          }
          
          // Capacitor (mobile)
          if (id.includes('@capacitor')) {
            return 'capacitor';
          }
          
          // Date utilities
          if (id.includes('date-fns')) {
            return 'date-utils';
          }
          
          // All other node_modules (including React which we want here)
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
}));
