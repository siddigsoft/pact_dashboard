class TypingIndicator {
  final String chatId;
  final String userId;
  final String userName;
  final DateTime timestamp;

  TypingIndicator({
    required this.chatId,
    required this.userId,
    required this.userName,
    required this.timestamp,
  });

  factory TypingIndicator.fromJson(Map<String, dynamic> json) {
    return TypingIndicator(
      chatId: json['chat_id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      userName: json['user_name']?.toString() ?? '',
      timestamp:
          DateTime.tryParse(json['timestamp']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'chat_id': chatId,
      'user_id': userId,
      'user_name': userName,
      'timestamp': timestamp.toIso8601String(),
    };
  }

  bool get isStillTyping {
    return DateTime.now().difference(timestamp).inSeconds < 5;
  }
}
