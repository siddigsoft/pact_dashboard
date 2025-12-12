/**
 * PACT Command Center - Unified Notification Theme System
 * 
 * WhatsApp/Telegram-style notification UI theme that works across
 * Web (React + Uber theme) and Mobile (Capacitor) platforms.
 * 
 * Features:
 * - Rounded chat bubbles
 * - Smooth slide-in animations
 * - Soft shadows
 * - Light and dark mode support
 * - Minimalist, clean, modern design
 */

export interface NotificationTheme {
  colors: {
    // Bubble colors
    bubbleBackground: string;
    bubbleBackgroundOwn: string;
    bubbleText: string;
    bubbleTextOwn: string;
    bubbleBorder: string;
    
    // Status colors
    unreadIndicator: string;
    readIndicator: string;
    timestampText: string;
    
    // Priority colors
    priorityHigh: string;
    priorityMedium: string;
    priorityLow: string;
    
    // Overlay
    overlayBackground: string;
    popupBackground: string;
    popupBorder: string;
  };
  
  spacing: {
    bubblePadding: string;
    bubbleMargin: string;
    listGap: string;
    iconSize: string;
    avatarSize: string;
  };
  
  typography: {
    titleSize: string;
    bodySize: string;
    timestampSize: string;
    titleWeight: string;
    bodyWeight: string;
  };
  
  radii: {
    bubble: string;
    bubbleTail: string;
    popup: string;
    avatar: string;
  };
  
  shadows: {
    bubble: string;
    popup: string;
    elevated: string;
  };
  
  animations: {
    slideInDuration: string;
    slideOutDuration: string;
    fadeInDuration: string;
    easing: string;
  };
}

