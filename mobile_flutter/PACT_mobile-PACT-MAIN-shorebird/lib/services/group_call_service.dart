import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class GroupCallParticipant {
  final String userId;
  final String userName;
  final RTCPeerConnection? peerConnection;
  final MediaStream? remoteStream;
  final RTCVideoRenderer? renderer;
  final bool isAudioEnabled;
  final bool isVideoEnabled;
  final bool isSpeaking;

  GroupCallParticipant({
    required this.userId,
    required this.userName,
    this.peerConnection,
    this.remoteStream,
    this.renderer,
    this.isAudioEnabled = true,
    this.isVideoEnabled = false,
    this.isSpeaking = false,
  });

  GroupCallParticipant copyWith({
    RTCPeerConnection? peerConnection,
    MediaStream? remoteStream,
    RTCVideoRenderer? renderer,
    bool? isAudioEnabled,
    bool? isVideoEnabled,
    bool? isSpeaking,
  }) {
    return GroupCallParticipant(
      userId: userId,
      userName: userName,
      peerConnection: peerConnection ?? this.peerConnection,
      remoteStream: remoteStream ?? this.remoteStream,
      renderer: renderer ?? this.renderer,
      isAudioEnabled: isAudioEnabled ?? this.isAudioEnabled,
      isVideoEnabled: isVideoEnabled ?? this.isVideoEnabled,
      isSpeaking: isSpeaking ?? this.isSpeaking,
    );
  }
}

class GroupCallState {
  final String? roomId;
  final bool isInCall;
  final bool isAudioEnabled;
  final bool isVideoEnabled;
  final List<GroupCallParticipant> participants;
  final String? errorMessage;

  GroupCallState({
    this.roomId,
    this.isInCall = false,
    this.isAudioEnabled = true,
    this.isVideoEnabled = false,
    this.participants = const [],
    this.errorMessage,
  });

