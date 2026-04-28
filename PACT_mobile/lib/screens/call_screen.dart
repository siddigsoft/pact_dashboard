import 'dart:ui';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:proximity_sensor/proximity_sensor.dart';
import 'package:vibration/vibration.dart';
import 'package:uuid/uuid.dart';
import '../services/jitsi_call_service.dart';
import '../services/call_history_service.dart';
import '../models/call_state.dart';
import '../theme/app_colors.dart';
import '../widgets/floating_call_overlay.dart';
import '../widgets/standard_back_button.dart';
import 'dart:async';
import '../services/screen_analytics_mixin.dart';
import '../services/event_tracker.dart';

class CallScreen extends StatefulWidget {
  final String? remoteUserName;
  final String? targetUserName;
  final String? remoteUserAvatar;
  final String? targetUserAvatar;
  final String? remoteUserRole;

  const CallScreen({
    super.key,
    this.remoteUserName,
    this.targetUserName,
    this.remoteUserAvatar,
    this.targetUserAvatar,
    this.remoteUserRole,
  });

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen>
    with TickerProviderStateMixin, ScreenAnalyticsMixin {
  final JitsiCallService _callService = JitsiCallService();
  final CallHistoryService _callHistoryService = CallHistoryService();

  StreamSubscription<CallState>? _callStateSubscription;
  StreamSubscription<dynamic>? _proximitySubscription;

  CallState _callState = CallState();
  Duration _callDuration = Duration.zero;
  Timer? _durationTimer;

  // Call notes
  final TextEditingController _notesController = TextEditingController();
  final bool _showNotesPanel = false;

  // Proximity sensor state
  bool _isNear = false;

  late AnimationController _pulseController;
  late AnimationController _waveController;
  late AnimationController _particleController;
  late AnimationController _glowController;
  late Animation<double> _pulseAnimation;
  late Animation<double> _glowAnimation;

  Offset _pipPosition = const Offset(20, 100);
  bool _isDraggingPip = false;
  final int _connectionQuality = 3;

  @override
  void initState() {
    super.initState();
    _subscribeToStreams();
    _initAnimations();
    _initCallEnhancements();

    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
    );

    // Track screen view
    logScreenView(
      'CallScreen',
      parameters: {
        'remote_user': widget.remoteUserName ?? 'unknown',
        'call_type': 'jitsi',
      },
    );
  }

  void _initCallEnhancements() {
    // Initialize call history service
    _callHistoryService.initialize();

    // Keep screen on during call
    WakelockPlus.enable();

    // Setup proximity sensor for earpiece mode
    _setupProximitySensor();

    // Vibrate on call start
    _vibrateOnEvent('call_start');
  }

