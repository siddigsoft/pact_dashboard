/**
 * Notification Timestamp Formatting Utility
 * Locale-aware relative/absolute formatting with RTL support
 */

import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek, isThisYear } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';

export type TimestampFormat = 'relative' | 'absolute' | 'smart';

interface FormatOptions {
  format?: TimestampFormat;
  locale?: 'en' | 'ar';
  includeTime?: boolean;
  shortFormat?: boolean;
}

/**
 * Get the date-fns locale object
 */
const getLocale = (locale: 'en' | 'ar' = 'en') => {
  return locale === 'ar' ? ar : enUS;
};

/**
 * Format a timestamp in relative format (e.g., "2 minutes ago")
 */
export const formatRelative = (date: Date, locale: 'en' | 'ar' = 'en'): string => {
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: getLocale(locale),
  });
};

/**
 * Format a timestamp in absolute format
 */
export const formatAbsolute = (
  date: Date,
  locale: 'en' | 'ar' = 'en',
  includeTime = true,
  shortFormat = false
): string => {
  const localeObj = getLocale(locale);
  
  if (shortFormat) {
    if (includeTime) {
      return format(date, 'MMM d, HH:mm', { locale: localeObj });
    }
    return format(date, 'MMM d', { locale: localeObj });
  }
  
  if (includeTime) {
    return format(date, 'MMMM d, yyyy \'at\' HH:mm', { locale: localeObj });
  }
  return format(date, 'MMMM d, yyyy', { locale: localeObj });
};

/**
 * Smart format that adapts based on how old the timestamp is
 * - Today: "2:30 PM"
 * - Yesterday: "Yesterday"
 * - This week: "Monday"
 * - This year: "Dec 15"
 * - Older: "Dec 15, 2023"
 */
export const formatSmart = (
  date: Date,
  locale: 'en' | 'ar' = 'en',
  includeTime = false
): string => {
  const localeObj = getLocale(locale);
  
  if (isToday(date)) {
    return format(date, 'HH:mm', { locale: localeObj });
  }
  
  if (isYesterday(date)) {
    const yesterday = locale === 'ar' ? 'أمس' : 'Yesterday';
    if (includeTime) {
      return `${yesterday} ${format(date, 'HH:mm', { locale: localeObj })}`;
    }
    return yesterday;
  }
  
  if (isThisWeek(date)) {
    if (includeTime) {
      return format(date, 'EEEE HH:mm', { locale: localeObj });
    }
    return format(date, 'EEEE', { locale: localeObj });
  }
  
  if (isThisYear(date)) {
    if (includeTime) {
      return format(date, 'MMM d, HH:mm', { locale: localeObj });
    }
    return format(date, 'MMM d', { locale: localeObj });
  }
  
  if (includeTime) {
    return format(date, 'MMM d, yyyy HH:mm', { locale: localeObj });
  }
  return format(date, 'MMM d, yyyy', { locale: localeObj });
};

/**
 * Main formatting function with options
 */
export const formatTimestamp = (
  date: Date | string | number,
  options: FormatOptions = {}
): string => {
  const {
    format: formatType = 'smart',
    locale = 'en',
    includeTime = false,
    shortFormat = false,
  } = options;
  
  // Ensure we have a Date object
  const dateObj = date instanceof Date ? date : new Date(date);
  
  // Handle invalid dates
  if (isNaN(dateObj.getTime())) {
    return locale === 'ar' ? 'تاريخ غير صالح' : 'Invalid date';
  }
  
  switch (formatType) {
    case 'relative':
      return formatRelative(dateObj, locale);
    case 'absolute':
      return formatAbsolute(dateObj, locale, includeTime, shortFormat);
    case 'smart':
    default:
      return formatSmart(dateObj, locale, includeTime);
  }
};

/**
 * Format timestamp for notification list (short format)
 */
export const formatNotificationTime = (
  date: Date | string | number,
  locale: 'en' | 'ar' = 'en'
): string => {
  return formatTimestamp(date, { format: 'smart', locale, includeTime: false });
};

/**
 * Format timestamp for notification popup (relative format)
 */
export const formatPopupTime = (
  date: Date | string | number,
  locale: 'en' | 'ar' = 'en'
): string => {
  return formatTimestamp(date, { format: 'relative', locale });
};

/**
 * Get direction class based on locale
 */
export const getDirectionClass = (locale: 'en' | 'ar' = 'en'): string => {
  return locale === 'ar' ? 'rtl' : 'ltr';
};

export default formatTimestamp;
