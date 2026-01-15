// lib/widgets/incoming_call_dialog.dart

import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';
import '../services/webrtc_service.dart';
import '../screens/call_screen.dart';

class IncomingCallDialog extends StatefulWidget {
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final String callId;
  final String callToken;
  final bool isAudioOnly;

  const IncomingCallDialog({
    super.key,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    required this.callId,
    required this.callToken,
    this.isAudioOnly = false,
  });

  @override
  State<IncomingCallDialog> createState() => _IncomingCallDialogState();
}

class _IncomingCallDialogState extends State<IncomingCallDialog> {
  final AudioPlayer _audioPlayer = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _playRingingSound();
  }

  @override
  void dispose() {
    _stopRingingSound();
    super.dispose();
  }

  Future<void> _playRingingSound() async {
    try {
      await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      await _audioPlayer.play(AssetSource('sounds/Phone Dial Tone - Sound Effect (HD).mp3'));
    } catch (e) {
      debugPrint('Error playing incoming call sound: $e');
    }
  }

  Future<void> _stopRingingSound() async {
    try {
      await _audioPlayer.stop();
    } catch (e) {
      debugPrint('Error stopping incoming call sound: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.all(Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Caller avatar
            CircleAvatar(
              radius: 50,
              backgroundColor: Colors.black,
              child: Text(
                widget.callerName.isNotEmpty ? widget.callerName[0].toUpperCase() : 'U',
                style: const TextStyle(
                  fontSize: 36,
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Caller name
            Text(
              widget.callerName,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.black,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),

            // Call type
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  widget.isAudioOnly ? Icons.phone : Icons.videocam,
                  size: 20,
                  color: Colors.grey[600],
                ),
                const SizedBox(width: 8),
                Text(
                  widget.isAudioOnly ? 'Incoming audio call' : 'Incoming video call',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),

            // Action buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // Reject button
                Column(
                  children: [
                    GestureDetector(
                      onTap: () async {
                        await _stopRingingSound();
                        await WebRTCService().rejectCall(widget.callerId, widget.callId);
                        Navigator.of(context).pop();
                      },
                      child: Container(
                        width: 60,
                        height: 60,
                        decoration: const BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.call_end,
                          color: Colors.white,
                          size: 30,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Decline',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.black,
                      ),
                    ),
                  ],
                ),

                // Accept button
                Column(
                  children: [
                    GestureDetector(
                      onTap: () async {
                        await _stopRingingSound();
                        Navigator.of(context).pop();
                        await WebRTCService()
                            .acceptCall(widget.callerId, widget.callId, widget.callToken);
                        
                        // Navigate to call screen
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (context) => CallScreen(
                              remoteUserName: widget.callerName,
                            ),
                          ),
                        );
                      },
                      child: Container(
                        width: 60,
                        height: 60,
                        decoration: const BoxDecoration(
                          color: Colors.green,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.call,
                          color: Colors.white,
                          size: 30,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Accept',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.black,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Show incoming call dialog
Future<void> showIncomingCallDialog(
  BuildContext context, {
  required String callerId,
  required String callerName,
  String? callerAvatar,
  required String callId,
  required String callToken,
  bool isAudioOnly = false,
}) async {
  return showDialog(
    context: context,
    barrierDismissible: false,
    builder: (context) => IncomingCallDialog(
      callerId: callerId,
      callerName: callerName,
      callerAvatar: callerAvatar,
      callId: callId,
      callToken: callToken,
      isAudioOnly: isAudioOnly,
    ),
  );
}
