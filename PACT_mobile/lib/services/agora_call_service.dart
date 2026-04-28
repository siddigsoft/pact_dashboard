// lib/services/agora_call_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/call_signal.dart';
import '../models/call_state.dart';
import '../models/agora_incoming_call.dart';
import './debug_log_service.dart';
import './call_summary_notification_service.dart';

/// Log tag for filtering Agora call logs when debugging.
void _agoraLog(String message, [Object? detail]) {
  final detailStr = detail != null ? ' $detail' : '';
  debugPrint('[AgoraCall] $message$detailStr');
  debugLog('AgoraCall', '$message$detailStr', alsoPrint: false);
}

/// Agora RTC service for handling native video/audio calls
/// Uses Agora's RTC Engine for high-quality, low-latency communication
class AgoraCallService {
  static final AgoraCallService _instance = AgoraCallService._internal();
  factory AgoraCallService() => _instance;
  AgoraCallService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;

  /// Cancel the local notification for a call (prevents stale notification actions)
  void _cancelCallNotification(String? callId) {
    if (callId == null || callId.isEmpty || kIsWeb) return;
    FlutterLocalNotificationsPlugin().cancel(callId.hashCode);
    _agoraLog(
      '_cancelCallNotification()',
      'cancelled notification for callId=$callId',
    );
  }

  // Agora configuration (project: pacttrial)
  // App ID: 1d38576d0cfe429a9c996dfedcb60629
  // App Certificate: use only server-side for token generation
  static const String _appId = '1d38576d0cfe429a9c996dfedcb60629';

  // RTC Engine
  RtcEngine? _engine;
  bool _engineInitialized = false;
  RtcEngine get engine => _engine!;

  // User info
  String? _userId;
  String? _userName;
  String? _userAvatar;
  Future<void>? _initializeInFlight;
  String? _initializedForUserId;

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
  DateTime? _callStartTime;
  bool _isOutgoingCall = false;

  // Call control state
  bool _isMuted = false;
  bool _isVideoDisabled = false;
  bool _isSpeakerOn = true;
  bool _isFrontCamera = true;
  Timer? _outgoingCallTimeoutTimer;
  Future<void>? _joinInFlight;
  String? _joinedChannelName;

  // Signaling channel (inbound)
  RealtimeChannel? _signalingChannel;

  // Cached outbound channels per recipient (avoids subscribe on every send; reliable callEnd delivery)
  final Map<String, RealtimeChannel> _outboundChannels = {};

  // Map to track pending incoming calls by callId (for notification action buttons)
  final Map<String, AgoraIncomingCall> _pendingIncomingCalls = {};

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
    if (_initializeInFlight != null) {
      _agoraLog('initialize() WAIT', 'existing init in-flight');
      await _initializeInFlight;
      if (_initializedForUserId == userId) {
        _agoraLog(
          'initialize() SKIP',
          'already initialized for userId=$userId',
        );
        return;
      }
    }
    if (_initializedForUserId == userId &&
        _signalingChannel != null &&
        (kIsWeb || _engine != null)) {
      _agoraLog('initialize() SKIP', 'already initialized for userId=$userId');
      _userName = userName;
      _userAvatar = userAvatar;
      return;
    }

