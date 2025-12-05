import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticFeedbackType = 
  | 'light' 
  | 'medium' 
  | 'heavy' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'selection';

const isNative = Capacitor.isNativePlatform();

export async function triggerHaptic(type: HapticFeedbackType = 'light'): Promise<void> {
  if (!isNative) {
    if ('vibrate' in navigator) {
      const duration = type === 'heavy' ? 50 : type === 'medium' ? 30 : 15;
      navigator.vibrate(duration);
    }
    return;
  }

  try {
    switch (type) {
      case 'light':
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case 'heavy':
        await Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case 'error':
        await Haptics.notification({ type: NotificationType.Error });
        break;
      case 'selection':
        await Haptics.selectionStart();
        await Haptics.selectionChanged();
        await Haptics.selectionEnd();
        break;
    }
  } catch (error) {
    console.warn('Haptic feedback not available:', error);
  }
}

export async function vibratePattern(pattern: number[]): Promise<void> {
  if (!isNative) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
    return;
  }

  try {
    for (let i = 0; i < pattern.length; i++) {
      if (i % 2 === 0) {
        await Haptics.vibrate({ duration: pattern[i] });
      } else {
        await new Promise(resolve => setTimeout(resolve, pattern[i]));
      }
    }
  } catch (error) {
    console.warn('Vibration pattern not available:', error);
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
};
