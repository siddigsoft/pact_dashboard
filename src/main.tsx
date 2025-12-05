
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/mobile.css' // Import mobile-specific styles
import { initCapacitor } from './lib/capacitor-init'
import './lib/i18n' // Initialize i18n for multilingual support

initCapacitor().then(() => {
  console.log('[PACT] App initialized');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
