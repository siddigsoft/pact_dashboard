import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { config } from 'dotenv';
import type { IncomingMessage, ServerResponse } from 'http';

// Load environment variables from .env file
config();

// Models tried in order — each has its own daily quota
// Server rotates through them internally, so the client never has to retry for model switching
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',              // 1500 RPD, 30 RPM
  'gemini-2.0-flash',                   // 1500 RPD, 15 RPM
  'gemini-2.5-flash-preview-04-17',     // 500 RPD, separate quota
  'gemini-2.0-flash-exp',               // experimental, separate quota
  'gemini-2.0-flash-thinking-exp-01-21',// thinking model, separate quota
];
// Track which models are unavailable this server session (exhausted daily OR 404/not-found)
const unavailableModels = new Set<string>();

function buildBatchPrompt(count: number): string {
  return `You are a bank transaction OCR expert. I will show you ${count} Bank of Khartoum transfer screenshot${count > 1 ? 's' : ''} (Arabic or English).
Extract transaction data from EACH image. Return ONLY a valid JSON array with exactly ${count} objects in order, one per image. No markdown, no extra text.
Each object must have exactly these fields:
{"transaction_id":"","date_time":"DD-Mon-YYYY HH:MM:SS","from_account":"","to_account":"","recipient_name":"","mobile_number":"N/A","comment":"N/A","amount":0.00}
Arabic labels: رقم العملية=transaction_id, التاريخ والوقت/التاريخ و الزمن=date_time, من حساب/من=from_account, الى حساب/إلى=to_account, إسم المرسل اليه=recipient_name, رقم الموبايل=mobile_number, التعليق=comment, المبلغ=amount.
Rules: Use N/A for missing text fields. Amount must be a plain number. Return exactly ${count} objects in the JSON array.`;
}

async function callGeminiWithRotation(
  ai: any,
  images: Array<{ base64: string; mimeType: string }>,
): Promise<{ text: string; model: string }> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Try each model in order, skipping ones we know are unavailable
  for (const model of GEMINI_MODELS) {
    if (unavailableModels.has(model)) {
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
          unavailableModels.add(model);
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

function geminiOcrPlugin() {
  return {
    name: 'gemini-ocr-api',
    configureServer(server: any) {
      server.middlewares.use('/api/extract-transaction', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== 'POST') return next();

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body);
            const images: Array<{ base64: string; mimeType: string }> = parsed.images
              ? parsed.images
              : [{ base64: parsed.base64, mimeType: parsed.mimeType || 'image/jpeg' }];

            const { GoogleGenAI } = await import('@google/genai');
            const apiKey = process.env.GOOGLE_AI_API_KEY || '';
            const ai = new GoogleGenAI({ apiKey });

            const { text, model } = await callGeminiWithRotation(ai, images);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ text, model }));

          } catch (err: any) {
            const msg = err.message || 'Gemini API call failed';
            const allExhausted = msg.includes('All Gemini models unavailable');
            console.error('[Gemini OCR] Fatal:', msg.slice(0, 300));
            res.statusCode = 429;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: msg, retryAfterSec: allExhausted ? 3600 : 30, isDailyExhausted: allExhausted }));
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
    // Keep console in production to debug white screen / errors in browser DevTools
    drop: mode === 'production' ? ['debugger'] : [],
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
