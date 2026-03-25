
// Reduce max toast limit to reduce notifications clutter
export const TOAST_LIMIT = 2;

// Decreased time to remove to reduce notification clutter
export const TOAST_REMOVE_DELAY = 8000;

export const DEFAULT_DURATIONS = {
  default: 6000,
  success: 5000,
  destructive: 8000,
  warning: 7000,
  info: 5000,
  siddig: 6000
};

let count = 0;

export function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}
