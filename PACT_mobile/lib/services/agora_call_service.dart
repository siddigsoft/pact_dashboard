// lib/services/agora_call_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/call_signal.dart';
import '../models/call_state.dart';

/// Log tag for filtering Agora call logs when debugging.
void _agoraLog(String message, [Object? detail]) {
  final detailStr = detail != null ? ' $detail' : '';
  debugPrint('[AgoraCall] $message$detailStr');
}

/// Agora RTC service for handling native video/audio calls
/// Uses Agora's RTC Engine for high-quality, low-latency communication
class AgoraCallService {
  static final AgoraCallService _instance = AgoraCallService._internal();
  factory AgoraCallService() => _instance;
  AgoraCallService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;

  // Agora configuration (project: pacttrial)
  // App ID: 1d38576d0cfe429a9c996dfedcb60629
  // App Certificate: use only server-side for token generation
  static const String _appId = '1d38576d0cfe429a9c996dfedcb60629';

  // RTC Engine
  RtcEngine? _engine;
  RtcEngine get engine => _engine!;

  // User info
  String? _userId;
  String? _userName;
  String? _userAvatar;
  String? _userEmail;

  // Current call state
  String? _currentCallId;
  String? _currentChannelName;
  String? _remoteUserId;
  String? _remoteUserName;
  String? _remoteUserAvatar;
  bool _isInCall = false;
  bool _isAudioOnly = false;
  int? _remoteUid;
  int? _localUid;

  // Call control state
  bool _isMuted = false;
  bool _isVideoDisabled = false;
  bool _isSpeakerOn = true;
  bool _isFrontCamera = true;

  // Signaling channel (inbound)
  RealtimeChannel? _signalingChannel;

  // Cached outbound channels per recipient (avoids subscribe on every send; reliable callEnd delivery)
  final Map<String, RealtimeChannel> _outboundChannels = {};

  // Stream controllers
  final _callStateController = StreamController<CallState>.broadcast();
  Stream<CallState> get callStateStream => _callStateController.stream;

  final _incomingCallController =
      StreamController<AgoraIncomingCall>.broadcast();
  Stream<AgoraIncomingCall> get incomingCallStream {
    _agoraLog(
      'incomingCallStream getter called, hasListener=${_incomingCallController.hasListener}',
    );
    return _incomingCallController.stream;
  }

  final _remoteUserController = StreamController<int?>.broadcast();
  Stream<int?> get remoteUserStream => _remoteUserController.stream;

  /// Initialize the Agora service with user info.
  /// Signaling is set up first so the receiver always gets incoming call broadcasts
  /// even if the Agora RTC engine fails to init (e.g. on web or permissions denied).
  Future<void> initialize({
    required String userId,
    required String userName,
    String? userAvatar,
    String? userEmail,
  }) async {
    _agoraLog('initialize() ENTER', 'userId=$userId userName=$userName');
    _userId = userId;
    _userName = userName;
    _userAvatar = userAvatar;
    _userEmail = userEmail;

    // Set up signaling FIRST so receiver always subscribes and gets incoming calls
    await _setupSignalingChannel();

    // Then init RTC engine (may fail on web or if permissions denied)
    try {
      await _initializeAgoraEngine();
    } catch (e, st) {
      _agoraLog('initialize() engine init failed (signaling still active)', e);
      debugPrint('[AgoraCall] initialize stackTrace: $st');
      // Don't rethrow - signaling is set up so user can still receive call notifications
    }
    _agoraLog('initialize() DONE', 'user=$userName');
  }

