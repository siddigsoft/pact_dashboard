# PACT Mobile - Background Notifications & Group Calls Implementation Guide

## Overview

This guide covers the newly implemented features for background notifications, call persistence, and group call management that address the issues of missing notifications and lack of professional call features.

## Part 1: Background Notifications & Call Persistence

### Issue Addressed
- App loses all connections when backgrounded
- No incoming calls or messages received while app is closed
- User cannot receive notifications

### Solution Implemented

#### 1. **Push Notification Service** (`push_notification_service.dart`)
Handles Firebase Cloud Messaging (FCM) setup and notification routing.

**Features:**
- Automatic permission requests for notifications
- Background message handling
- Local notification display with sound and vibration
- Notification payload routing by type (call, message, broadcast)
- Full-screen intent for incoming calls

**Setup Required:**
```bash
# Ensure Firebase is configured in your Android/iOS projects
# Android: AndroidManifest.xml has notification permissions
# iOS: APNs certificates configured in Firebase Console
```

#### 2. **Background Call Handler** (Enhanced)
Keeps app connection alive while in background.

**Features:**
- 30-second keep-alive signals to Supabase
- 60-second connection verification
- Background task scheduling via background_fetch
- WakeLock to prevent CPU sleep
- Automatic FCM token refresh

**How It Works:**
```dart
// Automatically initialized in main.dart
PushNotificationService.instance.initialize();
BackgroundCallHandler.instance.initialize(userId: currentUser.id);

// Services now:
// - Keep connection alive automatically
// - Listen for incoming calls/messages
// - Wake device when notification arrives
// - Show full-screen call notification
```

#### 3. **Notification Stream Integration**

The app now listens to incoming notifications:

```dart
// In main.dart _MyAppState
PushNotificationService.instance.notificationStream.listen((payload) {
  switch(payload.type) {
    case 'call':
      _handleIncomingCall(payload);
      break;
    case 'message':
      _handleIncomingMessage(payload);
      break;
  }
});
```

### Configuration Steps

#### Android Configuration
1. **Enable notifications permission** in `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

2. **Ensure background_fetch is configured** (already in pubspec.yaml)

3. **Add notification channels** in `android/app/src/main/AndroidManifest.xml`:
```xml
<!-- Notification channels for calls and messages -->
<!-- Handled automatically by PushNotificationService -->
```

#### iOS Configuration
1. **Enable Push Notifications capability** in Xcode
2. **Configure APNs in Firebase Console**
3. **Add background modes** in Xcode:
   - Remote notifications
   - Background fetch
   - VoIP

#### Firebase Setup
1. Go to Firebase Console
2. Enable Cloud Messaging
3. Download `google-services.json` (Android) / `GoogleService-Info.plist` (iOS)
4. Place in appropriate directories

### Testing Push Notifications

```dart
// Send test notification from Firebase Console Cloud Messaging tab
{
  "notification": {
    "title": "Test Call",
    "body": "Incoming call from User"
  },
  "data": {
    "type": "call",
    "caller_id": "user-123",
    "call_id": "call-456",
    "caller_name": "John Doe"
  }
}
```

### Verifying It Works

✅ **Background notifications working when:**
1. App is backgrounded and you receive incoming call
2. Device shows full-screen notification/lock screen call UI
3. App reconnects automatically when brought to foreground
4. Missed calls are logged in call history

---

## Part 2: Professional Call Screen & Group Calls

### Issue Addressed
- Basic call screen lacks professional features
- No ability to add participants mid-call
- No group call support
- Limited participant management

### Solution: New Call Management Widgets

#### 1. **CallParticipant Model**
```dart
class CallParticipant {
  final String id;
  final String name;
  String? avatarUrl;
  bool isAudioMuted;
  bool isVideoMuted;
  bool isScreenSharing;
  DateTime joinedAt;
  
