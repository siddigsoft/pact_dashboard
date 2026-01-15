// lib/screens/call_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/webrtc_service.dart';
import '../models/call_state.dart';
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

class _CallScreenState extends State<CallScreen> {
  final WebRTCService _webrtcService = WebRTCService();
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();

  StreamSubscription<CallState>? _callStateSubscription;
  StreamSubscription<MediaStream?>? _localStreamSubscription;
  StreamSubscription<MediaStream?>? _remoteStreamSubscription;

  CallState _callState = CallState();
  Duration _callDuration = Duration.zero;
  Timer? _durationTimer;

  @override
  void initState() {
    super.initState();
    _initRenderers();
    _subscribeToStreams();
  }

  @override
  void dispose() {
    _durationTimer?.cancel();
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
        return 'Calling...';
      case CallStatus.ringing:
        return 'Ringing...';
      case CallStatus.connected:
        return _formatDuration();
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isVideoEnabled = !_callState.isAudioOnly && _callState.isVideoEnabled;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // Remote video (full screen)
            if (isVideoEnabled)
              Positioned.fill(
                child: RTCVideoView(
                  _remoteRenderer,
                  objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                ),
              )
            else
              // Audio-only mode or video disabled
              Positioned.fill(
                child: Container(
                  color: Colors.black,
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircleAvatar(
                          radius: 60,
                          backgroundColor: Colors.white.withOpacity(0.2),
                          child: Text(
                            (_callState.remoteUserName ?? widget.remoteUserName ?? 'U')
                                .substring(0, 1)
                                .toUpperCase(),
                            style: const TextStyle(
                              fontSize: 48,
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          _callState.remoteUserName ?? widget.remoteUserName ?? 'Unknown',
                          style: const TextStyle(
                            fontSize: 24,
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _getStatusText(),
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.white.withOpacity(0.7),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

            // Local video (picture-in-picture)
            if (isVideoEnabled)
              Positioned(
                top: 20,
                right: 20,
                width: 120,
                height: 160,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: RTCVideoView(
                    _localRenderer,
                    mirror: true,
                    objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                  ),
                ),
              ),

            // Status overlay
            if (!isVideoEnabled || _callState.status != CallStatus.connected)
              Positioned(
                top: 40,
                left: 0,
                right: 0,
                child: Column(
                  children: [
                    Text(
                      _callState.remoteUserName ?? widget.remoteUserName ?? 'Unknown',
                      style: const TextStyle(
                        fontSize: 24,
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _getStatusText(),
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
                  ],
                ),
              ),

            // Call controls
            Positioned(
              bottom: 40,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  // Toggle video
                  if (!_callState.isAudioOnly)
                    _buildCallControl(
                      icon: _callState.isVideoEnabled
                          ? Icons.videocam
                          : Icons.videocam_off,
                      onPressed: () async {
                        await _webrtcService.toggleVideo();
                      },
                      backgroundColor: _callState.isVideoEnabled
                          ? Colors.white.withOpacity(0.2)
                          : Colors.red,
                    ),

                  // Toggle mute
                  _buildCallControl(
                    icon: _callState.isMuted ? Icons.mic_off : Icons.mic,
                    onPressed: () {
                      _webrtcService.toggleMute();
                    },
                    backgroundColor: _callState.isMuted
                        ? Colors.red
                        : Colors.white.withOpacity(0.2),
                  ),

                  // End call
                  _buildCallControl(
                    icon: Icons.call_end,
                    onPressed: () async {
                      await _webrtcService.endCall();
                    },
                    backgroundColor: Colors.red,
                    size: 70,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCallControl({
    required IconData icon,
    required VoidCallback onPressed,
    required Color backgroundColor,
    double size = 56,
  }) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: backgroundColor,
          shape: BoxShape.circle,
        ),
        child: Icon(
          icon,
          color: Colors.white,
          size: size * 0.5,
        ),
      ),
    );
  }
}