  /// Initialize Agora RTC Engine (web uses iris_web script in index.html).
  Future<void> _initializeAgoraEngine() async {
    _agoraLog('_initializeAgoraEngine() ENTER', 'kIsWeb=$kIsWeb');

    // Request permissions on mobile only; on web browser will prompt when needed
    if (!kIsWeb) {
      final status = await [Permission.camera, Permission.microphone].request();

      if (status.values.any((s) => s.isDenied || s.isPermanentlyDenied)) {
        _agoraLog('_initializeAgoraEngine() ERROR', 'Permissions denied');
        throw Exception('Camera/Microphone permissions required for calls');
      }
    }

    try {
      // Create RTC engine (web uses iris_web from index.html)
      _engine = createAgoraRtcEngine();
      await _engine!.initialize(
        RtcEngineContext(
          appId: _appId,
          channelProfile: ChannelProfileType.channelProfileCommunication,
        ),
      );

      // Enable video by default
      await _engine!.enableVideo();
      await _engine!.enableAudio();

      // Set default camera to front (may not be supported on web; -4 = not supported)
      if (!kIsWeb) {
        await _engine!.setCameraCapturerConfiguration(
          const CameraCapturerConfiguration(
            cameraDirection: CameraDirection.cameraFront,
          ),
        );
      }

      // Register event handlers
      _engine!.registerEventHandler(
        RtcEngineEventHandler(
          onJoinChannelSuccess: (RtcConnection connection, int elapsed) {
            _agoraLog(
              'onJoinChannelSuccess',
              'channel=${connection.channelId} localUid=${connection.localUid}',
            );
            _localUid = connection.localUid;
            _callStateController.add(
              CallState(
                status: CallStatus.connected,
                callId: _currentCallId,
                remoteUserId: _remoteUserId,
                remoteUserName: _remoteUserName,
                remoteUserAvatar: _remoteUserAvatar,
                isVideoEnabled: !_isAudioOnly,
                isMuted: _isMuted,
                isSpeakerOn: _isSpeakerOn,
                startTime: DateTime.now(),
              ),
            );
          },
          onUserJoined: (RtcConnection connection, int remoteUid, int elapsed) {
            _agoraLog('onUserJoined', 'remoteUid=$remoteUid');
            _remoteUid = remoteUid;
            _remoteUserController.add(remoteUid);
          },
          onUserOffline:
              (
                RtcConnection connection,
                int remoteUid,
                UserOfflineReasonType reason,
              ) {
                _agoraLog(
                  'onUserOffline',
                  'remoteUid=$remoteUid reason=${reason.name}',
                );
                if (_remoteUid == remoteUid) {
                  _remoteUid = null;
                  _remoteUserController.add(null);
                  // Remote left the channel (e.g. caller hung up) — end our side so call ends on both
                  if (_isInCall) {
                    _agoraLog(
                      'onUserOffline',
                      'remote left channel, ending call',
                    );
                    endCall();
                  }
                }
              },
          onLeaveChannel: (RtcConnection connection, RtcStats stats) {
            _agoraLog('onLeaveChannel', 'duration=${stats.duration}s');
          },
          onError: (ErrorCodeType err, String msg) {
            _agoraLog('onError', 'code=$err msg=$msg');
            _callStateController.add(
              CallState(status: CallStatus.failed, callId: _currentCallId),
            );
          },
          onConnectionLost: (RtcConnection connection) {
            _agoraLog(
              'onConnectionLost',
              'attempting reconnect, _isInCall=$_isInCall',
            );
            // Only emit reconnecting if still in a call
            if (_isInCall) {
              _callStateController.add(
                CallState(
                  status: CallStatus.reconnecting,
                  callId: _currentCallId,
                  remoteUserId: _remoteUserId,
                  remoteUserName: _remoteUserName,
                ),
              );
            }
          },
        ),
      );

      _agoraLog('_initializeAgoraEngine() DONE');
    } catch (e, st) {
      _agoraLog('_initializeAgoraEngine() ERROR', e);
      debugPrint('[AgoraCall] _initializeAgoraEngine stackTrace: $st');
      rethrow;
    }
  }

  /// Whether we are running on web (engine will be null, signaling still works).
  static bool get isWeb => kIsWeb;

  /// Setup Supabase realtime channel for call signaling
  Future<void> _setupSignalingChannel() async {
    _agoraLog('_setupSignalingChannel() ENTER', '_userId=$_userId');
    if (_userId == null) {
      _agoraLog('_setupSignalingChannel() SKIP', 'no _userId');
      return;
    }

    // Clean up existing channel
    if (_signalingChannel != null) {
      _agoraLog('_setupSignalingChannel() removing existing channel');
      await _supabase.removeChannel(_signalingChannel!);
    }

    final channelName = 'agora-signaling:$_userId';
    _signalingChannel = _supabase.channel(channelName);
    _agoraLog('_setupSignalingChannel() created channel', channelName);

    _signalingChannel!
        .onBroadcast(
          event: 'agora-signal',
          callback: (payload) {
            _agoraLog(
              '_setupSignalingChannel() RAW broadcast received',
              payload,
            );
            // Defer handling so we don't modify RealtimeClient's channel list
            // during its forEach (avoids "Concurrent modification during iteration").
            Future.microtask(() => _handleSignal(payload));
          },
        )
        .subscribe();

    _agoraLog('_setupSignalingChannel() DONE subscribed', channelName);
  }

