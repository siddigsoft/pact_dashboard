
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/mobile.css' // Import mobile-specific styles
import { initCapacitor } from './lib/capacitor-init'

initCapacitor().then(() => {
  console.log('[PACT] App initialized');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
