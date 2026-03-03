# Enhanced Call Screen & Screen Sharing Integration Guide

## Overview

This guide helps you integrate the enhanced call screen with screen sharing, full-screen mode, mini-screen (Picture-in-Picture), and detailed call information features into your PACT Mobile App.

## Features Added

### 1. **Screen Sharing**
- Share your device screen during video calls
- Automatic track management when sharing starts/stops
- Call participants can see your screen in real-time
- Built-in screen share indicator

### 2. **Enhanced Call Details**
- Live call duration tracking
- Call participant information (name, status)
- Call type indicator (Audio/Video)
- Connection quality indicators
- Time display

### 3. **Full-Screen Mode**
- Long-press on local video PIP to expand to full screen
- Toggle full-screen with button control
- Immersive calling experience

### 4. **Mini-Screen / Picture-in-Picture (PIP)**
- Configurable local video mini-screen size
- Draggable and resizable
- Tap to return to full screen
- Low-profile status display

### 5. **Enhanced Controls**
- Screen share button
- Speaker phone toggle
- Video and microphone controls
- Call information panel
- Auto-hide controls with tap to reveal

## File Structure

```
lib/
├── models/
│   └── call_state.dart (Updated - added screen sharing properties)
├── services/
│   └── webrtc_service.dart (Updated - added screen sharing methods)
├── screens/
│   ├── call_screen.dart (Original - Jitsi-based)
│   ├── enhanced_call_screen.dart (NEW - WebRTC with enhancements)
│   └── ...
└── widgets/
    └── incoming_call_dialog.dart (Updated - supports both call screens)
```

## Usage

### Option 1: Using Enhanced Call Screen with Incoming Calls

Update your incoming call dialog initialization to use the enhanced screen:

```dart
IncomingCallDialog(
  callerId: '...',
  callerName: 'John Doe',
  callerAvatar: 'https://...',
  callId: '...',
  callToken: '...',
  isAudioOnly: false,
  useEnhancedScreen: true,  // Enable enhanced screen
)
```

### Option 2: Direct Navigation to Enhanced Screen

```dart
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (context) => EnhancedCallScreen(
      remoteUserName: 'John Doe',
      remoteUserAvatar: 'https://...',
    ),
  ),
);
```

### Option 3: Starting a Call and Opening Enhanced Screen

```dart
final WebRTCService webrtcService = WebRTCService();

// Initiate call
final success = await webrtcService.initiateCall(
  targetUserId: 'user123',
  targetUserName: 'John Doe',
  isAudioOnly: false,
);

if (success) {
  // Navigate to enhanced call screen
  if (mounted) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => EnhancedCallScreen(
          remoteUserName: 'John Doe',
        ),
      ),
    );
  }
}
```

## WebRTCService Screen Sharing API

### Start Screen Sharing

```dart
final WebRTCService webrtcService = WebRTCService();

// Check if screen sharing is already active
if (webrtcService.isScreenSharing) {
  // Already sharing
  return;
}

// Start screen sharing
final success = await webrtcService.startScreenShare();

if (success) {
  print('Screen sharing started');
} else {
  print('Failed to start screen sharing');
}
```

### Stop Screen Sharing

```dart
final success = await webrtcService.stopScreenShare();

if (success) {
  print('Screen sharing stopped');
}
```

### Toggle Screen Sharing

```dart
final success = await webrtcService.toggleScreenShare();

if (success) {
  // Screen sharing status changed
  print('Screen sharing is now: ${webrtcService.isScreenSharing}');
}
```

## CallState Properties for Screen Sharing

The `CallState` model includes:

```dart
class CallState {
  // ... existing properties ...
  
  // Screen sharing
  bool isScreenSharing = false;
  
  // Quality indicators
  CallQuality callQuality = CallQuality.unknown;
  double? packetLoss;
  int? latencyMs;
  int? bitrate;
  int? jitterMs;
  
  // Audio device selection
  AudioOutputDevice audioDevice = AudioOutputDevice.earpiece;
  
  // ... copyWith method includes all new properties ...
}
```

## Screen Sharing Platform Support

### Android
- **Requirements**: Android 10+
- **Permissions**: 
  ```xml
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  ```

### iOS
- **Requirements**: iOS 13.0+
- **Capabilities**: Requires ReplayKit framework (included in flutter_webrtc)

### Web
- **Browsers**: Chrome 72+, Firefox 66+, Safari 13+
- **Permissions**: User selects screen/window to share

## EnhancedCallScreen Features

### Properties