  /// Handle incoming call signals
  void _handleSignal(Map<String, dynamic> payload) {
    _agoraLog('_handleSignal() ENTER', 'payload=$payload');
    try {
      // Supabase Realtime may wrap the broadcast: { event, payload: { from, to, ... }, type }
      final Map<String, dynamic> signalMap =
          payload['payload'] is Map<String, dynamic>
          ? payload['payload'] as Map<String, dynamic>
          : payload;
      final signal = CallSignal.fromJson(signalMap);
      _agoraLog(
        '_handleSignal() parsed',
        'type=${signal.type.name} from=${signal.from} to=${signal.to} callId=${signal.callId}',
      );

      if (signal.from.isEmpty || signal.to.isEmpty) {
        _agoraLog('_handleSignal() INVALID', 'missing from or to');
        return;
      }
      // Ignore signals not meant for us
      if (signal.to != _userId) {
        _agoraLog(
          '_handleSignal() IGNORE not for us',
          'to=${signal.to} _userId=$_userId',
        );
        return;
      }

      _agoraLog(
        '_handleSignal() received',
        '${signal.type.name} from ${signal.fromName}',
      );

      switch (signal.type) {
        case CallSignalType.callRequest:
          _handleIncomingCall(signal);
          break;
        case CallSignalType.callAccept:
          _handleCallAccepted(signal);
          break;
        case CallSignalType.callReject:
          _handleCallRejected(signal);
          break;
        case CallSignalType.callEnd:
          _handleCallEnded(signal);
          break;
        case CallSignalType.callBusy:
          _handleCallBusy(signal);
          break;
        default:
          _agoraLog('_handleSignal() unhandled type', signal.type.name);
          break;
      }
    } catch (e, st) {
      _agoraLog('_handleSignal() ERROR', '$e');
      debugPrint('[AgoraCall] _handleSignal stackTrace: $st');
    }
  }

  // Track callIds we've already pushed to avoid duplicate incoming call dialogs
  final Set<String> _processedIncomingCallIds = {};

  /// Handle incoming call invite (strict payload validation)
  void _handleIncomingCall(CallSignal signal) {
    _agoraLog(
      '_handleIncomingCall() ENTER',
      'callId=${signal.callId} _isInCall=$_isInCall',
    );
    if (signal.payload == null ||
        signal.payload!['callId'] == null ||
        signal.payload!['channelName'] == null) {
      _agoraLog(
        '_handleIncomingCall() INVALID',
        'missing payload.callId or payload.channelName',
      );
      return;
    }

    final callId = signal.payload!['callId'] as String;
    final channelName = signal.payload!['channelName'] as String;
    if (channelName.isEmpty || callId.isEmpty) {
      _agoraLog('_handleIncomingCall() INVALID', 'empty channelName or callId');
      return;
    }

    if (_isInCall) {
      _agoraLog('_handleIncomingCall() BUSY sending callBusy to', signal.from);
      _sendSignal(signal.from, CallSignalType.callBusy);
      return;
    }

    final isAudioOnly =
        signal.payload?['isAudioOnly'] as bool? ?? signal.isAudioOnly ?? false;

    // Deduplicate: ignore repeat callRequest for same callId
    if (_processedIncomingCallIds.contains(callId)) {
      _agoraLog(
        '_handleIncomingCall() DUPLICATE',
        'callId=$callId already shown',
      );
      return;
    }
    _processedIncomingCallIds.add(callId);

    final incomingCall = AgoraIncomingCall(
      callId: callId,
      channelName: channelName,
      callerId: signal.from,
      callerName: signal.fromName,
      callerAvatar: signal.fromAvatar,
      isAudioOnly: isAudioOnly,
    );
    _agoraLog(
      '_handleIncomingCall() pushing to incomingCallStream',
      'callId=$callId channelName=$channelName',
    );
    _agoraLog(
      '_handleIncomingCall() controller state',
      'isClosed=${_incomingCallController.isClosed} hasListener=${_incomingCallController.hasListener}',
    );
    try {
      _incomingCallController.add(incomingCall);
      _agoraLog(
        '_handleIncomingCall() SUCCESS pushed to stream',
        'callId=$callId',
      );
    } catch (e, st) {
      _agoraLog('_handleIncomingCall() ERROR pushing to stream', '$e');
      debugPrint('[AgoraCall] StackTrace: $st');
    }
  }

