import { Capacitor } from '@capacitor/core';

export type HapticPattern = 
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection'
  | 'swipeLeft'
  | 'swipeRight'
  | 'swipeUp'
  | 'swipeDown'
  | 'pullToRefresh'
  | 'dragStart'
  | 'dragEnd'
  | 'formError'
  | 'formSuccess'
  | 'syncStart'
  | 'syncComplete'
  | 'syncError'
  | 'emergency'
  | 'notification'
  | 'message'
  | 'call'
  | 'countdown'
  | 'unlock'
  | 'lock'
  | 'toggle'
  | 'slider'
  | 'picker'
  | 'keyboard'
  | 'delete'
  | 'undo'
  | 'confirm'
  | 'cancel';

interface PatternConfig {
  type: 'impact' | 'notification' | 'selection' | 'vibrate';
  style?: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
  notificationType?: 'success' | 'warning' | 'error';
  pattern?: number[];
  repeat?: number;
  delay?: number;
}

const isNative = Capacitor.isNativePlatform();

let HapticsModule: any = null;
let ImpactStyleEnum: any = null;
let NotificationTypeEnum: any = null;

async function loadHapticsModule(): Promise<boolean> {
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

const WEB_VIBRATE_PATTERNS: Record<HapticPattern, number[]> = {
  tap: [15],
  doubleTap: [15, 100, 15],
  longPress: [50],
  success: [30, 50, 30],
  warning: [50, 30, 50],
  error: [100, 50, 100],
  selection: [10],
  swipeLeft: [30],
  swipeRight: [30],
  swipeUp: [20],
  swipeDown: [20],
  pullToRefresh: [30, 30, 50],
  dragStart: [15],
  dragEnd: [30],
  formError: [50, 50, 50, 50, 100],
  formSuccess: [30, 50, 30],
  syncStart: [15],
  syncComplete: [50, 100, 100],
  syncError: [100, 50, 100, 50, 100],
  emergency: [200, 100, 200, 100, 200, 100, 500],
  notification: [100, 50, 100],
  message: [50, 50, 100],
  call: [500, 500, 500, 500, 500, 500],
  countdown: [30],
  unlock: [30, 50, 80],
  lock: [80, 50, 30],
  toggle: [30],
  slider: [10],
  picker: [10],
  keyboard: [15],
  delete: [50, 30, 80],
  undo: [30],
  confirm: [30],
  cancel: [15],
};

const HAPTIC_PATTERNS: Record<HapticPattern, PatternConfig> = {
  tap: { type: 'impact', style: 'light' },
  doubleTap: { type: 'impact', style: 'light', repeat: 2, delay: 100 },
  longPress: { type: 'impact', style: 'heavy' },

  success: { type: 'notification', notificationType: 'success' },
  warning: { type: 'notification', notificationType: 'warning' },
  error: { type: 'notification', notificationType: 'error' },

  selection: { type: 'selection' },

  swipeLeft: { type: 'impact', style: 'medium' },
  swipeRight: { type: 'impact', style: 'medium' },
  swipeUp: { type: 'impact', style: 'light' },
  swipeDown: { type: 'impact', style: 'light' },

  pullToRefresh: { type: 'vibrate', pattern: [30, 30, 50] },

  dragStart: { type: 'impact', style: 'light' },
  dragEnd: { type: 'impact', style: 'medium' },

  formError: { type: 'vibrate', pattern: [50, 50, 50, 50, 100] },
  formSuccess: { type: 'notification', notificationType: 'success' },

  syncStart: { type: 'impact', style: 'light' },
  syncComplete: { type: 'vibrate', pattern: [50, 100, 100] },
  syncError: { type: 'vibrate', pattern: [100, 50, 100, 50, 100] },

  emergency: { type: 'vibrate', pattern: [200, 100, 200, 100, 200, 100, 500] },

  notification: { type: 'vibrate', pattern: [100, 50, 100] },
  message: { type: 'vibrate', pattern: [50, 50, 100] },
  call: { type: 'vibrate', pattern: [500, 500, 500, 500, 500, 500] },

  countdown: { type: 'impact', style: 'medium' },
  unlock: { type: 'vibrate', pattern: [30, 50, 80] },
  lock: { type: 'vibrate', pattern: [80, 50, 30] },

  toggle: { type: 'impact', style: 'medium' },
  slider: { type: 'selection' },
  picker: { type: 'selection' },
  keyboard: { type: 'impact', style: 'light' },

  delete: { type: 'vibrate', pattern: [50, 30, 80] },
  undo: { type: 'impact', style: 'medium' },
  confirm: { type: 'impact', style: 'medium' },
  cancel: { type: 'impact', style: 'light' },
};

let vibrateUnavailableLogged = false;

function vibrateWithPattern(pattern: HapticPattern): void {
  if ('vibrate' in navigator) {
    const webPattern = WEB_VIBRATE_PATTERNS[pattern];
    if (webPattern) {
      try {
        navigator.vibrate(webPattern);
      } catch (error) {
        if (!vibrateUnavailableLogged) {
          console.warn('[EnhancedHaptics] Vibration failed:', error);
          vibrateUnavailableLogged = true;
        }
      }
    }
  } else {
    if (!vibrateUnavailableLogged) {
      console.debug('[EnhancedHaptics] Vibration API not available on this device');
      vibrateUnavailableLogged = true;
    }
  }
}

async function executePattern(config: PatternConfig, pattern?: HapticPattern): Promise<void> {
  const loaded = await loadHapticsModule();

  if (config.type === 'vibrate' && config.pattern) {
    if ('vibrate' in navigator) {
      navigator.vibrate(config.pattern);
    }
    return;
  }

  if (!isNative || !loaded || !HapticsModule) {
    if (pattern) {
      vibrateWithPattern(pattern);
    } else if ('vibrate' in navigator) {
      const duration = config.style === 'heavy' ? 50 : config.style === 'medium' ? 30 : 15;
      navigator.vibrate(duration);
    }
    return;
  }

  try {
    switch (config.type) {
      case 'impact':
        const impactStyle = config.style === 'heavy' 
          ? ImpactStyleEnum.Heavy 
          : config.style === 'medium' 
            ? ImpactStyleEnum.Medium 
            : ImpactStyleEnum.Light;
        await HapticsModule.impact({ style: impactStyle });
        break;

      case 'notification':
        const notifType = config.notificationType === 'error'
          ? NotificationTypeEnum.Error
          : config.notificationType === 'warning'
            ? NotificationTypeEnum.Warning
            : NotificationTypeEnum.Success;
        await HapticsModule.notification({ type: notifType });
        break;

      case 'selection':
        await HapticsModule.selectionStart();
        await HapticsModule.selectionChanged();
        await HapticsModule.selectionEnd();
        break;
    }
  } catch (error) {
    if (pattern) {
      vibrateWithPattern(pattern);
    } else if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }
  }
}

