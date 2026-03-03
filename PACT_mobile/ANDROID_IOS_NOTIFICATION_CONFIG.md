# 🔧 Android & iOS Configuration for Push Notifications

## Overview

For the enhanced notification system to work properly (especially for background calls and messages), you need to configure your Android and iOS projects.

---

## 🤖 Android Configuration

### 1. Update AndroidManifest.xml

**File:** `android/app/src/main/AndroidManifest.xml`

Add these permissions inside the `<manifest>` tag (before `<application>`):

```xml
<!-- Push Notifications -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Phone Calls & Audio -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<!-- Network -->
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
<uses-permission android:name="android.permission.INTERNET" />

<!-- Background Execution -->
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

Complete example:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    package="com.example.pact_mobile">

    <!-- Push Notifications -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- Phone Calls & Audio -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

    <!-- Network -->
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- Background Execution -->
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:requestLegacyExternalStorage="true">
        
        <!-- Firebase Messaging Service (auto-included by firebase_messaging plugin) -->
        <service
            android:name="com.google.firebase.messaging.FirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

        <!-- Main Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Deep linking for notifications -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="pact" />
            </intent-filter>
        </activity>

        <!-- Don't delete the meta-data below. This is required by the Flutter framework. -->
        <meta-data
            android:name="flutterEmbedding"
            android:value="2" />

        <!-- Firebase Configuration -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="pact_calls" />
    </application>
</manifest>
```

### 2. Check build.gradle

**File:** `android/app/build.gradle`

Ensure minimum SDK is 21 or higher:

```gradle
android {
    compileSdkVersion 34  // Or higher

    defaultConfig {
        minSdkVersion 21   // Critical for modern features
        targetSdkVersion 34 // Or higher
    }
}
```

### 3. Enable Battery Optimization Bypass (Optional)

For calls to ring loudly even when battery saver is on, users may need to disable battery optimization. You can provide a settings button:

```dart
// In settings screen
ElevatedButton(
  onPressed: () async {
    final intent = Intent(AndroidIntent(
      action: 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      data: 'package:com.example.pact_mobile',
    ));
    await intent.launch();
  },
  child: Text('Exclude from Battery Optimization'),
)
```

### 4. Test on Android

After configuration:

1. **Build and install:**
   ```bash
   flutter clean
   flutter pub get
   flutter build apk --debug
   # Or use: flutter run
   ```

2. **Grant permissions:**
   - Settings → Apps → Pact Mobile → Permissions → Notifications → Allow

3. **Disable battery optimization:**
   - Settings → Battery → Battery Optimization → Pact Mobile → Don't optimize

4. **Lock screen test:**
   - Close app
   - Lock device
   - Send test notification via Firebase Console
   - Verify: Notification appears on lock screen with sound

---

## 🍎 iOS Configuration

### 1. Update Info.plist

**File:** `ios/Runner/Info.plist`

Add these keys inside the `<dict>` section:

```xml
<!-- Background Modes -->
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
    <string>voip</string>
    <string>fetch</string>
</array>

<!-- Local Network Usage (Required for WebRTC) -->
<key>NSLocalNetworkUsageDescription</key>
<string>Required for peer-to-peer calling and real-time communication</string>

<key>NSBonjourServices</key>
<array>
    <string>_pact._udp</string>
</array>

<!-- Microphone Usage (Required for calls) -->
<key>NSMicrophoneUsageDescription</key>
<string>Required to make and receive calls</string>

<!-- Camera Usage (Required for video calls) -->
<key>NSCameraUsageDescription</key>
<string>Required to make video calls</string>
```

Complete example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>$(DEVELOPMENT_LANGUAGE)</string>
	
	<key>CFBundleDisplayName</key>
	<string>Pact Mobile</string>
	
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	
	<key>CFBundleName</key>
	<string>pact_mobile</string>
	
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	
	<key>CFBundleShortVersionString</key>
	<string>$(FLUTTER_BUILD_NAME)</string>
	
	<key>CFBundleSignature</key>
	<string>????</string>
	
	<key>CFBundleVersion</key>
	<string>$(FLUTTER_BUILD_NUMBER)</string>
	
	<key>LSRequiresIPhoneOS</key>
	<true/>
	
	<!-- Background Modes -->
	<key>UIBackgroundModes</key>
	<array>
		<string>remote-notification</string>
		<string>voip</string>
		<string>fetch</string>
	</array>
	
	<!-- Local Network Usage -->
	<key>NSLocalNetworkUsageDescription</key>
	<string>Required for peer-to-peer calling and real-time communication</string>
	
	<key>NSBonjourServices</key>
	<array>
		<string>_pact._udp</string>
	</array>
	
	<!-- Microphone Usage -->
	<key>NSMicrophoneUsageDescription</key>
	<string>Required to make and receive calls</string>
	
	<!-- Camera Usage -->
	<key>NSCameraUsageDescription</key>
	<string>Required to make video calls</string>
	
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	
	<key>UIMainStoryboardFile</key>
	<string>Main</string>
	
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>arm64</string>
	</array>
	
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	
	<key>UISupportedInterfaceOrientationsIPad</key>
	<array>
		<string>UIInterfaceOrientationPortraitUpsideDown</string>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	
	<key>CADisableMinimumFrameDurationOnPhone</key>
	<true/>
	
	<key>UIApplicationSupportsIndirectInputEvents</key>
	<true/>
