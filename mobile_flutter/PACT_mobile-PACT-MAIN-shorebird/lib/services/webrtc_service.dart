// lib/services/webrtc_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/call_signal.dart';
import '../models/call_state.dart';
import 'bilingual_notification_service.dart';
import 'user_notification_service.dart';

/// WebRTC service for handling audio/video calls with improved reliability
class WebRTCService {
  static final WebRTCService _instance = WebRTCService._internal();
  factory WebRTCService() => _instance;
  WebRTCService._internal();

  // Supabase client
  final SupabaseClient _supabase = Supabase.instance.client;

  // Call state
  CallState _callState = CallState();
  CallState get callState => _callState;

  // User info
  String? _userId;
  String? _userName;
  String? _userAvatar;

  // WebRTC components
  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  MediaStream? _remoteStream;

  // Signaling channels
  RealtimeChannel? _signalingChannel;
  RealtimeChannel? _presenceChannel;

  // Keep track of active outbound channels for reliable signaling
  final Map<String, RealtimeChannel> _outboundChannels = {};

  // Audio player for call sounds
  final AudioPlayer _audioPlayer = AudioPlayer();

  // Call timeout timer (for unanswered calls)
  Timer? _callTimeoutTimer;
  static const Duration _callTimeoutDuration = Duration(seconds: 45);

  // Connection retry settings
  int _retryCount = 0;
  static const int _maxRetries = 3;
  Timer? _retryTimer;

  // Stream controllers for state updates
  final _callStateController = StreamController<CallState>.broadcast();
  Stream<CallState> get callStateStream => _callStateController.stream;

  final _remoteStreamController = StreamController<MediaStream?>.broadcast();
  Stream<MediaStream?> get remoteStreamStream => _remoteStreamController.stream;

  final _localStreamController = StreamController<MediaStream?>.broadcast();
  Stream<MediaStream?> get localStreamStream => _localStreamController.stream;

  // Error stream for UI feedback
  final _errorController = StreamController<String>.broadcast();
  Stream<String> get errorStream => _errorController.stream;

  // ICE servers configuration with STUN and TURN for better connectivity
  // TURN servers are essential for users behind symmetric NATs or strict firewalls
  Map<String, dynamic> _iceServers = {
    'iceServers': [
      // Google STUN servers (free, reliable)
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      {'urls': 'stun:stun3.l.google.com:19302'},
      // OpenRelay TURN servers (free, community-maintained)
      {
        'urls': 'turn:openrelay.metered.ca:80',
        'username': 'openrelayproject',
        'credential': 'openrelayproject',
      },
      {
        'urls': 'turn:openrelay.metered.ca:443',
        'username': 'openrelayproject',
        'credential': 'openrelayproject',
      },
      {
        'urls': 'turn:openrelay.metered.ca:443?transport=tcp',
        'username': 'openrelayproject',
        'credential': 'openrelayproject',
      },
      // Metered TURN servers (free tier available)
      {
        'urls': 'turn:a.relay.metered.ca:80',
        'username': 'e8dd65c92641c31e16de6eda',
        'credential': 'uWdWNmkhvyqTEswO',
      },
      {
        'urls': 'turn:a.relay.metered.ca:443',
        'username': 'e8dd65c92641c31e16de6eda',
        'credential': 'uWdWNmkhvyqTEswO',
      },
      {
        'urls': 'turn:a.relay.metered.ca:443?transport=tcp',
        'username': 'e8dd65c92641c31e16de6eda',
        'credential': 'uWdWNmkhvyqTEswO',
      },
    ],
    'iceCandidatePoolSize': 10,
  };

  // Custom TURN server credentials (loaded from Supabase config)
  String? _customTurnUrl;
  String? _customTurnUsername;
  String? _customTurnCredential;

  // Channel subscription state tracking
  bool _signalingChannelReady = false;
  bool _presenceChannelReady = false;

  bool get isSignalingReady => _signalingChannelReady;
  bool get isPresenceReady => _presenceChannelReady;

  bool get isInitialized => _userId != null && _signalingChannel != null;
  bool get isFullyReady => isInitialized && _signalingChannelReady;

  /// Initialize the service with user information
  Future<void> initialize(
    String userId,
    String userName, {
    String? userAvatar,
  }) async {
    if (_userId == userId && _signalingChannel != null) {
      debugPrint('[WebRTC] Already initialized for user: $userId');
      return;
    }

    _userId = userId;
    _userName = userName;
    _userAvatar = userAvatar;

    // Run initialization tasks in parallel with error handling
    // Each task is independent so failures are handled individually
    try {
      await Future.wait([
        _loadTurnCredentials().catchError((e) {
          debugPrint(
            '[WebRTC] TURN credentials load failed (using defaults): $e',
          );
        }),
        _setupSignalingChannel().catchError((e) {
          debugPrint('[WebRTC] Signaling channel setup failed: $e');
        }),
        _setupPresenceChannel().catchError((e) {
          debugPrint('[WebRTC] Presence channel setup failed: $e');
        }),
      ]);
    } catch (e) {
      debugPrint('[WebRTC] Initialization error (continuing anyway): $e');
    }

    debugPrint('[WebRTC] Initialized for user: $userName ($userId)');
  }

  /// Load custom TURN server credentials from Supabase app_config table
  Future<void> _loadTurnCredentials() async {
    try {
      final response = await _supabase
          .from('app_config')
          .select('key, value')
          .inFilter('key', ['turn_url', 'turn_username', 'turn_credential']);

      final configs = List<Map<String, dynamic>>.from(response as List);

      for (final config in configs) {
        final key = config['key'] as String?;
        final value = config['value'] as String?;

        if (key == 'turn_url' && value != null && value.isNotEmpty) {
          _customTurnUrl = value;
        } else if (key == 'turn_username' &&
            value != null &&
            value.isNotEmpty) {
          _customTurnUsername = value;
        } else if (key == 'turn_credential' &&
            value != null &&
            value.isNotEmpty) {
          _customTurnCredential = value;
        }
      }

      // Add custom TURN server if credentials are available
      if (_customTurnUrl != null &&
          _customTurnUsername != null &&
          _customTurnCredential != null) {
        debugPrint('[WebRTC] Adding custom TURN server: $_customTurnUrl');

        final iceServers = List<Map<String, dynamic>>.from(
          _iceServers['iceServers'] as List,
        );

        // Add custom TURN with multiple transport options
        iceServers.insert(0, {
          'urls': _customTurnUrl,
          'username': _customTurnUsername,
          'credential': _customTurnCredential,
        });

        // Add TCP variant if not already TCP
        if (!_customTurnUrl!.contains('transport=tcp')) {
          final tcpUrl = _customTurnUrl!.contains('?')
              ? '$_customTurnUrl&transport=tcp'
              : '$_customTurnUrl?transport=tcp';
          iceServers.insert(1, {
            'urls': tcpUrl,
            'username': _customTurnUsername,
            'credential': _customTurnCredential,
          });
        }

        _iceServers = {'iceServers': iceServers, 'iceCandidatePoolSize': 10};

        debugPrint('[WebRTC] Custom TURN server added successfully');
      } else {
        debugPrint(
          '[WebRTC] Using default TURN servers (no custom config found)',
        );
      }
    } catch (e) {
      debugPrint('[WebRTC] Error loading TURN credentials: $e');
      // Continue with default servers if loading fails
    }
  }