export async function triggerHaptic(pattern: HapticPattern): Promise<void> {
  const config = HAPTIC_PATTERNS[pattern];
  if (!config) return;

  if (config.repeat && config.repeat > 1) {
    for (let i = 0; i < config.repeat; i++) {
      await executePattern(config, pattern);
      if (config.delay && i < config.repeat - 1) {
        await new Promise((resolve) => setTimeout(resolve, config.delay));
      }
    }
  } else {
    await executePattern(config, pattern);
  }
}

export async function playCountdownHaptic(count: number, interval: number = 1000): Promise<void> {
  for (let i = count; i > 0; i--) {
    await triggerHaptic('countdown');
    if (i > 1) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

export async function playProgressHaptic(progress: number, prevProgress: number): Promise<void> {
  const thresholds = [25, 50, 75, 100];

  for (const threshold of thresholds) {
    if (prevProgress < threshold && progress >= threshold) {
      if (threshold === 100) {
        await triggerHaptic('success');
      } else {
        await triggerHaptic('tap');
      }
      break;
    }
  }
}

export async function playSliderHaptic(value: number, min: number, max: number, steps: number): Promise<void> {
  const stepSize = (max - min) / steps;
  const currentStep = Math.round((value - min) / stepSize);
  
  await triggerHaptic('slider');
}

export const hapticFeedback = {
  tap: () => triggerHaptic('tap'),
  doubleTap: () => triggerHaptic('doubleTap'),
  longPress: () => triggerHaptic('longPress'),

  success: () => triggerHaptic('success'),
  warning: () => triggerHaptic('warning'),
  error: () => triggerHaptic('error'),

  selection: () => triggerHaptic('selection'),

  swipe: (direction: 'left' | 'right' | 'up' | 'down') => {
    const patterns: Record<string, HapticPattern> = {
      left: 'swipeLeft',
      right: 'swipeRight',
      up: 'swipeUp',
      down: 'swipeDown',
    };
    return triggerHaptic(patterns[direction]);
  },

  pullToRefresh: () => triggerHaptic('pullToRefresh'),

  drag: {
    start: () => triggerHaptic('dragStart'),
    end: () => triggerHaptic('dragEnd'),
  },

  form: {
    error: () => triggerHaptic('formError'),
    success: () => triggerHaptic('formSuccess'),
  },

  sync: {
    start: () => triggerHaptic('syncStart'),
    complete: () => triggerHaptic('syncComplete'),
    error: () => triggerHaptic('syncError'),
  },

  emergency: () => triggerHaptic('emergency'),

  notification: () => triggerHaptic('notification'),
  message: () => triggerHaptic('message'),
  call: () => triggerHaptic('call'),

  countdown: (count: number) => playCountdownHaptic(count),

  auth: {
    unlock: () => triggerHaptic('unlock'),
    lock: () => triggerHaptic('lock'),
  },

  ui: {
    toggle: () => triggerHaptic('toggle'),
    slider: () => triggerHaptic('slider'),
    picker: () => triggerHaptic('picker'),
    keyboard: () => triggerHaptic('keyboard'),
  },

  action: {
    delete: () => triggerHaptic('delete'),
    undo: () => triggerHaptic('undo'),
    confirm: () => triggerHaptic('confirm'),
    cancel: () => triggerHaptic('cancel'),
  },

  progress: (current: number, previous: number) => playProgressHaptic(current, previous),
};

export default hapticFeedback;