</dict>
</plist>
```

### 2. Enable Capabilities in Xcode

1. Open Xcode: `open ios/Runner.xcworkspace`
2. Select "Runner" project
3. Select "Runner" target
4. Go to **Signing & Capabilities** tab
5. Click **+ Capability** and add:
   - ✅ **Push Notifications**
   - ✅ **Background Modes**
     - ✓ Remote notifications
     - ✓ VoIP
     - ✓ Background fetch

### 3. Configure Podfile

**File:** `ios/Podfile`

Ensure minimum deployment target is 11.0 or higher:

```ruby
post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)
    target.build_configurations.each do |config|
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= [
        '$(inherited)',
        'PERMISSION_MICROPHONE=1',
        'PERMISSION_CAMERA=1',
      ]
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '11.0'
    end
  end
end
```

### 4. Update Production Code Signing

For TestFlight/App Store distribution:

1. In Xcode: Select "Runner" project → "Runner" target
2. Signing & Capabilities → Team → Select your team
3. Provisioning Profile → Automatic or select manually
4. Ensure profile includes "Push Notifications" capability

### 5. Test on iOS

After configuration:

1. **Build and run:**
   ```bash
   flutter clean
   cd ios
   pod install
   cd ..
   flutter run
   ```

2. **Grant permissions when prompted**

3. **Lock screen test:**
   - Close app
   - Lock device
   - Send test notification via Firebase Console
   - Verify: Notification appears with sound

---

## 🔐 Certificate Setup for Push Notifications

### iOS Certificates

1. **Apple Developer Account:**
   - Go to [developer.apple.com](https://developer.apple.com)
   - Sign in with your developer account

2. **Create Push Notification Certificate:**
   - Certificates, Identifiers & Profiles → Certificates
   - Click "+"
   - Select "Apple Push Notification service SSL (Sandbox & Production)"
   - Select your App ID → Continue
   - Upload CSR (or create one in Keychain Access)
   - Download certificate

3. **Upload to Firebase:**
   - Firebase Console → Project Settings → Cloud Messaging → iOS
   - Upload APNs certificates (both development and production)

### Android Service Account

1. **Firebase Service Account:**
   - Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Firebase will automatically use this for FCM

---

## ✅ Verification Checklist

### Android

- [ ] AndroidManifest.xml has all required permissions
- [ ] POST_NOTIFICATIONS permission added
- [ ] RECORD_AUDIO permission added
- [ ] Firebase Messaging Service configured
- [ ] Minimum SDK is 21 or higher
- [ ] Build and install apk without errors
- [ ] App requests notification permission at runtime
- [ ] Notification appears when app is closed

### iOS

- [ ] Info.plist has Background Modes
- [ ] Capabilities: Push Notifications enabled
- [ ] Capabilities: Background Modes with remote-notification
- [ ] Deployment Target is 11.0 or higher
- [ ] APNs certificate uploaded to Firebase
- [ ] Build and run without errors
- [ ] App requests notification permission at runtime
- [ ] Notification appears when app is closed

### Both Platforms

- [ ] Firebase project configured
- [ ] google-services.json (Android) up to date
- [ ] Audio files in `assets/sounds/`
- [ ] pubspec.yaml has all dependencies
- [ ] `flutter pub get` completes successfully
- [ ] No compilation errors
- [ ] Test notification routes to correct screen

---

## 🐛 Common Issues & Solutions

### Android: Notification Not Showing

**Problem:** Notification doesn't appear even with sound enabled

**Solutions:**
1. Check notification permission is granted:
   - Settings → Apps → Pact Mobile → Permissions → Notifications
2. Disable Do Not Disturb mode
3. Check notification priority (should be Max)
4. Verify Android version is 5.0+

### iOS: Background Notification Not Received

**Problem:** Notification only works when app is in foreground

**Solutions:**
1. Check APNs certificate is valid
2. Verify device is registered for remote notifications:
   ```swift
   if #available(iOS 10.0, *) {
     UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
   }
   ```
3. Check background modes are enabled in Xcode
4. Restart device after enabling background modes

### FCM Token Not Generated

**Problem:** FCM token is nil or empty

**Solutions:**
1. Check internet connection
2. Verify Firebase project configuration
3. Check google-services.json (Android) is in correct location
4. Verify GoogleService-Info.plist (iOS) is in Xcode project
5. Try: `FirebaseMessaging.instance.deleteToken()` then request new one

### Ringtone Not Playing

**Problem:** Notification shows but no sound

**Solutions:**
1. Verify audio files exist in `assets/sounds/`
2. Check device audio is not muted
3. Check app has audio permission
4. Verify ringtone is enabled in app settings
5. Check `pubspec.yaml` has `audioplayers: ^6.1.0`

---

## 📚 Additional Resources

- [Firebase Cloud Messaging Overview](https://firebase.google.com/docs/cloud-messaging)
- [Flutter notifications guide](https://flutter.dev/docs/development/data-and-backend/firebase/messaging)
- [Apple Push Notification Setup](https://developer.apple.com/notification-service/)
- [Android Background Execution Limits](https://developer.android.com/about/versions/12/behavior-changes-12)

---

Last Updated: March 1, 2026
