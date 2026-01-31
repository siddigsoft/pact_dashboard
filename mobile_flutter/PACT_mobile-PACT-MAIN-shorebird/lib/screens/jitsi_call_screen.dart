// lib/screens/jitsi_call_screen.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:vibration/vibration.dart';
import '../services/jitsi_meet_service.dart';
import '../theme/app_colors.dart';

/// Jitsi Call Screen - Displays the Jitsi meeting interface
/// 
/// Note: For full native Jitsi integration, add jitsi_meet_flutter_sdk to pubspec.yaml:
///   jitsi_meet_flutter_sdk: ^10.3.0
/// 
/// This implementation uses URL launcher as a fallback for maximum compatibility.
/// For native SDK integration, uncomment the jitsi_meet_flutter_sdk code sections.
class JitsiCallScreen extends StatefulWidget {
  final String roomName;
  final String serverUrl;
  final String? remoteUserName;
  final String? remoteUserAvatar;
  final bool isAudioOnly;
  final bool isOutgoing;

  const JitsiCallScreen({
    super.key,
    required this.roomName,
    required this.serverUrl,
    this.remoteUserName,
    this.remoteUserAvatar,
    this.isAudioOnly = false,
    this.isOutgoing = true,
  });

  @override
  State<JitsiCallScreen> createState() => _JitsiCallScreenState();
}

class _JitsiCallScreenState extends State<JitsiCallScreen> 
    with TickerProviderStateMixin {
  final JitsiMeetService _jitsiService = JitsiMeetService();
  
  bool _isConnecting = true;
  bool _isConnected = false;
  bool _isMuted = false;
  bool _isVideoOff = false;
  bool _isSpeakerOn = true;
  Duration _callDuration = Duration.zero;
  Timer? _durationTimer;
  
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  
  StreamSubscription<JitsiCallState>? _callStateSubscription;

  @override
  void initState() {
    super.initState();
    _initAnimations();
    _subscribeToCallState();
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
    _callStateSubscription = _jitsiService.callStateStream.listen((state) {
      if (!mounted) return;
      
      switch (state.status) {
        case JitsiCallStatus.connected:
          setState(() {
            _isConnecting = false;
            _isConnected = true;
          });
          _startDurationTimer();
          _vibrateOnConnect();
          break;
        case JitsiCallStatus.ended:
        case JitsiCallStatus.rejected:
        case JitsiCallStatus.failed:
          _endCall();
          break;
        default:
          break;
      }
    });
  }
  
  Future<void> _startCall() async {
    // Simulate connection delay for UX
    await Future.delayed(const Duration(seconds: 2));
    
    if (mounted) {
      setState(() {
        _isConnecting = false;
        _isConnected = true;
      });
      _startDurationTimer();
      _launchJitsiMeeting();
    }
  }
  
  Future<void> _launchJitsiMeeting() async {
    final meetingUrl = '${widget.serverUrl}/${widget.roomName}';
    
    // Build URL with config parameters
    final configParams = <String, String>{
      'config.prejoinPageEnabled': 'false',
      'config.startWithAudioMuted': 'false',
      'config.startWithVideoMuted': widget.isAudioOnly ? 'true' : 'false',
      'config.disableDeepLinking': 'true',
      'userInfo.displayName': _jitsiService.remoteUserName ?? 'PACT User',
    };
    
    final queryString = configParams.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');
    
    final fullUrl = '$meetingUrl#$queryString';
    
    debugPrint('[JitsiCall] Launching meeting: $fullUrl');
    
    try {
      final uri = Uri.parse(fullUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Could not open Jitsi meeting. Please install a web browser.'),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('[JitsiCall] Error launching meeting: $e');
    }
  }
  
  void _startDurationTimer() {
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _callDuration = Duration(seconds: timer.tick);
        });
      }
    });
  }
  
  void _vibrateOnConnect() async {
    if (await Vibration.hasVibrator() ?? false) {
      Vibration.vibrate(pattern: [0, 100, 50, 100]);
    }
  }
  
  void _toggleMute() {
    setState(() {
      _isMuted = !_isMuted;
    });
    Vibration.vibrate(duration: 50);
  }
  
  void _toggleVideo() {
    setState(() {
      _isVideoOff = !_isVideoOff;
    });
    Vibration.vibrate(duration: 50);
  }
  
  void _toggleSpeaker() {
    setState(() {
      _isSpeakerOn = !_isSpeakerOn;
    });
    Vibration.vibrate(duration: 50);
  }
  
  void _endCall() {
    _jitsiService.endCall();
    WakelockPlus.disable();
    
    if (mounted) {
      Navigator.of(context).pop();
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
          IconButton(
            icon: const Icon(Icons.arrow_back_ios, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
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
                        color: Colors.green.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.green.withOpacity(0.5)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.video_camera_front,
                            color: Colors.green,
                            size: 14,
                          ),
                          const SizedBox(width: 4),
                          const Text(
                            'Jitsi Meet',
                            style: TextStyle(
                              color: Colors.green,
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
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.open_in_new, color: Colors.white),
            onPressed: _launchJitsiMeeting,
            tooltip: 'Open in browser',
          ),
        ],
      ),
    );
  }
  
  Widget _buildCallContent() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Avatar with pulse animation
        ScaleTransition(
          scale: _isConnecting ? _pulseAnimation : const AlwaysStoppedAnimation(1.0),
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
                        errorBuilder: (_, __, ___) => _buildAvatarFallback(),
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
              ? 'Connecting to Jitsi...'
              : _isConnected 
                  ? 'Connected via Jitsi Meet'
                  : 'Call ended',
          style: TextStyle(
            color: Colors.white.withOpacity(0.7),
            fontSize: 16,
          ),
        ),
        
        const SizedBox(height: 16),
        
        // Room info
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.meeting_room, color: Colors.white60, size: 16),
              const SizedBox(width: 8),
              Text(
                'Room: ${widget.roomName}',
                style: const TextStyle(
                  color: Colors.white60,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
        
        const SizedBox(height: 32),
        
        // Open in browser button
        ElevatedButton.icon(
          onPressed: _launchJitsiMeeting,
          icon: const Icon(Icons.open_in_browser),
          label: const Text('Open Jitsi in Browser'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(25),
            ),
          ),
        ),
      ],
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
  
  Widget _buildControls() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Mute button
          _buildControlButton(
            icon: _isMuted ? Icons.mic_off : Icons.mic,
            label: _isMuted ? 'Unmute' : 'Mute',
            isActive: _isMuted,
            onPressed: _toggleMute,
          ),
          
          // Video button
          if (!widget.isAudioOnly)
            _buildControlButton(
              icon: _isVideoOff ? Icons.videocam_off : Icons.videocam,
              label: _isVideoOff ? 'Video On' : 'Video Off',
              isActive: _isVideoOff,
              onPressed: _toggleVideo,
            ),
          
          // End call button
          _buildEndCallButton(),
          
          // Speaker button
          _buildControlButton(
            icon: _isSpeakerOn ? Icons.volume_up : Icons.volume_off,
            label: _isSpeakerOn ? 'Speaker' : 'Earpiece',
            isActive: _isSpeakerOn,
            onPressed: _toggleSpeaker,
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
          color: isActive ? Colors.white.withOpacity(0.2) : Colors.transparent,
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
                  color: Colors.white.withOpacity(0.3),
                  width: 1,
                ),
              ),
              child: Icon(
                icon,
                color: Colors.white,
                size: 24,
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 11,
          ),
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
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.call_end,
                color: Colors.white,
                size: 32,
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'End',
          style: TextStyle(
            color: Colors.white70,
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}