  GroupCallState copyWith({
    String? roomId,
    bool? isInCall,
    bool? isAudioEnabled,
    bool? isVideoEnabled,
    List<GroupCallParticipant>? participants,
    String? errorMessage,
  }) {
    return GroupCallState(
      roomId: roomId ?? this.roomId,
      isInCall: isInCall ?? this.isInCall,
      isAudioEnabled: isAudioEnabled ?? this.isAudioEnabled,
      isVideoEnabled: isVideoEnabled ?? this.isVideoEnabled,
      participants: participants ?? this.participants,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}

class GroupCallService {
  final SupabaseClient _supabase = Supabase.instance.client;
  
  MediaStream? _localStream;
  RTCVideoRenderer? _localRenderer;
  RealtimeChannel? _roomChannel;
  
  final Map<String, GroupCallParticipant> _participants = {};
  GroupCallState _state = GroupCallState();
  final StreamController<GroupCallState> _stateController = 
      StreamController<GroupCallState>.broadcast();
  
  String? _userId;
  String? _userName;

  Stream<GroupCallState> get stateStream => _stateController.stream;
  GroupCallState get state => _state;
  RTCVideoRenderer? get localRenderer => _localRenderer;

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
    await _localRenderer!.initialize();
  }

  Future<String> createRoom(String roomName) async {
    try {
      final response = await _supabase.from('call_rooms').insert({
        'name': roomName,
        'created_by': _userId,
        'is_active': true,
      }).select().single();

      return response['id'] as String;
    } catch (e) {
      debugPrint('[GroupCall] Error creating room: $e');
      rethrow;
    }
  }

  Future<bool> joinRoom(String roomId, {bool withVideo = false}) async {
    try {
      _updateState(_state.copyWith(roomId: roomId, isVideoEnabled: withVideo));

      // Get local media
      await _setupLocalStream(withVideo);

      // Subscribe to room signals
      await _subscribeToRoom(roomId);

      // Announce presence
      await _announcePresence(roomId);

      _updateState(_state.copyWith(isInCall: true));
      return true;
    } catch (e) {
      debugPrint('[GroupCall] Error joining room: $e');
      _updateState(_state.copyWith(errorMessage: e.toString()));
      return false;
    }
  }

  Future<void> _setupLocalStream(bool withVideo) async {
    final constraints = {
      'audio': true,
      'video': withVideo ? {
        'facingMode': 'user',
        'width': {'ideal': 640},
        'height': {'ideal': 480},
      } : false,
    };

    _localStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (withVideo) {
      _localRenderer!.srcObject = _localStream;
    }
  }

  Future<void> _subscribeToRoom(String roomId) async {
    _roomChannel = _supabase
        .channel('group_call:$roomId')
        .onBroadcast(
          event: 'participant_joined',
          callback: (payload) => _handleParticipantJoined(payload),
        )
        .onBroadcast(
          event: 'participant_left',
          callback: (payload) => _handleParticipantLeft(payload),
        )
        .onBroadcast(
          event: 'offer',
          callback: (payload) => _handleOffer(payload),
        )
        .onBroadcast(
          event: 'answer',
          callback: (payload) => _handleAnswer(payload),
        )
        .onBroadcast(
          event: 'ice_candidate',
          callback: (payload) => _handleIceCandidate(payload),
        )
        .onBroadcast(
          event: 'audio_toggle',
          callback: (payload) => _handleAudioToggle(payload),
        )
        .onBroadcast(
          event: 'video_toggle',
          callback: (payload) => _handleVideoToggle(payload),
        )
        .subscribe();
  }

  Future<void> _announcePresence(String roomId) async {
    await _roomChannel?.sendBroadcastMessage(
      event: 'participant_joined',
      payload: {
        'user_id': _userId,
        'user_name': _userName,
        'has_video': _state.isVideoEnabled,
      },
    );
  }

  Future<void> _handleParticipantJoined(Map<String, dynamic> payload) async {
    final userId = payload['user_id'] as String;
    if (userId == _userId) return;

    final participant = GroupCallParticipant(
      userId: userId,
      userName: payload['user_name'] as String? ?? 'Unknown',
      isVideoEnabled: payload['has_video'] as bool? ?? false,
    );

    _participants[userId] = participant;
    _updateParticipants();

    // Create peer connection for this participant
    await _createPeerConnectionFor(userId, true);
  }

  Future<void> _handleParticipantLeft(Map<String, dynamic> payload) async {
    final userId = payload['user_id'] as String;
    final participant = _participants.remove(userId);
    
    if (participant != null) {
      await participant.peerConnection?.close();
      participant.renderer?.srcObject = null;
      await participant.renderer?.dispose();
    }
    
    _updateParticipants();
  }

  Future<void> _createPeerConnectionFor(String userId, bool createOffer) async {
    final peerConnection = await createPeerConnection(_iceServers);
    final renderer = RTCVideoRenderer();
    await renderer.initialize();

    // Add local tracks
    _localStream?.getTracks().forEach((track) {
      peerConnection.addTrack(track, _localStream!);
    });

    // Handle remote stream
    peerConnection.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        renderer.srcObject = event.streams[0];
        _participants[userId] = _participants[userId]!.copyWith(
          remoteStream: event.streams[0],
          renderer: renderer,
        );
        _updateParticipants();
      }
    };

    // Handle ICE candidates
    peerConnection.onIceCandidate = (candidate) {
      if (candidate.candidate != null) {
        _roomChannel?.sendBroadcastMessage(
          event: 'ice_candidate',
          payload: {
            'from': _userId,
            'to': userId,
            'candidate': candidate.candidate,
            'sdpMid': candidate.sdpMid,
            'sdpMLineIndex': candidate.sdpMLineIndex,
          },
        );
      }
    };

    _participants[userId] = _participants[userId]!.copyWith(
      peerConnection: peerConnection,
      renderer: renderer,
    );

