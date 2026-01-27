import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/webrtc_service.dart';
import '../models/call_state.dart';
import '../screens/call_screen.dart';
import 'dart:async';

class FloatingCallOverlay extends StatefulWidget {
  final String? remoteUserName;
  final String? remoteUserAvatar;
  final String? remoteUserRole;
  final VoidCallback? onTap;
  final VoidCallback? onEndCall;

  const FloatingCallOverlay({
    super.key,
    this.remoteUserName,
    this.remoteUserAvatar,
    this.remoteUserRole,
    this.onTap,
    this.onEndCall,
  });

  @override
  State<FloatingCallOverlay> createState() => _FloatingCallOverlayState();
}

class _FloatingCallOverlayState extends State<FloatingCallOverlay>
    with SingleTickerProviderStateMixin {
  final WebRTCService _webrtcService = WebRTCService();
  StreamSubscription<CallState>? _callStateSubscription;
  CallState _callState = CallState();
  Duration _callDuration = Duration.zero;
  Timer? _durationTimer;
  Offset _position = const Offset(20, 100);
  bool _isDragging = false;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    )..repeat(reverse: true);
    _subscribeToCallState();
  }

  @override
  void dispose() {
    _callStateSubscription?.cancel();
    _durationTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  void _subscribeToCallState() {
    _callStateSubscription = _webrtcService.callStateStream.listen((state) {
      if (!mounted) return;
      setState(() => _callState = state);

      if (state.status == CallStatus.connected && _durationTimer == null) {
        _startDurationTimer();
      } else if (!state.isInCall) {
        _durationTimer?.cancel();
        _durationTimer = null;
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
    final minutes = _callDuration.inMinutes.remainder(60);
    final seconds = _callDuration.inSeconds.remainder(60);
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  void _openFullCallScreen() {
    HapticFeedback.lightImpact();
    CallOverlayManager().hideOverlay();
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => CallScreen(
          remoteUserName: widget.remoteUserName ?? _callState.remoteUserName,
          remoteUserAvatar: widget.remoteUserAvatar,
          remoteUserRole: widget.remoteUserRole,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_callState.isInCall) return const SizedBox.shrink();

    final screenSize = MediaQuery.of(context).size;
    final userName = widget.remoteUserName ?? _callState.remoteUserName ?? 'Unknown';
    final userInitial = userName.isNotEmpty ? userName[0].toUpperCase() : 'U';
    final isConnected = _callState.status == CallStatus.connected;

    return Positioned(
      left: _position.dx,
      top: _position.dy,
      child: GestureDetector(
        onPanStart: (_) => setState(() => _isDragging = true),
        onPanUpdate: (details) {
          setState(() {
            _position = Offset(
              (_position.dx + details.delta.dx).clamp(0, screenSize.width - 180),
              (_position.dy + details.delta.dy).clamp(50, screenSize.height - 80),
            );
          });
        },
        onPanEnd: (_) {
          setState(() => _isDragging = false);
          final centerX = _position.dx + 90;
          final newX = centerX < screenSize.width / 2 ? 10.0 : screenSize.width - 190;
          setState(() => _position = Offset(newX, _position.dy));
        },
        onTap: _openFullCallScreen,
        child: AnimatedBuilder(
          animation: _pulseController,
          builder: (context, child) {
            return AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              transform: Matrix4.identity()
                ..scale(_isDragging ? 1.05 : 1.0),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
                  child: Container(
                    width: 180,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          isConnected
                              ? AppColors.primaryGreen.withOpacity(0.9)
                              : AppColors.primaryBlue.withOpacity(0.9),
                          isConnected
                              ? AppColors.primaryGreen.withOpacity(0.7)
                              : AppColors.primaryBlue.withOpacity(0.7),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: (isConnected ? AppColors.primaryGreen : AppColors.primaryBlue)
                              .withOpacity(0.3 + (_pulseController.value * 0.2)),
                          blurRadius: 15,
                          spreadRadius: 2,
                        ),
                      ],
                      border: Border.all(
                        color: Colors.white.withOpacity(0.3),
                        width: 1.5,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white.withOpacity(0.2),
                            border: Border.all(
                              color: Colors.white.withOpacity(0.5),
                              width: 2,
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
                                          color: Colors.white,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 18,
                                        ),
                                      ),
                                    ),
                                  ),
                                )
                              : Center(
                                  child: Text(
                                    userInitial,
                                    style: GoogleFonts.poppins(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 18,
                                    ),
                                  ),
                                ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                userName,
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Row(
                                children: [
                                  Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      color: isConnected ? Colors.white : Colors.white54,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    isConnected ? _formatDuration() : 'Connecting...',
                                    style: GoogleFonts.poppins(
                                      color: Colors.white.withOpacity(0.9),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: () async {
                            HapticFeedback.heavyImpact();
                            await _webrtcService.endCall();
                            widget.onEndCall?.call();
                          },
                          child: Container(
                            width: 32,
                            height: 32,
                            decoration: const BoxDecoration(
                              color: Colors.red,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.call_end,
                              color: Colors.white,
                              size: 16,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class CallOverlayManager {
  static final CallOverlayManager _instance = CallOverlayManager._internal();
  factory CallOverlayManager() => _instance;
  CallOverlayManager._internal();

  OverlayEntry? _overlayEntry;
  String? _currentRemoteUserName;
  String? _currentRemoteUserAvatar;
  String? _currentRemoteUserRole;

  void showOverlay(BuildContext context, {String? remoteUserName, String? remoteUserAvatar, String? remoteUserRole}) {
    hideOverlay();
    _currentRemoteUserName = remoteUserName;
    _currentRemoteUserAvatar = remoteUserAvatar;
    _currentRemoteUserRole = remoteUserRole;

    _overlayEntry = OverlayEntry(
      builder: (context) => FloatingCallOverlay(
        remoteUserName: _currentRemoteUserName,
        remoteUserAvatar: _currentRemoteUserAvatar,
        remoteUserRole: _currentRemoteUserRole,
        onEndCall: hideOverlay,
      ),
    );

    Overlay.of(context).insert(_overlayEntry!);
  }

  void hideOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
    _currentRemoteUserName = null;
    _currentRemoteUserAvatar = null;
  }

  bool get isShowing => _overlayEntry != null;
}
