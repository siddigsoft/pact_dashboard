import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:permission_handler/permission_handler.dart';

enum VideoCallStatus {
  idle,
  initiating,
  ringing,
  connecting,
  connected,
  ended,
  failed,
}

class VideoCallState {
  final VideoCallStatus status;
  final String? callId;
  final String? remoteUserId;
  final String? remoteUserName;
  final bool isVideoEnabled;
  final bool isAudioEnabled;
  final bool isFrontCamera;
  final bool isRemoteVideoEnabled;
  final String? errorMessage;

  VideoCallState({
    this.status = VideoCallStatus.idle,
    this.callId,
    this.remoteUserId,
    this.remoteUserName,
    this.isVideoEnabled = true,
    this.isAudioEnabled = true,
    this.isFrontCamera = true,
    this.isRemoteVideoEnabled = false,
    this.errorMessage,
  });

  VideoCallState copyWith({
    VideoCallStatus? status,
    String? callId,
    String? remoteUserId,
    String? remoteUserName,
    bool? isVideoEnabled,
    bool? isAudioEnabled,
    bool? isFrontCamera,
    bool? isRemoteVideoEnabled,
    String? errorMessage,
  }) {
    return VideoCallState(
      status: status ?? this.status,
      callId: callId ?? this.callId,
      remoteUserId: remoteUserId ?? this.remoteUserId,
      remoteUserName: remoteUserName ?? this.remoteUserName,
      isVideoEnabled: isVideoEnabled ?? this.isVideoEnabled,
      isAudioEnabled: isAudioEnabled ?? this.isAudioEnabled,
      isFrontCamera: isFrontCamera ?? this.isFrontCamera,
      isRemoteVideoEnabled: isRemoteVideoEnabled ?? this.isRemoteVideoEnabled,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}

class VideoCallService {
  final SupabaseClient _supabase = Supabase.instance.client;

  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  MediaStream? _remoteStream;
  RTCVideoRenderer? _localRenderer;
  RTCVideoRenderer? _remoteRenderer;
  RealtimeChannel? _signalChannel;

  VideoCallState _state = VideoCallState();
  final StreamController<VideoCallState> _stateController =
      StreamController<VideoCallState>.broadcast();

  String? _userId;
  String? _userName;
  final List<RTCIceCandidate> _pendingCandidates = [];

  Stream<VideoCallState> get stateStream => _stateController.stream;
  VideoCallState get state => _state;
  RTCVideoRenderer? get localRenderer => _localRenderer;
  RTCVideoRenderer? get remoteRenderer => _remoteRenderer;

  final Map<String, dynamic> _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {
        'urls': 'turn:openrelay.metered.ca:80',
        'username': 'openrelayproject',
        'credential': 'openrelayproject',
      },
    ],
  };

  Future<void> initialize(String userId, String userName) async {
    _userId = userId;
    _userName = userName;

    _localRenderer = RTCVideoRenderer();
    _remoteRenderer = RTCVideoRenderer();
    await _localRenderer!.initialize();
    await _remoteRenderer!.initialize();
  }

  Future<bool> requestPermissions() async {
    final camera = await Permission.camera.request();
    final microphone = await Permission.microphone.request();
    return camera.isGranted && microphone.isGranted;
  }

  Future<bool> startVideoCall(
    String targetUserId,
    String targetUserName,
  ) async {
    try {
      if (!await requestPermissions()) {
        _updateState(
          _state.copyWith(
            status: VideoCallStatus.failed,
            errorMessage: 'Camera/microphone permission denied',
          ),
        );
        return false;
      }

      _updateState(
        _state.copyWith(
          status: VideoCallStatus.initiating,
          remoteUserId: targetUserId,
          remoteUserName: targetUserName,
        ),
      );

      await _setupLocalStream();
      await _createPeerConnection();
      await _subscribeToSignaling(targetUserId);

      // Create and send offer
      final offer = await _peerConnection!.createOffer();
      await _peerConnection!.setLocalDescription(offer);

      await _sendSignal(targetUserId, {
        'type': 'video_offer',
        'sdp': offer.sdp,
        'sdpType': offer.type,
        'callerId': _userId,
        'callerName': _userName,
      });

      _updateState(_state.copyWith(status: VideoCallStatus.ringing));
      return true;
    } catch (e) {
      debugPrint('[VideoCall] Error starting call: $e');
      _updateState(
        _state.copyWith(
          status: VideoCallStatus.failed,
          errorMessage: e.toString(),
        ),
      );
      return false;
    }
  }

  Future<bool> answerVideoCall(Map<String, dynamic> offerData) async {
    try {
      if (!await requestPermissions()) {
        _updateState(
          _state.copyWith(
            status: VideoCallStatus.failed,
            errorMessage: 'Camera/microphone permission denied',
          ),
        );
        return false;
      }

      final callerId = offerData['callerId'] as String;
      final callerName = offerData['callerName'] as String?;

      _updateState(
        _state.copyWith(
          status: VideoCallStatus.connecting,
          remoteUserId: callerId,
          remoteUserName: callerName,
        ),
      );

      await _setupLocalStream();
      await _createPeerConnection();
      await _subscribeToSignaling(callerId);

      // Set remote description
      final sdp = RTCSessionDescription(
        offerData['sdp'] as String,
        offerData['sdpType'] as String,
      );
      await _peerConnection!.setRemoteDescription(sdp);

      // Add pending candidates
      for (final candidate in _pendingCandidates) {
        await _peerConnection!.addCandidate(candidate);
      }
      _pendingCandidates.clear();

      // Create and send answer
      final answer = await _peerConnection!.createAnswer();
      await _peerConnection!.setLocalDescription(answer);

      await _sendSignal(callerId, {
        'type': 'video_answer',
        'sdp': answer.sdp,
        'sdpType': answer.type,
      });

      return true;
    } catch (e) {
      debugPrint('[VideoCall] Error answering call: $e');
      _updateState(
        _state.copyWith(
          status: VideoCallStatus.failed,
          errorMessage: e.toString(),
        ),
      );
      return false;
    }
  }