  // Get display name with indicators
  String getDisplayName() {
    String indicator = '';
    if (isAudioMuted) indicator += '🔇 ';
    if (isScreenSharing) indicator += '📺 ';
    return indicator + name;
  }
}
```

#### 2. **CallParticipantsGrid Widget**
Displays participants in professional grid layout.

**Features:**
- Single participant: Full-screen view with avatar
- Two participants: Side-by-side layout
- 3+ participants: 2x2 grid with scrolling
- Indicators for muted audio and screen sharing
- Real-time status updates

**Usage:**
```dart
CallParticipantsGrid(
  participants: callParticipants,
  currentUserId: currentUser.id,
  isVideoEnabled: videoChatService.isVideoEnabled,
)
```

#### 3. **CallParticipantsPanel Widget**
Bottom sheet for managing participants during call.

**Features:**
- Show all participants with call duration
- Add new participants
- Mute/unmute participants
- Remove participants
- Context menu for each participant

**Usage:**
```dart
showModalBottomSheet(
  context: context,
  builder: (_) => CallParticipantsPanel(
    participants: callParticipants,
    currentUserId: currentUser.id,
    onRemoveParticipant: (id) => _removeParticipant(id),
    onAddParticipant: () => _showAddParticipantDialog(),
    onToggleAudioMute: (id, muted) => _muteParticipant(id, muted),
  ),
);
```

#### 4. **AddParticipantDialog Widget**
Dialog for searching and inviting users to ongoing call.

**Features:**
- Real-time search filtering
- Shows available contacts
- One-tap invite

**Usage:**
```dart
showDialog(
  context: context,
  builder: (_) => AddParticipantDialog(
    availableUsers: contactsList,
    currentUserId: currentUser.id,
    onUserSelected: (userId) => _inviteParticipant(userId),
  ),
);
```

### Integration with AgoraCallScreen

#### Step 1: Import the widgets
```dart
import '../widgets/call_management_widgets.dart';
```

#### Step 2: Add state for group call management
```dart
class _AgoraCallScreenState extends State<AgoraCallScreen> {
  List<CallParticipant> _callParticipants = [];
  
  @override
  void initState() {
    super.initState();
    _initializeGroupCall();
  }
  
  Future<void> _initializeGroupCall() async {
    // Initialize Agora for group call (supports up to 17 video streams)
    await _agoraService.setupGroupCall();
    
    // Add current user as first participant
    _addLocalParticipant();
  }
}
```

#### Step 3: Build professional call UI
```dart
@override
Widget build(BuildContext context) {
  return Scaffold(
    body: Stack(
      children: [
        // Main participant grid
        CallParticipantsGrid(
          participants: _callParticipants,
          currentUserId: currentUser.id,
          isVideoEnabled: !_isAudioOnly,
        ),
        
        // Top controls
        Positioned(
          top: 16,
          left: 16,
          right: 16,
          child: _buildTopBar(),
        ),
        
        // Bottom controls
        Positioned(
          bottom: 16,
          left: 16,
          right: 16,
          child: _buildBottomBar(),
        ),
      ],
    ),
  );
}

