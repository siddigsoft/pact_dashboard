import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { config } from 'dotenv';
import type { IncomingMessage, ServerResponse } from 'http';

// Load environment variables from .env file
config();

// Models in priority order — each has its own daily quota; rotate through them
const GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
];
// Track which models hit daily quota exhaustion (resets when server restarts)
const exhaustedModels = new Set<string>();
let currentModelIdx = 0;

function getNextModel(): string | null {
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const idx = (currentModelIdx + i) % GEMINI_MODELS.length;
    const model = GEMINI_MODELS[idx];
    if (!exhaustedModels.has(model)) {
      currentModelIdx = idx;
      return model;
    }
  }
  return null; // all exhausted
}

function buildBatchPrompt(count: number): string {
  return `You are a bank transaction OCR expert. I will show you ${count} Bank of Khartoum transfer screenshot${count > 1 ? 's' : ''} (Arabic or English).
Extract transaction data from EACH image. Return ONLY a valid JSON array with exactly ${count} objects in order, one per image. No markdown, no extra text.
Each object must have exactly these fields:
{"transaction_id":"","date_time":"DD-Mon-YYYY HH:MM:SS","from_account":"","to_account":"","recipient_name":"","mobile_number":"N/A","comment":"N/A","amount":0.00}
Arabic labels: رقم العملية=transaction_id, التاريخ والوقت/التاريخ و الزمن=date_time, من حساب/من=from_account, الى حساب/إلى=to_account, إسم المرسل اليه=recipient_name, رقم الموبايل=mobile_number, التعليق=comment, المبلغ=amount.
Rules: Use N/A for missing text fields. Amount must be a plain number. Return exactly ${count} objects in the JSON array.`;
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
            // Support both single image {base64, mimeType} and batch {images:[{base64,mimeType}]}
            const images: Array<{ base64: string; mimeType: string }> = parsed.images
              ? parsed.images
              : [{ base64: parsed.base64, mimeType: parsed.mimeType || 'image/jpeg' }];

            const { GoogleGenAI } = await import('@google/genai');
            const apiKey = process.env.GOOGLE_AI_API_KEY || '';
            const ai = new GoogleGenAI({ apiKey });

            const model = getNextModel();
            if (!model) {
              res.statusCode = 429;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'All Gemini models daily quota exhausted — resets at midnight Pacific time', retryAfterSec: 3600 }));
              return;
            }

            console.log(`[Gemini OCR] Using model: ${model}, batch size: ${images.length}`);

            const parts: any[] = [{ text: buildBatchPrompt(images.length) }];
            images.forEach((img, i) => {
              if (images.length > 1) parts.push({ text: `Image ${i + 1}:` });
              parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.base64 } });
            });

            const response = await ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts }],
            });

            const text = (response.text || '').replace(/```json\n?|```\n?/g, '').trim();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ text, model }));

          } catch (err: any) {
            const msg = err.message || 'Gemini API call failed';
            const isDailyExhausted = msg.includes('GenerateRequestsPerDay') || (msg.includes('limit: 0') && msg.includes('PerDay'));
            const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota');

            if (isDailyExhausted) {
              // Mark current model as exhausted and move to next
              const failed = GEMINI_MODELS[currentModelIdx];
              exhaustedModels.add(failed);
              console.log(`[Gemini OCR] Model ${failed} daily quota exhausted — switching. Remaining: ${GEMINI_MODELS.filter(m => !exhaustedModels.has(m)).join(', ') || 'none'}`);
            }

            console.error(`[Gemini OCR] Error (${GEMINI_MODELS[currentModelIdx]}):`, msg.slice(0, 200));
            res.statusCode = isRateLimit ? 429 : 500;
            res.setHeader('Content-Type', 'application/json');
            let retryAfterSec = 5;
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
            if (retryMatch) retryAfterSec = Math.ceil(parseFloat(retryMatch[1])) + 1;
            else if (isDailyExhausted) retryAfterSec = 1; // retry immediately with next model
            res.end(JSON.stringify({ error: isDailyExhausted ? 'Model quota exhausted — switching to next model' : msg, retryAfterSec, isDailyExhausted }));
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