  Future<void> _setupLocalStream() async {
    final constraints = {
      'audio': true,
      'video': {
        'facingMode': _state.isFrontCamera ? 'user' : 'environment',
        'width': {'ideal': 1280},
        'height': {'ideal': 720},
      },
    };

    _localStream = await navigator.mediaDevices.getUserMedia(constraints);
    _localRenderer!.srcObject = _localStream;
  }

  Future<void> _createPeerConnection() async {
    _peerConnection = await createPeerConnection(_iceServers);

    // Add local tracks
    _localStream!.getTracks().forEach((track) {
      _peerConnection!.addTrack(track, _localStream!);
    });

    // Handle remote stream
    _peerConnection!.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        _remoteStream = event.streams[0];
        _remoteRenderer!.srcObject = _remoteStream;
        _updateState(_state.copyWith(isRemoteVideoEnabled: true));
      }
    };

    // Handle ICE candidates
    _peerConnection!.onIceCandidate = (candidate) {
      if (candidate.candidate != null && _state.remoteUserId != null) {
        _sendSignal(_state.remoteUserId!, {
          'type': 'ice_candidate',
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        });
      }
    };

    // Handle connection state
    _peerConnection!.onConnectionState = (state) {
      debugPrint('[VideoCall] Connection state: $state');
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _updateState(_state.copyWith(status: VideoCallStatus.connected));
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        _updateState(_state.copyWith(status: VideoCallStatus.failed));
      }
    };
  }

  Future<void> _subscribeToSignaling(String remoteUserId) async {
    _signalChannel?.unsubscribe();

    _signalChannel = _supabase
        .channel('video_call:$_userId')
        .onBroadcast(
          event: 'video_signal',
          callback: (payload) => _handleSignal(payload),
        )
        .subscribe();
  }

  Future<void> _handleSignal(Map<String, dynamic> payload) async {
    final type = payload['type'] as String?;

    switch (type) {
      case 'video_answer':
        final sdp = RTCSessionDescription(
          payload['sdp'] as String,
          payload['sdpType'] as String,
        );
        await _peerConnection?.setRemoteDescription(sdp);

        for (final candidate in _pendingCandidates) {
          await _peerConnection?.addCandidate(candidate);
        }
        _pendingCandidates.clear();
        break;

      case 'ice_candidate':
        final candidate = RTCIceCandidate(
          payload['candidate'] as String,
          payload['sdpMid'] as String?,
          payload['sdpMLineIndex'] as int?,
        );

        if (_peerConnection?.getRemoteDescription() != null) {
          await _peerConnection?.addCandidate(candidate);
        } else {
          _pendingCandidates.add(candidate);
        }
        break;

      case 'video_end':
        await endCall();
        break;

      case 'video_toggle':
        _updateState(
          _state.copyWith(
            isRemoteVideoEnabled: payload['videoEnabled'] as bool? ?? true,
          ),
        );
        break;
    }
  }

  Future<void> _sendSignal(
    String targetUserId,
    Map<String, dynamic> data,
  ) async {
    try {
      await _supabase
          .channel('video_call:$targetUserId')
          .sendBroadcastMessage(event: 'video_signal', payload: data);
    } catch (e) {
      debugPrint('[VideoCall] Error sending signal: $e');
    }
  }

  void toggleVideo() {
    if (_localStream != null) {
      final videoTracks = _localStream!.getVideoTracks();
      for (final track in videoTracks) {
        track.enabled = !track.enabled;
      }
      _updateState(_state.copyWith(isVideoEnabled: videoTracks.first.enabled));

      if (_state.remoteUserId != null) {
        _sendSignal(_state.remoteUserId!, {
          'type': 'video_toggle',
          'videoEnabled': _state.isVideoEnabled,
        });
      }
    }
  }

  void toggleAudio() {
    if (_localStream != null) {
      final audioTracks = _localStream!.getAudioTracks();
      for (final track in audioTracks) {
        track.enabled = !track.enabled;
      }
      _updateState(_state.copyWith(isAudioEnabled: audioTracks.first.enabled));
    }
  }

  Future<void> switchCamera() async {
    if (_localStream != null) {
      final videoTracks = _localStream!.getVideoTracks();
      if (videoTracks.isNotEmpty) {
        await Helper.switchCamera(videoTracks.first);
        _updateState(_state.copyWith(isFrontCamera: !_state.isFrontCamera));
      }
    }
  }

  Future<void> endCall() async {
    if (_state.remoteUserId != null) {
      await _sendSignal(_state.remoteUserId!, {'type': 'video_end'});
    }

    await _cleanup();
    _updateState(VideoCallState(status: VideoCallStatus.ended));
  }

  Future<void> _cleanup() async {
    _signalChannel?.unsubscribe();

    _localStream?.getTracks().forEach((track) => track.stop());
    _remoteStream?.getTracks().forEach((track) => track.stop());

    await _peerConnection?.close();

    _localRenderer?.srcObject = null;
    _remoteRenderer?.srcObject = null;

    _localStream = null;
    _remoteStream = null;
    _peerConnection = null;
    _pendingCandidates.clear();
  }

  void _updateState(VideoCallState newState) {
    _state = newState;
    _stateController.add(_state);
  }

  Future<void> dispose() async {
    await _cleanup();
    await _localRenderer?.dispose();
    await _remoteRenderer?.dispose();
    _stateController.close();
  }
}
