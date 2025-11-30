import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export async function initCapacitor() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#00000000' });
    
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
