import 'dart:async';
import 'package:flutter/foundation.dart';
import 'webrtc_call_service.dart';

/// Log tag for filtering Jitsi/call logs when debugging.
void _jitsiLog(String message, [Object? detail]) {
  final detailStr = detail != null ? ' $detail' : '';
  debugPrint('[JitsiCall] $message$detailStr');
}

/// Jitsi Meet service for handling reliable video/audio calls
/// Uses Jitsi's free infrastructure (meet.jit.si) or can be configured for self-hosted
class JitsiMeetService {
  static final JitsiMeetService _instance = JitsiMeetService._internal();
  factory JitsiMeetService() => _instance;
  JitsiMeetService._internal();

  final WebRTCCallService _webrtcService = WebRTCCallService();

  bool _isInMeeting = false;
  bool get isInMeeting => _isInMeeting;

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

  final _incomingCallController =
      StreamController<JitsiIncomingCall>.broadcast();
  Stream<JitsiIncomingCall> get incomingCallStream =>
      _incomingCallController.stream;

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
    _jitsiLog(
      'initialize() ENTER',
      'userId=$userId userName=$userName customServerUrl=$customServerUrl',
    );
    _userId = userId;
    _userName = userName;
    _userAvatar = userAvatar;
    _userEmail = userEmail;

    if (customServerUrl != null && customServerUrl.isNotEmpty) {
      _serverUrl = customServerUrl;
      _jitsiLog('initialize() using custom server', _serverUrl);
    }

