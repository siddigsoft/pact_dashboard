// lib/screens/agora_call_screen.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:vibration/vibration.dart';
import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import '../services/agora_call_service.dart';
import '../models/call_state.dart';
import '../theme/app_colors.dart';
import '../widgets/floating_call_overlay.dart';
import '../widgets/standard_back_button.dart';

/// Agora Call Screen - Native video/audio call interface
/// Provides full-featured video and audio calling with Agora RTC Engine
class AgoraCallScreen extends StatefulWidget {
  final String channelName;
  final String? remoteUserId;
  final String? remoteUserName;
  final String? remoteUserAvatar;
  final bool isAudioOnly;
  final bool isOutgoing;

  const AgoraCallScreen({
    super.key,
    required this.channelName,
    this.remoteUserId,
    this.remoteUserName,
    this.remoteUserAvatar,
    this.isAudioOnly = false,
    this.isOutgoing = true,
  });

  @override
  State<AgoraCallScreen> createState() => _AgoraCallScreenState();
}

class _AgoraCallScreenState extends State<AgoraCallScreen>
    with TickerProviderStateMixin {
  final AgoraCallService _agoraService = AgoraCallService();

  bool _isConnecting = true;
  bool _isConnected = false;
  int? _remoteUid;
  Duration _callDuration = Duration.zero;
  Timer? _durationTimer;

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  StreamSubscription<CallState>? _callStateSubscription;
  StreamSubscription<int?>? _remoteUserSubscription;
  bool _isEndingCall = false;
  CallStatus? _lastCallStatus;

  @override
  void initState() {
    super.initState();
    debugPrint(
      '[AgoraCall] AgoraCallScreen initState() channel=${widget.channelName} remoteUserName=${widget.remoteUserName}',
    );
    _initAnimations();
    _subscribeToCallState();
    _subscribeToRemoteUser();
    _startCall();

    WakelockPlus.enable();

    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
    );
  }

  void _initAnimations() {
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  void _subscribeToCallState() {
    debugPrint(
      '[AgoraCall] AgoraCallScreen _subscribeToCallState() subscribing to callStateStream',
    );
    _callStateSubscription = _agoraService.callStateStream.listen((state) {
      // #region agent log
      debugPrint(
        '[CALL_DIAG] [H2] AgoraCallScreen callState=${state.status} lastStatus=$_lastCallStatus channel=${widget.channelName}',
      );
      // #endregion
      debugPrint(
        '[AgoraCall] AgoraCallScreen callStateStream event: status=${state.status} error=${state.status}',
      );
      if (!mounted) return;
      _lastCallStatus = state.status;

      switch (state.status) {
        case CallStatus.connected:
          debugPrint(
            '[AgoraCall] AgoraCallScreen state=connected, setting _isConnected=true',
          );
          setState(() {
            _isConnecting = false;
            _isConnected = true;
          });
          _startDurationTimer();
          _vibrateOnConnect();
          break;
        case CallStatus.ended:
        case CallStatus.rejected:
        case CallStatus.failed:
        case CallStatus.busy:
        case CallStatus.unreachable:
          final message = _statusMessage(state.status);
          if (message != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(message),
                duration: const Duration(seconds: 2),
              ),
            );
          }
          debugPrint(
            '[AgoraCall] AgoraCallScreen state=${state.status} calling _endCall()',
          );
          _endCall();
          break;
        case CallStatus.reconnecting:
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Reconnecting...'),
                duration: Duration(seconds: 2),
              ),
            );
          }
          break;
        default:
          debugPrint(
            '[AgoraCall] AgoraCallScreen state=${state.status} (no UI change)',
          );
          break;
      }
    });
  }

  void _subscribeToRemoteUser() {
    _remoteUserSubscription = _agoraService.remoteUserStream.listen((uid) {
      debugPrint(
        '[AgoraCall] AgoraCallScreen remoteUserStream event: uid=$uid',
      );
      if (!mounted) return;
      setState(() {
        _remoteUid = uid;
        if (uid != null && !_isConnected) {
          _isConnecting = false;
          _isConnected = true;
          _startDurationTimer();
          _vibrateOnConnect();
        }
      });
    });
  }

  Future<void> _startCall() async {
    debugPrint(
      '[AgoraCall] AgoraCallScreen _startCall() ENTER channel=${widget.channelName} isOutgoing=${widget.isOutgoing}',
    );

    try {
      // Join Agora channel
      await _agoraService.joinChannel(widget.channelName);

      if (mounted) {
        setState(() {
          _isConnecting = true;
        });
      }
    } catch (e) {
      debugPrint('[AgoraCall] AgoraCallScreen _startCall() ERROR: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to join call: $e')));
        _endCall();
      }
    }
  }

  void _startDurationTimer() {
    _durationTimer?.cancel();
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _callDuration = Duration(seconds: timer.tick);
        });
      }
    });
  }

  void _vibrateOnConnect() async {
    if (await Vibration.hasVibrator()) {
      Vibration.vibrate(pattern: [0, 100, 50, 100]);
    }
  }

  void _toggleMute() async {
    await _agoraService.toggleMute();
    setState(() {});
    Vibration.vibrate(duration: 50);
  }

  void _toggleVideo() async {
    await _agoraService.toggleVideo();
    setState(() {});
    Vibration.vibrate(duration: 50);
  }

  void _toggleSpeaker() async {
    await _agoraService.toggleSpeaker();
    setState(() {});
    Vibration.vibrate(duration: 50);
  }

  void _switchCamera() async {
    await _agoraService.switchCamera();
    Vibration.vibrate(duration: 50);
  }

  void _endCall() {
    if (_isEndingCall) return;
    _isEndingCall = true;

    _callStateSubscription?.cancel();
    _callStateSubscription = null;
    _remoteUserSubscription?.cancel();
    _remoteUserSubscription = null;

    debugPrint(
      '[AgoraCall] AgoraCallScreen _endCall() calling _agoraService.endCall()',
    );
    // #region agent log
    debugPrint(
      '[CALL_DIAG] [H2] AgoraCallScreen _endCall() lastCallStatus=$_lastCallStatus channel=${widget.channelName}',
    );
    // #endregion
    _agoraService.endCall();
    WakelockPlus.disable();

    if (mounted) {
      debugPrint(
        '[AgoraCall] AgoraCallScreen _endCall() scheduling Navigator.pop()',
      );
      // Defer pop to next frame to avoid "!_debugLocked" when called from stream callback
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          Navigator.of(context).pop();
        }
      });
    }
  }

  void _minimizeCall() {
    CallOverlayManager().showOverlay(
      context,
      remoteUserName: widget.remoteUserName ?? _agoraService.remoteUserName,
      remoteUserAvatar: widget.remoteUserAvatar,
    );
    Navigator.of(context).pop();
  }

  Future<void> _addParticipant() async {
    try {
      // Show a simple dialog to enter contact info
      String? selectedUserName;

      await showDialog(
        context: context,
        builder: (context) => StatefulBuilder(
          builder: (context, setState) => AlertDialog(
            title: const Text('Add Participant to Call'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    decoration: const InputDecoration(
                      hintText: 'Enter contact name',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.person),
                    ),
                    onChanged: (value) {
                      selectedUserName = value;
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'The participant will receive a call invitation to join this group call when they accept.',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed:
                    selectedUserName != null && selectedUserName!.isNotEmpty
                    ? () {
                        Navigator.pop(context);
                        _sendGroupCallInvite(selectedUserName!);
                      }
                    : null,
                child: const Text('Send Invite'),
              ),
            ],
          ),
        ),
      );
    } catch (e) {
      debugPrint('[AgoraCall] Error adding participant: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  Future<void> _sendGroupCallInvite(String participantName) async {
    try {
      // In a real implementation, you would search for the user by name
      // For now, we'll show a message that the invite was sent
      debugPrint('[AgoraCall] Group invite sent to: $participantName');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Call invite sent to $participantName'),
            duration: const Duration(seconds: 2),
          ),
        );
      }

      // TODO: Implement actual user lookup and group call invite
      // await _agoraService.sendGroupCallInvite(
      //   inviteeUserId: userId,
      //   inviteeName: participantName,
      // );
    } catch (e) {
      debugPrint('[AgoraCall] Error sending group invite: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to send invite: $e')));
      }
    }
  }

  String? _statusMessage(CallStatus status) {
    switch (status) {
      case CallStatus.busy:
        return 'User is currently on another call';
      case CallStatus.rejected:
        return 'Call was declined';
      case CallStatus.unreachable:
        return 'No answer';
      case CallStatus.failed:
        return 'Call failed';
      default:
        return null;
    }
  }

  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final hours = twoDigits(duration.inHours);
    final minutes = twoDigits(duration.inMinutes.remainder(60));
    final seconds = twoDigits(duration.inSeconds.remainder(60));

    if (duration.inHours > 0) {
      return '$hours:$minutes:$seconds';
    }
    return '$minutes:$seconds';
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _durationTimer?.cancel();
    _callStateSubscription?.cancel();
    _remoteUserSubscription?.cancel();
    WakelockPlus.disable();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1a1a2e),
      body: SafeArea(
        child: Stack(
          children: [
            _buildBackground(),
            Column(
              children: [
                _buildHeader(),
                Expanded(child: _buildCallContent()),
                _buildControls(),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBackground() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            const Color(0xFF1a1a2e),
            AppColors.primary.withOpacity(0.3),
            const Color(0xFF1a1a2e),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          StandardBackButton(onPressed: _endCall),
          Expanded(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _isConnected
                            ? Colors.green.withOpacity(0.2)
                            : Colors.orange.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _isConnected
                              ? Colors.green.withOpacity(0.5)
                              : Colors.orange.withOpacity(0.5),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            widget.isAudioOnly
                                ? Icons.phone
                                : Icons.video_camera_front,
                            color: _isConnected ? Colors.green : Colors.orange,
                            size: 14,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _isConnected ? 'Connected' : 'Connecting...',
                            style: TextStyle(
                              color: _isConnected
                                  ? Colors.green
                                  : Colors.orange,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                if (_isConnected)
                  Text(
                    _formatDuration(_callDuration),
                    style: const TextStyle(color: Colors.white70, fontSize: 14),
                  ),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                icon: const Icon(Icons.open_in_full, color: Colors.white),
                onPressed: _minimizeCall,
                tooltip: 'Minimize',
              ),
              if (!widget.isAudioOnly &&
                  (AgoraCallService.isWeb ? _agoraService.isReady : true))
                IconButton(
                  icon: Icon(
                    _agoraService.isFrontCamera
                        ? Icons.camera_front
                        : Icons.camera_rear,
                    color: Colors.white,
                  ),
                  onPressed: _switchCamera,
                  tooltip: 'Switch Camera',
                )
              else
                const SizedBox(width: 48),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCallContent() {
    // On web when engine failed to init: show signaling-only message
    if (AgoraCallService.isWeb && !_agoraService.isReady) {
      return _buildWebCallPlaceholder();
    }
    // Video call mode
    if (!widget.isAudioOnly) {
      return _buildVideoCallUI();
    }
    // Audio-only mode
    return _buildAudioOnlyUI();
  }

  /// Placeholder when running on web (signaling only, no audio/video)
  Widget _buildWebCallPlaceholder() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.info_outline,
              size: 56,
              color: Colors.white.withOpacity(0.7),
            ),
            const SizedBox(height: 20),
            Text(
              'Calls on web',
              style: TextStyle(
                color: Colors.white.withOpacity(0.9),
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Use the mobile app for audio and video.\nYou can start or receive calls here; the other person joins from the app.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withOpacity(0.7),
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 24),
            if (widget.remoteUserName != null)
              Text(
                widget.isOutgoing
                    ? 'Calling ${widget.remoteUserName}...'
                    : 'With ${widget.remoteUserName}',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.8),
                  fontSize: 16,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildVideoCallUI() {
    return Stack(
      children: [
        // Remote video (full screen)
        if (_remoteUid != null)
          AgoraVideoView(
            controller: VideoViewController.remote(
              rtcEngine: _agoraService.engine,
              canvas: VideoCanvas(uid: _remoteUid),
              connection: RtcConnection(channelId: widget.channelName),
            ),
          )
        else
          Container(
            color: Colors.grey[900],
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(color: Colors.blue),
                  const SizedBox(height: 20),
                  Text(
                    _isConnecting
                        ? 'Waiting for ${widget.remoteUserName ?? "user"}...'
                        : 'No video',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 18),
                  ),
                ],
              ),
            ),
          ),

        // Local preview (small overlay) - only show when video is enabled
        if (!_agoraService.isVideoDisabled)
          Positioned(
            bottom: 140,
            right: 24,
            child: Container(
              width: 130,
              height: 170,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 2),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.5),
                    blurRadius: 10,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: AgoraVideoView(
                  controller: VideoViewController(
                    rtcEngine: _agoraService.engine,
                    canvas: const VideoCanvas(uid: 0),
                  ),
                ),
              ),
            ),
          ),

        // Video disabled overlay
        if (_agoraService.isVideoDisabled)
          Positioned(
            bottom: 140,
            right: 24,
            child: Container(
              width: 130,
              height: 170,
              decoration: BoxDecoration(
                color: Colors.grey[800],
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.red, width: 3),
              ),
              child: const Center(
                child: Icon(Icons.videocam_off, color: Colors.red, size: 40),
              ),
            ),
          ),

        // User info overlay
        Positioned(
          top: 20,
          left: 20,
          right: 20,
          child: _buildUserInfoOverlay(),
        ),
      ],
    );
  }

  Widget _buildAudioOnlyUI() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Avatar with pulse animation
        ScaleTransition(
          scale: _isConnecting
              ? _pulseAnimation
              : const AlwaysStoppedAnimation(1.0),
          child: Container(
            width: 150,
            height: 150,
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
                  blurRadius: 30,
                  spreadRadius: 5,
                ),
              ],
            ),
            child: Center(
              child: widget.remoteUserAvatar != null
                  ? ClipOval(
                      child: Image.network(
                        widget.remoteUserAvatar!,
                        width: 130,
                        height: 130,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => _buildAvatarFallback(),
                      ),
                    )
                  : _buildAvatarFallback(),
            ),
          ),
        ),

        const SizedBox(height: 24),

        // User name
        Text(
          widget.remoteUserName ?? 'Unknown User',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 28,
            fontWeight: FontWeight.bold,
          ),
        ),

        const SizedBox(height: 8),

        // Status
        Text(
          _isConnecting
              ? 'Connecting...'
              : _isConnected
              ? 'Audio Call'
              : 'Call ended',
          style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 16),
        ),

        const SizedBox(height: 16),

        // Audio indicator
        if (_isConnected && !_agoraService.isMuted)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.green.withOpacity(0.2),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.green.withOpacity(0.5)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.mic, color: Colors.green, size: 16),
                SizedBox(width: 8),
                Text(
                  'Microphone Active',
                  style: TextStyle(color: Colors.green, fontSize: 12),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildUserInfoOverlay() {
    if (_remoteUid == null) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.5),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          if (widget.remoteUserAvatar != null)
            ClipOval(
              child: Image.network(
                widget.remoteUserAvatar!,
                width: 32,
                height: 32,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => _buildSmallAvatarFallback(),
              ),
            )
          else
            _buildSmallAvatarFallback(),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              widget.remoteUserName ?? 'Unknown User',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAvatarFallback() {
    final initials = (widget.remoteUserName ?? 'U')
        .split(' ')
        .take(2)
        .map((e) => e.isNotEmpty ? e[0].toUpperCase() : '')
        .join();

    return Container(
      width: 130,
      height: 130,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.primary.withOpacity(0.3),
      ),
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 48,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildSmallAvatarFallback() {
    final initials = (widget.remoteUserName ?? 'U')
        .split(' ')
        .take(2)
        .map((e) => e.isNotEmpty ? e[0].toUpperCase() : '')
        .join();

    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.primary.withOpacity(0.5),
      ),
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildControls() {
    // On web when engine not ready: only End call
    if (AgoraCallService.isWeb && !_agoraService.isReady) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [_buildEndCallButton()],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Mute button
          _buildControlButton(
            icon: _agoraService.isMuted ? Icons.mic_off : Icons.mic,
            label: _agoraService.isMuted ? 'Unmute' : 'Mute',
            isActive: _agoraService.isMuted,
            onPressed: _toggleMute,
          ),

          // Video button (only for video calls)
          if (!widget.isAudioOnly)
            _buildControlButton(
              icon: _agoraService.isVideoDisabled
                  ? Icons.videocam_off
                  : Icons.videocam,
              label: _agoraService.isVideoDisabled ? 'Video On' : 'Video Off',
              isActive: _agoraService.isVideoDisabled,
              onPressed: _toggleVideo,
            ),

          // End call button
          _buildEndCallButton(),

          // Speaker button
          _buildControlButton(
            icon: _agoraService.isSpeakerOn
                ? Icons.volume_up
                : Icons.volume_off,
            label: _agoraService.isSpeakerOn ? 'Speaker' : 'Earpiece',
            isActive: _agoraService.isSpeakerOn,
            onPressed: _toggleSpeaker,
          ),

          // Add participant button (group call)
          _buildControlButton(
            icon: Icons.person_add,
            label: 'Add',
            isActive: false,
            onPressed: _addParticipant,
          ),
        ],
      ),
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required String label,
    required bool isActive,
    required VoidCallback onPressed,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: isActive
              ? Colors.red.withOpacity(0.2)
              : Colors.white.withOpacity(0.1),
          shape: const CircleBorder(),
          child: InkWell(
            onTap: onPressed,
            customBorder: const CircleBorder(),
            child: Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isActive
                      ? Colors.red.withOpacity(0.5)
                      : Colors.white.withOpacity(0.3),
                  width: 1,
                ),
              ),
              child: Icon(
                icon,
                color: isActive ? Colors.red : Colors.white,
                size: 24,
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 11),
        ),
      ],
    );
  }

  Widget _buildEndCallButton() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: Colors.red,
          shape: const CircleBorder(),
          child: InkWell(
            onTap: _endCall,
            customBorder: const CircleBorder(),
            child: Container(
              width: 70,
              height: 70,
              decoration: const BoxDecoration(shape: BoxShape.circle),
              child: const Icon(Icons.call_end, color: Colors.white, size: 32),
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'End',
          style: TextStyle(color: Colors.white70, fontSize: 11),
        ),
      ],
    );
  }
}
