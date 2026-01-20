// lib/services/webrtc_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import 'package:audioplayers/audioplayers.dart';
import '../models/call_signal.dart';
import '../models/call_state.dart';

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

  // ICE servers configuration with TURN for better connectivity
  final Map<String, dynamic> _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      {'urls': 'stun:stun3.l.google.com:19302'},
    ],
  };

  bool get isInitialized => _userId != null && _signalingChannel != null;

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

    await _setupSignalingChannel();
    await _setupPresenceChannel();
    
    debugPrint('[WebRTC] Initialized for user: $userName ($userId)');
  }

  /// Setup signaling channel for receiving call signals
  Future<void> _setupSignalingChannel() async {
    if (_userId == null) return;

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
          if (error != null) {
            debugPrint('[WebRTC] Signaling channel error: $error');
          }
        });
  }

  /// Setup presence channel for call status tracking
  Future<void> _setupPresenceChannel() async {
    await _presenceChannel?.unsubscribe();
    _presenceChannel = _supabase.channel('user-call-presence');

    _presenceChannel!.subscribe((status, [error]) {
      if (status == RealtimeSubscribeStatus.subscribed) {
        _updatePresence(inCall: false);
        debugPrint('[WebRTC] Presence channel subscribed');
      }
      if (error != null) {
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
      final presence = _presenceChannel?.presenceState();
      if (presence == null || presence.isEmpty) return false;

      for (final presenceState in presence) {
        final state = presenceState as Map<String, dynamic>;
        if (state['user_id'] == userId) {
          return true;
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
      final presence = _presenceChannel?.presenceState();
      if (presence == null || presence.isEmpty) return false;

      for (final presenceState in presence) {
        final state = presenceState as Map<String, dynamic>;
        if (state['user_id'] == userId && state['in_call'] == true) {
          return true;
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

      // Update call state
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

      // Update presence
      await _updatePresence(inCall: true, callId: callId, callToken: callToken);

      // Setup local media - this may fail if permissions are denied
      try {
        await _setupLocalMedia(isAudioOnly: isAudioOnly);
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

      // Send accept signal
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

      // Create peer connection and send offer
      await _createPeerConnection();
      await _createOffer();
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

  /// Setup local media stream
  Future<void> _setupLocalMedia({bool isAudioOnly = false}) async {
    try {
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
        debugPrint('[WebRTC] Permission denied - cleaning up call state and presence');
        await _updatePresence(inCall: false);
        await _cleanup();
        _updateCallState(CallStatus.idle);
        _errorController.add('Microphone/camera permission denied. Please enable in Settings.');
        throw Exception('Microphone/camera permission denied. Please enable in Settings.');
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
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        _handleConnectionFailure();
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateClosed ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        if (_callState.status == CallStatus.connected) {
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
        _errorController.add('Failed to access microphone. Please check permissions.');
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
  Future<bool> _sendSignalWithRetry(CallSignal signal, {int maxRetries = 3}) async {
    for (int attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await _sendSignal(signal);
        return true;
      } catch (e) {
        debugPrint('[WebRTC] Signal send attempt ${attempt + 1} failed: $e');
        if (attempt < maxRetries - 1) {
          await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
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
          if (!completer.isCompleted) {
            completer.completeError(error ?? 'Channel closed');
          }
        }
      });
      
      // Wait for subscription with timeout
      await completer.future.timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw Exception('Channel subscription timeout'),
      );
    }

    await channel.sendBroadcastMessage(
      event: 'call-signal',
      payload: signal.toJson(),
    );
    
    debugPrint('[WebRTC] Signal sent: ${signal.type} to ${signal.to}');
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
    _callTimeoutTimer = Timer(_callTimeoutDuration, () {
      if (_callState.status == CallStatus.calling ||
          _callState.status == CallStatus.ringing) {
        debugPrint('[WebRTC] Call timeout - no answer');
        _errorController.add('User is busy or unavailable');
        endCall();
      }
    });
  }

  /// Cancel call timeout timer
  void _cancelCallTimeoutTimer() {
    _callTimeoutTimer?.cancel();
    _callTimeoutTimer = null;
  }

  /// Reset call state without full cleanup (for fixing stuck states)
  void resetCallState() {
    debugPrint('[WebRTC] Resetting call state to idle');
    _callState = CallState();
    _callStateController.add(_callState);
  }
  
  /// Force reset if stuck in a call state
  Future<void> forceResetIfNotInActiveCall() async {
    // If we think we're in a call but have no active peer connection,
    // then we're in a stuck state and should reset
    if (_callState.isInCall && _peerConnection == null) {
      debugPrint('[WebRTC] Detected stuck call state (no peer connection), forcing reset');
      await _cleanup();
      return;
    }
    
    // Also reset if we're in a "ended/rejected/busy" state that wasn't cleaned up
    if (_callState.status == CallStatus.ended ||
        _callState.status == CallStatus.rejected ||
        _callState.status == CallStatus.busy) {
      debugPrint('[WebRTC] Detected stale terminal call state, forcing reset');
      await _cleanup();
      return;
    }
    
    // Reset if local/remote streams are null but we think we're in a call
    if (_callState.isInCall && _localStream == null && _remoteStream == null) {
      debugPrint('[WebRTC] Detected stuck call state (no streams), forcing reset');
      await _cleanup();
    }
  }

  /// Cleanup resources
  Future<void> _cleanup() async {
    debugPrint('[WebRTC] Cleaning up resources');
    
    _cancelCallTimeoutTimer();
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

    // Cleanup outbound channels
    for (final channel in _outboundChannels.values) {
      try {
        await channel.unsubscribe();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    _outboundChannels.clear();

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