  /// Configure custom TURN server programmatically
  void configureTurnServer({
    required String url,
    required String username,
    required String credential,
  }) {
    _customTurnUrl = url;
    _customTurnUsername = username;
    _customTurnCredential = credential;

    final iceServers = List<Map<String, dynamic>>.from(
      _iceServers['iceServers'] as List,
    );

    // Add at the beginning for priority
    iceServers.insert(0, {
      'urls': url,
      'username': username,
      'credential': credential,
    });

    // Add TCP variant
    final tcpUrl = url.contains('?')
        ? '$url&transport=tcp'
        : '$url?transport=tcp';
    iceServers.insert(1, {
      'urls': tcpUrl,
      'username': username,
      'credential': credential,
    });

    _iceServers = {'iceServers': iceServers, 'iceCandidatePoolSize': 10};

    debugPrint('[WebRTC] Custom TURN server configured: $url');
  }

  /// Get current ICE server configuration (for debugging)
  List<Map<String, dynamic>> getIceServers() {
    return List<Map<String, dynamic>>.from(_iceServers['iceServers'] as List);
  }

  /// Setup signaling channel for receiving call signals
  Future<void> _setupSignalingChannel() async {
    if (_userId == null) return;

    _signalingChannelReady = false;
    await _signalingChannel?.unsubscribe();
    _signalingChannel = _supabase.channel('calls:user:$_userId');

    _signalingChannel!
        .onBroadcast(
          event: 'call-signal',
          callback: (payload) {
            debugPrint('[WebRTC] Received signal: ${payload['type']}');
            _handleSignal(CallSignal.fromJson(payload));
          },
        )
        .subscribe((status, [error]) {
          debugPrint('[WebRTC] Signaling channel status: $status');
          if (status == RealtimeSubscribeStatus.subscribed) {
            _signalingChannelReady = true;
            debugPrint('[WebRTC] Signaling channel ready');
          } else if (status == RealtimeSubscribeStatus.closed ||
              status == RealtimeSubscribeStatus.timedOut) {
            _signalingChannelReady = false;
            debugPrint('[WebRTC] Signaling channel closed/timed out');
          }
          if (error != null) {
            _signalingChannelReady = false;
            debugPrint('[WebRTC] Signaling channel error: $error');
          }
        });
  }

  /// Setup presence channel for call status tracking
  Future<void> _setupPresenceChannel() async {
    _presenceChannelReady = false;
    await _presenceChannel?.unsubscribe();
    _presenceChannel = _supabase.channel('user-call-presence');

    _presenceChannel!.subscribe((status, [error]) {
      if (status == RealtimeSubscribeStatus.subscribed) {
        _presenceChannelReady = true;
        _updatePresence(inCall: false);
        debugPrint('[WebRTC] Presence channel ready');
      } else if (status == RealtimeSubscribeStatus.closed ||
          status == RealtimeSubscribeStatus.timedOut) {
        _presenceChannelReady = false;
        debugPrint('[WebRTC] Presence channel closed/timed out');
      }
      if (error != null) {
        _presenceChannelReady = false;
        debugPrint('[WebRTC] Presence channel error: $error');
      }
    });
  }

