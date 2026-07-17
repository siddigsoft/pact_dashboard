/// Model representing an incoming Agora call
class AgoraIncomingCall {
  final String callId;
  final String channelName;
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final bool isAudioOnly;

  /// When true, the incoming call dialog should auto-accept immediately
  /// (e.g. user pressed Accept on the notification).
  final bool autoAccept;

  AgoraIncomingCall({
    required this.callId,
    required this.channelName,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    this.isAudioOnly = false,
    this.autoAccept = false,
  });

  /// Convert to JSON
  Map<String, dynamic> toJson() {
    return {
      'callId': callId,
      'channelName': channelName,
      'callerId': callerId,
      'callerName': callerName,
      'callerAvatar': callerAvatar,
      'isAudioOnly': isAudioOnly,
      'autoAccept': autoAccept,
    };
  }

  /// Create from JSON
  factory AgoraIncomingCall.fromJson(Map<String, dynamic> json) {
    return AgoraIncomingCall(
      callId: json['callId'] as String,
      channelName: json['channelName'] as String,
      callerId: json['callerId'] as String,
      callerName: json['callerName'] as String,
      callerAvatar: json['callerAvatar'] as String?,
      isAudioOnly: json['isAudioOnly'] as bool? ?? false,
      autoAccept: json['autoAccept'] as bool? ?? false,
    );
  }

  @override
  String toString() =>
      'AgoraIncomingCall(callId=$callId, from=$callerName, audio=$isAudioOnly)';
}
