// lib/screens/enhanced_call_screen.dart
// Enhanced call screen with full-screen, mini-screen, screen sharing, and detailed features

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:intl/intl.dart';
import '../services/webrtc_service.dart';
import '../services/call_quality_monitor_service.dart';
import '../services/analytics_service.dart';
import '../models/call_state.dart';
import '../theme/app_colors.dart';
import '../widgets/call_quality_indicator.dart';
import '../widgets/network_warning_banner.dart';
import 'dart:async';

class EnhancedCallScreen extends StatefulWidget {
  final String? remoteUserName;
  final String? remoteUserAvatar;

  const EnhancedCallScreen({
    super.key,
    this.remoteUserName,
    this.remoteUserAvatar,
  });

  @override
  State<EnhancedCallScreen> createState() => _EnhancedCallScreenState();
}

class _EnhancedCallScreenState extends State<EnhancedCallScreen>
    with WidgetsBindingObserver {
  final WebRTCService _webrtcService = WebRTCService();
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();

  StreamSubscription<CallState>? _callStateSubscription;
  StreamSubscription<MediaStream?>? _localStreamSubscription;
  StreamSubscription<MediaStream?>? _remoteStreamSubscription;

  // Quality monitoring
  CallQualityMonitor? _qualityMonitor;
  CallState _callState = CallState();
  Duration _callDuration = Duration.zero;
  Timer? _durationTimer;
  final List<String> _qualityWarnings = [];

  bool _isFullScreen = false;
  bool _isMiniScreen = false;
  bool _isScreenSharing = false;
  bool _showCallDetails = false;
  bool _isSpeakerOn = false;
  bool _showControls = true;
  Timer? _hideControlsTimer;

  @override
  void initState() {
    super.initState();
    // Log screen view for analytics
    AnalyticsService.logScreenView('EnhancedCallScreen');
    AnalyticsService.logEvent(
      'webrtc_call_started',
      parameters: {
        'remote_user': widget.remoteUserName ?? 'Unknown',
        'call_type': 'WebRTC',
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
    WidgetsBinding.instance.addObserver(this);
    _initRenderers();
    _subscribeToStreams();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _durationTimer?.cancel();
    _hideControlsTimer?.cancel();
    _qualityMonitor?.stopMonitoring();
    _callStateSubscription?.cancel();
    _localStreamSubscription?.cancel();
    _remoteStreamSubscription?.cancel();
    _localRenderer.dispose();
    _remoteRenderer.dispose();
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
        _startQualityMonitoring();
      } else if (!state.isInCall) {
        _durationTimer?.cancel();
        _durationTimer = null;
        _qualityMonitor?.stopMonitoring();
        Navigator.of(context).pop();
      }
    });

    _localStreamSubscription = _webrtcService.localStreamStream.listen((
      stream,
    ) {
      if (stream != null) {
        _localRenderer.srcObject = stream;
      }
    });

    _remoteStreamSubscription = _webrtcService.remoteStreamStream.listen((
      stream,
    ) {
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
        return 'Calling...';
      case CallStatus.ringing:
        return 'Ringing...';
      case CallStatus.connected:
        return _formatDuration();
      default:
        return '';
    }
  }

  void _toggleFullScreen() {
    setState(() {
      _isFullScreen = !_isFullScreen;
      _resetControlsTimer();
    });
  }

  void _toggleMiniScreen() {
    setState(() {
      _isMiniScreen = !_isMiniScreen;
      _resetControlsTimer();
    });
  }

  void _toggleScreenSharing() async {
    try {
      await _webrtcService.toggleScreenShare();
      setState(() {
        _isScreenSharing = _webrtcService.isScreenSharing;
        _resetControlsTimer();
      });
    } catch (e) {
      debugPrint('Error toggling screen share: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Screen sharing error: $e'),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  void _toggleSpeaker() async {
    try {
      _webrtcService.toggleSpeaker();
      setState(() {
        _isSpeakerOn = !_isSpeakerOn;
        _resetControlsTimer();
      });
    } catch (e) {
      debugPrint('Error toggling speaker: $e');
    }
  }

  void _resetControlsTimer() {
    _hideControlsTimer?.cancel();
    if (!_showControls) {
      setState(() => _showControls = true);
    }
    _hideControlsTimer = Timer(const Duration(seconds: 5), () {
      if (mounted) {
        setState(() => _showControls = false);
      }
    });
  }

  void _startQualityMonitoring() {
    if (_webrtcService.peerConnection == null) return;

    _qualityMonitor = CallQualityMonitor(
      peerConnection: _webrtcService.peerConnection!,
      onQualityUpdate: (report) {
        if (mounted) {
          setState(() {
            _callState = _callState.copyWith(
              latencyMs: report.latencyMs,
              jitterMs: report.jitterMs,
              packetLoss: report.packetLoss,
            );
          });
        }
      },
      onWarning: (warning) {
        if (mounted) {
          setState(() {
            _qualityWarnings.add(warning);
            // Auto-remove warning after 5 seconds
            Future.delayed(const Duration(seconds: 5), () {
              if (mounted && _qualityWarnings.contains(warning)) {
                setState(() {
                  _qualityWarnings.remove(warning);
                });
              }
            });
          });
        }
      },
    );

    _qualityMonitor?.startMonitoring();
  }

  @override
  Widget build(BuildContext context) {
    final isVideoEnabled = !_callState.isAudioOnly && _callState.isVideoEnabled;

    if (_isMiniScreen) {
      return _buildMiniScreen(isVideoEnabled);
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onTap: () {
          setState(() {
            _showControls = !_showControls;
            _resetControlsTimer();
          });
        },
        child: Stack(
          children: [
            // Remote video (full screen background)
            if (isVideoEnabled)
              Positioned.fill(
                child: RTCVideoView(
                  _remoteRenderer,
                  objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                ),
              )
            else
              _buildAudioModeBackground(),

            // Screen sharing overlay
            if (_isScreenSharing)
              Positioned.fill(
                child: Container(
                  color: Colors.black87,
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.screen_share,
                          size: 80,
                          color: Colors.white.withOpacity(0.5),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Sharing Screen',
                          style: TextStyle(
                            fontSize: 20,
                            color: Colors.white.withOpacity(0.8),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

            // Call details panel
            if (_showCallDetails && _showControls)
              Positioned(
                top: 60,
                left: 16,
                right: 16,
                child: _buildCallDetailsPanel(),
              ),

            // Status overlay (when controls hidden)
            if (!_showControls && _callState.status == CallStatus.connected)
              Positioned(
                top: 20,
                left: 0,
                right: 0,
                child: Center(
                  child: Text(
                    _getStatusText(),
                    style: const TextStyle(
                      fontSize: 16,
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),

            // Local video (picture-in-picture)
            if (isVideoEnabled && _showControls)
              Positioned(
                top: 20,
                right: 20,
                width: _isFullScreen ? 100 : 120,
                height: _isFullScreen ? 140 : 160,
                child: GestureDetector(
                  onLongPress: _toggleFullScreen,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.white, width: 2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: RTCVideoView(
                        _localRenderer,
                        mirror: true,
                        objectFit:
                            RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                      ),
                    ),
                  ),
                ),
              ),

            // Call quality indicator
            if (_showControls && _callState.status == CallStatus.connected)
              Positioned(
                top: 20,
                right: _isFullScreen || !isVideoEnabled ? 20 : 150,
                child: CallQualityIndicator(
                  callState: _callState,
                  showDetails: false,
                ),
              ),

            // Network warning banners
            ..._qualityWarnings.map((warning) {
              return Positioned(
                top: 100,
                left: 0,
                right: 0,
                child: NetworkWarningBanner(
                  message: warning,
                  onDismiss: () {
                    setState(() {
                      _qualityWarnings.remove(warning);
                    });
                  },
                ),
              );
            }),

            // Call controls
            if (_showControls)
              Positioned(
                bottom: MediaQuery.of(context).padding.bottom + 20,
                left: 0,
                right: 0,
                child: _buildCallControls(isVideoEnabled),
              ),

            // Mini screen and full screen buttons
            if (_showControls)
              Positioned(top: 20, left: 20, child: _buildTopControls()),
          ],
        ),
      ),
    );
  }

  Widget _buildAudioModeBackground() {
    return Container(
      color: Colors.black,
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 80,
              backgroundColor: Colors.white.withOpacity(0.2),
              child: Text(
                (_callState.remoteUserName ?? widget.remoteUserName ?? 'U')
                    .substring(0, 1)
                    .toUpperCase(),
                style: const TextStyle(
                  fontSize: 64,
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 32),
            Text(
              _callState.remoteUserName ?? widget.remoteUserName ?? 'Unknown',
              style: const TextStyle(
                fontSize: 24,
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _getStatusText(),
              style: TextStyle(
                fontSize: 18,
                color: Colors.white.withOpacity(0.7),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCallDetailsPanel() {
    final now = DateTime.now();
    return Material(
      color: Colors.black.withOpacity(0.7),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Call Information',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                GestureDetector(
                  onTap: () {
                    setState(() => _showCallDetails = false);
                  },
                  child: const Icon(Icons.close, color: Colors.white),
                ),
              ],
            ),
            const Divider(color: Colors.white30),
            _buildDetailRow(
              'Name',
              _callState.remoteUserName ?? widget.remoteUserName ?? 'Unknown',
            ),
            _buildDetailRow('Duration', _getStatusText()),
            _buildDetailRow('Time', DateFormat('hh:mm a').format(now)),
            _buildDetailRow(
              'Type',
              _callState.isAudioOnly ? 'Audio Only' : 'Video Call',
            ),
            _buildDetailRow(
              'Video',
              _callState.isVideoEnabled ? 'Enabled' : 'Disabled',
            ),
            _buildDetailRow('Microphone', _callState.isMuted ? 'Muted' : 'On'),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withOpacity(0.7),
              fontSize: 13,
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopControls() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildIconButton(
          icon: Icons.info_outline,
          onPressed: () {
            setState(() => _showCallDetails = !_showCallDetails);
          },
          tooltip: 'Call Details',
        ),
        const SizedBox(width: 12),
        _buildIconButton(
          icon: _isFullScreen ? Icons.fullscreen_exit : Icons.fullscreen,
          onPressed: _toggleFullScreen,
          tooltip: _isFullScreen ? 'Exit Fullscreen' : 'Fullscreen',
        ),
        const SizedBox(width: 12),
        _buildIconButton(
          icon: Icons.picture_in_picture,
          onPressed: _toggleMiniScreen,
          tooltip: 'Mini Screen',
        ),
      ],
    );
  }

  Widget _buildCallControls(bool isVideoEnabled) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Secondary controls row
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _buildIconButton(
              icon: _isScreenSharing
                  ? Icons.screen_share
                  : Icons.screen_share_outlined,
              onPressed: _toggleScreenSharing,
              tooltip: 'Share Screen',
              isActive: _isScreenSharing,
            ),
            _buildIconButton(
              icon: _isSpeakerOn
                  ? Icons.speaker_phone
                  : Icons.speaker_phone_outlined,
              onPressed: _toggleSpeaker,
              tooltip: 'Speaker',
              isActive: _isSpeakerOn,
            ),
            if (isVideoEnabled)
              _buildIconButton(
                icon: _callState.isVideoEnabled
                    ? Icons.videocam
                    : Icons.videocam_off,
                onPressed: () async {
                  await _webrtcService.toggleVideo();
                },
                tooltip: 'Camera',
                isActive: _callState.isVideoEnabled,
              ),
            _buildIconButton(
              icon: _callState.isMuted ? Icons.mic_off : Icons.mic,
              onPressed: () {
                _webrtcService.toggleMute();
              },
              tooltip: 'Mute',
              isActive: _callState.isMuted,
            ),
          ],
        ),
        const SizedBox(height: 16),
        // End call button
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GestureDetector(
              onTap: () async {
                await _webrtcService.endCall();
              },
              child: Container(
                width: 70,
                height: 70,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.red,
                ),
                child: const Icon(
                  Icons.call_end,
                  color: Colors.white,
                  size: 32,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildIconButton({
    required IconData icon,
    required VoidCallback onPressed,
    required String tooltip,
    bool isActive = false,
  }) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onPressed,
        child: Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isActive
                ? AppColors.primaryOrange
                : Colors.white.withOpacity(0.2),
          ),
          child: Icon(icon, color: Colors.white, size: 24),
        ),
      ),
    );
  }

  Widget _buildMiniScreen(bool isVideoEnabled) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Positioned(
        bottom: 20,
        right: 20,
        width: 200,
        height: 280,
        child: GestureDetector(
          onTap: _toggleMiniScreen,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.5),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: isVideoEnabled
                ? Stack(
                    children: [
                      RTCVideoView(
                        _remoteRenderer,
                        objectFit:
                            RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                      ),
                      Positioned(
                        bottom: 8,
                        left: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.7),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _getStatusText(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                    ],
                  )
                : _buildAudioModeBackground(),
          ),
        ),
      ),
    );
  }
}
