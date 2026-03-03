// lib/examples/agora_integration_example.dart

/// Example: How to integrate Agora calling into your PACT Mobile app
///
/// This file demonstrates how to use the AgoraCallService and AgoraCallScreen
/// for native video and audio calling in your application.
library;

import 'package:flutter/material.dart';
import '../services/agora_call_service.dart';
import '../screens/agora_call_screen.dart';
import '../models/call_state.dart';

/// Example 1: Initialize Agora Service (usually in main.dart or app initialization)
///
/// Call this when your user logs in or during app startup
Future<void> initializeAgoraExample() async {
  final agoraService = AgoraCallService();

  await agoraService.initialize(
    userId: 'user123',
    userName: 'John Doe',
    userAvatar: 'https://example.com/avatar.jpg',
    userEmail: 'john@example.com',
  );

  // Now the service is ready to make/receive calls
  debugPrint('Agora service initialized successfully');
}

/// Example 2: Start an Outgoing Video Call
///
/// Use this to initiate a video call to another user
Future<void> startVideoCallExample(BuildContext context) async {
  final agoraService = AgoraCallService();

  // Start the call (this sends a signal to the remote user via Supabase)
  final result = await agoraService.startCall(
    remoteUserId: 'user456',
    remoteUserName: 'Jane Smith',
    remoteUserAvatar: 'https://example.com/jane-avatar.jpg',
    audioOnly: false, // Video call
  );

  if (result.success && result.channelName != null) {
    // Navigate to the call screen
    if (context.mounted) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => AgoraCallScreen(
            channelName: result.channelName!,
            remoteUserId: 'user456',
            remoteUserName: 'Jane Smith',
            remoteUserAvatar: 'https://example.com/jane-avatar.jpg',
            isAudioOnly: false,
            isOutgoing: true,
          ),
        ),
      );
    }
  } else {
    // Handle error
    debugPrint('Failed to start call: ${result.error}');
  }
}

/// Example 3: Start an Outgoing Audio-Only Call
///
/// Use this to initiate an audio-only call (no video)
Future<void> startAudioCallExample(BuildContext context) async {
  final agoraService = AgoraCallService();

  final result = await agoraService.startCall(
    remoteUserId: 'user456',
    remoteUserName: 'Jane Smith',
    audioOnly: true, // Audio only
  );

  if (result.success && result.channelName != null) {
    if (context.mounted) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => AgoraCallScreen(
            channelName: result.channelName!,
            remoteUserId: 'user456',
            remoteUserName: 'Jane Smith',
            isAudioOnly: true, // Audio-only mode
            isOutgoing: true,
          ),
        ),
      );
    }
  }
}

/// Example 4: Listen for Incoming Calls
///
/// This should be set up in your main app widget or a call manager service
class IncomingCallListenerExample extends StatefulWidget {
  const IncomingCallListenerExample({super.key});

  @override
  State<IncomingCallListenerExample> createState() =>
      _IncomingCallListenerExampleState();
}

class _IncomingCallListenerExampleState
    extends State<IncomingCallListenerExample> {
  final AgoraCallService _agoraService = AgoraCallService();

  @override
  void initState() {
    super.initState();
    _listenForIncomingCalls();
  }

  void _listenForIncomingCalls() {
    _agoraService.incomingCallStream.listen((incomingCall) {
      debugPrint('Incoming call from: ${incomingCall.callerName}');

      // Show incoming call dialog or notification
      _showIncomingCallDialog(incomingCall);
    });
  }

  void _showIncomingCallDialog(AgoraIncomingCall incomingCall) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Text(
          'Incoming ${incomingCall.isAudioOnly ? "Audio" : "Video"} Call',
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (incomingCall.callerAvatar != null)
              CircleAvatar(
                radius: 40,
                backgroundImage: NetworkImage(incomingCall.callerAvatar!),
              ),
            const SizedBox(height: 16),
            Text(
              incomingCall.callerName,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        actions: [
          // Reject button
          TextButton(
            onPressed: () async {
              await _agoraService.rejectCall(incomingCall);
              if (context.mounted) {
                Navigator.pop(context);
              }
            },
            child: const Text('Reject', style: TextStyle(color: Colors.red)),
          ),
          // Accept button
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context); // Close dialog

              // Accept the call
              final result = await _agoraService.acceptCall(incomingCall);

              if (result.success && result.channelName != null) {
                // Navigate to call screen
                if (context.mounted) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => AgoraCallScreen(
                        channelName: result.channelName!,
                        remoteUserId: incomingCall.callerId,
                        remoteUserName: incomingCall.callerName,
                        remoteUserAvatar: incomingCall.callerAvatar,
                        isAudioOnly: incomingCall.isAudioOnly,
                        isOutgoing: false,
                      ),
                    ),
                  );
                }
              }
            },
            child: const Text('Accept'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: Text('Listening for incoming calls...')),
    );
  }
}

/// Example 5: Listen for Call State Changes
///
/// Monitor call status (connecting, connected, ended, etc.)
class CallStateListenerExample extends StatefulWidget {
  const CallStateListenerExample({super.key});

  @override
  State<CallStateListenerExample> createState() =>
      _CallStateListenerExampleState();
}

class _CallStateListenerExampleState extends State<CallStateListenerExample> {
  final AgoraCallService _agoraService = AgoraCallService();
  CallStatus _currentStatus = CallStatus.idle;

  @override
  void initState() {
    super.initState();
    _listenForCallStateChanges();
  }

