/** Format notification badge counts for UI (cap at 99+). */
export function formatNotificationBadgeCount(count: number, max = 99): string | number {
  if (count <= 0) return 0;
  return count > max ? `${max}+` : count;
}
