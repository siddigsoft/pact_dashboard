# 🚀 QUICK START - REBUILD & TEST NOTIFICATIONS

## ⏱️ Quick Steps (5-10 minutes)

### Step 1: Clean & Rebuild (3-5 minutes)

```bash
# Navigate to project
cd c:\Users\PC\PACT_mobile

# Clean everything
flutter clean

# Get dependencies
flutter pub get

# Build for testing
flutter run --release
```

⏳ **Wait for app to start**

---

### Step 2: Check Logs (1 minute)

When app starts, look in console for:

```
✅ [FCM Setup] Firebase.initializeApp() SUCCESS
✅ [FCM Setup] ✅ FCM Token retrieved (152 chars)
✅ [FCM Setup] Permission request result: authorized
✅ [FCM Setup] ========== FIREBASE MESSAGING INITIALIZED SUCCESSFULLY ==========
```

**If you see these:** ✅ Setup is working!  
**If you DON'T see these:** ❌ Check errors above

---

### Step 3: Test Foreground Notification (2 minutes)

1. **Keep app OPEN on test device**
2. **From another phone, make a call** to the test user
3. **Expected:** 
   - Full-screen call dialog appears
   - Notification banner shows
   - Ringtone plays
   - Device vibrates

**Result:**
- ✅ **Works** → continue to Step 4
- ❌ **Doesn't work** → Run diagnostics

---

### Step 4: Test Background Notification (2 minutes)

