import { addDays, subDays, subHours, isAfter, isBefore, formatDistanceToNow, addHours } from 'date-fns';
import { AutoReleaseSettings, DEFAULT_AUTO_RELEASE_SETTINGS } from '@/types/postponement';

export interface ConfirmationDeadlines {
  confirmation_deadline: string;
  autorelease_at: string;
  confirmation_status: 'pending' | 'confirmed' | 'auto_released';
}

export interface DateRangeDeadlines extends ConfirmationDeadlines {
  visitDateFrom: string;
  visitDateTo: string;
  effectiveVisitDate: string;
}

/**
 * Get auto-release settings from localStorage or use defaults
 */
export function getAutoReleaseSettings(): AutoReleaseSettings {
  try {
    const stored = localStorage.getItem('autoReleaseSettings');
    if (stored) {
      return { ...DEFAULT_AUTO_RELEASE_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to parse auto-release settings:', e);
  }
  return DEFAULT_AUTO_RELEASE_SETTINGS;
}

/**
 * Save auto-release settings to localStorage
 */
export function saveAutoReleaseSettings(settings: Partial<AutoReleaseSettings>): void {
  const current = getAutoReleaseSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem('autoReleaseSettings', JSON.stringify(updated));
}

/**
 * Calculate confirmation deadlines based on scheduled visit date
 * Uses configurable timing from settings
 */
export function calculateConfirmationDeadlines(
  visitDate: string | Date, 
  settings?: AutoReleaseSettings
): ConfirmationDeadlines {
  const config = settings || getAutoReleaseSettings();
  const visit = new Date(visitDate);
  
  // Confirmation deadline is configurable hours before the visit
  const confirmationDeadline = subHours(visit, config.confirmationHoursBeforeVisit);
  
  // Auto-release triggers configurable hours before the visit if not confirmed
  const autoreleaseAt = subHours(visit, config.releaseHoursBeforeVisit);
  
  return {
    confirmation_deadline: confirmationDeadline.toISOString(),
    autorelease_at: autoreleaseAt.toISOString(),
    confirmation_status: 'pending',
  };
}

/**
 * Calculate deadlines for date range visits (DM/GFA activities)
 * Uses the start date (dateFrom) as the effective date for deadline calculations
 */
export function calculateDateRangeDeadlines(
  dateFrom: string | Date,
  dateTo: string | Date,
  settings?: AutoReleaseSettings
): DateRangeDeadlines {
  const config = settings || getAutoReleaseSettings();
  const visitStart = new Date(dateFrom);
  const visitEnd = new Date(dateTo);
  
  // For date range visits, use the start date for deadline calculations
  const baseDeadlines = calculateConfirmationDeadlines(dateFrom, config);
  
  return {
    ...baseDeadlines,
    visitDateFrom: visitStart.toISOString(),
    visitDateTo: visitEnd.toISOString(),
    effectiveVisitDate: visitStart.toISOString(),
  };
}

/**
 * Get reminder times for a confirmation deadline
 * Returns timestamps for: 2 days before, 1 day before, 12 hours before
 */
export function getReminderTimes(confirmationDeadline: string | Date): {
  twoDaysBefore: Date;
  oneDayBefore: Date;
  twelveHoursBefore: Date;
} {
  const deadline = new Date(confirmationDeadline);
  
  return {
    twoDaysBefore: subDays(deadline, 2),
    oneDayBefore: subDays(deadline, 1),
    twelveHoursBefore: subHours(deadline, 12),
  };
}

/**
 * Check if confirmation deadline has passed
 */
export function isDeadlinePassed(confirmationDeadline: string | Date): boolean {
  return isAfter(new Date(), new Date(confirmationDeadline));
}

/**
 * Check if auto-release should trigger
 */
export function shouldAutoRelease(
  autoreleaseAt: string | Date,
  confirmationStatus: string
): boolean {
  if (confirmationStatus === 'confirmed') return false;
  return isAfter(new Date(), new Date(autoreleaseAt));
}

/**
 * Get human-readable time remaining until deadline
 */
export function getTimeRemaining(deadline: string | Date): string {
  const deadlineDate = new Date(deadline);
  if (isAfter(new Date(), deadlineDate)) {
    return 'Expired';
  }
  return formatDistanceToNow(deadlineDate, { addSuffix: true });
}

/**
 * Get urgency level based on time remaining
 */
export function getDeadlineUrgency(deadline: string | Date): 'normal' | 'warning' | 'critical' | 'expired' {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  
  if (isAfter(now, deadlineDate)) {
    return 'expired';
  }
  
  const hoursRemaining = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursRemaining <= 12) {
    return 'critical';
  }
  if (hoursRemaining <= 24) {
    return 'warning';
  }
  return 'normal';
}
