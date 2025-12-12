# PACT Notification System - Capacitor Integration Guide

This guide explains how to integrate the WhatsApp/Telegram-style notification system with your Capacitor mobile app.

## Overview

The PACT notification system provides a unified notification experience across web and mobile platforms with:
- WhatsApp/Telegram-style chat bubble UI
- Slide-in animations (from top or bottom)
- Touch-friendly interactions with swipe-to-dismiss
- Sound and haptic feedback
- Light and dark mode support
- RTL support for Arabic

## Prerequisites

Ensure you have the following Capacitor plugins installed:

```bash
npm install @capacitor/haptics @capacitor/local-notifications @capacitor/push-notifications
npx cap sync
```

## File Structure

```
src/
├── theme/
│   └── notifications-theme.ts      # Shared theme tokens
├── styles/
│   └── notifications.css           # CSS animations and styles
├── hooks/
│   └── notifications/
│       ├── useNotificationSound.ts # Sound playback hook
│       └── useNotificationAnimation.ts # Animation management
├── utils/
│   └── notifications/
│       └── formatTimestamp.ts      # Timestamp formatting
└── components/
    └── notifications/
        ├── index.ts                # Unified exports
        ├── shared/
        │   ├── NotificationBubble.tsx
        │   └── NotificationListItem.tsx
        ├── web/
        │   ├── NotificationPopup.tsx
        │   ├── NotificationList.tsx
        │   └── WebNotificationView.tsx
        └── mobile/
            └── MobileNotificationView.tsx
```

## Usage

### Mobile App Integration

```tsx
import { MobileNotificationView } from '@/components/notifications';
import { NotificationData } from '@/theme/notifications-theme';

function MobileApp() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  const handleNotificationClick = (notification: NotificationData) => {
    // Navigate to relevant screen
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  };

  const handleMarkAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
  };

  return (
    <div className="app-header">
      <MobileNotificationView
        notifications={notifications}
        locale="en" // or "ar" for Arabic
        soundEnabled={true}
        hapticsEnabled={true}
        onNotificationClick={handleNotificationClick}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={() => setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))}
        onClearAll={() => setNotifications([])}
      />
    </div>
  );
}
```

### Web App Integration

```tsx
import { WebNotificationView } from '@/components/notifications';

function WebApp() {
  // Same props as mobile, but uses popover instead of bottom sheet
  return (
    <div className="app-header">
      <WebNotificationView
        notifications={notifications}
        popupPosition="top-right"
        soundEnabled={true}
        onNotificationClick={handleNotificationClick}
        onMarkAsRead={handleMarkAsRead}
      />
    </div>
  );
}
```

## Push Notifications Setup

### 1. Firebase Configuration

Add Firebase to your Android project:

```groovy
// android/app/build.gradle
dependencies {
    implementation platform('com.google.firebase:firebase-bom:32.0.0')
    implementation 'com.google.firebase:firebase-messaging'
}
```

### 2. FCM Token Registration

```tsx
import { PushNotifications } from '@capacitor/push-notifications';

async function setupPushNotifications() {
  const permission = await PushNotifications.requestPermissions();
  
  if (permission.receive === 'granted') {
    await PushNotifications.register();
    
    PushNotifications.addListener('registration', (token) => {
      // Send token to your backend
      console.log('FCM Token:', token.value);
    });
    
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // Handle foreground notification
      showInAppNotification({
        id: notification.id,
        title: notification.title || '',
        body: notification.body || '',
        type: 'message',
        priority: 'medium',
        timestamp: new Date(),
        isRead: false,
      });
    });
  }
}
```

### 3. Handling Push Actions

```tsx
PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
  // User tapped on notification
  const data = action.notification.data;
  if (data.actionUrl) {
    router.push(data.actionUrl);
  }
});
```

## Local Notifications

For offline notifications or scheduled reminders:

```tsx
import { LocalNotifications } from '@capacitor/local-notifications';

async function scheduleReminder(title: string, body: string, at: Date) {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: Date.now(),
        title,
        body,
        schedule: { at },
        sound: 'notification.mp3',
        extra: { type: 'reminder' }
      }
    ]
  });
}
```

## Customizing the Theme

Edit `src/theme/notifications-theme.ts` to customize colors:

```typescript
export const lightTheme: NotificationTheme = {
  colors: {
    bubbleBackground: 'hsl(var(--card))',
    bubbleBackgroundOwn: 'hsl(142 70% 95%)', // WhatsApp green
    unreadIndicator: 'hsl(142 76% 36%)',
    // ... customize other colors
  },
  // ... spacing, typography, animations
};
```

## Building the APK

1. Build the web assets:
```bash
npm run build
```

2. Copy to Android:
```bash
npx cap sync android
```

3. Build release APK:
```bash
cd android
./gradlew assembleRelease
```

The APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

## Troubleshooting

### Haptics not working
Ensure the Haptics plugin is properly linked:
```bash
npx cap sync
```

### Sound not playing
1. Add notification sound to `android/app/src/main/res/raw/notification.mp3`
2. Add to web at `public/sounds/notification.mp3`

### Animations choppy on older devices
Reduce animation duration in CSS:
```css
:root {
  --notification-animation-duration: 200ms;
}
```

## Platform Detection

The theme automatically detects the platform:

```typescript
import { getPlatform } from '@/theme/notifications-theme';

const platform = getPlatform();
// Returns: 'web' | 'mobile' | 'capacitor'
```

Use this to conditionally render components:

```tsx
function NotificationCenter() {
  const platform = getPlatform();
  
  if (platform === 'capacitor' || platform === 'mobile') {
    return <MobileNotificationView {...props} />;
  }
  
  return <WebNotificationView {...props} />;
}
```