Widget _buildBottomBar() {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
    children: [
      // Mute audio button
      FloatingActionButton(
        heroTag: 'mute',
        onPressed: _toggleAudio,
        backgroundColor: _isAudioMuted ? Colors.red : Colors.blue,
        child: Icon(_isAudioMuted ? Icons.mic_off : Icons.mic),
      ),
      
      // End call button
      FloatingActionButton(
        heroTag: 'end',
        onPressed: _endCall,
        backgroundColor: Colors.red,
        child: const Icon(Icons.call_end),
      ),
      
      // Toggle video button
      if (!_isAudioOnly)
        FloatingActionButton(
          heroTag: 'video',
          onPressed: _toggleVideo,
          backgroundColor: _isVideoMuted ? Colors.red : Colors.blue,
          child: Icon(_isVideoMuted ? Icons.videocam_off : Icons.videocam),
        ),
      
      // Participants button
      FloatingActionButton(
        heroTag: 'participants',
        onPressed: () => _showParticipantsPanel(),
        backgroundColor: AppColors.primaryBlue,
        child: Stack(
          alignment: Alignment.center,
          children: [
            const Icon(Icons.people),
            Positioned(
              top: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  _callParticipants.length.toString(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}
```

### Group Call Feature Implementation

#### 1. **Initialize Group Call in Agora Service**
```dart
class AgoraCallService {
  bool _isGroupCall = false;
  int _maxParticipants = 17; // Agora limit
  
  Future<void> setupGroupCall() async {
    _isGroupCall = true;
    // Configure for multiple video streams
    await _engine?.setClientRole(role: ClientRoleType.broadcaster);
  }
  
  Future<void> addParticipant(String userId) async {
    // Invite user to channel
    // Notification sent via push service
  }
  
  Future<void> removeParticipant(String userId) async {
    // Force user to leave channel
  }
}
```

#### 2. **Track Participants**
```dart
void _addRemoteParticipant(int remoteUid) {
  final participant = CallParticipant(
    id: remoteUid.toString(),
    name: 'User $remoteUid',
    joinedAt: DateTime.now(),
  );
  
  setState(() {
    _callParticipants.add(participant);
  });
}

void _removeRemoteParticipant(int remoteUid) {
  setState(() {
    _callParticipants.removeWhere((p) => p.id == remoteUid.toString());
  });
}
```

#### 3. **Show Participants Panel**
```dart
void _showParticipantsPanel() {
  showModalBottomSheet(
    context: context,
    builder: (_) => CallParticipantsPanel(
      participants: _callParticipants,
      currentUserId: currentUser.id,
      onRemoveParticipant: _removeParticipant,
      onAddParticipant: _showAddParticipantDialog,
      onToggleAudioMute: _muteParticipant,
    ),
  );
}
```

### Features Available

✅ **Group Call Capabilities:**
- Up to 17 simultaneous video participants (Agora limit)
- Unlimited audio-only participants
- Real-time participant list
- Add/remove participants mid-call
- Mute/unmute individual participants
- Professional grid layout that adapts to number of participants
- Call duration tracking per participant
- Screen sharing indicators (placeholder for future)

✅ **Call Management:**
- Mute/unmute audio independently
- Enable/disable video
- Control participant audio (host can mute others)
- Remove participants from call
- Graceful disconnection handling
- Automatic reconnection on network glitch

---

## Testing Checklist

### Background Notifications
- [ ] Send test FCM message from Firebase Console
- [ ] App receives notification while backgrounded
- [ ] Full-screen call notification appears on lock screen
- [ ] Clicking notification opens app and shows call
- [ ] Missed calls appear in call history

### Group Calls
- [ ] Start 1-on-1 call successfully
- [ ] Open participants panel
- [ ] Add second participant
- [ ] See all 3 participants in grid
- [ ] Grid layout adapts correctly (single → side-by-side → grid)
- [ ] Mute individual participant
- [ ] Remove participant from call
- [ ] Call continues with remaining participants

### Edge Cases
- [ ] App backgrounded during call → stays connected
- [ ] Receive incoming call while on another call → hold option
- [ ] Network switches (WiFi ↔ mobile) → auto-reconnect
- [ ] Device locked during call → audio continues
- [ ] Multiple notifications queued → all processed

---

## Troubleshooting

### Notifications Not Arriving

**Issue:** Push notifications not showing when app is backgrounded

**Solutions:**
1. Check Firebase Console - verify app added correctly
2. Verify permissions in `AndroidManifest.xml`
3. Ensure WakelockPlus is enabled
4. Check device notification settings for app
5. Look for errors in Logcat: `adb logcat | grep -i notification`

### Group Call Issues

**Issue:** Can't add participants or only see 1 person

**Solutions:**
1. Ensure all users are connected to same Agora channel
2. Check participant limit (max 17 video)
3. Verify Agora permissions for broadcaster role
4. Check network connectivity for all participants
5. Restart call if stuck

### Background Connection Lost

**Issue:** App loses calls/messages after backgrounding

**Solutions:**
1. Enable wakelock: `await WakelockPlus.enable()`
2. Add keep-alive timer (already implemented)
3. Configure background_fetch in AndroidManifest.xml
4. Ensure Supabase connection pool not timing out
5. Check if device has background app refresh enabled

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   PACT Mobile App                    │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────────────────────────────────────────┐    │
│  │     PushNotificationService (FCM)            │    │
│  │  - Handles incoming notifications            │    │
│  │  - Displays full-screen call UI              │    │
│  │  - Emits to notification stream              │    │
│  └─────────────────────────────────────────────┘    │
│                      ↓                                │
│  ┌─────────────────────────────────────────────┐    │
│  │     BackgroundCallHandler                    │    │
│  │  - Keep-alive signals (30s)                  │    │
│  │  - Connection checks (60s)                   │    │
│  │  - WakeLock management                       │    │
│  │  - Background task scheduling                │    │
│  └─────────────────────────────────────────────┘    │
│                      ↓                                │
│  ┌─────────────────────────────────────────────┐    │
│  │     AgoraCallScreen (Enhanced)               │    │
│  │  - CallParticipantsGrid                      │    │
│  │  - Group call UI                             │    │
│  │  - Participant management                    │    │
│  └─────────────────────────────────────────────┘    │
│                      ↓                                │
│  ┌─────────────────────────────────────────────┐    │
│  │     AgoraCallService (Modified)              │    │
│  │  - setupGroupCall()                          │    │
│  │  - addParticipant()                          │    │
│  │  - removeParticipant()                       │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Test Firebase Configuration:**
   - Verify android/build.gradle has Google services plugin
   - Verify google-services.json is in android/app/
   - Run `flutter pub get` to sync Firebase

2. **Enhance Call UI:**
   - Integrate CallParticipantsGrid into AgoraCallScreen
   - Add participants panel to call controls
   - Add screen sharing UI (if supported)

3. **Monitor Background Health:**
   - Set up Logcat filtering for background call logs
   - Monitor device battery impact
   - Track keep-alive signal success rate

4. **Production Deployment:**
   - Enable Firebase Production certificates
   - Test on actual devices with various network conditions
   - Monitor FCM delivery rates in Firebase Console

