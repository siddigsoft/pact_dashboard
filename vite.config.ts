import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { config } from 'dotenv';
import type { IncomingMessage, ServerResponse } from 'http';

// Load environment variables from .env file
config();

const GEMINI_OCR_PROMPT = `You are a bank transaction OCR assistant. Analyze this Bank of Khartoum transfer confirmation screenshot.
The screen may be in Arabic or English. Extract these fields and return ONLY valid JSON (no markdown, no extra text):
{
  "transaction_id": "the transaction/operation number",
  "date_time": "DD-Mon-YYYY HH:MM:SS format if possible",
  "from_account": "source account number",
  "to_account": "destination account number",
  "recipient_name": "recipient full name",
  "mobile_number": "mobile number or N/A",
  "comment": "comment/note or N/A",
  "amount": 0.00
}
Arabic label mapping: رقم العملية=transaction_id, التاريخ و الزمن/التاريخ والوقت=date_time, من حساب/من=from_account, الى حساب/إلى=to_account, إسم المرسل اليه=recipient_name, رقم الموبايل=mobile_number, التعليق=comment, المبلغ=amount.
Rules: Return N/A for missing text fields. Amount must be a plain number (e.g. 1000000.00). Do NOT include any markdown fences.`;

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
            const { base64, mimeType } = JSON.parse(body);
            const { GoogleGenAI } = await import('@google/genai');

            const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || '';
            const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
            const ai = new GoogleGenAI({
              apiKey,
              ...(baseUrl && baseUrl !== 'http://localhost:1106/modelfarm/gemini' ? {
                httpOptions: { apiVersion: '', baseUrl } as any,
              } : {}),
            });

            const response = await ai.models.generateContent({
              model: 'gemini-2.0-flash',
              contents: [{
                role: 'user',
                parts: [
                  { text: GEMINI_OCR_PROMPT },
                  { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64 } },
                ],
              }],
            });

            const text = response.text || '{}';
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ text }));
          } catch (err: any) {
            console.error('[Gemini OCR] Error:', err.message);
            const msg = err.message || 'Gemini API call failed';
            const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota');
            res.statusCode = isRateLimit ? 429 : 500;
            res.setHeader('Content-Type', 'application/json');
            // Extract the retryDelay from the error message (e.g. "Please retry in 19.1s")
            let retryAfterSec = 0;
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
            if (retryMatch) retryAfterSec = Math.ceil(parseFloat(retryMatch[1])) + 2;
            res.end(JSON.stringify({ error: msg, retryAfterSec }));
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