    if (createOffer) {
      final offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      await _roomChannel?.sendBroadcastMessage(
        event: 'offer',
        payload: {
          'from': _userId,
          'to': userId,
          'sdp': offer.sdp,
          'sdpType': offer.type,
        },
      );
    }
  }

  Future<void> _handleOffer(Map<String, dynamic> payload) async {
    final fromId = payload['from'] as String;
    final toId = payload['to'] as String;
    
    if (toId != _userId) return;

    if (!_participants.containsKey(fromId)) {
      _participants[fromId] = GroupCallParticipant(
        userId: fromId,
        userName: 'Unknown',
      );
    }

    await _createPeerConnectionFor(fromId, false);

    final peerConnection = _participants[fromId]!.peerConnection!;
    final sdp = RTCSessionDescription(
      payload['sdp'] as String,
      payload['sdpType'] as String,
    );
    await peerConnection.setRemoteDescription(sdp);

    final answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await _roomChannel?.sendBroadcastMessage(
      event: 'answer',
      payload: {
        'from': _userId,
        'to': fromId,
        'sdp': answer.sdp,
        'sdpType': answer.type,
      },
    );
  }

  Future<void> _handleAnswer(Map<String, dynamic> payload) async {
    final fromId = payload['from'] as String;
    final toId = payload['to'] as String;
    
    if (toId != _userId) return;

    final peerConnection = _participants[fromId]?.peerConnection;
    if (peerConnection == null) return;

    final sdp = RTCSessionDescription(
      payload['sdp'] as String,
      payload['sdpType'] as String,
    );
    await peerConnection.setRemoteDescription(sdp);
  }

  Future<void> _handleIceCandidate(Map<String, dynamic> payload) async {
    final fromId = payload['from'] as String;
    final toId = payload['to'] as String;
    
    if (toId != _userId) return;

    final peerConnection = _participants[fromId]?.peerConnection;
    if (peerConnection == null) return;

    final candidate = RTCIceCandidate(
      payload['candidate'] as String,
      payload['sdpMid'] as String?,
      payload['sdpMLineIndex'] as int?,
    );
    await peerConnection.addCandidate(candidate);
  }

  void _handleAudioToggle(Map<String, dynamic> payload) {
    final userId = payload['user_id'] as String;
    final enabled = payload['enabled'] as bool;
    
    if (_participants.containsKey(userId)) {
      _participants[userId] = _participants[userId]!.copyWith(
        isAudioEnabled: enabled,
      );
      _updateParticipants();
    }
  }

  void _handleVideoToggle(Map<String, dynamic> payload) {
    final userId = payload['user_id'] as String;
    final enabled = payload['enabled'] as bool;
    
    if (_participants.containsKey(userId)) {
      _participants[userId] = _participants[userId]!.copyWith(
        isVideoEnabled: enabled,
      );
      _updateParticipants();
    }
  }

  void toggleAudio() {
    if (_localStream != null) {
      final audioTracks = _localStream!.getAudioTracks();
      for (final track in audioTracks) {
        track.enabled = !track.enabled;
      }
      final enabled = audioTracks.first.enabled;
      _updateState(_state.copyWith(isAudioEnabled: enabled));
      
      _roomChannel?.sendBroadcastMessage(
        event: 'audio_toggle',
        payload: {'user_id': _userId, 'enabled': enabled},
      );
    }
  }

  void toggleVideo() {
    if (_localStream != null) {
      final videoTracks = _localStream!.getVideoTracks();
      for (final track in videoTracks) {
        track.enabled = !track.enabled;
      }
      final enabled = videoTracks.isNotEmpty && videoTracks.first.enabled;
      _updateState(_state.copyWith(isVideoEnabled: enabled));
      
      _roomChannel?.sendBroadcastMessage(
        event: 'video_toggle',
        payload: {'user_id': _userId, 'enabled': enabled},
      );
    }
  }

  Future<void> leaveRoom() async {
    await _roomChannel?.sendBroadcastMessage(
      event: 'participant_left',
      payload: {'user_id': _userId},
    );

    await _cleanup();
    _updateState(GroupCallState());
  }

  Future<void> _cleanup() async {
    _roomChannel?.unsubscribe();
    
    _localStream?.getTracks().forEach((track) => track.stop());
    _localRenderer?.srcObject = null;
    _localStream = null;

    for (final participant in _participants.values) {
      await participant.peerConnection?.close();
      participant.renderer?.srcObject = null;
      await participant.renderer?.dispose();
    }
    _participants.clear();
  }

  void _updateParticipants() {
    _updateState(_state.copyWith(
      participants: _participants.values.toList(),
    ));
  }

  void _updateState(GroupCallState newState) {
    _state = newState;
    _stateController.add(_state);
  }

  Future<void> dispose() async {
    await _cleanup();
    await _localRenderer?.dispose();
    _stateController.close();
  }
}
