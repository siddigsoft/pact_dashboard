// lib/services/jitsi_meet_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../models/call_signal.dart';
import '../models/call_state.dart';

/// Jitsi Meet service for handling reliable video/audio calls
/// Uses Jitsi's free infrastructure (meet.jit.si) or can be configured for self-hosted
class JitsiMeetService {
  static final JitsiMeetService _instance = JitsiMeetService._internal();
  factory JitsiMeetService() => _instance;
  JitsiMeetService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;
  
  // User info
  String? _userId;
  String? _userName;
  String? _userAvatar;
  String? _userEmail;
  
  // Current call state
  String? _currentCallId;
  String? _currentRoomName;
  String? _remoteUserId;
  String? _remoteUserName;
  String? _remoteUserAvatar;
  bool _isInCall = false;
  bool _isAudioOnly = false;
  
  // Signaling channel
  RealtimeChannel? _signalingChannel;
  
  // Stream controllers
  final _callStateController = StreamController<JitsiCallState>.broadcast();
  Stream<JitsiCallState> get callStateStream => _callStateController.stream;
  
  final _incomingCallController = StreamController<JitsiIncomingCall>.broadcast();
  Stream<JitsiIncomingCall> get incomingCallStream => _incomingCallController.stream;
  
  // Jitsi server configuration
  // Use meet.jit.si (free) or your own self-hosted Jitsi server
  static const String defaultServerUrl = 'https://meet.jit.si';
  String _serverUrl = defaultServerUrl;
  
  /// Initialize the service with user info
  Future<void> initialize({
    required String userId,
    required String userName,
    String? userAvatar,
    String? userEmail,
    String? customServerUrl,
  }) async {
    _userId = userId;
    _userName = userName;
    _userAvatar = userAvatar;
    _userEmail = userEmail;
    
    if (customServerUrl != null && customServerUrl.isNotEmpty) {
      _serverUrl = customServerUrl;
    }
    
    await _setupSignalingChannel();
    debugPrint('[JitsiMeet] Initialized for user: $userName');
  }
  
  /// Setup Supabase realtime channel for Jitsi call signaling
  Future<void> _setupSignalingChannel() async {
    if (_userId == null) return;
    
    // Clean up existing channel
    if (_signalingChannel != null) {
      await _supabase.removeChannel(_signalingChannel!);
    }
    
    final channelName = 'jitsi-signaling:$_userId';
    _signalingChannel = _supabase.channel(channelName);
    
    _signalingChannel!
      .onBroadcast(
        event: 'jitsi-signal',
        callback: (payload) {
          _handleSignal(payload);
        },
      )
      .subscribe();
    
    debugPrint('[JitsiMeet] Signaling channel subscribed: $channelName');
  }
  
  /// Handle incoming Jitsi signals
  void _handleSignal(Map<String, dynamic> payload) {
    try {
      final signal = CallSignal.fromJson(payload);
      
      // Ignore signals not meant for us
      if (signal.to != _userId) return;
      
      debugPrint('[JitsiMeet] Received signal: ${signal.type.name} from ${signal.fromName}');
      
      switch (signal.type) {
        case CallSignalType.jitsiInvite:
          _handleIncomingCall(signal);
          break;
        case CallSignalType.jitsiAccept:
          _handleCallAccepted(signal);
          break;
        case CallSignalType.jitsiReject:
          _handleCallRejected(signal);
          break;
        case CallSignalType.callEnd:
          _handleCallEnded(signal);
          break;
        default:
          break;
      }
    } catch (e) {
      debugPrint('[JitsiMeet] Error handling signal: $e');
    }
  }
  
  /// Handle incoming Jitsi call invite
  void _handleIncomingCall(CallSignal signal) {
    if (_isInCall) {
      // Already in a call, send busy signal
      _sendSignal(signal.from, CallSignalType.callBusy);
      return;
    }
    
    final incomingCall = JitsiIncomingCall(
      callId: signal.callId ?? '',
      roomName: signal.jitsiRoom ?? '',
      callerId: signal.from,
      callerName: signal.fromName,
      callerAvatar: signal.fromAvatar,
      isAudioOnly: signal.isAudioOnly ?? false,
    );
    
    _incomingCallController.add(incomingCall);
  }
  
