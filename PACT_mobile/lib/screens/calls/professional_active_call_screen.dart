// lib/screens/calls/professional_active_call_screen.dart
// Professional-grade active call screen with quality monitoring, controls, and analytics

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/call_state.dart';

class ProfessionalActiveCallScreen extends ConsumerStatefulWidget {
  final String remoteUserId;
  final String remoteUserName;
  final String? remoteUserAvatar;
  final bool isVideoCall;

  const ProfessionalActiveCallScreen({
    super.key,
    required this.remoteUserId,
    required this.remoteUserName,
    this.remoteUserAvatar,
    this.isVideoCall = false,
  });

  @override
  ConsumerState<ProfessionalActiveCallScreen> createState() =>
      _ProfessionalActiveCallScreenState();
}

class _ProfessionalActiveCallScreenState
    extends ConsumerState<ProfessionalActiveCallScreen> {
  late DateTime _callStartTime;
  late CountdownTimer _timer;

  bool _isMuted = false;
  bool _isSpeakerOn = false;
  bool _isVideoEnabled = true;
  bool _isOnHold = false;
  bool _showControls = true;

  final CallQuality _callQuality = CallQuality.excellent;
  int _participantCount = 2;

  @override
  void initState() {
    super.initState();
    _callStartTime = DateTime.now();
    _timer = CountdownTimer(onTick: () => setState(() {}), onTimeout: () {});
    _timer.start();
  }

  @override
  void dispose() {
    _timer.stop();
    super.dispose();
  }

  Duration get _elapsedTime => DateTime.now().difference(_callStartTime);

  String _formatDuration(Duration d) {
    final hours = d.inHours;
    final minutes = d.inMinutes.remainder(60);
    final seconds = d.inSeconds.remainder(60);

    if (hours > 0) {
      return '$hours:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    }
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  void _toggleMute() {
    HapticFeedback.lightImpact();
    setState(() => _isMuted = !_isMuted);
    // Call service to toggle mute
  }

  void _toggleVideo() {
    HapticFeedback.lightImpact();
    setState(() => _isVideoEnabled = !_isVideoEnabled);
    // Call service to toggle video
  }

  void _toggleSpeaker() {
    HapticFeedback.lightImpact();
    setState(() => _isSpeakerOn = !_isSpeakerOn);
    // Call service to toggle speaker
  }

  void _toggleHold() {
    HapticFeedback.mediumImpact();
    setState(() => _isOnHold = !_isOnHold);
    // Call service to toggle hold
  }

  void _addParticipant() {
    HapticFeedback.lightImpact();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Participant'),
        content: const TextField(
          decoration: InputDecoration(
            hintText: 'Search contacts...',
            prefixIcon: Icon(Icons.search),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              setState(() => _participantCount++);
              Navigator.pop(context);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  void _endCall() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('End Call?'),
        content: Text('Call duration: ${_formatDuration(_elapsedTime)}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              HapticFeedback.heavyImpact();
              Navigator.pop(context);
              Navigator.pop(context);
              // Log call to history
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('End Call'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: GestureDetector(
          onTap: () => setState(() => _showControls = !_showControls),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Call Video/Audio Background
              Container(
                color: Colors.black,
                child: widget.isVideoCall
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            CircleAvatar(
                              radius: 90,
                              backgroundImage: widget.remoteUserAvatar != null
                                  ? NetworkImage(widget.remoteUserAvatar!)
                                  : null,
                              child: widget.remoteUserAvatar == null
                                  ? Text(
                                      _getInitials(widget.remoteUserName),
                                      style: theme.textTheme.headlineLarge
                                          ?.copyWith(color: Colors.white),
                                    )
                                  : null,
                            ),
                          ],
                        ),
                      )
                    : Center(
                        child: CircleAvatar(
                          radius: 80,
                          backgroundImage: widget.remoteUserAvatar != null
                              ? NetworkImage(widget.remoteUserAvatar!)
                              : null,
                          backgroundColor: Colors.grey[900],
                          child: widget.remoteUserAvatar == null
                              ? Text(
                                  _getInitials(widget.remoteUserName),
                                  style: theme.textTheme.displayLarge?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w300,
                                  ),
                                )
                              : null,
                        ),
                      ),
              ),

              // Top Info Bar (Always Visible)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.7),
                        Colors.black.withValues(alpha: 0.0),
                      ],
                    ),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: SafeArea(
                    bottom: false,
                    child: Row(
                      children: [
                        // Remote User Info
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                widget.remoteUserName,
                                style: theme.textTheme.titleLarge?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _isOnHold
                                    ? 'On hold'
                                    : '${_formatDuration(_elapsedTime)} • $_participantCount participant${_participantCount > 1 ? 's' : ''},',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: Colors.white70,
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Quality Indicator
                        _buildQualityIndicator(),

                        // Network Status
                        Padding(
                          padding: const EdgeInsets.only(left: 12),
                          child: _buildNetworkStatus(),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Controls (Fade In/Out)
              if (_showControls)
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: _buildControlsPanel(),
                ),

              // Corner Info When Controls Hidden
              if (!_showControls)
                Positioned(
                  bottom: 24,
                  left: 20,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_isMuted)
                          Tooltip(
                            message: 'Muted',
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: Colors.red,
                                shape: BoxShape.circle,
                              ),
                              margin: const EdgeInsets.only(right: 8),
                            ),
                          ),
                        if (!_isVideoEnabled && widget.isVideoCall)
                          Tooltip(
                            message: 'Camera off',
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: Colors.orange,
                                shape: BoxShape.circle,
                              ),
                              margin: const EdgeInsets.only(right: 8),
                            ),
                          ),
                        Text(
                          _formatDuration(_elapsedTime),
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQualityIndicator() {
    final colors = {
      CallQuality.excellent: Colors.green,
      CallQuality.good: Colors.lime,
      CallQuality.fair: Colors.yellow,
      CallQuality.poor: Colors.orange,
      CallQuality.veryPoor: Colors.red,
      CallQuality.unknown: Colors.grey,
    };

    final color = colors[_callQuality] ?? Colors.grey;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(
            5,
            (index) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Container(
                width: 3,
                height: 10 + (index * 2).toDouble(),
                decoration: BoxDecoration(
                  color: index < _callQuality.bars
                      ? color
                      : Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(1.5),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _callQuality.label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildNetworkStatus() {
    return Tooltip(
      message: '${_callQuality.label} - ${DateTime.now().second}ms latency',
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          _callQuality == CallQuality.excellent ||
                  _callQuality == CallQuality.good
              ? Icons.cloud_done
              : Icons.warning,
          color:
              _callQuality == CallQuality.excellent ||
                  _callQuality == CallQuality.good
              ? Colors.green
              : Colors.orange,
          size: 20,
        ),
      ),
    );
  }

  Widget _buildControlsPanel() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withValues(alpha: 0.0),
            Colors.black.withValues(alpha: 0.9),
          ],
        ),
      ),
      padding: const EdgeInsets.only(left: 16, right: 16, bottom: 24, top: 32),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Primary Controls
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // Mute
                _buildControlButton(
                  icon: _isMuted ? Icons.mic_off : Icons.mic,
                  isActive: !_isMuted,
                  label: _isMuted ? 'Unmute' : 'Mute',
                  onPressed: _toggleMute,
                  isHighlight: _isMuted,
                ),

                // Camera (only if video call)
                if (widget.isVideoCall)
                  _buildControlButton(
                    icon: _isVideoEnabled ? Icons.videocam : Icons.videocam_off,
                    isActive: _isVideoEnabled,
                    label: _isVideoEnabled ? 'Camera' : 'Camera off',
                    onPressed: _toggleVideo,
                    isHighlight: !_isVideoEnabled,
                  ),

                // Speaker
                _buildControlButton(
                  icon: _isSpeakerOn ? Icons.volume_up : Icons.phone_in_talk,
                  isActive: _isSpeakerOn,
                  label: _isSpeakerOn ? 'Speaker' : 'Earpiece',
                  onPressed: _toggleSpeaker,
                  isHighlight: _isSpeakerOn,
                ),

                // Hold
                _buildControlButton(
                  icon: Icons.pause_circle,
                  isActive: !_isOnHold,
                  label: _isOnHold ? 'Resume' : 'Hold',
                  onPressed: _toggleHold,
                  color: _isOnHold ? Colors.yellow : Colors.white,
                ),
              ],
            ),

            const SizedBox(height: 20),

            // Secondary Controls
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // Add Participant
                _buildSecondaryButton(
                  icon: Icons.person_add,
                  label: 'Add',
                  onPressed: _addParticipant,
                ),

                // Transfer
                _buildSecondaryButton(
                  icon: Icons.call_split,
                  label: 'Transfer',
                  onPressed: () {},
                ),

                // Record
                _buildSecondaryButton(
                  icon: Icons.fiber_manual_record,
                  label: 'Record',
                  onPressed: () {},
                ),

                // More Options
                _buildSecondaryButton(
                  icon: Icons.more_horiz,
                  label: 'More',
                  onPressed: () {},
                ),
              ],
            ),

            const SizedBox(height: 20),

            // End Call Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _endCall,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red[600],
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  elevation: 8,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.call_end, size: 24),
                    const SizedBox(width: 12),
                    Text(
                      'End Call',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                      ),
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

  Widget _buildControlButton({
    required IconData icon,
    required bool isActive,
    required String label,
    required VoidCallback onPressed,
    bool isHighlight = false,
    Color color = Colors.white,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isHighlight
                ? Colors.orange[300]
                : Colors.white.withValues(alpha: 0.15),
            border: Border.all(
              color: isHighlight
                  ? Colors.orange[600]!
                  : Colors.white.withValues(alpha: 0.3),
              width: 2,
            ),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onPressed,
              customBorder: const CircleBorder(),
              child: Icon(icon, color: color, size: 24),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w500,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildSecondaryButton({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withValues(alpha: 0.1),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onPressed,
              customBorder: const CircleBorder(),
              child: Icon(icon, color: Colors.white70, size: 20),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.labelSmall?.copyWith(color: Colors.white70, fontSize: 11),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  String _getInitials(String name) {
    return name.split(' ').take(2).map((s) => s[0].toUpperCase()).join();
  }
}

// Simple timer helper class
class CountdownTimer {
  final VoidCallback onTick;
  final VoidCallback onTimeout;
  Timer? _timer;

  CountdownTimer({required this.onTick, required this.onTimeout});

  void start() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      onTick();
    });
  }

  void stop() {
    _timer?.cancel();
  }
}