  /// Handle call accepted by remote user
  void _handleCallAccepted(CallSignal signal) {
    _agoraLog(
      '_handleCallAccepted()',
      'signal.callId=${signal.callId} _currentCallId=$_currentCallId',
    );
    if (signal.callId == _currentCallId) {
      _agoraLog(
        '_handleCallAccepted() emitting accepted',
        'channel=$_currentChannelName',
      );
      _callStateController.add(
        CallState(
          status: CallStatus.ringing,
          callId: _currentCallId,
          remoteUserId: _remoteUserId,
          remoteUserName: signal.fromName,
          remoteUserAvatar: signal.fromAvatar,
        ),
      );
    } else {
      _agoraLog('_handleCallAccepted() IGNORE callId mismatch');
    }
  }

  /// Handle call rejected by remote user
  void _handleCallRejected(CallSignal signal) {
    _agoraLog(
      '_handleCallRejected()',
      'signal.callId=${signal.callId} _currentCallId=$_currentCallId',
    );
    if (signal.callId == _currentCallId) {
      _isInCall = false;
      _currentCallId = null;
      _currentChannelName = null;
      _agoraLog('_handleCallRejected() emitting rejected');
      _callStateController.add(
        CallState(status: CallStatus.rejected, remoteUserName: signal.fromName),
      );
    }
  }

  /// Handle call busy
  void _handleCallBusy(CallSignal signal) {
    _agoraLog('_handleCallBusy()', 'signal.callId=${signal.callId}');
    if (signal.callId == _currentCallId) {
      _isInCall = false;
      _currentCallId = null;
      _currentChannelName = null;
      _callStateController.add(
        CallState(status: CallStatus.busy, remoteUserName: signal.fromName),
      );
    }
  }

  /// Handle call ended (reliable: use payload.callId when present)
  void _handleCallEnded(CallSignal signal) {
    final endedCallId = signal.payload?['callId'] as String? ?? signal.callId;
    _agoraLog(
      '_handleCallEnded()',
      'endedCallId=$endedCallId _currentCallId=$_currentCallId from=${signal.from}',
    );
    if (endedCallId != null &&
        endedCallId == _currentCallId &&
        (signal.from == _remoteUserId || _remoteUserId == null)) {
      _agoraLog('_handleCallEnded() calling endCall()');
      endCall();
    } else {
      _agoraLog(
        '_handleCallEnded() IGNORED',
        'callId mismatch or not from remote',
      );
    }
  }

  /// Generate a unique channel name for the call
  String _generateChannelName() {
    final uuid = const Uuid().v4().substring(0, 8);
    final timestamp = DateTime.now().millisecondsSinceEpoch
        .toString()
        .substring(8);
    return 'pact-$uuid-$timestamp';
  }

