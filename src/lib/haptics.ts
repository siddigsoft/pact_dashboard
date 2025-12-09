import { Capacitor } from '@capacitor/core';

export type HapticFeedbackType = 
  | 'light' 
  | 'medium' 
  | 'heavy' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'selection';

const isNative = Capacitor.isNativePlatform();

let HapticsModule: any = null;
let ImpactStyleEnum: any = null;
let NotificationTypeEnum: any = null;

async function loadHapticsModule() {
  if (HapticsModule) return true;
  
  try {
    const module = await import('@capacitor/haptics');
    HapticsModule = module.Haptics;
    ImpactStyleEnum = module.ImpactStyle;
    NotificationTypeEnum = module.NotificationType;
    return true;
  } catch {
    return false;
  }
}

export async function triggerHaptic(type: HapticFeedbackType = 'light'): Promise<void> {
  if (!isNative) {
    if ('vibrate' in navigator) {
      const duration = type === 'heavy' ? 50 : type === 'medium' ? 30 : 15;
      navigator.vibrate(duration);
    }
    return;
  }

  const loaded = await loadHapticsModule();
  if (!loaded || !HapticsModule) {
    if ('vibrate' in navigator) {
      const duration = type === 'heavy' ? 50 : type === 'medium' ? 30 : 15;
      navigator.vibrate(duration);
    }
    return;
  }

  try {
    switch (type) {
      case 'light':
        await HapticsModule.impact({ style: ImpactStyleEnum.Light });
        break;
      case 'medium':
        await HapticsModule.impact({ style: ImpactStyleEnum.Medium });
        break;
      case 'heavy':
        await HapticsModule.impact({ style: ImpactStyleEnum.Heavy });
        break;
      case 'success':
        await HapticsModule.notification({ type: NotificationTypeEnum.Success });
        break;
      case 'warning':
        await HapticsModule.notification({ type: NotificationTypeEnum.Warning });
        break;
      case 'error':
        await HapticsModule.notification({ type: NotificationTypeEnum.Error });
        break;
      case 'selection':
        await HapticsModule.selectionStart();
        await HapticsModule.selectionChanged();
        await HapticsModule.selectionEnd();
        break;
    }
  } catch (error) {
    if ('vibrate' in navigator) {
      const duration = type === 'heavy' ? 50 : type === 'medium' ? 30 : 15;
      navigator.vibrate(duration);
    }
  }
}

export async function vibratePattern(pattern: number[]): Promise<void> {
  if (!isNative) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
    return;
  }

  const loaded = await loadHapticsModule();
  if (!loaded || !HapticsModule) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
    return;
  }

  try {
    for (let i = 0; i < pattern.length; i++) {
      if (i % 2 === 0) {
        await HapticsModule.vibrate({ duration: pattern[i] });
      } else {
        await new Promise(resolve => setTimeout(resolve, pattern[i]));
      }
    }
  } catch (error) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }
}

export const hapticPresets = {
  buttonPress: () => triggerHaptic('light'),
  buttonRelease: () => triggerHaptic('selection'),
  toggle: () => triggerHaptic('medium'),
  success: () => triggerHaptic('success'),
  error: () => triggerHaptic('error'),
  warning: () => triggerHaptic('warning'),
  pull: () => triggerHaptic('light'),
  refresh: () => triggerHaptic('medium'),
  swipe: () => triggerHaptic('selection'),
  longPress: () => triggerHaptic('heavy'),
  notification: () => vibratePattern([100, 50, 100]),
  selection: () => triggerHaptic('selection'),
};
