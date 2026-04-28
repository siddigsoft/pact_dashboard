# ✅ NOTIFICATION IMPLEMENTATION - QUICK REFERENCE CHECKLIST

## 📋 Files Modified/Created

### ✅ Android Configuration
- **File:** `android/app/src/main/AndroidManifest.xml`
- **Changes:** Added `WAKE_LOCK`, `INTERNET`, `ACCESS_NETWORK_STATE` permissions
- **Status:** ✅ DONE

### ✅ Firebase Services  
- **File:** `lib/services/firebase_messaging_setup_service.dart` (NEW)
- **Purpose:** Comprehensive FCM initialization and setup
- **Features:**
  - Firebase Core initialization
  - FCM token retrieval & persistence
  - Permission requests
  - Message handler setup (all app states)
  - Token refresh listening
- **Status:** ✅ CREATED

### ✅ Notification Diagnostics
- **File:** `lib/services/notification_diagnostics_service.dart` (NEW)
- **Purpose:** Debug and diagnose notification issues
- **Features:**
  - Check Firebase/FCM status
  - Check notification permissions
  - Check FCM token status
  - Verify token in database
  - Device information
  - Recommendations for fixing issues
- **Status:** ✅ CREATED

### ✅ Main App Initialize
- **File:** `lib/main.dart`
- **Changes:** 
  - Added import for `FirebaseMessagingSetupService`
  - Register FCM background message handler
  - Initialize `FirebaseMessagingSetupService` before showing UI
- **Status:** ✅ DONE

---

## 🚀 How Notifications Work Now

### **App in Foreground (User has app open)**
```
1. Call made → Backend sends FCM message
2. FCM arrives at device (onMessage listener)
3. BackgroundNotificationHandler.handleMessage() called
4. Type detected: "incoming_call"
5. RingtoneService.playRingtone() starts
6. BilingualNotificationService shows banner notification
7. Full-screen CallDialog appears
8. BilingualNotificationService.showIncomingCallNotification()
9. User sees call screen with Answer/Decline buttons
```

### **App in Background (User has app backgrounded)**
```
1. Call made → Backend sends FCM message
2. FCM arrives at device (onMessageOpenedApp or background handler)
3. BackgroundNotificationHandler processes in isolate
4. CallNotificationService shows system notification
5. Device rings + vibrates (if enabled)
6. User taps notification
7. App opens and shows call screen
8. User can accept or decline call
```

### **App Terminated/Killed**
```
1. Call made → Backend sends FCM message
2. System shows notification in notification tray
3. Device rings + vibrates (if enabled)
4. User taps notification
5. App launches and BackgroundNotificationHandler processes message
6. App shows call screen
7. User can accept or decline call
```

### **Missed Call**
```
1. Call made but user doesn't answer
2. Backend sends type: "missed_call" message
3. BackgroundNotificationHandler detects type
4. BilingualNotificationService shows missed call notification
5. Notification appears in app or as banner
6. User can tap to see missed call details
```

---

## 🧪 Testing Steps

### Test 1: Verify FCM Token Retrieved
**Expected:** See FCM setup messages in logs during startup

```
✅ FCM Token retrieved (152 chars)
✅ Token (first 40 chars): AAAAAxxxxxx...
✅ FIREBASE MESSAGING INITIALIZED SUCCESSFULLY
```

**If not showing:**
1. Check Firebase is configured (google-services.json / GoogleServices-Info.plist)
2. Check Android/iOS build files are updated
3. Check internet connection on device

---

### Test 2: Verify Token in Database
**Expected:** FCM token saved in Supabase `profiles.fcm_tokens`

```dart
// Query database:
SELECT id, fcm_tokens, fcm_token FROM profiles 
WHERE id = '{user_id}';
```

**If token not in database:**
1. User must login first
2. User must grant notification permissions
3. Token persists after relaunch

---

### Test 3: Incoming Call Notification (App Open)
**Steps:**
1. Open app on test device
2. From another phone, make call to test user
3. Expected: Full-screen call dialog + notification

**If not working:**
1. Check logs for `[BackgroundHandler] Incoming call detected`
2. Run diagnostics: `NotificationDiagnosticsService`
3. Verify backend is sending correct message type

---

### Test 4: Incoming Call Notification (App Background)
**Steps:**
1. Open app and minimize to background
2. From another phone, make call to test user
3. Expected: System notification + ring sound + vibration

**If not working:**
1. Check Android/iOS notification permissions
2. Check "Do Not Disturb" mode is off
3. Check device volume not muted
4. Check battery optimization not blocking app

---

### Test 5: Incoming Call Notification (App Killed)
**Steps:**
1. Close app completely (swipe from recent apps or force stop)
2. From another phone, make call to test user (within 30 seconds)
3. Expected: System notification + ring sound + vibration

**If not working:**
1. Make call quickly after killing app
2. Check Firebase is receiving message
3. Check device has internet connection

---

## 🔧 Configuration Verification

### Android (`android/app/src/main/AndroidManifest.xml`)