// Light theme (WhatsApp-inspired)
export const lightTheme: NotificationTheme = {
  colors: {
    bubbleBackground: 'hsl(var(--card))',
    bubbleBackgroundOwn: 'hsl(142 70% 95%)', // Light green tint
    bubbleText: 'hsl(var(--foreground))',
    bubbleTextOwn: 'hsl(var(--foreground))',
    bubbleBorder: 'hsl(var(--border))',
    
    unreadIndicator: 'hsl(142 76% 36%)', // WhatsApp green
    readIndicator: 'hsl(var(--muted-foreground))',
    timestampText: 'hsl(var(--muted-foreground))',
    
    priorityHigh: 'hsl(var(--destructive))',
    priorityMedium: 'hsl(38 92% 50%)', // Amber
    priorityLow: 'hsl(var(--muted-foreground))',
    
    overlayBackground: 'hsla(0, 0%, 0%, 0.4)',
    popupBackground: 'hsl(var(--background))',
    popupBorder: 'hsl(var(--border))',
  },
  
  spacing: {
    bubblePadding: '0.75rem 1rem',
    bubbleMargin: '0.25rem',
    listGap: '0.5rem',
    iconSize: '1.25rem',
    avatarSize: '2.5rem',
  },
  
  typography: {
    titleSize: '0.875rem',
    bodySize: '0.875rem',
    timestampSize: '0.75rem',
    titleWeight: '600',
    bodyWeight: '400',
  },
  
  radii: {
    bubble: '1rem',
    bubbleTail: '0.25rem',
    popup: '1rem',
    avatar: '50%',
  },
  
  shadows: {
    bubble: '0 1px 2px hsla(0, 0%, 0%, 0.08)',
    popup: '0 4px 24px hsla(0, 0%, 0%, 0.12)',
    elevated: '0 8px 32px hsla(0, 0%, 0%, 0.16)',
  },
  
  animations: {
    slideInDuration: '300ms',
    slideOutDuration: '200ms',
    fadeInDuration: '150ms',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// Dark theme (Telegram-inspired)
export const darkTheme: NotificationTheme = {
  colors: {
    bubbleBackground: 'hsl(var(--card))',
    bubbleBackgroundOwn: 'hsl(210 80% 25%)', // Telegram blue tint
    bubbleText: 'hsl(var(--foreground))',
    bubbleTextOwn: 'hsl(0 0% 98%)',
    bubbleBorder: 'hsl(var(--border))',
    
    unreadIndicator: 'hsl(210 100% 56%)', // Telegram blue
    readIndicator: 'hsl(var(--muted-foreground))',
    timestampText: 'hsl(var(--muted-foreground))',
    
    priorityHigh: 'hsl(var(--destructive))',
    priorityMedium: 'hsl(38 92% 50%)',
    priorityLow: 'hsl(var(--muted-foreground))',
    
    overlayBackground: 'hsla(0, 0%, 0%, 0.6)',
    popupBackground: 'hsl(var(--background))',
    popupBorder: 'hsl(var(--border))',
  },
  
  spacing: lightTheme.spacing,
  typography: lightTheme.typography,
  radii: lightTheme.radii,
  
  shadows: {
    bubble: '0 1px 3px hsla(0, 0%, 0%, 0.2)',
    popup: '0 4px 24px hsla(0, 0%, 0%, 0.3)',
    elevated: '0 8px 32px hsla(0, 0%, 0%, 0.4)',
  },
  
  animations: lightTheme.animations,
};

// CSS variable names for dynamic theming
export const cssVarNames = {
  bubbleBackground: '--notification-bubble-bg',
  bubbleBackgroundOwn: '--notification-bubble-own-bg',
  bubbleText: '--notification-bubble-text',
  bubbleTextOwn: '--notification-bubble-own-text',
  bubbleBorder: '--notification-bubble-border',
  unreadIndicator: '--notification-unread',
  readIndicator: '--notification-read',
  timestampText: '--notification-timestamp',
  priorityHigh: '--notification-priority-high',
  priorityMedium: '--notification-priority-medium',
  priorityLow: '--notification-priority-low',
  overlayBackground: '--notification-overlay-bg',
  popupBackground: '--notification-popup-bg',
  popupBorder: '--notification-popup-border',
  bubbleShadow: '--notification-bubble-shadow',
  popupShadow: '--notification-popup-shadow',
  animationDuration: '--notification-animation-duration',
  animationEasing: '--notification-animation-easing',
} as const;

// Animation keyframes
export const animations = {
  slideInFromTop: `
    @keyframes notification-slide-in-top {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `,
  slideInFromBottom: `
    @keyframes notification-slide-in-bottom {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `,
  slideOutToTop: `
    @keyframes notification-slide-out-top {
      from {
        transform: translateY(0);
        opacity: 1;
      }
      to {
        transform: translateY(-100%);
        opacity: 0;
      }
    }
  `,
  slideOutToBottom: `
    @keyframes notification-slide-out-bottom {
      from {
        transform: translateY(0);
        opacity: 1;
      }
      to {
        transform: translateY(100%);
        opacity: 0;
      }
    }
  `,
  fadeIn: `
    @keyframes notification-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `,
  pulse: `
    @keyframes notification-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
  `,
};

// Helper to get animation class names
export const animationClasses = {
  slideInTop: 'animate-notification-slide-in-top',
  slideInBottom: 'animate-notification-slide-in-bottom',
  slideOutTop: 'animate-notification-slide-out-top',
  slideOutBottom: 'animate-notification-slide-out-bottom',
  fadeIn: 'animate-notification-fade-in',
  pulse: 'animate-notification-pulse',
};

// Notification types for consistent categorization
export type NotificationType = 
  | 'message'
  | 'alert'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'system'
  | 'task'
  | 'approval'
  | 'mention';

export type NotificationPriority = 'high' | 'medium' | 'low';

// Notification data structure
export interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  timestamp: Date;
  isRead: boolean;
  avatarUrl?: string;
  avatarInitials?: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

// Platform detection
export const getPlatform = (): 'web' | 'mobile' | 'capacitor' => {
  if (typeof window !== 'undefined') {
    // Check for Capacitor
    if ((window as any).Capacitor?.isNative) {
      return 'capacitor';
    }
    // Check for mobile viewport
    if (window.innerWidth <= 768) {
      return 'mobile';
    }
  }
  return 'web';
};

// Theme getter based on current mode
export const getTheme = (isDark: boolean): NotificationTheme => {
  return isDark ? darkTheme : lightTheme;
};

// Priority color helper
export const getPriorityColor = (priority: NotificationPriority, theme: NotificationTheme): string => {
  switch (priority) {
    case 'high':
      return theme.colors.priorityHigh;
    case 'medium':
      return theme.colors.priorityMedium;
    case 'low':
    default:
      return theme.colors.priorityLow;
  }
};

// Type icon mapping
export const getTypeIcon = (type: NotificationType): string => {
  const iconMap: Record<NotificationType, string> = {
    message: 'MessageSquare',
    alert: 'AlertTriangle',
    success: 'CheckCircle',
    warning: 'AlertCircle',
    error: 'XCircle',
    info: 'Info',
    system: 'Settings',
    task: 'ClipboardList',
    approval: 'ThumbsUp',
    mention: 'AtSign',
  };
  return iconMap[type];
};
