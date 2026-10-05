export type HapticFeedbackType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection';

export async function triggerHaptic(type: HapticFeedbackType = 'light'): Promise<void> {
  if ('vibrate' in navigator) {
    const duration = type === 'heavy' ? 50 : type === 'medium' ? 30 : 15;
    navigator.vibrate(duration);
  }
}

export async function vibratePattern(pattern: number[]): Promise<void> {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
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
