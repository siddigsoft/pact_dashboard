// lib/widgets/agora_incoming_call_dialog.dart

import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:vibration/vibration.dart';
import '../services/agora_call_service.dart';
import '../screens/agora_call_screen.dart';
import '../theme/app_colors.dart';

/// Incoming Agora call dialog - Accept/Reject with navigation to AgoraCallScreen
class AgoraIncomingCallDialog extends StatefulWidget {
  final AgoraIncomingCall incomingCall;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;

  const AgoraIncomingCallDialog({
    super.key,
    required this.incomingCall,
    this.onAccept,
    this.onReject,
  });

  @override
  State<AgoraIncomingCallDialog> createState() =>
      _AgoraIncomingCallDialogState();
}

class _AgoraIncomingCallDialogState extends State<AgoraIncomingCallDialog>
    with SingleTickerProviderStateMixin {
  final AudioPlayer _audioPlayer = AudioPlayer();
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  final AgoraCallService _agoraService = AgoraCallService();

  @override
  void initState() {
    super.initState();
    _initAnimation();
    _playRingingSound();
    _startVibration();
  }

  void _initAnimation() {
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.1).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  Future<void> _playRingingSound() async {
    try {
      await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      await _audioPlayer.play(
        AssetSource('sounds/Phone Dial Tone - Sound Effect (HD).mp3'),
      );
    } catch (e) {
      debugPrint('[AgoraIncomingCall] Error playing ring: $e');
    }
  }

  Future<void> _startVibration() async {
    if (await Vibration.hasVibrator() ?? false) {
      Vibration.vibrate(pattern: [0, 500, 200, 500], repeat: 0);
    }
  }

  Future<void> _stopEffects() async {
    try {
      await _audioPlayer.stop();
      Vibration.cancel();
    } catch (e) {
      debugPrint('[AgoraIncomingCall] Error stopping effects: $e');
    }
  }

  @override
  void dispose() {
    _stopEffects();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFF1a1a2e),
              AppColors.primary.withOpacity(0.3),
            ],
          ),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withOpacity(0.3),
              blurRadius: 20,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Agora badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.green.withOpacity(0.2),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.green.withOpacity(0.5)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    widget.incomingCall.isAudioOnly
                        ? Icons.phone
                        : Icons.video_camera_front,
                    color: Colors.green,
                    size: 14,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    widget.incomingCall.isAudioOnly
                        ? 'Agora Audio Call'
                        : 'Agora Video Call',
                    style: const TextStyle(
                      color: Colors.green,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // Caller avatar with pulse
            ScaleTransition(
              scale: _pulseAnimation,
              child: Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [
                      AppColors.primary.withOpacity(0.5),
                      AppColors.primary.withOpacity(0.3),
                    ],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withOpacity(0.4),
                      blurRadius: 20,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Center(
                  child: widget.incomingCall.callerAvatar != null
                      ? ClipOval(
                          child: Image.network(
                            widget.incomingCall.callerAvatar!,
                            width: 90,
                            height: 90,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => _buildAvatarFallback(),
                          ),
                        )
                      : _buildAvatarFallback(),
                ),
              ),
            ),

            const SizedBox(height: 16),

            Text(
              widget.incomingCall.callerName,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),

            const SizedBox(height: 8),

            Text(
              widget.incomingCall.isAudioOnly
                  ? 'Incoming audio call...'
                  : 'Incoming video call...',
              style: TextStyle(
                color: Colors.white.withOpacity(0.7),
                fontSize: 14,
              ),
            ),

            const SizedBox(height: 24),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildCallButton(
                  icon: Icons.call_end,
                  color: Colors.red,
                  onPressed: () async {
                    _stopEffects();
                    widget.onReject?.call();
                    await _agoraService.rejectCall(widget.incomingCall);
                    if (mounted) Navigator.of(context).pop();
                  },
                  label: 'Decline',
                ),
                _buildCallButton(
                  icon: widget.incomingCall.isAudioOnly
                      ? Icons.phone
                      : Icons.videocam,
                  color: Colors.green,
                  onPressed: () async {
                    _stopEffects();
                    widget.onAccept?.call();
                    final navigator = Navigator.of(context);

                    final result = await _agoraService.acceptCall(
                      widget.incomingCall,
                    );

                    if (!mounted) return;
                    navigator.pop();

                    if (result.success &&
                        result.channelName != null &&
                        mounted) {
                      if (mounted) {
                        navigator.push(
                          MaterialPageRoute(
                            builder: (context) => AgoraCallScreen(
                              channelName: result.channelName!,
                              remoteUserId: widget.incomingCall.callerId,
                              remoteUserName: widget.incomingCall.callerName,
                              remoteUserAvatar:
                                  widget.incomingCall.callerAvatar,
                              isAudioOnly: widget.incomingCall.isAudioOnly,
                              isOutgoing: false,
                            ),
                          ),
                        );
                      }
                    } else if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            result.error ?? 'Failed to join call',
                          ),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                  },
                  label: 'Accept',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatarFallback() {
    final initials = widget.incomingCall.callerName
        .split(' ')
        .take(2)
        .map((e) => e.isNotEmpty ? e[0].toUpperCase() : '')
        .join();

    return Container(
      width: 90,
      height: 90,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.primary.withOpacity(0.3),
      ),
      child: Center(
        child: Text(
          initials.isNotEmpty ? initials : 'U',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 36,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildCallButton({
    required IconData icon,
    required Color color,
    required VoidCallback onPressed,
    required String label,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: color,
          shape: const CircleBorder(),
          elevation: 4,
          child: InkWell(
            onTap: onPressed,
            customBorder: const CircleBorder(),
            child: Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(shape: BoxShape.circle),
              child: Icon(icon, color: Colors.white, size: 28),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 12),
        ),
      ],
    );
  }
}

/// Show Agora incoming call dialog
Future<void> showAgoraIncomingCallDialog(
  BuildContext context, {
  required AgoraIncomingCall incomingCall,
}) async {
  debugPrint('[AgoraIncomingCallDialog] showAgoraIncomingCallDialog() called');
  debugPrint('[AgoraIncomingCallDialog] Context: ${context.hashCode}');
  debugPrint('[AgoraIncomingCallDialog] From: ${incomingCall.callerName}');
  debugPrint('[AgoraIncomingCallDialog] CallId: ${incomingCall.callId}');
  
  try {
    return showDialog(
      context: context,
      barrierDismissible: false,
      useRootNavigator: true, // Use root navigator to ensure dialog shows above all routes
      builder: (context) {
        debugPrint('[AgoraIncomingCallDialog] Builder called, creating dialog');
        return AgoraIncomingCallDialog(
          incomingCall: incomingCall,
        );
      },
    );
  } catch (e, st) {
    debugPrint('[AgoraIncomingCallDialog] ERROR in showDialog: $e');
    debugPrint('[AgoraIncomingCallDialog] StackTrace: $st');
    rethrow;
  }
}
