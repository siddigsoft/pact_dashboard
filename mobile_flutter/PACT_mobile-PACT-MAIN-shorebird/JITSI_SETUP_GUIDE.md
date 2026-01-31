# Jitsi Meet Integration Guide for PACT Mobile App

## Overview

This guide explains how to set up Jitsi Meet for reliable video/audio calls in the PACT Flutter mobile app. Jitsi provides free, open-source video conferencing that works reliably across different network conditions.

## Pricing

| Option | Cost | Best For |
|--------|------|----------|
| **meet.jit.si** (Default) | **FREE** | Testing, small teams |
| **Self-Hosted** | **FREE** (server costs only) | Privacy, custom branding |
| **JaaS (8x8)** | Free: 25,000 min/month | Enterprise, SLA support |

**Recommendation**: Start with the free `meet.jit.si` server. It's production-ready and handles thousands of calls daily.

---

## Step 1: Add Package to pubspec.yaml

Add the Jitsi Meet Flutter SDK:

```yaml
dependencies:
  # ... existing dependencies
  jitsi_meet_flutter_sdk: ^10.3.0
```

Then run:
```bash
flutter pub get
```

---

## Step 2: Android Configuration

### 2.1 Update android/app/build.gradle

```gradle
android {
    compileSdkVersion 34
    
    defaultConfig {
        minSdkVersion 24  // Jitsi requires minimum SDK 24
        targetSdkVersion 34
    }
    
    // Add this for Jitsi
    packagingOptions {
        pickFirst 'lib/*/libc++_shared.so'
    }
}
```

### 2.2 Update android/build.gradle

```gradle
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url "https://github.com/niceforyou/niceforyou-maven/raw/main" }
    }
}
```

### 2.3 Update AndroidManifest.xml

Add these permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest>
    <!-- Camera and microphone for calls -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    
    <!-- Network permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    
    <!-- Bluetooth for headsets -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    
    <application>
        <!-- ... -->
    </application>
</manifest>
```

### 2.4 Enable MultiDex (if needed)

In `android/app/build.gradle`:

```gradle
android {
    defaultConfig {
        multiDexEnabled true
    }
}

dependencies {
    implementation 'androidx.multidex:multidex:2.0.1'
}
```

---

## Step 3: iOS Configuration

### 3.1 Update ios/Podfile

```ruby
platform :ios, '15.1'  # Minimum iOS 15.1 for Jitsi

post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
    end
  end
end
```

### 3.2 Update Info.plist

Add to `ios/Runner/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>PACT needs camera access for video calls</string>

<key>NSMicrophoneUsageDescription</key>
<string>PACT needs microphone access for calls</string>

<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
    <string>voip</string>
</array>
```

### 3.3 Run Pod Install

```bash
cd ios
pod install --repo-update
cd ..
```

---

## Step 4: Using the Native Jitsi SDK

Replace the URL launcher approach with native SDK for better experience:

```dart
// lib/services/jitsi_native_service.dart

import 'package:jitsi_meet_flutter_sdk/jitsi_meet_flutter_sdk.dart';

class JitsiNativeService {
  final _jitsiMeet = JitsiMeet();
  
  Future<void> joinMeeting({
    required String roomName,
    required String displayName,
    String? email,
    String? avatarUrl,
    bool audioOnly = false,
  }) async {
    var options = JitsiMeetConferenceOptions(
      serverURL: "https://meet.jit.si",
      room: roomName,
      userInfo: JitsiMeetUserInfo(
        displayName: displayName,
        email: email,
        avatar: avatarUrl,
      ),
      configOverrides: {
        "startWithAudioMuted": false,
        "startWithVideoMuted": audioOnly,
        "prejoinPageEnabled": false,
      },
      featureFlags: {
        FeatureFlags.addPeopleEnabled: false,
        FeatureFlags.welcomePageEnabled: false,
        FeatureFlags.preJoinPageEnabled: false,
        FeatureFlags.unsafeRoomWarningEnabled: false,
        FeatureFlags.resolution: FeatureFlagVideoResolutions.resolution720p,
        FeatureFlags.audioFocusDisabled: true,
        FeatureFlags.audioMuteButtonEnabled: true,
        FeatureFlags.audioOnlyButtonEnabled: true,
        FeatureFlags.calenderEnabled: false,
        FeatureFlags.callIntegrationEnabled: true,
        FeatureFlags.carModeEnabled: false,
        FeatureFlags.closeCaptionsEnabled: false,
        FeatureFlags.inviteEnabled: false,
        FeatureFlags.iosRecordingEnabled: false,
        FeatureFlags.iosScreensharingEnabled: false,
        FeatureFlags.toolboxEnabled: true,
        FeatureFlags.recordingEnabled: false,
        FeatureFlags.liveStreamingEnabled: false,
        FeatureFlags.meetingNameEnabled: true,
        FeatureFlags.videoShareEnabled: false,
        FeatureFlags.pipEnabled: true,
        FeatureFlags.kickOutEnabled: false,
        FeatureFlags.tileViewEnabled: true,
        FeatureFlags.toolboxAlwaysVisible: false,
      },
    );

    // Add event listeners
    var listener = JitsiMeetEventListener(
      conferenceJoined: (url) {
        debugPrint("Conference joined: $url");
      },
      conferenceTerminated: (url, error) {
        debugPrint("Conference terminated: $url, error: $error");
      },
      conferenceWillJoin: (url) {
        debugPrint("Conference will join: $url");
      },
      participantJoined: (email, name, role, participantId) {
        debugPrint("Participant joined: $name");
      },
      participantLeft: (participantId) {
        debugPrint("Participant left: $participantId");
      },
      audioMutedChanged: (muted) {
        debugPrint("Audio muted: $muted");
      },
      videoMutedChanged: (muted) {
        debugPrint("Video muted: $muted");
      },
    );

    await _jitsiMeet.join(options, listener);
  }
  
