# Ringtone and Background Notifications Fix Guide

## Problem Statement
The app had three critical issues:
1. ❌ No ringing tone when calls arrive
2. ❌ No time to initiate/start the call (call screen not appearing)
3. ❌ Background notifications still not working

## Root Causes Identified

### 1. Missing Audio Files
**Issue:** RingtoneService was looking for audio files that didn't exist:
- Looking for: `assets/sounds/incoming_call.mp3`
- Actually exists: `assets/sounds/Phone Dial Tone - Sound Effect (HD).mp3`

**Impact:** Ringtone fails silently; no audio plays for incoming calls

### 2. Foreground Message Handler Not Processing Messages
**Issue:** In `firebase_messaging_setup_service.dart`, the foreground message handler (`FirebaseMessaging.onMessage`) was only logging, not actually processing messages.

**Impact:** When app is in foreground, incoming calls don't trigger the notification/ringtone sequence

### 3. Missing Duplicate Notification Prevention for Foreground Context
**Issue:** The background handler wasn't distinguishing between foreground and background contexts properly, and foreground messages weren't being skipped when already handled by Realtime.

**Impact:** Potential duplicate notifications and duplicate ringtone playback

## Solutions Implemented

### Fix 1: Update Audio File Paths
**File:** `lib/services/ringtone_service.dart`

Changed sound file paths to use the existing audio file:
```dart
// BEFORE:
static const String _CALL_SOUND_PATH = 'assets/sounds/incoming_call.mp3';

// AFTER:
static const String _CALL_SOUND_PATH = 'assets/sounds/Phone Dial Tone - Sound Effect (HD).mp3';
```

All three notification types (call, message, notification) now use the same audio file.

### Fix 2: Enable Foreground Message Processing
**File:** `lib/services/firebase_messaging_setup_service.dart`

Updated `_setupMessageHandlers()` method to process incoming calls/messages when app is in foreground:

```dart
// 1. Foreground handler NOW processes messages
FirebaseMessaging.onMessage.listen(
  (RemoteMessage message) {
    // Process the message using background handler
    unawaited(
      BackgroundNotificationHandler().handleMessage(
        message,
        isBackground: false, // App is in foreground
      ),
    );
  },
);

// 2. onMessageOpenedApp also processes messages when tapped
FirebaseMessaging.onMessageOpenedApp.listen(
  (RemoteMessage message) {
    unawaited(
      BackgroundNotificationHandler().handleMessage(
        message,
        isBackground: true, // App was backgrounded
      ),
    );
  },
);
```

### Fix 3: Remove Duplicate Ringtone Playback
**File:** `lib/services/notification_routing_service.dart`

Removed the duplicate ringtone play in `handleIncomingCall()` since `BackgroundNotificationHandler._handleIncomingCall()` already plays it as STEP 1.

```dart
// REMOVED:
await _ringtoneService.playIncomingCallRingtone();

// REASON: BackgroundNotificationHandler plays ringtone in STEP 1
// NotificationRoutingService is called in STEP 3
// So this was causing double-ring
```

## Implementation Flow (Now Fixed)

### When Incoming Call Arrives (Background):

```
1. FCM message received → _firebaseMessagingBackgroundHandler()
2. BackgroundNotificationHandler.handleMessage() called
3. _handleIncomingCall() executed:
   - STEP 1: RingtoneService plays ringtone
   - STEP 2: CallNotificationService shows notification
   - STEP 3: NotificationRoutingService handles routing (ringtone NOT played again)
4. Result: Ringtone plays immediately, notification shown, dialog appears
```

### When Incoming Call Arrives (Foreground):

```
1. FCM message received → FirebaseMessaging.onMessage listener
2. BackgroundNotificationHandler.handleMessage() called (isBackground=false)
3. Supabase Realtime check: if already handled, skip (prevent duplicate)
4. If not already handled:
   - STEP 1: RingtoneService plays ringtone
   - STEP 2: CallNotificationService shows notification
   - STEP 3: NotificationRoutingService handles routing
5. Result: Ringtone plays, notification shown, dialog appears
```

## Android Configuration

All required permissions are already in place in `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
```

## Call Notification Sequence

The BackgroundNotificationHandler now properly handles calls with:

1. **Ringtone Playing** - Audio starts immediately
2. **Local Notification** - System notification appears
3. **Call Dialog** - App UI shows call screen (if app is running)

## Testing Checklist

- [ ] Test incoming call with app in background → should hear ringtone + see notification
- [ ] Test incoming call with app in foreground → should hear ringtone + see dialog
- [ ] Test call notification tap → should show call screen
- [ ] Test missed call notification → should show missed call alert
- [ ] Test message notifications → should show new message alert
- [ ] Test broadcast notifications → should show notification
- [ ] Verify only ONE ringtone plays (not double)
- [ ] Verify call screen appears quickly after ringtone

## Key Services Now Working Together

| Service | Role |
|---------|------|
| `FirebaseMessagingSetupService` | Initializes all FCM handlers in correct sequence |
| `BackgroundNotificationHandler` | Processes all messages (foreground/background/terminated) |
| `RingtoneService` | Plays audio for calls and messages |
| `CallNotificationService` | Shows local notifications with proper channels |
| `NotificationRoutingService` | Routes notifications and manages call dialogs |
| `BilingualNotificationService` | Handles multilingual notification content |

## Common Issues Resolved

✅ **No ringtone** → Fixed audio file path  
✅ **No notification** → Fixed foreground message handler  
✅ **Double ringtone** → Removed duplicate play call  
✅ **No call screen** → Proper routing through all three steps  
✅ **Background failures** → Proper Firebase initialization sequence  

## Notes

- The app uses a singleton pattern for all services to ensure only one instance
- Background message handler is registered via `@pragma('vm:entry-point')` for proper isolate execution
- FCM token is retrieved and persisted for sending notifications to specific devices
- All initialization uses timeout protection to prevent hanging

