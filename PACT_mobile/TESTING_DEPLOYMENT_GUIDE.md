# 🚀 Testing & Deployment Guide - Notification Improvements

## 📋 Pre-Deployment Checklist

✅ **Code Changes Completed:**
- [x] Added bilingual notification strings (English/Arabic)
- [x] Implemented `showSiteDispatchedNotification()` method
- [x] Added `sendSiteDispatchedNotification()` to NotificationTriggerService
- [x] Created notification sound directories
- [x] Configured Android notification channel with sound
- [x] Configured iOS notification with sound

⏳ **Pending - Manual Actions:**
- [ ] Add notification sound file to Android (`android/app/src/main/res/raw/notification_sound.mp3`)
- [ ] Add notification sound file to iOS (`ios/Runner/notification_sound.aiff`)
- [ ] Rebuild APK
- [ ] Test on Android device
- [ ] Test on iOS device

---

## 📱 Building APK with Notification Changes

### Step 1: Add Sound Files

Before building, add notification sounds to your project:

**Android:**
```bash
# Place your MP3 or WAV file at:
# android/app/src/main/res/raw/notification_sound.mp3
```

**iOS:**
```bash
# Place your AIFF or CAF file at:
# ios/Runner/notification_sound.aiff
# Then add to Xcode if building from Xcode
```

### Step 2: Clean Build Environment

```powershell
# Remove previous build artifacts
flutter clean
flutter pub get
```

### Step 3: Build Release APK

```powershell
flutter build apk --release
```

**Expected Output:**
```
✓ Building release APK...
✓ Built build/app/outputs/flutter-apk/app-release.apk
✓ Exit code: 0
```

**Build should take 3-5 minutes**

### Step 4: Verify Build Success

```powershell
# Check if APK was created
Test-Path "build/app/outputs/flutter-apk/app-release.apk"
# Should return: True

# Get APK details
Get-Item "build/app/outputs/flutter-apk/app-release.apk" | Select-Object Name, Length
```

---

## 📲 Testing on Android Device

### Installation

```powershell
# Connect Android device via USB
# Enable Developer Mode and USB Debugging on device

# Install APK
adb install -r build/app/outputs/flutter-apk/app-release.apk

# Verify installation
adb shell pm list packages | Select-String "pact_mobile"
# Should output: com.example.pact_mobile
```

### Test 1: Volume Buttons SOS Trigger

**Steps:**
1. Open PACT app
2. Press volume down 3 times quickly
3. Observe: SOS button triggers (red pulsing animation)
4. Check: Notification appears with "Sending SOS..."

**Expected Result:** ✅ SOS triggers and shows feedback

### Test 2: Pulse Animation

**Steps:**
1. Look at SOS button in bottom-right corner
2. Observe: Red halo pulsing animation
3. Button continuously scales: 1.0 → 1.15 scale
4. Watch for 10 seconds

**Expected Result:** ✅ Smooth pulse animation visible, not jerky

### Test 3: Single-Tap Trigger (UX Test)

**Steps:**
1. Tap SOS button once (not hold)
2. Observe: Immediately triggers (no long-press needed)
3. Button shows: "Sending SOS..." with spinner
4. Check: Location sharing notice in tooltip

**Expected Result:** ✅ Single tap triggers immediately

### Test 4: Site Dispatch Notification

**Steps:**
1. From admin panel, send "New Site Dispatched" event
2. Watch device notification center
3. Check notification appears with:
   - ✅ Loud notification sound
   - ✅ Custom vibration pattern (buzz-pause-buzz)
   - ✅ Bilingual title (EN | AR)
   - ✅ Site code and location visible
   - ✅ Budget information shown
4. Tap notification: Should navigate to site details

**Device Settings Check Before Test:**
```powershell
# Verify notification volume is NOT muted
adb shell "dumpsys audio | grep streamVolume"

# Verify notification channel is enabled
adb shell "dumpsys notification | grep PACT"
```

**Expected Result:** ✅ Notification plays sound + vibration + bilingual text

### Test 5: Arabic Text Rendering

**Steps:**
1. Trigger site dispatch notification
2. Expand notification in notification center
3. Observe: Arabic text displayed right-to-left
4. Check: No garbled characters
5. Verify: Title format is "EN Title | AR Title"

**Expected Result:** ✅ Arabic text renders correctly and is readable

### Test 6: Button Position Persistence

**Steps:**
1. Drag SOS button to new position (hold and drag)
2. Close and reopen app
3. Observe: SOS button stays in same position
4. Drag to different position again
5. Restart app again

**Expected Result:** ✅ Position persists across app restarts

---

## 🍎 Testing on iOS Device

### Installation

```bash
# Using Flutter
flutter run --release

# Or build and install via Xcode
flutter build ios --release
# Then open ios/Runner.xcworkspace and deploy to device
```

### Test 1: Notification Sound on iOS

