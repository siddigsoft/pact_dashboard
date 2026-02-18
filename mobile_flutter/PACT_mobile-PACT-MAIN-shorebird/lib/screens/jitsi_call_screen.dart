import 'package:flutter/material.dart';
import 'calls/active_call_screen.dart';

class JitsiCallScreen extends StatelessWidget {
  final String odId;
  final String odName;
  final String? avatarUrl;
  final bool isVideoCall;
  final bool isIncoming;

  const JitsiCallScreen({
    super.key,
    required this.odId,
    required this.odName,
    this.avatarUrl,
    this.isVideoCall = false,
    this.isIncoming = false,
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
    debugPrint('[JitsiCall] JitsiCallScreen initState() room=${widget.roomName} serverUrl=${widget.serverUrl} remoteUserName=${widget.remoteUserName}');
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
    debugPrint('[JitsiCall] JitsiCallScreen _subscribeToCallState() subscribing to callStateStream');
    _callStateSubscription = _jitsiService.callStateStream.listen((state) {
      debugPrint('[JitsiCall] JitsiCallScreen callStateStream event: status=${state.status} roomName=${state.roomName} error=${state.error}');
      if (!mounted) return;

      switch (state.status) {
        case JitsiCallStatus.connected:
          debugPrint('[JitsiCall] JitsiCallScreen state=connected, setting _isConnected=true');
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
          debugPrint('[JitsiCall] JitsiCallScreen state=${state.status} calling _endCall()');
          _endCall();
          break;
        default:
          debugPrint('[JitsiCall] JitsiCallScreen state=${state.status} (no UI change)');
          break;
      }
    });
  }

  Future<void> _startCall() async {
    debugPrint('[JitsiCall] JitsiCallScreen _startCall() ENTER room=${widget.roomName} serverUrl=${widget.serverUrl} isOutgoing=${widget.isOutgoing}');
    // Simulate connection delay for UX
    await Future.delayed(const Duration(seconds: 2));

    if (mounted) {
      debugPrint('[JitsiCall] JitsiCallScreen _startCall() after delay, launching meeting');
      setState(() {
        _isConnecting = false;
        _isConnected = true;
      });
      _startDurationTimer();
      _launchJitsiMeeting();
    } else {
      debugPrint('[JitsiCall] JitsiCallScreen _startCall() SKIP not mounted');
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

    debugPrint('[JitsiCall] JitsiCallScreen _launchJitsiMeeting() room=$meetingUrl fullUrl=$fullUrl');

    try {
      final uri = Uri.parse(fullUrl);
      final canLaunch = await canLaunchUrl(uri);
      debugPrint('[JitsiCall] JitsiCallScreen canLaunchUrl($uri)=$canLaunch');
      if (canLaunch) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        debugPrint('[JitsiCall] JitsiCallScreen launchUrl() completed');
      } else {
        debugPrint('[JitsiCall] JitsiCallScreen canLaunchUrl=false, showing SnackBar');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Could not open Jitsi meeting. Please install a web browser.',
              ),
            ),
          );
        }
      }
    } catch (e, st) {
      debugPrint('[JitsiCall] JitsiCallScreen _launchJitsiMeeting() ERROR: $e');
      debugPrint('[JitsiCall] JitsiCallScreen _launchJitsiMeeting() stackTrace: $st');
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
    debugPrint('[JitsiCall] JitsiCallScreen _endCall() calling _jitsiService.endCall()');
    _jitsiService.endCall();
    WakelockPlus.disable();

    if (mounted) {
      debugPrint('[JitsiCall] JitsiCallScreen _endCall() popping Navigator');
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
    return ActiveCallScreen(
      participantId: odId,
      participantName: odName,
      participantAvatar: avatarUrl,
      isVideoCall: isVideoCall,
    );
  }
}
