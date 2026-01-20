// lib/screens/call_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/webrtc_service.dart';
import '../models/call_state.dart';
import '../theme/app_colors.dart';
import 'dart:async';

class CallScreen extends StatefulWidget {
  final String? remoteUserName;
  final String? remoteUserAvatar;

  const CallScreen({
    super.key,
    this.remoteUserName,
    this.remoteUserAvatar,
  });

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> with TickerProviderStateMixin {
  final WebRTCService _webrtcService = WebRTCService();
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();

  StreamSubscription<CallState>? _callStateSubscription;
  StreamSubscription<MediaStream?>? _localStreamSubscription;
  StreamSubscription<MediaStream?>? _remoteStreamSubscription;

  CallState _callState = CallState();
  Duration _callDuration = Duration.zero;
  Timer? _durationTimer;

  // Animation controllers
  late AnimationController _pulseController;
  late AnimationController _waveController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _initRenderers();
    _subscribeToStreams();
    _initAnimations();
    
    // Set status bar style for call screen
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
    );
  }

  void _initAnimations() {
    // Pulse animation for avatar
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // Wave animation for ripple effect
    _waveController = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _durationTimer?.cancel();
    _callStateSubscription?.cancel();
    _localStreamSubscription?.cancel();
    _remoteStreamSubscription?.cancel();
    _localRenderer.dispose();
    _remoteRenderer.dispose();
    _pulseController.dispose();
    _waveController.dispose();
    super.dispose();
  }

  Future<void> _initRenderers() async {
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();
  }

  void _subscribeToStreams() {
    _callStateSubscription = _webrtcService.callStateStream.listen((state) {
      setState(() {
        _callState = state;
      });

      if (state.status == CallStatus.connected && _durationTimer == null) {
        _startDurationTimer();
        HapticFeedback.mediumImpact();
      } else if (!state.isInCall) {
        _durationTimer?.cancel();
        _durationTimer = null;
        Navigator.of(context).pop();
      }
    });

    _localStreamSubscription = _webrtcService.localStreamStream.listen((stream) {
      if (stream != null) {
        _localRenderer.srcObject = stream;
      }
    });

    _remoteStreamSubscription =
        _webrtcService.remoteStreamStream.listen((stream) {
      if (stream != null) {
        _remoteRenderer.srcObject = stream;
      }
    });
  }

  void _startDurationTimer() {
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() {
        _callDuration = Duration(seconds: _callDuration.inSeconds + 1);
      });
    });
  }

  String _formatDuration() {
    final hours = _callDuration.inHours;
    final minutes = _callDuration.inMinutes.remainder(60);
    final seconds = _callDuration.inSeconds.remainder(60);

    if (hours > 0) {
      return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    }
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  String _getStatusText() {
    switch (_callState.status) {
      case CallStatus.calling:
        return 'Calling';
      case CallStatus.ringing:
        return 'Ringing';
      case CallStatus.connected:
        return _formatDuration();
      case CallStatus.busy:
        return 'User is busy';
      case CallStatus.rejected:
        return 'Call declined';
      case CallStatus.ended:
        return 'Call ended';
      default:
        return '';
    }
  }

  Color _getStatusColor() {
    switch (_callState.status) {
      case CallStatus.connected:
        return AppColors.primaryGreen;
      case CallStatus.busy:
      case CallStatus.rejected:
        return Colors.orange;
      default:
        return Colors.white70;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isVideoEnabled = !_callState.isAudioOnly && _callState.isVideoEnabled;
    final isDialing = _callState.status == CallStatus.calling || 
                      _callState.status == CallStatus.ringing;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: isDialing
                ? [
                    const Color(0xFF1a1a2e),
                    const Color(0xFF16213e),
                    const Color(0xFF0f3460),
                  ]
                : [
                    Colors.black,
                    Colors.grey[900]!,
                  ],
          ),
        ),
        child: SafeArea(
          child: Stack(
            children: [
              // Remote video (full screen) - only when connected
              if (isVideoEnabled && _callState.status == CallStatus.connected)
                Positioned.fill(
                  child: RTCVideoView(
                    _remoteRenderer,
                    objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                  ),
                ),

              // Dialing/Calling UI
              if (isDialing || !isVideoEnabled)
                Positioned.fill(
                  child: _buildDialingUI(),
                ),

              // Local video (picture-in-picture)
              if (isVideoEnabled && _callState.status == CallStatus.connected)
                Positioned(
                  top: 20,
                  right: 20,
                  width: 120,
                  height: 160,
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.3),
                          blurRadius: 10,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: RTCVideoView(
                        _localRenderer,
                        mirror: true,
                        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                      ),
                    ),
                  ),
                ),

              // Call controls
              Positioned(
                bottom: 50,
                left: 0,
                right: 0,
                child: _buildCallControls(),
              ),

              // Back button (when dialing)
              if (isDialing)
                Positioned(
                  top: 10,
                  left: 10,
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back_ios, color: Colors.white),
                    onPressed: () async {
                      await _webrtcService.endCall();
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDialingUI() {
    final userName = _callState.remoteUserName ?? widget.remoteUserName ?? 'Unknown';
    final userInitial = userName.isNotEmpty ? userName[0].toUpperCase() : 'U';
    final isDialing = _callState.status == CallStatus.calling || 
                      _callState.status == CallStatus.ringing;

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Spacer(flex: 2),

        // Animated avatar with ripple waves
        Stack(
          alignment: Alignment.center,
          children: [
            // Ripple waves (only when dialing)
            if (isDialing) ...[
              AnimatedBuilder(
                animation: _waveController,
                builder: (context, child) {
                  return CustomPaint(
                    size: const Size(200, 200),
                    painter: RipplePainter(
                      animation: _waveController.value,
                      color: AppColors.primaryBlue.withOpacity(0.3),
                    ),
                  );
                },
              ),
            ],

            // Pulsing avatar
            AnimatedBuilder(
              animation: _pulseAnimation,
              builder: (context, child) {
                return Transform.scale(
                  scale: isDialing ? _pulseAnimation.value : 1.0,
                  child: Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          AppColors.primaryBlue,
                          AppColors.primaryBlue.withOpacity(0.7),
                        ],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primaryBlue.withOpacity(0.4),
                          blurRadius: 20,
                          spreadRadius: 5,
                        ),
                      ],
                    ),
                    child: widget.remoteUserAvatar != null
                        ? ClipOval(
                            child: Image.network(
                              widget.remoteUserAvatar!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Center(
                                child: Text(
                                  userInitial,
                                  style: const TextStyle(
                                    fontSize: 48,
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ),
                          )
                        : Center(
                            child: Text(
                              userInitial,
                              style: const TextStyle(
                                fontSize: 48,
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                  ),
                );
              },
            ),
          ],
        ),

        const SizedBox(height: 30),

        // User name
        Text(
          userName,
          style: const TextStyle(
            fontSize: 28,
            color: Colors.white,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),

        const SizedBox(height: 12),

        // Status with animated dots
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_callState.status == CallStatus.connected)
              Container(
                width: 10,
                height: 10,
                margin: const EdgeInsets.only(right: 8),
                decoration: const BoxDecoration(
                  color: AppColors.primaryGreen,
                  shape: BoxShape.circle,
                ),
              ),
            Text(
              _getStatusText(),
              style: TextStyle(
                fontSize: 16,
                color: _getStatusColor(),
                fontWeight: FontWeight.w500,
              ),
            ),
            if (isDialing) _buildAnimatedDots(),
          ],
        ),

        // Call quality indicator (when connected)
        if (_callState.status == CallStatus.connected) ...[
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _callState.isAudioOnly ? Icons.phone_in_talk : Icons.videocam,
                  color: AppColors.primaryGreen,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(
                  _callState.isAudioOnly ? 'Voice Call' : 'Video Call',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],

        const Spacer(flex: 3),
      ],
    );
  }

  Widget _buildAnimatedDots() {
    return StreamBuilder(
      stream: Stream.periodic(const Duration(milliseconds: 500)),
      builder: (context, snapshot) {
        final dotCount = (DateTime.now().millisecondsSinceEpoch ~/ 500) % 4;
        return SizedBox(
          width: 24,
          child: Text(
            '.' * dotCount,
            style: TextStyle(
              fontSize: 16,
              color: _getStatusColor(),
              fontWeight: FontWeight.bold,
            ),
          ),
        );
      },
    );
  }

  Widget _buildCallControls() {
    final isConnected = _callState.status == CallStatus.connected;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Speaker toggle (only when connected)
          if (isConnected)
            _buildCallControl(
              icon: _callState.isSpeakerOn ? Icons.volume_up : Icons.volume_down,
              label: 'Speaker',
              onPressed: () {
                _webrtcService.toggleSpeaker();
              },
              isActive: _callState.isSpeakerOn,
            ),

          // Toggle video (only for video calls when connected)
          if (!_callState.isAudioOnly && isConnected)
            _buildCallControl(
              icon: _callState.isVideoEnabled ? Icons.videocam : Icons.videocam_off,
              label: 'Camera',
              onPressed: () async {
                await _webrtcService.toggleVideo();
              },
              isActive: _callState.isVideoEnabled,
            ),

          // Toggle mute
          _buildCallControl(
            icon: _callState.isMuted ? Icons.mic_off : Icons.mic,
            label: _callState.isMuted ? 'Unmute' : 'Mute',
            onPressed: () {
              _webrtcService.toggleMute();
              HapticFeedback.lightImpact();
            },
            isActive: !_callState.isMuted,
            showWarning: _callState.isMuted,
          ),

          // End call
          _buildEndCallButton(),
        ],
      ),
    );
  }

  Widget _buildCallControl({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
    bool isActive = true,
    bool showWarning = false,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onPressed,
          child: Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: showWarning
                  ? Colors.orange.withOpacity(0.3)
                  : (isActive
                      ? Colors.white.withOpacity(0.15)
                      : Colors.white.withOpacity(0.1)),
              shape: BoxShape.circle,
              border: Border.all(
                color: showWarning
                    ? Colors.orange
                    : Colors.white.withOpacity(0.3),
                width: 1.5,
              ),
            ),
            child: Icon(
              icon,
              color: showWarning ? Colors.orange : Colors.white,
              size: 26,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withOpacity(0.7),
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildEndCallButton() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: () async {
            HapticFeedback.heavyImpact();
            await _webrtcService.endCall();
          },
          child: Container(
            width: 70,
            height: 70,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFFFF5252),
                  Color(0xFFD32F2F),
                ],
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.red.withOpacity(0.4),
                  blurRadius: 15,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: const Icon(
              Icons.call_end,
              color: Colors.white,
              size: 32,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'End',
          style: TextStyle(
            color: Colors.white.withOpacity(0.7),
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

// Custom painter for ripple wave effect
class RipplePainter extends CustomPainter {
  final double animation;
  final Color color;

  RipplePainter({required this.animation, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final maxRadius = size.width / 2;

    for (int i = 0; i < 3; i++) {
      final progress = (animation + i * 0.33) % 1.0;
      final radius = maxRadius * (0.5 + progress * 0.5);
      final opacity = (1.0 - progress) * 0.6;

      final paint = Paint()
        ..color = color.withOpacity(opacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2;

      canvas.drawCircle(center, radius, paint);
    }
  }

  @override
  bool shouldRepaint(RipplePainter oldDelegate) {
    return oldDelegate.animation != animation;
  }
}