  Future<void> hangUp() async {
    await _jitsiMeet.hangUp();
  }
  
  Future<void> setAudioMuted(bool muted) async {
    await _jitsiMeet.setAudioMuted(muted);
  }
  
  Future<void> setVideoMuted(bool muted) async {
    await _jitsiMeet.setVideoMuted(muted);
  }
}
```

---

## Step 5: Integration with Existing Call Flow

The `JitsiMeetService` already handles signaling via Supabase. Here's how the flow works:

### Outgoing Call Flow:
1. User taps "Jitsi Call" button
2. `JitsiMeetService.startCall()` generates room name and sends invite via Supabase
3. Navigate to `JitsiCallScreen` 
4. When remote user accepts, both join the same Jitsi room

### Incoming Call Flow:
1. `JitsiMeetService` receives `jitsi-invite` signal
2. Show incoming call dialog
3. If accepted, call `JitsiMeetService.acceptCall()` and navigate to `JitsiCallScreen`
4. Both users join the same Jitsi room

---

## Step 6: Add Jitsi Call Button to Communications Screen

In your communications screen, add a Jitsi call option:

```dart
// Add to user card in communications_screen.dart

Row(
  children: [
    // Existing WebRTC call button
    IconButton(
      icon: Icon(Icons.phone),
      onPressed: () => _startWebRTCCall(user),
      tooltip: 'Direct Call',
    ),
    
    // New Jitsi call button
    IconButton(
      icon: Icon(Icons.video_camera_front),
      color: Colors.green,
      onPressed: () => _startJitsiCall(user),
      tooltip: 'Jitsi Call (More Reliable)',
    ),
  ],
)

// Method to start Jitsi call
Future<void> _startJitsiCall(UserPresence user) async {
  final jitsiService = JitsiMeetService();
  
  final result = await jitsiService.startCall(
    remoteUserId: user.id,
    remoteUserName: user.displayName,
    remoteUserAvatar: user.avatarUrl,
    audioOnly: false,
  );
  
  if (result.success && mounted) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => JitsiCallScreen(
          roomName: result.roomName!,
          serverUrl: result.serverUrl!,
          remoteUserName: user.displayName,
          remoteUserAvatar: user.avatarUrl,
        ),
      ),
    );
  }
}
```

---

## Step 7: Handle Incoming Jitsi Calls

Update your main app to listen for incoming Jitsi calls:

```dart
// In main.dart or app initialization

final jitsiService = JitsiMeetService();

jitsiService.incomingCallStream.listen((incomingCall) {
  // Show incoming call dialog
  showDialog(
    context: navigatorKey.currentContext!,
    barrierDismissible: false,
    builder: (context) => JitsiIncomingCallDialog(
      incomingCall: incomingCall,
      onAccept: () async {
        Navigator.pop(context);
        final result = await jitsiService.acceptCall(incomingCall);
        if (result.success) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => JitsiCallScreen(
                roomName: result.roomName!,
                serverUrl: result.serverUrl!,
                remoteUserName: incomingCall.callerName,
                remoteUserAvatar: incomingCall.callerAvatar,
                isOutgoing: false,
              ),
            ),
          );
        }
      },
      onReject: () {
        jitsiService.rejectCall(incomingCall);
        Navigator.pop(context);
      },
    ),
  );
});
```

---

## Troubleshooting

### Issue: Build fails on Android
- Make sure `minSdkVersion` is at least 24
- Run `flutter clean && flutter pub get`

### Issue: Camera/Mic not working
- Check permissions in AndroidManifest.xml and Info.plist
- Request permissions at runtime using `permission_handler` package

### Issue: Call doesn't connect
- Check internet connectivity
- Verify Supabase realtime is working
- Check that both users have the same room name

### Issue: Audio/Video quality is poor
- Jitsi automatically adjusts quality based on bandwidth
- For better quality, use `resolution: 720` in config

---

## Self-Hosting Jitsi (Optional)

If you want to self-host for privacy or custom branding:

1. Get a VPS (DigitalOcean, AWS, etc.) - $20-50/month
2. Follow the official guide: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart
3. Update `serverUrl` in JitsiMeetService to your domain

---

## Summary

1. Add `jitsi_meet_flutter_sdk: ^10.3.0` to pubspec.yaml
2. Configure Android (minSdk 24, permissions, multidex)
3. Configure iOS (iOS 15.1+, permissions)
4. Use `JitsiMeetService` for signaling via Supabase
5. Use `JitsiCallScreen` for the call UI
6. Both web and mobile will connect to the same Jitsi rooms seamlessly
