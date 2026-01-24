import 'dart:ui';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/webrtc_service.dart';
import '../models/call_state.dart';
import '../theme/app_colors.dart';
import 'dart:async';

class CallScreen extends StatefulWidget {
  final String? remoteUserName;
  final String? remoteUserAvatar;
  final String? remoteUserRole;

  const CallScreen({
    super.key,
    this.remoteUserName,
    this.remoteUserAvatar,
    this.remoteUserRole,
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

  late AnimationController _pulseController;
  late AnimationController _waveController;
  late AnimationController _particleController;
  late AnimationController _glowController;
  late Animation<double> _pulseAnimation;
  late Animation<double> _glowAnimation;

  Offset _pipPosition = const Offset(20, 100);
  bool _isDraggingPip = false;
  int _connectionQuality = 3;

  @override
  void initState() {
    super.initState();
    _initRenderers();
    _subscribeToStreams();
    _initAnimations();
    
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
    );
  }

  void _initAnimations() {
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _waveController = AnimationController(
      duration: const Duration(milliseconds: 2500),
      vsync: this,
    )..repeat();

    _particleController = AnimationController(
      duration: const Duration(seconds: 10),
      vsync: this,
    )..repeat();

    _glowController = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    )..repeat(reverse: true);

    _glowAnimation = Tween<double>(begin: 0.2, end: 0.6).animate(
      CurvedAnimation(parent: _glowController, curve: Curves.easeInOut),
    );
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
    _particleController.dispose();
    _glowController.dispose();
    super.dispose();
  }

  Future<void> _initRenderers() async {
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();
  }

