# Agora RTC Integration Guide for PACT Mobile

## Overview

This guide explains how to use the newly integrated Agora RTC Engine for native video and audio calling in the PACT Mobile app. Agora provides a superior calling experience compared to Jitsi with:

- **Native UI**: Embedded video/audio views directly in your app
- **Better Performance**: Lower latency and higher quality
- **Full Control**: Complete control over call features and UI
- **Reliability**: Automatic quality adjustment and reconnection

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [Usage Examples](#usage-examples)
5. [Migration from Jitsi](#migration-from-jitsi)
6. [API Reference](#api-reference)
7. [Troubleshooting](#troubleshooting)

---

## Installation

### 1. Dependencies

The following dependency has been added to `pubspec.yaml`:

```yaml
dependencies:
  agora_rtc_engine: ^6.3.2
```

Run `flutter pub get` to install.

### 2. Platform Setup

#### Android

Permissions are already configured in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

#### iOS

Permissions are already configured in `ios/Runner/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Camera access is required to capture site visit photos.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access is required for audio recording and video calls.</string>
```

---

## Quick Start

### Step 1: Initialize the Service

Initialize `AgoraCallService` when your user logs in:

```dart
import 'package:pact_mobile/services/agora_call_service.dart';

final agoraService = AgoraCallService();

await agoraService.initialize(
  userId: currentUser.id,
  userName: currentUser.name,
  userAvatar: currentUser.avatarUrl,
  userEmail: currentUser.email,
);
```

### Step 2: Start a Call

```dart
import 'package:pact_mobile/screens/agora_call_screen.dart';

// Start video call
final result = await agoraService.startCall(
  remoteUserId: 'user123',
  remoteUserName: 'John Doe',
  remoteUserAvatar: 'https://example.com/avatar.jpg',
  audioOnly: false, // false = video call
);

if (result.success && result.channelName != null) {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (context) => AgoraCallScreen(
        channelName: result.channelName!,
        remoteUserId: 'user123',
        remoteUserName: 'John Doe',
        remoteUserAvatar: 'https://example.com/avatar.jpg',
        isAudioOnly: false,
        isOutgoing: true,
      ),
    ),
  );
}
```

### Step 3: Listen for Incoming Calls

```dart
agoraService.incomingCallStream.listen((incomingCall) {
  // Show incoming call UI (dialog, notification, etc.)
  showIncomingCallDialog(incomingCall);
});
```

---

## Configuration

### Agora App ID

Currently, the App ID is hardcoded in `agora_call_service.dart`:

```dart
static const String _appId = '1d38576d0cfe429a9c996dfedcb60629';
```

**For Production:**

1. **Environment Variables**: Store the App ID in environment config
2. **Token Authentication**: Generate Agora tokens server-side for security
3. **Supabase Edge Function**: Create a function to generate tokens on-demand

Example token generation flow:

```dart
// Request token from your backend
final response = await supabase.functions.invoke('generate-agora-token', 
  body: {'channelName': channelName, 'userId': userId}
);
final token = response.data['token'];

// Use token when joining channel
await agoraService.joinChannel(channelName, token: token);
```

---

## Usage Examples

### Example 1: Video Call

```dart
final result = await agoraService.startCall(
  remoteUserId: 'user456',
  remoteUserName: 'Jane Smith',
  audioOnly: false, // Video enabled
);
```

### Example 2: Audio-Only Call

```dart
final result = await agoraService.startCall(
  remoteUserId: 'user456',
  remoteUserName: 'Jane Smith',
  audioOnly: true, // Audio only
);
```

### Example 3: Accept Incoming Call

```dart
agoraService.incomingCallStream.listen((incomingCall) async {
  // Show accept/reject dialog
  final shouldAccept = await showDialog<bool>(...);
  
  if (shouldAccept == true) {
    final result = await agoraService.acceptCall(incomingCall);
    
    if (result.success) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => AgoraCallScreen(
            channelName: result.channelName!,
            remoteUserId: incomingCall.callerId,
            remoteUserName: incomingCall.callerName,
            isAudioOnly: incomingCall.isAudioOnly,
            isOutgoing: false,
          ),
        ),
      );
    }
  } else {
    await agoraService.rejectCall(incomingCall);
  }
});
```

### Example 4: Monitor Call State

```dart
agoraService.callStateStream.listen((callState) {
  switch (callState.status) {
    case CallStatus.calling:
      print('Calling ${callState.remoteUserName}...');
      break;
    case CallStatus.connected:
      print('Call connected!');
      break;
    case CallStatus.ended:
      print('Call ended');
      // Save to call history
      break;
    case CallStatus.rejected:
      showSnackBar('Call rejected');
      break;
    case CallStatus.busy:
      showSnackBar('User is busy');
      break;
  }
});
```

---

## Migration from Jitsi

If you're migrating from the existing Jitsi implementation:

### Key Differences

| Feature | Jitsi | Agora |
|---------|-------|-------|
| UI | External browser/app | Native in-app |
| Video View | URL launcher | Native AgoraVideoView |
| Signaling | Supabase (same) | Supabase (same) |
| Setup | Room URL | Channel name |

### Migration Steps

1. **Replace Service Import**:
   ```dart
   // Old
   import 'package:pact_mobile/services/jitsi_meet_service.dart';
   
   // New
   import 'package:pact_mobile/services/agora_call_service.dart';
   ```

2. **Replace Screen Import**:
   ```dart
   // Old
   import 'package:pact_mobile/screens/jitsi_call_screen.dart';
   
   // New
   import 'package:pact_mobile/screens/agora_call_screen.dart';
   ```

3. **Update Initialization**:
   ```dart
   // Both use the same pattern
   await AgoraCallService().initialize(
     userId: userId,
     userName: userName,
     userAvatar: userAvatar,
     userEmail: userEmail,
   );
   ```

4. **Update Call Initiation**:
   ```dart
   // Old (Jitsi)
   final result = await jitsiService.startCall(...);
   Navigator.push(...JitsiCallScreen(...));
   
   // New (Agora) - very similar!
   final result = await agoraService.startCall(...);
   Navigator.push(...AgoraCallScreen(...));
   ```

### Gradual Migration (Feature Flag)

You can run both services side-by-side during migration:

```dart
class CallService {
  static const bool useAgora = true; // Feature flag
  
  static Future<void> startCall(BuildContext context, ...) async {
    if (useAgora) {
      // Use Agora
      final result = await AgoraCallService().startCall(...);
      Navigator.push(context, AgoraCallScreen(...));
    } else {
      // Use Jitsi
      final result = await JitsiMeetService().startCall(...);
      Navigator.push(context, JitsiCallScreen(...));
    }
  }
}
```

---

## API Reference

### AgoraCallService

#### Methods

- `initialize({userId, userName, userAvatar, userEmail})` - Initialize service
- `startCall({remoteUserId, remoteUserName, remoteUserAvatar, audioOnly})` - Start outgoing call
- `acceptCall(incomingCall)` - Accept incoming call
- `rejectCall(incomingCall)` - Reject incoming call
- `endCall()` - End current call
- `joinChannel(channelName, {token})` - Join Agora channel
- `toggleMute()` - Mute/unmute microphone
- `toggleVideo()` - Enable/disable video
- `switchCamera()` - Switch between front/back camera
- `toggleSpeaker()` - Toggle speaker on/off

#### Properties

- `isInCall` - Whether currently in a call
- `currentChannelName` - Active channel name
- `remoteUid` - Remote user's Agora UID
- `isMuted` - Microphone mute state
- `isVideoDisabled` - Video disabled state
- `isSpeakerOn` - Speaker state
- `isFrontCamera` - Front camera state

#### Streams

- `callStateStream` - Emits `CallState` on state changes
- `incomingCallStream` - Emits `AgoraIncomingCall` for incoming calls
- `remoteUserStream` - Emits remote user UID changes

### AgoraCallScreen

#### Constructor Parameters

```dart
AgoraCallScreen({
  required String channelName,
  String? remoteUserId,
  String? remoteUserName,
  String? remoteUserAvatar,
  bool isAudioOnly = false,
  bool isOutgoing = true,
})
```

---

## Troubleshooting

### Issue: Permissions Denied

**Solution**: Ensure you've requested permissions before joining:

```dart
await [Permission.camera, Permission.microphone].request();
```

### Issue: Black Screen in Video Call

**Possible causes**:
1. Camera permission not granted
2. Video disabled with `audioOnly: true`
3. Remote user hasn't joined yet

**Solution**: Check `_remoteUid` is not null and video is enabled.

### Issue: No Audio

**Possible causes**:
1. Microphone permission not granted
2. Audio muted
3. Volume too low

**Solution**: 
```dart
await agoraService.toggleSpeaker(); // Turn on speaker
await agoraService.toggleMute(); // Unmute
```

### Issue: Call Not Connecting

**Possible causes**:
1. Invalid Agora App ID
2. Network issues
3. Signaling not working (Supabase)

**Solution**:
1. Verify App ID in `agora_call_service.dart`
2. Check internet connection
3. Check Supabase realtime is enabled
4. Verify channel name matches on both sides

### Issue: Token Expired (Production)

**Solution**: Implement server-side token generation with proper expiry:

```dart
// Generate token with 24-hour expiry on server
final token = agoraTokenBuilder.buildTokenWithUid(
  appId: appId,
  appCertificate: appCertificate,
  channelName: channelName,
  uid: uid,
  role: Role.publisher,
  expireTime: DateTime.now().add(Duration(hours: 24)),
);
```

---

## Testing

### Test on Two Devices

1. **Device A**: Login as User A
2. **Device B**: Login as User B
3. **Device A**: Call User B
4. **Device B**: Accept call
5. **Verify**: Video/audio transmission works
6. **Test**: Mute, video toggle, camera switch, end call

### Test Scenarios

- ✅ Video call (both users)
- ✅ Audio-only call
- ✅ Reject incoming call
- ✅ Busy (already in call)
- ✅ Network reconnection
- ✅ Camera switch (front/back)
- ✅ Mute/unmute
- ✅ Speaker on/off

---

## Production Checklist

Before deploying to production:

- [ ] Move App ID to environment config
- [ ] Implement token-based authentication
- [ ] Create Supabase Edge Function for token generation
- [ ] Test on multiple devices and networks
- [ ] Test with poor network conditions
- [ ] Implement call history integration
- [ ] Add analytics/logging for call quality
- [ ] Test permissions on both Android and iOS
- [ ] Review Agora pricing for expected usage
- [ ] Setup monitoring for failed calls

---

## Pricing Considerations

### Agora Pricing (as of 2024)

- **Free Tier**: 10,000 minutes/month
- **Paid**: ~$0.99 per 1,000 minutes (varies by region/quality)
- **HD Video**: Higher rates for HD (720p+)

**Recommendation**: Monitor usage and set up billing alerts.

---

## Support

For questions or issues:

1. Check this guide
2. See examples in `lib/examples/agora_integration_example.dart`
3. Review Agora documentation: https://docs.agora.io/
4. Check PACT Mobile internal documentation

---

## Changelog

### v1.0 - Initial Agora Integration (2024-02-02)

- ✅ Added `agora_rtc_engine` dependency
- ✅ Created `AgoraCallService` for call management
- ✅ Created `AgoraCallScreen` with native video/audio UI
- ✅ Integrated with existing Supabase signaling
- ✅ Maintained compatibility with call history service
- ✅ Added comprehensive examples and documentation

---

**Built with ❤️ for PACT Mobile**