  void _setupProximitySensor() {
    try {
      _proximitySubscription = ProximitySensor.events.listen((int event) {
        if (!mounted) return;
        setState(() {
          _isNear = event > 0;
        });

        // Turn off screen when near ear (audio call only)
        if (_callState.isAudioOnly && _isNear) {
          SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersive);
        } else {
          SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
        }
      });
    } catch (e) {
      debugPrint('[CallScreen] Proximity sensor error: $e');
    }
  }

  Future<void> _vibrateOnEvent(String event) async {
    try {
      final hasVibrator = await Vibration.hasVibrator() ?? false;
      if (!hasVibrator) return;

      switch (event) {
        case 'call_start':
          Vibration.vibrate(duration: 100);
          break;
        case 'call_connected':
          Vibration.vibrate(pattern: [0, 100, 50, 100]);
          break;
        case 'call_ended':
          Vibration.vibrate(duration: 200);
          break;
      }
    } catch (e) {
      debugPrint('[CallScreen] Vibration error: $e');
    }
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
    _proximitySubscription?.cancel();
    _pulseController.dispose();
    _waveController.dispose();
    _particleController.dispose();
    _glowController.dispose();
    _notesController.dispose();

    // Disable wakelock when leaving call
    WakelockPlus.disable();

    // Restore system UI
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

    super.dispose();
  }

  void _subscribeToStreams() {
    _callStateSubscription = _callService.callStateStream.listen((state) {
      if (!mounted) return;

      final previousStatus = _callState.status;
      setState(() {
        _callState = state;
      });

      if (state.status == CallStatus.connected && _durationTimer == null) {
        _startDurationTimer();
        _vibrateOnEvent('call_connected');
        HapticFeedback.mediumImpact();
      } else if (state.status == CallStatus.reconnecting) {
        HapticFeedback.lightImpact();
      } else if (state.status == CallStatus.unreachable ||
          state.status == CallStatus.failed ||
          state.status == CallStatus.busy ||
          state.status == CallStatus.rejected) {
        _durationTimer?.cancel();
        _durationTimer = null;
        _vibrateOnEvent('call_ended');
        HapticFeedback.heavyImpact();

        // Track call completion
        unawaited(
          EventTracker.trackCallCompleted(
            callType: state.isAudioOnly ? 'audio_call' : 'video_call',
            durationSeconds: _callDuration.inSeconds,
          ),
        );

        // Save to call history
        _saveCallToHistory(state, previousStatus);

        Future.delayed(const Duration(seconds: 3), () {
          if (mounted) {
            Navigator.of(context).pop();
          }
        });
      } else if (state.status == CallStatus.ended) {
        // Phase 8b: Detect if call was answered elsewhere (ringing -> ended without connecting)
        if (previousStatus == CallStatus.ringing ||
            previousStatus == CallStatus.calling) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'You answered this call on another device',
                style: GoogleFonts.poppins(),
              ),
              backgroundColor: Colors.blue.shade600,
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 2),
            ),
          );
        }
        _vibrateOnEvent('call_ended');
        // Track call completion
        unawaited(
          EventTracker.trackCallCompleted(
            callType: state.isAudioOnly ? 'audio_call' : 'video_call',
            durationSeconds: _callDuration.inSeconds,
          ),
        );
        _saveCallToHistory(state, previousStatus);
      } else if (!state.shouldShowCallScreen) {
        _durationTimer?.cancel();
        _durationTimer = null;
        Navigator.of(context).pop();
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

  void _saveCallToHistory(CallState state, CallStatus previousStatus) {
    if (state.remoteUserId == null) return;

    final entry = CallHistoryEntry(
      id: const Uuid().v4(),
      callId: state.callId,
      remoteUserId: state.remoteUserId!,
      remoteUserName:
          state.remoteUserName ?? widget.remoteUserName ?? 'Unknown',
      remoteUserAvatar: state.remoteUserAvatar ?? widget.remoteUserAvatar,
      isOutgoing: true,
      isVideoCall: !state.isAudioOnly,
      endStatus: state.status,
      startTime: state.startTime ?? DateTime.now(),
      endTime: DateTime.now(),
      duration: _callDuration,
      notes: state.callNotes,
      wasRecorded: state.isRecording,
    );

    _callHistoryService.addEntry(entry);
  }

  Widget _buildCallQualityIndicator() {
    final bars = _callState.qualityBars;
    if (bars == 0) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.3),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ...List.generate(5, (index) {
            final isActive = index < bars;
            final height = 4.0 + (index * 3);
            return Container(
              width: 3,
              height: height,
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: BoxDecoration(
                color: isActive
                    ? (bars >= 4
                          ? AppColors.primaryGreen
                          : bars >= 2
                          ? Colors.orange
                          : Colors.red)
                    : Colors.white24,
                borderRadius: BorderRadius.circular(1),
              ),
            );
          }),
          const SizedBox(width: 6),
          Text(
            '${_callState.latencyMs ?? 0}ms',
            style: GoogleFonts.poppins(fontSize: 10, color: Colors.white70),
          ),
        ],
      ),
    );
  }

  void _showNotesDialog() {
    _notesController.text = _callState.callNotes ?? '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.8),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(24),
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.white38,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Call Notes',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close, color: Colors.white70),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _notesController,
                    maxLines: 5,
                    style: GoogleFonts.poppins(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: 'Add notes about this call...',
                      hintStyle: GoogleFonts.poppins(color: Colors.white38),
                      filled: true,
                      fillColor: Colors.white.withOpacity(0.1),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        _callService.updateCallNotes(_notesController.text);
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              'Notes saved',
                              style: GoogleFonts.poppins(),
                            ),
                            backgroundColor: AppColors.primaryGreen,
                            behavior: SnackBarBehavior.floating,
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: Text(
                        'Save Notes',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ),
      ),
    );
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
    // Show hold status
    if (_callState.isOnHold ?? false) {
      return 'On Hold - ${_formatDuration()}';
    }

    switch (_callState.status) {
      case CallStatus.calling:
        return 'Calling';
      case CallStatus.ringing:
        return 'Ringing';
      case CallStatus.connected:
        return _formatDuration();
      case CallStatus.reconnecting:
        return 'Reconnecting...';
      case CallStatus.busy:
        return 'User is busy';
      case CallStatus.rejected:
        return 'Call declined';
      case CallStatus.ended:
        return 'Call ended';
      case CallStatus.unreachable:
        return 'User is offline';
      case CallStatus.failed:
        return 'Connection failed';
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
      case CallStatus.unreachable:
      case CallStatus.failed:
        return Colors.red;
      default:
        return Colors.white70;
    }
  }

  void _showCallSettings() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _buildSettingsSheet(),
    );
  }

  Widget _buildSettingsSheet() {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.8),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(
              top: BorderSide(color: Colors.white.withOpacity(0.1)),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white38,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Call Settings',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 24),
              _buildSettingsOption(
                icon: Icons.volume_up_rounded,
                title: 'Speaker',
                subtitle: _callState.isSpeakerOn ? 'On' : 'Off',
                trailing: Switch(
                  value: _callState.isSpeakerOn,
                  onChanged: (value) {
                    _callService.toggleSpeaker();
                    Navigator.pop(context);
                  },
                  thumbColor: WidgetStateProperty.resolveWith(
                    (states) => states.contains(WidgetState.selected)
                        ? AppColors.primaryBlue
                        : null,
                  ),
                ),
              ),
              _buildSettingsOption(
                icon: Icons.bluetooth_audio_rounded,
                title: 'Bluetooth Audio',
                subtitle: 'Use Bluetooth device if available',
                onTap: () {
                  HapticFeedback.lightImpact();
                  _callService.toggleSpeaker();
                  Navigator.pop(context);
                },
              ),
              _buildSettingsOption(
                icon: Icons.hearing_rounded,
                title: 'Earpiece',
                subtitle: 'Use phone earpiece',
                onTap: () {
                  HapticFeedback.lightImpact();
                  if (_callState.isSpeakerOn) {
                    _callService.toggleSpeaker();
                  }
                  Navigator.pop(context);
                },
              ),
              if (!_callState.isAudioOnly) ...[
                const Divider(color: Colors.white24, height: 32),
                _buildSettingsOption(
                  icon: Icons.flip_camera_ios_rounded,
                  title: 'Switch Camera',
                  subtitle: 'Toggle front/back camera',
                  onTap: () {
                    HapticFeedback.lightImpact();
                    _callService.switchCamera();
                    Navigator.pop(context);
                  },
                ),
              ],
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSettingsOption({
    required IconData icon,
    required String title,
    required String subtitle,
    Widget? trailing,
    VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: Colors.white70, size: 22),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.poppins(
                      color: Colors.white54,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isVideoEnabled = !_callState.isAudioOnly && _callState.isVideoEnabled;
    final isDialing =
        _callState.status == CallStatus.calling ||
        _callState.status == CallStatus.ringing;
    final isConnected = _callState.status == CallStatus.connected;

    return Scaffold(
      body: Stack(
        children: [
          _buildBackground(isDialing, isConnected),
          if (isDialing || !isVideoEnabled)
            Positioned.fill(child: _buildDialingUI()),
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
                  ? [Colors.black, Colors.grey[900]!]
                  : [const Color(0xFF1a1a2e), const Color(0xFF16213e)],
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
            border: Border.all(color: Colors.white.withOpacity(0.2)),
          ),
          child: StandardBackButton(
            onPressed: () async {
              await _callService.endCall();
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
                border: Border.all(color: Colors.white.withOpacity(0.1)),
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
                  _buildCallQualityIndicator(),
                ],
              ),
            ),
          ),
        ),
      ),
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
              (_pipPosition.dx + details.delta.dx).clamp(
                0,
                MediaQuery.of(context).size.width - 140,
              ),
              (_pipPosition.dy + details.delta.dy).clamp(
                0,
                MediaQuery.of(context).size.height - 200,
              ),
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
            child: Container(
              color: Colors.black87,
              child: Center(
                child: Icon(Icons.person, size: 48, color: Colors.white54),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDialingUI() {
    final userName =
        _callState.remoteUserName ??
        widget.targetUserName ??
        widget.remoteUserName ??
        'Unknown';
    final userInitial = userName.isNotEmpty ? userName[0].toUpperCase() : 'U';
    final isDialing =
        _callState.status == CallStatus.calling ||
        _callState.status == CallStatus.ringing;

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Phase 8a: Call quality warning banner
        if (_callState.qualityBars < 2 &&
            _callState.status == CallStatus.connected)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 20),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.redAccent.withOpacity(0.1),
              border: Border.all(color: Colors.redAccent, width: 1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.signal_cellular_null,
                  color: Colors.redAccent,
                  size: 16,
                ),
                const SizedBox(width: 8),
                Text(
                  'Poor network connection',
                  style: GoogleFonts.poppins(
                    color: Colors.redAccent,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
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
                        color: AppColors.primaryBlue.withOpacity(
                          _glowAnimation.value,
                        ),
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
                              errorBuilder: (_, _, _) => Center(
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
            if (_callState.status == CallStatus.unreachable ||
                _callState.status == CallStatus.failed)
              Container(
                width: 10,
                height: 10,
                margin: const EdgeInsets.only(right: 10),
                decoration: BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.red.withOpacity(0.5),
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
            border: Border.all(color: Colors.white.withOpacity(0.2)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                _callState.isAudioOnly
                    ? Icons.phone_in_talk_rounded
                    : Icons.videocam_rounded,
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
              Container(width: 1, height: 16, color: Colors.white24),
              const SizedBox(width: 16),
              const Icon(
                Icons.security,
                color: AppColors.primaryGreen,
                size: 16,
              ),
              const SizedBox(width: 6),
              Text(
                'Encrypted',
                style: GoogleFonts.poppins(color: Colors.white54, fontSize: 12),
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
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 30),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withOpacity(0.3),
                  Colors.black.withOpacity(0.5),
                ],
              ),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(30),
              ),
              border: Border(
                top: BorderSide(color: Colors.white.withOpacity(0.1), width: 1),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.white30,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                if (isConnected) ...[
                  // First row - main audio/video controls
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _buildSmallControlButton(
                        icon: _callState.isSpeakerOn
                            ? Icons.volume_up_rounded
                            : Icons.volume_off_rounded,
                        label: 'Speaker',
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          _callService.toggleSpeaker();
                        },
                        isActive: _callState.isSpeakerOn,
                      ),
                      if (!_callState.isAudioOnly)
                        _buildSmallControlButton(
                          icon: _callState.isVideoEnabled
                              ? Icons.videocam_rounded
                              : Icons.videocam_off_rounded,
                          label: 'Video',
                          onPressed: () async {
                            HapticFeedback.lightImpact();
                            await _callService.toggleVideo();
                          },
                          isActive: _callState.isVideoEnabled,
                        ),
                      if (!_callState.isAudioOnly)
                        _buildSmallControlButton(
                          icon: Icons.flip_camera_ios_rounded,
                          label: 'Flip',
                          onPressed: () {
                            HapticFeedback.lightImpact();
                            _callService.switchCamera();
                          },
                          isActive: true,
                        ),
                      _buildSmallControlButton(
                        icon: _callState.isOnHold
                            ? Icons.play_arrow_rounded
                            : Icons.pause_rounded,
                        label: _callState.isOnHold ? 'Resume' : 'Hold',
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          _callService.toggleHold();
                        },
                        isActive: _callState.isOnHold,
                        activeColor: Colors.orange,
                      ),
                      _buildSmallControlButton(
                        icon: Icons.more_horiz_rounded,
                        label: 'More',
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          _showCallSettings();
                        },
                        isActive: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Second row - additional controls
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _buildSmallControlButton(
                        icon: _callState.isRecording
                            ? Icons.stop_circle_rounded
                            : Icons.fiber_manual_record_rounded,
                        label: _callState.isRecording ? 'Stop Rec' : 'Record',
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          _callService.toggleRecording();
                        },
                        isActive: _callState.isRecording,
                        activeColor: Colors.red,
                      ),
                      _buildSmallControlButton(
                        icon: Icons.note_add_rounded,
                        label: 'Notes',
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          _showNotesDialog();
                        },
                        isActive:
                            _callState.callNotes != null &&
                            _callState.callNotes!.isNotEmpty,
                      ),
                      _buildSmallControlButton(
                        icon: Icons.screen_share_rounded,
                        label: 'Share',
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          _showScreenShareDialog();
                        },
                        isActive: false,
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                ],
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    // Show speaker control during dialing too
                    if (!isConnected)
                      _buildControlButton(
                        icon: _callState.isSpeakerOn
                            ? Icons.volume_up_rounded
                            : Icons.volume_off_rounded,
                        label: 'Speaker',
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          _callService.toggleSpeaker();
                        },
                        isActive: _callState.isSpeakerOn,
                      ),
                    if (isConnected)
                      _buildControlButton(
                        icon: Icons.open_in_new_rounded,
                        label: 'Minimize',
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          _minimizeCall();
                        },
                        isActive: true,
                      ),
                    _buildControlButton(
                      icon: _callState.isMuted
                          ? Icons.mic_off_rounded
                          : Icons.mic_rounded,
                      label: _callState.isMuted ? 'Unmute' : 'Mute',
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        _callService.toggleMute();
                      },
                      isActive: !_callState.isMuted,
                      isWarning: _callState.isMuted,
                    ),
                    _buildEndCallButton(),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showScreenShareDialog() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.8),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white38,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 20),
                const Icon(
                  Icons.screen_share_rounded,
                  color: AppColors.primaryBlue,
                  size: 48,
                ),
                const SizedBox(height: 16),
                Text(
                  'Screen Sharing',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Screen sharing is available for video calls. The other participant will see your screen.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.poppins(
                    color: Colors.white60,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: Text(
                          'Cancel',
                          style: GoogleFonts.poppins(color: Colors.white70),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.pop(context);
                          _startScreenShare();
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primaryBlue,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(
                          'Start Sharing',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _startScreenShare() async {
    try {
      HapticFeedback.mediumImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Screen sharing started', style: GoogleFonts.poppins()),
          backgroundColor: AppColors.primaryGreen,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      debugPrint('[CallScreen] Screen share error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Could not start screen sharing',
              style: GoogleFonts.poppins(),
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _minimizeCall() {
    CallOverlayManager().showOverlay(
      context,
      remoteUserName: widget.remoteUserName ?? _callState.remoteUserName,
      remoteUserAvatar: widget.remoteUserAvatar,
    );
    Navigator.of(context).pop();
  }

  Widget _buildSmallControlButton({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
    bool isActive = true,
    Color? activeColor,
  }) {
    final color = activeColor ?? Colors.white;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onPressed,
          child: Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: isActive && activeColor != null
                  ? activeColor.withOpacity(0.2)
                  : Colors.white.withOpacity(isActive ? 0.15 : 0.08),
              shape: BoxShape.circle,
              border: Border.all(
                color: isActive && activeColor != null
                    ? activeColor.withOpacity(0.5)
                    : Colors.white.withOpacity(0.2),
                width: 1,
              ),
            ),
            child: Icon(
              icon,
              color: isActive ? color : Colors.white54,
              size: 22,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: GoogleFonts.poppins(
            color: Colors.white54,
            fontSize: 10,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
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
              color: isWarning
                  ? null
                  : Colors.white.withOpacity(isActive ? 0.15 : 0.08),
              shape: BoxShape.circle,
              border: Border.all(
                color: isWarning
                    ? Colors.orange
                    : Colors.white.withOpacity(0.2),
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
            await _callService.endCall();
          },
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFF5252), Color(0xFFD32F2F)],
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
      final opacity =
          0.3 + (math.sin((animation + i / 30) * math.pi * 2) * 0.3);

      paint.color = particleColor.withOpacity(opacity.clamp(0.0, 1.0));
      canvas.drawCircle(Offset(baseX, y), particleSize, paint);
    }
  }

  @override
  bool shouldRepaint(ParticlePainter oldDelegate) {
    return oldDelegate.animation != animation;
  }
}
