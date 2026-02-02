import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../../providers/call_provider.dart';
import '../../services/webrtc_call_service.dart';

class ActiveCallScreen extends ConsumerStatefulWidget {
  final String participantId;
  final String participantName;
  final String? participantAvatar;
  final bool isVideoCall;

  const ActiveCallScreen({
    super.key,
    required this.participantId,
    required this.participantName,
    this.participantAvatar,
    this.isVideoCall = false,
  });

  @override
  ConsumerState<ActiveCallScreen> createState() => _ActiveCallScreenState();
}

class _ActiveCallScreenState extends ConsumerState<ActiveCallScreen> {
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();
  
  Timer? _durationTimer;
  int _callDuration = 0;
  bool _showControls = true;

  @override
  void initState() {
    super.initState();
    _initRenderers();
    _startDurationTimer();
    _hideControlsAfterDelay();
  }

  Future<void> _initRenderers() async {
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();
    
    final callState = ref.read(callStateProvider);
    if (callState.localStream != null) {
      _localRenderer.srcObject = callState.localStream;
    }
    if (callState.remoteStream != null) {
      _remoteRenderer.srcObject = callState.remoteStream;
    }
  }

  void _startDurationTimer() {
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() {
        _callDuration++;
      });
    });
  }

  void _hideControlsAfterDelay() {
    if (widget.isVideoCall) {
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted) {
          setState(() {
            _showControls = false;
          });
        }
      });
    }
  }

  void _toggleControls() {
    if (widget.isVideoCall) {
      setState(() {
        _showControls = !_showControls;
      });
      if (_showControls) {
        _hideControlsAfterDelay();
      }
    }
  }

  String _formatDuration(int seconds) {
    final minutes = (seconds ~/ 60).toString().padLeft(2, '0');
    final secs = (seconds % 60).toString().padLeft(2, '0');
    return '$minutes:$secs';
  }

  void _endCall() {
    ref.read(callStateProvider.notifier).endCall();
    Navigator.of(context).pop();
  }

  String _getInitials(String name) {
    final parts = name.split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  @override
  void dispose() {
    _durationTimer?.cancel();
    _localRenderer.dispose();
    _remoteRenderer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final callState = ref.watch(callStateProvider);
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    
    if (callState.remoteStream != null && _remoteRenderer.srcObject == null) {
      _remoteRenderer.srcObject = callState.remoteStream;
    }
    if (callState.localStream != null && _localRenderer.srcObject == null) {
      _localRenderer.srcObject = callState.localStream;
    }
    
    if (callState.callState == CallState.ended) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).pop();
      });
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onTap: _toggleControls,
        child: Stack(
          children: [
            if (widget.isVideoCall && callState.remoteStream != null)
              Positioned.fill(
                child: RTCVideoView(
                  _remoteRenderer,
                  objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                ),
              )
            else
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Theme.of(context).primaryColor.withOpacity(0.8),
                      Theme.of(context).primaryColor,
                    ],
                  ),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 120,
                        height: 120,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white,
                          image: widget.participantAvatar != null
                              ? DecorationImage(
                                  image: NetworkImage(widget.participantAvatar!),
                                  fit: BoxFit.cover,
                                )
                              : null,
                        ),
                        child: widget.participantAvatar == null
                            ? Center(
                                child: Text(
                                  _getInitials(widget.participantName),
                                  style: TextStyle(
                                    fontSize: 48,
                                    fontWeight: FontWeight.bold,
                                    color: Theme.of(context).primaryColor,
                                  ),
                                ),
                              )
                            : null,
                      ),
                      const SizedBox(height: 24),
                      Text(
                        widget.participantName,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        callState.callState == CallState.connecting
                            ? (isArabic ? 'جاري الاتصال...' : 'Connecting...')
                            : _formatDuration(_callDuration),
                        style: const TextStyle(
                          fontSize: 16,
                          color: Colors.white70,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            
            if (widget.isVideoCall && callState.localStream != null)
              Positioned(
                top: 50,
                right: 16,
                child: Container(
                  width: 100,
                  height: 140,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                  clipBehavior: Clip.hardEdge,
                  child: RTCVideoView(
                    _localRenderer,
                    mirror: true,
                    objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                  ),
                ),
              ),
            
            if (_showControls || !widget.isVideoCall)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: EdgeInsets.only(
                    top: MediaQuery.of(context).padding.top + 8,
                    left: 16,
                    right: 16,
                    bottom: 16,
                  ),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withOpacity(0.6),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const Spacer(),
                      if (widget.isVideoCall)
                        Column(
                          children: [
                            Text(
                              widget.participantName,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              _formatDuration(_callDuration),
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      const Spacer(),
                      const SizedBox(width: 48),
                    ],
                  ),
                ),
              ),
            
            if (_showControls || !widget.isVideoCall)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: EdgeInsets.only(
                    top: 24,
                    left: 16,
                    right: 16,
                    bottom: MediaQuery.of(context).padding.bottom + 24,
                  ),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        Colors.black.withOpacity(0.8),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _ControlButton(
                        icon: callState.isMuted ? Icons.mic_off : Icons.mic,
                        label: isArabic 
                            ? (callState.isMuted ? 'إلغاء الكتم' : 'كتم')
                            : (callState.isMuted ? 'Unmute' : 'Mute'),
                        isActive: callState.isMuted,
                        onPressed: () {
                          ref.read(callStateProvider.notifier).toggleMute();
                        },
                      ),
                      _ControlButton(
                        icon: callState.isSpeakerOn ? Icons.volume_up : Icons.volume_off,
                        label: isArabic 
                            ? (callState.isSpeakerOn ? 'سماعة' : 'سماعة')
                            : 'Speaker',
                        isActive: callState.isSpeakerOn,
                        onPressed: () {
                          ref.read(callStateProvider.notifier).toggleSpeaker();
                        },
                      ),
                      if (widget.isVideoCall)
                        _ControlButton(
                          icon: callState.isVideoEnabled ? Icons.videocam : Icons.videocam_off,
                          label: isArabic ? 'كاميرا' : 'Camera',
                          isActive: callState.isVideoEnabled,
                          onPressed: () {
                            ref.read(callStateProvider.notifier).toggleVideo();
                          },
                        ),
                      _ControlButton(
                        icon: Icons.call_end,
                        label: isArabic ? 'إنهاء' : 'End',
                        isEndCall: true,
                        onPressed: _endCall,
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final bool isEndCall;
  final VoidCallback onPressed;

  const _ControlButton({
    required this.icon,
    required this.label,
    this.isActive = false,
    this.isEndCall = false,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isEndCall
                ? Colors.red
                : (isActive ? Colors.white : Colors.white.withOpacity(0.2)),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onPressed,
              borderRadius: BorderRadius.circular(28),
              child: Center(
                child: Icon(
                  icon,
                  size: 24,
                  color: isEndCall
                      ? Colors.white
                      : (isActive ? Colors.black87 : Colors.white),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}
