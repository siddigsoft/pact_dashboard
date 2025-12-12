/**
 * PACT Notification System - Unified Exports
 * 
 * This module exports all notification components for both web and mobile platforms.
 * 
 * Usage:
 * 
 * For Web:
 * import { WebNotificationView, NotificationList, NotificationPopup } from '@/components/notifications';
 * 
 * For Mobile (Capacitor):
 * import { MobileNotificationView } from '@/components/notifications';
 * 
 * Shared Components:
 * import { NotificationBubble, NotificationListItem, UnreadBadge } from '@/components/notifications';
 */

// Legacy export (for backwards compatibility)
export { NotificationBar } from './NotificationBar';

// Shared Components
export { NotificationBubble, PriorityIndicator, ReadIndicator, UnreadBadge } from './shared/NotificationBubble';
export { NotificationListItem, NotificationEmptyState } from './shared/NotificationListItem';

// Web Components
export { NotificationPopup } from './web/NotificationPopup';
export { NotificationList } from './web/NotificationList';
export { WebNotificationView } from './web/WebNotificationView';

// Mobile Components
export { MobileNotificationView } from './mobile/MobileNotificationView';

// Re-export types and theme
export type { NotificationData, NotificationType, NotificationPriority, NotificationTheme } from '@/theme/notifications-theme';
export { lightTheme, darkTheme, getTheme, getPlatform, getPriorityColor, getTypeIcon } from '@/theme/notifications-theme';

// Re-export hooks
export { useNotificationSound } from '@/hooks/notifications/useNotificationSound';
export { useNotificationAnimation } from '@/hooks/notifications/useNotificationAnimation';

// Re-export utilities
export { formatTimestamp, formatNotificationTime, formatPopupTime, getDirectionClass } from '@/utils/notifications/formatTimestamp';