  /// Handle call accepted by remote user
  void _handleCallAccepted(CallSignal signal) {
    if (signal.callId == _currentCallId) {
      _callStateController.add(JitsiCallState(
        status: JitsiCallStatus.accepted,
        roomName: _currentRoomName,
        remoteUserName: signal.fromName,
      ));
    }
  }
  
  /// Handle call rejected by remote user
  void _handleCallRejected(CallSignal signal) {
    if (signal.callId == _currentCallId) {
      _isInCall = false;
      _currentCallId = null;
      _currentRoomName = null;
      
      _callStateController.add(JitsiCallState(
        status: JitsiCallStatus.rejected,
        remoteUserName: signal.fromName,
      ));
    }
  }
  
  /// Handle call ended
  void _handleCallEnded(CallSignal signal) {
    if (signal.callId == _currentCallId || signal.from == _remoteUserId) {
      endCall();
    }
  }
  
  /// Generate a unique room name for the call
  String _generateRoomName() {
    final uuid = const Uuid().v4().substring(0, 8);
    final timestamp = DateTime.now().millisecondsSinceEpoch.toString().substring(8);
    return 'pact-$uuid-$timestamp';
  }
  
  /// Start a Jitsi call with a remote user
  Future<JitsiCallResult> startCall({
    required String remoteUserId,
    required String remoteUserName,
    String? remoteUserAvatar,
    bool audioOnly = false,
  }) async {
    if (_isInCall) {
      return JitsiCallResult(
        success: false,
        error: 'Already in a call',
      );
    }
    
    try {
      _isInCall = true;
      _isAudioOnly = audioOnly;
      _remoteUserId = remoteUserId;
      _remoteUserName = remoteUserName;
      _remoteUserAvatar = remoteUserAvatar;
      _currentCallId = const Uuid().v4();
      _currentRoomName = _generateRoomName();
      
      // Send call invite to remote user
      await _sendSignal(
        remoteUserId,
        CallSignalType.jitsiInvite,
        jitsiRoom: _currentRoomName,
        isAudioOnly: audioOnly,
      );
      
      _callStateController.add(JitsiCallState(
        status: JitsiCallStatus.calling,
        roomName: _currentRoomName,
        remoteUserName: remoteUserName,
      ));
      
      return JitsiCallResult(
        success: true,
        roomName: _currentRoomName,
        serverUrl: _serverUrl,
      );
    } catch (e) {
      _isInCall = false;
      _currentCallId = null;
      _currentRoomName = null;
      
      return JitsiCallResult(
        success: false,
        error: e.toString(),
      );
    }
  }
  
  /// Accept an incoming Jitsi call
  Future<JitsiCallResult> acceptCall(JitsiIncomingCall incomingCall) async {
    try {
      _isInCall = true;
      _isAudioOnly = incomingCall.isAudioOnly;
      _currentCallId = incomingCall.callId;
      _currentRoomName = incomingCall.roomName;
      _remoteUserId = incomingCall.callerId;
      _remoteUserName = incomingCall.callerName;
      _remoteUserAvatar = incomingCall.callerAvatar;
      
      // Send accept signal
      await _sendSignal(
        incomingCall.callerId,
        CallSignalType.jitsiAccept,
        jitsiRoom: incomingCall.roomName,
      );
      
      _callStateController.add(JitsiCallState(
        status: JitsiCallStatus.connected,
        roomName: _currentRoomName,
        remoteUserName: incomingCall.callerName,
      ));
      
      return JitsiCallResult(
        success: true,
        roomName: incomingCall.roomName,
        serverUrl: _serverUrl,
      );
    } catch (e) {
      return JitsiCallResult(
        success: false,
        error: e.toString(),
      );
    }
  }
  
  /// Reject an incoming Jitsi call
  Future<void> rejectCall(JitsiIncomingCall incomingCall) async {
    await _sendSignal(
      incomingCall.callerId,
      CallSignalType.jitsiReject,
    );
  }
  
  /// End the current call
  Future<void> endCall() async {
    if (_remoteUserId != null) {
      await _sendSignal(_remoteUserId!, CallSignalType.callEnd);
    }
    
    _isInCall = false;
    _currentCallId = null;
    _currentRoomName = null;
    _remoteUserId = null;
    _remoteUserName = null;
    _remoteUserAvatar = null;
    
    _callStateController.add(JitsiCallState(
      status: JitsiCallStatus.ended,
    ));
  }
  
