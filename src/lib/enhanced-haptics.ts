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

export async function triggerHaptic(pattern: HapticPattern): Promise<void> {
  if ('vibrate' in navigator) {
    const webPattern = WEB_VIBRATE_PATTERNS[pattern];
    if (webPattern) navigator.vibrate(webPattern);
  }
}

export async function playCountdownHaptic(count: number, interval: number = 1000): Promise<void> {
  for (let i = count; i > 0; i--) {
    await triggerHaptic('countdown');
    if (i > 1) await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export async function playProgressHaptic(progress: number, prevProgress: number): Promise<void> {
  const thresholds = [25, 50, 75, 100];
  for (const threshold of thresholds) {
    if (prevProgress < threshold && progress >= threshold) {
      await triggerHaptic(threshold === 100 ? 'success' : 'tap');
      break;
    }
  }
}

export async function playSliderHaptic(_value: number, _min: number, _max: number, _steps: number): Promise<void> {
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