**Steps:**
1. Trigger site dispatch notification
2. Device volume should be up (not muted)
3. Listen for notification sound
4. Observe: Should hear 2-5 second tone

**Device Settings:**
```bash
# Check mute switch is OFF (toggle on side of device)
# Settings → Notifications → PACT → Sounds: ON
```

**Expected Result:** ✅ Notification sound plays (not vibration only)

### Test 2: Critical Alert Level

**Steps:**
1. Put device in Focus Mode (Do Not Disturb)
2. Trigger site dispatch notification
3. Observe: Notification STILL appears (breaks through focus)
4. Listen: Sound STILL plays even with focus mode on

**Expected Result:** ✅ Notification shows despite Focus Mode (timeSensitive level)

### Test 3: Bilingual Display

**Steps:**
1. Trigger site dispatch notification
2. Look at notification banner or in Notification Center
3. Check: Title shows both English and Arabic
4. Arabic should be right-aligned
5. Observe: No layout issues or overlap

**Expected Result:** ✅ Bilingual text displays cleanly

---

## 🐛 Troubleshooting

### Issue: Notification sound not playing

**Causes:**
1. Device in Silent mode
2. Volume is muted
3. Sound file not added to project
4. Notification category not created properly

**Fix:**
```powershell
# Check device volume
adb shell "settings get system volume_ring"
# Should be > 0

# Unmute
adb shell "am broadcast -a android.intent.action.MEDIA_BUTTON --ei keycode 24"

# Check notification channels
adb shell "dumpsys notification | grep PACT" | Select-String "sound"
```

### Issue: SOS button not pulsing smoothly

**Causes:**
1. AnimationController not initialized
2. Device GPU acceleration disabled
3. Low device performance during animation

**Fix:**
```dart
// In global_sos_overlay.dart, check animation is created:
late AnimationController _pulseController;

@override
void initState() {
  super.initState();
  _pulseController = AnimationController(
    duration: const Duration(milliseconds: 1500),
    vsync: this,
  )..repeat();
}
```

### Issue: Arabic text showing as squares/garbled

**Causes:**
1. Font doesn't support Arabic characters
2. Text direction not set correctly
3. BiDi markers not working

**Fix:**
- Check `pubspec.yaml` has Google Fonts included
- Verify `_biTitle()` and `_biBody()` use U+2066/U+2069 markers
- Reset device language settings

### Issue: App crashes on notification click

**Causes:**
1. Payload routing not implemented
2. Navigation not handling `site_dispatch:` payload
3. Site data not available

**Fix:**
Check `notification_service.dart` has payload handler:
```dart
// This should be in onNotificationTap
if (payload.startsWith('site_dispatch:')) {
  final siteCode = payload.replaceFirst('site_dispatch:', '');
  // Navigate to site details
}
```

---

## 📊 Verification Checklist

After deployment:

| Feature | Android | iOS | Status |
|---------|---------|-----|--------|
| Sound plays | [ ] Test | [ ] Test | ⏳ |
| Vibration pattern | [ ] Felt | [ ] N/A | ⏳ |
| Arabic text | [ ] Check | [ ] Check | ⏳ |
| Single-tap SOS | [ ] Works | [ ] Works | ⏳ |
| Pulse animation | [ ] Smooth | [ ] Smooth | ⏳ |
| Position persists | [ ] Yes | [ ] Yes | ⏳ |
| Notification routing | [ ] Works | [ ] Works | ⏳ |
| English text | [ ] Clear | [ ] Clear | ⏳ |

---

## 📈 Performance Metrics to Monitor

After deployment, monitor:

1. **App Startup Time**
   - Should still be < 3 seconds
   - NotificationService initializes in background (non-blocking)

2. **Notification Delivery**
   - Track in Supabase: how many successfully delivered
   - Compare success rate before/after

3. **User Engagement**
   - Track notification tap-through rate
   - Monitor site dispatch notification interaction

4. **Device Storage**
   - APK size: Should still be < 100 MB
   - Hive database growth: Monitor after prolonged use

---

## 🚀 Deployment Steps Summary

**Quick Reference:**
```powershell
# 1. Ensure sound files are in project
# 2. Clean build
flutter clean
flutter pub get

# 3. Build APK
flutter build apk --release

# 4. Install on device
adb install -r build/app/outputs/flutter-apk/app-release.apk

# 5. Run tests from checklist above
# 6. Monitor device logs
adb logcat -s "flutter" | Select-String "Notification|SOS|dispatch"

# 7. If all tests pass, ready for release!
```

---

## 📝 Notes

- Site dispatch notifications have **highest priority** (Importance.max on Android)
- Custom vibration pattern: [0ms, 500ms pause, 250ms buzz, 500ms pause]
- iOS notifications use `InterruptionLevel.timeSensitive` (breaks through Focus)
- Bilingual support integrated automatically - no user action needed
- Notification sound files can be customized (replace .mp3 or .aiff)

---

**Status**: Ready for Testing & Deployment
**Last Updated**: 2026-03-16