  /// Send a signal to a remote user via Supabase
  Future<void> _sendSignal(
    String toUserId,
    CallSignalType type, {
    String? jitsiRoom,
    bool? isAudioOnly,
  }) async {
    if (_userId == null) return;
    
    final channelName = 'jitsi-signaling:$toUserId';
    final channel = _supabase.channel(channelName);
    
    final signal = CallSignal(
      type: type,
      from: _userId!,
      to: toUserId,
      fromName: _userName ?? 'Unknown',
      fromAvatar: _userAvatar,
      callId: _currentCallId,
      jitsiRoom: jitsiRoom,
      isAudioOnly: isAudioOnly,
    );
    
    await channel.subscribe();
    await channel.sendBroadcastMessage(
      event: 'jitsi-signal',
      payload: signal.toJson(),
    );
    
    debugPrint('[JitsiMeet] Sent signal: ${type.name} to $toUserId');
  }
  
  /// Get the Jitsi meeting URL for web or external apps
  String getMeetingUrl() {
    if (_currentRoomName == null) return '';
    return '$_serverUrl/$_currentRoomName';
  }
  
  /// Get Jitsi configuration options for the Flutter SDK
  Map<String, dynamic> getJitsiOptions() {
    return {
      'serverURL': _serverUrl,
      'room': _currentRoomName,
      'userInfo': {
        'displayName': _userName,
        'email': _userEmail,
        'avatarURL': _userAvatar,
      },
      'configOverrides': {
        'startWithAudioMuted': false,
        'startWithVideoMuted': _isAudioOnly,
        'prejoinPageEnabled': false,
        'disableDeepLinking': true,
        'enableClosePage': false,
        'enableWelcomePage': false,
        'enableLobbyChat': false,
        'resolution': 720,
        'constraints': {
          'video': {
            'height': {'ideal': 720, 'max': 720, 'min': 240},
          },
        },
      },
      'featureFlags': {
        'add-people.enabled': false,
        'calendar.enabled': false,
        'call-integration.enabled': true,
        'car-mode.enabled': false,
        'close-captions.enabled': false,
        'help.enabled': false,
        'invite.enabled': false,
        'live-streaming.enabled': false,
        'meeting-name.enabled': true,
        'meeting-password.enabled': false,
        'pip.enabled': true,
        'raise-hand.enabled': true,
        'reactions.enabled': true,
        'recording.enabled': false,
        'security-options.enabled': false,
        'tile-view.enabled': true,
        'video-share.enabled': false,
        'welcomepage.enabled': false,
      },
    };
  }
  
  /// Check if currently in a call
  bool get isInCall => _isInCall;
  
  /// Get current room name
  String? get currentRoomName => _currentRoomName;
  
  /// Get server URL
  String get serverUrl => _serverUrl;
  
  /// Get remote user info
  String? get remoteUserName => _remoteUserName;
  String? get remoteUserAvatar => _remoteUserAvatar;
  
  /// Dispose resources
  void dispose() {
    if (_signalingChannel != null) {
      _supabase.removeChannel(_signalingChannel!);
    }
    _callStateController.close();
    _incomingCallController.close();
  }
}

/// Jitsi call status enum
enum JitsiCallStatus {
  idle,
  calling,
  ringing,
  accepted,
  connected,
  ended,
  rejected,
  busy,
  failed,
}

/// Jitsi call state model
class JitsiCallState {
  final JitsiCallStatus status;
  final String? roomName;
  final String? remoteUserName;
  final String? error;
  
  JitsiCallState({
    this.status = JitsiCallStatus.idle,
    this.roomName,
    this.remoteUserName,
    this.error,
  });
}

/// Incoming Jitsi call model
class JitsiIncomingCall {
  final String callId;
  final String roomName;
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final bool isAudioOnly;
  
  JitsiIncomingCall({
    required this.callId,
    required this.roomName,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    this.isAudioOnly = false,
  });
}

/// Jitsi call result model
class JitsiCallResult {
  final bool success;
  final String? roomName;
  final String? serverUrl;
  final String? error;
  
  JitsiCallResult({
    required this.success,
    this.roomName,
    this.serverUrl,
    this.error,
  });
  
  String get meetingUrl => '$serverUrl/$roomName';
}
