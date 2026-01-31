// lib/widgets/jitsi_incoming_call_dialog.dart

import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:vibration/vibration.dart';
import '../services/jitsi_meet_service.dart';
import '../theme/app_colors.dart';

class JitsiIncomingCallDialog extends StatefulWidget {
  final JitsiIncomingCall incomingCall;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const JitsiIncomingCallDialog({
    super.key,
    required this.incomingCall,
    required this.onAccept,
    required this.onReject,
  });

  @override
  State<JitsiIncomingCallDialog> createState() => _JitsiIncomingCallDialogState();
}

class _JitsiIncomingCallDialogState extends State<JitsiIncomingCallDialog>
    with SingleTickerProviderStateMixin {
  final AudioPlayer _audioPlayer = AudioPlayer();
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

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
      await _audioPlayer.play(AssetSource('sounds/Phone Dial Tone - Sound Effect (HD).mp3'));
    } catch (e) {
      debugPrint('[JitsiIncomingCall] Error playing ring: $e');
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
      debugPrint('[JitsiIncomingCall] Error stopping effects: $e');
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
            // Jitsi badge
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
                        ? 'Jitsi Audio Call' 
                        : 'Jitsi Video Call',
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
            
            // Caller avatar with pulse animation
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
            
            // Caller name
            Text(
              widget.incomingCall.callerName,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
            
            const SizedBox(height: 8),
            
            // Call type indicator
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
            
            // Accept/Reject buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // Reject button
                _buildCallButton(
                  icon: Icons.call_end,
                  color: Colors.red,
                  onPressed: () {
                    _stopEffects();
                    widget.onReject();
                  },
                  label: 'Decline',
                ),
                
                // Accept button
                _buildCallButton(
                  icon: widget.incomingCall.isAudioOnly 
                      ? Icons.phone 
                      : Icons.videocam,
                  color: Colors.green,
                  onPressed: () {
                    _stopEffects();
                    widget.onAccept();
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
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                color: Colors.white,
                size: 28,
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}
