# 🔔 PACT Mobile - Complete Notification & Call Fix Guide

**Date:** March 22, 2026  
**Issue:** No notifications when app is in background, calls not reaching mobile, no missed call notifications  
**Solution:** Comprehensive system overhaul with proper Firebase configuration

---

## ⚠️ Critical Issues Fixed

### 1. **Missing Android Permissions** ✅
- Added `WAKE_LOCK` permission (critical for background)
- Added `INTERNET` and `ACCESS_NETWORK_STATE` permissions
- Added `FOREGROUND_SERVICE_PHONE_CALL` configuration

### 2. **Firebase Messaging Initialization** ✅
- Created `FirebaseMessagingSetupService` for comprehensive FCM setup
- Proper Firebase Core initialization before FCM operations
- Request notification permissions (Android 13+, iOS 13+)
- Get and persist FCM token
- Setup all message handlers (foreground, background, terminated)

### 3. **Notification Services** ✅
- `CallNotificationService` → Shows local notifications for calls
- `BackgroundNotificationHandler` → Routes FCM messages
- `NotificationRoutingService` → Routes notifications to correct screen
- `FirebaseMessagingSetupService` → Initializes FCM properly
- `NotificationDiagnosticsService` → Debug why notifications don't work

---

## 📋 Implementation Checklist

### ✅ Android Configuration (`android/app/src/main/AndroidManifest.xml`)

```xml
<!-- Added Permissions -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- These should already exist -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />

<!-- Default FCM channel in application tag -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="calls" />
```

Status: ✅ DONE

---

### ✅ iOS Configuration (`ios/Runner/Info.plist`)

These settings should already exist:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
    <string>voip</string>
    <string>remote-notification</string>
    <string>fetch</string>
    <string>processing</string>
</array>
```

Status: ✅ VERIFIED

---

### ✅ Firebase Key Setup

**Location:** `lib/services/firebase_messaging_setup_service.dart`

This new service handles:
- Firebase Core initialization
- FCM token retrieval and persistence
- Notification permission requests
- Message handler setup (foreground/background/terminated)
- Token refresh listening

**Used in:** `lib/main.dart` after other initializations

Status: ✅ CREATED

---

### ✅ Main App Initialization (`lib/main.dart`)

Updated to:
1. Import `FirebaseMessagingSetupService`
2. Register background message handler
3. Initialize `FirebaseMessagingSetupService` (before showing UI)

```dart
// In main()
if (!kIsWeb) {
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    
    final fcmSetup = FirebaseMessagingSetupService();
    await fcmSetup.initialize();
}
```

Status: ✅ DONE

---

### ✅ Notification Diagnostics (`lib/services/notification_diagnostics_service.dart`)

New service to debug notification issues:

```dart
// Run diagnostics
final diag = NotificationDiagnosticsService();
final report = await diag.runFullDiagnostics();
print(report);

// Quick check
final canReceive = await diag.canReceiveNotifications();
```

Checks:
- Firebase initialization status
- APNS token (iOS)
- Notification permissions
- FCM token availability
- Token in Supabase database
- Device settings

Status: ✅ CREATED

---

## 🚀 How to Test Notifications

### Step 1: Rebuild and Run App

```bash
flutter clean
flutter pub get
flutter run
```

### Step 2: Check Logs During Startup

Look for these messages:

```
[FCM Setup] ========== FIREBASE MESSAGING INITIALIZATION START ==========
[FCM Setup] Firebase.initializeApp() SUCCESS
[FCM Setup] ✅ FCM Token retrieved (152 chars)
[FCM Setup] Token (first 40 chars): AAAAAxxxxxx...
[FCM Setup] ========== FIREBASE MESSAGING INITIALIZED SUCCESSFULLY ==========
[FCM Setup] Ready to receive notifications in all app states
```

### Step 3: Run Diagnostics

Add this to your app temporarily (e.g., in a debug screen):

```dart
final diag = NotificationDiagnosticsService();
print(await diag.runFullDiagnostics());
```

### Step 4: Test Incoming Call Notification

1. **From another device/browser**, make a call to the device
2. **With app in foreground** → Should see full-screen dialog + notification
3. **With app in background** → Should see system notification + ring sound
4. **With app killed** → Should see system notification + ring sound (if call made quickly)

### Step 5: Verify FCM Message Format

Check Edge Function output to ensure calls are sent with:

```json
{
  "type": "incoming_call",
  "call_id": "call_123",
  "channel_name": "channel_xyz",
  "caller_id": "user_456",
  "caller_name": "John Doe",
  "caller_avatar": "https://...",
  "is_audio_only": "false"
}
```

---

## 🔍 Troubleshooting

### **Issue: "No FCM Token retrieved"**

**Causes:**
1. Firebase not initialized
2. GoogleServices not configured
3. Permissions denied (Android 13+)

**Solutions:**
```dart
// Check if Firebase is configured
final diag = NotificationDiagnosticsService();
final canReceive = await diag.canReceiveNotifications();