    final initFuture = Future<void>(() async {
      _agoraLog('initialize() ENTER', 'userId=$userId userName=$userName');
      _userId = userId;
      _userName = userName;
      _userAvatar = userAvatar;

      // Set up signaling FIRST so receiver always subscribes and gets incoming calls
      await _setupSignalingChannel();

      // Then init RTC engine (may fail on web or if permissions denied)
      try {
        await _initializeAgoraEngine();
      } catch (e, st) {
        _agoraLog(
          'initialize() engine init failed (signaling still active)',
          e,
        );
        debugPrint('[AgoraCall] initialize stackTrace: $st');
        // Don't rethrow - signaling is set up so user can still receive call notifications
      }
      _initializedForUserId = userId;
      _agoraLog('initialize() DONE', 'user=$userName');
    });
    _initializeInFlight = initFuture;
    try {
      await initFuture;
    } finally {
      if (identical(_initializeInFlight, initFuture)) {
        _initializeInFlight = null;
      }
    }
  }

  /// Initialize Agora RTC Engine (web uses iris_web script in index.html).
  Future<void> _initializeAgoraEngine() async {
    _agoraLog('_initializeAgoraEngine() ENTER', 'kIsWeb=$kIsWeb');

    // Prevent duplicate event-handler registration on repeated initialize() calls.
    if (_engine != null && _engineInitialized) {
      _agoraLog('_initializeAgoraEngine() SKIP', 'engine already initialized');
      return;
    }

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
      _agoraLog('_initializeAgoraEngine() engine initialized', 'appId=$_appId');

      // Enable audio (critical for calls)
      try {
        await _engine!.enableAudio();
        _agoraLog('_initializeAgoraEngine() enableAudio success', '');
      } catch (e) {
        _agoraLog('_initializeAgoraEngine() enableAudio failed', e.toString());
      }

      // Enable video by default (non-critical, audio-only calls still work)
      try {
        await _engine!.enableVideo();
        _agoraLog('_initializeAgoraEngine() enableVideo success', '');
      } catch (e) {
        _agoraLog(
          '_initializeAgoraEngine() enableVideo failed (non-critical)',
          e.toString(),
        );
      }

      // Set default camera to front (non-critical; -4 = not supported on this device)
      if (!kIsWeb) {
        try {
          await _engine!.setCameraCapturerConfiguration(
            const CameraCapturerConfiguration(
              cameraDirection: CameraDirection.cameraFront,
            ),
          );
          _agoraLog('_initializeAgoraEngine() camera config success', '');
        } catch (e) {
          _agoraLog(
            '_initializeAgoraEngine() camera config failed (non-critical)',
            e.toString(),
          );
        }
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
            _callStartTime = DateTime.now();
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
                    endCall(sendCallEndSignal: false);
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

      _engineInitialized = true;
      _agoraLog('_initializeAgoraEngine() DONE');
    } catch (e, st) {
      _engineInitialized = false;
      // Ensure retries can build a fresh engine if initialization failed mid-way.
      if (_engine != null) {
        try {
          await _engine!.release();
        } catch (_) {}
        _engine = null;
      }
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
    // #region SIGNAL_TRACING
    debugPrint('[SIGNAL_TRACE] Raw payload keys: ${payload.keys.toList()}');
    debugPrint(
      '[SIGNAL_TRACE] Payload from=${payload['from']} to=${payload['to']} type=${payload['type']}',
    );
    // #endregion
    try {
      // Supabase delivers broadcasts in a flat format where signal fields
      // (from, to, callId, payload, …) are at the top level and the 'type'
      // field is overwritten by Supabase's own 'broadcast' type.
      // Detect this by checking for a non-empty 'from' at the top level;
      // otherwise fall back to extracting the inner 'payload' map (wrapped format).
      final Map<String, dynamic> signalMap =
          (payload['from'] is String && (payload['from'] as String).isNotEmpty)
          ? payload
          : (payload['payload'] is Map<String, dynamic>
                ? payload['payload'] as Map<String, dynamic>
                : payload);
      final signal = CallSignal.tryFromJson(signalMap);
      if (signal == null) {
        _agoraLog('_handleSignal() SKIP', 'unrecognised signal type, ignoring');
        // #region SIGNAL_TRACING
        debugPrint(
          '[SIGNAL_TRACE] Signal.tryFromJson returned null - invalid signal format',
        );
        debugPrint('[SIGNAL_TRACE] signalMap being parsed: $signalMap');
        // #endregion
        return;
      }
      _agoraLog(
        '_handleSignal() parsed',
        'type=${signal.type.name} from=${signal.from} to=${signal.to} callId=${signal.callId}',
      );
      // #region SIGNAL_TRACING
      debugPrint(
        '[SIGNAL_TRACE] Successfully parsed signal: type=${signal.type.name}',
      );
      // #endregion

      if (signal.from.isEmpty || signal.to.isEmpty) {
        _agoraLog('_handleSignal() INVALID', 'missing from or to');
        debugPrint('[SIGNAL_TRACE] REJECTED: missing from or to');
        return;
      }
      // Ignore signals not meant for us
      if (signal.to != _userId) {
        _agoraLog(
          '_handleSignal() IGNORE not for us',
          'to=${signal.to} _userId=$_userId',
        );
        // #region SIGNAL_TRACE
        debugPrint(
          '[SIGNAL_TRACE] REJECTED: signal not for us (to=${signal.to} but _userId=$_userId)',
        );
        // #endregion
        return;
      }

      _agoraLog(
        '_handleSignal() received',
        '${signal.type.name} from ${signal.fromName}',
      );
      // #region SIGNAL_TRACE
      debugPrint(
        '[SIGNAL_TRACE] Signal routing: type=${signal.type.name} from=${signal.from} to=$_userId',
      );
      // #endregion

      switch (signal.type) {
        case CallSignalType.callRequest:
          // #region SIGNAL_TRACE
          debugPrint('[SIGNAL_TRACE] ✓ Routing to _handleIncomingCall');
          // #endregion
          _handleIncomingCall(signal);
          break;
        case CallSignalType.callAccept:
          // #region SIGNAL_TRACE
          debugPrint('[SIGNAL_TRACE] ✓ Routing to _handleCallAccepted');
          // #endregion
          _handleCallAccepted(signal);
          break;
        case CallSignalType.callReject:
          // #region SIGNAL_TRACE
          debugPrint('[SIGNAL_TRACE] ✓ Routing to _handleCallRejected');
          // #endregion
          _handleCallRejected(signal);
          break;
        case CallSignalType.callEnd:
          // #region SIGNAL_TRACE
          debugPrint('[SIGNAL_TRACE] ✓ Routing to _handleCallEnded');
          // #endregion
          _handleCallEnded(signal);
          break;
        case CallSignalType.callBusy:
          // #region SIGNAL_TRACE
          debugPrint('[SIGNAL_TRACE] ✓ Routing to _handleCallBusy');
          // #endregion
          _handleCallBusy(signal);
          break;
        default:
          // #region SIGNAL_TRACE
          debugPrint(
            '[SIGNAL_TRACE] UNHANDLED signal type: ${signal.type.name}',
          );
          // #endregion
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

  // Track callIds we've already rejected to avoid sending duplicate reject signals
  final Set<String> _rejectedCallIds = {};

  /// Check if a callId was already handled (by Realtime or FCM) to prevent duplicates.
  bool isCallAlreadyProcessed(String callId) =>
      _processedIncomingCallIds.contains(callId);

  /// Pending incoming call data when app was opened from FCM/notification (e.g. killed state).
  /// Consumed by MainLayout after attaching to incomingCallStream.
  Map<String, dynamic>? _pendingFcmCallData;

  void setPendingFcmCall(Map<String, dynamic>? data) {
    _agoraLog(
      'setPendingFcmCall()',
      data == null
          ? 'data=null'
          : 'keys=${data.keys} call_id=${data['call_id'] ?? data['callId']} '
                'channel_name=${data['channel_name'] ?? data['channelName']} '
                'from=${data['from'] ?? data['caller_id'] ?? data['callerId']}',
    );
    _pendingFcmCallData = data;
  }

  Map<String, dynamic>? getAndClearPendingFcmCall() {
    _agoraLog(
      'getAndClearPendingFcmCall()',
      _pendingFcmCallData == null
          ? 'no pending call data'
          : 'keys=${_pendingFcmCallData!.keys} '
                'call_id=${_pendingFcmCallData!['call_id'] ?? _pendingFcmCallData!['callId']} '
                'channel_name=${_pendingFcmCallData!['channel_name'] ?? _pendingFcmCallData!['channelName']}',
    );
    final data = _pendingFcmCallData;
    _pendingFcmCallData = null;
    return data;
  }

  /// Push an incoming call from FCM/notification payload so the UI can show the dialog.
  /// Use when app was opened from background/killed by an incoming-call notification.
  /// Payload should contain: call_id/callId, channel_name, from/caller_id, caller_name, caller_avatar (optional), is_audio_only (optional).
  void pushIncomingCallFromFcm(Map<String, dynamic> data) {
    _agoraLog('pushIncomingCallFromFcm() ENTER', 'data=$data');
    final callId = (data['call_id'] ?? data['callId'] ?? '').toString();
    final channelName = (data['channel_name'] ?? data['channelName'] ?? '')
        .toString();
    final callerId =
        (data['from'] ?? data['caller_id'] ?? data['callerId'] ?? '')
            .toString();
    final callerName =
        (data['caller_name'] ?? data['fromName'] ?? data['callerName'] ?? '')
            .toString();
    if (callId.isEmpty || channelName.isEmpty || callerId.isEmpty) {
      _agoraLog(
        'pushIncomingCallFromFcm() SKIP',
        'missing call_id/channel_name/from',
      );
      return;
    }
    final callerAvatar = data['caller_avatar'] ?? data['fromAvatar'];
    final rawAudioOnly = (data['is_audio_only'] ?? data['isAudioOnly'] ?? true);
    final isAudioOnly =
        rawAudioOnly == true ||
        rawAudioOnly.toString().toLowerCase() == 'true' ||
        rawAudioOnly.toString() == '1';
    final rawAutoAccept = data['auto_accept'] ?? data['autoAccept'] ?? false;
    final autoAccept =
        rawAutoAccept == true ||
        rawAutoAccept.toString().toLowerCase() == 'true' ||
        rawAutoAccept.toString() == '1';
    final incoming = AgoraIncomingCall(
      callId: callId,
      channelName: channelName,
      callerId: callerId,
      callerName: callerName.isNotEmpty ? callerName : 'Unknown',
      callerAvatar: callerAvatar?.toString(),
      isAudioOnly: isAudioOnly == true,
      autoAccept: autoAccept,
    );
    _processedIncomingCallIds.add(callId);
    _pendingIncomingCalls[callId] = incoming; // Track for notification actions
    _agoraLog(
      'pushIncomingCallFromFcm() pushing to incomingCallStream',
      'callId=$callId channelName=$channelName callerId=$callerId '
          'isAudioOnly=${incoming.isAudioOnly}',
    );
    _incomingCallController.add(incoming);
    _agoraLog('pushIncomingCallFromFcm() pushed', 'callId=$callId');
  }

  /// Push an auto-accept incoming call (user pressed Accept on notification).
  /// The dialog will immediately accept without waiting for user interaction.
  void pushAutoAcceptCall(AgoraIncomingCall incomingCall) {
    _agoraLog(
      'pushAutoAcceptCall()',
      'callId=${incomingCall.callId} autoAccept=${incomingCall.autoAccept}',
    );

    // Guard: don't push if we're already in a call or this call was already processed recently
    if (_isInCall && _currentCallId == incomingCall.callId) {
      _agoraLog(
        'pushAutoAcceptCall() SKIP',
        'already in this call callId=${incomingCall.callId}',
      );
      return;
    }

    _processedIncomingCallIds.add(incomingCall.callId);
    _pendingIncomingCalls[incomingCall.callId] = incomingCall;
    _incomingCallController.add(incomingCall);
  }

  /// Handle incoming call invite (strict payload validation)
  void _handleIncomingCall(CallSignal signal) {
    // #region SIGNAL_TRACING
    debugPrint(
      '[SIGNAL_TRACE] _handleIncomingCall ENTER from=${signal.from} callId=${signal.callId}',
    );
    // #endregion
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
      // #region SIGNAL_TRACING
      debugPrint('[SIGNAL_TRACE] REJECTED: missing required payload fields');
      debugPrint('[SIGNAL_TRACE] payload=${signal.payload}');
      // #endregion
      return;
    }

    final callId = signal.payload!['callId'] as String;
    final channelName = signal.payload!['channelName'] as String;
    if (channelName.isEmpty || callId.isEmpty) {
      _agoraLog('_handleIncomingCall() INVALID', 'empty channelName or callId');
      // #region SIGNAL_TRACE
      debugPrint('[SIGNAL_TRACE] REJECTED: empty channelName or callId');
      // #endregion
      return;
    }

    // Reject stale signals replayed by Supabase (older than 30 seconds)
    final signalAge = DateTime.now().difference(signal.timestamp);
    if (signalAge.inSeconds > 30) {
      _agoraLog(
        '_handleIncomingCall() STALE',
        'signal is ${signalAge.inSeconds}s old, ignoring',
      );
      // #region SIGNAL_TRACE
      debugPrint(
        '[SIGNAL_TRACE] REJECTED: STALE signal (${signalAge.inSeconds}s old)',
      );
      // #endregion
      return;
    }

    if (_isInCall) {
      _agoraLog('_handleIncomingCall() BUSY sending callBusy to', signal.from);
      _sendSignal(signal.from, CallSignalType.callBusy, callIdOverride: callId);
      // #region SIGNAL_TRACE
      debugPrint('[SIGNAL_TRACE] REJECTED: already in call, sending callBusy');
      // #endregion
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
      // #region SIGNAL_TRACE
      debugPrint(
        '[SIGNAL_TRACE] REJECTED: duplicate (already processed this callId)',
      );
      // #endregion
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
    // #region SIGNAL_TRACE
    debugPrint('[SIGNAL_TRACE] ✓ ACCEPTED incoming call - pushing to stream');
    debugPrint(
      '[SIGNAL_TRACE] hasListener=${_incomingCallController.hasListener}',
    );
    // #endregion
    _agoraLog(
      '_handleIncomingCall() controller state',
      'isClosed=${_incomingCallController.isClosed} hasListener=${_incomingCallController.hasListener}',
    );

    try {
      _pendingIncomingCalls[incomingCall.callId] = incomingCall;
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
      _cancelOutgoingCallTimeout();
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
      _cancelOutgoingCallTimeout();
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
      _cancelOutgoingCallTimeout();
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

    // Case 1: Active call (both sides joined) – route through endCall().
    // Do NOT echo a callEnd back to the remote when we are handling a
    // received callEnd, otherwise it can create ping-pong and prematurely
    // end calls on both sides.
    if (endedCallId != null &&
        endedCallId == _currentCallId &&
        (signal.from == _remoteUserId || _remoteUserId == null)) {
      _agoraLog('_handleCallEnded() calling endCall()');
      endCall(sendCallEndSignal: false);
      return;
    }

    // Case 2: Incoming ringing call that was never answered.
    // We may not have a _currentCallId set yet, but we will have recorded the
    // incoming callId in _processedIncomingCallIds. In this case, emit an
    // "ended" state so any incoming-call UI (dialog, sounds, vibration) can
    // dismiss itself cleanly.
    if (endedCallId != null &&
        _processedIncomingCallIds.contains(endedCallId) &&
        !_isInCall) {
      _agoraLog(
        '_handleCallEnded() handling pending incoming call end',
        'endedCallId=$endedCallId (no active call)',
      );
      // Cancel the notification so stale Accept/Decline buttons can't send ghost signals
      _cancelCallNotification(endedCallId);

      // Clear lightweight pending state; do NOT touch engine/channel here.
      _currentCallId = null;
      _currentChannelName = null;
      _remoteUserId = null;
      _remoteUserName = null;
      _remoteUserAvatar = null;

      _callStateController.add(
        CallState(
          status: CallStatus.ended,
          callId: endedCallId,
          remoteUserId: signal.from,
          remoteUserName: signal.fromName,
        ),
      );
      return;
    }

    // Even if we ignore the signal, cancel any lingering notification for this callId
    _cancelCallNotification(endedCallId);
    _agoraLog(
      '_handleCallEnded() IGNORED',
      'callId mismatch or not from remote (notification cancelled anyway)',
    );
  }

  /// Generate a unique channel name for the call
  String _generateChannelName() {
    final uuid = const Uuid().v4().substring(0, 8);
    final timestamp = DateTime.now().millisecondsSinceEpoch
        .toString()
        .substring(8);
    return 'pact-$uuid-$timestamp';
  }

  /// Send FCM call-invite to callee so they ring when app is background/killed.
  /// Requires a Supabase Edge Function "send-call-invite" that sends high-priority FCM to the user's tokens.
  void _sendCallInviteFcm({
    required String calleeUserId,
    required String channelName,
    required String callId,
    required String callerName,
    String? callerAvatar,
    required bool isAudioOnly,
  }) {
    final userId = _userId;
    if (userId == null) return;
    Future<void>.microtask(() async {
      try {
        final response = await _supabase.functions.invoke(
          'send-call-invite',
          body: {
            'callee_user_id': calleeUserId,
            'channel_name': channelName,
            'call_id': callId,
            'caller_id': userId,
            'caller_name': _userName ?? callerName,
            'caller_avatar': callerAvatar ?? _userAvatar,
            'is_audio_only': isAudioOnly,
          },
        );
        _agoraLog(
          '_sendCallInviteFcm() sent',
          'to=$calleeUserId response=${response.data}',
        );
      } catch (e) {
        _agoraLog('_sendCallInviteFcm() failed (non-fatal)', e);
      }
    });
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
      _isOutgoingCall = true;
      _isAudioOnly = audioOnly;
      _remoteUserId = remoteUserId;
      _remoteUserName = remoteUserName;
      _remoteUserAvatar = remoteUserAvatar;
      _currentCallId = const Uuid().v4();
      _currentChannelName = _generateChannelName();
      _startOutgoingCallTimeout(_currentCallId!);
      _agoraLog(
        'startCall() state set',
        'callId=$_currentCallId channel=$_currentChannelName',
      );
      debugPrint(
        '[CALL_START] State set: callId=$_currentCallId, channel=$_currentChannelName',
      );

      // Configure video/audio when engine is available (mobile and web)
      if (_engine != null) {
        if (audioOnly) {
          try {
            await _engine!.disableVideo();
            _isVideoDisabled = true;
            _agoraLog('startCall() disableVideo success', '');
            debugPrint('[CALL_START] Video disabled for audio-only call');
          } catch (e) {
            _agoraLog(
              'startCall() disableVideo failed (non-critical)',
              e.toString(),
            );
            debugPrint('[CALL_START] DisableVideo failed: $e');
          }

          // For audio-only calls, enable speaker by default
          try {
            _isSpeakerOn = true;
            await _engine!.setEnableSpeakerphone(true);
            _agoraLog('startCall() setSpeaker success', 'audioOnly=true');
            debugPrint('[CALL_START] Speaker enabled for audio-only call');
          } catch (e) {
            _agoraLog('startCall() setSpeaker failed', e.toString());
            debugPrint('[CALL_START] SetSpeaker failed: $e');
          }
        } else {
          try {
            await _engine!.enableVideo();
            _isVideoDisabled = false;
            _agoraLog('startCall() enableVideo success', '');
            debugPrint('[CALL_START] Video enabled for video call');
          } catch (e) {
            _agoraLog(
              'startCall() enableVideo failed (non-critical)',
              e.toString(),
            );
            debugPrint('[CALL_START] EnableVideo failed: $e');
          }
        }
      } else {
        debugPrint(
          '[CALL_START] Engine is NULL - cannot configure audio/video',
        );
      }

      // Send call invite to remote user
      _agoraLog(
        'startCall() sending callRequest',
        'to=$remoteUserId channel=$_currentChannelName',
      );
      debugPrint(
        '[CALL_START] Sending call signal to $remoteUserId via channel $_currentChannelName',
      );

      try {
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
        debugPrint('[CALL_START] Signal sent successfully');
      } catch (e) {
        debugPrint('[CALL_START] SIGNAL SEND FAILED: $e');
        rethrow;
      }

      // Notify callee via FCM so they get a ring when app is in background/killed (WhatsApp-style)
      _agoraLog('startCall() sending FCM', 'to=$remoteUserId');
      debugPrint('[CALL_START] Sending FCM to $remoteUserId');

      _sendCallInviteFcm(
        calleeUserId: remoteUserId,
        channelName: _currentChannelName!,
        callId: _currentCallId!,
        callerName: remoteUserName,
        callerAvatar: remoteUserAvatar,
        isAudioOnly: audioOnly,
      );
      debugPrint('[CALL_START] FCM sent');

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
      debugPrint(
        '[CALL_START] ✓ SUCCESS - Call initiated, navigating to call screen',
      );

      return AgoraCallResult(success: true, channelName: _currentChannelName);
    } catch (e, st) {
      _agoraLog('startCall() ERROR', e);
      debugPrint('[CALL_START] ✗ EXCEPTION: $e');
      debugPrint('[AgoraCall] startCall stackTrace: $st');
      _cancelOutgoingCallTimeout();
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
      // Cancel the local notification so stale buttons can't be pressed later
      _cancelCallNotification(incomingCall.callId);

      _isInCall = true;
      _isOutgoingCall = false;
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
          try {
            await _engine!.disableVideo();
            _isVideoDisabled = true;
            _agoraLog('acceptCall() disableVideo success', '');
          } catch (e) {
            _agoraLog(
              'acceptCall() disableVideo failed (non-critical)',
              e.toString(),
            );
          }

          // For audio-only calls, enable speaker by default
          try {
            _isSpeakerOn = true;
            await _engine!.setEnableSpeakerphone(true);
            _agoraLog('acceptCall() setSpeaker success', 'audioOnly=true');
          } catch (e) {
            _agoraLog('acceptCall() setSpeaker failed', e.toString());
          }
        } else {
          try {
            await _engine!.enableVideo();
            _isVideoDisabled = false;
            _agoraLog('acceptCall() enableVideo success', '');
          } catch (e) {
            _agoraLog(
              'acceptCall() enableVideo failed (non-critical)',
              e.toString(),
            );
          }
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

      // Clean up tracking for notification actions
      _clearIncomingCallFromTracking(incomingCall.callId);

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

    if (_joinInFlight != null) {
      _agoraLog('joinChannel() WAIT', 'join already in-flight');
      await _joinInFlight;
      if (_joinedChannelName == channelName) {
        _agoraLog('joinChannel() SKIP', 'already joined $channelName');
        return;
      }
    }
    if (_joinedChannelName == channelName && _localUid != null) {
      _agoraLog('joinChannel() SKIP', 'already joined $channelName');
      return;
    }

    final joinFuture = Future<void>(() async {
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
      _joinedChannelName = channelName;

      // Ensure speaker is enabled if audio-only call (non-critical)
      if (_isAudioOnly && _isSpeakerOn) {
        await Future.delayed(const Duration(milliseconds: 500));
        try {
          await _engine!.setEnableSpeakerphone(true);
          _agoraLog('joinChannel() setSpeaker success', 'audioOnly=true');
        } catch (e) {
          _agoraLog(
            'joinChannel() setSpeaker failed (non-critical)',
            e.toString(),
          );
        }
      }

      _agoraLog('joinChannel() DONE', 'channel=$channelName');
    });
    _joinInFlight = joinFuture;
    try {
      await joinFuture;
    } catch (e, st) {
      _agoraLog('joinChannel() ERROR', e);
      debugPrint('[AgoraCall] joinChannel stackTrace: $st');
      rethrow;
    } finally {
      if (identical(_joinInFlight, joinFuture)) {
        _joinInFlight = null;
      }
    }
  }

  /// Reject an incoming call
  Future<void> rejectCall(AgoraIncomingCall incomingCall) async {
    _agoraLog(
      'rejectCall()',
      'callerId=${incomingCall.callerId} callId=${incomingCall.callId}',
    );

    // Cancel the local notification so stale buttons can't be pressed later
    _cancelCallNotification(incomingCall.callId);

    // Only send one reject per callId — prevents ghost reject floods
    if (_rejectedCallIds.contains(incomingCall.callId)) {
      _agoraLog(
        'rejectCall() SKIP',
        'already rejected callId=${incomingCall.callId}',
      );
      return;
    }
    _rejectedCallIds.add(incomingCall.callId);

    // Do NOT remove from _processedIncomingCallIds here: each call uses a unique
    // UUID, so the caller will generate a new callId for any retry. Keeping the
    // rejected callId prevents stale Supabase replays from re-showing the dialog.
    await _sendSignal(
      incomingCall.callerId,
      CallSignalType.callReject,
      callIdOverride: incomingCall.callId,
    );

    // Clean up outbound channel immediately to prevent Supabase Realtime from
    // replaying the reject broadcast back to us (which triggers more rejects).
    final ch = _outboundChannels.remove(incomingCall.callerId);
    if (ch != null) {
      _agoraLog(
        'rejectCall()',
        'cleaning up outbound channel for ${incomingCall.callerId}',
      );
      _supabase.removeChannel(ch);
    }
  }

  /// Get an incoming call by ID (used by notification action handlers)
  AgoraIncomingCall? getIncomingCallById(String callId) {
    final call = _pendingIncomingCalls[callId];
    if (call == null) {
      _agoraLog('getIncomingCallById()', 'callId=$callId NOT FOUND');
    }
    return call;
  }

  /// Clean up incoming call from tracking (called after accept/reject)
  void _clearIncomingCallFromTracking(String callId) {
    _pendingIncomingCalls.remove(callId);
  }

  /// Send call decline via signaling  (wrapper around rejectCall for notification actions)
  Future<void> sendCallDecline(String callId) async {
    final incomingCall = getIncomingCallById(callId);
    if (incomingCall != null) {
      await rejectCall(incomingCall);
      _clearIncomingCallFromTracking(callId);
    }
  }

  /// End the current call
  Future<void> endCall({bool sendCallEndSignal = true}) async {
    _agoraLog(
      'endCall() ENTER',
      '_remoteUserId=$_remoteUserId _currentCallId=$_currentCallId',
    );
    if (!_isInCall) {
      _agoraLog('endCall() SKIP', 'already ended');
      return;
    }

    _cancelOutgoingCallTimeout();

    final remoteId = _remoteUserId;
    final callId = _currentCallId;
    final callStartTime = _callStartTime;
    final callUserName = _remoteUserName;
    final callUserAvatar = _remoteUserAvatar;
    final callUserId = _userId;
    final isOutgoing = _isOutgoingCall;
    final isAudioOnly = _isAudioOnly;

    // Cancel any lingering notification for this call
    _cancelCallNotification(callId);
    _isInCall = false;
    _currentCallId = null;
    _currentChannelName = null;
    _joinedChannelName = null;
    _remoteUserId = null;
    _remoteUserName = null;
    _remoteUserAvatar = null;
    _remoteUid = null;
    _localUid = null;
    _isMuted = false;
    _isVideoDisabled = false;
    _callStartTime = null;

    if (sendCallEndSignal && remoteId != null && callId != null) {
      _agoraLog('endCall() sending callEnd to', remoteId);
      // #region agent log
      _agoraLog(
        'endCall() DEBUG [H3] callIdPayload=$callId currentCallId=$_currentCallId',
      );
      // #endregion
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

    // Trim reject dedup set
    if (_rejectedCallIds.length > 50) {
      _rejectedCallIds.clear();
    }

    // Keep processed call ids so replayed callRequest signals for ended calls
    // are still filtered by the deduplication check in _handleIncomingCall().
    if (_processedIncomingCallIds.length > 50) {
      _processedIncomingCallIds.clear();
    }

    final channelsToRemove = _outboundChannels.values.toList();
    _outboundChannels.clear();
    for (final ch in channelsToRemove) {
      try {
        await _supabase.removeChannel(ch);
      } catch (e) {
        _agoraLog('endCall() removeChannel error (ignored)', e);
      }
    }

    // Log call to call history
    if (callUserId != null &&
        remoteId != null &&
        callId != null &&
        callStartTime != null) {
      try {
        final callSummaryService = CallSummaryNotificationService();
        final callEndTime = DateTime.now();
        final callType = isAudioOnly ? 'audio' : 'video';

        await callSummaryService.saveCallSummary(
          userId: callUserId,
          callerId: isOutgoing ? remoteId : callUserId,
          callerName: isOutgoing ? callUserName : _userName,
          callerAvatar: isOutgoing ? callUserAvatar : _userAvatar,
          callType: callType,
          status: 'connected',
          startedAt: callStartTime,
          endedAt: callEndTime,
          latencyMs: 0,
          jitterMs: 0,
          packetLoss: 0.0,
          bitrate: 0,
          qualityRating: null,
          reasonForEnd: 'normal',
        );
        _agoraLog('endCall() call logged to history', 'callId=$callId');
      } catch (e) {
        _agoraLog('endCall() error logging call', e);
      }
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
    String? callIdOverride,
  }) async {
    _agoraLog(
      '_sendSignal() ENTER',
      'to=$toUserId type=${type.name} payload=$payload isAudioOnly=$isAudioOnly _userId=$_userId',
    );
    if (_userId == null) {
      _agoraLog('_sendSignal() SKIP', 'no _userId');
      debugPrint('[SIGNAL] SKIP: no _userId');
      return;
    }

    try {
      final channelName = 'agora-signaling:$toUserId';
      RealtimeChannel? cached = _outboundChannels[toUserId];
      RealtimeChannel channel;
      if (cached == null) {
        debugPrint('[SIGNAL] Creating new channel for $toUserId');
        channel = _supabase.channel(channelName);
        // Await subscribe to ensure channel is ready before sending
        final completer = Completer<void>();
        channel.subscribe((status, error) {
          if (!completer.isCompleted &&
              (status == RealtimeSubscribeStatus.subscribed || error != null)) {
            completer.complete();
          }
        });
        // Wait for subscription with a short timeout to avoid hanging
        await completer.future.timeout(
          const Duration(seconds: 3),
          onTimeout: () {
            _agoraLog('_sendSignal() subscribe timeout', 'proceeding anyway');
          },
        );
        _outboundChannels[toUserId] = channel;
        _agoraLog('_sendSignal() channel subscribed', channelName);
        debugPrint('[SIGNAL] Channel created and subscribed: $channelName');
      } else {
        channel = cached;
        debugPrint('[SIGNAL] Using cached channel for $toUserId');
      }

      final signal = CallSignal(
        type: type,
        from: _userId!,
        to: toUserId,
        fromName: _userName ?? 'Unknown',
        fromAvatar: _userAvatar,
        callId: callIdOverride ?? _currentCallId,
        payload: payload,
        isAudioOnly: isAudioOnly,
      );
      final signalPayload = signal.toJson();
      _agoraLog('_sendSignal() payload', signalPayload);
      debugPrint('[SIGNAL] Sending ${type.name} signal to $toUserId');

      await channel.sendBroadcastMessage(
        event: 'agora-signal',
        payload: signalPayload,
      );

      _agoraLog('_sendSignal() DONE', '${type.name} to $toUserId');
      debugPrint('[SIGNAL] ✓ Signal sent successfully to $toUserId');
    } catch (e, st) {
      _agoraLog('_sendSignal() ERROR', e);
      debugPrint('[SIGNAL] ✗ Failed to send signal: $e');
      debugPrint('[SIGNAL] Stack: $st');
      rethrow;
    }
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
  bool get isOutgoingCall => _isOutgoingCall;

  void _startOutgoingCallTimeout(String callId) {
    _cancelOutgoingCallTimeout();
    _outgoingCallTimeoutTimer = Timer(const Duration(seconds: 35), () async {
      if (!_isInCall || _currentCallId != callId || _remoteUid != null) {
        return;
      }

      final remoteId = _remoteUserId;
      _agoraLog(
        '_startOutgoingCallTimeout() TIMEOUT',
        'callId=$callId remote=$remoteId',
      );

      if (remoteId != null) {
        try {
          await _sendSignal(
            remoteId,
            CallSignalType.callEnd,
            payload: {'callId': callId},
            callIdOverride: callId,
          );
        } catch (e) {
          _agoraLog('_startOutgoingCallTimeout() callEnd send failed', e);
        }
      }

      _isInCall = false;
      _currentCallId = null;
      _currentChannelName = null;
      _joinedChannelName = null;
      _remoteUserId = null;
      _remoteUserName = null;
      _remoteUserAvatar = null;
      _remoteUid = null;
      _localUid = null;

      _callStateController.add(
        CallState(status: CallStatus.unreachable, callId: callId),
      );
      _remoteUserController.add(null);
    });
  }

  void _cancelOutgoingCallTimeout() {
    _outgoingCallTimeoutTimer?.cancel();
    _outgoingCallTimeoutTimer = null;
  }

  /// Send a group call invite to add a participant to ongoing call
  Future<void> sendGroupCallInvite({
    required String inviteeUserId,
    required String inviteeName,
  }) async {
    if (_currentChannelName == null || _currentCallId == null) {
      _agoraLog(
        'sendGroupCallInvite() SKIP',
        'Not in a call - no channel or callId',
      );
      return;
    }

    try {
      _agoraLog(
        'sendGroupCallInvite() ENTER',
        'inviteeId=$inviteeUserId inviteeName=$inviteeName channel=$_currentChannelName',
      );

      // Send signaling invite via Supabase
      await _sendSignal(
        inviteeUserId,
        CallSignalType.callRequest,
        payload: {
          'channelName': _currentChannelName,
          'callId': _currentCallId,
          'isAudioOnly': _isAudioOnly,
          'groupCall': true, // Indicate this is an existing call
        },
        isAudioOnly: _isAudioOnly,
      );

      // Send FCM notification
      try {
        await _supabase.functions.invoke(
          'send-call-invite',
          body: {
            'callee_user_id': inviteeUserId,
            'channel_name': _currentChannelName,
            'call_id': _currentCallId,
            'caller_id': _userId,
            'caller_name': _userName,
            'caller_avatar': _userAvatar,
            'is_audio_only': _isAudioOnly,
            'group_call': true,
          },
        );
      } catch (e) {
        _agoraLog('sendGroupCallInvite() FCM failed (non-fatal)', e);
      }

      _agoraLog('sendGroupCallInvite() DONE', 'invitee=$inviteeUserId');
    } catch (e) {
      _agoraLog('sendGroupCallInvite() ERROR', e);
      rethrow;
    }
  }

  /// Dispose resources
  Future<void> dispose() async {
    _cancelOutgoingCallTimeout();
    if (_signalingChannel != null) {
      await _supabase.removeChannel(_signalingChannel!);
    }
    if (_engine != null) {
      await _engine!.leaveChannel();
      await _engine!.release();
      _engine = null;
      _engineInitialized = false;
      _joinedChannelName = null;
    }
    await _callStateController.close();
    await _incomingCallController.close();
    await _remoteUserController.close();
  }
}

/// Agora call result model
class AgoraCallResult {
  final bool success;
  final String? channelName;
  final String? error;

  AgoraCallResult({required this.success, this.channelName, this.error});
}
