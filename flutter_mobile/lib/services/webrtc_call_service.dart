import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

enum CallSignalType {
  offer,
  answer,
  iceCandidate,
  callRequest,
  callAccepted,
  callRejected,
  callEnded,
  callBusy,
}

enum CallState {
  idle,
  outgoing,
  incoming,
  connecting,
  connected,
  ended,
}

class CallParticipant {
  final String id;
  final String name;
  final String? avatar;

  CallParticipant({required this.id, required this.name, this.avatar});
}

class CallSignal {
  final CallSignalType type;
  final String from;
  final String to;
  final String fromName;
  final String? fromAvatar;
  final String callId;
  final String callToken;
  final dynamic payload;
  final int timestamp;
  final bool? isAudioOnly;

  CallSignal({
    required this.type,
    required this.from,
    required this.to,
    required this.fromName,
    this.fromAvatar,
    required this.callId,
    required this.callToken,
    this.payload,
    required this.timestamp,
    this.isAudioOnly,
  });

  Map<String, dynamic> toJson() => {
    'type': _signalTypeToString(type),
    'from': from,
    'to': to,
    'fromName': fromName,
    'fromAvatar': fromAvatar,
    'callId': callId,
    'callToken': callToken,
    'payload': payload,
    'timestamp': timestamp,
    'isAudioOnly': isAudioOnly,
  };

  static CallSignal fromJson(Map<String, dynamic> json) {
    return CallSignal(
      type: _stringToSignalType(json['type']),
      from: json['from'] ?? '',
      to: json['to'] ?? '',
      fromName: json['fromName'] ?? 'Unknown',
      fromAvatar: json['fromAvatar'],
      callId: json['callId'] ?? '',
      callToken: json['callToken'] ?? '',
      payload: json['payload'],
      timestamp: json['timestamp'] ?? DateTime.now().millisecondsSinceEpoch,
      isAudioOnly: json['isAudioOnly'],
    );
  }

  static String _signalTypeToString(CallSignalType type) {
    switch (type) {
      case CallSignalType.offer: return 'offer';
      case CallSignalType.answer: return 'answer';
      case CallSignalType.iceCandidate: return 'ice-candidate';
      case CallSignalType.callRequest: return 'call-request';
      case CallSignalType.callAccepted: return 'call-accepted';
      case CallSignalType.callRejected: return 'call-rejected';
      case CallSignalType.callEnded: return 'call-ended';
      case CallSignalType.callBusy: return 'call-busy';
    }
  }

  static CallSignalType _stringToSignalType(String? type) {
    switch (type) {
      case 'offer': return CallSignalType.offer;
      case 'answer': return CallSignalType.answer;
      case 'ice-candidate':
      case 'iceCandidate': return CallSignalType.iceCandidate;
      case 'call-request':
      case 'callRequest': return CallSignalType.callRequest;
      case 'call-accepted':
      case 'callAccept':
      case 'callAccepted': return CallSignalType.callAccepted;
      case 'call-rejected':
      case 'callReject':
      case 'callRejected': return CallSignalType.callRejected;
      case 'call-ended':
      case 'callEnd':
      case 'callEnded': return CallSignalType.callEnded;
      case 'call-busy':
      case 'callBusy': return CallSignalType.callBusy;
      default: return CallSignalType.callEnded;
    }
  }
}

class WebRTCCallService {
  static final WebRTCCallService _instance = WebRTCCallService._internal();
  factory WebRTCCallService() => _instance;
  WebRTCCallService._internal();

  final _supabase = Supabase.instance.client;
  final _uuid = const Uuid();

  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  MediaStream? _remoteStream;
  RealtimeChannel? _signalingChannel;
  RealtimeChannel? _presenceChannel;

  String? _currentUserId;
  String? _currentUserName;
  String? _currentUserAvatar;
  String? _currentCallId;
  String? _currentCallToken;
  String? _targetUserId;
  bool _isInitiator = false;
  bool _isAudioOnly = true;

  final List<RTCIceCandidate> _pendingIceCandidates = [];
  final Map<String, RealtimeChannel> _callChannels = {};

  CallState _callState = CallState.idle;
  CallParticipant? _remoteParticipant;

  final _callStateController = StreamController<CallState>.broadcast();
  final _remoteParticipantController = StreamController<CallParticipant?>.broadcast();
  final _remoteStreamController = StreamController<MediaStream?>.broadcast();
  final _localStreamController = StreamController<MediaStream?>.broadcast();
  final _incomingCallController = StreamController<CallSignal>.broadcast();

  Stream<CallState> get callStateStream => _callStateController.stream;
  Stream<CallParticipant?> get remoteParticipantStream => _remoteParticipantController.stream;
  Stream<MediaStream?> get remoteStreamStream => _remoteStreamController.stream;
  Stream<MediaStream?> get localStreamStream => _localStreamController.stream;
  Stream<CallSignal> get incomingCallStream => _incomingCallController.stream;