// Force token refresh
final fcmSetup = FirebaseMessagingSetupService();
final token = await fcmSetup.forceTokenRefresh();
```

---

### **Issue: "Notifications received but no sound/vibration"**

**Causes:**
1. Device in Do Not Disturb mode
2. Notification channel not created
3. Sound not configured in notification

**Solutions:**

**Android:**
- Settings → Notifications → PACT → Sound & Vibration enabled
- Check Android notification channel:

```dart
// In CallNotificationService:
// Notification channel is created in initialize()
// Channel ID: 'incoming_calls'
// Importance: Max
// Sound: Default
```

**iOS:**
- Settings → Notifications → PACT → Sound enabled
- App is not in Low Power Mode

---

### **Issue: "Token in database but no notifications received"**

**Causes:**
1. Backend not sending to correct FCM endpoint
2. Firebase service account not configured on backend
3. Network blocked by proxy/firewall

**Solutions:**

1. **Verify backend Edge Function:**
   ```bash
   # Check logs:
   supabase functions list
   supabase functions download send-call-invite
   ```

2. **Test manually with Firebase Admin SDK:**
   ```javascript
   // Example: Node.js test
   const admin = require('firebase-admin');
   
   const message = {
     token: 'DEVICE_FCM_TOKEN',
     data: {
       type: 'incoming_call',
       call_id: 'test_call_123',
       channel_name: 'test_channel',
       caller_id: 'test_caller',
       caller_name: 'Test Caller'
     },
     android: {
       priority: 'high',
       ttl: 30000
     }
   };
   
   admin.messaging().send(message);
   ```

3. **Check Firebase Console:**
   - Go to Firebase Console → Cloud Messaging → Logs
   - Look for delivery failures
   - Check if tokens are invalid

---

### **Issue: "Calls reach app but no notification shown"**

**Causes:**
1. `CallNotificationService` not initialized
2. Notification channel not created (Android)
3. Permissions denied

**Solutions:**

```dart
// Ensure CallNotificationService is initialized:
final callNotifService = CallNotificationService();
await callNotifService.initialize(); // Call in BackgroundNotificationHandler
```

Verify in Android manifest:
```xml
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="calls" />
```

---

### **Issue: "Missed call notifications not showing"**

**Causes:**
1. Backend not sending `type: missed_call` messages
2. `_handleMissedCall()` not being called
3. `BilingualNotificationService.showMissedCallNotification()` failing

**Solutions:**

1. Check backend is sending missed call messages:
   ```json
   {
     "type": "missed_call",
     "caller_name": "John Doe",
     "call_id": "call_123",
     "notification_type": "missed_call"
   }
   ```

2. Add logging to verify:
   ```dart
   // In BackgroundNotificationHandler._handleMissedCall()
   debuglog('CALL', 'Missed call notification attempt for: $callerName');
   ```

---

## 📱 Step-by-Step Implementation

### For Android Developers

1. **Update AndroidManifest.xml** with new permissions
2. **Check build.gradle** Firebase dependencies:
   ```gradle
   com.google.firebase:firebase-messaging: ^16.1.1
   ```
3. **Test on Android 13+ device** with notification permission
4. **Disable battery optimization** for PACT app

### For iOS Developers

1. **Verify iOS deployment target:** 11.0 or higher
2. **Check Xcode build settings:**
   - Background Modes enabled
   - Push Notifications capability added
3. **Test on physical device** (simulator limited for VOIP)
4. **Check iOS notification settings** in device

---

## 🎯 Expected Behavior After Fix

### Incoming Call - App in Foreground
```
1. Message received via FCM
2. Type detected as "incoming_call"
3. RingtoneService plays call ringtone
4. Full-screen CallDialog appears
5. BilingualNotificationService shows notification
6. User sees callerbanner at top
```

### Incoming Call - App in Background
```
1. Message received via FCM (background isolate)
2. BackgroundNotificationHandler processes
3. CallNotificationService shows system notification
4. Device rings (if audio enabled)
5. Device vibrates
6. User can tap notification → app opens with call screen
```

### Incoming Call - App Terminated/Killed
```
1. Message received by system
2. FCM shows system notification
3. Device rings + vibrates (if enabled)
4. Notification persists in notification tray
5. User taps → App opens and shows call screen
6. Or user can answer from notification (if system supports)
```

### Missed Call
```
1. Backend sends missed_call message
2. BackgroundNotificationHandler detects type
3. BilingualNotificationService shows notification
4. Notification title: "Missed Call"
5. Body: "Caller Name called"
```

---

## 📊 Diagnostic Checklist

Before reporting notification issues, complete this checklist:

```
Firebase & FCM:
☐ Firebase initialized successfully in logs
☐ FCM token retrieved (not empty)
☐ Token appears in logs during startup
☐ Token in Supabase profiles.fcm_tokens
☐ No permission errors in logs