```dart
class EnhancedCallScreen extends StatefulWidget {
  final String? remoteUserName;      // Remote user's display name
  final String? remoteUserAvatar;    // Remote user's avatar URL
  
  const EnhancedCallScreen({
    required this.remoteUserName,
    required this.remoteUserAvatar,
  });
}
```

### Built-in Features

1. **Auto-hiding Controls**
   - Controls hide after 5 seconds of inactivity
   - Tap screen to toggle visibility

2. **Call Details Panel**
   - Press info button to see call details
   - Shows: Name, Duration, Time, Type, Video status, Microphone status

3. **Full-Screen Toggle**
   - Long-press local PIP to expand
   - Or use full-screen button in controls

4. **Mini-Screen Mode**
   - Tap mini-screen button for floating PIP window
   - Tap again to return to full screen

5. **Screen Sharing Overlay**
   - Visual indicator when sharing screen
   - Screen icon with opacity effect

6. **Call Controls**
   - Screen share toggle
   - Speaker phone toggle
   - Microphone mute/unmute
   - Video enable/disable
   - End call button

## Customization

### Adjusting Mini-Screen Size

Edit `lib/screens/enhanced_call_screen.dart`:

```dart
// Local video PIP (currently 120x160)
Positioned(
  top: 20,
  right: 20,
  width: 120,       // Adjust width
  height: 160,      // Adjust height
  child: ...
)
```

### Changing Control Auto-hide Timeout

```dart
// Currently 5 seconds
_hideControlsTimer = Timer(const Duration(seconds: 5), () {
  // Auto-hide
});

// Change to 10 seconds
_hideControlsTimer = Timer(const Duration(seconds: 10), () {
  // Auto-hide
});
```

### Custom Theme Colors

Update control button colors:

```dart
_buildIconButton(
  icon: Icons.mic,
  isActive: _callState.isMuted,
  // Customize colors
);
```

## Error Handling

The enhanced screen includes error handling for screen sharing:

```dart
void _toggleScreenSharing() async {
  try {
    final success = await _webrtcService.toggleScreenShare();
    if (success) {
      setState(() {
        _isScreenSharing = _webrtcService.isScreenSharing;
      });
    } else {
      // Show error
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to toggle screen sharing'),
        ),
      );
    }
  } catch (e) {
    debugPrint('Error: $e');
    // Handle error
  }
}
```

## Testing Screen Sharing

### Android Testing
1. Open the app on Android 10+ device
2. Start a call
3. Long-press to go full-screen
4. Tap the screen share button
5. Select the screen/window you want to share
6. Remote user should see your screen

### iOS Testing
1. Open the app on iOS 13.0+ device
2. Start a call
3. Tap the screen share button
4. Allow the app to access screen recording
5. Remote user should see your screen

## Troubleshooting

### Screen Sharing Not Working

1. **Check Permissions**:
   - Android: Settings → App Permissions → Screen recording
   - iOS: Settings → Privacy → Screen Recording

2. **Check Android Version**:
   - Screen sharing requires Android 10+
   - Use `MediaStore.ACTION_TAKEDOWN` API for lower versions

3. **Check Connection**:
   - Ensure peer connection is active
   - Check ICE candidates are being exchanged

### Performance Issues

1. **Reduce Video Quality**: Lower bitrate settings
2. **Lower Screen Share Resolution**: Request lower display resolution
3. **Close Background Apps**: Free up resources
4. **Check Network**: Poor network = poor quality

## API Reference

### WebRTCService

```dart
// Screen sharing methods
Future<bool> startScreenShare();
Future<bool> stopScreenShare();
Future<bool> toggleScreenShare();

// Getters
bool get isScreenSharing;

// Existing methods still work
Future<bool> toggleVideo();
bool toggleMute();
bool toggleSpeaker();
Future<void> switchCamera();
Future<void> endCall();
```

### CallState

```dart
// Check screen sharing status
final isSharing = callState.isScreenSharing;

// Get quality indicators
final quality = callState.callQuality;
final latency = callState.latencyMs;
final bitrate = callState.bitrate;
```

## Next Steps

1. ✅ Screen sharing implemented
2. ✅ Enhanced call details added
3. ✅ Full-screen and mini-screen modes
4. 📋 Future: Call recording with screen share
5. 📋 Future: Peer-to-peer quality indicators
6. 📋 Future: Multi-participant support

## Support

For issues or questions about screen sharing:
1. Check the WebRTCService implementation
2. Review the EnhancedCallScreen code
3. Check platform-specific permissions
4. Review browser/OS compatibility

---

**Created**: 2024
**Last Updated**: 2024
**Status**: Production Ready