1. **Open app and minimize it** (don't close)
2. **From another phone, make a call** to test user
3. **Expected:**
   - System notification appears (in notification tray)
   - Device rings
   - Device vibrates
   - Can tap notification to open app

**Result:**
- ✅ **Works** → continue to Step 5
- ❌ **Doesn't work** → Run diagnostics

---

### Step 5: Test After Killing App (2 minutes)

1. **Close app completely** (swipe from recent apps or force-stop)
2. **Immediately make a call** from another phone (within 30 seconds)
3. **Expected:**
   - System notification appears
   - Device rings
   - Device vibrates
   - Tap notification → App opens to call screen

**Result:**
- ✅ **Works** → All notifications working!
- ❌ **Doesn't work** → Check device settings

---

## 🧪 Run Diagnostics (if any test fails)

Add this code to test diagnostics:

### Option A: In main.dart temporarily

```dart
// Add to main() after initialization
if (!kIsWeb) {
  Future.delayed(Duration(seconds: 2), () async {
    final diag = NotificationDiagnosticsService();
    debugPrint(await diag.runFullDiagnostics());
  }).ignore();
}
```

### Option B: Add to a debug screen

```dart
// In any screen/widget
import 'services/notification_diagnostics_service.dart';

// In build or onPressed:
final diag = NotificationDiagnosticsService();
print(await diag.runFullDiagnostics());
```

### What Diagnostics Shows

```
📱 PLATFORM INFO
─ Web: false
─ Android: true
─ iOS: false

🔥 FIREBASE & FCM STATUS
─ Firebase: ✅ Initialized
─ APNS Token: N/A (Android)

🔔 NOTIFICATION PERMISSIONS
─ Notification Permission: ✅ GRANTED
─ AndroidManifest Configuration: ✅ OK

🎫 FCM TOKEN STATUS
─ Current Token: ✅ Available
─ Token Length: 152 characters
─ Status: ✅ READY FOR NOTIFICATIONS

💡 RECOMMENDATIONS
If notifications are not working:
1. CHECK PERMISSIONS
2. CHECK INTERNET CONNECTION
3. CHECK DEVICE SETTINGS
... etc
```

---

## 📱 Device Settings to Verify

### Android

```
Settings
  └─ Apps
    └─ PACT Mobile
      └─ Permissions
        └─ Notifications: ✅ ALLOWED

Settings
  └─ Notifications
    └─ PACT Mobile
      └─ All notifications: ✅ ON
      └─ Sound: ✅ ON (not silent)
      └─ Vibration: ✅ ON
      └─ Full screen: ✅ ON
```

### iOS

```
Settings
  └─ Notifications
    └─ PACT Mobile
      └─ Allow Notifications: ✅ ON
      └─ Lock Screen: ✅ ON
      └─ Notification Center: ✅ ON
      └─ Sounds: ✅ ON
      └─ Badges: ✅ ON
      └─ Low Power Mode: ✅ OFF
```

### Both Platforms

```
General Settings
  └─ Do Not Disturb: ✅ OFF
  └─ Volume: ✅ Not muted
  └─ WiFi/Mobile Data: ✅ Connected
```

---

## ❌ Quick Troubleshooting

### Problem: "No FCM token retrieved"

**Check:**
1. Is Firebase configured?
   ```bash
   # Android: Does google-services.json exist?
   ls android/app/google-services.json
   
   # iOS: Does GoogleServices-Info.plist exist?
   ls ios/Runner/GoogleServices-Info.plist
   ```

2. Rebuild with Firebase files
   ```bash
   flutter clean
   flutter pub get
   flutter run --release
   ```

---

### Problem: "Permission denied for notifications"

**Android:**
1. Settings → Apps → PACT → Permissions → Notifications
2. Make sure it says "Allowed"

**iOS:**
1. Settings → Notifications → PACT Mobile
2. Allow Notifications = ON

**Both:**
- Try uninstalling and reinstalling app

---

### Problem: "No sound/vibration"

**Check Device Settings:**
- Volume not muted (check physical buttons)
- Do Not Disturb is OFF
- App notification sound is enabled
- Device not in Low Power Mode (iOS)

**Check App:**
- Run diagnostics
- Look for permission errors in logs

---

### Problem: "Token but no notifications"

**Check Backend:**
1. Verify Edge Function is deployed
   ```bash
   supabase functions list
   ```

2. Check message format
   ```bash
   # Should include:
   # type: "incoming_call"
   # call_id: "..."
   # channel_name: "..."
   # caller_id: "..."
   # caller_name: "..."
   ```

3. Monitor Firebase Console
   - Check delivery status
   - Look for token failures

---

## 🎯 Success Indicators

### ✅ Everything is Working

```
√ Startup logs show Firebase initialized
√ FCM token retrieved in logs
√ Foreground call shows full-screen dialog
√ Background call shows system notification
√ Killed app still receives notification
√ Device rings and vibrates
√ Missed calls show notification
√ No errors in console
```

### ❌ Something is Wrong

If you see any of these:
- ❌ No FCM token logged
- ❌ Notification permission error
- ❌ Firebase not initialized
- ❌ No notifications in any scenario
- ❌ Notifications but no sound
- ❌ Token not in database

→ **Run Diagnostics** and check recommendations

---

## 📞 Key FCM Setup Messages

### Expected on Startup

```
[FCM Setup] ========== FIREBASE MESSAGING INITIALIZATION START ==========
[FCM Setup] Firebase.initializeApp() SUCCESS
[FCM Setup] CallNotificationService initialized
[FCM Setup] BackgroundNotificationHandler initialized
[FCM Setup] Requesting notification permissions...
[FCM Setup] Permission request result: authorized
[FCM Setup] Setting up message handlers...
[FCM Setup] Message handlers SETUP COMPLETE
[FCM Setup] ✅ FCM Token retrieved (152 chars)
[FCM Setup] Token (first 40 chars): AAAAAxxxxx...
[FCM Setup] Message handlers setup complete
[FCM Setup] ========== FIREBASE MESSAGING INITIALIZED SUCCESSFULLY ==========
[FCM Setup] Ready to receive notifications in all app states
```

### If an Error

```
[FCM Setup] ⚠️ Firebase initialization note: Already initialized
[FCM Setup] Firebase already initialized or skipped
[FCM Setup] ⚠️ Permission request timeout
[FCM Setup] ⚠️ Error getting FCM token: ...
```

These are usually OK, but make sure final message says "INITIALIZED SUCCESSFULLY"

---

## 🏗️ Build Commands Reference

```bash
# Rebuild everything
flutter clean
flutter pub get
flutter run --release

# Rebuild APK (Android)
flutter build apk --release

# Rebuild iOS
flutter build ios --release

# Just run
flutter run

# Run in debug mode (has more logs)
flutter run
```

---

## 📊 Expected Results by Scenario

### Foreground (App Open)
```
Call made
  ↓
[BackgroundHandler] Foreground message: Incoming Call
[BackgroundHandler] Resolved type: "incoming_call"
[BackgroundHandler] _handleIncomingCall ENTER
[CallNotificationService] Showing incoming call notification
[RingtoneService] Playing ringtone...
  ↓
✅ Full-screen dialog appears
✅ Notification shows
✅ Ringtone plays
✅ Can Answer/Decline
```

### Background (App Minimized)
```
Call made
  ↓
[BackgroundHandler] Background notification tapped
[BackgroundNotificationHandler] Incoming call received
  ↓
✅ System notification shows
✅ Device rings
✅ Device vibrates
✅ Tap notification → App opens
```

### Killed (App Closed)
```
Call made
  ↓
[System] FCM message received
[System] Show notification
  ↓
✅ Notification in tray
✅ Device rings
✅ Device vibrates
✅ Tap → App opens to call screen
```

---

## ✨ Final Checklist

Before deploying, verify:

```
√ flutter clean done
√ flutter pub get done
√ app builds successfully
√ Startup logs show FCM initialized
√ FCM token retrieved
√ Foreground test: ✅ works
√ Background test: ✅ works
√ Killed app test: ✅ works
√ Device settings all correct
√ Diagnostics show no warnings
√ No errors in console for 30 seconds
```

When all checked → **Ready to Deploy!**

---

## 📞 Support

If anything doesn't work:

1. **Run diagnostics**
   ```dart
   final diag = NotificationDiagnosticsService();
   print(await diag.runFullDiagnostics());
   ```

2. **Check logs** for `[FCM Setup]` messages

3. **Read full guide:** `NOTIFICATION_FIX_COMPLETE_GUIDE.md`

4. **Check device settings** match expectedvalues

5. **Verify backend** is sending correct message format

---

**Estimated Time:** 5-10 minutes  
**Complexity:** Simple  
**Risk:** None (all changes are additions, no deletions)

👍 **Ready? Let's go!**