  /// Start an Agora call with a remote user
  Future<AgoraCallResult> startCall({
    required String remoteUserId,
    required String remoteUserName,
    String? remoteUserAvatar,
    bool audioOnly = false,
  }) async {
    _agoraLog(
      'startCall() ENTER',
      'remoteUserId=$remoteUserId remoteUserName=$remoteUserName audioOnly=$audioOnly _isInCall=$_isInCall',
    );
    if (_isInCall) {
      _agoraLog('startCall() REJECT', 'Already in a call');
      return AgoraCallResult(success: false, error: 'Already in a call');
    }

    // On web: engine is not created; allow signaling-only so invite is sent and call screen opens
    if (!kIsWeb && _engine == null) {
      _agoraLog('startCall() ERROR', 'Engine not initialized');
      return AgoraCallResult(
        success: false,
        error: 'Call service not initialized',
      );
    }

    try {
      _isInCall = true;
      _isAudioOnly = audioOnly;
      _remoteUserId = remoteUserId;
      _remoteUserName = remoteUserName;
      _remoteUserAvatar = remoteUserAvatar;
      _currentCallId = const Uuid().v4();
      _currentChannelName = _generateChannelName();
      _agoraLog(
        'startCall() state set',
        'callId=$_currentCallId channel=$_currentChannelName',
      );

      // Configure video/audio when engine is available (mobile and web)
      if (_engine != null) {
        if (audioOnly) {
          await _engine!.disableVideo();
          _isVideoDisabled = true;
        } else {
          await _engine!.enableVideo();
          _isVideoDisabled = false;
        }
      }

      // Send call invite to remote user
      _agoraLog(
        'startCall() sending callRequest',
        'to=$remoteUserId channel=$_currentChannelName',
      );
      await _sendSignal(
        remoteUserId,
        CallSignalType.callRequest,
        payload: {
          'channelName': _currentChannelName,
          'callId': _currentCallId,
          'isAudioOnly': audioOnly,
        },
        isAudioOnly: audioOnly,
      );

      _callStateController.add(
        CallState(
          status: CallStatus.calling,
          callId: _currentCallId,
          remoteUserId: remoteUserId,
          remoteUserName: remoteUserName,
          remoteUserAvatar: remoteUserAvatar,
          isVideoEnabled: !audioOnly,
          isAudioOnly: audioOnly,
        ),
      );
      _agoraLog('startCall() DONE success', 'channelName=$_currentChannelName');

      return AgoraCallResult(success: true, channelName: _currentChannelName);
    } catch (e, st) {
      _agoraLog('startCall() ERROR', e);
      debugPrint('[AgoraCall] startCall stackTrace: $st');
      _isInCall = false;
      _currentCallId = null;
      _currentChannelName = null;

      return AgoraCallResult(success: false, error: e.toString());
    }
  }

  /// Accept an incoming call
  Future<AgoraCallResult> acceptCall(AgoraIncomingCall incomingCall) async {
    _agoraLog(
      'acceptCall() ENTER',
      'callId=${incomingCall.callId} channel=${incomingCall.channelName} callerId=${incomingCall.callerId}',
    );

    // On web: engine is not created; allow signaling-only so accept is sent and call screen opens
    if (!kIsWeb && _engine == null) {
      _agoraLog('acceptCall() ERROR', 'Engine not initialized');
      return AgoraCallResult(
        success: false,
        error: 'Call service not initialized',
      );
    }

    try {
      _isInCall = true;
      _isAudioOnly = incomingCall.isAudioOnly;
      _currentCallId = incomingCall.callId;
      _currentChannelName = incomingCall.channelName;
      _remoteUserId = incomingCall.callerId;
      _remoteUserName = incomingCall.callerName;
      _remoteUserAvatar = incomingCall.callerAvatar;
      _agoraLog('acceptCall() state set', 'channel=$_currentChannelName');

      // Configure video/audio when engine is available (mobile and web)
      if (_engine != null) {
        if (incomingCall.isAudioOnly) {
          await _engine!.disableVideo();
          _isVideoDisabled = true;
        } else {
          await _engine!.enableVideo();
          _isVideoDisabled = false;
        }
      }

      _agoraLog(
        'acceptCall() sending callAccept',
        'to=${incomingCall.callerId} channel=${incomingCall.channelName}',
      );
      await _sendSignal(
        incomingCall.callerId,
        CallSignalType.callAccept,
        payload: {'channelName': incomingCall.channelName},
      );

      _callStateController.add(
        CallState(
          status: CallStatus.ringing,
          callId: _currentCallId,
          remoteUserId: incomingCall.callerId,
          remoteUserName: incomingCall.callerName,
          remoteUserAvatar: incomingCall.callerAvatar,
          isVideoEnabled: !incomingCall.isAudioOnly,
          isAudioOnly: incomingCall.isAudioOnly,
        ),
      );
      _agoraLog(
        'acceptCall() DONE success',
        'channelName=${incomingCall.channelName}',
      );

      return AgoraCallResult(
        success: true,
        channelName: incomingCall.channelName,
      );
    } catch (e, st) {
      _agoraLog('acceptCall() ERROR', e);
      debugPrint('[AgoraCall] acceptCall stackTrace: $st');
      return AgoraCallResult(success: false, error: e.toString());
    }
  }