    await _setupSignalingChannel();
    _jitsiLog('initialize() DONE', 'user=$userName _serverUrl=$_serverUrl');
  }

  /// Setup Supabase realtime channel for Jitsi call signaling
  Future<void> _setupSignalingChannel() async {
    _jitsiLog('_setupSignalingChannel() ENTER', '_userId=$_userId');
    if (_userId == null) {
      _jitsiLog('_setupSignalingChannel() SKIP', 'no _userId');
      return;
    }

    // Clean up existing channel
    if (_signalingChannel != null) {
      _jitsiLog('_setupSignalingChannel() removing existing channel');
      await _supabase.removeChannel(_signalingChannel!);
    }

    final channelName = 'jitsi-signaling:$_userId';
    _signalingChannel = _supabase.channel(channelName);
    _jitsiLog('_setupSignalingChannel() created channel', channelName);

    _signalingChannel!
        .onBroadcast(
          event: 'jitsi-signal',
          callback: (payload) {
            _jitsiLog(
              '_setupSignalingChannel() RAW broadcast received',
              payload,
            );
            _handleSignal(payload);
          },
        )
        .subscribe();

    _jitsiLog('_setupSignalingChannel() DONE subscribed', channelName);
  }

  /// Handle incoming Jitsi signals
  void _handleSignal(Map<String, dynamic> payload) {
    _jitsiLog('_handleSignal() ENTER', 'payload=$payload');
    try {
      final signal = CallSignal.fromJson(payload);
      _jitsiLog(
        '_handleSignal() parsed',
        'type=${signal.type.name} from=${signal.from} to=${signal.to} callId=${signal.callId} jitsiRoom=${signal.jitsiRoom}',
      );

      // Ignore signals not meant for us
      if (signal.to != _userId) {
        _jitsiLog(
          '_handleSignal() IGNORE not for us',
          'to=${signal.to} _userId=$_userId',
        );
        return;
      }

      _jitsiLog(
        '_handleSignal() received',
        '${signal.type.name} from ${signal.fromName}',
      );

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
          _jitsiLog('_handleSignal() unhandled type', signal.type.name);
          break;
      }
    } catch (e, st) {
      _jitsiLog('_handleSignal() ERROR', '$e');
      debugPrint('[JitsiCall] _handleSignal stackTrace: $st');
    }
  }

  /// Handle incoming Jitsi call invite
  void _handleIncomingCall(CallSignal signal) {
    _jitsiLog(
      '_handleIncomingCall() ENTER',
      'callId=${signal.callId} room=${signal.jitsiRoom} _isInCall=$_isInCall',
    );
    if (_isInCall) {
      _jitsiLog('_handleIncomingCall() BUSY sending callBusy to', signal.from);
      _sendSignal(signal.from, CallSignalType.callBusy);
      return;
    }

    final roomName = signal.jitsiRoom ?? '';
    final callId = signal.callId ?? '';
    if (roomName.isEmpty || callId.isEmpty) {
      _jitsiLog(
        '_handleIncomingCall() INVALID invite',
        'empty roomName or callId',
      );
    }

    final incomingCall = JitsiIncomingCall(
      callId: callId,
      roomName: roomName,
      callerId: signal.from,
      callerName: signal.fromName,
      callerAvatar: signal.fromAvatar,
      isAudioOnly: signal.isAudioOnly ?? false,
    );
    _jitsiLog(
      '_handleIncomingCall() pushing to incomingCallStream',
      'callId=$callId roomName=$roomName',
    );
    _incomingCallController.add(incomingCall);
  }

  /// Handle call accepted by remote user
  void _handleCallAccepted(CallSignal signal) {
    _jitsiLog(
      '_handleCallAccepted()',
      'signal.callId=${signal.callId} _currentCallId=$_currentCallId',
    );
    if (signal.callId == _currentCallId) {
      _jitsiLog(
        '_handleCallAccepted() emitting accepted',
        'room=$_currentRoomName',
      );
      _callStateController.add(
        JitsiCallState(
          status: JitsiCallStatus.accepted,
          roomName: _currentRoomName,
          remoteUserName: signal.fromName,
        ),
      );
    } else {
      _jitsiLog('_handleCallAccepted() IGNORE callId mismatch');
    }
  }

  /// Handle call rejected by remote user
  void _handleCallRejected(CallSignal signal) {
    _jitsiLog(
      '_handleCallRejected()',
      'signal.callId=${signal.callId} _currentCallId=$_currentCallId',
    );
    if (signal.callId == _currentCallId) {
      _isInCall = false;
      _currentCallId = null;
      _currentRoomName = null;
      _jitsiLog('_handleCallRejected() emitting rejected');
      _callStateController.add(
        JitsiCallState(
          status: JitsiCallStatus.rejected,
          remoteUserName: signal.fromName,
        ),
      );
    }
  }

  /// Handle call ended
  void _handleCallEnded(CallSignal signal) {
    _jitsiLog(
      '_handleCallEnded()',
      'signal.callId=${signal.callId} from=${signal.from} _currentCallId=$_currentCallId _remoteUserId=$_remoteUserId',
    );
    if (signal.callId == _currentCallId || signal.from == _remoteUserId) {
      _jitsiLog('_handleCallEnded() calling endCall()');
      endCall();
    }
  }

  /// Generate a unique room name for the call
  String _generateRoomName() {
    final uuid = const Uuid().v4().substring(0, 8);
    final timestamp = DateTime.now().millisecondsSinceEpoch
        .toString()
        .substring(8);
    return 'pact-$uuid-$timestamp';
  }

  /// Start a Jitsi call with a remote user
  Future<JitsiCallResult> startCall({
    required String remoteUserId,
    required String remoteUserName,
    String? remoteUserAvatar,
    bool audioOnly = false,
  }) async {
    _jitsiLog(
      'startCall() ENTER',
      'remoteUserId=$remoteUserId remoteUserName=$remoteUserName audioOnly=$audioOnly _isInCall=$_isInCall',
    );
    if (_isInCall) {
      _jitsiLog('startCall() REJECT', 'Already in a call');
      return JitsiCallResult(success: false, error: 'Already in a call');
    }

    try {
      _isInCall = true;
      _isAudioOnly = audioOnly;
      _remoteUserId = remoteUserId;
      _remoteUserName = remoteUserName;
      _remoteUserAvatar = remoteUserAvatar;
      _currentCallId = const Uuid().v4();
      _currentRoomName = _generateRoomName();
      _jitsiLog(
        'startCall() state set',
        'callId=$_currentCallId room=$_currentRoomName',
      );

      // Send call invite to remote user
      _jitsiLog(
        'startCall() sending jitsiInvite',
        'to=$remoteUserId room=$_currentRoomName',
      );
      await _sendSignal(
        remoteUserId,
        CallSignalType.jitsiInvite,
        jitsiRoom: _currentRoomName,
        isAudioOnly: audioOnly,
      );

      _callStateController.add(
        JitsiCallState(
          status: JitsiCallStatus.calling,
          roomName: _currentRoomName,
          remoteUserName: remoteUserName,
        ),
      );
      _jitsiLog(
        'startCall() DONE success',
        'roomName=$_currentRoomName serverUrl=$_serverUrl',
      );

      return JitsiCallResult(
        success: true,
        roomName: _currentRoomName,
        serverUrl: _serverUrl,
      );
    } catch (e, st) {
      _jitsiLog('startCall() ERROR', e);
      debugPrint('[JitsiCall] startCall stackTrace: $st');
      _isInCall = false;
      _currentCallId = null;
      _currentRoomName = null;

      return JitsiCallResult(success: false, error: e.toString());
    }
  }

  /// Accept an incoming Jitsi call
  Future<JitsiCallResult> acceptCall(JitsiIncomingCall incomingCall) async {
    _jitsiLog(
      'acceptCall() ENTER',
      'callId=${incomingCall.callId} room=${incomingCall.roomName} callerId=${incomingCall.callerId}',
    );
    try {
      _isInCall = true;
      _isAudioOnly = incomingCall.isAudioOnly;
      _currentCallId = incomingCall.callId;
      _currentRoomName = incomingCall.roomName;
      _remoteUserId = incomingCall.callerId;
      _remoteUserName = incomingCall.callerName;
      _remoteUserAvatar = incomingCall.callerAvatar;
      _jitsiLog('acceptCall() state set', 'room=$_currentRoomName');

      _jitsiLog(
        'acceptCall() sending jitsiAccept',
        'to=${incomingCall.callerId} room=${incomingCall.roomName}',
      );
      await _sendSignal(
        incomingCall.callerId,
        CallSignalType.jitsiAccept,
        jitsiRoom: incomingCall.roomName,
      );

      _callStateController.add(
        JitsiCallState(
          status: JitsiCallStatus.connected,
          roomName: _currentRoomName,
          remoteUserName: incomingCall.callerName,
        ),
      );
      _jitsiLog(
        'acceptCall() DONE success',
        'roomName=${incomingCall.roomName}',
      );

      return JitsiCallResult(
        success: true,
        roomName: incomingCall.roomName,
        serverUrl: _serverUrl,
      );
    } catch (e, st) {
      _jitsiLog('acceptCall() ERROR', e);
      debugPrint('[JitsiCall] acceptCall stackTrace: $st');
      return JitsiCallResult(success: false, error: e.toString());
    }
  }

  /// Reject an incoming Jitsi call
  Future<void> rejectCall(JitsiIncomingCall incomingCall) async {
    _jitsiLog(
      'rejectCall()',
      'callerId=${incomingCall.callerId} callId=${incomingCall.callId}',
    );
    await _sendSignal(incomingCall.callerId, CallSignalType.jitsiReject);
  }

  /// End the current call
  Future<void> endCall() async {
    _jitsiLog(
      'endCall() ENTER',
      '_remoteUserId=$_remoteUserId _currentCallId=$_currentCallId',
    );
    if (_remoteUserId != null) {
      _jitsiLog('endCall() sending callEnd to', _remoteUserId);
      await _sendSignal(_remoteUserId!, CallSignalType.callEnd);
    }

    _isInCall = false;
    _currentCallId = null;
    _currentRoomName = null;
    _remoteUserId = null;
    _remoteUserName = null;
    _remoteUserAvatar = null;

    _callStateController.add(JitsiCallState(status: JitsiCallStatus.ended));
    _jitsiLog('endCall() DONE');
  }

  /// Send a signal to a remote user via Supabase
  Future<void> _sendSignal(
    String toUserId,
    CallSignalType type, {
    String? jitsiRoom,
    bool? isAudioOnly,
  }) async {
    _jitsiLog(
      '_sendSignal() ENTER',
      'to=$toUserId type=${type.name} jitsiRoom=$jitsiRoom isAudioOnly=$isAudioOnly _userId=$_userId',
    );
    if (_userId == null) {
      _jitsiLog('_sendSignal() SKIP', 'no _userId');
      return;
    }

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
    final payload = signal.toJson();
    _jitsiLog('_sendSignal() payload', payload);

    await channel.subscribe();
    _jitsiLog('_sendSignal() channel subscribed', channelName);
    await channel.sendBroadcastMessage(event: 'jitsi-signal', payload: payload);

    _jitsiLog('_sendSignal() DONE', '${type.name} to $toUserId');
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

  final _meetingStatusController = StreamController<bool>.broadcast();
  Stream<bool> get meetingStatusStream => _meetingStatusController.stream;

  Future<void> joinMeeting({
    required String roomName,
    required String displayName,
    String? email,
    String? avatarUrl,
    bool audioMuted = false,
    bool videoMuted = true,
  }) async {
    debugPrint('[JitsiMeetService] joinMeeting called - using WebRTC instead');
    debugPrint('[JitsiMeetService] Room: $roomName, User: $displayName');

    _currentRoomName = roomName;
    _isInMeeting = true;
    _meetingStatusController.add(true);
  }

  Future<void> leaveMeeting() async {
    await _webrtcService.endCall();
    _isInMeeting = false;
    _currentRoomName = null;
    _meetingStatusController.add(false);
  }

  Future<void> toggleAudio() async {
    _webrtcService.toggleMute();
  }

  Future<void> toggleVideo() async {
    _webrtcService.toggleVideo();
  }

  Future<void> dispose() async {
    await _meetingStatusController.close();
  }

  Future<void> initialize() async {
    // Implementation
  }

  Future<dynamic> startCall(Map<String, dynamic> params) async {
    // Implementation
  }
}