  void _listenForCallStateChanges() {
    _agoraService.callStateStream.listen((callState) {
      setState(() {
        _currentStatus = callState.status;
      });

      switch (callState.status) {
        case CallStatus.calling:
          debugPrint('Calling ${callState.remoteUserName}...');
          break;
        case CallStatus.ringing:
          debugPrint('${callState.remoteUserName} is answering...');
          break;
        case CallStatus.connected:
          debugPrint('Call connected!');
          break;
        case CallStatus.ended:
          debugPrint('Call ended');
          // Maybe save to call history here
          break;
        case CallStatus.rejected:
          debugPrint('Call was rejected');
          _showSnackBar('Call rejected by ${callState.remoteUserName}');
          break;
        case CallStatus.busy:
          debugPrint('User is busy');
          _showSnackBar('${callState.remoteUserName} is busy');
          break;
        case CallStatus.failed:
          debugPrint('Call failed');
          _showSnackBar('Call failed');
          break;
        default:
          break;
      }
    });
  }

  void _showSnackBar(String message) {
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Current Call Status: ${_currentStatus.name}'),
            const SizedBox(height: 20),
            if (_currentStatus == CallStatus.idle)
              ElevatedButton(
                onPressed: () => startVideoCallExample(context),
                child: const Text('Start Video Call'),
              ),
          ],
        ),
      ),
    );
  }
}

/// Example 6: Integration with Call History Service
///
/// Save call details to history after call ends
class CallHistoryIntegrationExample {
  final AgoraCallService _agoraService = AgoraCallService();

  void setupCallHistoryTracking() {
    DateTime? callStartTime;
    String? remoteUserId;
    String? remoteUserName;
    bool isVideoCall = false;
    bool isOutgoing = false;

    _agoraService.callStateStream.listen((callState) {
      switch (callState.status) {
        case CallStatus.calling:
          // Outgoing call started
          callStartTime = DateTime.now();
          remoteUserId = callState.remoteUserId;
          remoteUserName = callState.remoteUserName;
          isVideoCall = callState.isVideoEnabled;
          isOutgoing = true;
          break;

        case CallStatus.ringing:
          // Incoming call accepted or outgoing call ringing
          if (callStartTime == null) {
            callStartTime = DateTime.now();
            remoteUserId = callState.remoteUserId;
            remoteUserName = callState.remoteUserName;
            isVideoCall = callState.isVideoEnabled;
            isOutgoing = false;
          }
          break;

        case CallStatus.ended:
        case CallStatus.rejected:
        case CallStatus.busy:
        case CallStatus.failed:
          // Call ended - save to history
          if (callStartTime != null && remoteUserId != null) {
            final duration = DateTime.now().difference(callStartTime!);

            // Here you would integrate with your CallHistoryService
            debugPrint('''
              Saving call to history:
              - Remote User: $remoteUserName
              - Duration: ${duration.inSeconds}s
              - Video Call: $isVideoCall
              - Outgoing: $isOutgoing
              - Status: ${callState.status.name}
            ''');

            // Reset tracking variables
            callStartTime = null;
            remoteUserId = null;
            remoteUserName = null;
          }
          break;

        default:
          break;
      }
    });
  }
}

/// Example 7: Quick Action Button for Calling
///
/// A reusable button widget to start calls
class QuickCallButton extends StatelessWidget {
  final String remoteUserId;
  final String remoteUserName;
  final String? remoteUserAvatar;
  final bool audioOnly;

  const QuickCallButton({
    super.key,
    required this.remoteUserId,
    required this.remoteUserName,
    this.remoteUserAvatar,
    this.audioOnly = false,
  });

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(audioOnly ? Icons.phone : Icons.videocam),
      color: audioOnly ? Colors.green : Colors.blue,
      tooltip: audioOnly ? 'Audio Call' : 'Video Call',
      onPressed: () => _startCall(context),
    );
  }

  Future<void> _startCall(BuildContext context) async {
    final agoraService = AgoraCallService();

    final result = await agoraService.startCall(
      remoteUserId: remoteUserId,
      remoteUserName: remoteUserName,
      remoteUserAvatar: remoteUserAvatar,
      audioOnly: audioOnly,
    );

    if (result.success && result.channelName != null && context.mounted) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => AgoraCallScreen(
            channelName: result.channelName!,
            remoteUserId: remoteUserId,
            remoteUserName: remoteUserName,
            remoteUserAvatar: remoteUserAvatar,
            isAudioOnly: audioOnly,
            isOutgoing: true,
          ),
        ),
      );
    } else if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Failed to start call: ${result.error ?? "Unknown error"}',
          ),
        ),
      );
    }
  }
}

/// Example 8: Complete User Profile with Call Buttons
///
/// Shows how to integrate call buttons in a user profile screen
class UserProfileWithCallExample extends StatelessWidget {
  final String userId;
  final String userName;
  final String? userAvatar;

  const UserProfileWithCallExample({
    super.key,
    required this.userId,
    required this.userName,
    this.userAvatar,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(userName)),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // User avatar
            CircleAvatar(
              radius: 60,
              backgroundImage: userAvatar != null
                  ? NetworkImage(userAvatar!)
                  : null,
              child: userAvatar == null
                  ? Text(
                      userName[0].toUpperCase(),
                      style: const TextStyle(fontSize: 40),
                    )
                  : null,
            ),
            const SizedBox(height: 20),

            // User name
            Text(
              userName,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 40),

            // Call buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Video call button
                QuickCallButton(
                  remoteUserId: userId,
                  remoteUserName: userName,
                  remoteUserAvatar: userAvatar,
                  audioOnly: false,
                ),
                const SizedBox(width: 20),

                // Audio call button
                QuickCallButton(
                  remoteUserId: userId,
                  remoteUserName: userName,
                  remoteUserAvatar: userAvatar,
                  audioOnly: true,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