  CallState get callState => _callState;
  CallParticipant? get remoteParticipant => _remoteParticipant;
  MediaStream? get localStream => _localStream;
  MediaStream? get remoteStream => _remoteStream;
  String? get currentCallId => _currentCallId;
  bool get isAudioOnly => _isAudioOnly;

  static const _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      {
        'urls': 'turn:a.relay.metered.ca:80',
        'username': 'e8dd65c92f6d9f4e4f3b1234',
        'credential': 'pact2024turn',
      },
      {
        'urls': 'turn:a.relay.metered.ca:443',
        'username': 'e8dd65c92f6d9f4e4f3b1234',
        'credential': 'pact2024turn',
      },
      {
        'urls': 'turn:a.relay.metered.ca:443?transport=tcp',
        'username': 'e8dd65c92f6d9f4e4f3b1234',
        'credential': 'pact2024turn',
      },
    ],
    'iceCandidatePoolSize': 10,
  };

  Future<void> initialize({
    required String userId,
    required String userName,
    String? userAvatar,
  }) async {
    _currentUserId = userId;
    _currentUserName = userName;
    _currentUserAvatar = userAvatar;

    await _setupSignalingChannel();
    await _setupPresenceChannel();
    
    debugPrint('[WebRTC] Service initialized for user: $userName');
  }

  Future<void> _setupSignalingChannel() async {
    if (_currentUserId == null) return;

    if (_signalingChannel != null) {
      await _supabase.removeChannel(_signalingChannel!);
    }

    final channelName = 'calls:user:$_currentUserId';
    debugPrint('[WebRTC] Setting up signaling channel: $channelName');

    _signalingChannel = _supabase.channel(channelName);
    
    _signalingChannel!.onBroadcast(
      event: 'call-signal',
      callback: (payload) async {
        debugPrint('[WebRTC] Received signal: $payload');
        final signal = CallSignal.fromJson(payload);
        
        if (signal.to != _currentUserId) return;
        
        await _handleSignal(signal);
      },
    );

    await _signalingChannel!.subscribe();
    debugPrint('[WebRTC] Signaling channel ready');
  }

  Future<void> _setupPresenceChannel() async {
    if (_currentUserId == null) return;

    _presenceChannel = _supabase.channel('user-call-presence');
    
    await _presenceChannel!.subscribe((status, error) async {
      if (status == RealtimeSubscribeStatus.subscribed) {
        await _presenceChannel!.track({
          'userId': _currentUserId,
          'online': true,
          'inCall': false,
          'callId': null,
        });
      }
    });
  }

  Future<void> _updatePresence({required bool inCall, String? callId}) async {
    if (_presenceChannel == null) return;
    
    await _presenceChannel!.track({
      'userId': _currentUserId,
      'online': true,
      'inCall': inCall,
      'callId': callId,
    });
  }

  Future<void> _handleSignal(CallSignal signal) async {
    debugPrint('[WebRTC] Handling signal: ${signal.type}');

    switch (signal.type) {
      case CallSignalType.callRequest:
        if (_currentCallId != null) {
          await _sendBusySignal(signal.from, signal.callId, signal.callToken);
          return;
        }
        _currentCallId = signal.callId;
        _currentCallToken = signal.callToken;
        _isAudioOnly = signal.isAudioOnly ?? true;
        _remoteParticipant = CallParticipant(
          id: signal.from,
          name: signal.fromName,
          avatar: signal.fromAvatar,
        );
        _updateCallState(CallState.incoming);
        _remoteParticipantController.add(_remoteParticipant);
        _incomingCallController.add(signal);
        break;

      case CallSignalType.callAccepted:
        _updateCallState(CallState.connecting);
        if (_isInitiator) {
          await _createOffer();
        }
        break;

      case CallSignalType.callRejected:
        _updateCallState(CallState.ended);
        await cleanup();
        break;

      case CallSignalType.callEnded:
        _updateCallState(CallState.ended);
        await cleanup();
        break;

      case CallSignalType.callBusy:
        _updateCallState(CallState.ended);
        await cleanup();
        break;

      case CallSignalType.offer:
        await _handleOffer(signal.payload, signal.from);
        break;

      case CallSignalType.answer:
        await _handleAnswer(signal.payload);
        break;

      case CallSignalType.iceCandidate:
        await _handleIceCandidate(signal.payload);
        break;
    }
  }

  Future<bool> initiateCall({
    required String targetUserId,
    required String targetUserName,
    String? targetUserAvatar,
    bool isAudioOnly = true,
  }) async {
    if (_currentUserId == null || _currentCallId != null) {
      return false;
    }

    _currentCallId = 'call_${DateTime.now().millisecondsSinceEpoch}_${_uuid.v4().substring(0, 16)}';
    _currentCallToken = _uuid.v4();
    _isInitiator = true;
    _isAudioOnly = isAudioOnly;
    _targetUserId = targetUserId;
    _remoteParticipant = CallParticipant(
      id: targetUserId,
      name: targetUserName,
      avatar: targetUserAvatar,
    );

    debugPrint('[WebRTC] Initiating call to: $targetUserName, callId: $_currentCallId');

    try {
      await _updatePresence(inCall: true, callId: _currentCallId);
      await _setupLocalStream(isAudioOnly: isAudioOnly);
      await _createPeerConnection();

      await _sendSignalToUser(
        targetUserId,
        CallSignalType.callRequest,
        isAudioOnly: isAudioOnly,
      );

      _updateCallState(CallState.outgoing);
      _remoteParticipantController.add(_remoteParticipant);
      
      return true;
    } catch (e) {
      debugPrint('[WebRTC] Failed to initiate call: $e');
      await cleanup();
      return false;
    }
  }

  Future<void> acceptCall() async {
    if (_currentCallId == null || _remoteParticipant == null) return;

    _isInitiator = false;
    _targetUserId = _remoteParticipant!.id;

    debugPrint('[WebRTC] Accepting call from: ${_remoteParticipant!.name}');

    try {
      await _sendSignal(CallSignalType.callAccepted, _targetUserId!);
      await _setupLocalStream(isAudioOnly: _isAudioOnly);
      await _createPeerConnection();
      await _updatePresence(inCall: true, callId: _currentCallId);

      _updateCallState(CallState.connecting);
    } catch (e) {
      debugPrint('[WebRTC] Failed to accept call: $e');
      await cleanup();
    }
  }

  Future<void> rejectCall() async {
    if (_currentCallId == null || _remoteParticipant == null) return;

    await _sendSignal(CallSignalType.callRejected, _remoteParticipant!.id);
    _updateCallState(CallState.ended);
    await cleanup();
  }

  Future<void> endCall() async {
    if (_targetUserId != null) {
      await _sendSignal(CallSignalType.callEnded, _targetUserId!);
    }
    _updateCallState(CallState.ended);
    await cleanup();
  }

  Future<void> toggleMute() async {
    if (_localStream != null) {
      final audioTracks = _localStream!.getAudioTracks();
      for (var track in audioTracks) {
        track.enabled = !track.enabled;
      }
    }
  }

  Future<void> toggleSpeaker() async {
    if (_localStream != null) {
      final audioTracks = _localStream!.getAudioTracks();
      for (var track in audioTracks) {
        await Helper.setSpeakerphoneOn(!await Helper.speakerphoneOn());
      }
    }
  }

  Future<void> toggleVideo() async {
    if (_localStream != null) {
      final videoTracks = _localStream!.getVideoTracks();
      for (var track in videoTracks) {
        track.enabled = !track.enabled;
      }
    }
  }

  bool get isMuted {
    if (_localStream == null) return false;
    final audioTracks = _localStream!.getAudioTracks();
    return audioTracks.isNotEmpty && !audioTracks.first.enabled;
  }

  bool get isVideoEnabled {
    if (_localStream == null) return false;
    final videoTracks = _localStream!.getVideoTracks();
    return videoTracks.isNotEmpty && videoTracks.first.enabled;
  }

  Future<void> _setupLocalStream({required bool isAudioOnly}) async {
    final mediaConstraints = {
      'audio': true,
      'video': !isAudioOnly ? {
        'facingMode': 'user',
        'width': {'ideal': 640},
        'height': {'ideal': 480},
      } : false,
    };

    _localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    _localStreamController.add(_localStream);
    debugPrint('[WebRTC] Local stream ready, audio only: $isAudioOnly');
  }

  Future<void> _createPeerConnection() async {
    _peerConnection = await createPeerConnection(_iceServers);

    _peerConnection!.onIceCandidate = (candidate) async {
      if (candidate.candidate != null && _targetUserId != null) {
        await _sendSignal(
          CallSignalType.iceCandidate,
          _targetUserId!,
          payload: candidate.toMap(),
        );
      }
    };

    _peerConnection!.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        _remoteStream = event.streams.first;
        _remoteStreamController.add(_remoteStream);
        debugPrint('[WebRTC] Remote stream received');
      }
    };

    _peerConnection!.onConnectionState = (state) {
      debugPrint('[WebRTC] Connection state: $state');
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _updateCallState(CallState.connected);
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
                 state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        _updateCallState(CallState.ended);
        cleanup();
      }
    };

    if (_localStream != null) {
      for (var track in _localStream!.getTracks()) {
        await _peerConnection!.addTrack(track, _localStream!);
      }
    }

    for (var candidate in _pendingIceCandidates) {
      await _peerConnection!.addCandidate(candidate);
    }
    _pendingIceCandidates.clear();

    debugPrint('[WebRTC] Peer connection created');
  }

  Future<void> _createOffer() async {
    if (_peerConnection == null || _targetUserId == null) return;

    final offer = await _peerConnection!.createOffer();
    await _peerConnection!.setLocalDescription(offer);

    await _sendSignal(
      CallSignalType.offer,
      _targetUserId!,
      payload: offer.toMap(),
    );
    debugPrint('[WebRTC] Offer sent');
  }

  Future<void> _handleOffer(dynamic offerData, String from) async {
    if (_peerConnection == null) return;

    final offer = RTCSessionDescription(
      offerData['sdp'],
      offerData['type'],
    );

    await _peerConnection!.setRemoteDescription(offer);

    final answer = await _peerConnection!.createAnswer();
    await _peerConnection!.setLocalDescription(answer);

    await _sendSignal(
      CallSignalType.answer,
      from,
      payload: answer.toMap(),
    );
    debugPrint('[WebRTC] Answer sent');
  }

  Future<void> _handleAnswer(dynamic answerData) async {
    if (_peerConnection == null) return;

    final answer = RTCSessionDescription(
      answerData['sdp'],
      answerData['type'],
    );

    await _peerConnection!.setRemoteDescription(answer);
    debugPrint('[WebRTC] Answer processed');
  }

  Future<void> _handleIceCandidate(dynamic candidateData) async {
    final candidate = RTCIceCandidate(
      candidateData['candidate'],
      candidateData['sdpMid'],
      candidateData['sdpMLineIndex'],
    );

    if (_peerConnection != null) {
      await _peerConnection!.addCandidate(candidate);
    } else {
      _pendingIceCandidates.add(candidate);
    }
  }

  Future<void> _sendBusySignal(String to, String callId, String callToken) async {
    await _sendSignalToUser(to, CallSignalType.callBusy, 
      overrideCallId: callId, overrideCallToken: callToken);
  }

  Future<void> _sendSignal(
    CallSignalType type,
    String to, {
    dynamic payload,
    bool? isAudioOnly,
  }) async {
    await _sendSignalToUser(to, type, payload: payload, isAudioOnly: isAudioOnly);
  }

  Future<void> _sendSignalToUser(
    String targetUserId,
    CallSignalType type, {
    dynamic payload,
    bool? isAudioOnly,
    String? overrideCallId,
    String? overrideCallToken,
  }) async {
    if (_currentUserId == null) return;

    final channelName = 'calls:user:$targetUserId';
    
    var channel = _callChannels[channelName];
    if (channel == null) {
      channel = _supabase.channel(channelName);
      await channel.subscribe();
      _callChannels[channelName] = channel;
    }

    final signal = CallSignal(
      type: type,
      from: _currentUserId!,
      to: targetUserId,
      fromName: _currentUserName ?? 'Unknown',
      fromAvatar: _currentUserAvatar,
      callId: overrideCallId ?? _currentCallId ?? '',
      callToken: overrideCallToken ?? _currentCallToken ?? '',
      payload: payload,
      timestamp: DateTime.now().millisecondsSinceEpoch,
      isAudioOnly: isAudioOnly,
    );

    await channel.sendBroadcastMessage(
      event: 'call-signal',
      payload: signal.toJson(),
    );

    debugPrint('[WebRTC] Signal sent: $type to $targetUserId');
  }

  void _updateCallState(CallState state) {
    _callState = state;
    _callStateController.add(state);
  }

  Future<void> cleanup() async {
    debugPrint('[WebRTC] Cleaning up...');

    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream?.dispose();
    _localStream = null;
    _localStreamController.add(null);

    _remoteStream?.dispose();
    _remoteStream = null;
    _remoteStreamController.add(null);

    await _peerConnection?.close();
    _peerConnection = null;

    for (var channel in _callChannels.values) {
      await _supabase.removeChannel(channel);
    }
    _callChannels.clear();

    await _updatePresence(inCall: false, callId: null);

    _currentCallId = null;
    _currentCallToken = null;
    _targetUserId = null;
    _isInitiator = false;
    _remoteParticipant = null;
    _remoteParticipantController.add(null);
    _pendingIceCandidates.clear();

    debugPrint('[WebRTC] Cleanup complete');
  }

  Future<void> dispose() async {
    await cleanup();
    
    if (_signalingChannel != null) {
      await _supabase.removeChannel(_signalingChannel!);
    }
    if (_presenceChannel != null) {
      await _supabase.removeChannel(_presenceChannel!);
    }

    await _callStateController.close();
    await _remoteParticipantController.close();
    await _remoteStreamController.close();
    await _localStreamController.close();
    await _incomingCallController.close();
  }
}