  /// Update user presence
  Future<void> _updatePresence({
    required bool inCall,
    String? callId,
    String? callToken,
  }) async {
    if (_userId == null || _presenceChannel == null) return;

    try {
      await _presenceChannel!.track({
        'user_id': _userId,
        'user_name': _userName,
        'user_avatar': _userAvatar,
        'in_call': inCall,
        'call_id': callId,
        'call_token': callToken,
        'last_seen': DateTime.now().toIso8601String(),
        'timestamp': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('[WebRTC] Error updating presence: $e');
    }
  }

  /// Check if user is online (in presence channel)
  Future<bool> isUserOnline(String userId) async {
    try {
      final presences = _presenceChannel?.presenceState();
      if (presences == null || presences.isEmpty) return false;

      // presenceState() returns List<SinglePresenceState>
      // Each SinglePresenceState has .presences which is List<Presence>
      for (final singleState in presences) {
        for (final presence in singleState.presences) {
          final data = presence.payload;
          if (data['user_id'] == userId) {
            return true;
          }
        }
      }
      return false;
    } catch (e) {
      debugPrint('[WebRTC] Error checking user online: $e');
      return false;
    }
  }

  /// Check if user is busy (in another call)
  Future<bool> _checkUserBusy(String userId) async {
    try {
      final presences = _presenceChannel?.presenceState();
      if (presences == null || presences.isEmpty) return false;

      // presenceState() returns List<SinglePresenceState>
      for (final singleState in presences) {
        for (final presence in singleState.presences) {
          final data = presence.payload;
          if (data['user_id'] == userId && data['in_call'] == true) {
            return true;
          }
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /// Initiate a call to a target user
  Future<bool> initiateCall(
    String targetUserId,
    String targetUserName, {
    String? targetUserAvatar,
    bool isAudioOnly = false,
  }) async {
    if (_userId == null) {
      _errorController.add('Service not initialized. Please restart the app.');
      return false;
    }

    if (_callState.isInCall) {
      _errorController.add('Already in a call');
      return false;
    }

    // Check signaling channel readiness - retry setup if not ready
    if (!_signalingChannelReady) {
      debugPrint(
        '[WebRTC] Signaling channel not ready, attempting to reconnect...',
      );
      try {
        await _setupSignalingChannel();

        // Wait for subscription to complete with polling (up to 3 seconds)
        int attempts = 0;
        const maxAttempts = 6;
        while (!_signalingChannelReady && attempts < maxAttempts) {
          await Future.delayed(const Duration(milliseconds: 500));
          attempts++;
          debugPrint(
            '[WebRTC] Waiting for signaling channel... attempt $attempts/$maxAttempts',
          );
        }

        if (!_signalingChannelReady) {
          debugPrint(
            '[WebRTC] Signaling channel still not ready after $maxAttempts attempts',
          );
          _errorController.add(
            'Connection not ready. Please check your internet and try again.',
          );
          return false;
        }
        debugPrint('[WebRTC] Signaling channel ready after $attempts attempts');
      } catch (e) {
        debugPrint('[WebRTC] Failed to setup signaling channel: $e');
        _errorController.add(
          'Connection error. Please check your internet and try again.',
        );
        return false;
      }
    }

    // Check if target user is busy
    if (await _checkUserBusy(targetUserId)) {
      _updateCallState(CallStatus.busy);
      _errorController.add('User is busy or unavailable');
      return false;
    }

    try {
      // Generate call ID and token
      final callId = const Uuid().v4();
      final callToken = const Uuid().v4();

      debugPrint('[WebRTC] Initiating call to $targetUserName ($targetUserId)');

      // Update call state immediately for faster UI feedback
      _callState = _callState.copyWith(
        status: CallStatus.calling,
        callId: callId,
        callToken: callToken,
        remoteUserId: targetUserId,
        remoteUserName: targetUserName,
        remoteUserAvatar: targetUserAvatar,
        isAudioOnly: isAudioOnly,
        startTime: DateTime.now(),
      );
      _callStateController.add(_callState);

      // Pre-warm the signaling channel for faster signal delivery
      _prewarmChannel(targetUserId);

      // Run presence update and media setup in parallel for faster call start
      try {
        await Future.wait([
          _updatePresence(inCall: true, callId: callId, callToken: callToken),
          _setupLocalMedia(isAudioOnly: isAudioOnly),
        ]);
      } catch (mediaError) {
        // _setupLocalMedia already handles cleanup and state reset for permission errors
        debugPrint('[WebRTC] Media setup failed: $mediaError');
        return false;
      }

      // Send call request signal with retry
      final success = await _sendSignalWithRetry(
        CallSignal(
          type: CallSignalType.callRequest,
          from: _userId!,
          to: targetUserId,
          fromName: _userName!,
          fromAvatar: _userAvatar,
          callId: callId,
          callToken: callToken,
          isAudioOnly: isAudioOnly,
        ),
      );

      if (!success) {
        _errorController.add('Unable to connect call. Please try again.');
        await _cleanup();
        _updateCallState(CallStatus.idle);
        return false;
      }

      // Start call timeout timer - end call if not answered within timeout
      _startCallTimeoutTimer();

      return true;
    } catch (e) {
      debugPrint('[WebRTC] Error initiating call: $e');
      _errorController.add('Unable to connect call: ${e.toString()}');
      await _updatePresence(inCall: false);
      await _cleanup();
      _updateCallState(CallStatus.idle);
      return false;
    }
  }

  /// Accept an incoming call
  Future<void> acceptCall(
    String callerId,
    String callId,
    String callToken,
  ) async {
    if (_userId == null) return;

    // Guard: Prevent double-accept
    if (_callState.status == CallStatus.connected ||
        _callState.status == CallStatus.calling) {
      debugPrint(
        '[WebRTC] Ignoring acceptCall - already in state: ${_callState.status}',
      );
      return;
    }

    try {
      debugPrint('[WebRTC] Accepting call from $callerId');

      // Update call state
      _callState = _callState.copyWith(
        status: CallStatus.ringing,
        callId: callId,
        callToken: callToken,
      );
      _callStateController.add(_callState);

      // Update presence
      await _updatePresence(inCall: true, callId: callId, callToken: callToken);

      // Setup local media
      await _setupLocalMedia(isAudioOnly: _callState.isAudioOnly);

      // Send accept signal - caller will create and send the offer
      await _sendSignalWithRetry(
        CallSignal(
          type: CallSignalType.callAccept,
          from: _userId!,
          to: callerId,
          fromName: _userName!,
          fromAvatar: _userAvatar,
          callId: callId,
          callToken: callToken,
        ),
      );

      // DO NOT create offer here - wait for caller to send offer
      // The caller will create the offer after receiving our callAccept signal
      debugPrint('[WebRTC] Call accepted, waiting for offer from caller...');
    } catch (e) {
      debugPrint('[WebRTC] Error accepting call: $e');
      _errorController.add('Failed to accept call: ${e.toString()}');
      await _cleanup();
      _updateCallState(CallStatus.idle);
    }
  }

  /// Reject an incoming call
  Future<void> rejectCall(String callerId, String callId) async {
    if (_userId == null) return;

    // Guard: Prevent multiple rejects
    if (_callState.status == CallStatus.idle ||
        _callState.status == CallStatus.rejected ||
        _callState.status == CallStatus.ended) {
      debugPrint(
        '[WebRTC] Ignoring rejectCall - already in state: ${_callState.status}',
      );
      return;
    }

    await _sendSignalWithRetry(
      CallSignal(
        type: CallSignalType.callReject,
        from: _userId!,
        to: callerId,
        fromName: _userName!,
        fromAvatar: _userAvatar,
        callId: callId,
      ),
    );

    _updateCallState(CallStatus.rejected);
    await _cleanup();
  }

  /// End the current call
  Future<void> endCall() async {
    debugPrint('[WebRTC] Ending call');

    final remoteUserId = _callState.remoteUserId;
    final callId = _callState.callId;

    if (_userId != null && remoteUserId != null) {
      await _sendSignalWithRetry(
        CallSignal(
          type: CallSignalType.callEnd,
          from: _userId!,
          to: remoteUserId,
          fromName: _userName ?? '',
          fromAvatar: _userAvatar,
          callId: callId,
        ),
      );
    }

    await _cleanup();
    _updateCallState(CallStatus.ended);

    // Reset to idle after a brief delay
    Future.delayed(const Duration(seconds: 2), () {
      if (_callState.status == CallStatus.ended) {
        _updateCallState(CallStatus.idle);
      }
    });
  }

  /// Request microphone and camera permissions
  Future<bool> requestCallPermissions({bool needsCamera = false}) async {
    try {
      debugPrint('[WebRTC] Requesting call permissions (camera: $needsCamera)');

      // Request microphone permission (always needed for calls)
      final micStatus = await Permission.microphone.request();
      debugPrint('[WebRTC] Microphone permission: $micStatus');

      if (!micStatus.isGranted) {
        _errorController.add(
          'Microphone permission is required for calls. Please enable it in Settings.',
        );
        return false;
      }

      // Request camera permission if video call
      if (needsCamera) {
        final cameraStatus = await Permission.camera.request();
        debugPrint('[WebRTC] Camera permission: $cameraStatus');

        if (!cameraStatus.isGranted) {
          _errorController.add(
            'Camera permission is required for video calls. Please enable it in Settings.',
          );
          return false;
        }
      }

      return true;
    } catch (e) {
      debugPrint('[WebRTC] Error requesting permissions: $e');
      _errorController.add('Failed to request permissions: $e');
      return false;
    }
  }

  /// Setup local media stream
  Future<void> _setupLocalMedia({bool isAudioOnly = false}) async {
    try {
      // Request permissions before accessing media
      final hasPermissions = await requestCallPermissions(
        needsCamera: !isAudioOnly,
      );
      if (!hasPermissions) {
        throw Exception('Required permissions not granted');
      }

      final Map<String, dynamic> mediaConstraints = {
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
          'sampleRate': 48000,
          'channelCount': 1,
        },
        'video': !isAudioOnly
            ? {
                'mandatory': {
                  'minWidth': '640',
                  'minHeight': '480',
                  'minFrameRate': '30',
                },
                'facingMode': 'user',
              }
            : false,
      };

      _localStream = await navigator.mediaDevices.getUserMedia(
        mediaConstraints,
      );
      _localStreamController.add(_localStream);
      debugPrint('[WebRTC] Local media stream acquired');
    } catch (e) {
      debugPrint('[WebRTC] Error getting local media: $e');
      // Check if it's a permission error
      final errorStr = e.toString().toLowerCase();
      if (errorStr.contains('notallowederror') ||
          errorStr.contains('permission') ||
          errorStr.contains('denied') ||
          errorStr.contains('domexception')) {
        // Clean up call state and presence when permissions are denied
        debugPrint(
          '[WebRTC] Permission denied - cleaning up call state and presence',
        );
        await _updatePresence(inCall: false);
        await _cleanup();
        _updateCallState(CallStatus.idle);
        _errorController.add(
          'Microphone/camera permission denied. Please enable in Settings.',
        );
        throw Exception(
          'Microphone/camera permission denied. Please enable in Settings.',
        );
      }
      throw Exception('Failed to access camera/microphone: $e');
    }
  }

  /// Create peer connection
  Future<void> _createPeerConnection() async {
    final configuration = <String, dynamic>{
      ..._iceServers,
      'sdpSemantics': 'unified-plan',
    };

    _peerConnection = await createPeerConnection(configuration);
    debugPrint('[WebRTC] Peer connection created');

    // Add local stream tracks
    if (_localStream != null) {
      _localStream!.getTracks().forEach((track) {
        _peerConnection!.addTrack(track, _localStream!);
      });
    }

    // Handle ICE candidates
    _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
      debugPrint('[WebRTC] ICE candidate generated');
      _sendSignalWithRetry(
        CallSignal(
          type: CallSignalType.iceCandidate,
          from: _userId!,
          to: _callState.remoteUserId!,
          fromName: _userName!,
          fromAvatar: _userAvatar,
          callId: _callState.callId,
          callToken: _callState.callToken,
          payload: candidate.toMap(),
        ),
      );
    };

    // Handle remote stream
    _peerConnection!.onTrack = (RTCTrackEvent event) {
      debugPrint('[WebRTC] Remote track received');
      if (event.streams.isNotEmpty) {
        _remoteStream = event.streams[0];
        _remoteStreamController.add(_remoteStream);
      }
    };

    // Handle ICE connection state
    _peerConnection!.onIceConnectionState = (RTCIceConnectionState state) {
      debugPrint('[WebRTC] ICE connection state: $state');
      if (state == RTCIceConnectionState.RTCIceConnectionStateConnected) {
        _updateCallState(CallStatus.connected);
      } else if (state == RTCIceConnectionState.RTCIceConnectionStateFailed) {
        _handleConnectionFailure();
      }
    };

    // Handle connection state changes
    _peerConnection!.onConnectionState = (RTCPeerConnectionState state) {
      debugPrint('[WebRTC] Connection state: $state');
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _updateCallState(CallStatus.connected);
        _retryCount = 0;
        _stopAutoReconnect();
        _startStatsCollection();
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        _stopStatsCollection();
        _handleConnectionFailure();
      } else if (state ==
          RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        // Try auto-reconnect first before ending
        _stopStatsCollection();
        _startAutoReconnect();
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
        _stopStatsCollection();
        _stopAutoReconnect();
        if (_callState.status == CallStatus.connected ||
            _callState.status == CallStatus.reconnecting) {
          endCall();
        }
      }
    };
  }

  /// Handle connection failure with retry
  void _handleConnectionFailure() {
    if (_retryCount < _maxRetries) {
      _retryCount++;
      debugPrint('[WebRTC] Connection failed, retry $_retryCount/$_maxRetries');
      _retryTimer = Timer(Duration(seconds: 2 * _retryCount), () async {
        if (_callState.isInCall && _peerConnection != null) {
          await _peerConnection!.restartIce();
        }
      });
    } else {
      debugPrint('[WebRTC] Max retries reached, ending call');
      _errorController.add('Connection failed. Please try again.');
      endCall();
    }
  }

  /// Create and send offer
  Future<void> _createOffer() async {
    if (_peerConnection == null) return;

    final offer = await _peerConnection!.createOffer();
    await _peerConnection!.setLocalDescription(offer);

    await _sendSignalWithRetry(
      CallSignal(
        type: CallSignalType.offer,
        from: _userId!,
        to: _callState.remoteUserId!,
        fromName: _userName!,
        fromAvatar: _userAvatar,
        callId: _callState.callId,
        callToken: _callState.callToken,
        payload: {'sdp': offer.sdp, 'type': offer.type},
      ),
    );
  }

  /// Handle incoming offer (caller receives this after callee accepts)
  Future<void> _handleOffer(Map<String, dynamic> offer) async {
    debugPrint('[WebRTC] Handling offer from callee');

    // Ensure we have local media before creating peer connection
    // (Caller should already have it from initiateCall, but verify)
    if (_localStream == null) {
      debugPrint('[WebRTC] No local stream - setting up media first');
      try {
        await _setupLocalMedia(isAudioOnly: _callState.isAudioOnly);
      } catch (e) {
        debugPrint('[WebRTC] Failed to setup local media: $e');
        _errorController.add(
          'Failed to access microphone. Please check permissions.',
        );
        await _cleanup();
        _updateCallState(CallStatus.ended);
        return;
      }
    }

    await _createPeerConnection();

    await _peerConnection!.setRemoteDescription(
      RTCSessionDescription(offer['sdp'], offer['type']),
    );

    final answer = await _peerConnection!.createAnswer();
    await _peerConnection!.setLocalDescription(answer);

    debugPrint('[WebRTC] Sending answer back to callee');

    await _sendSignalWithRetry(
      CallSignal(
        type: CallSignalType.answer,
        from: _userId!,
        to: _callState.remoteUserId!,
        fromName: _userName!,
        fromAvatar: _userAvatar,
        callId: _callState.callId,
        callToken: _callState.callToken,
        payload: {'sdp': answer.sdp, 'type': answer.type},
      ),
    );
  }

  /// Handle incoming answer
  Future<void> _handleAnswer(Map<String, dynamic> answer) async {
    if (_peerConnection == null) return;
    debugPrint('[WebRTC] Handling answer');

    await _peerConnection!.setRemoteDescription(
      RTCSessionDescription(answer['sdp'], answer['type']),
    );
  }

  /// Handle ICE candidate
  Future<void> _handleIceCandidate(Map<String, dynamic> candidate) async {
    if (_peerConnection == null) return;

    try {
      await _peerConnection!.addCandidate(
        RTCIceCandidate(
          candidate['candidate'],
          candidate['sdpMid'],
          candidate['sdpMLineIndex'],
        ),
      );
    } catch (e) {
      debugPrint('[WebRTC] Error adding ICE candidate: $e');
    }
  }

  /// Handle incoming signal
  Future<void> _handleSignal(CallSignal signal) async {
    debugPrint('[WebRTC] Processing signal: ${signal.type}');

    switch (signal.type) {
      case CallSignalType.callRequest:
        // Guard: Ignore if we're already in an active call or ringing state
        if (_callState.status != CallStatus.idle) {
          debugPrint(
            '[WebRTC] Ignoring callRequest - already in state: ${_callState.status}',
          );
          // Send busy signal if we're in an active call
          if (_callState.status == CallStatus.connected ||
              _callState.status == CallStatus.calling ||
              _callState.status == CallStatus.ringing) {
            await _sendSignal(
              CallSignal(
                type: CallSignalType.callBusy,
                from: _userId!,
                to: signal.from,
                fromName: _userName ?? '',
                callId: signal.callId,
                callToken: signal.callToken,
              ),
            );
          }
          break;
        }

        _callState = _callState.copyWith(
          status: CallStatus.ringing,
          callId: signal.callId,
          callToken: signal.callToken,
          remoteUserId: signal.from,
          remoteUserName: signal.fromName,
          remoteUserAvatar: signal.fromAvatar,
          isAudioOnly: signal.isAudioOnly ?? false,
        );
        _callStateController.add(_callState);

        // Show push notification for incoming call
        await BilingualNotificationService.showIncomingCallNotification(
          callerName: signal.fromName ?? 'Unknown',
          callId: signal.callId ?? '',
        );

        // Add to in-app notification bell
        _addCallNotificationToBell(
          callerName: signal.fromName ?? 'Unknown',
          callId: signal.callId ?? '',
          type: 'incoming_call',
        );
        break;

      case CallSignalType.callAccept:
        // Call was accepted by the callee - they will send an offer next
        // Do NOT create peer connection here - wait for the offer
        debugPrint('[WebRTC] Call accepted, waiting for offer from callee');
        _cancelCallTimeoutTimer(); // Stop timeout since call was accepted
        _callState = _callState.copyWith(status: CallStatus.ringing);
        _callStateController.add(_callState);
        break;

      case CallSignalType.callReject:
        _updateCallState(CallStatus.rejected);
        await _cleanup();
        break;

      case CallSignalType.callEnd:
        _updateCallState(CallStatus.ended);
        await _cleanup();
        break;

      case CallSignalType.callBusy:
        _updateCallState(CallStatus.busy);
        await _cleanup();
        break;

      case CallSignalType.offer:
        if (signal.payload != null) {
          await _handleOffer(signal.payload!);
        }
        break;

      case CallSignalType.answer:
        if (signal.payload != null) {
          await _handleAnswer(signal.payload!);
        }
        break;

      case CallSignalType.iceCandidate:
        if (signal.payload != null) {
          await _handleIceCandidate(signal.payload!);
        }
        break;

      default:
        break;
    }
  }

  /// Send signal with retry logic for reliability
  /// Uses faster retry delays for quicker call establishment
  Future<bool> _sendSignalWithRetry(
    CallSignal signal, {
    int maxRetries = 3,
  }) async {
    for (int attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await _sendSignal(signal);
        return true;
      } catch (e) {
        debugPrint('[WebRTC] Signal send attempt ${attempt + 1} failed: $e');
        if (attempt < maxRetries - 1) {
          // Faster retry with 200ms base delay for quicker call start
          await Future.delayed(Duration(milliseconds: 200 * (attempt + 1)));
        }
      }
    }
    return false;
  }

  /// Send signal to target user with persistent channel
  Future<void> _sendSignal(CallSignal signal) async {
    final channelName = 'calls:user:${signal.to}';

    // Reuse or create channel
    RealtimeChannel channel;
    if (_outboundChannels.containsKey(channelName)) {
      channel = _outboundChannels[channelName]!;
    } else {
      channel = _supabase.channel(channelName);
      _outboundChannels[channelName] = channel;

      // Subscribe and wait for connection
      final completer = Completer<void>();
      channel.subscribe((status, [error]) {
        if (status == RealtimeSubscribeStatus.subscribed) {
          if (!completer.isCompleted) completer.complete();
        } else if (status == RealtimeSubscribeStatus.closed || error != null) {
          // Defer removal to avoid concurrent modification
          Future.microtask(() {
            _outboundChannels.remove(channelName);
          });
          if (!completer.isCompleted) {
            completer.completeError(error ?? 'Channel closed');
          }
        }
      });

      // Wait for subscription with reduced timeout for faster call start
      await completer.future.timeout(
        const Duration(seconds: 3),
        onTimeout: () => throw Exception('Channel subscription timeout'),
      );
    }

    await channel.sendBroadcastMessage(
      event: 'call-signal',
      payload: signal.toJson(),
    );

    debugPrint('[WebRTC] Signal sent: ${signal.type} to ${signal.to}');
  }

  /// Pre-warm a signaling channel for faster call initiation
  /// This starts the channel subscription in the background before it's needed
  void _prewarmChannel(String targetUserId) {
    final channelName = 'calls:user:$targetUserId';

    // Skip if already warmed
    if (_outboundChannels.containsKey(channelName)) {
      return;
    }

    // Create and subscribe to channel in background
    final channel = _supabase.channel(channelName);
    _outboundChannels[channelName] = channel;

    channel.subscribe((status, [error]) {
      if (status == RealtimeSubscribeStatus.subscribed) {
        debugPrint('[WebRTC] Channel pre-warmed for $targetUserId');
      } else if (status == RealtimeSubscribeStatus.closed || error != null) {
        // Remove failed channel asynchronously to avoid concurrent modification
        // Use Future.microtask to defer the removal
        Future.microtask(() {
          _outboundChannels.remove(channelName);
        });
        debugPrint('[WebRTC] Channel pre-warm failed for $targetUserId');
      }
    });
  }

  /// Play ringing sound
  Future<void> _playRingingSound() async {
    try {
      await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      await _audioPlayer.play(
        AssetSource('sounds/Phone Dial Tone - Sound Effect (HD).mp3'),
      );
    } catch (e) {
      debugPrint('[WebRTC] Error playing ringing sound: $e');
    }
  }

  /// Stop ringing sound
  Future<void> _stopRingingSound() async {
    try {
      await _audioPlayer.stop();
    } catch (e) {
      debugPrint('[WebRTC] Error stopping ringing sound: $e');
    }
  }

  /// Toggle video
  Future<bool> toggleVideo() async {
    if (_localStream == null) return false;

    final videoTracks = _localStream!.getVideoTracks();
    if (videoTracks.isEmpty) return false;

    final videoTrack = videoTracks.first;
    final enabled = !videoTrack.enabled;
    videoTrack.enabled = enabled;

    _callState = _callState.copyWith(isVideoEnabled: enabled);
    _callStateController.add(_callState);

    return enabled;
  }

  /// Toggle mute
  bool toggleMute() {
    if (_localStream == null) return false;

    final audioTracks = _localStream!.getAudioTracks();
    if (audioTracks.isEmpty) return false;

    final audioTrack = audioTracks.first;
    final muted = audioTrack.enabled;
    audioTrack.enabled = !muted;

    _callState = _callState.copyWith(isMuted: muted);
    _callStateController.add(_callState);

    return muted;
  }

  /// Toggle speaker (earpiece/speaker)
  bool toggleSpeaker() {
    final speakerOn = !_callState.isSpeakerOn;

    // Use flutter_webrtc helper to switch audio output
    try {
      Helper.setSpeakerphoneOn(speakerOn);
    } catch (e) {
      debugPrint('[WebRTC] Error toggling speaker: $e');
    }

    _callState = _callState.copyWith(isSpeakerOn: speakerOn);
    _callStateController.add(_callState);

    return speakerOn;
  }

  /// Switch camera (front/back)
  Future<void> switchCamera() async {
    if (_localStream == null) return;

    final videoTracks = _localStream!.getVideoTracks();
    if (videoTracks.isNotEmpty) {
      await Helper.switchCamera(videoTracks.first);
    }
  }

  /// Get local stream
  MediaStream? getLocalStream() => _localStream;

  /// Get remote stream
  MediaStream? getRemoteStream() => _remoteStream;

  /// Update call state
  void _updateCallState(CallStatus status) {
    final previousStatus = _callState.status;
    _callState = _callState.copyWith(status: status);
    _callStateController.add(_callState);

    // Cancel call timeout timer when call is answered or ends
    if (status == CallStatus.connected ||
        status == CallStatus.idle ||
        status == CallStatus.ended ||
        status == CallStatus.rejected ||
        status == CallStatus.busy) {
      _cancelCallTimeoutTimer();
    }

    // Handle call sounds
    if (status == CallStatus.calling && previousStatus != CallStatus.calling) {
      _playRingingSound();
    } else if (status == CallStatus.ringing &&
        previousStatus != CallStatus.ringing) {
      _playRingingSound();
    } else if ((status == CallStatus.connected ||
            status == CallStatus.idle ||
            status == CallStatus.ended ||
            status == CallStatus.rejected ||
            status == CallStatus.busy) &&
        (previousStatus == CallStatus.calling ||
            previousStatus == CallStatus.ringing)) {
      _stopRingingSound();
    }
  }

  /// Start call timeout timer
  void _startCallTimeoutTimer() {
    _cancelCallTimeoutTimer();
    _callTimeoutTimer = Timer(_callTimeoutDuration, () async {
      if (_callState.status == CallStatus.calling ||
          _callState.status == CallStatus.ringing) {
        debugPrint('[WebRTC] Call timeout - no answer');
        _errorController.add('User is busy or unavailable');

        // Show missed call notification for the caller
        if (_callState.remoteUserName != null) {
          await BilingualNotificationService.showMissedCallNotification(
            callerName: _callState.remoteUserName!,
            callId: _callState.callId ?? '',
          );

          _addCallNotificationToBell(
            callerName: _callState.remoteUserName!,
            callId: _callState.callId ?? '',
            type: 'missed_call',
          );
        }

        endCall();
      }
    });
  }

  /// Add call notification to in-app notification bell
  Future<void> _addCallNotificationToBell({
    required String callerName,
    required String callId,
    required String type,
  }) async {
    try {
      final supabase = Supabase.instance.client;
      final currentUser = supabase.auth.currentUser;
      if (currentUser == null) return;

      final title = type == 'incoming_call' ? 'Incoming Call' : 'Missed Call';
      final body = type == 'incoming_call'
          ? '$callerName is calling you'
          : 'You missed a call from $callerName';

      await supabase.from('notifications').insert({
        'user_id': currentUser.id,
        'title': title,
        'body': body,
        'type': type,
        'link': 'call:$callId',
        'is_read': false,
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[WebRTC] Added $type notification to bell');
    } catch (e) {
      debugPrint('[WebRTC] Error adding notification to bell: $e');
    }
  }

  /// Cancel call timeout timer
  void _cancelCallTimeoutTimer() {
    _callTimeoutTimer?.cancel();
    _callTimeoutTimer = null;
  }

  // ==================== ENHANCED CALL FEATURES ====================

  Timer? _statsTimer;
  Timer? _reconnectTimer;
  bool _wasConnectedBeforeDisconnect = false;

  /// Start collecting call statistics for quality monitoring
  void _startStatsCollection() {
    _statsTimer?.cancel();
    _statsTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      await _collectStats();
    });
  }

  /// Stop collecting call statistics
  void _stopStatsCollection() {
    _statsTimer?.cancel();
    _statsTimer = null;
  }

  /// Collect WebRTC stats and update call quality
  Future<void> _collectStats() async {
    if (_peerConnection == null || _callState.status != CallStatus.connected) {
      return;
    }

    try {
      final stats = await _peerConnection!.getStats();
      double totalPacketLoss = 0;
      int packetLossCount = 0;
      int latency = 0;
      int bitrate = 0;
      int jitter = 0;

      for (final report in stats) {
        final values = report.values;

        if (report.type == 'inbound-rtp') {
          final packetsLost = values['packetsLost'] as int? ?? 0;
          final packetsReceived = values['packetsReceived'] as int? ?? 1;
          if (packetsReceived > 0) {
            totalPacketLoss +=
                (packetsLost / (packetsLost + packetsReceived)) * 100;
            packetLossCount++;
          }
          bitrate = values['bytesReceived'] as int? ?? 0;
          // Jitter is reported in seconds, convert to ms
          final jitterSeconds = values['jitter'] as double? ?? 0;
          jitter = (jitterSeconds * 1000).round();
        }

        if (report.type == 'candidate-pair' && values['state'] == 'succeeded') {
          latency =
              (values['currentRoundTripTime'] as double? ?? 0) * 1000 ~/ 1;
        }
      }

      final double avgPacketLoss = packetLossCount > 0
          ? totalPacketLoss / packetLossCount
          : 0.0;
      final quality = _calculateQuality(avgPacketLoss, latency);

      _callState = _callState.copyWith(
        callQuality: quality,
        packetLoss: avgPacketLoss,
        latencyMs: latency,
        bitrate: bitrate,
        jitterMs: jitter,
      );
      _callStateController.add(_callState);
    } catch (e) {
      debugPrint('[WebRTC] Error collecting stats: $e');
    }
  }

  /// Calculate call quality based on metrics
  CallQuality _calculateQuality(double packetLoss, int latencyMs) {
    if (packetLoss > 10 || latencyMs > 500) return CallQuality.veryPoor;
    if (packetLoss > 5 || latencyMs > 300) return CallQuality.poor;
    if (packetLoss > 2 || latencyMs > 150) return CallQuality.fair;
    if (packetLoss > 0.5 || latencyMs > 50) return CallQuality.good;
    return CallQuality.excellent;
  }

  /// Put the current call on hold
  Future<void> holdCall() async {
    if (_callState.status != CallStatus.connected) return;

    debugPrint('[WebRTC] Putting call on hold');

    // Mute audio and video
    _localStream?.getAudioTracks().forEach((track) => track.enabled = false);
    _localStream?.getVideoTracks().forEach((track) => track.enabled = false);

    // Notify remote user
    if (_callState.remoteUserId != null) {
      await _sendSignalWithRetry(
        CallSignal(
          type: CallSignalType.callEnd, // Using callEnd as hold signal
          from: _userId!,
          to: _callState.remoteUserId!,
          fromName: _userName ?? '',
          callId: _callState.callId,
          payload: {'action': 'hold'},
        ),
      );
    }

    _callState = _callState.copyWith(status: CallStatus.onHold, isOnHold: true);
    _callStateController.add(_callState);
  }

  /// Resume a call that was on hold
  Future<void> resumeCall() async {
    if (_callState.status != CallStatus.onHold) return;

    debugPrint('[WebRTC] Resuming call from hold');

    // Unmute audio and video
    _localStream?.getAudioTracks().forEach((track) => track.enabled = true);
    if (!_callState.isAudioOnly) {
      _localStream?.getVideoTracks().forEach((track) => track.enabled = true);
    }

    // Notify remote user
    if (_callState.remoteUserId != null) {
      await _sendSignalWithRetry(
        CallSignal(
          type: CallSignalType.callEnd, // Using callEnd as resume signal
          from: _userId!,
          to: _callState.remoteUserId!,
          fromName: _userName ?? '',
          callId: _callState.callId,
          payload: {'action': 'resume'},
        ),
      );
    }

    _callState = _callState.copyWith(
      status: CallStatus.connected,
      isOnHold: false,
    );
    _callStateController.add(_callState);
  }

  /// Toggle hold state
  Future<void> toggleHold() async {
    if (_callState.isOnHold) {
      await resumeCall();
    } else {
      await holdCall();
    }
  }

  /// Start call recording (placeholder - requires native implementation)
  Future<bool> startRecording() async {
    if (_callState.status != CallStatus.connected) return false;

    debugPrint('[WebRTC] Starting call recording');

    // Note: Actual recording requires native platform implementation
    // This is a placeholder that updates state
    _callState = _callState.copyWith(isRecording: true);
    _callStateController.add(_callState);

    _errorController.add('Recording started');
    return true;
  }

  /// Stop call recording
  Future<String?> stopRecording() async {
    if (!_callState.isRecording) return null;

    debugPrint('[WebRTC] Stopping call recording');

    _callState = _callState.copyWith(isRecording: false);
    _callStateController.add(_callState);

    _errorController.add('Recording stopped');
    // Return path to recording file (would be set by native implementation)
    return null;
  }

  /// Toggle recording
  Future<void> toggleRecording() async {
    if (_callState.isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  /// Toggle noise suppression
  void toggleNoiseSuppression() {
    final newValue = !_callState.isNoiseSuppressed;
    debugPrint('[WebRTC] Toggling noise suppression: $newValue');

    // Note: Noise suppression is typically set at stream creation time
    // This updates state for UI feedback
    _callState = _callState.copyWith(isNoiseSuppressed: newValue);
    _callStateController.add(_callState);
  }

  /// Set audio output device
  Future<void> setAudioDevice(AudioOutputDevice device) async {
    debugPrint('[WebRTC] Setting audio device: $device');

    switch (device) {
      case AudioOutputDevice.speaker:
        await Helper.setSpeakerphoneOn(true);
        _callState = _callState.copyWith(
          isSpeakerOn: true,
          audioDevice: device,
        );
        break;
      case AudioOutputDevice.earpiece:
        await Helper.setSpeakerphoneOn(false);
        _callState = _callState.copyWith(
          isSpeakerOn: false,
          audioDevice: device,
        );
        break;
      case AudioOutputDevice.bluetooth:
      case AudioOutputDevice.wiredHeadset:
        // These would require native bluetooth/wired headset APIs
        _callState = _callState.copyWith(audioDevice: device);
        break;
    }

    _callStateController.add(_callState);
  }

  /// Update call notes
  void updateCallNotes(String notes) {
    _callState = _callState.copyWith(callNotes: notes);
    _callStateController.add(_callState);
  }

  /// Get current call notes
  String? getCallNotes() => _callState.callNotes;

  /// Handle auto-reconnect when connection is lost
  void _startAutoReconnect() {
    if (_reconnectTimer != null) return;

    _wasConnectedBeforeDisconnect = _callState.status == CallStatus.connected;
    if (!_wasConnectedBeforeDisconnect) return;

    debugPrint('[WebRTC] Starting auto-reconnect');

    _callState = _callState.copyWith(
      status: CallStatus.reconnecting,
      reconnectAttempts: 0,
    );
    _callStateController.add(_callState);

    _reconnectTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      final attempts = _callState.reconnectAttempts + 1;

      if (attempts > 5) {
        debugPrint('[WebRTC] Max reconnect attempts reached');
        timer.cancel();
        _reconnectTimer = null;
        _errorController.add('Connection lost. Call ended.');
        await endCall();
        return;
      }

      debugPrint('[WebRTC] Reconnect attempt $attempts/5');

      _callState = _callState.copyWith(reconnectAttempts: attempts);
      _callStateController.add(_callState);

      try {
        if (_peerConnection != null) {
          await _peerConnection!.restartIce();
        }
      } catch (e) {
        debugPrint('[WebRTC] Reconnect attempt failed: $e');
      }
    });
  }

  /// Stop auto-reconnect timer
  void _stopAutoReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    if (_callState.status == CallStatus.reconnecting) {
      _callState = _callState.copyWith(
        status: CallStatus.connected,
        reconnectAttempts: 0,
      );
      _callStateController.add(_callState);
    }
  }

  /// Reset call state without full cleanup (for fixing stuck states)
  void resetCallState() {
    debugPrint('[WebRTC] Resetting call state to idle');
    _callState = CallState();
    _callStateController.add(_callState);
  }

  /// Force reset if stuck in a call state
  Future<void> forceResetIfNotInActiveCall() async {
    // If not in any call state, nothing to reset
    if (_callState.status == CallStatus.idle) {
      return;
    }

    // Check for stale calling/ringing states (stuck for more than 60 seconds)
    final isPreConnectionState =
        _callState.status == CallStatus.calling ||
        _callState.status == CallStatus.ringing;

    if (isPreConnectionState) {
      // Check if we've been in this state for too long (60 seconds max)
      final startTime = _callState.startTime;
      if (startTime != null) {
        final elapsed = DateTime.now().difference(startTime);
        if (elapsed.inSeconds > 60) {
          debugPrint(
            '[WebRTC] Detected stale calling/ringing state (${elapsed.inSeconds}s), forcing reset',
          );
          await _cleanup();
          return;
        }
      } else {
        // No start time recorded - this is a stuck state, reset it
        debugPrint(
          '[WebRTC] Detected calling/ringing state with no start time, forcing reset',
        );
        await _cleanup();
        return;
      }
    }

    // If we think we're in a call but have no active peer connection,
    // then we're in a stuck state and should reset (except during calling/ringing phases)
    if (_callState.isInCall &&
        _peerConnection == null &&
        !isPreConnectionState) {
      debugPrint(
        '[WebRTC] Detected stuck call state (no peer connection), forcing reset',
      );
      await _cleanup();
      return;
    }

    // Also reset if we're in a "ended/rejected/busy/failed/unreachable" state that wasn't cleaned up
    if (_callState.status == CallStatus.ended ||
        _callState.status == CallStatus.rejected ||
        _callState.status == CallStatus.busy ||
        _callState.status == CallStatus.failed ||
        _callState.status == CallStatus.unreachable) {
      debugPrint('[WebRTC] Detected stale terminal call state, forcing reset');
      await _cleanup();
      return;
    }

    // Reset if local/remote streams are null but we think we're in a call
    // Again, skip for calling/ringing phase where streams are being set up
    if (_callState.isInCall &&
        _localStream == null &&
        _remoteStream == null &&
        !isPreConnectionState) {
      debugPrint(
        '[WebRTC] Detected stuck call state (no streams), forcing reset',
      );
      await _cleanup();
    }
  }

  /// Force reset call state regardless of current state
  /// Use this when the user explicitly wants to clear a stuck state
  Future<void> forceReset() async {
    debugPrint('[WebRTC] Force resetting call state');
    await _cleanup();
  }

  /// Cleanup resources
  Future<void> _cleanup() async {
    debugPrint('[WebRTC] Cleaning up resources');

    _cancelCallTimeoutTimer();
    _stopStatsCollection();
    _stopAutoReconnect();
    _retryTimer?.cancel();
    _retryTimer = null;
    _retryCount = 0;

    await _peerConnection?.close();
    _peerConnection = null;

    await _localStream?.dispose();
    _localStream = null;
    _localStreamController.add(null);

    _remoteStream = null;
    _remoteStreamController.add(null);

    await _updatePresence(inCall: false);

    // Cleanup outbound channels - create copy to avoid concurrent modification
    final channelsToCleanup = Map<String, RealtimeChannel>.from(
      _outboundChannels,
    );
    _outboundChannels.clear(); // Clear first to prevent further modifications

    for (final channel in channelsToCleanup.values) {
      try {
        await channel.unsubscribe();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    _callState = CallState();
    _callStateController.add(_callState);
  }

  /// Dispose the service
  Future<void> dispose() async {
    await _cleanup();
    await _signalingChannel?.unsubscribe();
    await _presenceChannel?.unsubscribe();
    await _callStateController.close();
    await _remoteStreamController.close();
    await _localStreamController.close();
    await _errorController.close();
  }
}
