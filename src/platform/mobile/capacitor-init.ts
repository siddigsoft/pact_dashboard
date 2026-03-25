import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined') {
    const isDark = document.documentElement.classList.contains('dark') ||
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isDark ? 'dark' : 'light';
  }
  return 'light';
}

export async function updateStatusBarStyle() {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    const theme = getSystemTheme();
    await StatusBar.setStyle({ 
      style: theme === 'dark' ? Style.Dark : Style.Light 
    });
  } catch (error) {
    console.error('[Capacitor] Failed to update StatusBar style:', error);
  }
}

export async function initCapacitor() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: '#00000000' });
    await updateStatusBarStyle();
    
    if (typeof window !== 'undefined') {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.attributeName === 'class') {
            updateStatusBarStyle();
          }
        }
      });
      
      observer.observe(document.documentElement, { 
        attributes: true, 
        attributeFilter: ['class'] 
      });
      
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        updateStatusBarStyle();
      });
    }
    
    console.log('[Capacitor] StatusBar configured for edge-to-edge display');
  } catch (error) {
    console.error('[Capacitor] Failed to initialize StatusBar:', error);
  }
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatform(): string {
  return Capacitor.getPlatform();
}