  void _subscribeToStreams() {
    _callStateSubscription = _webrtcService.callStateStream.listen((state) {
      if (!mounted) return;
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
      if (!mounted) return;
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
    final isConnected = _callState.status == CallStatus.connected;

    return Scaffold(
      body: Stack(
        children: [
          _buildBackground(isDialing, isConnected),
          if (isVideoEnabled && isConnected)
            Positioned.fill(
              child: RTCVideoView(
                _remoteRenderer,
                objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              ),
            ),
          if (isDialing || !isVideoEnabled)
            Positioned.fill(
              child: _buildDialingUI(),
            ),
          if (isVideoEnabled && isConnected)
            _buildDraggablePip(),
          if (isConnected)
            Positioned(
              top: MediaQuery.of(context).padding.top + 20,
              left: 0,
              right: 0,
              child: _buildTopBar(),
            ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _buildCallControls(isConnected, isVideoEnabled),
          ),
          if (isDialing)
            Positioned(
              top: MediaQuery.of(context).padding.top + 10,
              left: 10,
              child: _buildBackButton(),
            ),
        ],
      ),
    );
  }

  Widget _buildBackground(bool isDialing, bool isConnected) {
    return AnimatedBuilder(
      animation: _particleController,
      builder: (context, child) {
        return Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: isDialing
                  ? [
                      const Color(0xFF0D1B2A),
                      const Color(0xFF1B263B),
                      const Color(0xFF415A77),
                    ]
                  : isConnected
                      ? [
                          Colors.black,
                          Colors.grey[900]!,
                        ]
                      : [
                          const Color(0xFF1a1a2e),
                          const Color(0xFF16213e),
                        ],
            ),
          ),
          child: isDialing
              ? CustomPaint(
                  size: Size.infinite,
                  painter: ParticlePainter(
                    animation: _particleController.value,
                    particleColor: AppColors.primaryBlue.withOpacity(0.3),
                  ),
                )
              : null,
        );
      },
    );
  }

  Widget _buildBackButton() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(30),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.1),
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
              color: Colors.white.withOpacity(0.2),
            ),
          ),
          child: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white, size: 20),
            onPressed: () async {
              await _webrtcService.endCall();
            },
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.3),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: Colors.white.withOpacity(0.1),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.primaryGreen.withOpacity(0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.security,
                      color: AppColors.primaryGreen,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'End-to-end encrypted',
                          style: GoogleFonts.poppins(
                            color: Colors.white70,
                            fontSize: 12,
                          ),
                        ),
                        Text(
                          _formatDuration(),
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _buildConnectionQualityIndicator(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildConnectionQualityIndicator() {
    return Row(
      children: List.generate(4, (index) {
        final isActive = index < _connectionQuality;
        return Container(
          width: 4,
          height: 6 + (index * 4).toDouble(),
          margin: const EdgeInsets.only(left: 2),
          decoration: BoxDecoration(
            color: isActive 
                ? (_connectionQuality >= 3 ? AppColors.primaryGreen : Colors.orange)
                : Colors.white24,
            borderRadius: BorderRadius.circular(2),
          ),
        );
      }),
    );
  }

  Widget _buildDraggablePip() {
    return Positioned(
      left: _pipPosition.dx,
      top: _pipPosition.dy,
      child: GestureDetector(
        onPanStart: (_) => setState(() => _isDraggingPip = true),
        onPanUpdate: (details) {
          setState(() {
            _pipPosition = Offset(
              (_pipPosition.dx + details.delta.dx).clamp(0, MediaQuery.of(context).size.width - 140),
              (_pipPosition.dy + details.delta.dy).clamp(0, MediaQuery.of(context).size.height - 200),
            );
          });
        },
        onPanEnd: (_) => setState(() => _isDraggingPip = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: 130,
          height: 180,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(_isDraggingPip ? 0.5 : 0.3),
                blurRadius: _isDraggingPip ? 20 : 15,
                spreadRadius: _isDraggingPip ? 4 : 2,
              ),
            ],
            border: Border.all(
              color: Colors.white.withOpacity(_isDraggingPip ? 0.4 : 0.2),
              width: 2,
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Stack(
              children: [
                RTCVideoView(
                  _localRenderer,
                  mirror: true,
                  objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                ),
                Positioned(
                  bottom: 8,
                  left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'You',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ],
            ),
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
        Stack(
          alignment: Alignment.center,
          children: [
            if (isDialing)
              AnimatedBuilder(
                animation: _waveController,
                builder: (context, child) {
                  return CustomPaint(
                    size: const Size(280, 280),
                    painter: EnhancedRipplePainter(
                      animation: _waveController.value,
                      color: AppColors.primaryBlue,
                    ),
                  );
                },
              ),
            AnimatedBuilder(
              animation: _glowAnimation,
              builder: (context, child) {
                return Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primaryBlue.withOpacity(_glowAnimation.value),
                        blurRadius: 50,
                        spreadRadius: 15,
                      ),
                    ],
                  ),
                );
              },
            ),
            AnimatedBuilder(
              animation: _pulseAnimation,
              builder: (context, child) {
                return Transform.scale(
                  scale: isDialing ? _pulseAnimation.value : 1.0,
                  child: Container(
                    width: 140,
                    height: 140,
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
                      border: Border.all(
                        color: Colors.white.withOpacity(0.3),
                        width: 3,
                      ),
                    ),
                    child: widget.remoteUserAvatar != null
                        ? ClipOval(
                            child: Image.network(
                              widget.remoteUserAvatar!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Center(
                                child: Text(
                                  userInitial,
                                  style: GoogleFonts.poppins(
                                    fontSize: 56,
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
                              style: GoogleFonts.poppins(
                                fontSize: 56,
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
        const SizedBox(height: 40),
        Text(
          userName,
          style: GoogleFonts.poppins(
            fontSize: 32,
            color: Colors.white,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
        if (widget.remoteUserRole != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              widget.remoteUserRole!,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.white70,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_callState.status == CallStatus.connected)
              Container(
                width: 10,
                height: 10,
                margin: const EdgeInsets.only(right: 10),
                decoration: BoxDecoration(
                  color: AppColors.primaryGreen,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primaryGreen.withOpacity(0.5),
                      blurRadius: 8,
                      spreadRadius: 2,
                    ),
                  ],
                ),
              ),
            Text(
              _getStatusText(),
              style: GoogleFonts.poppins(
                fontSize: 18,
                color: _getStatusColor(),
                fontWeight: FontWeight.w500,
              ),
            ),
            if (isDialing) _buildAnimatedDots(),
          ],
        ),
        if (_callState.status == CallStatus.connected) ...[
          const SizedBox(height: 24),
          _buildCallInfoChip(),
        ],
        const Spacer(flex: 3),
      ],
    );
  }

  Widget _buildCallInfoChip() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(25),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.1),
            borderRadius: BorderRadius.circular(25),
            border: Border.all(
              color: Colors.white.withOpacity(0.2),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                _callState.isAudioOnly ? Icons.phone_in_talk_rounded : Icons.videocam_rounded,
                color: AppColors.primaryGreen,
                size: 20,
              ),
              const SizedBox(width: 10),
              Text(
                _callState.isAudioOnly ? 'Voice Call' : 'Video Call',
                style: GoogleFonts.poppins(
                  color: Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 16),
              Container(
                width: 1,
                height: 16,
                color: Colors.white24,
              ),
              const SizedBox(width: 16),
              const Icon(
                Icons.security,
                color: AppColors.primaryGreen,
                size: 16,
              ),
              const SizedBox(width: 6),
              Text(
                'Encrypted',
                style: GoogleFonts.poppins(
                  color: Colors.white54,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAnimatedDots() {
    return StreamBuilder(
      stream: Stream.periodic(const Duration(milliseconds: 500)),
      builder: (context, snapshot) {
        final dotCount = (DateTime.now().millisecondsSinceEpoch ~/ 500) % 4;
        return SizedBox(
          width: 30,
          child: Text(
            '.' * dotCount,
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: _getStatusColor(),
              fontWeight: FontWeight.bold,
            ),
          ),
        );
      },
    );
  }

  Widget _buildCallControls(bool isConnected, bool isVideoEnabled) {
    return SafeArea(
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 30),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withOpacity(0.3),
                  Colors.black.withOpacity(0.5),
                ],
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
              border: Border(
                top: BorderSide(
                  color: Colors.white.withOpacity(0.1),
                  width: 1,
                ),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                if (isConnected)
                  _buildControlButton(
                    icon: _callState.isSpeakerOn ? Icons.volume_up_rounded : Icons.volume_off_rounded,
                    label: 'Speaker',
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      _webrtcService.toggleSpeaker();
                    },
                    isActive: _callState.isSpeakerOn,
                  ),
                if (!_callState.isAudioOnly && isConnected)
                  _buildControlButton(
                    icon: _callState.isVideoEnabled ? Icons.videocam_rounded : Icons.videocam_off_rounded,
                    label: 'Camera',
                    onPressed: () async {
                      HapticFeedback.lightImpact();
                      await _webrtcService.toggleVideo();
                    },
                    isActive: _callState.isVideoEnabled,
                  ),
                _buildControlButton(
                  icon: _callState.isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                  label: _callState.isMuted ? 'Unmute' : 'Mute',
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    _webrtcService.toggleMute();
                  },
                  isActive: !_callState.isMuted,
                  isWarning: _callState.isMuted,
                ),
                _buildEndCallButton(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
    bool isActive = true,
    bool isWarning = false,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onPressed,
          child: Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              gradient: isWarning
                  ? LinearGradient(
                      colors: [
                        Colors.orange.withOpacity(0.3),
                        Colors.orange.withOpacity(0.2),
                      ],
                    )
                  : null,
              color: isWarning ? null : Colors.white.withOpacity(isActive ? 0.15 : 0.08),
              shape: BoxShape.circle,
              border: Border.all(
                color: isWarning ? Colors.orange : Colors.white.withOpacity(0.2),
                width: 1.5,
              ),
            ),
            child: Icon(
              icon,
              color: isWarning ? Colors.orange : Colors.white,
              size: 26,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          label,
          style: GoogleFonts.poppins(
            color: Colors.white60,
            fontSize: 12,
            fontWeight: FontWeight.w500,
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
            width: 72,
            height: 72,
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
                  blurRadius: 20,
                  spreadRadius: 2,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: const Icon(
              Icons.call_end_rounded,
              color: Colors.white,
              size: 32,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'End',
          style: GoogleFonts.poppins(
            color: Colors.white60,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class EnhancedRipplePainter extends CustomPainter {
  final double animation;
  final Color color;

  EnhancedRipplePainter({required this.animation, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);

    for (int i = 0; i < 4; i++) {
      final progress = ((animation + (i * 0.25)) % 1.0);
      final radius = 50 + (progress * 90);
      final opacity = (1 - progress) * 0.5;

      final paint = Paint()
        ..color = color.withOpacity(opacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3 - (2 * progress);

      canvas.drawCircle(center, radius, paint);
    }
  }

  @override
  bool shouldRepaint(EnhancedRipplePainter oldDelegate) {
    return oldDelegate.animation != animation;
  }
}

class ParticlePainter extends CustomPainter {
  final double animation;
  final Color particleColor;

  ParticlePainter({required this.animation, required this.particleColor});

  @override
  void paint(Canvas canvas, Size size) {
    final random = math.Random(42);
    final paint = Paint()..style = PaintingStyle.fill;

    for (int i = 0; i < 30; i++) {
      final baseX = random.nextDouble() * size.width;
      final baseY = random.nextDouble() * size.height;
      final particleSize = 1 + random.nextDouble() * 3;
      final speed = 0.5 + random.nextDouble() * 1.5;

      final y = (baseY + animation * speed * size.height * 0.3) % size.height;
      final opacity = 0.3 + (math.sin((animation + i / 30) * math.pi * 2) * 0.3);

      paint.color = particleColor.withOpacity(opacity.clamp(0.0, 1.0));
      canvas.drawCircle(Offset(baseX, y), particleSize, paint);
    }
  }

  @override
  bool shouldRepaint(ParticlePainter oldDelegate) {
    return oldDelegate.animation != animation;
  }
}
