import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { config } from 'dotenv';

// Load environment variables from .env file
config();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
  plugins: [
    react(),
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
      '@octokit/rest'
    ]
  },
  esbuild: {
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
          // Core React libraries - keep in vendor chunk to ensure proper loading order
          // React must be available before any other chunks that use it
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor';
          }
          
          // React Router (depends on React, so should load after vendor)
          if (id.includes('react-router-dom') || id.includes('wouter')) {
            return 'router';
          }
          
          // Supabase client
          if (id.includes('@supabase')) {
            return 'supabase';
          }
          
          // Split Radix UI into smaller chunks by component type
          if (id.includes('@radix-ui/react-dialog') || id.includes('@radix-ui/react-alert-dialog')) {
            return 'radix-dialogs';
          }
          if (id.includes('@radix-ui/react-dropdown') || id.includes('@radix-ui/react-select') || id.includes('@radix-ui/react-menubar')) {
            return 'radix-menus';
          }
          if (id.includes('@radix-ui')) {
            return 'radix-ui';
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
          
          // Icons
          if (id.includes('lucide-react')) {
            return 'icons';
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
