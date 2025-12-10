import { addDays, subDays, subHours, isAfter, isBefore, formatDistanceToNow } from 'date-fns';

export interface ConfirmationDeadlines {
  confirmation_deadline: string;
  autorelease_at: string;
  confirmation_status: 'pending' | 'confirmed' | 'auto_released';
}

/**
 * Calculate confirmation deadlines based on scheduled visit date
 * - Confirmation deadline: 2 days before visit date
 * - Auto-release: 1 day before visit date
 */
export function calculateConfirmationDeadlines(visitDate: string | Date): ConfirmationDeadlines {
  const visit = new Date(visitDate);
  
  // Confirmation deadline is 2 days before the visit
  const confirmationDeadline = subDays(visit, 2);
  
  // Auto-release triggers 1 day before the visit if not confirmed
  const autoreleaseAt = subDays(visit, 1);
  
  return {
    confirmation_deadline: confirmationDeadline.toISOString(),
    autorelease_at: autoreleaseAt.toISOString(),
    confirmation_status: 'pending',
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