Permissions:
☐ Android: Settings → PACT → Permissions → Notifications = ON
☐ iOS: Settings → Notifications → PACT → Allow Notifications = ON
☐ Battery optimization not blocking app
☐ WiFi or mobile data connected

Device:
☐ Do Not Disturb mode OFF
☐ Low Power Mode OFF (iOS)
☐ Device volume not muted
☐ System notification sounds enabled

Message Format:
☐ Backend sends with type: "incoming_call"
☐ Backend includes: call_id, channel_name, caller_id, caller_name
☐ Backend includes: is_audio_only (true/false)
☐ FCM token is current (matches database)

App:
☐ App built in release mode (if testing)
☐ All services initialized in main.dart
☐ No errors in startup logs
```

---

## 📞 Quick Test Script

Add this to test diagnostics:

```dart
// In a debug screen or on app startup
import 'services/notification_diagnostics_service.dart';
import 'services/firebase_messaging_setup_service.dart';

// Test function
Future<void> debugNotifications() async {
  // 1. Run diagnostics
  final diag = NotificationDiagnosticsService();
  print(await diag.runFullDiagnostics());
  
  // 2. Check if can receive
  final canReceive = await diag.canReceiveNotifications();
  print('Can Receive Notifications: $canReceive');
  
  // 3. Force token refresh
  final fcmSetup = FirebaseMessagingSetupService();
  final newToken = await fcmSetup.forceTokenRefresh();
  print('New Token: $newToken?.substring(0, 20)}...');
}
```

Call this in your app (e.g., from a debug/settings screen) to see full diagnostics.

---

## 🛠️ For Backend/DevOps

### Firebase Setup Verification

1. **Firebase Project Configuration:**
   - Go to Firebase Console
   - Select your project
   - Verify Android app is configured
   - Verify iOS app is configured
   - Download `GoogleServices-Info.plist` (iOS)
   - Download `google-services.json` (Android)

2. **FCM Service Account:**
   - Create service account with Firebase Messaging permissions
   - Store as `FIREBASE_SERVICE_ACCOUNT_JSON` env variable
   - Used by Supabase Edge Function for sending notifications

3. **Test Edge Function:**
   ```bash
   # Deploy function
   supabase functions deploy send-call-invite
   
   # Test with curl
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-call-invite \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "callee_user_id": "USER_ID",
       "channel_name": "test-channel",
       "call_id": "call-test-123",
       "caller_id": "caller-123",
       "caller_name": "Test Caller",
       "is_audio_only": true
     }'
   ```

4. **Monitor FCM Delivery:**
   - Firebase Console → Cloud Messaging → Logs
   - Check for delivery failures
   - Verify tokens are valid

---

## ✅ Next Steps

1. **Rebuild and run** the app with these fixes
2. **Check startup logs** for Firebase initialization messages
3. **Run diagnostics** from a debug screen
4. **Test incoming call** from another device
5. **Verify notification** appears in foreground and background
6. **Check Supabase** to confirm token is saved
7. **Monitor Firebase Console** for message delivery

---

## 📞 Support Information

If notifications still don't work after this fix:

1. **Collect diagnostics:**
   ```dart
   final diag = NotificationDiagnosticsService();
   print(await diag.runFullDiagnostics());
   ```

2. **Check logs:**
   - Look for `[FCM Setup]` messages
   - Look for `ERROR` or `❌` messages
   - Note exact error messages

3. **Verify device:**
   - Android 8.0+ or iOS 11.0+
   - FCM token present in database
   - Permissions granted to app
   - Internet connection active

4. **Test Edge Function:**
   - Verify `send-call-invite` function works
   - Check for token in Firebase Console

---

**Last Updated:** March 22, 2026  
**Version:** 2.0 - Complete Notification System Fix
