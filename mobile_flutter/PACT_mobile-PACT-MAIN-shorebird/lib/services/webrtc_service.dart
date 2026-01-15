// lib/services/webrtc_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import 'package:audioplayers/audioplayers.dart';
import '../models/call_signal.dart';
import '../models/call_state.dart';

/// WebRTC service for handling audio/video calls
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

  // Signaling channel
  RealtimeChannel? _signalingChannel;
  RealtimeChannel? _presenceChannel;

  // Audio player for call sounds
  final AudioPlayer _audioPlayer = AudioPlayer();

  // Call timeout timer (for unanswered calls)
  Timer? _callTimeoutTimer;
  static const Duration _callTimeoutDuration = Duration(seconds: 30);

  // Stream controllers for state updates
  final _callStateController = StreamController<CallState>.broadcast();
  Stream<CallState> get callStateStream => _callStateController.stream;

  final _remoteStreamController = StreamController<MediaStream?>.broadcast();
  Stream<MediaStream?> get remoteStreamStream => _remoteStreamController.stream;

  final _localStreamController = StreamController<MediaStream?>.broadcast();
  Stream<MediaStream?> get localStreamStream => _localStreamController.stream;

  // ICE servers configuration
  final Map<String, dynamic> _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
    ],
  };

  /// Initialize the service with user information
  Future<void> initialize(
    String userId,
    String userName, {
    String? userAvatar,
  }) async {
    _userId = userId;
    _userName = userName;
    _userAvatar = userAvatar;

    await _setupSignalingChannel();
    await _setupPresenceChannel();
  }

  /// Setup signaling channel for receiving call signals
  Future<void> _setupSignalingChannel() async {
    if (_userId == null) return;

    _signalingChannel?.unsubscribe();
    _signalingChannel = _supabase.channel('calls:user:$_userId');

    _signalingChannel!
        .onBroadcast(
          event: 'call-signal',
          callback: (payload) {
            _handleSignal(CallSignal.fromJson(payload));
          },
        )
        .subscribe();
  }

  /// Setup presence channel for call status tracking
  Future<void> _setupPresenceChannel() async {
    _presenceChannel?.unsubscribe();
    _presenceChannel = _supabase.channel('user-call-presence');

    _presenceChannel!.subscribe((status, [error]) {
      if (status == RealtimeSubscribeStatus.subscribed) {
        _updatePresence(inCall: false);
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

    await _presenceChannel!.track({
      'user_id': _userId,
      'in_call': inCall,
      'call_id': callId,
      'call_token': callToken,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  /// Check if user is busy (in another call)
  Future<bool> _checkUserBusy(String userId) async {
    try {
      final presence = _presenceChannel?.presenceState();
      if (presence == null || presence.isEmpty) return false;

      // presenceState returns List<SinglePresenceState>
      // Each SinglePresenceState is a Map with presence data
      for (final presenceState in presence) {
        // Access presence data - SinglePresenceState is Map<String, dynamic>
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
    if (_userId == null || _callState.isInCall) return false;

    // Check if target user is busy
    if (await _checkUserBusy(targetUserId)) {
      _updateCallState(CallStatus.busy);
      return false;
    }

    try {
      // Generate call ID and token
      final callId = const Uuid().v4();
      final callToken = const Uuid().v4();

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

      // Setup local media
      await _setupLocalMedia(isAudioOnly: isAudioOnly);

      // Send call request signal
      await _sendSignal(
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

      // Start call timeout timer - end call if not answered within timeout
      _startCallTimeoutTimer();

      return true;
    } catch (e) {
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
      await _sendSignal(
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
      _updateCallState(CallStatus.idle);
    }
  }

  /// Reject an incoming call
  Future<void> rejectCall(String callerId, String callId) async {
    if (_userId == null) return;

    await _sendSignal(
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
  }

  /// End the current call
  Future<void> endCall() async {
    if (_userId == null || !_callState.isInCall) return;

    final remoteUserId = _callState.remoteUserId;
    final callId = _callState.callId;

    if (remoteUserId != null) {
      await _sendSignal(
        CallSignal(
          type: CallSignalType.callEnd,
          from: _userId!,
          to: remoteUserId,
          fromName: _userName!,
          fromAvatar: _userAvatar,
          callId: callId,
        ),
      );
    }

    await _cleanup();
    _updateCallState(CallStatus.ended);
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
    } catch (e) {
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

    // Add local stream tracks
    if (_localStream != null) {
      _localStream!.getTracks().forEach((track) {
        _peerConnection!.addTrack(track, _localStream!);
      });
    }

    // Handle ICE candidates
    _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
      _sendSignal(
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
      if (event.streams.isNotEmpty) {
        _remoteStream = event.streams[0];
        _remoteStreamController.add(_remoteStream);
      }
    };

    // Handle connection state changes
    _peerConnection!.onConnectionState = (RTCPeerConnectionState state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _updateCallState(CallStatus.connected);
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
        endCall();
      }
    };
  }

  /// Create and send offer
  Future<void> _createOffer() async {
    if (_peerConnection == null) return;

    final offer = await _peerConnection!.createOffer();
    await _peerConnection!.setLocalDescription(offer);

    await _sendSignal(
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

  /// Handle incoming offer
  Future<void> _handleOffer(Map<String, dynamic> offer) async {
    await _createPeerConnection();

    await _peerConnection!.setRemoteDescription(
      RTCSessionDescription(offer['sdp'], offer['type']),
    );

    final answer = await _peerConnection!.createAnswer();
    await _peerConnection!.setLocalDescription(answer);

    await _sendSignal(
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

    await _peerConnection!.setRemoteDescription(
      RTCSessionDescription(answer['sdp'], answer['type']),
    );
  }

  /// Handle ICE candidate
  Future<void> _handleIceCandidate(Map<String, dynamic> candidate) async {
    if (_peerConnection == null) return;

    await _peerConnection!.addCandidate(
      RTCIceCandidate(
        candidate['candidate'],
        candidate['sdpMid'],
        candidate['sdpMLineIndex'],
      ),
    );
  }

  /// Handle incoming signal
  Future<void> _handleSignal(CallSignal signal) async {
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
        await _createPeerConnection();
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

  /// Play ringing sound
  Future<void> _playRingingSound() async {
    try {
      await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      await _audioPlayer.play(
        AssetSource('sounds/Phone Dial Tone - Sound Effect (HD).mp3'),
      );
    } catch (e) {
      debugPrint('Error playing ringing sound: $e');
    }
  }

  /// Stop ringing sound
  Future<void> _stopRingingSound() async {
    try {
      await _audioPlayer.stop();
    } catch (e) {
      debugPrint('Error stopping ringing sound: $e');
    }
  }

  /// Toggle video
  Future<bool> toggleVideo() async {
    if (_localStream == null) return false;

    final videoTrack = _localStream!.getVideoTracks().firstWhere(
      (track) => track.kind == 'video',
    );

    final enabled = !videoTrack.enabled;
    videoTrack.enabled = enabled;

    _callState = _callState.copyWith(isVideoEnabled: enabled);
    _callStateController.add(_callState);

    return enabled;
  }

  /// Send signal to target user
  Future<void> _sendSignal(CallSignal signal) async {
    final targetChannel = _supabase.channel('calls:user:${signal.to}');
    targetChannel.subscribe();
    await targetChannel.sendBroadcastMessage(
      event: 'call-signal',
      payload: signal.toJson(),
    );
    await targetChannel.unsubscribe();
  }

  /// Toggle mute
  bool toggleMute() {
    if (_localStream == null) return false;

    final audioTrack = _localStream!.getAudioTracks().firstWhere(
      (track) => track.kind == 'audio',
    );

    final muted = !audioTrack.enabled;
    audioTrack.enabled = !muted;

    _callState = _callState.copyWith(isMuted: muted);
    _callStateController.add(_callState);

    return muted;
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
            status == CallStatus.rejected) &&
        (previousStatus == CallStatus.calling ||
            previousStatus == CallStatus.ringing)) {
      _stopRingingSound();
    }
  }

  /// Start call timeout timer
  void _startCallTimeoutTimer() {
    _cancelCallTimeoutTimer();
    _callTimeoutTimer = Timer(_callTimeoutDuration, () {
      // If still calling/ringing after timeout, mark as unavailable and end call
      if (_callState.status == CallStatus.calling ||
          _callState.status == CallStatus.ringing) {
        endCall();
      }
    });
  }

  /// Cancel call timeout timer
  void _cancelCallTimeoutTimer() {
    _callTimeoutTimer?.cancel();
    _callTimeoutTimer = null;
  }

  /// Cleanup resources
  Future<void> _cleanup() async {
    _cancelCallTimeoutTimer();
    await _peerConnection?.close();
    _peerConnection = null;

    await _localStream?.dispose();
    _localStream = null;
    _localStreamController.add(null);

    _remoteStream = null;
    _remoteStreamController.add(null);

    await _updatePresence(inCall: false);

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
  }
}