  /// Fetch RTC token from Supabase Edge Function
  /// Refreshes the auth session first so the Edge Function receives a valid JWT.
  Future<String?> _fetchRtcToken(String channelName) async {
    try {
      final session = _supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        _agoraLog('_fetchRtcToken() refreshing session (expired or null)');
        await _supabase.auth.refreshSession();
      }

      final response = await _supabase.functions.invoke(
        'agora-token',
        body: {'channelName': channelName, 'expireSeconds': 3600},
      );
      if (response.status != 200) {
        _agoraLog(
          '_fetchRtcToken() ERROR',
          'status=${response.status} ${response.data}',
        );
        if (response.status == 401) {
          throw Exception(
            'Your session expired. Please log out and log in again, then try the call.',
          );
        }
        return null;
      }
      final data = response.data as Map<String, dynamic>?;
      final token = data?['token'] as String?;
      if (token == null || token.isEmpty) {
        _agoraLog('_fetchRtcToken() ERROR', 'no token in response');
        return null;
      }
      _agoraLog('_fetchRtcToken() OK');
      return token;
    } catch (e, st) {
      _agoraLog('_fetchRtcToken() ERROR', e);
      debugPrint('[AgoraCall] _fetchRtcToken stackTrace: $st');
      return null;
    }
  }

  /// Join the Agora channel (called after accept or start)
  Future<void> joinChannel(String channelName, {String? token}) async {
    _agoraLog('joinChannel() ENTER', 'channel=$channelName');

    // When engine is not created: no-op (e.g. web init failed, signaling-only fallback)
    if (_engine == null) {
      _agoraLog('joinChannel() SKIP', 'Engine not initialized');
      return;
    }

    try {
      final rtcToken = token ?? await _fetchRtcToken(channelName);
      if (rtcToken == null || rtcToken.isEmpty) {
        _agoraLog(
          'joinChannel() ERROR',
          'No token available. Ensure Edge Function agora-token is deployed and secrets are set.',
        );
        throw Exception('Could not get call token. Please try again.');
      }

      await _engine!.joinChannel(
        token: rtcToken,
        channelId: channelName,
        uid: 0, // 0 means auto-assign
        options: const ChannelMediaOptions(
          channelProfile: ChannelProfileType.channelProfileCommunication,
          clientRoleType: ClientRoleType.clientRoleBroadcaster,
        ),
      );
      _agoraLog('joinChannel() DONE', 'channel=$channelName');
    } catch (e, st) {
      _agoraLog('joinChannel() ERROR', e);
      debugPrint('[AgoraCall] joinChannel stackTrace: $st');
      rethrow;
    }
  }

  /// Reject an incoming call
  Future<void> rejectCall(AgoraIncomingCall incomingCall) async {
    _agoraLog(
      'rejectCall()',
      'callerId=${incomingCall.callerId} callId=${incomingCall.callId}',
    );
    _processedIncomingCallIds.remove(incomingCall.callId);
    await _sendSignal(incomingCall.callerId, CallSignalType.callReject);
  }

  /// End the current call
  Future<void> endCall() async {
    _agoraLog(
      'endCall() ENTER',
      '_remoteUserId=$_remoteUserId _currentCallId=$_currentCallId',
    );
    if (!_isInCall) {
      _agoraLog('endCall() SKIP', 'already ended');
      return;
    }

    final remoteId = _remoteUserId;
    final callId = _currentCallId;
    _isInCall = false;
    _currentCallId = null;
    _currentChannelName = null;
    _remoteUserId = null;
    _remoteUserName = null;
    _remoteUserAvatar = null;
    _remoteUid = null;
    _localUid = null;
    _isMuted = false;
    _isVideoDisabled = false;

    if (remoteId != null && callId != null) {
      _agoraLog('endCall() sending callEnd to', remoteId);
      await _sendSignal(
        remoteId,
        CallSignalType.callEnd,
        payload: {'callId': callId},
      );
    }

    // Leave Agora channel
    if (_engine != null) {
      await _engine!.leaveChannel();
      await _engine!.enableVideo();
    }

    // Clean up processed call ids and channels
    if (callId != null) _processedIncomingCallIds.remove(callId);
    if (_processedIncomingCallIds.length > 50) {
      _processedIncomingCallIds.clear();
    }

    final channelsToRemove = _outboundChannels.values.toList();
    _outboundChannels.clear();
    for (final ch in channelsToRemove) {
      await _supabase.removeChannel(ch);
    }

    _callStateController.add(CallState(status: CallStatus.ended));
    _remoteUserController.add(null);
    _agoraLog('endCall() DONE');
  }

  /// Toggle microphone mute
  Future<void> toggleMute() async {
    if (_engine == null) return;
    _isMuted = !_isMuted;
    await _engine!.muteLocalAudioStream(_isMuted);
    _agoraLog('toggleMute()', 'muted=$_isMuted');
  }

  /// Toggle video
  Future<void> toggleVideo() async {
    if (_engine == null || _isAudioOnly) return;
    _isVideoDisabled = !_isVideoDisabled;
    await _engine!.muteLocalVideoStream(_isVideoDisabled);
    _agoraLog('toggleVideo()', 'disabled=$_isVideoDisabled');
  }

  /// Switch camera (front/back)
  Future<void> switchCamera() async {
    if (_engine == null || _isAudioOnly) return;
    _isFrontCamera = !_isFrontCamera;
    await _engine!.switchCamera();
    _agoraLog('switchCamera()', 'frontCamera=$_isFrontCamera');
  }

  /// Toggle speaker
  Future<void> toggleSpeaker() async {
    if (_engine == null) return;
    _isSpeakerOn = !_isSpeakerOn;
    await _engine!.setEnableSpeakerphone(_isSpeakerOn);
    _agoraLog('toggleSpeaker()', 'speakerOn=$_isSpeakerOn');
  }

  /// Send a signal to a remote user via Supabase
  Future<void> _sendSignal(
    String toUserId,
    CallSignalType type, {
    Map<String, dynamic>? payload,
    bool? isAudioOnly,
  }) async {
    _agoraLog(
      '_sendSignal() ENTER',
      'to=$toUserId type=${type.name} payload=$payload isAudioOnly=$isAudioOnly _userId=$_userId',
    );
    if (_userId == null) {
      _agoraLog('_sendSignal() SKIP', 'no _userId');
      return;
    }

    final channelName = 'agora-signaling:$toUserId';
    RealtimeChannel? cached = _outboundChannels[toUserId];
    RealtimeChannel channel;
    if (cached == null) {
      channel = _supabase.channel(channelName);
      channel.subscribe();
      _outboundChannels[toUserId] = channel;
      _agoraLog('_sendSignal() channel subscribed', channelName);
    } else {
      channel = cached;
    }

    final signal = CallSignal(
      type: type,
      from: _userId!,
      to: toUserId,
      fromName: _userName ?? 'Unknown',
      fromAvatar: _userAvatar,
      callId: _currentCallId,
      payload: payload,
      isAudioOnly: isAudioOnly,
    );
    final signalPayload = signal.toJson();
    _agoraLog('_sendSignal() payload', signalPayload);

    await channel.sendBroadcastMessage(
      event: 'agora-signal',
      payload: signalPayload,
    );

    _agoraLog('_sendSignal() DONE', '${type.name} to $toUserId');
  }

  /// Check if currently in a call
  bool get isInCall => _isInCall;

  /// Check if Agora engine is initialized and ready for calls
  bool get isReady => _engine != null;

  /// Get current channel name
  String? get currentChannelName => _currentChannelName;

  /// Get current call ID
  String? get currentCallId => _currentCallId;

  /// Get current remote user ID
  String? get currentRemoteUserId => _remoteUserId;

  /// Get remote user info
  String? get remoteUserName => _remoteUserName;
  String? get remoteUserAvatar => _remoteUserAvatar;
  int? get remoteUid => _remoteUid;
  int? get localUid => _localUid;

  /// Get call control states
  bool get isMuted => _isMuted;
  bool get isVideoDisabled => _isVideoDisabled;
  bool get isSpeakerOn => _isSpeakerOn;
  bool get isFrontCamera => _isFrontCamera;
  bool get isAudioOnly => _isAudioOnly;

  /// Dispose resources
  Future<void> dispose() async {
    if (_signalingChannel != null) {
      await _supabase.removeChannel(_signalingChannel!);
    }
    if (_engine != null) {
      await _engine!.leaveChannel();
      await _engine!.release();
    }
    await _callStateController.close();
    await _incomingCallController.close();
    await _remoteUserController.close();
  }
}

/// Incoming Agora call model
class AgoraIncomingCall {
  final String callId;
  final String channelName;
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final bool isAudioOnly;

  AgoraIncomingCall({
    required this.callId,
    required this.channelName,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    this.isAudioOnly = false,
  });
}

/// Agora call result model
class AgoraCallResult {
  final bool success;
  final String? channelName;
  final String? error;

  AgoraCallResult({required this.success, this.channelName, this.error});
}