```xml
<!-- Required permissions present -->
✓ <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
✓ <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
✓ <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
✓ <uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
✓ <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
✓ <uses-permission android:name="android.permission.WAKE_LOCK" />  <!-- NEW -->
✓ <uses-permission android:name="android.permission.INTERNET" />  <!-- NEW -->

<!-- Default FCM channel in application tag -->
✓ <meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="calls" />
```

### iOS (`ios/Runner/Info.plist`)

```xml
<!-- Background modes required for notifications -->
✓ <key>UIBackgroundModes</key>
  <array>
    <string>audio</string>
    <string>voip</string>
    <string>remote-notification</string>
    <string>fetch</string>
    <string>processing</string>
  </array>
```

### Firebase Configuration
- **Android:** `android/app/google-services.json` (must be present)
- **iOS:** `ios/Runner/GoogleServices-Info.plist` (must be present)

---

## 🎯 Backend Requirements

### Firebase Service Account
Must be configured for backend to send notifications:
1. Go to Firebase Console
2. Project Settings → Service Accounts
3. Create new private key
4. Save JSON as `FIREBASE_SERVICE_ACCOUNT_JSON` env variable

### Edge Function (`supabase/functions/send-call-invite/index.ts`)
Must send messages with correct format:

```typescript
const dataPayload = {
  type: "incoming_call",           // ← CRITICAL
  call_id: callId,                 // ← CRITICAL
  channel_name: channelName,       // ← CRITICAL
  caller_id: callerId,             // ← CRITICAL
  caller_name: callerName,         // ← CRITICAL
  caller_avatar: callerAvatar,
  is_audio_only: isAudioOnly,      // ← Important
};
```

### Message to FCM
Must be data-only message (no notification block):
- Android: Ensures delivery to background handler
- iOS: Handles via APNS with proper priority

---

## 📞 Troubleshooting Quick Reference

| Issue | Cause | Solution |
|-------|-------|----------|
| No FCM Token | Firebase not initialized | Check google-services.json / GoogleServices-Info.plist |
| Token but no notifications | Permissions denied | Settings → PACT → Permissions → Notifications ON |
| No sound/vibration | Device settings | Settings → Notifications → Sound/Vibration enabled |
| No background notifications | App killed/background | Check Android battery optimization, iOS Low Power Mode |
| Missed calls not showing | Backend not sending type | Verify backend sends `type: missed_call` |
| Token not in database | Login or permissions issue | User must login and grant notification permission |
| FCM Console shows failures | Invalid token | Token may be expired; force refresh via app |

---

## 🧠 Key Memory Points

### What Changed
1. ✅ Added `WAKE_LOCK` permission (Android)
2. ✅ Created `FirebaseMessagingSetupService` for proper FCM init
3. ✅ Created `NotificationDiagnosticsService` for debugging
4. ✅ Updated `main.dart` to use new services

### Why It Matters
- **FCM Token:** Needed for backend to send messages to device
- **Permissions:** Device won't show notifications if denied
- **Message Format:** Must have `type: incoming_call` to be recognized
- **Background Handler:** Must process messages when app is backgrounded

### Critical Services
1. **FirebaseMessagingSetupService** → Initializes FCM
2. **BackgroundNotificationHandler** → Routes messages
3. **CallNotificationService** → Shows local notifications
4. **NotificationDiagnosticsService** → Debugs issues

---

## 📊 Success Indicators

After implementation, you should see:

```
✅ Firebase started: [FCM Setup] Firebase.initializeApp() SUCCESS
✅ Token retrieved: [FCM Setup] ✅ FCM Token retrieved (152 chars)
✅ Permissions requested: [FCM Setup] Permission request result: authorized
✅ Handlers setup: [FCM Setup] Message handlers SETUP COMPLETE
✅ Token persisted: [FCM Setup] Token (first 40 chars): AAAAAxxxxxx...
✅ Initialization complete: [FCM Setup] ========== INITIALIZED SUCCESSFULLY ==========
```

Calls received:
```
✅ Incoming call message: [BackgroundHandler] Incoming call detected
✅ Notification shown: [CallNotificationService] Showing incoming call notification
✅ Ringtone playing: [RingtoneService] Playing ringtone...
✅ Dialog shown: Full-screen call dialog appears
```

---

## 🔄 Rebuild & Deploy

```bash
# Clean build
flutter clean

# Get dependencies
flutter pub get

# Build for Android
flutter build apk --release

# Build for iOS
flutter build ios --release

# Or run for testing
flutter run --release
```

---

## 📝 Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `lib/services/firebase_messaging_setup_service.dart` | FCM initialization | ✅ NEW |
| `lib/services/notification_diagnostics_service.dart` | Debug notifications | ✅ NEW |
| `lib/services/background_notification_handler.dart` | Route messages | ✅ EXISTING |
| `lib/services/call_notification_service.dart` | Show notifications | ✅ EXISTING |
| `lib/main.dart` | App entry point | ✅ UPDATED |
| `android/app/src/main/AndroidManifest.xml` | Android config | ✅ UPDATED |
| `supabase/functions/send-call-invite/index.ts` | Backend function | ✅ VERIFY |

---

**Status:** ✅ IMPLEMENTATION COMPLETE

**Last Updated:** March 22, 2026

**Next Step:** Rebuild and run app, check logs for success indicators
